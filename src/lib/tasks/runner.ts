import type { Artifact, ArtifactType, Task, TaskRun } from "@/lib/core/types";
import type { Store } from "@/lib/db/store";
import { idempotencyKey, newId, nowIso } from "@/lib/core/ids";
import { emitTaskEvent, startNextQueuedTask } from "@/lib/tasks/service";
import { reserve, release, settle, InsufficientCreditsError } from "@/lib/credits/ledger";
import { routeModel, ROLE_TASK_KIND } from "@/lib/models/router";
import { availableLogicalModels, getLlmProvider } from "@/lib/providers";
import { serverEnv } from "@/config/env";
import { employeeSystemPrompt } from "@/lib/orchestrator/prompts";
import { employeeOutputSchema, parseStructured } from "@/lib/orchestrator/schema";
import { buildEmployeeOutput } from "@/lib/employees/output-builder";
import { evaluateSafety, sanitizeBlockedOutput } from "@/lib/safety/gate";
import { recordAudit, recordSafetyDecision } from "@/lib/audit/log";
import { notify } from "@/lib/notifications/service";
import { rememberMemory, recallForEmployee } from "@/lib/memory/service";
import { canCreateArtifact } from "@/lib/roles/policy";
import type { TaskKind } from "@/config/models";

/**
 * 耐久バックグラウンドジョブ。
 *
 * 長時間タスクを HTTP リクエスト内で完結させない。
 * `task_runs` を状態機械として使い、各ステップで `task_events` を追記する。
 * UI は task_events を購読して進行アニメーションを同期させる。
 *
 * 本番構成（Cloudflare Queues / Supabase pg_cron）については
 * docs/adr-0001-background-jobs.md を参照。
 */

const STEPS = [
  { key: "context", label: "情報の収集" },
  { key: "analysis", label: "分析" },
  { key: "draft", label: "成果物の作成" },
  { key: "review", label: "自己レビュー" },
] as const;

/** 実行中ジョブの中断シグナル（プロセス内） */
const activeRuns = new Map<string, AbortController>();

export function cancelRun(runId: string): void {
  activeRuns.get(runId)?.abort();
}

export function cancelAllRuns(): number {
  const count = activeRuns.size;
  for (const controller of activeRuns.values()) controller.abort();
  activeRuns.clear();
  return count;
}

export interface StartRunInput {
  store: Store;
  organizationId: string;
  taskId: string;
  userId: string;
  /** true の場合、完了まで待つ（テスト・同期実行用） */
  awaitCompletion?: boolean;
}

export async function startTaskRun(input: StartRunInput): Promise<TaskRun> {
  const { store, organizationId, taskId } = input;

  const task = await store.get("tasks", organizationId, taskId);
  if (!task) throw new Error("task not found");
  if (!task.assigneeEmployeeId) throw new Error("タスクに担当社員が割り当てられていません");

  // 冪等性: 同じタスクの実行中ジョブがあれば再利用する（リトライで二重課金しない）
  const existingRuns = await store.list("task_runs", organizationId, {
    filter: { taskId, status: ["queued", "running"] },
  });
  const existing = existingRuns[0];
  if (existing) return existing;

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
      message: "担当社員が別のメインタスクを実行中のため、待機キューに入りました",
      employeeId: task.assigneeEmployeeId,
    });
    throw new EmployeeBusyError(task.assigneeEmployeeId);
  }

  const run: TaskRun = {
    id: newId(),
    organizationId,
    taskId,
    employeeId: task.assigneeEmployeeId,
    status: "queued",
    idempotencyKey: idempotencyKey("run", taskId, task.updatedAt),
    reservationId: null,
    startedAt: null,
    finishedAt: null,
    error: null,
    createdAt: nowIso(),
  };
  await store.insert("task_runs", run);
  await store.update("tasks", organizationId, taskId, { status: "running" });

  const promise = executeRun({ ...input, run, task });
  if (input.awaitCompletion) await promise;
  else void promise.catch(() => undefined);

  return run;
}

export class EmployeeBusyError extends Error {
  constructor(public employeeId: string) {
    super("担当社員が別のメインタスクを実行中です");
    this.name = "EmployeeBusyError";
  }
}

async function executeRun(
  input: StartRunInput & { run: TaskRun; task: Task },
): Promise<void> {
  const { store, organizationId, userId, run, task } = input;
  const controller = new AbortController();
  activeRuns.set(run.id, controller);

  let reservationId: string | null = null;

  try {
    const employee = await store.get("employee_instances", organizationId, run.employeeId!);
    if (!employee) throw new Error("employee not found");

    await store.update("task_runs", organizationId, run.id, {
      status: "running",
      startedAt: nowIso(),
    });
    await emitTaskEvent(store, {
      organizationId,
      taskId: task.id,
      runId: run.id,
      type: "started",
      message: `${employee.name}が作業を開始しました`,
      employeeId: employee.id,
      nodeKey: "start",
    });

    // ── 12. ワークトークンを予約 ───────────────────────
    const reservation = await reserve(store, {
      orgId: organizationId,
      taskId: task.id,
      employeeId: employee.id,
      amount: Math.max(500, task.estimatedWorkTokens),
      idempotencyKey: run.idempotencyKey,
    });
    reservationId = reservation.id;
    await store.update("task_runs", organizationId, run.id, { reservationId: reservation.id });

    // ── 13. 実行 ─────────────────────────────────────
    const business = (await store.list("businesses", organizationId))[0] ?? null;
    const memories = await recallForEmployee(store, organizationId, {
      employeeId: employee.id,
      roleKey: employee.roleKey,
      businessId: business?.id ?? null,
      projectId: task.projectId,
      runId: run.id,
    });

    for (const step of STEPS) {
      if (controller.signal.aborted) throw new Error("cancelled");
      await emitTaskEvent(store, {
        organizationId,
        taskId: task.id,
        runId: run.id,
        type: "step",
        message: step.label,
        employeeId: employee.id,
        nodeKey: step.key,
      });
    }

    const taskKind = (ROLE_TASK_KIND[employee.roleKey] ?? "summarization") as TaskKind;
    const route = routeModel(
      {
        taskKind,
        estimatedInputTokens: 2_000 + memories.length * 100,
        estimatedOutputTokens: 2_500,
        safetyLevel: task.safetyLevel,
        needsStructuredOutput: true,
        availableModels: availableLogicalModels(),
      },
      serverEnv.llm.routingConfigJson,
    );

    const llm = await getLlmProvider(route.logicalModel);
    const context = {
      roleKey: employee.roleKey,
      employeeName: employee.name,
      taskTitle: task.title,
      taskDescription: task.description,
      businessSummary: business?.summary ?? "",
      targetCustomer: business?.targetCustomer ?? "",
      memories: memories.map((m) => ({ title: m.title, content: m.content })),
    };

    const llmResult = await llm.generateStructured({
      purpose: "employee_output",
      taskKind,
      logicalModel: route.logicalModel,
      systemPrompt: employeeSystemPrompt(employee.roleKey),
      userContent: `${task.title}\n\n${task.description}`,
      context,
      idempotencyKey: `${run.idempotencyKey}:output`,
      organizationId,
      taskId: task.id,
      employeeId: employee.id,
      signal: controller.signal,
    });

    const parsed = llmResult.ok ? parseStructured(employeeOutputSchema, llmResult.data) : null;
    const output = parsed ?? buildEmployeeOutput(task.title, context);

    // ── 出力段階の安全性確認 ────────────────────────────
    const outputSafety = await evaluateSafety({
      userText: output.contentMarkdown,
      stage: "output",
    });
    await recordSafetyDecision(store, {
      organizationId,
      userId,
      employeeId: employee.id,
      taskId: task.id,
      level: outputSafety.level,
      categories: outputSafety.categories,
      stage: "output",
      publicReason: outputSafety.publicReason,
      internalDetail: outputSafety.internalDetail,
    });

    if (outputSafety.level === "RED") {
      // 危険な部分出力は成果物として保存・表示しない
      await emitTaskEvent(store, {
        organizationId,
        taskId: task.id,
        runId: run.id,
        type: "safety_blocked",
        message: "安全性の確認により、この成果物は保存されませんでした",
        employeeId: employee.id,
      });
      throw new SafetyBlockedError(outputSafety.cannotDo);
    }

    const safeContent = sanitizeBlockedOutput(outputSafety, output.contentMarkdown);

    // ── 14. 成果物保存 ───────────────────────────────
    let artifactType = output.artifactType as ArtifactType;
    if (!canCreateArtifact(employee.roleKey, artifactType).allowed) {
      artifactType = "document";
    }

    const artifact: Artifact = {
      id: newId(),
      organizationId,
      projectId: task.projectId,
      taskId: task.id,
      employeeId: employee.id,
      type: artifactType,
      title: output.title,
      summary: output.summary,
      currentVersion: 1,
      status: "review",
      citations: output.citations,
      usedWorkTokens: llmResult.cost.workTokens,
      createdAt: nowIso(),
      updatedAt: nowIso(),
      createdBy: userId,
    };
    await store.insert("artifacts", artifact);
    await store.insert("artifact_versions", {
      id: newId(),
      organizationId,
      artifactId: artifact.id,
      version: 1,
      content: output.disclaimer ? `${safeContent}\n\n---\n\n> ${output.disclaimer}` : safeContent,
      contentType: "markdown",
      note: "初版",
      createdAt: nowIso(),
      createdBy: userId,
    });

    await emitTaskEvent(store, {
      organizationId,
      taskId: task.id,
      runId: run.id,
      type: "artifact_created",
      message: `成果物「${artifact.title}」を作成しました`,
      employeeId: employee.id,
      nodeKey: "artifact",
      payload: { artifactId: artifact.id },
    });

    // 社員個別メモリへ記録
    await rememberMemory(store, {
      organizationId,
      scope: "employee",
      scopeRefId: employee.id,
      employeeId: employee.id,
      title: `${task.title} の要点`,
      content: output.summary,
      source: `task:${task.id}`,
      createdBy: userId,
    });

    // ── 15. 使用量を確定 ─────────────────────────────
    await store.insert("model_usage", {
      id: newId(),
      organizationId,
      taskId: task.id,
      employeeId: employee.id,
      logicalModel: route.logicalModel,
      physicalModel: String(llmResult.providerMetadata.model ?? route.logicalModel),
      inputTokens: llmResult.usage.inputTokens ?? 0,
      outputTokens: llmResult.usage.outputTokens ?? 0,
      costJpy: llmResult.cost.costJpy,
      workTokens: llmResult.cost.workTokens,
      idempotencyKey: `${run.idempotencyKey}:usage`,
      createdAt: nowIso(),
    });

    await settle(store, organizationId, reservation.id, llmResult.cost.workTokens);
    await store.update("tasks", organizationId, task.id, {
      usedWorkTokens: llmResult.cost.workTokens,
      status: "awaiting_approval",
    });
    await store.update("employee_instances", organizationId, employee.id, {
      status: "awaiting_approval",
    });

    await store.update("task_runs", organizationId, run.id, {
      status: "succeeded",
      finishedAt: nowIso(),
    });

    await emitTaskEvent(store, {
      organizationId,
      taskId: task.id,
      runId: run.id,
      type: "approval_requested",
      message: "成果物の確認をお願いします",
      employeeId: employee.id,
      nodeKey: "approval",
      payload: { artifactId: artifact.id },
    });

    // ── 16. 通知 ─────────────────────────────────────
    await notify(store, {
      organizationId,
      userId,
      kind: "artifact_ready",
      title: `${employee.name}が${artifact.title}を完成しました`,
      body: artifact.summary,
      linkArtifactId: artifact.id,
      linkTaskId: task.id,
    });

    await recordAudit(store, {
      organizationId,
      actorUserId: userId,
      actorEmployeeId: employee.id,
      type: "model_used",
      target: task.id,
      detail: { logicalModel: route.logicalModel, workTokens: llmResult.cost.workTokens },
    });
  } catch (error) {
    const message = error instanceof Error ? error.message : "不明なエラー";
    if (reservationId) {
      // 失敗時は未使用分を解放する
      await release(store, organizationId, reservationId, `実行失敗: ${message}`).catch(() => undefined);
    }
    await store
      .update("task_runs", organizationId, run.id, {
        status: message === "cancelled" ? "cancelled" : "failed",
        finishedAt: nowIso(),
        error: message,
      })
      .catch(() => undefined);
    await store
      .update("tasks", organizationId, task.id, {
        status: message === "cancelled" ? "queued" : "blocked",
      })
      .catch(() => undefined);
    await emitTaskEvent(store, {
      organizationId,
      taskId: task.id,
      runId: run.id,
      type: message === "cancelled" ? "cancelled" : "failed",
      message:
        error instanceof SafetyBlockedError
          ? error.message
          : message === "cancelled"
            ? "実行を中断しました"
            : "実行中にエラーが発生しました",
      employeeId: run.employeeId,
    }).catch(() => undefined);

    if (!(error instanceof InsufficientCreditsError)) {
      await notify(store, {
        organizationId,
        userId,
        kind: "task_failed",
        title: "タスクが完了しませんでした",
        body: error instanceof SafetyBlockedError ? error.message : "実行中に問題が発生しました。",
        linkTaskId: task.id,
      }).catch(() => undefined);
    }
  } finally {
    activeRuns.delete(run.id);
    if (run.employeeId) {
      await store.releaseEmployee(organizationId, run.employeeId, task.id).catch(() => undefined);
      await startNextQueuedTask(store, organizationId, run.employeeId).catch(() => undefined);
    }
  }
}

export class SafetyBlockedError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "SafetyBlockedError";
  }
}
