import type {
  Capability,
  Decision,
  DecisionOption,
  EmployeeInstance,
  RoleKey,
  Task,
  SafetyLevel,
} from "@/lib/core/types";
import type { Store } from "@/lib/db/store";
import { newId, nowIso, idempotencyKey } from "@/lib/core/ids";
import { evaluateSafety } from "@/lib/safety/gate";
import { recordAudit, recordSafetyDecision, abuseStatus } from "@/lib/audit/log";
import { ROLE_DEFINITIONS, getRole } from "@/lib/roles/registry";
import { routeModel } from "@/lib/models/router";
import { availableLogicalModels, getLlmProvider } from "@/lib/providers";
import { serverEnv } from "@/config/env";
import { directorPlanSchema, parseStructured, type DirectorPlan } from "@/lib/orchestrator/schema";
import { buildDirectorPlan } from "@/lib/orchestrator/plan-builder";
import { isHighCost } from "@/config/pricing";
import { notify } from "@/lib/notifications/service";
import { DIRECTOR_SYSTEM_PROMPT } from "@/lib/orchestrator/prompts";
import { canTransitionProject } from "@/lib/projects/status";

/**
 * 統括AIによるタスクルーティング（サーバー側ワークフロー）。
 *
 *  1. 入力の安全性確認      2. 意図理解        3. タスク分解
 *  4. Capability 特定       5. 担当職種決定     6. 社員・稼働状況確認
 *  7. 配属/キュー/採用提案  8. 依存関係設定     9. 所要時間・WT 見積もり
 * 10. 選択肢提示           11. ユーザー承認    12. ワークトークン予約
 * 13. タスク実行           14. 成果物保存      15. 使用量確定
 * 16. 通知                 17. 次の業務提案
 */

export interface PlanRequestInput {
  store: Store;
  organizationId: string;
  userId: string;
  conversationId: string;
  requestText: string;
  /** 社員が依頼を受けた場合（担当外判定・引き継ぎ提案に使う） */
  requesterEmployeeId?: string | null;
  untrustedData?: { label: string; content: string }[];
  isOnboarding?: boolean;
}

export interface PlanRequestResult {
  decision: Decision;
  options: DecisionOption[];
  plan: DirectorPlan;
  safetyLevel: SafetyLevel;
  blocked: boolean;
  publicMessage: string;
}

export async function planFromRequest(input: PlanRequestInput): Promise<PlanRequestResult> {
  const { store, organizationId, userId } = input;

  // ── 1. 入力の安全性確認 ─────────────────────────────
  const safety = await evaluateSafety({
    userText: input.requestText,
    untrustedData: input.untrustedData?.map((d) => d.content),
    stage: "input",
  });

  await recordSafetyDecision(store, {
    organizationId,
    userId,
    level: safety.level,
    categories: safety.categories,
    stage: "input",
    publicReason: safety.publicReason,
    internalDetail: safety.internalDetail,
  });

  const abuse = await abuseStatus(store, organizationId);

  if (safety.level === "RED") {
    // 危険な部分出力は保存・表示しない
    const decision = await persistDecision(store, {
      organizationId,
      conversationId: input.conversationId,
      userId,
      plan: buildDirectorPlan(input.requestText, { safetyLevel: "RED" }),
      safetyLevel: "RED",
    });
    const message = [
      safety.cannotDo,
      safety.publicReason,
      safety.safeAlternative,
      safety.expertNotice ?? "",
      abuse.action === "suspend"
        ? "繰り返し検出されたため、この組織の実行を一時停止しました。サポートへお問い合わせください。"
        : "",
    ]
      .filter(Boolean)
      .join("\n");

    return {
      decision: decision.decision,
      options: [],
      plan: decision.plan,
      safetyLevel: "RED",
      blocked: true,
      publicMessage: message,
    };
  }

  // ── 2〜9. 意図理解・分解・Capability・担当職種・見積もり ──
  const employees = await store.list("employee_instances", organizationId);
  const business = (await store.list("businesses", organizationId))[0] ?? null;

  const requester = input.requesterEmployeeId
    ? await store.get("employee_instances", organizationId, input.requesterEmployeeId)
    : null;

  const context = {
    employees: employees.map((e) => ({
      id: e.id,
      roleKey: e.roleKey,
      name: e.name,
      specialty: e.specialty,
      status: e.status,
      currentTaskId: e.currentTaskId,
    })),
    businessSummary: business?.summary ?? "",
    safetyLevel: safety.level,
    requesterRole: requester?.roleKey ?? null,
    isOnboarding: input.isOnboarding ?? false,
  };

  // ModelRouter: 重要な経営会話・複雑な分解は高品質モデルへ
  const route = routeModel(
    {
      taskKind: "task_decomposition",
      estimatedInputTokens: Math.ceil(input.requestText.length / 3) + 800,
      estimatedOutputTokens: 1500,
      safetyLevel: safety.level,
      needsStructuredOutput: true,
      availableModels: availableLogicalModels(),
    },
    serverEnv.llm.routingConfigJson,
  );

  const llm = await getLlmProvider(route.logicalModel);
  const result = await llm.generateStructured({
    purpose: "director_plan",
    taskKind: "task_decomposition",
    logicalModel: route.logicalModel,
    systemPrompt: DIRECTOR_SYSTEM_PROMPT,
    userContent: input.requestText,
    untrustedData: input.untrustedData,
    context,
    idempotencyKey: idempotencyKey("plan", input.conversationId, input.requestText.slice(0, 40)),
    organizationId,
  });

  // LLM 出力は必ずスキーマ検証。失敗時は決定論プランへフォールバック
  const parsed = result.ok ? parseStructured(directorPlanSchema, result.data) : null;
  const plan = parsed ?? buildDirectorPlan(input.requestText, context);

  // 提案された職種が Role Policy 上ありえない場合は是正する
  const correctedPlan = enforceRolePolicyOnPlan(plan);

  // モデル利用の記録
  if (result.ok) {
    await store.insert("model_usage", {
      id: newId(),
      organizationId,
      taskId: null,
      employeeId: null,
      logicalModel: route.logicalModel,
      physicalModel: String(result.providerMetadata.model ?? route.logicalModel),
      inputTokens: result.usage.inputTokens ?? 0,
      outputTokens: result.usage.outputTokens ?? 0,
      costJpy: result.cost.costJpy,
      workTokens: result.cost.workTokens,
      idempotencyKey: null,
      createdAt: nowIso(),
    });
  }

  // ── 10. ユーザーへ選択肢を提示 ───────────────────────
  const persisted = await persistDecision(store, {
    organizationId,
    conversationId: input.conversationId,
    userId,
    plan: correctedPlan,
    safetyLevel: safety.level,
  });

  await recordAudit(store, {
    organizationId,
    actorUserId: userId,
    type: "model_used",
    target: "director_plan",
    detail: { logicalModel: route.logicalModel, reason: route.reason },
  });

  const publicMessage = [
    correctedPlan.summary,
    safety.level === "ORANGE" ? safety.cannotDo : "",
    safety.expertNotice ?? "",
    safety.injectionDetected
      ? "取得した外部データに指示の上書きを試みる記述が含まれていましたが、資料として扱い、実行はしていません。"
      : "",
  ]
    .filter(Boolean)
    .join("\n");

  return {
    decision: persisted.decision,
    options: persisted.options,
    plan: correctedPlan,
    safetyLevel: safety.level,
    blocked: false,
    publicMessage,
  };
}

/**
 * LLM が提案した職種・ツールが Role Policy に反する場合の是正。
 * 「プロンプトで縛る」のではなく、サーバー側で必ず矯正する。
 */
export function enforceRolePolicyOnPlan(plan: DirectorPlan): DirectorPlan {
  const tasks = plan.proposedTasks.map((task) => {
    const role = getRole(task.suggestedRole as RoleKey);
    const invalid = task.requiredCapabilities.filter(
      (c) => !role.allowedCapabilities.includes(c as Capability),
    );
    if (invalid.length === 0) return task;

    // Capability を担当できる職種へ付け替える
    const correctRole = (Object.keys(ROLE_DEFINITIONS) as RoleKey[]).find((key) =>
      invalid.every((c) => ROLE_DEFINITIONS[key].allowedCapabilities.includes(c as Capability)),
    );
    return correctRole ? { ...task, suggestedRole: correctRole } : task;
  });
  return { ...plan, proposedTasks: tasks };
}

async function persistDecision(
  store: Store,
  input: {
    organizationId: string;
    conversationId: string;
    userId: string;
    plan: DirectorPlan;
    safetyLevel: SafetyLevel;
  },
): Promise<{ decision: Decision; options: DecisionOption[]; plan: DirectorPlan }> {
  const decision: Decision = {
    id: newId(),
    organizationId: input.organizationId,
    conversationId: input.conversationId,
    summary: input.plan.summary,
    questions: input.plan.questions,
    hypotheses: input.plan.hypotheses,
    risks: input.plan.risks,
    status: "pending",
    safetyLevel: input.safetyLevel,
    createdAt: nowIso(),
    executedAt: null,
    createdBy: input.userId,
  };
  await store.insert("decisions", decision);

  const options: DecisionOption[] = [];
  for (const choice of input.plan.choices) {
    const option: DecisionOption = {
      id: newId(),
      decisionId: decision.id,
      organizationId: input.organizationId,
      kind: choice.kind,
      title: choice.title,
      description: choice.description,
      roleKey: choice.roleKey,
      employeeId: choice.employeeId,
      reason: choice.reason,
      estimatedDurationMinutes: choice.estimatedDurationMinutes,
      estimatedWorkTokens: choice.estimatedWorkTokens,
      riskLevel: choice.riskLevel,
      recommended: choice.recommended,
      payload: {
        taskRefIds: choice.taskRefIds,
        tasks: input.plan.proposedTasks.filter((t) => choice.taskRefIds.includes(t.refId)),
        dependencies: input.plan.dependencies,
      },
    };
    options.push(option);
    await store.insert("decision_options", option);
  }

  return { decision, options, plan: input.plan };
}

/* ────────────────────── 実行 ────────────────────── */

export interface ExecuteDecisionInput {
  store: Store;
  organizationId: string;
  userId: string;
  decisionId: string;
  selectedOptionIds: string[];
  projectId?: string | null;
}

export interface ExecuteDecisionResult {
  hiredEmployees: EmployeeInstance[];
  createdTasks: Task[];
  requiresApproval: boolean;
  message: string;
  /** active へ進んだプロジェクト（統括AIを右パネルへ移す判断に使う） */
  activatedProjectId: string | null;
}

/**
 * ユーザーが「実行する」を押した時点でのみ呼ばれる。
 * これ以前に、社員の採用・高額処理・外部送信は一切行わない。
 */
export async function executeDecision(
  input: ExecuteDecisionInput,
): Promise<ExecuteDecisionResult> {
  const { store, organizationId, userId } = input;

  const decision = await store.get("decisions", organizationId, input.decisionId);
  if (!decision) throw new Error("decision not found");
  if (decision.safetyLevel === "RED") {
    return {
      hiredEmployees: [],
      createdTasks: [],
      requiresApproval: false,
      message: "この提案は安全上の理由で実行できません。",
      activatedProjectId: null,
    };
  }
  if (decision.status === "executed") {
    // 冪等性: 二重実行を防ぐ
    const tasks = await store.list("tasks", organizationId, { filter: { createdBy: userId } });
    return {
      hiredEmployees: [],
      createdTasks: tasks,
      requiresApproval: false,
      message: "この提案はすでに実行済みです。",
      activatedProjectId: input.projectId ?? null,
    };
  }

  const allOptions = await store.list("decision_options", organizationId, {
    filter: { decisionId: input.decisionId },
  });
  const selected = allOptions.filter((o) => input.selectedOptionIds.includes(o.id));

  const hiredEmployees: EmployeeInstance[] = [];
  const createdTasks: Task[] = [];
  const refIdToTaskId = new Map<string, string>();
  let requiresApproval = false;

  // ── 11〜12. 承認済み → 採用・タスク作成 ─────────────
  for (const option of selected) {
    if (option.kind === "hire" && option.roleKey) {
      const employee = await hireEmployee(store, {
        organizationId,
        roleKey: option.roleKey,
        userId,
      });
      hiredEmployees.push(employee);
    }
  }

  const employees = await store.list("employee_instances", organizationId);

  for (const option of selected) {
    const payloadTasks = (option.payload.tasks ?? []) as {
      refId: string;
      title: string;
      description: string;
      requiredCapabilities: string[];
      suggestedRole: RoleKey;
      suggestedEmployeeId: string | null;
      riskLevel: SafetyLevel;
      requiredApprovals: string[];
      estimatedDurationMinutes: number;
      estimatedWorkTokens: number;
      dependencies: string[];
    }[];

    for (const pt of payloadTasks) {
      if (refIdToTaskId.has(pt.refId)) continue;

      const assignee =
        (pt.suggestedEmployeeId
          ? employees.find((e) => e.id === pt.suggestedEmployeeId)
          : null) ??
        employees.find((e) => e.roleKey === pt.suggestedRole && !e.currentTaskId) ??
        employees.find((e) => e.roleKey === pt.suggestedRole) ??
        null;

      if (pt.requiredApprovals.length > 0) requiresApproval = true;
      if (isHighCost(pt.estimatedWorkTokens)) requiresApproval = true;

      const task: Task = {
        id: newId(),
        organizationId,
        projectId: input.projectId ?? null,
        title: pt.title,
        description: pt.description,
        status: "todo",
        priority: "normal",
        assigneeEmployeeId: assignee?.id ?? null,
        requiredCapabilities: pt.requiredCapabilities as Capability[],
        dueDate: null,
        tools: [],
        estimatedWorkTokens: pt.estimatedWorkTokens,
        usedWorkTokens: 0,
        safetyLevel: pt.riskLevel,
        parentTaskId: null,
        createdAt: nowIso(),
        updatedAt: nowIso(),
        createdBy: userId,
      };
      await store.insert("tasks", task);
      createdTasks.push(task);
      refIdToTaskId.set(pt.refId, task.id);

      await store.insert("task_events", {
        id: newId(),
        organizationId,
        taskId: task.id,
        runId: null,
        type: "created",
        message: `タスク「${task.title}」を作成しました`,
        employeeId: assignee?.id ?? null,
        nodeKey: pt.refId,
        payload: {},
        createdAt: nowIso(),
      });

      if (assignee) {
        await store.insert("task_events", {
          id: newId(),
          organizationId,
          taskId: task.id,
          runId: null,
          type: "assigned",
          message: `${assignee.name}に配属しました`,
          employeeId: assignee.id,
          nodeKey: pt.refId,
          payload: {},
          createdAt: nowIso(),
        });
        await recordAudit(store, {
          organizationId,
          actorUserId: userId,
          type: "employee_assigned",
          target: task.id,
          detail: { employeeId: assignee.id, title: task.title },
        });
      }
    }
  }

  // ── 8. タスク間の依存関係を設定 ─────────────────────
  for (const option of selected) {
    const deps = (option.payload.dependencies ?? []) as {
      taskRefId: string;
      dependsOnRefId: string;
    }[];
    for (const dep of deps) {
      const taskId = refIdToTaskId.get(dep.taskRefId);
      const dependsOnTaskId = refIdToTaskId.get(dep.dependsOnRefId);
      if (!taskId || !dependsOnTaskId) continue;
      await store.insert("task_dependencies", {
        id: newId(),
        organizationId,
        taskId,
        dependsOnTaskId,
      });
    }
  }

  await store.update("decisions", organizationId, input.decisionId, {
    status: "executed",
    executedAt: nowIso(),
  });

  // ここで初めてプロジェクトが動き出す。
  // 統括AIの表示位置はこの status から導出されるため、
  // 中央 → 右パネルへ移るのはこの更新が成功した後だけ。
  if (input.projectId) {
    const project = await store.get("projects", organizationId, input.projectId);
    if (project && canTransitionProject(project.status, "active")) {
      await store.update("projects", organizationId, project.id, { status: "active" });
    }
  }

  await notify(store, {
    organizationId,
    userId,
    kind: "system",
    title: "実行を開始しました",
    body: `${hiredEmployees.length}名を採用し、${createdTasks.length}件のタスクを作成しました。`,
  });

  return {
    hiredEmployees,
    createdTasks,
    requiresApproval,
    message: `${hiredEmployees.length}名の採用と${createdTasks.length}件のタスク作成が完了しました。`,
    activatedProjectId: input.projectId ?? null,
  };
}

export async function hireEmployee(
  store: Store,
  input: { organizationId: string; roleKey: RoleKey; userId: string; name?: string; specialty?: string },
): Promise<EmployeeInstance> {
  const role = getRole(input.roleKey);
  const existing = await store.list("employee_instances", input.organizationId, {
    filter: { roleKey: input.roleKey },
  });
  const suffix = existing.length > 0 ? ` ${existing.length + 1}` : "";

  const employee: EmployeeInstance = {
    id: newId(),
    organizationId: input.organizationId,
    roleKey: input.roleKey,
    name: input.name ?? `${role.name}${suffix}`,
    specialty: input.specialty ?? role.defaultSpecialty,
    status: "idle",
    currentTaskId: null,
    avatarSeed: newId().slice(0, 8),
    hiredAt: nowIso(),
    createdAt: nowIso(),
    updatedAt: nowIso(),
    createdBy: input.userId,
  };
  await store.insert("employee_instances", employee);

  await store.insert("conversations", {
    id: newId(),
    organizationId: input.organizationId,
    employeeId: employee.id,
    projectId: null,
    title: `${employee.name}との会話`,
    kind: "employee",
    createdAt: nowIso(),
    updatedAt: nowIso(),
    createdBy: input.userId,
  });

  await recordAudit(store, {
    organizationId: input.organizationId,
    actorUserId: input.userId,
    type: "employee_hired",
    target: employee.id,
    detail: { roleKey: input.roleKey, name: employee.name },
  });

  return employee;
}

/** 17. 次に行う業務を提案する */
export async function suggestNextWork(
  store: Store,
  organizationId: string,
): Promise<{ title: string; reason: string }[]> {
  const tasks = await store.list("tasks", organizationId);
  const employees = await store.list("employee_instances", organizationId);
  const suggestions: { title: string; reason: string }[] = [];

  const doneTasks = tasks.filter((t) => t.status === "done");
  const hasResearch = doneTasks.some((t) => t.title.includes("調査"));
  const hasMarketing = tasks.some((t) => t.title.includes("マーケティング"));

  if (hasResearch && !hasMarketing) {
    suggestions.push({
      title: "調査結果をもとにマーケティング戦略を作る",
      reason: "市場調査が完了しているため、次は誰にどう届けるかを決める段階です。",
    });
  }

  const awaiting = tasks.filter((t) => t.status === "awaiting_approval");
  if (awaiting.length > 0) {
    suggestions.push({
      title: `承認待ちのタスク ${awaiting.length} 件を確認する`,
      reason: "承認するまで次の工程へ進めません。",
    });
  }

  const idle = employees.filter((e) => !e.currentTaskId && e.roleKey !== "director");
  if (idle.length > 0 && tasks.filter((t) => t.status === "todo").length === 0) {
    suggestions.push({
      title: `待機中の社員 ${idle.length} 名に次の仕事を割り当てる`,
      reason: "手が空いている社員がいます。",
    });
  }

  return suggestions;
}
