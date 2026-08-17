"use client";

import { useState, useSyncExternalStore } from "react";
import { useRouter } from "next/navigation";
import { SectionLabel } from "@/components/ui/primitives";

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
  const motionOff = useSyncExternalStore(
    subscribeToMotion,
    getMotionSnapshot,
    getMotionServerSnapshot,
  );

  function toggleMotion(off: boolean) {
    if (off) {
      localStorage.setItem("ac_motion", "off");
      document.documentElement.dataset.motion = "off";
    } else {
      localStorage.removeItem("ac_motion");
      delete document.documentElement.dataset.motion;
    }
  }

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
        <label className="flex items-center justify-between gap-4 py-1.5">
          <span className="text-[12.5px]">
            アニメーションを無効にする
            <span className="mt-0.5 block text-[11.5px] text-[var(--color-text-faint)]">
              粒子アニメーションや画面遷移の演出を停止します。
              自動では品質を下げないため、必要な場合はここで切り替えてください。
            </span>
          </span>
          <button
            type="button"
            role="switch"
            aria-checked={motionOff}
            onClick={() => toggleMotion(!motionOff)}
            className="relative h-6 w-11 shrink-0 cursor-pointer rounded-full transition-colors"
            style={{ background: motionOff ? "var(--color-accent)" : "var(--color-bg-active)" }}
          >
            <span
              className="absolute left-0 top-0.5 h-5 w-5 rounded-full bg-white shadow transition-transform"
              style={{ transform: motionOff ? "translateX(22px)" : "translateX(2px)" }}
              aria-hidden
            />
          </button>
        </label>
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

function subscribeToMotion(onChange: () => void): () => void {
  const observer = new MutationObserver(onChange);
  observer.observe(document.documentElement, {
    attributes: true,
    attributeFilter: ["data-motion"],
  });
  return () => observer.disconnect();
}

function getMotionSnapshot(): boolean {
  return document.documentElement.dataset.motion === "off";
}

function getMotionServerSnapshot(): boolean {
  return false;
}

function Row({ label, value }: { label: string; value: string }) {
  return (
    <div className="flex justify-between gap-3">
      <dt className="text-[var(--color-text-faint)]">{label}</dt>
      <dd className="text-right">{value}</dd>
    </div>
  );
}
