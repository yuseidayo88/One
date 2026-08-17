import type { Approval, ApprovalAction } from "@/lib/core/types";
import type { Store } from "@/lib/db/store";
import { newId, nowIso, isoIn } from "@/lib/core/ids";
import { recordAudit } from "@/lib/audit/log";
import { notify } from "@/lib/notifications/service";

/**
 * 承認。
 *
 * 承認画面には次を必ず表示する:
 * 何を実行するか / 誰に影響するか / 使用するサービス / 送信先 /
 * 変更前後の差分 / 予想費用 / ワークトークン / 元に戻せるか / リスク
 */

const APPROVAL_TTL_MS = 24 * 60 * 60 * 1000;

export interface RequestApprovalInput {
  organizationId: string;
  action: ApprovalAction;
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
  taskId?: string | null;
  artifactId?: string | null;
  employeeId?: string | null;
  userId: string;
}

export async function requestApproval(
  store: Store,
  input: RequestApprovalInput,
): Promise<Approval> {
  const approval: Approval = {
    id: newId(),
    organizationId: input.organizationId,
    action: input.action,
    taskId: input.taskId ?? null,
    artifactId: input.artifactId ?? null,
    employeeId: input.employeeId ?? null,
    title: input.title,
    what: input.what,
    affects: input.affects,
    service: input.service,
    destination: input.destination,
    diff: input.diff,
    estimatedCostJpy: input.estimatedCostJpy,
    estimatedWorkTokens: input.estimatedWorkTokens,
    reversible: input.reversible,
    risk: input.risk,
    status: "pending",
    decidedBy: null,
    decidedAt: null,
    expiresAt: isoIn(APPROVAL_TTL_MS),
    createdAt: nowIso(),
    createdBy: input.userId,
  };
  await store.insert("approvals", approval);

  await notify(store, {
    organizationId: input.organizationId,
    userId: input.userId,
    kind: "approval_required",
    title: `承認が必要です: ${input.title}`,
    body: input.what,
    linkTaskId: input.taskId ?? null,
    linkArtifactId: input.artifactId ?? null,
  });

  return approval;
}

export async function decideApproval(
  store: Store,
  organizationId: string,
  approvalId: string,
  decision: "approved" | "rejected",
  userId: string,
): Promise<Approval> {
  const approval = await store.get("approvals", organizationId, approvalId);
  if (!approval) throw new Error("approval not found");
  if (approval.status !== "pending") return approval;

  const updated = await store.update("approvals", organizationId, approvalId, {
    status: decision,
    decidedBy: userId,
    decidedAt: nowIso(),
  });

  await recordAudit(store, {
    organizationId,
    actorUserId: userId,
    type: "approval",
    target: approvalId,
    detail: { action: approval.action, decision },
  });

  return updated;
}

/**
 * 承認レコードの有効性（対象・期限・状態）を実行直前に再検証する。
 * ツール実行経路はこの関数を必ず通す。
 */
export async function verifyApproval(
  store: Store,
  organizationId: string,
  approvalId: string | null | undefined,
  action: ApprovalAction,
  target: { taskId?: string | null; artifactId?: string | null },
): Promise<{ valid: boolean; reason: string }> {
  if (!approvalId) return { valid: false, reason: "承認がありません" };

  const approval = await store.get("approvals", organizationId, approvalId);
  if (!approval) return { valid: false, reason: "承認が見つかりません" };
  if (approval.status !== "approved") return { valid: false, reason: "承認されていません" };
  if (approval.action !== action) return { valid: false, reason: "承認対象の操作が一致しません" };
  if (new Date(approval.expiresAt).getTime() < Date.now()) {
    await store.update("approvals", organizationId, approvalId, { status: "expired" });
    return { valid: false, reason: "承認の有効期限が切れています" };
  }
  if (target.taskId && approval.taskId && approval.taskId !== target.taskId) {
    return { valid: false, reason: "承認対象のタスクが一致しません" };
  }
  if (target.artifactId && approval.artifactId && approval.artifactId !== target.artifactId) {
    return { valid: false, reason: "承認対象の成果物が一致しません" };
  }
  return { valid: true, reason: "" };
}

export async function listPendingApprovals(
  store: Store,
  organizationId: string,
): Promise<Approval[]> {
  return store.list("approvals", organizationId, {
    filter: { status: "pending" },
    orderBy: "createdAt",
    direction: "desc",
  });
}
