import type { Store } from "@/lib/db/store";
import { nowIso, isoIn, stableId } from "@/lib/core/ids";
import { hashPassword } from "@/lib/auth/password";
import { ROLE_DEFINITIONS } from "@/lib/roles/registry";
import type { EmployeeInstance, RoleKey, Task } from "@/lib/core/types";
import { PLANS } from "@/config/pricing";

/**
 * 開発環境のデモ会社。
 *
 * 事業: 「個人経営の美容室向けに、予約と集客を支援するSaaSを作る」
 * 稼働中 / 待機中 / 承認待ち / 成果物完成 / 引き継ぎ / 追加採用提案 /
 * カンバン / 仕事フローアニメーション が確認できる状態を用意する。
 */

export const DEMO_EMAIL = "founder@example.com";
export const DEMO_PASSWORD = "demo1234";

export async function seedDemoOrganization(store: Store): Promise<{ orgId: string; userId: string }> {
  const userId = stableId("user");
  const orgId = stableId("org");
  const now = nowIso();

  await store.insert("profiles", {
    id: userId,
    email: DEMO_EMAIL,
    displayName: "デモ社長",
    passwordHash: hashPassword(DEMO_PASSWORD),
    createdAt: now,
    updatedAt: now,
  });

  await store.insert("organizations", {
    id: orgId,
    name: "デモ株式会社",
    ownerUserId: userId,
    planKey: "founder",
    locale: "ja",
    createdAt: now,
    updatedAt: now,
    createdBy: userId,
  });

  await store.insert("organization_members", {
    id: stableId("row:1"),
    organizationId: orgId,
    userId,
    role: "owner",
    createdAt: now,
  });

  const businessId = stableId("business");
  await store.insert("businesses", {
    id: businessId,
    organizationId: orgId,
    name: "美容室向け予約・集客SaaS",
    summary:
      "個人経営の美容室向けに、予約管理と集客を支援するSaaSを作る。\n想定顧客: 1〜3名で運営する美容室オーナー\n解決したい課題: 電話予約の取りこぼしと、リピート集客の仕組みがないこと",
    targetCustomer: "1〜3名で運営する個人経営の美容室オーナー",
    problem: "電話予約の取りこぼし、リピート集客の仕組み不足",
    progress: "構想段階。知人の美容室2件にヒアリング済み。",
    budgetJpy: 300_000,
    deadline: isoIn(90 * 86_400_000),
    ownerCanDo: "接客・SNS運用・ヒアリング",
    delegateToAi: "調査・戦略・デザイン・実装・法務確認",
    market: "domestic",
    regulatedNotes: "個人情報（顧客の連絡先・来店履歴）を扱うため、個人情報保護法への対応が必要。",
    hypotheses: [
      "個人美容室は電話予約の取りこぼしに実際に困っている",
      "月額3,000〜6,000円なら支払い意思がある",
      "既存の大手予約サービスは手数料が高く不満がある",
    ],
    createdAt: now,
    updatedAt: now,
    createdBy: userId,
  });

  const projectId = stableId("project");
  await store.insert("projects", {
    id: projectId,
    organizationId: orgId,
    businessId,
    name: "MVP立ち上げ",
    description: "最初の10店舗に使ってもらえる状態まで持っていく。",
    status: "active",
    createdAt: now,
    updatedAt: now,
    createdBy: userId,
  });

  // ── 社員 ───────────────────────────────────────────
  const roleKeys: RoleKey[] = [
    "director",
    "market_research",
    "marketing",
    "sales",
    "designer",
    "engineer",
  ];
  const employees: EmployeeInstance[] = [];
  const specialties: Partial<Record<RoleKey, string>> = {
    market_research: "国内スモールビジネス市場",
    marketing: "ローカル集客・SNS",
    sales: "新規開拓",
    designer: "プロダクトUI",
    engineer: "Web / SaaS 実装",
  };

  for (const roleKey of roleKeys) {
    const role = ROLE_DEFINITIONS[roleKey];
    const employee: EmployeeInstance = {
      id: stableId(`employee:${roleKey}`),
      organizationId: orgId,
      roleKey,
      name: role.name,
      specialty: specialties[roleKey] ?? role.defaultSpecialty,
      status: "idle",
      currentTaskId: null,
      avatarSeed: stableId(`avatar:${roleKey}`).slice(0, 8),
      hiredAt: now,
      createdAt: now,
      updatedAt: now,
      createdBy: userId,
    };
    await store.insert("employee_instances", employee);
    employees.push(employee);
  }

  const byRole = (key: RoleKey) => employees.find((e) => e.roleKey === key)!;

  // ── 会話 ───────────────────────────────────────────
  const conversationId = stableId("conversation");
  await store.insert("conversations", {
    id: conversationId,
    organizationId: orgId,
    employeeId: null,
    title: "統括AIとの相談",
    kind: "director",
    createdAt: now,
    updatedAt: now,
    createdBy: userId,
  });

  await store.insert("messages", {
    id: stableId("row:2"),
    organizationId: orgId,
    conversationId,
    author: "employee",
    employeeId: byRole("director").id,
    content:
      "どんな事業をやりたいですか？\n\n事業の内容、想定しているお客様、解決したい課題のいずれかからで構いません。順番に整理していきます。",
    containsUntrustedData: false,
    createdAt: now,
  });

  await store.insert("messages", {
    id: stableId("row:3"),
    organizationId: orgId,
    conversationId,
    author: "user",
    employeeId: null,
    content:
      "個人経営の美容室向けに、予約と集客を支援するSaaSを作りたいです。まず市場を調べて、集客の戦略とLPのデザインまで進めたいです。",
    containsUntrustedData: false,
    createdAt: now,
  });

  await store.insert("messages", {
    id: stableId("row:4"),
    organizationId: orgId,
    conversationId,
    author: "employee",
    employeeId: byRole("director").id,
    content:
      "ご依頼を4件の仕事に分解しました。在籍中の社員で対応できます。\n\n市場調査 → マーケティング戦略 → LPデザイン → 実装 の順で進めるのが効率的です。",
    containsUntrustedData: false,
    createdAt: now,
  });

  // ── タスク ─────────────────────────────────────────
  const researchTaskId = stableId("task:research");
  const marketingTaskId = stableId("task:marketing");
  const designTaskId = stableId("task:design");
  const engineerTaskId = stableId("task:engineer");
  const legalTaskId = stableId("task:legal");

  const tasks: Task[] = [
    {
      id: researchTaskId,
      organizationId: orgId,
      projectId,
      title: "市場・競合調査",
      description:
        "美容室向け予約SaaSの市場規模、競合、顧客課題を調査し、出典付きレポートを作成する。",
      status: "done",
      priority: "high",
      assigneeEmployeeId: byRole("market_research").id,
      requiredCapabilities: ["market_research"],
      dueDate: null,
      tools: ["web_search"],
      estimatedWorkTokens: 9_000,
      usedWorkTokens: 7_420,
      safetyLevel: "GREEN",
      parentTaskId: null,
      createdAt: now,
      updatedAt: now,
      createdBy: userId,
    },
    {
      id: marketingTaskId,
      organizationId: orgId,
      projectId,
      title: "マーケティング戦略・ペルソナ設計",
      description: "ペルソナ、ポジショニング、集客チャネル、KPI を設計する。",
      status: "running",
      priority: "high",
      assigneeEmployeeId: byRole("marketing").id,
      requiredCapabilities: ["persona"],
      dueDate: null,
      tools: [],
      estimatedWorkTokens: 8_000,
      usedWorkTokens: 0,
      safetyLevel: "GREEN",
      parentTaskId: null,
      createdAt: now,
      updatedAt: now,
      createdBy: userId,
    },
    {
      id: designTaskId,
      organizationId: orgId,
      projectId,
      title: "LP・アプリ画面のデザイン",
      description: "ワイヤーフレームとデザイン仕様を作成する。実装はプログラマーへ引き継ぐ。",
      status: "queued",
      priority: "normal",
      assigneeEmployeeId: byRole("designer").id,
      requiredCapabilities: ["ux_design"],
      dueDate: null,
      tools: [],
      estimatedWorkTokens: 12_000,
      usedWorkTokens: 0,
      safetyLevel: "GREEN",
      parentTaskId: null,
      createdAt: now,
      updatedAt: now,
      createdBy: userId,
    },
    {
      id: engineerTaskId,
      organizationId: orgId,
      projectId,
      title: "予約機能の実装とプレビュー公開",
      description: "予約作成・変更・キャンセルを実装し、プレビュー環境を用意する。",
      status: "todo",
      priority: "normal",
      assigneeEmployeeId: byRole("engineer").id,
      requiredCapabilities: ["coding"],
      dueDate: null,
      tools: ["code_write", "deploy_preview"],
      estimatedWorkTokens: 25_000,
      usedWorkTokens: 0,
      safetyLevel: "GREEN",
      parentTaskId: null,
      createdAt: now,
      updatedAt: now,
      createdBy: userId,
    },
    {
      id: legalTaskId,
      organizationId: orgId,
      projectId,
      title: "個人情報の取り扱いと規約の確認",
      description: "顧客情報を扱うため、必要な規約と対応事項を調査する。",
      status: "idea",
      priority: "normal",
      assigneeEmployeeId: null,
      requiredCapabilities: ["legal_research"],
      dueDate: null,
      tools: [],
      estimatedWorkTokens: 9_000,
      usedWorkTokens: 0,
      safetyLevel: "ORANGE",
      parentTaskId: null,
      createdAt: now,
      updatedAt: now,
      createdBy: userId,
    },
  ];

  for (const task of tasks) await store.insert("tasks", task);

  await store.insert("task_dependencies", {
    id: stableId("row:5"),
    organizationId: orgId,
    taskId: marketingTaskId,
    dependsOnTaskId: researchTaskId,
  });
  await store.insert("task_dependencies", {
    id: stableId("row:6"),
    organizationId: orgId,
    taskId: designTaskId,
    dependsOnTaskId: marketingTaskId,
  });
  await store.insert("task_dependencies", {
    id: stableId("row:7"),
    organizationId: orgId,
    taskId: engineerTaskId,
    dependsOnTaskId: designTaskId,
  });

  // 稼働状態を反映（1社員1メインタスク）
  await store.update("employee_instances", orgId, byRole("marketing").id, {
    status: "working",
    currentTaskId: marketingTaskId,
  });
  await store.update("employee_instances", orgId, byRole("market_research").id, {
    status: "awaiting_approval",
  });
  await store.update("employee_instances", orgId, byRole("designer").id, {
    status: "awaiting_info",
  });

  // ── タスクイベント（フローアニメーションの同期元） ──
  const events: [string, string, string, string | null, string][] = [
    [researchTaskId, "created", "タスク「市場・競合調査」を作成しました", null, "market_research"],
    [researchTaskId, "assigned", "市場調査に配属しました", byRole("market_research").id, "market_research"],
    [researchTaskId, "started", "市場調査が作業を開始しました", byRole("market_research").id, "start"],
    [researchTaskId, "step", "情報の収集", byRole("market_research").id, "context"],
    [researchTaskId, "step", "分析", byRole("market_research").id, "analysis"],
    [researchTaskId, "artifact_created", "成果物「市場調査レポート」を作成しました", byRole("market_research").id, "artifact"],
    [researchTaskId, "approval_requested", "成果物の確認をお願いします", byRole("market_research").id, "approval"],
    [marketingTaskId, "handoff", "市場調査からマーケティングへ引き継ぎました", byRole("marketing").id, "handoff"],
    [marketingTaskId, "started", "マーケティングが作業を開始しました", byRole("marketing").id, "start"],
    [marketingTaskId, "step", "情報の収集", byRole("marketing").id, "context"],
  ];

  for (const [index, [taskId, type, message, employeeId, nodeKey]] of events.entries()) {
    await store.insert("task_events", {
      id: stableId(`event:${index}`),
      organizationId: orgId,
      taskId,
      runId: null,
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      type: type as any,
      message,
      employeeId,
      nodeKey,
      payload: {},
      createdAt: nowIso(),
    });
  }

  await store.insert("task_handoffs", {
    id: stableId("row:9"),
    organizationId: orgId,
    taskId: marketingTaskId,
    fromEmployeeId: byRole("market_research").id,
    toEmployeeId: byRole("marketing").id,
    toRoleKey: "marketing",
    reason: "調査結果をもとに集客戦略を設計するため",
    status: "accepted",
    createdAt: now,
  });

  // ── 成果物 ─────────────────────────────────────────
  const artifactId = stableId("artifact:research");
  await store.insert("artifacts", {
    id: artifactId,
    organizationId: orgId,
    projectId,
    taskId: researchTaskId,
    employeeId: byRole("market_research").id,
    type: "research_report",
    title: "美容室向け予約SaaS 市場調査レポート",
    summary: "市場調査社員が市場規模・競合・顧客課題を調査し、最初に検証すべき仮説を提示しました。",
    currentVersion: 1,
    status: "review",
    citations: [
      { title: "（Mock）業界統計", url: "https://example.com/mock/stats", checkedAt: now.slice(0, 10) },
    ],
    usedWorkTokens: 7_420,
    createdAt: now,
    updatedAt: now,
    createdBy: userId,
  });

  const { buildEmployeeOutput } = await import("@/lib/employees/output-builder");
  const demoReport = buildEmployeeOutput("市場・競合調査", {
    roleKey: "market_research",
    employeeName: "市場調査",
    taskTitle: "市場・競合調査",
    businessSummary: "個人経営の美容室向け予約・集客SaaS",
    targetCustomer: "1〜3名で運営する美容室オーナー",
  });

  await store.insert("artifact_versions", {
    id: stableId("row:10"),
    organizationId: orgId,
    artifactId,
    version: 1,
    content: demoReport.contentMarkdown,
    contentType: "markdown",
    note: "初版",
    createdAt: now,
    createdBy: userId,
  });

  // ── 承認待ち ───────────────────────────────────────
  await store.insert("approvals", {
    id: stableId("row:11"),
    organizationId: orgId,
    action: "publish_production",
    taskId: engineerTaskId,
    artifactId: null,
    employeeId: byRole("engineer").id,
    title: "プレビュー環境の公開",
    what: "作成したプレビュー環境を、限定URLで公開します。",
    affects: "URLを知っている人のみ（検索エンジンには公開しません）",
    service: "Cloudflare Pages (Mock)",
    destination: "https://preview-*.demo.example.dev",
    diff: "+ プレビュー環境の作成\n+ 環境変数の設定（本番の値は含みません）",
    estimatedCostJpy: 0,
    estimatedWorkTokens: 0,
    reversible: true,
    risk: "限定URLのため公開範囲は限定的ですが、URLが共有されると誰でも閲覧できます。",
    status: "pending",
    decidedBy: null,
    decidedAt: null,
    expiresAt: isoIn(86_400_000),
    createdAt: now,
    createdBy: userId,
  });

  // ── 通知 ───────────────────────────────────────────
  await store.insert("notifications", {
    id: stableId("row:12"),
    organizationId: orgId,
    userId,
    kind: "artifact_ready",
    title: "市場調査社員がレポートを完成しました",
    body: "美容室向け予約SaaS 市場調査レポート",
    linkArtifactId: artifactId,
    linkTaskId: researchTaskId,
    read: false,
    createdAt: now,
  });

  await store.insert("notifications", {
    id: stableId("row:13"),
    organizationId: orgId,
    userId,
    kind: "approval_required",
    title: "承認が必要です: プレビュー環境の公開",
    body: "プログラマー社員がプレビュー公開の承認を求めています。",
    linkArtifactId: null,
    linkTaskId: engineerTaskId,
    read: false,
    createdAt: now,
  });

  // ── メモリ ─────────────────────────────────────────
  await store.insert("memories", {
    id: stableId("row:14"),
    organizationId: orgId,
    scope: "business",
    scopeRefId: businessId,
    employeeId: null,
    title: "ターゲットは個人美容室",
    content: "1〜3名で運営する美容室。大型サロンは対象外とする（初期フェーズ）。",
    source: "オンボーディング",
    confidentiality: "internal",
    pinned: true,
    createdAt: now,
    updatedAt: now,
    createdBy: userId,
  });

  await store.insert("memories", {
    id: stableId("row:15"),
    organizationId: orgId,
    scope: "employee",
    scopeRefId: byRole("market_research").id,
    employeeId: byRole("market_research").id,
    title: "調査時の注意",
    content: "事実と推測を必ず区別し、確認日を明記する。出典のない数値は使わない。",
    source: "社員メモリ",
    confidentiality: "internal",
    pinned: true,
    createdAt: now,
    updatedAt: now,
    createdBy: userId,
  });

  // ── ワークトークン ─────────────────────────────────
  const walletId = stableId("wallet");
  const plan = PLANS.founder;
  await store.insert("credit_wallets", {
    id: walletId,
    organizationId: orgId,
    balance: plan.monthlyWorkTokens - 7_420,
    reserved: 8_000,
    updatedAt: now,
  });

  await store.insert("credit_ledger", {
    id: stableId("row:16"),
    organizationId: orgId,
    type: "grant",
    bucket: "monthly",
    amount: plan.monthlyWorkTokens,
    balanceAfter: plan.monthlyWorkTokens,
    taskId: null,
    employeeId: null,
    reservationId: null,
    idempotencyKey: `demo-grant-${orgId}`,
    note: "Founder プランの月次付与",
    expiresAt: isoIn(31 * 86_400_000),
    createdAt: now,
  });

  await store.insert("credit_ledger", {
    id: stableId("row:17"),
    organizationId: orgId,
    type: "settle",
    bucket: "system",
    amount: -7_420,
    balanceAfter: plan.monthlyWorkTokens - 7_420,
    taskId: researchTaskId,
    employeeId: byRole("market_research").id,
    reservationId: null,
    idempotencyKey: `demo-settle-${researchTaskId}`,
    note: "市場・競合調査の実使用",
    expiresAt: null,
    createdAt: now,
  });

  await store.insert("model_usage", {
    id: stableId("row:18"),
    organizationId: orgId,
    taskId: researchTaskId,
    employeeId: byRole("market_research").id,
    logicalModel: "anthropic_reasoning",
    physicalModel: "reasoning",
    inputTokens: 4_200,
    outputTokens: 2_800,
    costJpy: 1.85,
    workTokens: 7_420,
    idempotencyKey: `demo-usage-${researchTaskId}`,
    createdAt: now,
  });

  await store.insert("subscriptions", {
    id: stableId("row:19"),
    organizationId: orgId,
    stripeSubscriptionId: null,
    planKey: "founder",
    status: "active",
    currentPeriodEnd: isoIn(30 * 86_400_000),
    createdAt: now,
    updatedAt: now,
  });

  // ── 連携（すべて Mock 状態から開始） ───────────────
  const integrations: [string, string][] = [
    ["email", "mock"],
    ["image", "mock"],
    ["video", "mock"],
    ["search", "mock"],
    ["deployment", "mock"],
    ["billing", "mock"],
  ];
  for (const [kind, provider] of integrations) {
    await store.insert("integrations", {
      id: stableId(`integration:${kind}`),
      organizationId: orgId,
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      kind: kind as any,
      provider,
      status: "mock",
      config: {},
      createdAt: now,
      updatedAt: now,
    });
  }

  return { orgId, userId };
}
