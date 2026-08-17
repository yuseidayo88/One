import type { RoleKey, SafetyLevel } from "@/lib/core/types";
import { ROLE_DEFINITIONS } from "@/lib/roles/registry";
import { DECOMPOSITION_RULES, decomposeRequest, defaultHypotheses } from "@/lib/orchestrator/heuristics";
import type { Choice, DirectorPlan, ProposedTask } from "@/lib/orchestrator/schema";

/**
 * 統括AIの計画を決定論的に構築する。
 *
 * 生成物は `directorPlanSchema` に適合する。
 * 実 LLM を使う場合も、この結果を「既定値・検証用のベースライン」として使う。
 */

export interface EmployeeSnapshot {
  id: string;
  roleKey: RoleKey;
  name: string;
  specialty: string;
  status: string;
  currentTaskId: string | null;
}

export interface PlanContext {
  employees?: EmployeeSnapshot[];
  businessSummary?: string;
  safetyLevel?: SafetyLevel;
  /** 依頼を受けた社員（担当外判定に使う）。統括AI宛なら null */
  requesterRole?: RoleKey | null;
  isOnboarding?: boolean;
}

const ROLE_ORDER: RoleKey[] = [
  "market_research",
  "marketing",
  "designer",
  "engineer",
  "sales",
  "legal",
  "finance",
  "assistant",
];

function pickEmployee(
  employees: EmployeeSnapshot[],
  roleKey: RoleKey,
): { available: EmployeeSnapshot | null; busy: EmployeeSnapshot | null } {
  const ofRole = employees.filter((e) => e.roleKey === roleKey);
  const available = ofRole.find((e) => !e.currentTaskId && e.status !== "paused") ?? null;
  const busy = ofRole.find((e) => e.currentTaskId) ?? null;
  return { available, busy };
}

export function buildDirectorPlan(requestText: string, rawContext: Record<string, unknown>): DirectorPlan {
  const context = rawContext as PlanContext;
  const employees = context.employees ?? [];
  const safetyLevel: SafetyLevel = context.safetyLevel ?? "GREEN";
  const requesterRole = context.requesterRole ?? null;

  // RED の場合はタスクを一切提案しない（危険な部分出力を残さない）
  if (safetyLevel === "RED") {
    return {
      summary: "この依頼は実行できません。",
      questions: [],
      hypotheses: [],
      proposedTasks: [],
      requiredCapabilities: [],
      suggestedRole: null,
      suggestedEmployeeId: null,
      hiringRequired: false,
      dependencies: [],
      riskLevel: "RED",
      requiredApprovals: [],
      estimatedDuration: 0,
      estimatedWorkTokens: 0,
      choices: [],
      safeAlternative:
        "内容を安全な範囲に調整いただければ、市場調査や事業計画の整理からお手伝いできます。",
      risks: [],
      handoffs: [],
    };
  }

  let matched = decomposeRequest(requestText);

  // 何も一致しない場合は、まず調査から始める標準プランを提案する
  if (matched.length === 0) {
    const fallbackRule = DECOMPOSITION_RULES.find((r) => r.id === "market_research");
    if (fallbackRule) matched = [{ rule: fallbackRule, matchedTerms: [] }];
  }

  // 実行順に整列
  matched.sort((a, b) => ROLE_ORDER.indexOf(a.rule.role) - ROLE_ORDER.indexOf(b.rule.role));

  const includedIds = new Set(matched.map((m) => m.rule.id));
  const proposedTasks: ProposedTask[] = [];
  const dependencies: { taskRefId: string; dependsOnRefId: string }[] = [];
  const choices: Choice[] = [];
  const handoffs: DirectorPlan["handoffs"] = [];
  const requiredApprovals = new Set<ProposedTask["requiredApprovals"][number]>();
  const requiredCapabilities = new Set<string>();

  let totalMinutes = 0;
  let totalWorkTokens = 0;
  let hiringRequired = false;

  for (const { rule } of matched) {
    const { available, busy } = pickEmployee(employees, rule.role);
    const needsHire = !available;
    if (needsHire) hiringRequired = true;

    const taskRiskLevel: SafetyLevel = rule.role === "legal" && safetyLevel === "ORANGE" ? "ORANGE" : safetyLevel;

    const task: ProposedTask = {
      refId: rule.id,
      title: rule.title,
      description: rule.description,
      requiredCapabilities: [rule.capability],
      suggestedRole: rule.role,
      suggestedEmployeeId: available?.id ?? null,
      hiringRequired: needsHire,
      dependencies: rule.dependsOn.filter((d) => includedIds.has(d)),
      riskLevel: taskRiskLevel,
      requiredApprovals: rule.approvals,
      estimatedDurationMinutes: rule.estimatedDurationMinutes,
      estimatedWorkTokens: rule.estimatedWorkTokens,
    };
    proposedTasks.push(task);
    requiredCapabilities.add(rule.capability);
    for (const a of rule.approvals) requiredApprovals.add(a);
    for (const dep of task.dependencies) {
      dependencies.push({ taskRefId: rule.id, dependsOnRefId: dep });
    }
    totalMinutes += rule.estimatedDurationMinutes;
    totalWorkTokens += rule.estimatedWorkTokens;

    const roleDef = ROLE_DEFINITIONS[rule.role];

    if (needsHire) {
      choices.push({
        id: `hire:${rule.role}`,
        kind: "hire",
        title: `${roleDef.name}社員を採用する`,
        description: rule.description,
        roleKey: rule.role,
        employeeId: null,
        reason: `この依頼には「${rule.title}」が必要ですが、現在この職種の社員が在籍していません。`,
        estimatedDurationMinutes: rule.estimatedDurationMinutes,
        estimatedWorkTokens: rule.estimatedWorkTokens,
        riskLevel: taskRiskLevel,
        recommended: true,
        taskRefIds: [rule.id],
      });
    } else if (available) {
      choices.push({
        id: `assign:${rule.id}`,
        kind: "assign",
        title:
          available.name === roleDef.name
            ? `${roleDef.name}社員に「${rule.title}」を任せる`
            : `${available.name}（${roleDef.name}）に「${rule.title}」を任せる`,
        description: rule.description,
        roleKey: rule.role,
        employeeId: available.id,
        reason: `${available.specialty} を専門とする在籍社員が対応できます。`,
        estimatedDurationMinutes: rule.estimatedDurationMinutes,
        estimatedWorkTokens: rule.estimatedWorkTokens,
        riskLevel: taskRiskLevel,
        recommended: true,
        taskRefIds: [rule.id],
      });
    }

    // 稼働中の社員しかいない場合は「待つ / 追加採用」を選べるようにする
    if (!available && busy) {
      choices.push({
        id: `queue:${rule.id}`,
        kind: "queue",
        title: `${busy.name}の現在のタスク完了を待つ`,
        description: `${busy.name} は現在稼働中です。完了後にこのタスクを開始します。`,
        roleKey: rule.role,
        employeeId: busy.id,
        reason: "1人の社員が同時に実行できるメインタスクは1件までです。",
        estimatedDurationMinutes: rule.estimatedDurationMinutes,
        estimatedWorkTokens: rule.estimatedWorkTokens,
        riskLevel: taskRiskLevel,
        recommended: false,
        taskRefIds: [rule.id],
      });
    }

    // 担当外業務の引き継ぎ案
    if (requesterRole && requesterRole !== rule.role) {
      handoffs.push({
        fromRole: requesterRole,
        toRole: rule.role,
        reason: `「${rule.title}」は${roleDef.name}社員の担当業務です。`,
        taskRefIds: [rule.id],
      });
    }
  }

  const businessSummary = context.businessSummary ?? requestText;

  const foreignRoles = [...new Set(handoffs.map((h) => h.toRole))];
  const summaryParts: string[] = [];
  if (requesterRole && foreignRoles.length > 0) {
    const requesterName = ROLE_DEFINITIONS[requesterRole].name;
    summaryParts.push(
      `${requesterName}社員の担当外の業務が含まれているため、${foreignRoles.length}人の社員への引き継ぎを提案します。`,
    );
  }
  summaryParts.push(
    `ご依頼を ${proposedTasks.length} 件の仕事に分解しました。${
      hiringRequired ? "一部は新しいAI社員の採用が必要です。" : "在籍中の社員で対応できます。"
    }`,
  );

  const risks: string[] = [];
  if (safetyLevel === "ORANGE") {
    risks.push("規制領域が含まれるため、一般調査までを行い、外部実行前に有資格者の確認が必要です。");
  }
  if (requiredApprovals.has("email_send")) {
    risks.push("メールは下書きまで作成し、送信はユーザー承認後に行います。");
  }
  if (requiredApprovals.has("publish_production")) {
    risks.push("本番公開は承認後にのみ実行します。");
  }
  if (totalWorkTokens > 30_000) {
    risks.push(`合計で約 ${totalWorkTokens.toLocaleString("ja-JP")} ワークトークンを消費する見込みです。`);
  }

  const questions: string[] = [];
  if (context.isOnboarding) {
    questions.push("想定しているお客様は、個人と法人のどちらが中心ですか？");
    questions.push("いつまでに最初の成果を出したいですか？");
  }

  return {
    summary: summaryParts.join(""),
    questions,
    hypotheses: context.isOnboarding ? defaultHypotheses(businessSummary) : [],
    proposedTasks,
    requiredCapabilities: [...requiredCapabilities],
    suggestedRole: proposedTasks[0]?.suggestedRole ?? null,
    suggestedEmployeeId: proposedTasks[0]?.suggestedEmployeeId ?? null,
    hiringRequired,
    dependencies,
    riskLevel: safetyLevel,
    requiredApprovals: [...requiredApprovals],
    estimatedDuration: totalMinutes,
    estimatedWorkTokens: totalWorkTokens,
    choices,
    safeAlternative: safetyLevel === "ORANGE" ? "一般的な調査と情報整理までを行います。" : "",
    risks,
    handoffs,
  };
}
