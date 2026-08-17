"use client";

import { useEffect, useRef } from "react";
import type { EmployeeInstance, Message } from "@/lib/core/types";
import { EmployeeParticles } from "@/components/particles/EmployeeParticles";
import { AllGlyphs as Glyphs, SafetyBadge, SectionLabel } from "@/components/ui/primitives";
import { useOrchestrator, type ChoiceOption } from "@/components/orchestrator/OrchestratorContext";

/**
 * 中央 Composer と右パネルで共通に使う部品。
 * 会話・提案カード・入力欄はここに 1 つだけ定義し、位置ごとに作り直さない。
 */

/** 統括AIの抽象的な Identicon（顔・人型は使わない） */
export function OrchestratorIdenticon({ size = 30, busy = false }: { size?: number; busy?: boolean }) {
  return (
    <EmployeeParticles
      roleKey="director"
      status={busy ? "working" : "idle"}
      seed="orchestrator"
      size={size}
    />
  );
}

export function OnlineDot({ busy }: { busy: boolean }) {
  return (
    <span className="flex items-center gap-1.5 text-[11px] text-[var(--color-text-faint)]">
      <span
        className="inline-block h-1.5 w-1.5 rounded-full"
        style={{ background: busy ? "var(--color-caution)" : "var(--color-positive)" }}
        aria-hidden
      />
      {busy ? "考えています" : "オンライン"}
    </span>
  );
}

export function OrchestratorMessages({
  employees,
  compact,
}: {
  employees: EmployeeInstance[];
  compact?: boolean;
}) {
  const { messages, options, notice, busy } = useOrchestrator();
  const scrollRef = useRef<HTMLDivElement | null>(null);

  // ページ全体ではなく、会話コンテナの中だけをスクロールする
  useEffect(() => {
    const el = scrollRef.current;
    if (!el) return;
    el.scrollTo({ top: el.scrollHeight, behavior: "smooth" });
  }, [messages.length, options.length]);

  return (
    <div ref={scrollRef} className="min-h-0 flex-1 overflow-y-auto px-4 py-4">
      <ul
        className={compact ? "flex flex-col gap-3" : "mx-auto flex max-w-[720px] flex-col gap-4"}
      >
        {messages.map((message) => (
          <MessageBubble
            key={message.id}
            message={message}
            employees={employees}
            compact={compact}
          />
        ))}

        {options.length > 0 && (
          <li className="ac-enter">
            <OrchestratorOptions compact={compact} />
          </li>
        )}

        {busy && (
          <li className="flex items-center gap-2 text-[12px] text-[var(--color-text-faint)]">
            <OrchestratorIdenticon size={18} busy />
            考えています…
          </li>
        )}

        {notice && (
          <li
            role="status"
            className="rounded-lg px-3 py-2 text-[12px]"
            style={{ background: "var(--color-bg-raised)", color: "var(--color-text-muted)" }}
          >
            {notice}
          </li>
        )}
      </ul>
    </div>
  );
}

function MessageBubble({
  message,
  employees,
  compact,
}: {
  message: Message;
  employees: EmployeeInstance[];
  compact?: boolean;
}) {
  const isUser = message.author === "user";
  const employee = employees.find((e) => e.id === message.employeeId);
  return (
    <li className="ac-rise">
      <div className="mb-1 flex items-center gap-2">
        {!isUser &&
          (employee ? (
            <EmployeeParticles
              roleKey={employee.roleKey}
              status={employee.status}
              seed={employee.avatarSeed}
              size={compact ? 18 : 22}
            />
          ) : (
            <OrchestratorIdenticon size={compact ? 18 : 22} />
          ))}
        <span className="text-[11.5px] text-[var(--color-text-faint)]">
          {isUser ? "あなた" : (employee?.name ?? "統括AI")}
        </span>
      </div>
      <div
        className="rounded-2xl px-3.5 py-2.5 leading-relaxed"
        style={{
          background: isUser ? "var(--color-bg-raised)" : "var(--color-bg-panel)",
          border: "1px solid var(--color-line)",
          whiteSpace: "pre-wrap",
          fontSize: compact ? 12.5 : 13.5,
        }}
      >
        {message.content}
      </div>
    </li>
  );
}

export function OrchestratorOptions({ compact }: { compact?: boolean }) {
  const { options, selectedOptions, toggleOption, decisionId, execute, busy, estimatedWorkTokens } =
    useOrchestrator();

  if (options.length === 0) return null;

  return (
    <>
      <SectionLabel>提案（複数選択できます）</SectionLabel>
      <div className={compact ? "grid gap-2" : "grid gap-2 sm:grid-cols-2"}>
        {options.map((option) => (
          <OptionCard
            key={option.id}
            option={option}
            selected={selectedOptions.has(option.id)}
            onToggle={() => toggleOption(option.id)}
          />
        ))}
      </div>
      {decisionId && (
        <div className="mt-3 flex flex-wrap items-center justify-end gap-2">
          <span className="mr-auto text-[11.5px] text-[var(--color-text-faint)]">
            選択中 {selectedOptions.size} 件 ・ 推定{" "}
            {estimatedWorkTokens.toLocaleString("ja-JP")} WT
          </span>
          <button
            className="ac-btn ac-btn-go"
            onClick={() => void execute()}
            disabled={busy || selectedOptions.size === 0}
          >
            実行する
          </button>
        </div>
      )}
    </>
  );
}

function OptionCard({
  option,
  selected,
  onToggle,
}: {
  option: ChoiceOption;
  selected: boolean;
  onToggle: () => void;
}) {
  return (
    <button
      type="button"
      aria-pressed={selected}
      onClick={onToggle}
      className="ac-panel flex flex-col gap-1.5 p-3 text-left transition-all"
      style={{
        borderColor: selected ? "var(--color-accent)" : "var(--color-line)",
        background: selected ? "#0f1320" : "var(--color-bg-panel)",
      }}
    >
      <div className="flex items-start gap-2">
        {option.roleKey && (
          <EmployeeParticles
            roleKey={option.roleKey}
            status={selected ? "working" : "idle"}
            size={26}
            seed={option.id}
          />
        )}
        <span className="flex-1 text-[12.5px] font-medium leading-snug">{option.title}</span>
        <span
          className="flex h-4 w-4 shrink-0 items-center justify-center rounded-[5px] text-[10px]"
          style={{
            border: `1px solid ${selected ? "var(--color-accent)" : "var(--color-line-strong)"}`,
            background: selected ? "var(--color-accent)" : "transparent",
            color: "#0a0d16",
          }}
          aria-hidden
        >
          {selected ? "✓" : ""}
        </span>
      </div>
      <p className="text-[11.5px] leading-relaxed text-[var(--color-text-muted)]">
        {option.description}
      </p>
      <div className="flex flex-wrap gap-1.5">
        <span className="ac-chip">約 {option.estimatedDurationMinutes} 分</span>
        <span className="ac-chip">{option.estimatedWorkTokens.toLocaleString("ja-JP")} WT</span>
        <SafetyBadge level={option.riskLevel} />
      </div>
    </button>
  );
}

/**
 * 入力欄。中央でも右パネルでも同じ実体を使う。
 * 添付 / 現在のプロジェクト / 推定ワークトークン / 送信 / 実行停止 を必ず備える。
 */
export function OrchestratorComposer({
  variant,
  suggestions = [],
}: {
  variant: "center" | "panel";
  suggestions?: string[];
}) {
  const {
    input,
    setInput,
    send,
    stop,
    busy,
    running,
    projectName,
    estimatedWorkTokens,
    options,
  } = useOrchestrator();
  const compact = variant === "panel";

  return (
    <div className={compact ? "" : "mx-auto w-full max-w-[720px]"}>
      {suggestions.length > 0 && options.length === 0 && !input && (
        <div className="mb-2 flex flex-wrap gap-1.5">
          {suggestions.map((suggestion) => (
            <button
              key={suggestion}
              className="ac-chip cursor-pointer transition-colors hover:bg-[var(--color-bg-hover)]"
              onClick={() => setInput(suggestion)}
            >
              <span
                className="inline-block h-2 w-2 rounded-[3px]"
                style={{ background: "linear-gradient(140deg,#3d7dff,#34d27b)" }}
                aria-hidden
              />
              {suggestion}
            </button>
          ))}
        </div>
      )}

      <div
        className="rounded-[18px] border"
        style={{ borderColor: "var(--color-line-strong)", background: "var(--color-bg-raised)" }}
      >
        <textarea
          className="max-h-40 w-full resize-none bg-transparent px-4 pt-3 outline-none placeholder:text-[var(--color-text-faint)]"
          style={{ fontSize: compact ? 12.5 : 13.5 }}
          rows={compact ? 2 : 3}
          aria-label="統括AIへの相談"
          placeholder="統括AIに相談する（Enter で送信 / Shift+Enter で改行）"
          value={input}
          onChange={(e) => setInput(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === "Enter" && !e.shiftKey) {
              e.preventDefault();
              void send();
            }
          }}
          maxLength={8000}
        />

        <div className="flex flex-wrap items-center gap-1.5 px-2.5 pb-2.5">
          <button
            type="button"
            className="ac-btn ac-btn-ghost h-8 px-2 text-[11.5px]"
            title="添付（ファイルは成果物として保存されます）"
            onClick={() => setInput(`${input}${input ? "\n" : ""}[添付: ]`)}
          >
            {Glyphs.attach}
            添付
          </button>

          <span className="ac-chip max-w-[46%] truncate" title={projectName}>
            {Glyphs.folder}
            {projectName}
          </span>

          <span className="ac-chip tabular-nums">
            推定 {estimatedWorkTokens.toLocaleString("ja-JP")} WT
          </span>

          <div className="ml-auto flex items-center gap-1.5">
            {running && (
              <button
                type="button"
                className="ac-btn ac-btn-ghost h-8 px-2.5 text-[11.5px]"
                onClick={stop}
              >
                {Glyphs.pause}
                実行停止
              </button>
            )}
            <button
              aria-label="送信"
              title="送信"
              className="flex h-9 w-9 shrink-0 items-center justify-center rounded-full transition-all active:scale-95 disabled:opacity-40"
              style={{ background: "var(--color-accent)", color: "#ffffff" }}
              onClick={() => void send()}
              disabled={busy || !input.trim()}
            >
              <svg width="15" height="15" viewBox="0 0 16 16" fill="none" aria-hidden>
                <path
                  d="M8 12.8V3.2M8 3.2 3.8 7.4M8 3.2l4.2 4.2"
                  stroke="currentColor"
                  strokeWidth="1.8"
                  strokeLinecap="round"
                  strokeLinejoin="round"
                />
              </svg>
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}
