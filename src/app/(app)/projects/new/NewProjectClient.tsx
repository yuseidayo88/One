"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { SectionLabel } from "@/components/ui/primitives";

const EXAMPLES = [
  "美容室向けの予約・集客SaaSを立ち上げる",
  "既存サービスの解約率を下げる施策を検討する",
  "新しい料金プランを設計して告知する",
];

/**
 * 新しい業務（プロジェクト）を作る。
 * 作った直後は下書きで、統括AIは中央に居る。実行するまで採用も課金も行わない。
 */
export function NewProjectClient() {
  const router = useRouter();
  const [name, setName] = useState("");
  const [description, setDescription] = useState("");
  const [busy, setBusy] = useState(false);
  const [notice, setNotice] = useState("");

  async function submit() {
    if (!name.trim() || busy) return;
    setBusy(true);
    setNotice("");
    try {
      const res = await fetch("/api/projects", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({
          action: "create",
          name: name.trim(),
          description: description.trim(),
        }),
      });
      const json = await res.json();
      if (!res.ok) {
        setNotice(json?.error?.message ?? "作成できませんでした");
        return;
      }
      router.push(`/projects/${json.data.projectId}`);
      router.refresh();
    } catch {
      setNotice("通信に失敗しました");
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="mx-auto w-full px-4 py-6" style={{ maxWidth: 640 }}>
      <h1 className="mb-1 text-[16px] font-semibold tracking-tight">新しい業務</h1>
      <p className="mb-5 text-[12.5px] text-[var(--color-text-muted)]">
        やりたいことを書いてください。統括AIが仕事を分解し、必要なAI社員を提案します。
        採用も実行も、あなたが「実行する」を押すまで始まりません。
      </p>

      <section className="ac-panel p-4">
        <SectionLabel>業務名</SectionLabel>
        <input
          className="ac-input"
          autoFocus
          placeholder="例）美容室向け予約SaaSの立ち上げ"
          value={name}
          maxLength={120}
          onChange={(e) => setName(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === "Enter") void submit();
          }}
          aria-label="業務名"
        />

        <div className="mt-2 flex flex-wrap gap-1.5">
          {EXAMPLES.map((example) => (
            <button
              key={example}
              className="ac-chip cursor-pointer transition-colors hover:bg-[var(--color-bg-hover)]"
              onClick={() => setName(example)}
            >
              {example}
            </button>
          ))}
        </div>

        <div className="mt-4">
          <SectionLabel>補足（任意）</SectionLabel>
          <textarea
            className="ac-input min-h-24 resize-y"
            placeholder="対象のお客様、締め切り、予算など、分かっていることがあれば書いてください。"
            value={description}
            maxLength={2000}
            onChange={(e) => setDescription(e.target.value)}
            aria-label="補足"
          />
        </div>

        {notice && (
          <p role="status" className="mt-2 text-[12px] text-[var(--color-caution)]">
            {notice}
          </p>
        )}

        <button
          className="ac-btn ac-btn-primary mt-4 w-full"
          onClick={submit}
          disabled={busy || !name.trim()}
        >
          統括AIに相談する
        </button>
      </section>
    </div>
  );
}
