/**
 * ドメイン型。status は自由文字列にせず、必ず union / enum で表現する。
 */

export type RoleKey =
  | "director"
  | "market_research"
  | "marketing"
  | "sales"
  | "designer"
  | "engineer"
  | "assistant"
  | "legal"
  | "finance";

export type EmployeeStatus =
  | "working" // 稼働中
  | "idle" // 待機中
  | "awaiting_approval" // 承認待ち
  | "awaiting_info" // 情報待ち
  | "done" // 完了
  | "error" // エラー
  | "paused"; // 一時停止

export type TaskStatus =
  | "idea" // アイデア
  | "todo" // 未着手
  | "queued" // 待機中
  | "running" // 実行中
  | "awaiting_approval" // 承認待ち
  | "revising" // 修正中
  | "done" // 完了
  | "blocked"; // ブロック

export const TASK_STATUSES: TaskStatus[] = [
  "idea",
  "todo",
  "queued",
  "running",
  "awaiting_approval",
  "revising",
  "done",
  "blocked",
];

export const TASK_STATUS_LABEL: Record<TaskStatus, string> = {
  idea: "アイデア",
  todo: "未着手",
  queued: "待機中",
  running: "実行中",
  awaiting_approval: "承認待ち",
  revising: "修正中",
  done: "完了",
  blocked: "ブロック",
};

export const EMPLOYEE_STATUS_LABEL: Record<EmployeeStatus, string> = {
  working: "稼働中",
  idle: "待機中",
  awaiting_approval: "承認待ち",
  awaiting_info: "情報待ち",
  done: "完了",
  error: "エラー",
  paused: "一時停止",
};

export type TaskPriority = "low" | "normal" | "high" | "urgent";

export type SafetyLevel = "GREEN" | "YELLOW" | "ORANGE" | "RED";

export type Capability =
  | "business_understanding"
  | "task_decomposition"
  | "assignment"
  | "estimation"
  | "approval_request"
  | "progress_summary"
  | "market_research"
  | "competitor_analysis"
  | "customer_research"
  | "trend_research"
  | "interview_design"
  | "persona"
  | "positioning"
  | "content_planning"
  | "ad_copy"
  | "landing_copy"
  | "kpi_design"
  | "marketing_analytics"
  | "lead_research"
  | "lead_scoring"
  | "sales_strategy"
  | "sales_list"
  | "proposal_writing"
  | "email_drafting"
  | "crm_organization"
  | "ux_design"
  | "wireframe"
  | "design_spec"
  | "brand_direction"
  | "image_generation"
  | "video_storyboard"
  | "requirements"
  | "technical_design"
  | "coding"
  | "database_design"
  | "testing"
  | "bugfix"
  | "preview_environment"
  | "deploy_preparation"
  | "scheduling"
  | "meeting_notes"
  | "task_organization"
  | "email_triage"
  | "document_formatting"
  | "data_entry"
  | "reminder"
  | "legal_research"
  | "policy_drafting"
  | "regulatory_risk"
  | "license_research"
  | "compliance_checklist"
  | "budgeting"
  | "revenue_forecast"
  | "pl_simulation"
  | "cashflow"
  | "expense_classification"
  | "pricing_design"
  | "accounting_organization";

export type ToolName =
  | "web_search"
  | "web_fetch"
  | "llm_generate"
  | "image_generate"
  | "video_generate"
  | "email_draft"
  | "email_send"
  | "crm_write"
  | "code_write"
  | "code_run_sandbox"
  | "db_migration_plan"
  | "db_migration_apply"
  | "deploy_preview"
  | "deploy_production"
  | "domain_search"
  | "domain_purchase"
  | "dns_update"
  | "social_post"
  | "ads_publish"
  | "payment_execute"
  | "file_write"
  | "memory_write";

export type DataScope =
  | "org_profile"
  | "business"
  | "project"
  | "own_memory"
  | "shared_memory"
  | "artifacts"
  | "tasks"
  | "contacts"
  | "financials"
  | "credentials"; // 誰にも許可しない（明示的に定義して常に拒否）

export type ArtifactType =
  | "research_report"
  | "competitor_matrix"
  | "sales_list"
  | "csv"
  | "proposal"
  | "email_draft"
  | "marketing_plan"
  | "image"
  | "video"
  | "ui_design"
  | "code"
  | "website"
  | "app_preview"
  | "pdf"
  | "published_url"
  | "database_schema"
  | "legal_document"
  | "financial_model"
  | "document";

export type ApprovalAction =
  | "email_send"
  | "social_post"
  | "ads_publish"
  | "publish_production"
  | "domain_purchase"
  | "dns_update"
  | "payment"
  | "fund_transfer"
  | "production_db_change"
  | "data_deletion"
  | "oauth_grant"
  | "contract_submission"
  | "high_cost_run"
  | "pii_external_send";

export const APPROVAL_ACTION_LABEL: Record<ApprovalAction, string> = {
  email_send: "メール送信",
  social_post: "SNS投稿",
  ads_publish: "広告公開",
  publish_production: "本番公開",
  domain_purchase: "ドメイン購入",
  dns_update: "DNS設定変更",
  payment: "支払い",
  fund_transfer: "資金移動",
  production_db_change: "本番データベース変更",
  data_deletion: "データ削除",
  oauth_grant: "外部サービスへのOAuth権限付与",
  contract_submission: "契約・申請",
  high_cost_run: "高額なワークトークン消費",
  pii_external_send: "個人情報を含むデータの外部送信",
};

export type ProhibitedAction =
  | "spam_bulk_outreach"
  | "impersonation"
  | "false_claims"
  | "legal_advice"
  | "tax_filing"
  | "investment_decision"
  | "auto_fund_movement"
  | "production_destructive"
  | "unapproved_external_send";

/* ── エンティティ ─────────────────────────────────────── */

export interface Profile {
  id: string;
  email: string;
  displayName: string;
  passwordHash?: string;
  createdAt: string;
  updatedAt: string;
}

export interface Organization {
  id: string;
  name: string;
  ownerUserId: string;
  planKey: string;
  locale: string;
  createdAt: string;
  updatedAt: string;
  createdBy: string;
}

export interface OrganizationMember {
  id: string;
  organizationId: string;
  userId: string;
  role: "owner" | "admin" | "member";
  createdAt: string;
}

export interface Business {
  id: string;
  organizationId: string;
  name: string;
  summary: string;
  targetCustomer: string;
  problem: string;
  progress: string;
  budgetJpy: number | null;
  deadline: string | null;
  ownerCanDo: string;
  delegateToAi: string;
  market: "domestic" | "overseas" | "both";
  regulatedNotes: string;
  hypotheses: string[];
  createdAt: string;
  updatedAt: string;
  createdBy: string;
}

export type ProjectStatus =
  | "draft"
  | "planning"
  | "ready"
  | "active"
  | "paused"
  | "completed"
  | "cancelled";

export const PROJECT_STATUSES: ProjectStatus[] = [
  "draft",
  "planning",
  "ready",
  "active",
  "paused",
  "completed",
  "cancelled",
];

export interface Project {
  id: string;
  organizationId: string;
  businessId: string | null;
  name: string;
  description: string;
  status: ProjectStatus;
  createdAt: string;
  updatedAt: string;
  createdBy: string;
}

export interface EmployeeInstance {
  id: string;
  organizationId: string;
  roleKey: RoleKey;
  name: string;
  specialty: string;
  status: EmployeeStatus;
  currentTaskId: string | null;
  avatarSeed: string;
  hiredAt: string;
  createdAt: string;
  updatedAt: string;
  createdBy: string;
}

export interface Conversation {
  id: string;
  organizationId: string;
  employeeId: string | null;
  /** 統括AIの会話はプロジェクト単位で 1 本持つ（中央→右パネルで引き継ぐ） */
  projectId: string | null;
  title: string;
  kind: "director" | "employee";
  createdAt: string;
  updatedAt: string;
  createdBy: string;
}

export interface Message {
  id: string;
  organizationId: string;
  conversationId: string;
  author: "user" | "employee" | "system";
  employeeId: string | null;
  content: string;
  /** 外部由来の未信頼データを含むか */
  containsUntrustedData: boolean;
  createdAt: string;
}

export interface DecisionOption {
  id: string;
  decisionId: string;
  organizationId: string;
  kind: "hire" | "assign" | "queue" | "task" | "info" | "alternative";
  title: string;
  description: string;
  roleKey: RoleKey | null;
  employeeId: string | null;
  reason: string;
  estimatedDurationMinutes: number;
  estimatedWorkTokens: number;
  riskLevel: SafetyLevel;
  recommended: boolean;
  payload: Record<string, unknown>;
}

export interface Decision {
  id: string;
  organizationId: string;
  conversationId: string;
  summary: string;
  questions: string[];
  hypotheses: string[];
  risks: string[];
  status: "pending" | "executed" | "dismissed";
  safetyLevel: SafetyLevel;
  createdAt: string;
  executedAt: string | null;
  createdBy: string;
}

export interface Task {
  id: string;
  organizationId: string;
  projectId: string | null;
  title: string;
  description: string;
  status: TaskStatus;
  priority: TaskPriority;
  assigneeEmployeeId: string | null;
  requiredCapabilities: Capability[];
  dueDate: string | null;
  tools: ToolName[];
  estimatedWorkTokens: number;
  usedWorkTokens: number;
  safetyLevel: SafetyLevel;
  parentTaskId: string | null;
  createdAt: string;
  updatedAt: string;
  createdBy: string;
}

export interface TaskDependency {
  id: string;
  organizationId: string;
  taskId: string;
  dependsOnTaskId: string;
}

export interface TaskHandoff {
  id: string;
  organizationId: string;
  taskId: string;
  fromEmployeeId: string | null;
  toEmployeeId: string | null;
  toRoleKey: RoleKey;
  reason: string;
  status: "proposed" | "accepted" | "rejected";
  createdAt: string;
}

export interface TaskRun {
  id: string;
  organizationId: string;
  taskId: string;
  employeeId: string | null;
  status: "queued" | "running" | "succeeded" | "failed" | "cancelled";
  idempotencyKey: string;
  reservationId: string | null;
  startedAt: string | null;
  finishedAt: string | null;
  error: string | null;
  createdAt: string;
}

export type TaskEventType =
  | "created"
  | "assigned"
  | "queued"
  | "started"
  | "step"
  | "handoff"
  | "artifact_created"
  | "approval_requested"
  | "approved"
  | "rejected"
  | "paused"
  | "resumed"
  | "cancelled"
  | "failed"
  | "completed"
  | "safety_blocked";

export interface TaskEvent {
  id: string;
  organizationId: string;
  taskId: string;
  runId: string | null;
  type: TaskEventType;
  message: string;
  employeeId: string | null;
  /** フロー可視化用: このイベントが表すノードのキー */
  nodeKey: string | null;
  payload: Record<string, unknown>;
  createdAt: string;
}

export type MemoryScope = "organization" | "business" | "project" | "employee" | "run";

export interface MemoryRecord {
  id: string;
  organizationId: string;
  scope: MemoryScope;
  scopeRefId: string | null;
  employeeId: string | null;
  title: string;
  content: string;
  source: string;
  confidentiality: "public" | "internal" | "confidential";
  pinned: boolean;
  createdAt: string;
  updatedAt: string;
  createdBy: string;
}

export interface Artifact {
  id: string;
  organizationId: string;
  projectId: string | null;
  taskId: string | null;
  employeeId: string | null;
  type: ArtifactType;
  title: string;
  summary: string;
  currentVersion: number;
  status: "draft" | "review" | "approved" | "published";
  citations: { title: string; url: string; checkedAt: string }[];
  usedWorkTokens: number;
  createdAt: string;
  updatedAt: string;
  createdBy: string;
}

export interface ArtifactVersion {
  id: string;
  organizationId: string;
  artifactId: string;
  version: number;
  content: string;
  contentType: "markdown" | "json" | "csv" | "code" | "url" | "image";
  note: string;
  createdAt: string;
  createdBy: string;
}

export interface Approval {
  id: string;
  organizationId: string;
  action: ApprovalAction;
  taskId: string | null;
  artifactId: string | null;
  employeeId: string | null;
  title: string;
  what: string;
  affects: string;
  service: string;
  destination: string;
  diff: string;
  estimatedCostJpy: number;
  estimatedWorkTokens: number;
  reversible: boolean;
  risk: string;
  status: "pending" | "approved" | "rejected" | "expired";
  decidedBy: string | null;
  decidedAt: string | null;
  expiresAt: string;
  createdAt: string;
  createdBy: string;
}

export interface Notification {
  id: string;
  organizationId: string;
  userId: string | null;
  kind: "artifact_ready" | "approval_required" | "task_done" | "task_failed" | "safety" | "system";
  title: string;
  body: string;
  linkArtifactId: string | null;
  linkTaskId: string | null;
  read: boolean;
  createdAt: string;
}

export interface Integration {
  id: string;
  organizationId: string;
  kind: "email" | "image" | "video" | "search" | "deployment" | "database" | "billing";
  provider: string;
  status: "not_connected" | "mock" | "connected" | "error";
  config: Record<string, unknown>;
  createdAt: string;
  updatedAt: string;
}

export interface ProviderConnection {
  id: string;
  organizationId: string;
  provider: string;
  /** 暗号化済み。復号はサーバー側のみ */
  encryptedCredentials: string;
  scopes: string[];
  status: "active" | "revoked" | "expired";
  createdAt: string;
  updatedAt: string;
}

export interface CreditWallet {
  id: string;
  organizationId: string;
  balance: number;
  reserved: number;
  updatedAt: string;
}

export type LedgerEntryType = "grant" | "purchase" | "reserve" | "settle" | "release" | "adjust" | "expire";

export interface CreditLedgerEntry {
  id: string;
  organizationId: string;
  type: LedgerEntryType;
  /** 月次付与分と追加購入分を区別する */
  bucket: "monthly" | "purchased" | "system";
  amount: number; // 正: 増加 / 負: 減少
  balanceAfter: number;
  taskId: string | null;
  employeeId: string | null;
  reservationId: string | null;
  idempotencyKey: string | null;
  note: string;
  expiresAt: string | null;
  createdAt: string;
}

export interface CreditReservation {
  id: string;
  organizationId: string;
  taskId: string | null;
  employeeId: string | null;
  amount: number;
  settledAmount: number | null;
  status: "reserved" | "settled" | "released";
  idempotencyKey: string;
  createdAt: string;
  updatedAt: string;
}

export interface ModelUsageRecord {
  id: string;
  organizationId: string;
  taskId: string | null;
  employeeId: string | null;
  logicalModel: string;
  physicalModel: string;
  inputTokens: number;
  outputTokens: number;
  costJpy: number;
  workTokens: number;
  idempotencyKey: string | null;
  createdAt: string;
}

export interface SafetyDecisionRecord {
  id: string;
  organizationId: string;
  userId: string | null;
  employeeId: string | null;
  taskId: string | null;
  level: SafetyLevel;
  categories: string[];
  stage: "input" | "plan" | "pre_tool" | "output";
  /** ユーザーへ見せる説明（内部ルールは含めない） */
  publicReason: string;
  /** 監査用の内部詳細（UI へ返さない） */
  internalDetail: string;
  createdAt: string;
}

export type AuditEventType =
  | "login"
  | "logout"
  | "employee_hired"
  | "employee_assigned"
  | "permission_changed"
  | "tool_invoked"
  | "email_sent"
  | "published"
  | "domain_operation"
  | "payment"
  | "data_deleted"
  | "safety_decision"
  | "approval"
  | "model_used"
  | "credit_changed"
  | "emergency_stop";

export interface AuditEvent {
  id: string;
  organizationId: string;
  actorUserId: string | null;
  actorEmployeeId: string | null;
  type: AuditEventType;
  target: string;
  detail: Record<string, unknown>;
  ip: string | null;
  createdAt: string;
}

export interface BillingCustomer {
  id: string;
  organizationId: string;
  stripeCustomerId: string;
  createdAt: string;
}

export interface Subscription {
  id: string;
  organizationId: string;
  stripeSubscriptionId: string | null;
  planKey: string;
  status: "active" | "trialing" | "past_due" | "canceled" | "incomplete";
  currentPeriodEnd: string | null;
  createdAt: string;
  updatedAt: string;
}
