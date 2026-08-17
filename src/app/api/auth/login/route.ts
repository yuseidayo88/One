import { z } from "zod";
import { defineHandler, jsonError, jsonOk } from "@/lib/api/handler";
import { getStore } from "@/lib/db";
import { setSessionCookie } from "@/lib/auth/session";
import { verifyPassword } from "@/lib/auth/password";
import { recordAudit } from "@/lib/audit/log";

const schema = z.object({
  email: z.string().email().max(200),
  password: z.string().min(8).max(200),
});

export const POST = defineHandler({ schema, public: true, rateLimitMax: 10 }, async ({ body }) => {
  const store = await getStore();
  const profile = await store.findGlobal("profiles", { email: body.email.toLowerCase() });

  // 存在しないユーザーでも同じメッセージを返す（列挙攻撃対策）
  if (!profile?.passwordHash || !verifyPassword(body.password, profile.passwordHash)) {
    return jsonError(401, "invalid_credentials", "メールアドレスまたはパスワードが正しくありません");
  }

  await setSessionCookie(profile.id, profile.email);

  const memberships = await store.listGlobal("organization_members", { userId: profile.id });
  const orgId = memberships[0]?.organizationId;
  if (orgId) {
    await recordAudit(store, {
      organizationId: orgId,
      actorUserId: profile.id,
      type: "login",
      target: profile.email,
    });
  }

  return jsonOk({ needsOnboarding: memberships.length === 0 });
});
