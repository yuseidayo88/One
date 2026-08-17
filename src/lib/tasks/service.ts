import type { EmployeeInstance, RoleKey, Task, TaskEvent, TaskEventType, TaskStatus } from "@/lib/core/types";
import type { Store } from "@/lib/db/store";
import { newId, nowIso } from "@/lib/core/ids";
import { getRole, ROLE_DEFINITIONS } from "@/lib/roles/registry";
import { splitOwnAndForeign } from "@/lib/orchestrator/heuristics";
import { recordAudit } from "@/lib/audit/log";

/**
 * タスク状態遷移。
 * ドラッグ＆ドロップによる変更も、必ずここを通して検証する。
 */
export const ALLOWED_TRANSITIONS: Record<TaskStatus, TaskStatus[]> = {
  idea: ["todo", "blocked"],
  todo: ["queued", "running", "blocked", "idea"],
  queued: ["running", "todo", "blocked"],
  running: ["awaiting_approval", "revising", "done", "blocked", "queued"],
  awaiting_approval: ["running", "revising", "done", "blocked"],
  revising: ["running", "awaiting_approval", "blocked", "done"],
  done: ["revising"],
  blocked: ["todo", "queued", "running"],
};

export function canTransition(from: TaskStatus, to: TaskStatus): boolean {
  if (from === to) return true;
  return ALLOWED_TRANSITIONS[from].includes(to);
}

export async function emitTaskEvent(
  store: Store,
  input: {
    organizationId: string;
    taskId: string;
    runId?: string | null;
    type: TaskEventType;
    message: string;
    employeeId?: string | null;
    nodeKey?: string | null;
    payload?: Record<string, unknown>;
  },
): Promise<TaskEvent> {
  return store.insert("task_events", {
    id: newId(),
    organizationId: input.organizationId,
    taskId: input.taskId,
    runId: input.runId ?? null,
    type: input.type,
    message: input.message,
    employeeId: input.employeeId ?? null,
    nodeKey: input.nodeKey ?? null,
    payload: input.payload ?? {},
    createdAt: nowIso(),
  });
}

export interface TransitionResult {
  ok: boolean;
  task: Task | null;
  reason: string;
}

/**
 * 状態遷移（権限・ワークフロー制約を検証してから反映する）。
 */
export async function transitionTask(
  store: Store,
  organizationId: string,
  taskId: string,
  to: TaskStatus,
  actorUserId: string,
): Promise<TransitionResult> {
  const task = await store.get("tasks", organizationId, taskId);
  if (!task) return { ok: false, task: null, reason: "タスクが見つかりません" };

  if (!canTransition(task.status, to)) {
    return {
      ok: false,
      task,
      reason: `「${task.status}」から「${to}」へは変更できません`,
    };
  }

  // 依存タスクが未完了なら running へ進めない
  if (to === "running") {
    const deps = await store.list("task_dependencies", organizationId, { filter: { taskId } });
    for (const dep of deps) {
      const upstream = await store.get("tasks", organizationId, dep.dependsOnTaskId);
      if (upstream && upstream.status !== "done") {
        return {
          ok: false,
          task,
          reason: `依存タスク「${upstream.title}」が完了していません`,
        };
      }
    }

    // 1社員1メインタスク制約
    if (task.assigneeEmployeeId) {
      const claimed = await store.tryClaimEmployeeForTask(
        organizationId,
        task.assigneeEmployeeId,
        taskId,
      );
      if (!claimed) {
        await store.update("tasks", organizationId, taskId, { status: "queued" });
        await emitTaskEvent(store, {
          organizationId,
          taskId,
          type: "queued",
          message: "担当社員が稼働中のため、待機キューに入れました",
          employeeId: task.assigneeEmployeeId,
        });
        return {
          ok: false,
          task: { ...task, status: "queued" },
          reason: "担当社員が別のメインタスクを実行中です。待機キューへ入れました。",
        };
      }
    }
  }

  const updated = await store.update("tasks", organizationId, taskId, { status: to });

  if ((to === "done" || to === "blocked") && task.assigneeEmployeeId) {
    await store.releaseEmployee(organizationId, task.assigneeEmployeeId, taskId);
    await startNextQueuedTask(store, organizationId, task.assigneeEmployeeId);
  }

  await emitTaskEvent(store, {
    organizationId,
    taskId,
    type:
      to === "done"
        ? "completed"
        : to === "running"
          ? "started"
          : to === "queued"
            ? "queued"
            : "step",
    message: `ステータスを「${to}」に変更しました`,
    employeeId: task.assigneeEmployeeId,
  });

  await recordAudit(store, {
    organizationId,
    actorUserId,
    type: "employee_assigned",
    target: taskId,
    detail: { from: task.status, to },
  });

  return { ok: true, task: updated, reason: "" };
}

/** 社員が空いたら、待機キューの先頭を開始する */
export async function startNextQueuedTask(
  store: Store,
  organizationId: string,
  employeeId: string,
): Promise<Task | null> {
  const queued = await store.list("tasks", organizationId, {
    filter: { assigneeEmployeeId: employeeId, status: "queued" },
    orderBy: "createdAt",
    direction: "asc",
  });
  const next = queued[0];
  if (!next) return null;

  const claimed = await store.tryClaimEmployeeForTask(organizationId, employeeId, next.id);
  if (!claimed) return null;

  const updated = await store.update("tasks", organizationId, next.id, { status: "running" });
  await emitTaskEvent(store, {
    organizationId,
    taskId: next.id,
    type: "started",
    message: "待機キューから実行を開始しました",
    employeeId,
  });
  return updated;
}

/** 稼働中の社員へ追加依頼が来た場合の選択肢 */
export interface BusyEmployeeOptions {
  employee: EmployeeInstance;
  currentTaskTitle: string;
  options: { key: "wait" | "reprioritize" | "hire_another"; title: string; description: string }[];
}

export async function busyEmployeeOptions(
  store: Store,
  organizationId: string,
  employeeId: string,
): Promise<BusyEmployeeOptions | null> {
  const employee = await store.get("employee_instances", organizationId, employeeId);
  if (!employee?.currentTaskId) return null;
  const current = await store.get("tasks", organizationId, employee.currentTaskId);
  const role = getRole(employee.roleKey);

  return {
    employee,
    currentTaskTitle: current?.title ?? "実行中のタスク",
    options: [
      {
        key: "wait",
        title: "完了を待つ",
        description: `${employee.name}が現在のタスクを終えてから開始します。`,
      },
      {
        key: "reprioritize",
        title: "優先順位を変更する",
        description: "現在のタスクを待機に戻し、新しい依頼を先に実行します。",
      },
      {
        key: "hire_another",
        title: `${role.name}社員をもう1名採用する`,
        description: "同じ職種の社員を追加し、並行して進めます。専門分野を分けることもできます。",
      },
    ],
  };
}

/* ────────────── 担当外業務の引き継ぎ ────────────── */

export interface HandoffProposal {
  ownWork: { title: string; capability: string }[];
  handoffs: {
    toRole: RoleKey;
    toRoleName: string;
    title: string;
    reason: string;
    existingEmployeeId: string | null;
    hiringRequired: boolean;
  }[];
  message: string;
}

/**
 * 担当外の依頼を受けたときの処理。
 * 単に拒否せず、分解して引き継ぎ案を返す。
 */
export async function proposeHandoff(
  store: Store,
  organizationId: string,
  employeeId: string,
  requestText: string,
): Promise<HandoffProposal> {
  const employee = await store.get("employee_instances", organizationId, employeeId);
  if (!employee) throw new Error("employee not found");

  const { own, foreign } = splitOwnAndForeign(requestText, employee.roleKey);
  const employees = await store.list("employee_instances", organizationId);

  const handoffs = foreign.map(({ rule }) => {
    const existing = employees.find((e) => e.roleKey === rule.role) ?? null;
    return {
      toRole: rule.role,
      toRoleName: ROLE_DEFINITIONS[rule.role].name,
      title: rule.title,
      reason: `「${rule.title}」は${ROLE_DEFINITIONS[rule.role].name}社員の担当業務です。`,
      existingEmployeeId: existing?.id ?? null,
      hiringRequired: !existing,
    };
  });

  const uniqueRoles = new Set(handoffs.map((h) => h.toRole));
  const message =
    uniqueRoles.size > 0
      ? `担当外の業務が含まれているため、${uniqueRoles.size}人の社員への引き継ぎを提案します。`
      : "この依頼はすべて担当範囲内です。";

  return {
    ownWork: own.map(({ rule }) => ({ title: rule.title, capability: rule.capability })),
    handoffs,
    message,
  };
}

/** 全社員停止（緊急停止） */
export async function emergencyStopAll(
  store: Store,
  organizationId: string,
  userId: string,
): Promise<{ stoppedTasks: number; pausedEmployees: number }> {
  const runningTasks = await store.list("tasks", organizationId, { filter: { status: "running" } });
  const runs = await store.list("task_runs", organizationId, {
    filter: { status: ["queued", "running"] },
  });
  const employees = await store.list("employee_instances", organizationId);

  for (const run of runs) {
    await store.update("task_runs", organizationId, run.id, {
      status: "cancelled",
      finishedAt: nowIso(),
      error: "緊急停止",
    });
  }

  for (const task of runningTasks) {
    await store.update("tasks", organizationId, task.id, { status: "queued" });
    await emitTaskEvent(store, {
      organizationId,
      taskId: task.id,
      type: "paused",
      message: "緊急停止により中断しました",
      employeeId: task.assigneeEmployeeId,
    });
  }

  for (const employee of employees) {
    await store.update("employee_instances", organizationId, employee.id, {
      status: "paused",
      currentTaskId: null,
    });
  }

  await recordAudit(store, {
    organizationId,
    actorUserId: userId,
    type: "emergency_stop",
    target: "all",
    detail: { stoppedTasks: runningTasks.length, cancelledRuns: runs.length },
  });

  return { stoppedTasks: runningTasks.length, pausedEmployees: employees.length };
}

export async function resumeAll(
  store: Store,
  organizationId: string,
  userId: string,
): Promise<number> {
  const employees = await store.list("employee_instances", organizationId, {
    filter: { status: "paused" },
  });
  for (const employee of employees) {
    await store.update("employee_instances", organizationId, employee.id, { status: "idle" });
  }
  await recordAudit(store, {
    organizationId,
    actorUserId: userId,
    type: "emergency_stop",
    target: "resume",
    detail: { resumed: employees.length },
  });
  return employees.length;
}
