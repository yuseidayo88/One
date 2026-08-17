import { NextResponse, type NextRequest } from "next/server";
import { getStore } from "@/lib/db";
import { getBillingProvider } from "@/lib/providers";
import { grantMonthly, purchasePack } from "@/lib/credits/ledger";
import { CREDIT_PACKS, type PlanKey } from "@/config/pricing";
import { recordAudit } from "@/lib/audit/log";
import { safeLog } from "@/lib/core/redact";
import { newId, nowIso } from "@/lib/core/ids";

/**
 * Stripe Webhook。
 *
 * - 署名検証必須（検証に失敗したリクエストは処理しない）
 * - event.id を冪等キーとして使い、再送で二重付与しない
 * - 本文は raw text のまま検証する
 */
export async function POST(req: NextRequest): Promise<NextResponse> {
  const signature = req.headers.get("stripe-signature") ?? "";
  const payload = await req.text();

  const provider = getBillingProvider();
  const { ok, event } = provider.verifyWebhook(payload, signature);
  if (!ok || !event) {
    return NextResponse.json({ error: "invalid signature" }, { status: 400 });
  }

  const typed = event as {
    id: string;
    type: string;
    data: { object: Record<string, unknown> };
  };

  const store = await getStore();
  const object = typed.data.object;
  const metadata = (object.metadata ?? {}) as Record<string, string>;
  const orgId = metadata.organizationId ?? (object.client_reference_id as string | undefined);

  if (!orgId) {
    safeLog("stripe-webhook", { type: typed.type, note: "organizationId missing" });
    return NextResponse.json({ received: true });
  }

  switch (typed.type) {
    case "checkout.session.completed":
    case "invoice.paid": {
      if (metadata.planKey) {
        const planKey = metadata.planKey as PlanKey;
        await store.update("organizations", orgId, orgId, { planKey }).catch(() => undefined);
        await grantMonthly(store, orgId, planKey, `stripe-${typed.id}`);

        const subs = await store.list("subscriptions", orgId);
        const existing = subs[0];
        const subscriptionId = (object.subscription as string | undefined) ?? null;
        if (existing) {
          await store.update("subscriptions", orgId, existing.id, {
            planKey,
            status: "active",
            stripeSubscriptionId: subscriptionId,
          });
        } else {
          await store.insert("subscriptions", {
            id: newId(),
            organizationId: orgId,
            stripeSubscriptionId: subscriptionId,
            planKey,
            status: "active",
            currentPeriodEnd: null,
            createdAt: nowIso(),
            updatedAt: nowIso(),
          });
        }
      } else if (metadata.packKey) {
        const pack = CREDIT_PACKS.find((p) => p.key === metadata.packKey);
        if (pack) {
          await purchasePack(store, orgId, pack.workTokens, `stripe-${typed.id}`, "追加購入");
        }
      }
      break;
    }

    case "customer.subscription.deleted": {
      const subs = await store.list("subscriptions", orgId);
      for (const sub of subs) {
        await store.update("subscriptions", orgId, sub.id, { status: "canceled" });
      }
      await store.update("organizations", orgId, orgId, { planKey: "free" }).catch(() => undefined);
      break;
    }

    case "invoice.payment_failed": {
      const subs = await store.list("subscriptions", orgId);
      for (const sub of subs) {
        await store.update("subscriptions", orgId, sub.id, { status: "past_due" });
      }
      break;
    }

    default:
      break;
  }

  await recordAudit(store, {
    organizationId: orgId,
    type: "payment",
    target: typed.type,
    detail: { eventId: typed.id },
  });

  return NextResponse.json({ received: true });
}
