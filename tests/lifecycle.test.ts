import { describe, expect, it } from "vitest";
import { MemoryStore } from "@/lib/db/memory-store";
import { createOrg, hire, makeTask } from "./helpers";
import { startTaskRun, cancelAllRuns } from "@/lib/tasks/runner";
import {
  emergencyStopAll,
  transitionTask,
  canTransition,
  startNextQueuedTask,
} from "@/lib/tasks/service";
import { routeModel } from "@/lib/models/router";

/**
 * 必須テストケース 16〜18（30章）+ モデルルーティング
 */

describe("16. 成果物完成時に通知され、「確認する」で開ける", () => {
  it("タスク完了で成果物・通知・承認要求が作られる", async () => {
    const store = new MemoryStore();
    const org = await createOrg(store);
    const researcher = await hire(org, "market_research");
    const task = await makeTask(org, {
      title: "市場・競合調査",
      assigneeEmployeeId: researcher.id,
      estimatedWorkTokens: 9000,
    });

    await startTaskRun({
      store,
      organizationId: org.orgId,
      taskId: task.id,
      userId: org.userId,
      awaitCompletion: true,
    });

    const artifacts = await store.list("artifacts", org.orgId);
    expect(artifacts.length).toBe(1);
    expect(artifacts[0]!.employeeId).toBe(researcher.id);

    // 本文（バージョン）が保存されている
    const versions = await store.list("artifact_versions", org.orgId, {
      filter: { artifactId: artifacts[0]!.id },
    });
    expect(versions.length).toBe(1);
    expect(versions[0]!.content.length).toBeGreaterThan(100);
    // 市場調査は確認日・情報源・事実/推測の区別を含む
    expect(versions[0]!.content).toContain("確認日");
    expect(versions[0]!.content).toContain("推測");

    // 通知に「確認する」で開くための artifactId が入っている
    const notifications = await store.list("notifications", org.orgId);
    const ready = notifications.find((n) => n.kind === "artifact_ready");
    expect(ready).toBeDefined();
    expect(ready!.linkArtifactId).toBe(artifacts[0]!.id);
    expect(ready!.title).toContain("完成");

    // 完了ではなく承認待ちで止まる
    const updated = await store.get("tasks", org.orgId, task.id);
    expect(updated?.status).toBe("awaiting_approval");
  });

  it("法務の成果物には専門家確認の注意書きが入る", async () => {
    const store = new MemoryStore();
    const org = await createOrg(store);
    const legal = await hire(org, "legal");
    const task = await makeTask(org, { title: "法務調査", assigneeEmployeeId: legal.id });

    await startTaskRun({
      store,
      organizationId: org.orgId,
      taskId: task.id,
      userId: org.userId,
      awaitCompletion: true,
    });

    const artifacts = await store.list("artifacts", org.orgId);
    const versions = await store.list("artifact_versions", org.orgId, {
      filter: { artifactId: artifacts[0]!.id },
    });
    expect(versions[0]!.content).toContain("法的助言ではありません");
    expect(versions[0]!.content).toContain("専門家");
  });
});

describe("17. タスクイベントと進捗アニメーションが同期する", () => {
  it("実行の各段階が task_events として記録される", async () => {
    const store = new MemoryStore();
    const org = await createOrg(store);
    const engineer = await hire(org, "engineer");
    const task = await makeTask(org, { title: "実装", assigneeEmployeeId: engineer.id });

    await startTaskRun({
      store,
      organizationId: org.orgId,
      taskId: task.id,
      userId: org.userId,
      awaitCompletion: true,
    });

    const events = await store.list("task_events", org.orgId, {
      filter: { taskId: task.id },
      orderBy: "createdAt",
      direction: "asc",
    });

    const types = events.map((e) => e.type);
    expect(types).toContain("started");
    expect(types).toContain("step");
    expect(types).toContain("artifact_created");
    expect(types).toContain("approval_requested");

    // フロー可視化に使う nodeKey が付与されている
    const nodeKeys = events.map((e) => e.nodeKey).filter(Boolean);
    expect(nodeKeys).toContain("start");
    expect(nodeKeys).toContain("context");
    expect(nodeKeys).toContain("analysis");
    expect(nodeKeys).toContain("artifact");
    expect(nodeKeys).toContain("approval");

    // すべてのイベントが実行(run)に紐づく
    const runs = await store.list("task_runs", org.orgId, { filter: { taskId: task.id } });
    expect(runs[0]!.status).toBe("succeeded");
    expect(events.filter((e) => e.runId === runs[0]!.id).length).toBeGreaterThan(0);
  });

  it("状態遷移は検証され、不正な遷移は拒否される", async () => {
    expect(canTransition("todo", "running")).toBe(true);
    expect(canTransition("done", "running")).toBe(false);
    expect(canTransition("idea", "running")).toBe(false);

    const store = new MemoryStore();
    const org = await createOrg(store);
    const task = await makeTask(org, { status: "done" });

    const result = await transitionTask(store, org.orgId, task.id, "running", org.userId);
    expect(result.ok).toBe(false);
    expect(result.reason).toContain("変更できません");
  });

  it("依存タスクが未完了なら実行へ進めない", async () => {
    const store = new MemoryStore();
    const org = await createOrg(store);
    const engineer = await hire(org, "engineer");
    const upstream = await makeTask(org, { title: "先行タスク" });
    const downstream = await makeTask(org, {
      title: "後続タスク",
      assigneeEmployeeId: engineer.id,
    });

    await store.insert("task_dependencies", {
      id: "dep-1",
      organizationId: org.orgId,
      taskId: downstream.id,
      dependsOnTaskId: upstream.id,
    });

    const result = await transitionTask(store, org.orgId, downstream.id, "running", org.userId);
    expect(result.ok).toBe(false);
    expect(result.reason).toContain("完了していません");
  });

  it("社員が空くと待機キューの先頭が開始される", async () => {
    const store = new MemoryStore();
    const org = await createOrg(store);
    const engineer = await hire(org, "engineer");

    const first = await makeTask(org, {
      title: "1件目",
      assigneeEmployeeId: engineer.id,
      status: "running",
    });
    await store.tryClaimEmployeeForTask(org.orgId, engineer.id, first.id);
    const queued = await makeTask(org, {
      title: "2件目",
      assigneeEmployeeId: engineer.id,
      status: "queued",
    });

    await transitionTask(store, org.orgId, first.id, "done", org.userId);

    const next = await store.get("tasks", org.orgId, queued.id);
    expect(next?.status).toBe("running");

    const started = await startNextQueuedTask(store, org.orgId, engineer.id);
    expect(started).toBeNull(); // もう待機はない
  });
});

describe("18. 全社員停止が実際のジョブへ反映される", () => {
  it("実行中タスクが中断され、社員が一時停止になる", async () => {
    const store = new MemoryStore();
    const org = await createOrg(store);
    const engineer = await hire(org, "engineer");
    const marketer = await hire(org, "marketing");

    const taskA = await makeTask(org, {
      title: "実装",
      assigneeEmployeeId: engineer.id,
      status: "running",
    });
    await store.tryClaimEmployeeForTask(org.orgId, engineer.id, taskA.id);

    await store.insert("task_runs", {
      id: "run-1",
      organizationId: org.orgId,
      taskId: taskA.id,
      employeeId: engineer.id,
      status: "running",
      idempotencyKey: "k",
      reservationId: null,
      startedAt: new Date().toISOString(),
      finishedAt: null,
      error: null,
      createdAt: new Date().toISOString(),
    });

    cancelAllRuns();
    const result = await emergencyStopAll(store, org.orgId, org.userId);

    expect(result.stoppedTasks).toBe(1);
    expect(result.pausedEmployees).toBeGreaterThanOrEqual(2);

    const run = await store.get("task_runs", org.orgId, "run-1");
    expect(run?.status).toBe("cancelled");

    const task = await store.get("tasks", org.orgId, taskA.id);
    expect(task?.status).toBe("queued");

    for (const id of [engineer.id, marketer.id]) {
      const employee = await store.get("employee_instances", org.orgId, id);
      expect(employee?.status).toBe("paused");
      expect(employee?.currentTaskId).toBeNull();
    }

    // 監査ログに残る
    const audits = await store.list("audit_events", org.orgId, {
      filter: { type: "emergency_stop" },
    });
    expect(audits.length).toBeGreaterThan(0);
  });
});

describe("モデルルーティング", () => {
  it("軽い処理は安価なモデル、重い処理は高品質モデルへ振り分ける", () => {
    const available = ["mock", "openai_fast", "anthropic_reasoning", "anthropic_coding"] as const;

    const light = routeModel({
      taskKind: "title_generation",
      estimatedInputTokens: 200,
      estimatedOutputTokens: 20,
      safetyLevel: "GREEN",
      availableModels: [...available],
    });
    expect(light.logicalModel).toBe("openai_fast");

    const heavy = routeModel({
      taskKind: "coding",
      estimatedInputTokens: 50_000,
      estimatedOutputTokens: 5_000,
      safetyLevel: "GREEN",
      availableModels: [...available],
    });
    expect(heavy.logicalModel).toBe("anthropic_coding");
  });

  it("安全性が高い場合は軽量モデルへ降格しない", () => {
    const decision = routeModel({
      taskKind: "safety_triage",
      estimatedInputTokens: 1_000,
      estimatedOutputTokens: 200,
      safetyLevel: "ORANGE",
      availableModels: ["mock", "openai_fast", "anthropic_reasoning"],
    });
    expect(decision.logicalModel).toBe("anthropic_reasoning");
  });

  it("キー未設定時は勝手に高額モデルへ切り替えず mock へ落ちる", () => {
    const decision = routeModel({
      taskKind: "coding",
      estimatedInputTokens: 1_000,
      estimatedOutputTokens: 500,
      safetyLevel: "GREEN",
      availableModels: ["mock"],
    });
    expect(decision.logicalModel).toBe("mock");
    expect(decision.estimatedWorkTokens).toBe(0);
  });

  it("MODEL_ROUTING_CONFIG で上書きできる", () => {
    const decision = routeModel(
      {
        taskKind: "title_generation",
        estimatedInputTokens: 100,
        estimatedOutputTokens: 20,
        safetyLevel: "GREEN",
        availableModels: ["mock", "openai_fast", "anthropic_reasoning"],
      },
      JSON.stringify({ title_generation: "anthropic_reasoning" }),
    );
    expect(decision.logicalModel).toBe("anthropic_reasoning");
    expect(decision.reason).toContain("上書き");
  });
});
