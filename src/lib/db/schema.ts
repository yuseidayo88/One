import type {
  Approval,
  Artifact,
  ArtifactVersion,
  AuditEvent,
  BillingCustomer,
  Business,
  Conversation,
  CreditLedgerEntry,
  CreditReservation,
  CreditWallet,
  Decision,
  DecisionOption,
  EmployeeInstance,
  Integration,
  MemoryRecord,
  Message,
  ModelUsageRecord,
  Notification,
  Organization,
  OrganizationMember,
  Profile,
  Project,
  ProviderConnection,
  SafetyDecisionRecord,
  Subscription,
  Task,
  TaskDependency,
  TaskEvent,
  TaskHandoff,
  TaskRun,
} from "@/lib/core/types";

/**
 * テーブル名 → 行の型。
 * Store 実装（Memory / Supabase）はこのマップだけを見れば良い。
 */
export interface TableMap {
  profiles: Profile;
  organizations: Organization;
  organization_members: OrganizationMember;
  businesses: Business;
  projects: Project;
  employee_instances: EmployeeInstance;
  conversations: Conversation;
  messages: Message;
  decisions: Decision;
  decision_options: DecisionOption;
  tasks: Task;
  task_dependencies: TaskDependency;
  task_handoffs: TaskHandoff;
  task_runs: TaskRun;
  task_events: TaskEvent;
  memories: MemoryRecord;
  artifacts: Artifact;
  artifact_versions: ArtifactVersion;
  approvals: Approval;
  notifications: Notification;
  integrations: Integration;
  provider_connections: ProviderConnection;
  credit_wallets: CreditWallet;
  credit_ledger: CreditLedgerEntry;
  credit_reservations: CreditReservation;
  model_usage: ModelUsageRecord;
  safety_decisions: SafetyDecisionRecord;
  audit_events: AuditEvent;
  billing_customers: BillingCustomer;
  subscriptions: Subscription;
}

export type TableName = keyof TableMap;

/** organization_id を持たないテーブル（テナント横断のルート） */
export const GLOBAL_TABLES: TableName[] = ["profiles", "organizations"];

export const ALL_TABLES: TableName[] = [
  "profiles",
  "organizations",
  "organization_members",
  "businesses",
  "projects",
  "employee_instances",
  "conversations",
  "messages",
  "decisions",
  "decision_options",
  "tasks",
  "task_dependencies",
  "task_handoffs",
  "task_runs",
  "task_events",
  "memories",
  "artifacts",
  "artifact_versions",
  "approvals",
  "notifications",
  "integrations",
  "provider_connections",
  "credit_wallets",
  "credit_ledger",
  "credit_reservations",
  "model_usage",
  "safety_decisions",
  "audit_events",
  "billing_customers",
  "subscriptions",
];
