import { z } from "zod";
import { defineHandler, jsonOk, recallIdempotent, rememberIdempotent } from "@/lib/api/handler";
import { getStore } from "@/lib/db";
import { executeDecision } from "@/lib/orchestrator/workflow";
import { startTaskRun, EmployeeBusyError } from "@/lib/tasks/runner";
import { InsufficientCreditsError } from "@/lib/credits/ledger";

const schema = z.object({
  organizationId: z.string().uuid().optional(),
  decisionId: z.string().uuid(),
  selectedOptionIds: z.array(z.string().uuid()).min(1).max(20),
  projectId: z.string().uuid().nullable().optional(),
  /** 選択後すぐに最初のタスクを開始するか */
  startImmediately: z.boolean().default(true),
});

/**
 * ユーザーが「実行する」を押したときだけ呼ばれる。
 * これ以前に採用・高額処理・外部送信は一切行わない。
 */
export const POST = defineHandler({ schema, rateLimitMax: 20 }, async ({ body, auth }) => {
  const store = await getStore();
  const orgId = auth.organization.id;

  // 冪等性: 同じ decision の二重実行を防ぐ
  const cacheKey = `execute:${orgId}:${body.decisionId}`;
  const cached = recallIdempotent(cacheKey);
  if (cached) return jsonOk(cached);

  // projectId 未指定なら、開始待ちのプロジェクトを対象にする
  let projectId = body.projectId ?? null;
  if (!projectId) {
    const projects = await store.list("projects", orgId, {
      orderBy: "createdAt",
      direction: "desc",
    });
    projectId =
      projects.find((p) => p.status === "ready" || p.status === "planning" || p.status === "draft")
        ?.id ?? null;
  }

  const result = await executeDecision({
    store,
    organizationId: orgId,
    userId: auth.user.id,
    decisionId: body.decisionId,
    selectedOptionIds: body.selectedOptionIds,
    projectId,
  });

  const started: string[] = [];
  const queued: string[] = [];

  if (body.startImmediately) {
    for (const task of result.createdTasks) {
      // 依存タスクがあるものは、依存が解決してから開始する
      const deps = await store.list("task_dependencies", orgId, { filter: { taskId: task.id } });
      if (deps.length > 0) {
        queued.push(task.id);
        continue;
      }
      if (!task.assigneeEmployeeId) continue;
      try {
        await startTaskRun({
          store,
          organizationId: orgId,
          taskId: task.id,
          userId: auth.user.id,
        });
        started.push(task.id);
      } catch (error) {
        if (error instanceof EmployeeBusyError || error instanceof InsufficientCreditsError) {
          queued.push(task.id);
          continue;
        }
        throw error;
      }
    }
  }

  const payload = {
    message: result.message,
    activatedProjectId: result.activatedProjectId,
    hiredEmployees: result.hiredEmployees.map((e) => ({ id: e.id, name: e.name, roleKey: e.roleKey })),
    createdTasks: result.createdTasks.map((t) => ({ id: t.id, title: t.title, status: t.status })),
    startedTaskIds: started,
    queuedTaskIds: queued,
    requiresApproval: result.requiresApproval,
  };
  rememberIdempotent(cacheKey, payload);

  return jsonOk(payload);
});
