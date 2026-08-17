import "server-only";
import type { Conversation, Project, ProjectStatus } from "@/lib/core/types";
import type { Store } from "@/lib/db/store";
import { newId, nowIso } from "@/lib/core/ids";
import { canTransitionProject, PROJECT_STATUS_LABEL } from "@/lib/projects/status";

/**
 * プロジェクトの作成・状態遷移・統括AI会話の取得。
 *
 * 会話は「1 プロジェクトにつき 1 本」。中央から右パネルへ移っても作り直さない。
 */

export async function createProject(
  store: Store,
  organizationId: string,
  userId: string,
  input: { name: string; description: string; businessId?: string | null },
): Promise<Project> {
  const now = nowIso();
  return store.insert("projects", {
    id: newId(),
    organizationId,
    businessId: input.businessId ?? null,
    name: input.name,
    description: input.description,
    status: "draft",
    createdAt: now,
    updatedAt: now,
    createdBy: userId,
  });
}

/** 統括AIの会話を、そのプロジェクト用に 1 本だけ用意する */
export async function ensureDirectorConversation(
  store: Store,
  organizationId: string,
  projectId: string,
  userId: string,
): Promise<Conversation> {
  const existing = await store.list("conversations", organizationId, {
    filter: { kind: "director", projectId },
    orderBy: "createdAt",
    direction: "asc",
  });
  if (existing[0]) return existing[0];

  const now = nowIso();
  return store.insert("conversations", {
    id: newId(),
    organizationId,
    employeeId: null,
    projectId,
    title: "統括AIとの相談",
    kind: "director",
    createdAt: now,
    updatedAt: now,
    createdBy: userId,
  });
}

export type StatusChange =
  | { ok: true; project: Project }
  | { ok: false; reason: string };

/**
 * 状態遷移。許可されていない遷移はサーバー側で拒否する。
 * 「実行に失敗したら ready のまま留まる」など、留まる判断もここが唯一の基準。
 */
export async function setProjectStatus(
  store: Store,
  organizationId: string,
  projectId: string,
  next: ProjectStatus,
): Promise<StatusChange> {
  const project = await store.get("projects", organizationId, projectId);
  if (!project) return { ok: false, reason: "プロジェクトが見つかりません" };
  if (!canTransitionProject(project.status, next)) {
    return {
      ok: false,
      reason: `${PROJECT_STATUS_LABEL[project.status]}から${PROJECT_STATUS_LABEL[next]}へは変更できません`,
    };
  }
  const updated = await store.update("projects", organizationId, projectId, {
    status: next,
    updatedAt: nowIso(),
  });
  return { ok: true, project: updated };
}
