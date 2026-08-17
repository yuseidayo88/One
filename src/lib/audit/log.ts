import type { AuditEventType, SafetyDecisionRecord, SafetyLevel } from "@/lib/core/types";
import type { Store } from "@/lib/db/store";
import { newId, nowIso } from "@/lib/core/ids";
import { redact } from "@/lib/core/redact";

/**
 * 監査ログ。追記専用（更新・削除 API を提供しない）。
 */
export async function recordAudit(
  store: Store,
  input: {
    organizationId: string;
    actorUserId?: string | null;
    actorEmployeeId?: string | null;
    type: AuditEventType;
    target: string;
    detail?: Record<string, unknown>;
    ip?: string | null;
  },
): Promise<void> {
  await store.insert("audit_events", {
    id: newId(),
    organizationId: input.organizationId,
    actorUserId: input.actorUserId ?? null,
    actorEmployeeId: input.actorEmployeeId ?? null,
    type: input.type,
    target: input.target,
    detail: (redact(input.detail ?? {}) as Record<string, unknown>) ?? {},
    ip: input.ip ?? null,
    createdAt: nowIso(),
  });
}

export async function recordSafetyDecision(
  store: Store,
  input: {
    organizationId: string;
    userId?: string | null;
    employeeId?: string | null;
    taskId?: string | null;
    level: SafetyLevel;
    categories: string[];
    stage: SafetyDecisionRecord["stage"];
    publicReason: string;
    internalDetail: string;
  },
): Promise<SafetyDecisionRecord> {
  const record: SafetyDecisionRecord = {
    id: newId(),
    organizationId: input.organizationId,
    userId: input.userId ?? null,
    employeeId: input.employeeId ?? null,
    taskId: input.taskId ?? null,
    level: input.level,
    categories: input.categories,
    stage: input.stage,
    publicReason: input.publicReason,
    internalDetail: input.internalDetail,
    createdAt: nowIso(),
  };
  await store.insert("safety_decisions", record);
  await recordAudit(store, {
    organizationId: input.organizationId,
    actorUserId: input.userId ?? null,
    actorEmployeeId: input.employeeId ?? null,
    type: "safety_decision",
    target: input.stage,
    detail: { level: input.level, categories: input.categories },
  });
  return record;
}

/**
 * 繰り返し悪用の検知。
 * 直近の RED 判定数に応じて、追加の制限を適用する。
 */
export async function abuseStatus(
  store: Store,
  organizationId: string,
): Promise<{ redCount24h: number; action: "none" | "rate_limit" | "manual_review" | "suspend" }> {
  const decisions = await store.list("safety_decisions", organizationId, {
    filter: { level: "RED" },
  });
  const since = Date.now() - 24 * 60 * 60 * 1000;
  const redCount24h = decisions.filter((d) => new Date(d.createdAt).getTime() >= since).length;

  let action: "none" | "rate_limit" | "manual_review" | "suspend" = "none";
  if (redCount24h >= 10) action = "suspend";
  else if (redCount24h >= 5) action = "manual_review";
  else if (redCount24h >= 3) action = "rate_limit";

  return { redCount24h, action };
}
