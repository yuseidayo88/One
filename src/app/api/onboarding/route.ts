import { z } from "zod";
import { defineHandler, jsonOk } from "@/lib/api/handler";
import { getStore } from "@/lib/db";
import { newId, nowIso } from "@/lib/core/ids";
import { buildBusinessBrief } from "@/lib/orchestrator/brief-builder";
import { planFromRequest } from "@/lib/orchestrator/workflow";

const schema = z.object({
  organizationId: z.string().uuid().optional(),
  businessIdea: z.string().min(1).max(4000),
  targetCustomer: z.string().max(1000).optional(),
  problem: z.string().max(1000).optional(),
  progress: z.string().max(500).optional(),
  budget: z.string().max(100).optional(),
  deadline: z.string().max(100).optional(),
  ownerCanDo: z.string().max(1000).optional(),
  delegateToAi: z.string().max(1000).optional(),
  market: z.enum(["domestic", "overseas", "both"]).default("domestic"),
  regulatedNotes: z.string().max(1000).optional(),
});

/**
 * 初回オンボーディング。
 * 事業要約 → 仮説 → 仕事の分解 → 推奨社員 → 最初のタスク → 見積もり → リスク
 * を生成し、選択カードとして返す。ここでは採用も実行も行わない。
 */
export const POST = defineHandler({ schema, rateLimitMax: 20 }, async ({ body, auth }) => {
  const store = await getStore();
  const orgId = auth.organization.id;

  const brief = buildBusinessBrief(body.businessIdea, { answers: body });

  const existing = await store.list("businesses", orgId);
  const businessId = existing[0]?.id ?? newId();
  const now = nowIso();

  const record = {
    id: businessId,
    organizationId: orgId,
    name: brief.name,
    summary: brief.summary,
    targetCustomer: brief.targetCustomer,
    problem: brief.problem,
    progress: brief.progress,
    budgetJpy: body.budget ? Number(body.budget.replace(/[^\d]/g, "")) || null : null,
    deadline: null,
    ownerCanDo: body.ownerCanDo ?? "",
    delegateToAi: body.delegateToAi ?? "",
    market: brief.market,
    regulatedNotes: brief.regulatedNotes,
    hypotheses: brief.hypotheses,
    createdAt: existing[0]?.createdAt ?? now,
    updatedAt: now,
    createdBy: auth.user.id,
  };

  if (existing[0]) await store.update("businesses", orgId, businessId, record);
  else await store.insert("businesses", record);

  const projects = await store.list("projects", orgId);
  if (projects.length === 0) {
    await store.insert("projects", {
      id: newId(),
      organizationId: orgId,
      businessId,
      name: "立ち上げ",
      description: "最初の検証と立ち上げ。",
      status: "active",
      createdAt: now,
      updatedAt: now,
      createdBy: auth.user.id,
    });
  }

  const conversations = await store.list("conversations", orgId, { filter: { kind: "director" } });
  let conversationId = conversations[0]?.id;
  if (!conversationId) {
    conversationId = newId();
    await store.insert("conversations", {
      id: conversationId,
      organizationId: orgId,
      employeeId: null,
      title: "統括AIとの相談",
      kind: "director",
      createdAt: now,
      updatedAt: now,
      createdBy: auth.user.id,
    });
  }

  await store.insert("messages", {
    id: newId(),
    organizationId: orgId,
    conversationId,
    author: "user",
    employeeId: null,
    content: body.businessIdea,
    containsUntrustedData: false,
    createdAt: now,
  });

  const requestText = [
    body.businessIdea,
    body.targetCustomer ?? "",
    body.problem ?? "",
    body.delegateToAi ?? "",
  ]
    .filter(Boolean)
    .join("\n");

  const plan = await planFromRequest({
    store,
    organizationId: orgId,
    userId: auth.user.id,
    conversationId,
    requestText,
    isOnboarding: true,
  });

  const directors = await store.list("employee_instances", orgId, { filter: { roleKey: "director" } });
  await store.insert("messages", {
    id: newId(),
    organizationId: orgId,
    conversationId,
    author: "employee",
    employeeId: directors[0]?.id ?? null,
    content: plan.publicMessage || plan.plan.summary,
    containsUntrustedData: false,
    createdAt: nowIso(),
  });

  return jsonOk({
    businessId,
    conversationId,
    brief,
    blocked: plan.blocked,
    safetyLevel: plan.safetyLevel,
    summary: plan.plan.summary,
    hypotheses: plan.plan.hypotheses,
    questions: plan.plan.questions,
    risks: plan.plan.risks,
    estimatedDuration: plan.plan.estimatedDuration,
    estimatedWorkTokens: plan.plan.estimatedWorkTokens,
    decisionId: plan.decision.id,
    proposedTasks: plan.plan.proposedTasks.map((t) => ({
      refId: t.refId,
      title: t.title,
      description: t.description,
      suggestedRole: t.suggestedRole,
      estimatedDurationMinutes: t.estimatedDurationMinutes,
      estimatedWorkTokens: t.estimatedWorkTokens,
    })),
    options: plan.options.map((o) => ({
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
