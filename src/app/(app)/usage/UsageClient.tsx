"use client";

import { useState } from "react";
import type { CreditLedgerEntry } from "@/lib/core/types";
import type { CreditPack, Plan } from "@/config/pricing";
import type { UsageSummary } from "@/lib/credits/ledger";
import { SectionLabel } from "@/components/ui/primitives";

export function UsageClient({
  summary,
  employeeNames,
  ledger,
  currentPlan,
  subscriptionStatus,
  plans,
  packs,
}: {
  summary: UsageSummary;
  employeeNames: Record<string, string>;
  ledger: CreditLedgerEntry[];
  currentPlan: string;
  subscriptionStatus: string;
  plans: Plan[];
  packs: CreditPack[];
}) {
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState("");

  async function checkout(payload: { planKey?: string; packKey?: string }) {
    setBusy(true);
    setMessage("");
    try {
      const res = await fetch("/api/billing/checkout", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify(payload),
      });
      const json = await res.json();
      if (!res.ok) {
        setMessage(json?.error?.message ?? "決済を開始できませんでした");
        return;
      }
      window.location.href = json.data.url;
    } finally {
      setBusy(false);
    }
  }

  const maxMonth = Math.max(1, ...summary.byMonth.map((m) => m.workTokens));

  return (
    <div className="mx-auto w-full px-4 py-5" style={{ maxWidth: 1100 }}>
      <h1 className="mb-4 text-[16px] font-semibold tracking-tight">使用量・料金</h1>

      <div className="mb-5 grid gap-3 sm:grid-cols-4">
        <Stat label="残高" value={summary.balance} />
        <Stat label="予約中" value={summary.reserved} />
        <Stat label="利用可能" value={summary.available} accent />
        <Stat label="今月の使用量" value={summary.usedThisMonth} />
      </div>

      {message && (
        <p className="mb-4 text-[12.5px]" style={{ color: "var(--color-caution)" }}>
          {message}
        </p>
      )}

      <div className="grid gap-5 lg:grid-cols-2">
        <section className="ac-panel p-4">
          <SectionLabel>社員別の使用量</SectionLabel>
          {summary.byEmployee.length === 0 ? (
            <p className="text-[12px] text-[var(--color-text-faint)]">まだ使用実績はありません。</p>
          ) : (
            <ul className="flex flex-col gap-1.5">
              {summary.byEmployee.map((row) => (
                <li key={row.employeeId ?? "system"} className="flex items-center gap-2">
                  <span className="w-32 shrink-0 truncate text-[12.5px]">
                    {row.employeeId ? (employeeNames[row.employeeId] ?? "社員") : "統括AI・システム"}
                  </span>
                  <span
                    className="h-1.5 rounded-full"
                    style={{
                      width: `${Math.min(100, (row.workTokens / Math.max(1, summary.usedThisMonth || row.workTokens)) * 100)}%`,
                      background: "var(--color-accent)",
                      minWidth: 4,
                    }}
                  />
                  <span className="ml-auto text-[12px] tabular-nums text-[var(--color-text-muted)]">
                    {row.workTokens.toLocaleString("ja-JP")}
                  </span>
                </li>
              ))}
            </ul>
          )}
        </section>

        <section className="ac-panel p-4">
          <SectionLabel>モデル別の使用量</SectionLabel>
          {summary.byModel.length === 0 ? (
            <p className="text-[12px] text-[var(--color-text-faint)]">まだ使用実績はありません。</p>
          ) : (
            <ul className="flex flex-col gap-1.5">
              {summary.byModel.map((row) => (
                <li key={row.logicalModel} className="flex items-center justify-between gap-2">
                  <span className="text-[12.5px]">{row.logicalModel}</span>
                  <span className="text-[12px] tabular-nums text-[var(--color-text-muted)]">
                    {row.workTokens.toLocaleString("ja-JP")} WT
                  </span>
                </li>
              ))}
            </ul>
          )}
        </section>

        <section className="ac-panel p-4">
          <SectionLabel>月別の使用量</SectionLabel>
          <div className="flex h-24 items-end gap-2">
            {summary.byMonth.map((m) => (
              <div key={m.month} className="flex flex-1 flex-col items-center gap-1">
                <div
                  className="w-full rounded-t transition-all"
                  style={{
                    height: `${(m.workTokens / maxMonth) * 72}px`,
                    background: "var(--color-accent)",
                    minHeight: 2,
                  }}
                />
                <span className="text-[10px] text-[var(--color-text-faint)]">
                  {m.month.slice(5)}月
                </span>
              </div>
            ))}
            {summary.byMonth.length === 0 && (
              <p className="text-[12px] text-[var(--color-text-faint)]">データがありません。</p>
            )}
          </div>
        </section>

        <section className="ac-panel p-4">
          <SectionLabel>台帳（直近）</SectionLabel>
          <ul className="flex max-h-48 flex-col gap-1 overflow-y-auto">
            {ledger.map((entry) => (
              <li key={entry.id} className="flex items-center justify-between gap-2 text-[12px]">
                <span className="truncate text-[var(--color-text-muted)]">
                  <span className="ac-chip mr-1.5">{entry.type}</span>
                  {entry.note}
                </span>
                <span
                  className="shrink-0 tabular-nums"
                  style={{
                    color: entry.amount > 0 ? "var(--color-positive)" : "var(--color-text-muted)",
                  }}
                >
                  {entry.amount > 0 ? "+" : ""}
                  {entry.amount.toLocaleString("ja-JP")}
                </span>
              </li>
            ))}
          </ul>
        </section>
      </div>

      <section className="mt-6">
        <SectionLabel>プラン</SectionLabel>
        <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
          {plans.map((plan) => {
            const isCurrent = plan.key === currentPlan;
            return (
              <div
                key={plan.key}
                className="ac-panel flex flex-col p-4"
                style={{ borderColor: isCurrent ? "var(--color-accent)" : "var(--color-line)" }}
              >
                <div className="flex items-center gap-2">
                  <h3 className="text-[13.5px] font-medium">{plan.name}</h3>
                  {isCurrent && <span className="ac-chip">利用中</span>}
                </div>
                <p className="mt-2 text-[19px] font-semibold tabular-nums">
                  {plan.monthlyPriceJpy === 0
                    ? "無料"
                    : `¥${plan.monthlyPriceJpy.toLocaleString("ja-JP")}`}
                  {plan.monthlyPriceJpy > 0 && (
                    <span className="ml-1 text-[11px] font-normal text-[var(--color-text-faint)]">
                      /月
                    </span>
                  )}
                </p>
                <p className="mt-1 text-[12px] text-[var(--color-text-muted)]">
                  {plan.monthlyWorkTokens.toLocaleString("ja-JP")} ワークトークン / 月
                </p>
                <ul className="mt-2 flex flex-1 flex-col gap-0.5 text-[11.5px] text-[var(--color-text-faint)]">
                  {plan.highlights.map((h) => (
                    <li key={h}>・{h}</li>
                  ))}
                </ul>
                {!isCurrent && plan.key !== "free" && (
                  <button
                    className="ac-btn ac-btn-primary mt-3"
                    disabled={busy}
                    onClick={() => checkout({ planKey: plan.key })}
                  >
                    このプランにする
                  </button>
                )}
              </div>
            );
          })}
        </div>
        <p className="mt-2 text-[11.5px] text-[var(--color-text-faint)]">
          現在の契約状態: {subscriptionStatus}
        </p>
      </section>

      <section className="mt-6">
        <SectionLabel>ワークトークンの追加購入</SectionLabel>
        <div className="grid gap-3 sm:grid-cols-3">
          {packs.map((pack) => (
            <div key={pack.key} className="ac-panel flex items-center gap-3 p-4">
              <div className="min-w-0 flex-1">
                <p className="text-[13.5px] font-medium tabular-nums">
                  {pack.workTokens.toLocaleString("ja-JP")} WT
                </p>
                <p className="text-[12px] text-[var(--color-text-muted)]">
                  ¥{pack.priceJpy.toLocaleString("ja-JP")}
                </p>
              </div>
              <button
                className="ac-btn"
                disabled={busy}
                onClick={() => checkout({ packKey: pack.key })}
              >
                購入
              </button>
            </div>
          ))}
        </div>
      </section>
    </div>
  );
}

function Stat({ label, value, accent }: { label: string; value: number; accent?: boolean }) {
  return (
    <div className="ac-panel p-4">
      <p className="text-[11px] uppercase tracking-[0.08em] text-[var(--color-text-faint)]">
        {label}
      </p>
      <p
        className="mt-1 text-[20px] font-semibold tabular-nums"
        style={{ color: accent ? "var(--color-accent)" : "var(--color-text)" }}
      >
        {value.toLocaleString("ja-JP")}
      </p>
      <p className="text-[11px] text-[var(--color-text-faint)]">ワークトークン</p>
    </div>
  );
}
