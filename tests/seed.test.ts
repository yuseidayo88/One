import { describe, expect, it } from "vitest";
import { MemoryStore } from "@/lib/db/memory-store";
import { seedDemoOrganization } from "@/lib/db/seed";

/**
 * デモデータの健全性。
 *
 * 回帰防止: ID を決定論化した際、ループ内で同じラベルを使うと
 * 各反復が同じ ID になり、行が上書きされて 1 件に潰れる。
 * 件数を検証してこれを検出する。
 */

async function seed() {
  const store = new MemoryStore();
  const { orgId } = await seedDemoOrganization(store);
  return { store, orgId };
}

describe("デモデータ", () => {
  it("各テーブルへ意図した件数が投入される", async () => {
    const { store, orgId } = await seed();

    const expected: [Parameters<MemoryStore["list"]>[0], number][] = [
      ["employee_instances", 6],
      ["tasks", 5],
      ["task_dependencies", 3],
      ["messages", 3],
      ["task_events", 10],
      ["integrations", 6],
      ["memories", 2],
      ["artifacts", 1],
      ["artifact_versions", 1],
      ["approvals", 1],
      ["notifications", 2],
      ["credit_ledger", 2],
    ];

    for (const [table, count] of expected) {
      const rows = await store.list(table, orgId);
      expect(rows.length, `${table} の件数`).toBe(count);
    }
  });

  it("ID が重複しない", async () => {
    const { store, orgId } = await seed();
    for (const table of ["task_events", "integrations", "employee_instances", "tasks"] as const) {
      const rows = await store.list(table, orgId);
      const ids = rows.map((r) => r.id);
      expect(new Set(ids).size, `${table} の一意なID数`).toBe(ids.length);
    }
  });

  it("二度投入しても同じ ID になる（サーバーレス対応）", async () => {
    const a = await seed();
    const b = await seed();
    const idsOf = async (s: MemoryStore, orgId: string) =>
      (await s.list("employee_instances", orgId)).map((e) => e.id).sort();
    expect(await idsOf(a.store, a.orgId)).toEqual(await idsOf(b.store, b.orgId));
    expect(a.orgId).toBe(b.orgId);
  });

  it("デモ会社の状態が一通り揃っている", async () => {
    const { store, orgId } = await seed();
    const tasks = await store.list("tasks", orgId);
    const statuses = tasks.map((t) => t.status);
    // 稼働中 / 待機中 / 完了 / 未着手 / アイデア が確認できる
    expect(statuses).toContain("running");
    expect(statuses).toContain("queued");
    expect(statuses).toContain("done");
    expect(statuses).toContain("todo");
    expect(statuses).toContain("idea");

    const employees = await store.list("employee_instances", orgId);
    expect(employees.some((e) => e.status === "working")).toBe(true);
    expect(employees.some((e) => e.status === "awaiting_approval")).toBe(true);
  });
});
