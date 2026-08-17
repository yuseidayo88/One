import { describe, expect, it } from "vitest";
import { buildFeed, countActionable } from "@/lib/views/feed";
import type {
  Approval,
  Artifact,
  EmployeeInstance,
  Task,
  TaskEvent,
} from "@/lib/core/types";

/**
 * 今日のフィード。
 * 成果物・承認・引き継ぎ・提案を 1 本に集約し、
 * 対応が必要なものが先頭へ来ることを検証する。
 */

const employee: EmployeeInstance = {
  id: "emp-1",
  organizationId: "org-1",
  roleKey: "market_research",
  name: "市場調査",
  specialty: "国内",
  status: "awaiting_approval",
  currentTaskId: null,
  avatarSeed: "seed",
  hiredAt: "2026-08-17T00:00:00.000Z",
  createdAt: "2026-08-17T00:00:00.000Z",
  updatedAt: "2026-08-17T00:00:00.000Z",
  createdBy: "user-1",
};

const task: Task = {
  id: "task-1",
  organizationId: "org-1",
  projectId: null,
  title: "市場・競合調査",
  description: "",
  status: "awaiting_approval",
  priority: "normal",
  assigneeEmployeeId: "emp-1",
  requiredCapabilities: [],
  dueDate: null,
  tools: [],
  estimatedWorkTokens: 9000,
  usedWorkTokens: 7420,
  safetyLevel: "GREEN",
  parentTaskId: null,
  createdAt: "2026-08-17T00:00:00.000Z",
  updatedAt: "2026-08-17T00:00:00.000Z",
  createdBy: "user-1",
};

const artifact: Artifact = {
  id: "art-1",
  organizationId: "org-1",
  projectId: null,
  taskId: "task-1",
  employeeId: "emp-1",
  type: "research_report",
  title: "市場調査レポート",
  summary: "調査が完了しました",
  currentVersion: 1,
  status: "review",
  citations: [],
  usedWorkTokens: 7420,
  createdAt: "2026-08-17T01:00:00.000Z",
  updatedAt: "2026-08-17T01:00:00.000Z",
  createdBy: "user-1",
};

const approval: Approval = {
  id: "apr-1",
  organizationId: "org-1",
  action: "publish_production",
  taskId: "task-1",
  artifactId: null,
  employeeId: "emp-1",
  title: "プレビュー環境の公開",
  what: "限定URLで公開します",
  affects: "",
  service: "",
  destination: "",
  diff: "",
  estimatedCostJpy: 0,
  estimatedWorkTokens: 0,
  reversible: true,
  risk: "",
  status: "pending",
  decidedBy: null,
  decidedAt: null,
  expiresAt: "2026-08-18T00:00:00.000Z",
  createdAt: "2026-08-17T00:30:00.000Z",
  createdBy: "user-1",
};

const events: TaskEvent[] = [
  {
    id: "ev-1",
    organizationId: "org-1",
    taskId: "task-1",
    runId: null,
    type: "handoff",
    message: "市場調査からマーケティングへ引き継ぎました",
    employeeId: "emp-1",
    nodeKey: "handoff",
    payload: {},
    createdAt: "2026-08-17T00:10:00.000Z",
  },
  {
    id: "ev-2",
    organizationId: "org-1",
    taskId: "task-1",
    runId: null,
    type: "step",
    message: "分析",
    employeeId: "emp-1",
    nodeKey: "analysis",
    payload: {},
    createdAt: "2026-08-17T00:05:00.000Z",
  },
];

function build() {
  return buildFeed({
    employees: [employee],
    tasks: [task],
    artifacts: [artifact],
    approvals: [approval],
    notifications: [],
    events,
    suggestions: [{ title: "次はマーケティング戦略", reason: "調査が完了したため" }],
  });
}

describe("今日のフィード", () => {
  it("成果物・承認・引き継ぎ・提案を1本に集約する", () => {
    const feed = build();
    const kinds = feed.map((i) => i.kind);
    expect(kinds).toContain("approval_required");
    expect(kinds).toContain("artifact_ready");
    expect(kinds).toContain("handoff");
    expect(kinds).toContain("suggestion");
  });

  it("対応が必要なものが先頭へ来る", () => {
    const feed = build();
    const firstNonActionable = feed.findIndex((i) => !i.actionable);
    const lastActionable = feed.map((i) => i.actionable).lastIndexOf(true);
    expect(lastActionable).toBeLessThan(firstNonActionable === -1 ? feed.length : firstNonActionable);
    expect(countActionable(feed)).toBeGreaterThan(0);
  });

  it("細かすぎる step イベントは載せない", () => {
    const feed = build();
    expect(feed.some((i) => i.title === "分析")).toBe(false);
  });

  it("社員名とタスク名を解決する", () => {
    const feed = build();
    const handoff = feed.find((i) => i.kind === "handoff");
    expect(handoff?.employeeName).toBe("市場調査");
    expect(handoff?.body).toBe("市場・競合調査");
  });

  it("承認済みの成果物は対応不要になる", () => {
    const feed = buildFeed({
      employees: [employee],
      tasks: [task],
      artifacts: [{ ...artifact, status: "approved" }],
      approvals: [],
      notifications: [],
      events: [],
      suggestions: [],
    });
    expect(feed.find((i) => i.kind === "artifact_ready")?.actionable).toBe(false);
  });
});
