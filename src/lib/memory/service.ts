import type { MemoryRecord, MemoryScope, RoleKey } from "@/lib/core/types";
import type { Store } from "@/lib/db/store";
import { newId, nowIso } from "@/lib/core/ids";
import { canAccessDataScope } from "@/lib/roles/policy";

/**
 * 階層メモリ。
 *
 *   組織 → 事業 → プロジェクト → 社員個別 → タスク実行時の一時コンテキスト
 *
 * 社員は「1つの頭脳と記憶を持っている」ように振る舞うが、
 * 組織内すべての情報へ無制限にアクセスはできない。必要な範囲だけを取得する。
 * 組織をまたいだ共有は Store 層で構造的に起こらない。
 */

export interface MemoryQuery {
  employeeId: string;
  roleKey: RoleKey;
  businessId?: string | null;
  projectId?: string | null;
  runId?: string | null;
  limit?: number;
}

export async function rememberMemory(
  store: Store,
  input: {
    organizationId: string;
    scope: MemoryScope;
    scopeRefId?: string | null;
    employeeId?: string | null;
    title: string;
    content: string;
    source: string;
    confidentiality?: MemoryRecord["confidentiality"];
    createdBy: string;
  },
): Promise<MemoryRecord> {
  return store.insert("memories", {
    id: newId(),
    organizationId: input.organizationId,
    scope: input.scope,
    scopeRefId: input.scopeRefId ?? null,
    employeeId: input.employeeId ?? null,
    title: input.title,
    content: input.content,
    source: input.source,
    confidentiality: input.confidentiality ?? "internal",
    pinned: false,
    createdAt: nowIso(),
    updatedAt: nowIso(),
    createdBy: input.createdBy,
  });
}

/**
 * 社員がタスク実行時に取得できるメモリを、Role Policy に従って絞り込む。
 */
export async function recallForEmployee(
  store: Store,
  organizationId: string,
  query: MemoryQuery,
): Promise<MemoryRecord[]> {
  const all = await store.list("memories", organizationId, {
    orderBy: "createdAt",
    direction: "desc",
  });

  const canReadShared = canAccessDataScope(query.roleKey, "shared_memory").allowed;
  const canReadBusiness = canAccessDataScope(query.roleKey, "business").allowed;
  const canReadProject = canAccessDataScope(query.roleKey, "project").allowed;
  const canReadOrgProfile = canAccessDataScope(query.roleKey, "org_profile").allowed;

  const filtered = all.filter((m) => {
    switch (m.scope) {
      case "employee":
        // 他社員の個別メモリは読めない
        return m.employeeId === query.employeeId;
      case "organization":
        return canReadOrgProfile || canReadShared;
      case "business":
        return canReadBusiness && (!query.businessId || m.scopeRefId === query.businessId);
      case "project":
        return canReadProject && (!query.projectId || m.scopeRefId === query.projectId);
      case "run":
        return m.scopeRefId === query.runId;
      default:
        return false;
    }
  });

  // 機密レベルの高いものは、明示的に許可された職種のみ
  const visible = filtered.filter((m) => {
    if (m.confidentiality !== "confidential") return true;
    return canAccessDataScope(query.roleKey, "financials").allowed || m.employeeId === query.employeeId;
  });

  // 固定されたメモリを優先
  visible.sort((a, b) => Number(b.pinned) - Number(a.pinned));
  return visible.slice(0, query.limit ?? 20);
}

export async function pinMemory(
  store: Store,
  organizationId: string,
  memoryId: string,
  pinned: boolean,
): Promise<MemoryRecord> {
  return store.update("memories", organizationId, memoryId, { pinned });
}

export async function deleteMemory(
  store: Store,
  organizationId: string,
  memoryId: string,
): Promise<void> {
  await store.remove("memories", organizationId, memoryId);
}
