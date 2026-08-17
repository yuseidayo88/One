import { NextResponse, type NextRequest } from "next/server";
import { getStore } from "@/lib/db";
import { requireSession } from "@/lib/auth/session";
import { grantMonthly, purchasePack } from "@/lib/credits/ledger";
import { CREDIT_PACKS, PLANS, type PlanKey } from "@/config/pricing";
import { recordAudit } from "@/lib/audit/log";
import { nowIso, newId } from "@/lib/core/ids";

/**
 * Mock 決済の完了。Stripe 未接続の開発環境で、課金フローを通しで確認するためのもの。
 * 本番（STRIPE_SECRET_KEY 設定時）では MockBillingProvider が使われないため到達しない。
 */
export async function GET(req: NextRequest): Promise<NextResponse> {
  const auth = await requireSession();
  const store = await getStore();
  const orgId = auth.organization.id;

  const url = new URL(req.url);
  const session = url.searchParams.get("session") ?? "";
  const planKey = url.searchParams.get("plan") as PlanKey | null;
  const packKey = url.searchParams.get("pack");

  if (!session) {
    return NextResponse.redirect(new URL("/usage?checkout=cancel", req.url));
  }

  if (planKey && PLANS[planKey]) {
    await store.update("organizations", orgId, orgId, { planKey });
    await grantMonthly(store, orgId, planKey, `mock-${session}`);

    const subs = await store.list("subscriptions", orgId);
    const existing = subs[0];
    if (existing) {
      await store.update("subscriptions", orgId, existing.id, { planKey, status: "active" });
    } else {
      await store.insert("subscriptions", {
        id: newId(),
        organizationId: orgId,
        stripeSubscriptionId: null,
        planKey,
        status: "active",
        currentPeriodEnd: new Date(Date.now() + 30 * 86_400_000).toISOString(),
        createdAt: nowIso(),
        updatedAt: nowIso(),
      });
    }
  } else if (packKey) {
    const pack = CREDIT_PACKS.find((p) => p.key === packKey);
    if (pack) {
      await purchasePack(store, orgId, pack.workTokens, `mock-${session}`, "追加購入（Mock）");
    }
  }

  await recordAudit(store, {
    organizationId: orgId,
    actorUserId: auth.user.id,
    type: "payment",
    target: planKey ?? packKey ?? "",
    detail: { mock: true, session },
  });

  return NextResponse.redirect(new URL("/usage?checkout=success", req.url));
}
