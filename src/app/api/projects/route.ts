import { z } from "zod";
import { defineHandler, jsonError, jsonOk } from "@/lib/api/handler";
import { getStore } from "@/lib/db";
import { PROJECT_STATUSES } from "@/lib/core/types";
import {
  createProject,
  ensureDirectorConversation,
  setProjectStatus,
} from "@/lib/projects/service";

const schema = z.discriminatedUnion("action", [
  z.object({
    action: z.literal("create"),
    organizationId: z.string().uuid().optional(),
    name: z.string().min(1).max(120),
    description: z.string().max(2000).default(""),
  }),
  z.object({
    action: z.literal("set_status"),
    organizationId: z.string().uuid().optional(),
    projectId: z.string().uuid(),
    status: z.enum(PROJECT_STATUSES as [string, ...string[]]),
  }),
]);

/**
 * プロジェクトの作成と状態変更。
 * 状態遷移の可否はサーバー側でだけ判定する（UI の出し分けは判断の根拠にしない）。
 */
export const POST = defineHandler({ schema, rateLimitMax: 40 }, async ({ body, auth }) => {
  const store = await getStore();
  const orgId = auth.organization.id;

  if (body.action === "create") {
    const businesses = await store.list("businesses", orgId);
    const project = await createProject(store, orgId, auth.user.id, {
      name: body.name,
      description: body.description,
      businessId: businesses[0]?.id ?? null,
    });
    // 開始前の相談はこの会話に積み、開始後もそのまま右パネルへ引き継ぐ
    const conversation = await ensureDirectorConversation(store, orgId, project.id, auth.user.id);
    return jsonOk({ projectId: project.id, conversationId: conversation.id });
  }

  const result = await setProjectStatus(
    store,
    orgId,
    body.projectId,
    body.status as (typeof PROJECT_STATUSES)[number],
  );
  if (!result.ok) return jsonError(409, "transition_rejected", result.reason);
  return jsonOk({ project: result.project });
});
