import { describe, expect, it } from "vitest";
import { MemoryStore } from "@/lib/db/memory-store";
import { createOrg, hire, makeTask } from "./helpers";
import { executeDecision, planFromRequest } from "@/lib/orchestrator/workflow";
import { proposeHandoff } from "@/lib/tasks/service";
import { startTaskRun, EmployeeBusyError } from "@/lib/tasks/runner";

/**
 * 必須テストケース 1〜6（30章）
 */

describe("1. 新規ユーザーが事業案を入力し、社員提案を受け、選択して採用できる", () => {
  it("提案から採用・タスク作成まで通る", async () => {
    const store = new MemoryStore();
    const org = await createOrg(store);

    const plan = await planFromRequest({
      store,
      organizationId: org.orgId,
      userId: org.userId,
      conversationId: org.conversationId,
      requestText: "美容室向けの予約SaaSを作りたい。まず市場を調査してほしい。",
      isOnboarding: true,
    });

    expect(plan.blocked).toBe(false);
    expect(plan.plan.proposedTasks.length).toBeGreaterThan(0);
    expect(plan.options.length).toBeGreaterThan(0);
    // 在籍していない職種は採用提案になる
    expect(plan.options.some((o) => o.kind === "hire")).toBe(true);

    const result = await executeDecision({
      store,
      organizationId: org.orgId,
      userId: org.userId,
      decisionId: plan.decision.id,
      selectedOptionIds: plan.options.map((o) => o.id),
    });

    expect(result.hiredEmployees.length).toBeGreaterThan(0);
    expect(result.createdTasks.length).toBeGreaterThan(0);

    const employees = await store.list("employee_instances", org.orgId);
    expect(employees.some((e) => e.roleKey === "market_research")).toBe(true);
  });
});

describe("2. 統括AIが混合依頼を複数タスクへ分解できる", () => {
  it("調査・LP・実装・法務が別タスクになる", async () => {
    const store = new MemoryStore();
    const org = await createOrg(store);

    const plan = await planFromRequest({
      store,
      organizationId: org.orgId,
      userId: org.userId,
      conversationId: org.conversationId,
      requestText: "市場を調査して、LPをデザインして、実装して、法的な確認もして、営業もしてほしい",
    });

    const roles = plan.plan.proposedTasks.map((t) => t.suggestedRole);
    expect(roles).toContain("market_research");
    expect(roles).toContain("designer");
    expect(roles).toContain("engineer");
    expect(roles).toContain("legal");
    expect(roles).toContain("sales");
    expect(plan.plan.proposedTasks.length).toBeGreaterThanOrEqual(5);

    // 依存関係が設定されている
    expect(plan.plan.dependencies.length).toBeGreaterThan(0);
  });
});

describe("3. 営業社員へプログラミングを依頼すると、実行せずプログラマーへ引き継ぐ", () => {
  it("担当外は分解され、引き継ぎ案が返る", async () => {
    const store = new MemoryStore();
    const org = await createOrg(store);
    const sales = await hire(org, "sales");
    await hire(org, "engineer");

    const proposal = await proposeHandoff(
      store,
      org.orgId,
      sales.id,
      "LPを実装して、法的問題を確認して、営業もして",
    );

    // 自分の担当部分だけを特定している
    expect(proposal.ownWork.length).toBeGreaterThan(0);
    // 担当外は引き継ぎ提案になる
    const targets = proposal.handoffs.map((h) => h.toRole);
    expect(targets).toContain("engineer");
    expect(targets).toContain("legal");
    expect(proposal.message).toContain("引き継ぎ");

    // 営業社員自身がコードを書くタスクは作られていない
    const tasks = await store.list("tasks", org.orgId);
    expect(tasks.length).toBe(0);
  });

  it("引き継ぎ提案には人数が表示される", async () => {
    const store = new MemoryStore();
    const org = await createOrg(store);
    const sales = await hire(org, "sales");

    const plan = await planFromRequest({
      store,
      organizationId: org.orgId,
      userId: org.userId,
      conversationId: org.conversationId,
      requestText: "LPをデザインして実装して、法的問題も確認して、営業もして",
      requesterEmployeeId: sales.id,
    });

    expect(plan.plan.handoffs.length).toBeGreaterThanOrEqual(3);
    expect(plan.plan.summary).toMatch(/引き継ぎを提案/);
  });
});

describe("4. 該当社員がいない場合は採用を提案する", () => {
  it("在籍していない職種は hire になる", async () => {
    const store = new MemoryStore();
    const org = await createOrg(store);

    const plan = await planFromRequest({
      store,
      organizationId: org.orgId,
      userId: org.userId,
      conversationId: org.conversationId,
      requestText: "法的な確認をしてほしい",
    });

    const hireOptions = plan.options.filter((o) => o.kind === "hire");
    expect(hireOptions.length).toBeGreaterThan(0);
    expect(hireOptions.some((o) => o.roleKey === "legal")).toBe(true);
    expect(plan.plan.hiringRequired).toBe(true);
  });
});

describe("5. 営業社員が稼働中の場合、キューまたは追加の営業社員採用を提案する", () => {
  it("待機と追加採用の両方が選択肢に出る", async () => {
    const store = new MemoryStore();
    const org = await createOrg(store);
    const sales = await hire(org, "sales");

    const task = await makeTask(org, {
      title: "既存の営業タスク",
      assigneeEmployeeId: sales.id,
      status: "running",
    });
    await store.update("employee_instances", org.orgId, sales.id, {
      status: "working",
      currentTaskId: task.id,
    });

    const plan = await planFromRequest({
      store,
      organizationId: org.orgId,
      userId: org.userId,
      conversationId: org.conversationId,
      requestText: "新しい営業リストを作ってほしい",
    });

    const kinds = plan.options.map((o) => o.kind);
    expect(kinds).toContain("queue");
    expect(kinds).toContain("hire");
  });
});

describe("6. 同じ社員に running タスクを2件作れない", () => {
  it("2件目は EmployeeBusyError になり、キューへ入る", async () => {
    const store = new MemoryStore();
    const org = await createOrg(store);
    const engineer = await hire(org, "engineer");

    const first = await makeTask(org, {
      title: "1件目",
      assigneeEmployeeId: engineer.id,
      status: "running",
    });
    const claimed = await store.tryClaimEmployeeForTask(org.orgId, engineer.id, first.id);
    expect(claimed).toBe(true);

    const second = await makeTask(org, { title: "2件目", assigneeEmployeeId: engineer.id });

    await expect(
      startTaskRun({ store, organizationId: org.orgId, taskId: second.id, userId: org.userId }),
    ).rejects.toBeInstanceOf(EmployeeBusyError);

    const updated = await store.get("tasks", org.orgId, second.id);
    expect(updated?.status).toBe("queued");

    const running = (await store.list("tasks", org.orgId, { filter: { status: "running" } })).filter(
      (t) => t.assigneeEmployeeId === engineer.id,
    );
    expect(running.length).toBe(1);
  });

  it("store レベルでも二重確保できない", async () => {
    const store = new MemoryStore();
    const org = await createOrg(store);
    const engineer = await hire(org, "engineer");

    const a = await makeTask(org, { assigneeEmployeeId: engineer.id, status: "running" });
    const b = await makeTask(org, { assigneeEmployeeId: engineer.id });

    expect(await store.tryClaimEmployeeForTask(org.orgId, engineer.id, a.id)).toBe(true);
    expect(await store.tryClaimEmployeeForTask(org.orgId, engineer.id, b.id)).toBe(false);
  });
});
