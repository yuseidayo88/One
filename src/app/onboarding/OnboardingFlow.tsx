"use client";

import { useRouter } from "next/navigation";
import { useState } from "react";
import { ROLE_DEFINITIONS } from "@/lib/roles/registry";
import type { RoleKey, SafetyLevel } from "@/lib/core/types";
import { EmployeeParticles } from "@/components/particles/EmployeeParticles";
import { SafetyBadge } from "@/components/ui/primitives";

interface PlanOption {
  id: string;
  kind: string;
  title: string;
  description: string;
  roleKey: RoleKey | null;
  reason: string;
  estimatedDurationMinutes: number;
  estimatedWorkTokens: number;
  riskLevel: SafetyLevel;
  recommended: boolean;
}

interface PlanResponse {
  projectId: string;
  decisionId: string;
  blocked: boolean;
  safetyLevel: SafetyLevel;
  summary: string;
  hypotheses: string[];
  questions: string[];
  risks: string[];
  estimatedDuration: number;
  estimatedWorkTokens: number;
  proposedTasks: {
    refId: string;
    title: string;
    description: string;
    suggestedRole: RoleKey;
    estimatedDurationMinutes: number;
    estimatedWorkTokens: number;
  }[];
  options: PlanOption[];
  brief: { name: string; summary: string; regulatedNotes: string };
}

/**
 * 初回オンボーディング。
 * 一度に質問しすぎない形で、2 ステップに分けて確認する。
 */
export function OnboardingFlow() {
  const router = useRouter();
  const [step, setStep] = useState<"idea" | "details" | "plan">("idea");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const [plan, setPlan] = useState<PlanResponse | null>(null);
  const [selected, setSelected] = useState<Set<string>>(new Set());
  const [adjustment, setAdjustment] = useState("");

  const [form, setForm] = useState({
    businessIdea: "",
    targetCustomer: "",
    problem: "",
    progress: "",
    budget: "",
    deadline: "",
    ownerCanDo: "",
    delegateToAi: "",
    market: "domestic" as "domestic" | "overseas" | "both",
    regulatedNotes: "",
  });

  function update<K extends keyof typeof form>(key: K, value: (typeof form)[K]) {
    setForm((f) => ({ ...f, [key]: value }));
  }

  async function submitPlan() {
    setBusy(true);
    setError("");
    try {
      const res = await fetch("/api/onboarding", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify(form),
      });
      const json = await res.json();
      if (!res.ok) {
        setError(json?.error?.message ?? "提案の作成に失敗しました");
        return;
      }
      const data = json.data as PlanResponse;
      setPlan(data);
      setSelected(new Set(data.options.filter((o) => o.recommended).map((o) => o.id)));
      setStep("plan");
    } catch {
      setError("通信に失敗しました");
    } finally {
      setBusy(false);
    }
  }

  async function execute() {
    if (!plan || selected.size === 0) return;
    setBusy(true);
    setError("");
    try {
      const res = await fetch("/api/director/execute", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({
          decisionId: plan.decisionId,
          selectedOptionIds: [...selected],
          projectId: plan.projectId,
          startImmediately: true,
        }),
      });
      const json = await res.json();
      if (!res.ok) {
        setError(json?.error?.message ?? "実行に失敗しました");
        return;
      }
      // 実行が通った時点でプロジェクトは進行中。統括AIは右パネルに居る。
      router.push(`/projects/${json.data?.activatedProjectId ?? plan.projectId}`);
      router.refresh();
    } catch {
      setError("通信に失敗しました");
    } finally {
      setBusy(false);
    }
  }

  /* ── ステップ 1: 事業の希望 ─────────────────────── */
  if (step === "idea") {
    return (
      <div className="ac-panel p-5 ac-enter">
        <label className="flex flex-col gap-2">
          <span className="text-[12.5px] text-[var(--color-text-muted)]">
            やりたい事業（自由入力）
          </span>
          <textarea
            className="ac-input"
            rows={5}
            autoFocus
            placeholder="例）個人経営の美容室向けに、予約と集客を支援するSaaSを作りたい"
            value={form.businessIdea}
            onChange={(e) => update("businessIdea", e.target.value)}
            maxLength={4000}
          />
        </label>
        <div className="mt-4 flex items-center justify-between gap-3">
          <p className="text-[11.5px] text-[var(--color-text-faint)]">
            次の画面で、想定顧客や予算などを少しだけ伺います。
          </p>
          <button
            className="ac-btn ac-btn-primary"
            disabled={form.businessIdea.trim().length < 4}
            onClick={() => setStep("details")}
          >
            次へ
          </button>
        </div>
      </div>
    );
  }

  /* ── ステップ 2: 補足（一度に聞きすぎない） ──────── */
  if (step === "details") {
    return (
      <div className="ac-panel p-5 ac-enter">
        <div className="grid gap-4 sm:grid-cols-2">
          <Field label="想定しているお客様">
            <input
              className="ac-input"
              value={form.targetCustomer}
              onChange={(e) => update("targetCustomer", e.target.value)}
              placeholder="例）1〜3名で運営する美容室のオーナー"
            />
          </Field>
          <Field label="解決したい課題">
            <input
              className="ac-input"
              value={form.problem}
              onChange={(e) => update("problem", e.target.value)}
              placeholder="例）電話予約の取りこぼし"
            />
          </Field>
          <Field label="現在の進捗">
            <input
              className="ac-input"
              value={form.progress}
              onChange={(e) => update("progress", e.target.value)}
              placeholder="例）構想段階"
            />
          </Field>
          <Field label="予算の目安">
            <input
              className="ac-input"
              value={form.budget}
              onChange={(e) => update("budget", e.target.value)}
              placeholder="例）30万円"
            />
          </Field>
          <Field label="期限">
            <input
              className="ac-input"
              value={form.deadline}
              onChange={(e) => update("deadline", e.target.value)}
              placeholder="例）3か月以内"
            />
          </Field>
          <Field label="対象市場">
            <select
              className="ac-input"
              value={form.market}
              onChange={(e) => update("market", e.target.value as typeof form.market)}
            >
              <option value="domestic">日本国内</option>
              <option value="overseas">海外</option>
              <option value="both">両方</option>
            </select>
          </Field>
          <Field label="あなた自身ができること">
            <input
              className="ac-input"
              value={form.ownerCanDo}
              onChange={(e) => update("ownerCanDo", e.target.value)}
              placeholder="例）接客・SNS運用"
            />
          </Field>
          <Field label="AI社員に任せたいこと">
            <input
              className="ac-input"
              value={form.delegateToAi}
              onChange={(e) => update("delegateToAi", e.target.value)}
              placeholder="例）市場調査・集客戦略・LPデザイン・実装"
            />
          </Field>
        </div>

        {error && (
          <p className="mt-4 text-[12px]" style={{ color: "var(--color-danger)" }} role="alert">
            {error}
          </p>
        )}

        <div className="mt-5 flex items-center justify-between gap-3">
          <button className="ac-btn ac-btn-ghost" onClick={() => setStep("idea")}>
            戻る
          </button>
          <button className="ac-btn ac-btn-primary" onClick={submitPlan} disabled={busy}>
            {busy ? "統括AIが整理しています…" : "統括AIに相談する"}
          </button>
        </div>
      </div>
    );
  }

  /* ── ステップ 3: 提案カード ───────────────────── */
  if (!plan) return null;

  const totalWorkTokens = plan.options
    .filter((o) => selected.has(o.id))
    .reduce((sum, o) => sum + o.estimatedWorkTokens, 0);
  const totalMinutes = plan.options
    .filter((o) => selected.has(o.id))
    .reduce((sum, o) => sum + o.estimatedDurationMinutes, 0);

  return (
    <div className="flex flex-col gap-5">
      <section className="ac-panel p-5 ac-enter">
        <div className="mb-3 flex items-center gap-2">
          <EmployeeParticles roleKey="director" status="working" size={32} seed="onboarding" />
          <div>
            <p className="text-[13px] font-medium">統括AI</p>
            <p className="text-[11px] text-[var(--color-text-faint)]">事業内容の要約</p>
          </div>
          <div className="ml-auto">
            <SafetyBadge level={plan.safetyLevel} />
          </div>
        </div>

        <p className="whitespace-pre-wrap text-[13.5px] leading-relaxed">{plan.summary}</p>

        {plan.brief.regulatedNotes && (
          <p
            className="mt-3 rounded-lg px-3 py-2 text-[12px]"
            style={{ background: "#1b1710", color: "var(--color-caution)" }}
          >
            {plan.brief.regulatedNotes}
          </p>
        )}

        {plan.hypotheses.length > 0 && (
          <div className="mt-4">
            <h3 className="mb-1.5 text-[11px] uppercase tracking-[0.08em] text-[var(--color-text-faint)]">
              最初に検証すべき仮説
            </h3>
            <ul className="flex flex-col gap-1 text-[13px]">
              {plan.hypotheses.map((h, i) => (
                <li key={i} className="text-[var(--color-text-muted)]">
                  {i + 1}. {h}
                </li>
              ))}
            </ul>
          </div>
        )}

        {plan.questions.length > 0 && (
          <div className="mt-4">
            <h3 className="mb-1.5 text-[11px] uppercase tracking-[0.08em] text-[var(--color-text-faint)]">
              確認したいこと
            </h3>
            <ul className="flex flex-col gap-1 text-[13px] text-[var(--color-text-muted)]">
              {plan.questions.map((q, i) => (
                <li key={i}>・{q}</li>
              ))}
            </ul>
          </div>
        )}

        {plan.risks.length > 0 && (
          <div className="mt-4">
            <h3 className="mb-1.5 text-[11px] uppercase tracking-[0.08em] text-[var(--color-text-faint)]">
              注意すべきリスク
            </h3>
            <ul className="flex flex-col gap-1 text-[12.5px] text-[var(--color-text-muted)]">
              {plan.risks.map((r, i) => (
                <li key={i}>・{r}</li>
              ))}
            </ul>
          </div>
        )}
      </section>

      <section>
        <h2 className="mb-2.5 text-[13px] font-medium">
          提案（複数選択できます）
        </h2>
        <div className="grid gap-2.5 sm:grid-cols-2">
          {plan.options.map((option) => {
            const isSelected = selected.has(option.id);
            const role = option.roleKey ? ROLE_DEFINITIONS[option.roleKey] : null;
            return (
              <button
                key={option.id}
                type="button"
                onClick={() => {
                  setSelected((prev) => {
                    const next = new Set(prev);
                    if (next.has(option.id)) next.delete(option.id);
                    else next.add(option.id);
                    return next;
                  });
                }}
                aria-pressed={isSelected}
                className="ac-panel flex flex-col gap-2 p-4 text-left transition-all"
                style={{
                  borderColor: isSelected ? "var(--color-accent)" : "var(--color-line)",
                  background: isSelected ? "#0f1320" : "var(--color-bg-panel)",
                }}
              >
                <div className="flex items-start gap-2.5">
                  {option.roleKey && (
                    <EmployeeParticles
                      roleKey={option.roleKey}
                      status={isSelected ? "working" : "idle"}
                      size={30}
                      seed={option.id}
                    />
                  )}
                  <div className="min-w-0 flex-1">
                    <p className="text-[13px] font-medium leading-snug">{option.title}</p>
                    {role && (
                      <p className="mt-0.5 text-[11px] text-[var(--color-text-faint)]">
                        {role.headline}
                      </p>
                    )}
                  </div>
                  <span
                    className="mt-0.5 flex h-4 w-4 shrink-0 items-center justify-center rounded-[5px] text-[10px]"
                    style={{
                      border: `1px solid ${isSelected ? "var(--color-accent)" : "var(--color-line-strong)"}`,
                      background: isSelected ? "var(--color-accent)" : "transparent",
                      color: "#0a0d16",
                    }}
                    aria-hidden
                  >
                    {isSelected ? "✓" : ""}
                  </span>
                </div>

                <p className="text-[12px] leading-relaxed text-[var(--color-text-muted)]">
                  {option.description}
                </p>
                {option.reason && (
                  <p className="text-[11.5px] text-[var(--color-text-faint)]">理由: {option.reason}</p>
                )}

                <div className="mt-0.5 flex flex-wrap items-center gap-1.5">
                  <span className="ac-chip">約 {option.estimatedDurationMinutes} 分</span>
                  <span className="ac-chip">
                    {option.estimatedWorkTokens.toLocaleString("ja-JP")} WT
                  </span>
                  <SafetyBadge level={option.riskLevel} />
                  {option.kind === "hire" && <span className="ac-chip">採用</span>}
                  {option.kind === "queue" && <span className="ac-chip">待機</span>}
                </div>
              </button>
            );
          })}
        </div>
      </section>

      <section className="ac-panel p-4">
        <label className="flex flex-col gap-2">
          <span className="text-[12px] text-[var(--color-text-muted)]">
            修正したいことがあれば入力してください（任意）
          </span>
          <textarea
            className="ac-input"
            rows={2}
            value={adjustment}
            onChange={(e) => setAdjustment(e.target.value)}
            placeholder="例）まずは調査だけにしたい / 予算をもっと抑えたい"
          />
        </label>
        {adjustment.trim() && (
          <button
            className="ac-btn mt-2"
            onClick={() => {
              update("delegateToAi", `${form.delegateToAi} ${adjustment}`.trim());
              setAdjustment("");
              void submitPlan();
            }}
            disabled={busy}
          >
            この内容で提案をやり直す
          </button>
        )}
      </section>

      {error && (
        <p className="text-[12px]" style={{ color: "var(--color-danger)" }} role="alert">
          {error}
        </p>
      )}

      <div
        className="sticky bottom-0 flex flex-wrap items-center justify-between gap-3 rounded-t-xl border-t px-4 py-3 ac-hairline"
        style={{ background: "rgba(8,9,11,0.92)", backdropFilter: "blur(12px)" }}
      >
        <div className="text-[12px] text-[var(--color-text-muted)]">
          選択中 {selected.size} 件 / 合計 約 {totalMinutes} 分 ・{" "}
          {totalWorkTokens.toLocaleString("ja-JP")} WT
        </div>
        <div className="flex gap-2">
          <button className="ac-btn ac-btn-ghost" onClick={() => setStep("details")}>
            戻る
          </button>
          <button
            className="ac-btn ac-btn-go"
            onClick={execute}
            disabled={busy || selected.size === 0}
          >
            {busy ? "開始しています…" : "実行する"}
          </button>
        </div>
      </div>
    </div>
  );
}

function Field({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <label className="flex flex-col gap-1.5">
      <span className="text-[12px] text-[var(--color-text-muted)]">{label}</span>
      {children}
    </label>
  );
}
