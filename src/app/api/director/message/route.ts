import { z } from "zod";
import { defineHandler, jsonOk } from "@/lib/api/handler";
import { getStore } from "@/lib/db";
import { newId, nowIso } from "@/lib/core/ids";
import { planFromRequest } from "@/lib/orchestrator/workflow";

const schema = z.object({
  organizationId: z.string().uuid().optional(),
  conversationId: z.string().min(1),
  content: z.string().min(1).max(8000),
  /** 社員あて（担当外判定を行う）の場合 */
  employeeId: z.string().uuid().nullable().optional(),
  isOnboarding: z.boolean().optional(),
});

export const POST = defineHandler({ schema, rateLimitMax: 40 }, async ({ body, auth }) => {
  const store = await getStore();
  const orgId = auth.organization.id;

  // 会話の所属を検証（他組織の conversationId を渡されても弾く）
  const conversation = await store.get("conversations", orgId, body.conversationId);
  if (!conversation) {
    return jsonOk({ blocked: true, message: "会話が見つかりません", options: [] });
  }

  await store.insert("messages", {
    id: newId(),
    organizationId: orgId,
    conversationId: conversation.id,
    author: "user",
    employeeId: null,
    content: body.content,
    containsUntrustedData: false,
    createdAt: nowIso(),
  });

  const result = await planFromRequest({
    store,
    organizationId: orgId,
    userId: auth.user.id,
    conversationId: conversation.id,
    requestText: body.content,
    requesterEmployeeId: body.employeeId ?? null,
    isOnboarding: body.isOnboarding ?? false,
  });

  const employees = await store.list("employee_instances", orgId, { filter: { roleKey: "director" } });

  await store.insert("messages", {
    id: newId(),
    organizationId: orgId,
    conversationId: conversation.id,
    author: "employee",
    employeeId: employees[0]?.id ?? null,
    content: result.publicMessage || result.plan.summary,
    containsUntrustedData: false,
    createdAt: nowIso(),
  });

  return jsonOk({
    blocked: result.blocked,
    safetyLevel: result.safetyLevel,
    message: result.publicMessage,
    decisionId: result.decision.id,
    questions: result.plan.questions,
    risks: result.plan.risks,
    estimatedWorkTokens: result.plan.estimatedWorkTokens,
    estimatedDuration: result.plan.estimatedDuration,
    handoffs: result.plan.handoffs,
    options: result.options.map((o) => ({
      id: o.id,
      kind: o.kind,
      title: o.title,
      description: o.description,
      roleKey: o.roleKey,
      reason: o.reason,
      estimatedDurationMinutes: o.estimatedDurationMinutes,
      estimatedWorkTokens: o.estimatedWorkTokens,
      riskLevel: o.riskLevel,
      recommended: o.recommended,
    })),
  });
});
