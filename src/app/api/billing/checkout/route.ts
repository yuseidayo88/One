import { z } from "zod";
import { defineHandler, jsonError, jsonOk } from "@/lib/api/handler";
import { getBillingProvider } from "@/lib/providers";
import { idempotencyKey } from "@/lib/core/ids";
import { CREDIT_PACKS, PLANS } from "@/config/pricing";

const schema = z.object({
  organizationId: z.string().uuid().optional(),
  planKey: z.enum(["starter", "founder", "ceo"]).optional(),
  packKey: z.string().max(40).optional(),
});

export const POST = defineHandler({ schema, rateLimitMax: 10 }, async ({ req, body, auth }) => {
  if (!body.planKey && !body.packKey) {
    return jsonError(400, "invalid_request", "プランまたはパックを指定してください");
  }
  if (body.packKey && !CREDIT_PACKS.some((p) => p.key === body.packKey)) {
    return jsonError(400, "invalid_request", "不明なクレジットパックです");
  }

  const origin = new URL(req.url).origin;
  const provider = getBillingProvider();
  const result = await provider.createCheckout({
    idempotencyKey: idempotencyKey("checkout", auth.organization.id, body.planKey ?? body.packKey),
    organizationId: auth.organization.id,
    planKey: body.planKey,
    packKey: body.packKey,
    successUrl: `${origin}/usage?checkout=success`,
    cancelUrl: `${origin}/usage?checkout=cancel`,
    customerEmail: auth.user.email,
  });

  if (!result.ok || !result.data) {
    return jsonError(502, "billing_unavailable", result.error?.message ?? "決済を開始できませんでした");
  }

  return jsonOk({
    url: result.data.url,
    mode: provider.info().mode,
    label: body.planKey ? PLANS[body.planKey].name : body.packKey,
  });
});
