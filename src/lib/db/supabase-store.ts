import "server-only";
import { createClient, type SupabaseClient } from "@supabase/supabase-js";
import { serverEnv } from "@/config/env";
import { GLOBAL_TABLES, type TableMap, type TableName } from "@/lib/db/schema";
import type { Filter, ListOptions, Store } from "@/lib/db/store";

/** camelCase → snake_case（DB カラム名） */
function toSnake(key: string): string {
  return key.replace(/[A-Z]/g, (m) => `_${m.toLowerCase()}`);
}

function toCamel(key: string): string {
  return key.replace(/_([a-z])/g, (_, c: string) => c.toUpperCase());
}

function rowToDb(row: Record<string, unknown>): Record<string, unknown> {
  const out: Record<string, unknown> = {};
  for (const [k, v] of Object.entries(row)) out[toSnake(k)] = v;
  return out;
}

function rowFromDb(row: Record<string, unknown>): Record<string, unknown> {
  const out: Record<string, unknown> = {};
  for (const [k, v] of Object.entries(row)) out[toCamel(k)] = v;
  return out;
}

/**
 * Supabase(Postgres) 実装。
 *
 * service_role キーを使うためサーバー専用（`server-only`）。
 * RLS は DB 側で有効だが、service_role は RLS をバイパスするため、
 * この層でも必ず organization_id 条件を付与して二重に守る。
 */
export class SupabaseStore implements Store {
  readonly kind = "supabase" as const;
  private client: SupabaseClient;

  constructor(client?: SupabaseClient) {
    this.client =
      client ??
      createClient(serverEnv.supabase.url, serverEnv.supabase.serviceRoleKey, {
        auth: { persistSession: false, autoRefreshToken: false },
      });
  }

  private isGlobal(table: TableName): boolean {
    return GLOBAL_TABLES.includes(table);
  }

  private applyFilter(
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    query: any,
    filter?: Record<string, unknown>,
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
  ): any {
    if (!filter) return query;
    let q = query;
    for (const [key, value] of Object.entries(filter)) {
      if (value === undefined) continue;
      const column = toSnake(key);
      q = Array.isArray(value) ? q.in(column, value) : q.eq(column, value);
    }
    return q;
  }

  async insert<T extends TableName>(table: T, row: TableMap[T]): Promise<TableMap[T]> {
    const { data, error } = await this.client
      .from(table)
      .insert(rowToDb(row as unknown as Record<string, unknown>))
      .select()
      .single();
    if (error) throw new Error(`insert ${table}: ${error.message}`);
    return rowFromDb(data) as unknown as TableMap[T];
  }

  async get<T extends TableName>(table: T, orgId: string, id: string): Promise<TableMap[T] | null> {
    let query = this.client.from(table).select("*").eq("id", id);
    if (!this.isGlobal(table)) query = query.eq("organization_id", orgId);
    const { data, error } = await query.maybeSingle();
    if (error) throw new Error(`get ${table}: ${error.message}`);
    return data ? (rowFromDb(data) as unknown as TableMap[T]) : null;
  }

  async list<T extends TableName>(
    table: T,
    orgId: string,
    options?: ListOptions<TableMap[T]>,
  ): Promise<TableMap[T][]> {
    let query = this.client.from(table).select("*");
    if (!this.isGlobal(table)) query = query.eq("organization_id", orgId);
    query = this.applyFilter(query, options?.filter as unknown as Record<string, unknown> | undefined);
    const orderBy = (options?.orderBy as string) ?? "createdAt";
    query = query.order(toSnake(orderBy), { ascending: (options?.direction ?? "asc") === "asc" });
    if (options?.limit) query = query.limit(options.limit);
    const { data, error } = await query;
    if (error) throw new Error(`list ${table}: ${error.message}`);
    return (data ?? []).map((r) => rowFromDb(r) as unknown as TableMap[T]);
  }

  async update<T extends TableName>(
    table: T,
    orgId: string,
    id: string,
    patch: Partial<TableMap[T]>,
  ): Promise<TableMap[T]> {
    let query = this.client
      .from(table)
      .update(rowToDb(patch as unknown as Record<string, unknown>))
      .eq("id", id);
    if (!this.isGlobal(table)) query = query.eq("organization_id", orgId);
    const { data, error } = await query.select().single();
    if (error) throw new Error(`update ${table}: ${error.message}`);
    return rowFromDb(data) as unknown as TableMap[T];
  }

  async remove<T extends TableName>(table: T, orgId: string, id: string): Promise<void> {
    let query = this.client.from(table).delete().eq("id", id);
    if (!this.isGlobal(table)) query = query.eq("organization_id", orgId);
    const { error } = await query;
    if (error) throw new Error(`remove ${table}: ${error.message}`);
  }

  async count<T extends TableName>(
    table: T,
    orgId: string,
    filter?: Filter<TableMap[T]>,
  ): Promise<number> {
    let query = this.client.from(table).select("id", { count: "exact", head: true });
    if (!this.isGlobal(table)) query = query.eq("organization_id", orgId);
    query = this.applyFilter(query, filter as unknown as Record<string, unknown> | undefined);
    const { count, error } = await query;
    if (error) throw new Error(`count ${table}: ${error.message}`);
    return count ?? 0;
  }

  async getGlobal<T extends TableName>(table: T, id: string): Promise<TableMap[T] | null> {
    const { data, error } = await this.client.from(table).select("*").eq("id", id).maybeSingle();
    if (error) throw new Error(`getGlobal ${table}: ${error.message}`);
    return data ? (rowFromDb(data) as unknown as TableMap[T]) : null;
  }

  async findGlobal<T extends TableName>(
    table: T,
    filter: Filter<TableMap[T]>,
  ): Promise<TableMap[T] | null> {
    let query = this.client.from(table).select("*");
    query = this.applyFilter(query, filter as unknown as Record<string, unknown>);
    const { data, error } = await query.limit(1).maybeSingle();
    if (error) throw new Error(`findGlobal ${table}: ${error.message}`);
    return data ? (rowFromDb(data) as unknown as TableMap[T]) : null;
  }

  async listGlobal<T extends TableName>(
    table: T,
    filter?: Filter<TableMap[T]>,
  ): Promise<TableMap[T][]> {
    let query = this.client.from(table).select("*");
    query = this.applyFilter(query, filter as unknown as Record<string, unknown> | undefined);
    const { data, error } = await query;
    if (error) throw new Error(`listGlobal ${table}: ${error.message}`);
    return (data ?? []).map((r) => rowFromDb(r) as unknown as TableMap[T]);
  }

  async updateGlobal<T extends TableName>(
    table: T,
    id: string,
    patch: Partial<TableMap[T]>,
  ): Promise<TableMap[T]> {
    const { data, error } = await this.client
      .from(table)
      .update(rowToDb(patch as unknown as Record<string, unknown>))
      .eq("id", id)
      .select()
      .single();
    if (error) throw new Error(`updateGlobal ${table}: ${error.message}`);
    return rowFromDb(data) as unknown as TableMap[T];
  }

  /**
   * 1社員1メインタスクは DB 側の部分ユニークインデックスで最終的に保証される。
   * ここでは楽観的に確保し、競合時は unique 違反として false を返す。
   */
  async tryClaimEmployeeForTask(orgId: string, employeeId: string, taskId: string): Promise<boolean> {
    const { data, error } = await this.client
      .from("employee_instances")
      .update({ current_task_id: taskId, status: "working" })
      .eq("id", employeeId)
      .eq("organization_id", orgId)
      .or(`current_task_id.is.null,current_task_id.eq.${taskId}`)
      .select("id");
    if (error) return false;
    return (data?.length ?? 0) > 0;
  }

  async releaseEmployee(orgId: string, employeeId: string, taskId: string): Promise<void> {
    await this.client
      .from("employee_instances")
      .update({ current_task_id: null, status: "idle" })
      .eq("id", employeeId)
      .eq("organization_id", orgId)
      .eq("current_task_id", taskId);
  }

  /**
   * Postgres 側では advisory lock / トランザクションで直列化する想定。
   * SDK 経由では明示ロックが張れないため、クレジット操作は
   * `credit_reservations.idempotency_key` の unique 制約で二重実行を防ぐ。
   */
  async withOrgLock<R>(_orgId: string, fn: () => Promise<R>): Promise<R> {
    return fn();
  }
}
