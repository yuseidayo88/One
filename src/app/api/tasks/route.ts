import { z } from "zod";
import { defineHandler, jsonError, jsonOk } from "@/lib/api/handler";
import { getStore } from "@/lib/db";
import { TASK_STATUSES } from "@/lib/core/types";
import { transitionTask } from "@/lib/tasks/service";
import { startTaskRun, EmployeeBusyError, cancelRun } from "@/lib/tasks/runner";
import { InsufficientCreditsError } from "@/lib/credits/ledger";

const patchSchema = z.object({
  organizationId: z.string().uuid().optional(),
  taskId: z.string().uuid(),
  action: z.enum(["set_status", "run", "cancel", "pause", "resume", "retry"]),
  status: z.enum(TASK_STATUSES as [string, ...string[]]).optional(),
});

export const POST = defineHandler({ schema: patchSchema, rateLimitMax: 60 }, async ({ body, auth }) => {
  const store = await getStore();
  const orgId = auth.organization.id;

  const task = await store.get("tasks", orgId, body.taskId);
  if (!task) return jsonError(404, "not_found", "タスクが見つかりません");

  switch (body.action) {
    case "set_status": {
      if (!body.status) return jsonError(400, "invalid_request", "ステータスが指定されていません");
      // ドラッグ＆ドロップ由来でも、必ずサーバー側で遷移とワークフロー制約を検証する
      const result = await transitionTask(
        store,
        orgId,
        body.taskId,
        body.status as (typeof TASK_STATUSES)[number],
        auth.user.id,
      );
      if (!result.ok) {
        return jsonError(409, "transition_rejected", result.reason, { task: result.task });
      }
      return jsonOk({ task: result.task });
    }

    case "run":
    case "retry": {
      try {
        const run = await startTaskRun({
          store,
          organizationId: orgId,
          taskId: body.taskId,
          userId: auth.user.id,
        });
        return jsonOk({ runId: run.id, status: run.status });
      } catch (error) {
        if (error instanceof EmployeeBusyError) {
          return jsonError(409, "employee_busy", "担当社員が別のメインタスクを実行中です", {
            employeeId: error.employeeId,
          });
        }
        if (error instanceof InsufficientCreditsError) {
          return jsonError(402, "insufficient_credits", error.message);
        }
        throw error;
      }
    }

    case "cancel": {
      const runs = await store.list("task_runs", orgId, {
        filter: { taskId: body.taskId, status: ["queued", "running"] },
      });
      for (const run of runs) cancelRun(run.id);
      await store.update("tasks", orgId, body.taskId, { status: "queued" });
      if (task.assigneeEmployeeId) {
        await store.releaseEmployee(orgId, task.assigneeEmployeeId, body.taskId);
      }
      return jsonOk({ cancelled: runs.length });
    }

    case "pause": {
      await store.update("tasks", orgId, body.taskId, { status: "queued" });
      if (task.assigneeEmployeeId) {
        await store.update("employee_instances", orgId, task.assigneeEmployeeId, {
          status: "paused",
        });
      }
      return jsonOk({ paused: true });
    }

    case "resume": {
      if (task.assigneeEmployeeId) {
        await store.update("employee_instances", orgId, task.assigneeEmployeeId, { status: "idle" });
      }
      const result = await transitionTask(store, orgId, body.taskId, "running", auth.user.id);
      return jsonOk({ resumed: result.ok, reason: result.reason });
    }

    default:
      return jsonError(400, "invalid_action", "不明な操作です");
  }
});
