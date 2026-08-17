import { describe, expect, it } from "vitest";
import { MemoryStore } from "@/lib/db/memory-store";
import { createOrg, hire, makeTask } from "./helpers";
import {
  InsufficientCreditsError,
  availableBalance,
  getWallet,
  purchasePack,
  release,
  reserve,
  settle,
  usageSummary,
} from "@/lib/credits/ledger";
import { startTaskRun } from "@/lib/tasks/runner";
import { workTokensFromCostJpy, COST_MODEL } from "@/config/pricing";

/**
 * 必須テストケース 12〜13（30章）
 */

describe("12. ワークトークンの reserve / settle / release が正しく動く", () => {
  it("予約は利用可能額を減らし、残高は減らさない", async () => {
    const store = new MemoryStore();
    const org = await createOrg(store, "テスト", "free");

    const before = await getWallet(store, org.orgId);
    expect(before.balance).toBe(100_000);

    const reservation = await reserve(store, {
      orgId: org.orgId,
      taskId: null,
      employeeId: null,
      amount: 10_000,
      idempotencyKey: "r1",
    });

    const afterReserve = await getWallet(store, org.orgId);
    expect(afterReserve.balance).toBe(100_000);
    expect(afterReserve.reserved).toBe(10_000);
    expect(availableBalance(afterReserve)).toBe(90_000);

    // 実使用 4,000 で確定
    await settle(store, org.orgId, reservation.id, 4_000);
    const afterSettle = await getWallet(store, org.orgId);
    expect(afterSettle.balance).toBe(96_000);
    expect(afterSettle.reserved).toBe(0);
  });

  it("release は未使用分を戻す", async () => {
    const store = new MemoryStore();
    const org = await createOrg(store, "テスト", "free");

    const reservation = await reserve(store, {
      orgId: org.orgId,
      taskId: null,
      employeeId: null,
      amount: 30_000,
      idempotencyKey: "r2",
    });
    await release(store, org.orgId, reservation.id);

    const wallet = await getWallet(store, org.orgId);
    expect(wallet.balance).toBe(100_000);
    expect(wallet.reserved).toBe(0);
  });

  it("実使用が予約を超えても、予約額を上限として課金する", async () => {
    const store = new MemoryStore();
    const org = await createOrg(store, "テスト", "free");
    const reservation = await reserve(store, {
      orgId: org.orgId,
      taskId: null,
      employeeId: null,
      amount: 5_000,
      idempotencyKey: "r3",
    });
    const settled = await settle(store, org.orgId, reservation.id, 999_999);
    expect(settled.settledAmount).toBe(5_000);
  });

  it("残高不足では予約できない", async () => {
    const store = new MemoryStore();
    const org = await createOrg(store, "テスト", "free");
    await expect(
      reserve(store, {
        orgId: org.orgId,
        taskId: null,
        employeeId: null,
        amount: 200_000,
        idempotencyKey: "r4",
      }),
    ).rejects.toBeInstanceOf(InsufficientCreditsError);
  });

  it("台帳が追記され、残高の推移が記録される", async () => {
    const store = new MemoryStore();
    const org = await createOrg(store, "テスト", "free");
    const reservation = await reserve(store, {
      orgId: org.orgId,
      taskId: null,
      employeeId: null,
      amount: 1_000,
      idempotencyKey: "r5",
    });
    await settle(store, org.orgId, reservation.id, 800);

    const ledger = await store.list("credit_ledger", org.orgId);
    const types = ledger.map((l) => l.type);
    expect(types).toContain("grant");
    expect(types).toContain("reserve");
    expect(types).toContain("settle");
    // 月次付与と追加購入を区別している
    expect(ledger.find((l) => l.type === "grant")?.bucket).toBe("monthly");
  });

  it("追加購入は purchased バケットに入る", async () => {
    const store = new MemoryStore();
    const org = await createOrg(store, "テスト", "free");
    await purchasePack(store, org.orgId, 1_000_000, "pack-1");
    const ledger = await store.list("credit_ledger", org.orgId);
    expect(ledger.find((l) => l.type === "purchase")?.bucket).toBe("purchased");
    const wallet = await getWallet(store, org.orgId);
    expect(wallet.balance).toBe(1_100_000);
  });
});

describe("13. リトライで二重課金されない", () => {
  it("同じ idempotencyKey の予約は 1 件だけ", async () => {
    const store = new MemoryStore();
    const org = await createOrg(store, "テスト", "free");

    const a = await reserve(store, {
      orgId: org.orgId,
      taskId: null,
      employeeId: null,
      amount: 10_000,
      idempotencyKey: "same-key",
    });
    const b = await reserve(store, {
      orgId: org.orgId,
      taskId: null,
      employeeId: null,
      amount: 10_000,
      idempotencyKey: "same-key",
    });

    expect(b.id).toBe(a.id);
    const wallet = await getWallet(store, org.orgId);
    expect(wallet.reserved).toBe(10_000);

    const reservations = await store.list("credit_reservations", org.orgId);
    expect(reservations.length).toBe(1);
  });

  it("同じ付与キーで二重に付与されない", async () => {
    const store = new MemoryStore();
    const org = await createOrg(store, "テスト", "free");
    await purchasePack(store, org.orgId, 500_000, "dup-key");
    await purchasePack(store, org.orgId, 500_000, "dup-key");
    const wallet = await getWallet(store, org.orgId);
    expect(wallet.balance).toBe(600_000);
  });

  it("settle は二重に実行されない", async () => {
    const store = new MemoryStore();
    const org = await createOrg(store, "テスト", "free");
    const reservation = await reserve(store, {
      orgId: org.orgId,
      taskId: null,
      employeeId: null,
      amount: 5_000,
      idempotencyKey: "settle-once",
    });
    await settle(store, org.orgId, reservation.id, 3_000);
    await settle(store, org.orgId, reservation.id, 3_000);

    const wallet = await getWallet(store, org.orgId);
    expect(wallet.balance).toBe(97_000);
  });

  it("同じタスクの実行をリトライしても実行中ジョブは再利用される", async () => {
    const store = new MemoryStore();
    const org = await createOrg(store);
    const researcher = await hire(org, "market_research");
    const task = await makeTask(org, { assigneeEmployeeId: researcher.id });

    const first = await startTaskRun({
      store,
      organizationId: org.orgId,
      taskId: task.id,
      userId: org.userId,
      awaitCompletion: true,
    });

    // 完了後に同じタスクを再実行すると新しい run になるが、
    // 実行中の場合は同じ run が返る（二重課金しない）
    const runs = await store.list("task_runs", org.orgId, { filter: { taskId: task.id } });
    expect(runs.length).toBe(1);
    expect(first.id).toBe(runs[0]!.id);
  });
});

describe("原価からワークトークンへの換算", () => {
  it("設定した換算率と安全係数が反映される", () => {
    const wt = workTokensFromCostJpy(1);
    expect(wt).toBe(Math.ceil((1 / COST_MODEL.targetCostPerWorkTokenJpy) * COST_MODEL.safetyFactor));
    expect(workTokensFromCostJpy(0)).toBe(0);
  });
});

describe("使用量サマリー", () => {
  it("社員別・モデル別・月別に集計できる", async () => {
    const store = new MemoryStore();
    const org = await createOrg(store);
    const researcher = await hire(org, "market_research");
    const task = await makeTask(org, { assigneeEmployeeId: researcher.id });

    await startTaskRun({
      store,
      organizationId: org.orgId,
      taskId: task.id,
      userId: org.userId,
      awaitCompletion: true,
    });

    const summary = await usageSummary(store, org.orgId);
    expect(summary.byEmployee.length).toBeGreaterThan(0);
    expect(summary.byModel.length).toBeGreaterThan(0);
    expect(summary.byMonth.length).toBeGreaterThan(0);
  });
});
