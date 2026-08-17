import { z } from "zod";
import { defineHandler, jsonError, jsonOk } from "@/lib/api/handler";
import { getStore } from "@/lib/db";
import { deleteMemory, pinMemory, rememberMemory } from "@/lib/memory/service";

const schema = z.object({
  organizationId: z.string().uuid().optional(),
  action: z.enum(["create", "update", "pin", "delete"]),
  memoryId: z.string().uuid().optional(),
  scope: z.enum(["organization", "business", "project", "employee", "run"]).optional(),
  scopeRefId: z.string().uuid().nullable().optional(),
  employeeId: z.string().uuid().nullable().optional(),
  title: z.string().max(200).optional(),
  content: z.string().max(20_000).optional(),
  confidentiality: z.enum(["public", "internal", "confidential"]).optional(),
  pinned: z.boolean().optional(),
});

export const POST = defineHandler({ schema, rateLimitMax: 60 }, async ({ body, auth }) => {
  const store = await getStore();
  const orgId = auth.organization.id;

  switch (body.action) {
    case "create": {
      if (!body.title || !body.content || !body.scope) {
        return jsonError(400, "invalid_request", "タイトル・内容・スコープが必要です");
      }
      const memory = await rememberMemory(store, {
        organizationId: orgId,
        scope: body.scope,
        scopeRefId: body.scopeRefId ?? null,
        employeeId: body.employeeId ?? null,
        title: body.title,
        content: body.content,
        source: "ユーザー入力",
        confidentiality: body.confidentiality,
        createdBy: auth.user.id,
      });
      return jsonOk({ memory });
    }

    case "update": {
      if (!body.memoryId) return jsonError(400, "invalid_request", "メモリIDが必要です");
      const memory = await store.update("memories", orgId, body.memoryId, {
        ...(body.title ? { title: body.title } : {}),
        ...(body.content ? { content: body.content } : {}),
        ...(body.confidentiality ? { confidentiality: body.confidentiality } : {}),
      });
      return jsonOk({ memory });
    }

    case "pin": {
      if (!body.memoryId) return jsonError(400, "invalid_request", "メモリIDが必要です");
      const memory = await pinMemory(store, orgId, body.memoryId, body.pinned ?? true);
      return jsonOk({ memory });
    }

    case "delete": {
      if (!body.memoryId) return jsonError(400, "invalid_request", "メモリIDが必要です");
      await deleteMemory(store, orgId, body.memoryId);
      return jsonOk({ deleted: true });
    }

    default:
      return jsonError(400, "invalid_action", "不明な操作です");
  }
});
