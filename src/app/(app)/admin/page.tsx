import { redirect } from "next/navigation";
import { AuthError, requireAdmin } from "@/lib/auth/session";
import { getStore } from "@/lib/db";
import { providerStatuses } from "@/lib/providers";
import { COST_MODEL, CREDIT_PACKS, PLANS, PROVIDER_UNIT_COSTS } from "@/config/pricing";
import { MODEL_ROUTING, MODEL_ROUTING_VERSION } from "@/config/models";
import { ROLE_DEFINITIONS, ROLE_REGISTRY_VERSION, ALL_ROLE_KEYS } from "@/lib/roles/registry";
import { SAFETY_POLICY_VERSION } from "@/lib/safety/rules";
import { PROMPT_VERSION } from "@/lib/orchestrator/prompts";
import { abuseStatus } from "@/lib/audit/log";
import { SectionLabel } from "@/components/ui/primitives";

export const dynamic = "force-dynamic";

/**
 * 管理者機能。
 * アクセス制御はサーバー側で厳密に行う（UI の非表示に依存しない）。
 */
export default async function AdminPage() {
  try {
    await requireAdmin();
  } catch (error) {
    if (error instanceof AuthError) redirect("/office");
    throw error;
  }

  const auth = await requireAdmin();
  const store = await getStore();
  const orgId = auth.organization.id;

  const [safetyDecisions, auditEvents, modelUsage, abuse] = await Promise.all([
    store.list("safety_decisions", orgId, { orderBy: "createdAt", direction: "desc", limit: 20 }),
    store.list("audit_events", orgId, { orderBy: "createdAt", direction: "desc", limit: 30 }),
    store.list("model_usage", orgId),
    abuseStatus(store, orgId),
  ]);

  const totalCostJpy = modelUsage.reduce((sum, u) => sum + u.costJpy, 0);
  const totalWorkTokens = modelUsage.reduce((sum, u) => sum + u.workTokens, 0);
  const revenueEstimate = totalWorkTokens * COST_MODEL.targetCostPerWorkTokenJpy * 5;
  const grossMargin = revenueEstimate > 0 ? 1 - totalCostJpy / revenueEstimate : 0;

  return (
    <div className="mx-auto w-full px-4 py-5" style={{ maxWidth: 1100 }}>
      <h1 className="mb-1 text-[16px] font-semibold tracking-tight">管理者</h1>
      <p className="mb-5 text-[12.5px] text-[var(--color-text-muted)]">
        この画面はサーバー側で管理者権限を検証しています（ADMIN_EMAILS）。
      </p>

      <div className="grid gap-4 lg:grid-cols-2">
        <section className="ac-panel p-4">
          <SectionLabel>バージョン（すべてバージョン管理対象）</SectionLabel>
          <dl className="flex flex-col gap-1 text-[12.5px]">
            <Row label="Role Registry" value={ROLE_REGISTRY_VERSION} />
            <Row label="Safety Policy" value={SAFETY_POLICY_VERSION} />
            <Row label="Model Routing" value={MODEL_ROUTING_VERSION} />
            <Row label="Prompt" value={PROMPT_VERSION} />
          </dl>
        </section>

        <section className="ac-panel p-4">
          <SectionLabel>ワークトークン換算率</SectionLabel>
          <dl className="flex flex-col gap-1 text-[12.5px]">
            <Row
              label="1WTあたりAPI原価上限"
              value={`${COST_MODEL.targetCostPerWorkTokenJpy} 円`}
            />
            <Row label="安全係数" value={`×${COST_MODEL.safetyFactor}`} />
            <Row label="USD→JPY" value={`${COST_MODEL.usdToJpy} 円`} />
            <Row label="目標粗利" value={`${Math.round(COST_MODEL.targetGrossMargin * 100)}%`} />
            <Row
              label="高額確認の閾値"
              value={`${COST_MODEL.highCostApprovalThresholdWorkTokens.toLocaleString("ja-JP")} WT`}
            />
          </dl>
          <p className="mt-2 text-[11px] text-[var(--color-text-faint)]">
            src/config/pricing.ts で変更できます（為替・各社価格改定に対応）。
          </p>
        </section>

        <section className="ac-panel p-4">
          <SectionLabel>API原価と粗利推定</SectionLabel>
          <dl className="flex flex-col gap-1 text-[12.5px]">
            <Row label="累計API原価" value={`${totalCostJpy.toFixed(2)} 円`} />
            <Row label="累計ワークトークン" value={totalWorkTokens.toLocaleString("ja-JP")} />
            <Row label="粗利推定" value={`${Math.round(grossMargin * 100)}%`} />
          </dl>
          <p className="mt-2 text-[11px] text-[var(--color-text-faint)]">
            この内訳は管理者のみに表示されます（一般ユーザーへは公開しません）。
          </p>
        </section>

        <section className="ac-panel p-4">
          <SectionLabel>Provider 状態</SectionLabel>
          <ul className="flex flex-col gap-1 text-[12.5px]">
            {providerStatuses().map((p) => (
              <li key={p.kind} className="flex justify-between gap-3">
                <span className="text-[var(--color-text-faint)]">{p.kind}</span>
                <span>
                  {p.name} ・{" "}
                  <span
                    style={{
                      color:
                        p.mode === "live"
                          ? "var(--color-positive)"
                          : p.mode === "mock"
                            ? "var(--color-accent)"
                            : "var(--color-text-faint)",
                    }}
                  >
                    {p.mode}
                  </span>
                </span>
              </li>
            ))}
          </ul>
        </section>

        <section className="ac-panel p-4 lg:col-span-2">
          <SectionLabel>モデルルーティング設定</SectionLabel>
          <div className="overflow-x-auto">
            <table className="w-full text-[12px]">
              <thead>
                <tr style={{ background: "var(--color-bg-raised)" }}>
                  {["タスク種別", "primary", "fallback", "最大文脈", "品質", "構造化"].map((h) => (
                    <th key={h} className="border-b px-2 py-1.5 text-left font-medium ac-hairline">
                      {h}
                    </th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {Object.entries(MODEL_ROUTING).map(([kind, rule]) => (
                  <tr key={kind}>
                    <td className="border-b px-2 py-1.5 ac-hairline">{kind}</td>
                    <td className="border-b px-2 py-1.5 ac-hairline">{rule.primary}</td>
                    <td className="border-b px-2 py-1.5 ac-hairline">{rule.fallback}</td>
                    <td className="border-b px-2 py-1.5 text-right ac-hairline">
                      {rule.maxContextTokens.toLocaleString("ja-JP")}
                    </td>
                    <td className="border-b px-2 py-1.5 text-right ac-hairline">
                      {rule.qualityTarget}
                    </td>
                    <td className="border-b px-2 py-1.5 ac-hairline">
                      {rule.structured ? "必要" : "—"}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </section>

        <section className="ac-panel p-4 lg:col-span-2">
          <SectionLabel>職種テンプレートと Tool Policy</SectionLabel>
          <div className="overflow-x-auto">
            <table className="w-full text-[12px]">
              <thead>
                <tr style={{ background: "var(--color-bg-raised)" }}>
                  {["職種", "Capability", "許可ツール", "承認必須", "禁止"].map((h) => (
                    <th key={h} className="border-b px-2 py-1.5 text-left font-medium ac-hairline">
                      {h}
                    </th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {ALL_ROLE_KEYS.map((key) => {
                  const role = ROLE_DEFINITIONS[key];
                  return (
                    <tr key={key}>
                      <td className="border-b px-2 py-1.5 ac-hairline">{role.name}</td>
                      <td className="border-b px-2 py-1.5 ac-hairline">
                        {role.allowedCapabilities.length}
                      </td>
                      <td className="border-b px-2 py-1.5 ac-hairline">
                        {role.allowedTools.join(", ")}
                      </td>
                      <td className="border-b px-2 py-1.5 ac-hairline">
                        {role.approvalRequiredActions.join(", ") || "—"}
                      </td>
                      <td className="border-b px-2 py-1.5 ac-hairline">
                        {role.prohibitedActions.join(", ")}
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        </section>

        <section className="ac-panel p-4">
          <SectionLabel>Safety 判定（直近）</SectionLabel>
          <p className="mb-2 text-[12px]">
            24時間の RED 判定: {abuse.redCount24h} 件 ・ 対応: {abuse.action}
          </p>
          <ul className="flex max-h-48 flex-col gap-1 overflow-y-auto text-[12px]">
            {safetyDecisions.map((d) => (
              <li key={d.id} className="flex justify-between gap-2">
                <span className="truncate text-[var(--color-text-muted)]">
                  {d.stage} ・ {d.categories.join(", ") || "—"}
                </span>
                <span
                  style={{
                    color:
                      d.level === "RED"
                        ? "var(--color-danger)"
                        : d.level === "ORANGE"
                          ? "var(--color-warn)"
                          : d.level === "YELLOW"
                            ? "var(--color-caution)"
                            : "var(--color-positive)",
                  }}
                >
                  {d.level}
                </span>
              </li>
            ))}
            {safetyDecisions.length === 0 && (
              <li className="text-[var(--color-text-faint)]">記録はありません。</li>
            )}
          </ul>
        </section>

        <section className="ac-panel p-4">
          <SectionLabel>監査ログ（直近）</SectionLabel>
          <ul className="flex max-h-48 flex-col gap-1 overflow-y-auto text-[12px]">
            {auditEvents.map((e) => (
              <li key={e.id} className="flex justify-between gap-2">
                <span className="truncate text-[var(--color-text-muted)]">
                  {e.type} ・ {e.target}
                </span>
                <span className="shrink-0 text-[var(--color-text-faint)]">
                  {new Date(e.createdAt).toLocaleTimeString("ja-JP")}
                </span>
              </li>
            ))}
            {auditEvents.length === 0 && (
              <li className="text-[var(--color-text-faint)]">記録はありません。</li>
            )}
          </ul>
        </section>

        <section className="ac-panel p-4 lg:col-span-2">
          <SectionLabel>プラン設定</SectionLabel>
          <div className="grid gap-2 sm:grid-cols-2 lg:grid-cols-4">
            {Object.values(PLANS).map((plan) => (
              <div key={plan.key} className="text-[12px]">
                <p className="font-medium">{plan.name}</p>
                <p className="text-[var(--color-text-muted)]">
                  ¥{plan.monthlyPriceJpy.toLocaleString("ja-JP")} /{" "}
                  {plan.monthlyWorkTokens.toLocaleString("ja-JP")} WT
                </p>
              </div>
            ))}
          </div>
          <div className="mt-3 grid gap-2 sm:grid-cols-3">
            {CREDIT_PACKS.map((pack) => (
              <div key={pack.key} className="text-[12px]">
                <p className="font-medium">{pack.workTokens.toLocaleString("ja-JP")} WT</p>
                <p className="text-[var(--color-text-muted)]">
                  ¥{pack.priceJpy.toLocaleString("ja-JP")}
                </p>
              </div>
            ))}
          </div>
          <div className="mt-3 text-[11.5px] text-[var(--color-text-faint)]">
            LLM 以外の原価: 画像 ${PROVIDER_UNIT_COSTS.image.perImageUsd}/枚 ・ 動画 $
            {PROVIDER_UNIT_COSTS.video.perSecondUsd}/秒 ・ 検索 $
            {PROVIDER_UNIT_COSTS.search.perQueryUsd}/回 ・ ストレージ $
            {PROVIDER_UNIT_COSTS.storage.perGbMonthUsd}/GB月
          </div>
        </section>
      </div>
    </div>
  );
}

function Row({ label, value }: { label: string; value: string }) {
  return (
    <div className="flex justify-between gap-3">
      <dt className="text-[var(--color-text-faint)]">{label}</dt>
      <dd className="text-right">{value}</dd>
    </div>
  );
}
