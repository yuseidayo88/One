import type {
  Approval,
  Artifact,
  EmployeeInstance,
  Notification,
  Task,
  TaskEvent,
} from "@/lib/core/types";

/**
 * 今日のフィード。
 *
 * 「何が起きたか」を成果物・承認・イベント・提案に分けて別々の場所へ置くと、
 * ユーザーは複数の画面を巡回することになる。
 * AI社員が出したものを 1 本の時系列フィードへ集約し、その場で
 * 確認・承認・修正依頼まで完結できるようにする。
 */

export type FeedItemKind =
  | "artifact_ready" // 成果物が完成した
  | "approval_required" // 承認が必要
  | "handoff" // 社員間の引き継ぎ
  | "task_started" // 着手した
  | "task_done" // 完了した
  | "blocked" // 停止・エラー
  | "safety" // 安全ゲートが介入した
  | "suggestion"; // 次にやるとよいこと

export interface FeedItem {
  id: string;
  kind: FeedItemKind;
  title: string;
  body: string;
  createdAt: string;
  employeeId: string | null;
  employeeName: string | null;
  taskId: string | null;
  artifactId: string | null;
  approvalId: string | null;
  /** 未対応（承認待ち・未読）かどうか */
  actionable: boolean;
}

export interface BuildFeedInput {
  employees: EmployeeInstance[];
  tasks: Task[];
  artifacts: Artifact[];
  approvals: Approval[];
  notifications: Notification[];
  events: TaskEvent[];
  suggestions: { title: string; reason: string }[];
  limit?: number;
}

export function buildFeed(input: BuildFeedInput): FeedItem[] {
  const employeeName = (id: string | null) =>
    id ? (input.employees.find((e) => e.id === id)?.name ?? null) : null;
  const taskTitle = (id: string | null) =>
    id ? (input.tasks.find((t) => t.id === id)?.title ?? "") : "";

  const items: FeedItem[] = [];

  // 承認待ち: 最優先で対応が必要
  for (const approval of input.approvals) {
    if (approval.status !== "pending") continue;
    items.push({
      id: `approval:${approval.id}`,
      kind: "approval_required",
      title: approval.title,
      body: approval.what,
      createdAt: approval.createdAt,
      employeeId: approval.employeeId,
      employeeName: employeeName(approval.employeeId),
      taskId: approval.taskId,
      artifactId: approval.artifactId,
      approvalId: approval.id,
      actionable: true,
    });
  }

  // 完成した成果物
  for (const artifact of input.artifacts) {
    items.push({
      id: `artifact:${artifact.id}`,
      kind: "artifact_ready",
      title: artifact.title,
      body: artifact.summary,
      createdAt: artifact.createdAt,
      employeeId: artifact.employeeId,
      employeeName: employeeName(artifact.employeeId),
      taskId: artifact.taskId,
      artifactId: artifact.id,
      approvalId: null,
      // 未承認のものは確認待ち
      actionable: artifact.status === "review" || artifact.status === "draft",
    });
  }

  // 実行イベント（引き継ぎ・開始・完了・停止・安全）
  const EVENT_KIND: Partial<Record<TaskEvent["type"], FeedItemKind>> = {
    handoff: "handoff",
    started: "task_started",
    completed: "task_done",
    failed: "blocked",
    cancelled: "blocked",
    safety_blocked: "safety",
  };
  for (const event of input.events) {
    const kind = EVENT_KIND[event.type];
    if (!kind) continue;
    items.push({
      id: `event:${event.id}`,
      kind,
      title: event.message,
      body: taskTitle(event.taskId),
      createdAt: event.createdAt,
      employeeId: event.employeeId,
      employeeName: employeeName(event.employeeId),
      taskId: event.taskId,
      artifactId: (event.payload?.artifactId as string | undefined) ?? null,
      approvalId: null,
      actionable: false,
    });
  }

  // 次の提案（時刻を持たないため最新として扱う）
  const now = new Date().toISOString();
  for (const [index, suggestion] of input.suggestions.entries()) {
    items.push({
      id: `suggestion:${index}`,
      kind: "suggestion",
      title: suggestion.title,
      body: suggestion.reason,
      createdAt: now,
      employeeId: null,
      employeeName: "統括AI",
      taskId: null,
      artifactId: null,
      approvalId: null,
      actionable: true,
    });
  }

  // 対応が必要なものを上へ、その中では新しい順
  items.sort((a, b) => {
    if (a.actionable !== b.actionable) return a.actionable ? -1 : 1;
    return b.createdAt.localeCompare(a.createdAt);
  });

  // 同じ成果物についてイベントと成果物カードが重複しないよう間引く
  const seenArtifacts = new Set<string>();
  const deduped = items.filter((item) => {
    if (item.kind !== "artifact_ready" && item.artifactId) {
      if (seenArtifacts.has(item.artifactId)) return false;
    }
    if (item.artifactId) seenArtifacts.add(item.artifactId);
    return true;
  });

  return deduped.slice(0, input.limit ?? 40);
}

export function countActionable(items: FeedItem[]): number {
  return items.filter((i) => i.actionable).length;
}
