import { defineHandler, jsonOk } from "@/lib/api/handler";
import { clearSessionCookie } from "@/lib/auth/session";

export const POST = defineHandler({ public: true }, async () => {
  await clearSessionCookie();
  return jsonOk({ ok: true });
});
