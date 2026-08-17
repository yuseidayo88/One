import { describe, expect, it } from "vitest";
import { MemoryStore } from "@/lib/db/memory-store";
import { createOrg, hire, makeTask } from "./helpers";
import { newId, nowIso } from "@/lib/core/ids";
import { PROJECT_STATUSES, type ProjectStatus, type TaskEvent } from "@/lib/core/types";
import {
  canTransitionProject,
  hasWorkspace,
  orchestratorPlacement,
  PROJECT_STATUS_LABEL,
  showOrchestratorInCenter,
  showOrchestratorInRightPanel,
} from "@/lib/projects/status";
import {
  createProject,
  ensureDirectorConversation,
  setProjectStatus,
} from "@/lib/projects/service";
import { executeDecision, planFromRequest } from "@/lib/orchestrator/workflow";
import {
  MOTION_LEVELS,
  layoutAnimationEnabled,
  motionDuration,
  normalizeMotionLevel,
  particlesEnabled,
} from "@/lib/motion/level";
import { ORCHESTRATOR_TRANSITION, totalTransitionMs } from "@/lib/motion/transition";
import { buildProgressSeries } from "@/lib/views/progress";
import { clampPanelWidth, PANEL_MAX_WIDTH, PANEL_MIN_WIDTH } from "@/components/orchestrator/OrchestratorPanel";

/**
 * 画面構成の変更に対する必須テスト（1〜20）。
 *
 * 「見た目がそれらしいか」ではなく、位置を決める根拠と、
 * 会話・状態・保存が壊れないことを確かめる。
 */

async function makeProject(
  store: MemoryStore,
  orgId: string,
  userId: string,
  status: ProjectStatus = "draft",
) {
  const project = await createProject(store, orgId, userId, {
    name: "予約SaaSの立ち上げ",
    description: "最初の検証",
  });
  if (status === "draft") return project;
  return store.update("projects", orgId, project.id, { status });
}

function event(taskId: string, type: TaskEvent["type"], at: string): TaskEvent {
  return {
    id: newId(),
    organizationId: "org",
    taskId,
    runId: null,
    type,
    message: type,
    employeeId: null,
    nodeKey: null,
    payload: {},
    createdAt: at,
  };
}

describe("1. 開始前は統括AIが中央に居る", () => {
  it("draft / planning / ready は中央", () => {
    for (const status of ["draft", "planning", "ready"] as ProjectStatus[]) {
      expect(showOrchestratorInCenter(status)).toBe(true);
      expect(orchestratorPlacement(status)).toBe("center");
    }
  });
});

describe("2. 開始後は統括AIが右パネルに居る", () => {
  it("active / paused / completed は右", () => {
    for (const status of ["active", "paused", "completed"] as ProjectStatus[]) {
      expect(showOrchestratorInRightPanel(status)).toBe(true);
      expect(orchestratorPlacement(status)).toBe("right");
    }
  });
});

describe("3. 中央と右の両方に同時に出ない", () => {
  it("どの状態でも配置は 1 つだけ", () => {
    for (const status of PROJECT_STATUSES) {
      const center = showOrchestratorInCenter(status);
      const right = showOrchestratorInRightPanel(status);
      expect(center && right).toBe(false);
    }
    // 中止は「プロジェクトを閉じた状態」なのでどちらにも出さない
    expect(orchestratorPlacement("cancelled")).toBe("none");
  });
});

describe("4. 実務画面（タブ）は開始後だけ出る", () => {
  it("hasWorkspace は右パネル配置と一致する", () => {
    for (const status of PROJECT_STATUSES) {
      expect(hasWorkspace(status)).toBe(showOrchestratorInRightPanel(status));
    }
  });
});

describe("5. 状態はすべて日本語ラベルを持つ", () => {
  it("7 つの状態が抜けなく定義されている", () => {
    expect(PROJECT_STATUSES).toHaveLength(7);
    for (const status of PROJECT_STATUSES) {
      expect(PROJECT_STATUS_LABEL[status]).toBeTruthy();
    }
  });
});

describe("6. 許可されていない状態遷移はサーバーが拒否する", () => {
  it("下書きからいきなり進行中にはできない", async () => {
    const store = new MemoryStore();
    const org = await createOrg(store);
    const project = await makeProject(store, org.orgId, org.userId, "draft");

    expect(canTransitionProject("draft", "active")).toBe(false);
    const result = await setProjectStatus(store, org.orgId, project.id, "active");
    expect(result.ok).toBe(false);

    const after = await store.get("projects", org.orgId, project.id);
    expect(after?.status).toBe("draft");
  });

  it("進行中 → 一時停止 → 進行中 は通る", async () => {
    const store = new MemoryStore();
    const org = await createOrg(store);
    const project = await makeProject(store, org.orgId, org.userId, "active");

    expect((await setProjectStatus(store, org.orgId, project.id, "paused")).ok).toBe(true);
    expect((await setProjectStatus(store, org.orgId, project.id, "active")).ok).toBe(true);
    expect((await store.get("projects", org.orgId, project.id))?.status).toBe("active");
  });
});

describe("7. 「実行する」が通るとプロジェクトが進行中になる", () => {
  it("実行後は右パネル配置になる", async () => {
    const store = new MemoryStore();
    const org = await createOrg(store);
    const project = await makeProject(store, org.orgId, org.userId, "ready");
    expect(orchestratorPlacement(project.status)).toBe("center");

    const plan = await planFromRequest({
      store,
      organizationId: org.orgId,
      userId: org.userId,
      conversationId: org.conversationId,
      requestText: "美容室向け予約SaaSの市場を調査してほしい。",
      isOnboarding: true,
    });

    const result = await executeDecision({
      store,
      organizationId: org.orgId,
      userId: org.userId,
      decisionId: plan.decision.id,
      selectedOptionIds: plan.options.map((o) => o.id),
      projectId: project.id,
    });

    expect(result.activatedProjectId).toBe(project.id);
    const after = await store.get("projects", org.orgId, project.id);
    expect(after?.status).toBe("active");
    expect(orchestratorPlacement(after!.status)).toBe("right");
  });
});

describe("8. 実行に失敗したときは中央に留まる", () => {
  it("存在しない決定を実行してもプロジェクトは進行中にならない", async () => {
    const store = new MemoryStore();
    const org = await createOrg(store);
    const project = await makeProject(store, org.orgId, org.userId, "ready");

    await expect(
      executeDecision({
        store,
        organizationId: org.orgId,
        userId: org.userId,
        decisionId: newId(),
        selectedOptionIds: [newId()],
        projectId: project.id,
      }),
    ).rejects.toBeTruthy();

    const after = await store.get("projects", org.orgId, project.id);
    expect(after?.status).toBe("ready");
    expect(orchestratorPlacement(after!.status)).toBe("center");
  });
});

describe("9. 会話はプロジェクトごとに 1 本だけ作られる", () => {
  it("何度呼んでも同じ会話が返る", async () => {
    const store = new MemoryStore();
    const org = await createOrg(store);
    const project = await makeProject(store, org.orgId, org.userId);

    const first = await ensureDirectorConversation(store, org.orgId, project.id, org.userId);
    const second = await ensureDirectorConversation(store, org.orgId, project.id, org.userId);

    expect(second.id).toBe(first.id);
    const all = await store.list("conversations", org.orgId, {
      filter: { kind: "director", projectId: project.id },
    });
    expect(all).toHaveLength(1);
  });
});

describe("10. 中央から右へ移っても会話を作り直さない", () => {
  it("状態が変わっても conversationId と履歴は同じ", async () => {
    const store = new MemoryStore();
    const org = await createOrg(store);
    const project = await makeProject(store, org.orgId, org.userId, "ready");
    const conversation = await ensureDirectorConversation(
      store,
      org.orgId,
      project.id,
      org.userId,
    );

    await store.insert("messages", {
      id: newId(),
      organizationId: org.orgId,
      conversationId: conversation.id,
      author: "user",
      employeeId: null,
      content: "市場を調べてほしい",
      containsUntrustedData: false,
      createdAt: nowIso(),
    });

    await setProjectStatus(store, org.orgId, project.id, "active");

    const after = await ensureDirectorConversation(store, org.orgId, project.id, org.userId);
    expect(after.id).toBe(conversation.id);

    const messages = await store.list("messages", org.orgId, {
      filter: { conversationId: after.id },
    });
    expect(messages).toHaveLength(1);
    expect(messages[0]!.content).toBe("市場を調べてほしい");
  });
});

describe("11. 別プロジェクトの会話は混ざらない", () => {
  it("プロジェクトごとに別の会話になる", async () => {
    const store = new MemoryStore();
    const org = await createOrg(store);
    const a = await makeProject(store, org.orgId, org.userId);
    const b = await createProject(store, org.orgId, org.userId, {
      name: "2 件目",
      description: "",
    });

    const first = await ensureDirectorConversation(store, org.orgId, a.id, org.userId);
    const second = await ensureDirectorConversation(store, org.orgId, b.id, org.userId);
    expect(first.id).not.toBe(second.id);
  });
});

describe("12. トランジションは 450〜700ms に収まる", () => {
  it("合計時間が範囲内で、各段階がその中に収まる", () => {
    const total = totalTransitionMs();
    expect(total).toBeGreaterThanOrEqual(450);
    expect(total).toBeLessThanOrEqual(700);
    for (const phase of Object.values(ORCHESTRATOR_TRANSITION)) {
      expect(phase.delay + phase.duration).toBeLessThanOrEqual(total);
      expect(phase.duration).toBeGreaterThan(0);
    }
  });

  it("段階が途切れず連続する（先に始まったものが次より前にある）", () => {
    const { composerShrink, centerExpand, dockMove, panelOpen, graphDraw } =
      ORCHESTRATOR_TRANSITION;
    expect(composerShrink.delay).toBe(0);
    // 中央が広がり始める時点で、Composer の縮小は終わっている
    expect(centerExpand.delay).toBe(composerShrink.duration);
    // 移動中に右パネルが開き始める（消えてから現れる、にしない）
    expect(panelOpen.delay).toBeLessThan(dockMove.delay + dockMove.duration);
    expect(graphDraw.delay).toBeLessThan(panelOpen.delay + panelOpen.duration);
  });
});

describe("13. アニメーション設定は 標準 / 最小 / OFF の 3 段階", () => {
  it("3 段階だけを受け付け、未知の値は標準に落ちる", () => {
    expect(MOTION_LEVELS).toEqual(["standard", "minimal", "off"]);
    expect(normalizeMotionLevel("minimal")).toBe("minimal");
    expect(normalizeMotionLevel("off")).toBe("off");
    expect(normalizeMotionLevel("なにか")).toBe("standard");
    expect(normalizeMotionLevel(undefined)).toBe("standard");
  });
});

describe("14. 最小では位置を動かさず、OFF では止まる", () => {
  it("時間とレイアウトアニメーションの有無", () => {
    expect(motionDuration("standard", 560)).toBe(560);
    expect(motionDuration("minimal", 560)).toBe(120);
    expect(motionDuration("off", 560)).toBe(0);

    expect(layoutAnimationEnabled("standard")).toBe(true);
    expect(layoutAnimationEnabled("minimal")).toBe(false);
    expect(layoutAnimationEnabled("off")).toBe(false);

    expect(particlesEnabled("standard")).toBe(true);
    expect(particlesEnabled("off")).toBe(false);
  });
});

describe("15. 右パネルの幅は 360〜420px に収まる", () => {
  it("範囲外の保存値でも壊れない", () => {
    expect(clampPanelWidth(100)).toBe(PANEL_MIN_WIDTH);
    expect(clampPanelWidth(9999)).toBe(PANEL_MAX_WIDTH);
    expect(clampPanelWidth(390)).toBe(390);
    expect(clampPanelWidth(Number.NaN)).toBeGreaterThanOrEqual(PANEL_MIN_WIDTH);
    expect(clampPanelWidth(Number.NaN)).toBeLessThanOrEqual(PANEL_MAX_WIDTH);
  });
});

describe("16. 進捗グラフはイベントが無ければ線を描かない", () => {
  it("点を作らず、それらしい形を出さない", () => {
    const series = buildProgressSeries([], []);
    expect(series.points).toHaveLength(0);
    expect(series.ratio).toBe(0);
  });
});

describe("17. 進捗グラフは task_events の実データを反映する", () => {
  it("完了イベントの数だけ完了が増える", () => {
    const series = buildProgressSeries(
      [
        { id: "t1", status: "done" } as never,
        { id: "t2", status: "running" } as never,
      ],
      [
        event("t1", "started", "2026-08-17T00:00:00.000Z"),
        event("t2", "started", "2026-08-17T00:10:00.000Z"),
        event("t1", "completed", "2026-08-17T00:20:00.000Z"),
      ],
    );

    expect(series.totalTasks).toBe(2);
    expect(series.completedTasks).toBe(1);
    expect(series.points.length).toBeGreaterThan(0);
    expect(series.points[series.points.length - 1]!.completed).toBe(1);
    // t2 は started のまま。実行中として残る。
    expect(series.points[series.points.length - 1]!.running).toBe(1);
  });

  it("承認待ちと失敗の回数も実イベントから数える", () => {
    const series = buildProgressSeries(
      [{ id: "t1", status: "running" } as never],
      [
        event("t1", "started", "2026-08-17T00:00:00.000Z"),
        event("t1", "approval_requested", "2026-08-17T00:05:00.000Z"),
        event("t1", "failed", "2026-08-17T00:06:00.000Z"),
      ],
    );
    expect(series.approvalWaits).toBe(1);
    expect(series.failures).toBe(1);
  });
});

describe("18. プロジェクト作成は下書きから始まる", () => {
  it("作成直後は中央配置で、まだ何も実行されない", async () => {
    const store = new MemoryStore();
    const org = await createOrg(store);
    const project = await createProject(store, org.orgId, org.userId, {
      name: "新しい業務",
      description: "",
    });

    expect(project.status).toBe("draft");
    expect(orchestratorPlacement(project.status)).toBe("center");
    expect(hasWorkspace(project.status)).toBe(false);

    const tasks = await store.list("tasks", org.orgId);
    expect(tasks).toHaveLength(0);
  });

  it("下書き → 計画中 → 実行待ち と進める（実行するまで採用しない）", async () => {
    const store = new MemoryStore();
    const org = await createOrg(store);
    const project = await createProject(store, org.orgId, org.userId, {
      name: "新しい業務",
      description: "",
    });

    expect((await setProjectStatus(store, org.orgId, project.id, "planning")).ok).toBe(true);
    expect((await setProjectStatus(store, org.orgId, project.id, "ready")).ok).toBe(true);

    const after = await store.get("projects", org.orgId, project.id);
    expect(after?.status).toBe("ready");
    // 実行待ちでも統括AIはまだ中央に居る
    expect(orchestratorPlacement(after!.status)).toBe("center");
    expect(await store.list("employee_instances", org.orgId)).toHaveLength(1); // 統括AIのみ
  });
});

describe("19. プロジェクト画面は自分のタスクだけを扱う", () => {
  it("他プロジェクトのタスクは混ざらない", async () => {
    const store = new MemoryStore();
    const org = await createOrg(store);
    const a = await makeProject(store, org.orgId, org.userId, "active");
    const b = await createProject(store, org.orgId, org.userId, { name: "別件", description: "" });

    const employee = await hire(org, "market_research");
    const mine = await makeTask(org, {
      title: "A の調査",
      assigneeEmployeeId: employee.id,
    });
    const theirs = await makeTask(org, { title: "B の調査" });
    await store.update("tasks", org.orgId, mine.id, { projectId: a.id });
    await store.update("tasks", org.orgId, theirs.id, { projectId: b.id });

    const all = await store.list("tasks", org.orgId);
    const forA = all.filter((t) => t.projectId === a.id);
    expect(forA).toHaveLength(1);
    expect(forA[0]!.title).toBe("A の調査");
  });
});

describe("20. 完了したプロジェクトは相談を続けられる", () => {
  it("completed でも右パネルに統括AIが残り、再開もできる", async () => {
    const store = new MemoryStore();
    const org = await createOrg(store);
    const project = await makeProject(store, org.orgId, org.userId, "active");

    expect((await setProjectStatus(store, org.orgId, project.id, "completed")).ok).toBe(true);
    expect(orchestratorPlacement("completed")).toBe("right");
    expect((await setProjectStatus(store, org.orgId, project.id, "active")).ok).toBe(true);
  });
});
