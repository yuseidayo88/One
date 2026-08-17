import { GLOBAL_TABLES, ALL_TABLES, type TableMap, type TableName } from "@/lib/db/schema";
import type { Filter, ListOptions, Store } from "@/lib/db/store";

type Row = Record<string, unknown>;

function matches<T>(row: Row, filter?: Filter<T>): boolean {
  if (!filter) return true;
  for (const [key, expected] of Object.entries(filter)) {
    if (expected === undefined) continue;
    const actual = row[key];
    if (Array.isArray(expected)) {
      if (!expected.includes(actual as never)) return false;
    } else if (actual !== expected) {
      return false;
    }
  }
  return true;
}

/**
 * 開発・テスト用のインメモリ Store。
 *
 * 本番の RLS と同じ不変条件をアプリ層で再現する:
 *  - organization_id を持つテーブルは orgId 一致でのみ読み書きできる。
 *  - 他組織の ID を直接指定しても null を返す。
 */
export class MemoryStore implements Store {
  readonly kind = "memory" as const;

  private tables = new Map<TableName, Map<string, Row>>();
  private locks = new Map<string, Promise<unknown>>();

  constructor() {
    for (const t of ALL_TABLES) this.tables.set(t, new Map());
  }

  private table(name: TableName): Map<string, Row> {
    let t = this.tables.get(name);
    if (!t) {
      t = new Map();
      this.tables.set(name, t);
    }
    return t;
  }

  private isGlobal(name: TableName): boolean {
    return GLOBAL_TABLES.includes(name);
  }

  async insert<T extends TableName>(table: T, row: TableMap[T]): Promise<TableMap[T]> {
    const r = row as unknown as Row;
    const id = r.id as string;
    if (!id) throw new Error(`insert into ${table}: missing id`);
    if (!this.isGlobal(table) && !r.organizationId) {
      throw new Error(`insert into ${table}: missing organizationId`);
    }
    this.table(table).set(id, structuredClone(r));
    return structuredClone(r) as unknown as TableMap[T];
  }

  async get<T extends TableName>(table: T, orgId: string, id: string): Promise<TableMap[T] | null> {
    const row = this.table(table).get(id);
    if (!row) return null;
    // テナント境界: organizationId が一致しない行は存在しないものとして扱う
    if (!this.isGlobal(table) && row.organizationId !== orgId) return null;
    return structuredClone(row) as unknown as TableMap[T];
  }

  async list<T extends TableName>(
    table: T,
    orgId: string,
    options?: ListOptions<TableMap[T]>,
  ): Promise<TableMap[T][]> {
    const rows: Row[] = [];
    for (const row of this.table(table).values()) {
      if (!this.isGlobal(table) && row.organizationId !== orgId) continue;
      if (!matches(row, options?.filter)) continue;
      rows.push(row);
    }
    const orderBy = (options?.orderBy as string) ?? "createdAt";
    const dir = options?.direction ?? "asc";
    rows.sort((a, b) => {
      const av = a[orderBy];
      const bv = b[orderBy];
      if (av === bv) return 0;
      if (av === undefined || av === null) return 1;
      if (bv === undefined || bv === null) return -1;
      const cmp = av < bv ? -1 : 1;
      return dir === "asc" ? cmp : -cmp;
    });
    const limited = options?.limit ? rows.slice(0, options.limit) : rows;
    return limited.map((r) => structuredClone(r)) as unknown as TableMap[T][];
  }

  async update<T extends TableName>(
    table: T,
    orgId: string,
    id: string,
    patch: Partial<TableMap[T]>,
  ): Promise<TableMap[T]> {
    const row = this.table(table).get(id);
    if (!row || (!this.isGlobal(table) && row.organizationId !== orgId)) {
      throw new Error(`${table}/${id} not found in organization scope`);
    }
    const next = { ...row, ...(patch as Row) };
    if ("updatedAt" in row) next.updatedAt = new Date().toISOString();
    this.table(table).set(id, next);
    return structuredClone(next) as unknown as TableMap[T];
  }

  async remove<T extends TableName>(table: T, orgId: string, id: string): Promise<void> {
    const row = this.table(table).get(id);
    if (!row) return;
    if (!this.isGlobal(table) && row.organizationId !== orgId) return;
    this.table(table).delete(id);
  }

  async count<T extends TableName>(
    table: T,
    orgId: string,
    filter?: Filter<TableMap[T]>,
  ): Promise<number> {
    const rows = await this.list(table, orgId, { filter });
    return rows.length;
  }

  async getGlobal<T extends TableName>(table: T, id: string): Promise<TableMap[T] | null> {
    const row = this.table(table).get(id);
    return row ? (structuredClone(row) as unknown as TableMap[T]) : null;
  }

  async findGlobal<T extends TableName>(
    table: T,
    filter: Filter<TableMap[T]>,
  ): Promise<TableMap[T] | null> {
    for (const row of this.table(table).values()) {
      if (matches(row, filter)) return structuredClone(row) as unknown as TableMap[T];
    }
    return null;
  }

  async listGlobal<T extends TableName>(
    table: T,
    filter?: Filter<TableMap[T]>,
  ): Promise<TableMap[T][]> {
    const out: Row[] = [];
    for (const row of this.table(table).values()) {
      if (matches(row, filter)) out.push(structuredClone(row));
    }
    return out as unknown as TableMap[T][];
  }

  async updateGlobal<T extends TableName>(
    table: T,
    id: string,
    patch: Partial<TableMap[T]>,
  ): Promise<TableMap[T]> {
    const row = this.table(table).get(id);
    if (!row) throw new Error(`${table}/${id} not found`);
    const next = { ...row, ...(patch as Row) };
    if ("updatedAt" in row) next.updatedAt = new Date().toISOString();
    this.table(table).set(id, next);
    return structuredClone(next) as unknown as TableMap[T];
  }

  /**
   * 1社員1メインタスク制約。
   * DB 側の `unique (assignee_employee_id) where status = 'running'` と同じ意味。
   */
  async tryClaimEmployeeForTask(orgId: string, employeeId: string, taskId: string): Promise<boolean> {
    return this.withOrgLock(orgId, async () => {
      const employees = this.table("employee_instances");
      const emp = employees.get(employeeId);
      if (!emp || emp.organizationId !== orgId) return false;

      // 既に別タスクを保持している場合は失敗
      if (emp.currentTaskId && emp.currentTaskId !== taskId) return false;

      // running のメインタスクが既にある場合も失敗
      for (const t of this.table("tasks").values()) {
        if (t.organizationId !== orgId) continue;
        if (t.assigneeEmployeeId !== employeeId) continue;
        if (t.status === "running" && t.id !== taskId) return false;
      }

      employees.set(employeeId, { ...emp, currentTaskId: taskId, status: "working" });
      return true;
    });
  }

  async releaseEmployee(orgId: string, employeeId: string, taskId: string): Promise<void> {
    await this.withOrgLock(orgId, async () => {
      const employees = this.table("employee_instances");
      const emp = employees.get(employeeId);
      if (!emp || emp.organizationId !== orgId) return;
      if (emp.currentTaskId !== taskId) return;
      employees.set(employeeId, { ...emp, currentTaskId: null, status: "idle" });
    });
  }

  async withOrgLock<R>(orgId: string, fn: () => Promise<R>): Promise<R> {
    const previous = this.locks.get(orgId) ?? Promise.resolve();
    let release!: () => void;
    const gate = new Promise<void>((resolve) => {
      release = resolve;
    });
    this.locks.set(
      orgId,
      previous.then(() => gate),
    );
    await previous;
    try {
      return await fn();
    } finally {
      release();
    }
  }

  async reset(): Promise<void> {
    this.tables = new Map();
    for (const t of ALL_TABLES) this.tables.set(t, new Map());
    this.locks.clear();
  }

  /** 開発用: 永続化のためのダンプ / 復元 */
  dump(): Record<string, Row[]> {
    const out: Record<string, Row[]> = {};
    for (const [name, rows] of this.tables) out[name] = [...rows.values()];
    return out;
  }

  restore(snapshot: Record<string, Row[]>): void {
    for (const [name, rows] of Object.entries(snapshot)) {
      const table = new Map<string, Row>();
      for (const row of rows) table.set(row.id as string, row);
      this.tables.set(name as TableName, table);
    }
  }
}
