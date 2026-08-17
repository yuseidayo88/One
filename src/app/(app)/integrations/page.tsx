import { requireSession } from "@/lib/auth/session";
import { providerStatuses } from "@/lib/providers";
import { DEFAULT_AUTO_REPLY } from "@/lib/providers/email";
import { SectionLabel } from "@/components/ui/primitives";

export const dynamic = "force-dynamic";

const KIND_LABEL: Record<string, string> = {
  llm: "LLM（統括AI・社員の思考）",
  image: "画像生成・編集",
  video: "動画生成",
  email: "メール",
  search: "Web検索",
  storage: "ストレージ",
  deployment: "デプロイ・ドメイン",
  billing: "課金",
};

const KIND_NOTE: Record<string, string> = {
  llm: "重要な経営会話・複雑な分解・長文分析・コーディングは高品質モデル、短い分類・要約・通知文は安価なモデルへ自動で振り分けます。",
  image:
    "Nano Banana 系（Google系画像生成モデル）を画像生成・画像編集用として扱います。動画生成には使用しません。",
  video:
    "Higgsfield / Seedance などを想定。公式APIが利用可能になるまでは Adapter と Mock のみを用意しています（非公式APIは使用しません）。",
  email:
    "Resend による送信に対応する構造です。その後 Gmail / Outlook を OAuth で接続できます。受信メール本文は未信頼データとして扱います。",
  search: "検索結果は未信頼データとして扱い、出典（確認日つき）として成果物に保存します。",
  storage: "成果物は組織ごとに分離されたパスへ保存されます。",
  deployment:
    "Cloudflare Pages/Workers への Preview / Production デプロイ、DNS 確認・提案、SSL/WAF 状態、公開履歴とロールバックに対応する構造です。",
  billing: "Stripe による月額課金と追加クレジット購入。Webhook は署名検証済みのもののみ処理します。",
};

export default async function IntegrationsPage() {
  await requireSession();
  const statuses = providerStatuses();

  return (
    <div className="mx-auto w-full px-4 py-5" style={{ maxWidth: 1000 }}>
      <h1 className="mb-1 text-[16px] font-semibold tracking-tight">連携</h1>
      <p className="mb-5 text-[12.5px] text-[var(--color-text-muted)]">
        APIキーが未設定の項目は Mock で動作します。Mock のままでも主要機能を通しで試せます。
      </p>

      <div className="grid gap-3 sm:grid-cols-2">
        {statuses.map((status) => (
          <section key={status.kind} className="ac-panel p-4">
            <div className="flex items-center gap-2">
              <h2 className="text-[13.5px] font-medium">{KIND_LABEL[status.kind] ?? status.kind}</h2>
              <span
                className="ac-chip ml-auto"
                style={{
                  color:
                    status.mode === "live"
                      ? "var(--color-positive)"
                      : status.mode === "mock"
                        ? "var(--color-accent)"
                        : "var(--color-text-faint)",
                }}
              >
                {status.mode === "live" ? "接続済み" : status.mode === "mock" ? "Mock" : "未接続"}
              </span>
            </div>
            <p className="mt-1 text-[11.5px] text-[var(--color-text-faint)]">
              Provider: {status.name}
            </p>
            <p className="mt-2 text-[12px] leading-relaxed text-[var(--color-text-muted)]">
              {KIND_NOTE[status.kind]}
            </p>
            {"available" in status && Array.isArray(status.available) && (
              <div className="mt-2 flex flex-wrap gap-1">
                {status.available.map((m) => (
                  <span key={m} className="ac-chip">
                    {m}
                  </span>
                ))}
              </div>
            )}
          </section>
        ))}
      </div>

      <section className="ac-panel mt-5 p-4">
        <SectionLabel>メールの自動返信</SectionLabel>
        <p className="text-[12.5px] text-[var(--color-text-muted)]">
          初期状態では自動返信は <strong>無効</strong> です。下書きを作成し、必ずユーザーの承認を得てから送信します。
        </p>
        <dl className="mt-3 grid gap-2 text-[12px] sm:grid-cols-2">
          <Row label="自動返信" value={DEFAULT_AUTO_REPLY.enabled ? "有効" : "無効"} />
          <Row
            label="営業時間"
            value={`${DEFAULT_AUTO_REPLY.businessHours.start}–${DEFAULT_AUTO_REPLY.businessHours.end}（${DEFAULT_AUTO_REPLY.businessHours.timezone}）`}
          />
          <Row label="1日の送信上限" value={String(DEFAULT_AUTO_REPLY.dailySendLimit)} />
          <Row label="除外キーワード" value={DEFAULT_AUTO_REPLY.excludedKeywords.join(" / ")} />
          <Row
            label="人間承認が必要な条件"
            value={DEFAULT_AUTO_REPLY.requireHumanApprovalWhen.join(" / ")}
          />
          <Row label="緊急停止" value={DEFAULT_AUTO_REPLY.emergencyStop ? "作動中" : "待機"} />
        </dl>
      </section>

      <section className="ac-panel mt-4 p-4">
        <SectionLabel>ドメインの取得について</SectionLabel>
        <p className="text-[12.5px] leading-relaxed text-[var(--color-text-muted)]">
          ドメイン取得は、公式APIでユーザーアカウントから実行できる場合のみ自動化します。
          購入前には必ず、ドメイン名・初年度価格・更新価格・購入者情報・自動更新・支払額・返金可能性・
          取得後のDNS設定を表示し、承認を得てから実行します。
          公式APIで購入できない場合は、Cloudflare 上での手順を案内し、取得後の接続から自動化します。
        </p>
      </section>
    </div>
  );
}

function Row({ label, value }: { label: string; value: string }) {
  return (
    <div className="flex justify-between gap-3">
      <dt className="text-[var(--color-text-faint)]">{label}</dt>
      <dd className="text-right text-[var(--color-text-muted)]">{value}</dd>
    </div>
  );
}
