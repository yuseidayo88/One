import type { TableMap, TableName } from "@/lib/db/schema";

export type Filter<T> = Partial<{ [K in keyof T]: T[K] | T[K][] }>;

export interface ListOptions<T> {
  filter?: Filter<T>;
  orderBy?: keyof T;
  direction?: "asc" | "desc";
  limit?: number;
}

/**
 * 全データアクセスの唯一の入口。
 *
 * 不変条件:
 *  - organization_id を持つテーブルへのアクセスは、必ず orgId を伴う。
 *  - orgId が一致しない行は、ID を直接指定しても取得できない。
 *    （Supabase 側では RLS が、Memory 側ではこの層が同じ制約を強制する）
 */
export interface Store {
  readonly kind: "memory" | "supabase";

  /* 組織スコープ */
  insert<T extends TableName>(table: T, row: TableMap[T]): Promise<TableMap[T]>;
  get<T extends TableName>(table: T, orgId: string, id: string): Promise<TableMap[T] | null>;
  list<T extends TableName>(
    table: T,
    orgId: string,
    options?: ListOptions<TableMap[T]>,
  ): Promise<TableMap[T][]>;
  update<T extends TableName>(
    table: T,
    orgId: string,
    id: string,
    patch: Partial<TableMap[T]>,
  ): Promise<TableMap[T]>;
  remove<T extends TableName>(table: T, orgId: string, id: string): Promise<void>;
  count<T extends TableName>(table: T, orgId: string, filter?: Filter<TableMap[T]>): Promise<number>;

  /* グローバル（profiles / organizations） */
  getGlobal<T extends TableName>(table: T, id: string): Promise<TableMap[T] | null>;
  findGlobal<T extends TableName>(table: T, filter: Filter<TableMap[T]>): Promise<TableMap[T] | null>;
  listGlobal<T extends TableName>(table: T, filter?: Filter<TableMap[T]>): Promise<TableMap[T][]>;
  updateGlobal<T extends TableName>(table: T, id: string, patch: Partial<TableMap[T]>): Promise<TableMap[T]>;

  /**
   * 1社員1メインタスクの原子的な確保。
   * すでに running のメインタスクを持つ社員には false を返す。
   */
  tryClaimEmployeeForTask(orgId: string, employeeId: string, taskId: string): Promise<boolean>;
  releaseEmployee(orgId: string, employeeId: string, taskId: string): Promise<void>;

  /** クレジット操作を直列化するためのロック（Memory は単純ミューテックス） */
  withOrgLock<R>(orgId: string, fn: () => Promise<R>): Promise<R>;

  /** テスト用 */
  reset?(): Promise<void>;
}
