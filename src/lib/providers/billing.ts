import {
  errResult,
  okResult,
  type ProviderInfo,
  type ProviderRequestBase,
  type ProviderResult,
} from "@/lib/providers/types";
import { CREDIT_PACKS, PLANS, type PlanKey } from "@/config/pricing";

export interface CheckoutRequest extends ProviderRequestBase {
  planKey?: PlanKey;
  packKey?: string;
  successUrl: string;
  cancelUrl: string;
  customerEmail: string;
}

export interface BillingProvider {
  info(): ProviderInfo;
  createCheckout(req: CheckoutRequest): Promise<ProviderResult<{ url: string; sessionId: string }>>;
  createPortal(
    req: ProviderRequestBase & { customerId: string; returnUrl: string },
  ): Promise<ProviderResult<{ url: string }>>;
  /** Webhook 署名検証 */
  verifyWebhook(payload: string, signature: string): { ok: boolean; event: unknown | null };
}

export class MockBillingProvider implements BillingProvider {
  info(): ProviderInfo {
    return { mode: "mock", name: "mock-billing" };
  }

  async createCheckout(
    req: CheckoutRequest,
  ): Promise<ProviderResult<{ url: string; sessionId: string }>> {
    const sessionId = `cs_mock_${req.idempotencyKey.slice(0, 16)}`;
    const params = new URLSearchParams({
      session: sessionId,
      ...(req.planKey ? { plan: req.planKey } : {}),
      ...(req.packKey ? { pack: req.packKey } : {}),
    });
    // Mock では即時に確定できる内部エンドポイントへ誘導する
    return okResult(
      { url: `/api/billing/mock-complete?${params.toString()}`, sessionId },
      {},
      { costJpy: 0, workTokens: 0 },
      { mock: true },
    );
  }

  async createPortal(
    req: ProviderRequestBase & { customerId: string; returnUrl: string },
  ): Promise<ProviderResult<{ url: string }>> {
    return okResult({ url: req.returnUrl }, {}, { costJpy: 0, workTokens: 0 }, { mock: true });
  }

  verifyWebhook(): { ok: boolean; event: unknown | null } {
    return { ok: false, event: null };
  }
}

/**
 * Stripe アダプタ。
 * 月額課金 / 追加クレジット / Checkout / Customer Portal /
 * 署名検証済み Webhook / 請求状態同期に対応する。
 */
export class StripeBillingProvider implements BillingProvider {
  constructor(
    private secretKey: string,
    private webhookSecret: string,
    private priceIds: { starter: string; founder: string; ceo: string },
  ) {}

  info(): ProviderInfo {
    return { mode: this.secretKey ? "live" : "not_configured", name: "stripe" };
  }

  private async client() {
    const { default: Stripe } = await import("stripe");
    return new Stripe(this.secretKey);
  }

  async createCheckout(
    req: CheckoutRequest,
  ): Promise<ProviderResult<{ url: string; sessionId: string }>> {
    if (!this.secretKey) return errResult("not_configured", "STRIPE_SECRET_KEY が未設定です", false);
    try {
      const stripe = await this.client();

      if (req.planKey) {
        const plan = PLANS[req.planKey];
        const priceEnvKey = plan.stripePriceEnvKey;
        const priceId = priceEnvKey ? this.priceIds[priceEnvKey] : "";
        if (!priceId) return errResult("not_configured", "Stripe の価格IDが未設定です", false);

        const session = await stripe.checkout.sessions.create(
          {
            mode: "subscription",
            line_items: [{ price: priceId, quantity: 1 }],
            success_url: req.successUrl,
            cancel_url: req.cancelUrl,
            customer_email: req.customerEmail,
            client_reference_id: req.organizationId,
            metadata: { organizationId: req.organizationId, planKey: req.planKey },
          },
          { idempotencyKey: req.idempotencyKey },
        );
        return okResult(
          { url: session.url ?? req.cancelUrl, sessionId: session.id },
          {},
          { costJpy: 0, workTokens: 0 },
        );
      }

      const pack = CREDIT_PACKS.find((p) => p.key === req.packKey);
      if (!pack) return errResult("invalid_request", "不明なクレジットパックです", false);

      const session = await stripe.checkout.sessions.create(
        {
          mode: "payment",
          line_items: [
            {
              quantity: 1,
              price_data: {
                currency: "jpy",
                unit_amount: pack.priceJpy,
                product_data: {
                  name: `${pack.workTokens.toLocaleString("ja-JP")} ワークトークン`,
                },
              },
            },
          ],
          success_url: req.successUrl,
          cancel_url: req.cancelUrl,
          customer_email: req.customerEmail,
          client_reference_id: req.organizationId,
          metadata: { organizationId: req.organizationId, packKey: pack.key },
        },
        { idempotencyKey: req.idempotencyKey },
      );
      return okResult(
        { url: session.url ?? req.cancelUrl, sessionId: session.id },
        {},
        { costJpy: 0, workTokens: 0 },
      );
    } catch (error) {
      return errResult("provider_unavailable", (error as Error).message, true);
    }
  }

  async createPortal(
    req: ProviderRequestBase & { customerId: string; returnUrl: string },
  ): Promise<ProviderResult<{ url: string }>> {
    if (!this.secretKey) return errResult("not_configured", "STRIPE_SECRET_KEY が未設定です", false);
    try {
      const stripe = await this.client();
      const session = await stripe.billingPortal.sessions.create({
        customer: req.customerId,
        return_url: req.returnUrl,
      });
      return okResult({ url: session.url }, {}, { costJpy: 0, workTokens: 0 });
    } catch (error) {
      return errResult("provider_unavailable", (error as Error).message, true);
    }
  }

  verifyWebhook(payload: string, signature: string): { ok: boolean; event: unknown | null } {
    if (!this.webhookSecret) return { ok: false, event: null };
    try {
      // 同期検証のため require ベースの生成を避け、遅延 import は使わない
      // eslint-disable-next-line @typescript-eslint/no-require-imports
      const Stripe = require("stripe") as typeof import("stripe").default;
      const stripe = new Stripe(this.secretKey);
      const event = stripe.webhooks.constructEvent(payload, signature, this.webhookSecret);
      return { ok: true, event };
    } catch {
      return { ok: false, event: null };
    }
  }
}
