import { z } from "zod";
import { defineHandler, jsonError, jsonOk } from "@/lib/api/handler";
import { getStore } from "@/lib/db";
import { setSessionCookie } from "@/lib/auth/session";
import { hashPassword } from "@/lib/auth/password";
import { newId, nowIso } from "@/lib/core/ids";
import { grantMonthly } from "@/lib/credits/ledger";
import { hireEmployee } from "@/lib/orchestrator/workflow";
import { recordAudit } from "@/lib/audit/log";

const schema = z.object({
  email: z.string().email().max(200),
  password: z.string().min(8).max(200),
  displayName: z.string().min(1).max(80),
  organizationName: z.string().min(1).max(80).default("マイカンパニー"),
});

export const POST = defineHandler({ schema, public: true, rateLimitMax: 5 }, async ({ body }) => {
  const store = await getStore();
  const email = body.email.toLowerCase();

  const existing = await store.findGlobal("profiles", { email });
  if (existing) {
    return jsonError(409, "email_taken", "このメールアドレスは既に登録されています");
  }

  const userId = newId();
  const now = nowIso();
  await store.insert("profiles", {
    id: userId,
    email,
    displayName: body.displayName,
    passwordHash: hashPassword(body.password),
    createdAt: now,
    updatedAt: now,
  });

  const orgId = newId();
  await store.insert("organizations", {
    id: orgId,
    name: body.organizationName,
    ownerUserId: userId,
    planKey: "free",
    locale: "ja",
    createdAt: now,
    updatedAt: now,
    createdBy: userId,
  });

  await store.insert("organization_members", {
    id: newId(),
    organizationId: orgId,
    userId,
    role: "owner",
    createdAt: now,
  });

  // 無料枠を付与
  await grantMonthly(store, orgId, "free", `signup-grant-${orgId}`);

  // 統括AIだけは最初から在籍する（会話の相手が必要なため）
  const director = await hireEmployee(store, { organizationId: orgId, roleKey: "director", userId });

  await store.insert("conversations", {
    id: newId(),
    organizationId: orgId,
    employeeId: null,
    projectId: null,
    title: "統括AIとの相談",
    kind: "director",
    createdAt: now,
    updatedAt: now,
    createdBy: userId,
  });

  await recordAudit(store, {
    organizationId: orgId,
    actorUserId: userId,
    type: "login",
    target: email,
    detail: { signup: true },
  });

  await setSessionCookie(userId, email);

  return jsonOk({ organizationId: orgId, directorId: director.id, needsOnboarding: true });
});
