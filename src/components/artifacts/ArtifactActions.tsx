"use client";

import { useState } from "react";

/**
 * 成果物に対する操作。
 *
 * 「送信」「公開」は取り消しにくいので、サーバー側で承認が必要になることがある。
 * その場合はここでは実行せず、承認待ちになったことだけを伝える。
 */
export function ArtifactActions({
  artifactId,
  onDone,
}: {
  artifactId: string;
  onDone: () => void;
}) {
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState("");

  async function act(action: string, note?: string) {
    setBusy(true);
    setMessage("");
    try {
      const res = await fetch("/api/artifacts", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ artifactId, action, note }),
      });
      const json = await res.json();
      if (!res.ok) {
        setMessage(json?.error?.message ?? "処理に失敗しました");
        return;
      }
      if (json.data?.requiresApproval) {
        setMessage(json.data.message);
        return;
      }
      onDone();
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="flex w-full flex-wrap items-center justify-end gap-2">
      {message && (
        <span role="status" className="mr-auto text-[11.5px] text-[var(--color-caution)]">
          {message}
        </span>
      )}
      <button
        className="ac-btn"
        disabled={busy}
        onClick={() => {
          const note = prompt("修正してほしい点を入力してください");
          if (note) void act("request_revision", note);
        }}
      >
        修正を依頼
      </button>
      <button className="ac-btn" disabled={busy} onClick={() => act("send")}>
        送信
      </button>
      <button className="ac-btn" disabled={busy} onClick={() => act("publish")}>
        公開
      </button>
      <button className="ac-btn ac-btn-go" disabled={busy} onClick={() => act("approve")}>
        承認する
      </button>
    </div>
  );
}
