"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import type { Approval, EmployeeInstance } from "@/lib/core/types";
import { AllGlyphs as Glyphs, EmptyState, IconTile, SectionLabel } from "@/components/ui/primitives";

/**
 * 承認待ちの一覧。統括AIパネルではなく、専用画面で判断する。
 * 何が起きるのか（実行内容・影響範囲・費用・取り消せるか）を必ず並べる。
 */
export function ApprovalsClient({
  approvals,
  employees,
}: {
  approvals: Approval[];
  employees: EmployeeInstance[];
}) {
  const router = useRouter();
  const [busy, setBusy] = useState<string | null>(null);
  const [notice, setNotice] = useState("");

  async function decide(approvalId: string, decision: "approved" | "rejected") {
    setBusy(approvalId);
    setNotice("");
    try {
      const res = await fetch("/api/approvals", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ approvalId, decision }),
      });
      const json = await res.json();
      if (!res.ok) {
        setNotice(json?.error?.message ?? "処理できませんでした");
        return;
      }
      router.refresh();
    } finally {
      setBusy(null);
    }
  }

  return (
    <div className="mx-auto w-full px-4 py-5" style={{ maxWidth: 860 }}>
      <h1 className="mb-4 text-[16px] font-semibold tracking-tight">承認待ち</h1>

      {notice && (
        <p role="status" className="mb-3 text-[12px] text-[var(--color-caution)]">
          {notice}
        </p>
      )}

      {approvals.length === 0 ? (
        <EmptyState
          title="承認待ちはありません"
          description="外部送信・公開・支払いなど、取り消しにくい操作だけがここに届きます。"
        />
      ) : (
        <ul className="flex flex-col gap-3">
          {approvals.map((approval) => {
            const employee = employees.find((e) => e.id === approval.employeeId);
            return (
              <li key={approval.id} className="ac-panel p-4">
                <div className="flex items-center gap-2.5">
                  <IconTile color="var(--color-caution)" glyph={Glyphs.warn} />
                  <div className="min-w-0 flex-1">
                    <p className="truncate text-[13px] font-medium">{approval.title}</p>
                    <p className="text-[11px] text-[var(--color-text-faint)]">
                      {employee?.name ?? "AI社員"} ・ 期限{" "}
                      {new Date(approval.expiresAt).toLocaleString("ja-JP")}
                    </p>
                  </div>
                </div>

                <dl className="mt-3 grid gap-x-6 gap-y-1 text-[12px] sm:grid-cols-2">
                  <Row label="実行内容" value={approval.what} />
                  <Row label="影響範囲" value={approval.affects} />
                  <Row label="使用サービス" value={approval.service} />
                  <Row label="送信先" value={approval.destination} />
                  <Row
                    label="予想費用"
                    value={`${approval.estimatedCostJpy.toLocaleString("ja-JP")} 円`}
                  />
                  <Row
                    label="ワークトークン"
                    value={`${approval.estimatedWorkTokens.toLocaleString("ja-JP")} WT`}
                  />
                  <Row label="元に戻せるか" value={approval.reversible ? "戻せます" : "戻せません"} />
                  <Row label="リスク" value={approval.risk} />
                </dl>

                {approval.diff && (
                  <>
                    <div className="mt-3">
                      <SectionLabel>変更内容</SectionLabel>
                    </div>
                    <pre
                      className="overflow-x-auto rounded-lg p-3 text-[11.5px]"
                      style={{ background: "var(--color-bg)", color: "var(--color-text-muted)" }}
                    >
                      {approval.diff}
                    </pre>
                  </>
                )}

                <div className="mt-3 flex gap-2">
                  <button
                    className="ac-btn ac-btn-go"
                    disabled={busy === approval.id}
                    onClick={() => decide(approval.id, "approved")}
                  >
                    承認する
                  </button>
                  <button
                    className="ac-btn"
                    disabled={busy === approval.id}
                    onClick={() => decide(approval.id, "rejected")}
                  >
                    却下
                  </button>
                </div>
              </li>
            );
          })}
        </ul>
      )}
    </div>
  );
}

function Row({ label, value }: { label: string; value: string }) {
  return (
    <div className="flex gap-3">
      <dt className="w-[92px] shrink-0 text-[var(--color-text-faint)]">{label}</dt>
      <dd className="min-w-0 flex-1 break-words text-[var(--color-text-muted)]">{value}</dd>
    </div>
  );
}
