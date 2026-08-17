import type { Task, TaskEvent } from "@/lib/core/types";

/**
 * 進捗グラフのデータ。task_events から組み立てるので、装飾ではなく実データを表す。
 * イベントが 1 件も無ければ点を作らない（もっともらしい線を描かない）。
 */

export interface ProgressPoint {
  /** 期間の開始時刻（ISO） */
  at: string;
  /** その時点までに完了したタスク数 */
  completed: number;
  /** その時点で実行中だったタスク数 */
  running: number;
  /** その期間に起きたイベント数 */
  events: number;
}

export interface ProgressSeries {
  points: ProgressPoint[];
  totalTasks: number;
  completedTasks: number;
  /** 0〜1。タスクが 0 件なら 0。 */
  ratio: number;
  approvalWaits: number;
  failures: number;
}

const STARTED = new Set(["started", "resumed"]);
const ENDED = new Set(["completed", "failed", "cancelled", "paused"]);

export function buildProgressSeries(
  tasks: Task[],
  events: TaskEvent[],
  buckets = 24,
): ProgressSeries {
  const completedTasks = tasks.filter((t) => t.status === "done").length;
  const base: ProgressSeries = {
    points: [],
    totalTasks: tasks.length,
    completedTasks,
    ratio: tasks.length > 0 ? completedTasks / tasks.length : 0,
    approvalWaits: events.filter((e) => e.type === "approval_requested").length,
    failures: events.filter((e) => e.type === "failed" || e.type === "safety_blocked").length,
  };
  if (events.length === 0) return base;

  const sorted = [...events].sort((a, b) => a.createdAt.localeCompare(b.createdAt));
  const start = Date.parse(sorted[0]!.createdAt);
  const end = Date.parse(sorted[sorted.length - 1]!.createdAt);
  const span = Math.max(1, end - start);
  const size = span / buckets;

  const points: ProgressPoint[] = Array.from({ length: buckets }, (_, i) => ({
    at: new Date(start + i * size).toISOString(),
    completed: 0,
    running: 0,
    events: 0,
  }));

  let completed = 0;
  const running = new Set<string>();
  let cursor = 0;

  for (const event of sorted) {
    const index = Math.min(buckets - 1, Math.floor((Date.parse(event.createdAt) - start) / size));
    // 空いた期間にも直前の状態を引き継ぐ
    while (cursor < index) {
      points[cursor]!.completed = completed;
      points[cursor]!.running = running.size;
      cursor++;
    }
    if (event.type === "completed") {
      completed++;
      running.delete(event.taskId);
    } else if (STARTED.has(event.type)) {
      running.add(event.taskId);
    } else if (ENDED.has(event.type)) {
      running.delete(event.taskId);
    }
    points[index]!.events++;
    points[index]!.completed = completed;
    points[index]!.running = running.size;
  }

  for (let i = cursor + 1; i < buckets; i++) {
    points[i]!.completed = completed;
    points[i]!.running = running.size;
  }

  return { ...base, points };
}
