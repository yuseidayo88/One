"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { SectionLabel } from "@/components/ui/primitives";
import { applyMotionLevel, useMotionLevel } from "@/components/motion/useMotionLevel";
import {
  MOTION_LEVELS,
  MOTION_LEVEL_DESCRIPTION,
  MOTION_LEVEL_LABEL,
} from "@/lib/motion/level";

export function SettingsClient({
  organizationName,
  displayName,
  email,
  planKey,
  locale,
  appName,
  isAdmin,
}: {
  organizationName: string;
  displayName: string;
  email: string;
  planKey: string;
  locale: string;
  appName: string;
  isAdmin: boolean;
}) {
  const router = useRouter();
  const [busy, setBusy] = useState(false);

  // 設定は <html data-motion> が正。localStorage の値は layout の
  // インラインスクリプトが hydration 前に反映しているため、
  // ここでは DOM を外部ストアとして購読する（effect 内 setState を避ける）。
  const motionLevel = useMotionLevel();

  async function logout() {
    setBusy(true);
    await fetch("/api/auth/logout", { method: "POST" });
    router.push("/login");
    router.refresh();
  }

  async function resumeAll() {
    setBusy(true);
    try {
      await fetch("/api/employees", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ action: "resume_all" }),
      });
      router.refresh();
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="mx-auto w-full px-4 py-5" style={{ maxWidth: 720 }}>
      <h1 className="mb-4 text-[16px] font-semibold tracking-tight">設定</h1>

      <section className="ac-panel mb-4 p-4">
        <SectionLabel>アカウント</SectionLabel>
        <dl className="flex flex-col gap-1.5 text-[12.5px]">
          <Row label="お名前" value={displayName} />
          <Row label="メールアドレス" value={email} />
          <Row label="会社名" value={organizationName} />
          <Row label="プラン" value={planKey} />
          <Row label="権限" value={isAdmin ? "管理者" : "一般"} />
        </dl>
        <button className="ac-btn mt-3" onClick={logout} disabled={busy}>
          ログアウト
        </button>
      </section>

      <section className="ac-panel mb-4 p-4">
        <SectionLabel>表示と動き</SectionLabel>
        <fieldset>
          <legend className="text-[12.5px]">
            アニメーション
            <span className="mt-0.5 block text-[11.5px] text-[var(--color-text-faint)]">
              端末の状態を見て自動で品質を下げることはしません。ここでの選択だけを使います。
            </span>
          </legend>
          <div className="mt-2 flex flex-col gap-1.5" role="radiogroup" aria-label="アニメーション">
            {MOTION_LEVELS.map((level) => (
              <button
                key={level}
                type="button"
                role="radio"
                aria-checked={motionLevel === level}
                onClick={() => applyMotionLevel(level)}
                className="flex items-start gap-2.5 rounded-xl border px-3 py-2.5 text-left transition-colors"
                style={{
                  borderColor:
                    motionLevel === level ? "var(--color-accent)" : "var(--color-line-strong)",
                  background:
                    motionLevel === level ? "var(--color-accent-soft)" : "var(--color-bg-raised)",
                }}
              >
                <span
                  className="mt-0.5 flex h-4 w-4 shrink-0 items-center justify-center rounded-full border"
                  style={{
                    borderColor:
                      motionLevel === level ? "var(--color-accent)" : "var(--color-line-strong)",
                  }}
                  aria-hidden
                >
                  {motionLevel === level && (
                    <span
                      className="h-2 w-2 rounded-full"
                      style={{ background: "var(--color-accent)" }}
                    />
                  )}
                </span>
                <span className="min-w-0">
                  <span className="block text-[12.5px] font-medium">
                    {MOTION_LEVEL_LABEL[level]}
                  </span>
                  <span className="block text-[11.5px] text-[var(--color-text-faint)]">
                    {MOTION_LEVEL_DESCRIPTION[level]}
                  </span>
                </span>
              </button>
            ))}
          </div>
        </fieldset>
        <dl className="mt-2 flex flex-col gap-1.5 text-[12.5px]">
          <Row label="テーマ" value="ダーク（初期リリースはダークのみ）" />
          <Row label="言語" value={locale === "ja" ? "日本語" : locale} />
          <Row label="プロダクト名" value={appName} />
        </dl>
        <p className="mt-2 text-[11px] text-[var(--color-text-faint)]">
          プロダクト名は環境変数 NEXT_PUBLIC_APP_NAME で変更できます。
          言語は将来の多言語化に備えて設定値として保持しています。
        </p>
      </section>

      <section className="ac-panel p-4">
        <SectionLabel>安全と実行制御</SectionLabel>
        <p className="text-[12.5px] leading-relaxed text-[var(--color-text-muted)]">
          ヘッダーの「全停止」で、実行中のすべてのタスクを中断し、全社員を一時停止できます。
          停止した社員をまとめて再開する場合は、下のボタンを使用してください。
        </p>
        <button className="ac-btn mt-3" onClick={resumeAll} disabled={busy}>
          全社員を再開する
        </button>

        <ul className="mt-4 flex flex-col gap-1 text-[11.5px] text-[var(--color-text-faint)]">
          <li>・メール送信、SNS投稿、広告公開、本番公開、ドメイン操作、支払い、本番DB変更、データ削除、新しいOAuth権限付与、契約・申請、高額な処理、個人情報の外部送信は、必ず承認を求めます。</li>
          <li>・外部から取得したデータ（メール・Webページ・PDF・検索結果）は未信頼データとして扱い、そこに書かれた指示には従いません。</li>
          <li>・危険と判定された依頼は、ツール実行の前に停止されます。</li>
        </ul>
      </section>
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
