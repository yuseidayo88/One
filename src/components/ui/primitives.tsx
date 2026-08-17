"use client";

import { useEffect, useRef, type ReactNode } from "react";
import type { EmployeeStatus, SafetyLevel, TaskStatus } from "@/lib/core/types";
import { EMPLOYEE_STATUS_LABEL, TASK_STATUS_LABEL } from "@/lib/core/types";

/**
 * 状態表示は色だけに依存させず、必ず文字と形（記号）でも区別する。
 */

const EMPLOYEE_STATUS_STYLE: Record<EmployeeStatus, { color: string; mark: string }> = {
  working: { color: "#35c78a", mark: "●" },
  idle: { color: "#6b7280", mark: "○" },
  awaiting_approval: { color: "#e0a34a", mark: "◆" },
  awaiting_info: { color: "#6e8cff", mark: "◇" },
  done: { color: "#9aa1ac", mark: "✓" },
  error: { color: "#e5645c", mark: "▲" },
  paused: { color: "#6b7280", mark: "‖" },
};

export function EmployeeStatusBadge({ status }: { status: EmployeeStatus }) {
  const style = EMPLOYEE_STATUS_STYLE[status];
  return (
    <span className="inline-flex items-center gap-1.5 text-[11px]" style={{ color: style.color }}>
      <span aria-hidden>{style.mark}</span>
      <span>{EMPLOYEE_STATUS_LABEL[status]}</span>
    </span>
  );
}

const TASK_STATUS_STYLE: Record<TaskStatus, { color: string; mark: string }> = {
  idea: { color: "#6b7280", mark: "·" },
  todo: { color: "#9aa1ac", mark: "○" },
  queued: { color: "#6e8cff", mark: "◇" },
  running: { color: "#35c78a", mark: "●" },
  awaiting_approval: { color: "#e0a34a", mark: "◆" },
  revising: { color: "#e8814a", mark: "↺" },
  done: { color: "#9aa1ac", mark: "✓" },
  blocked: { color: "#e5645c", mark: "▲" },
};

export function TaskStatusBadge({ status }: { status: TaskStatus }) {
  const style = TASK_STATUS_STYLE[status];
  return (
    <span
      className="ac-chip"
      style={{ color: style.color, borderColor: `${style.color}44` }}
    >
      <span aria-hidden>{style.mark}</span>
      {TASK_STATUS_LABEL[status]}
    </span>
  );
}

const SAFETY_STYLE: Record<SafetyLevel, { color: string; label: string; mark: string }> = {
  GREEN: { color: "#35c78a", label: "通常", mark: "●" },
  YELLOW: { color: "#e0a34a", label: "注意", mark: "◆" },
  ORANGE: { color: "#e8814a", label: "要確認", mark: "▲" },
  RED: { color: "#e5645c", label: "停止", mark: "■" },
};

export function SafetyBadge({ level }: { level: SafetyLevel }) {
  const s = SAFETY_STYLE[level];
  if (level === "GREEN") return null;
  return (
    <span className="ac-chip" style={{ color: s.color, borderColor: `${s.color}44` }}>
      <span aria-hidden>{s.mark}</span>
      {s.label}
    </span>
  );
}

export function WorkTokens({ value, className }: { value: number; className?: string }) {
  return (
    <span className={className} style={{ fontVariantNumeric: "tabular-nums" }}>
      {value.toLocaleString("ja-JP")} WT
    </span>
  );
}

export function Modal({
  open,
  onClose,
  title,
  children,
  footer,
  wide,
}: {
  open: boolean;
  onClose: () => void;
  title: string;
  children: ReactNode;
  footer?: ReactNode;
  wide?: boolean;
}) {
  const ref = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!open) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") onClose();
    };
    document.addEventListener("keydown", onKey);
    ref.current?.focus();
    return () => document.removeEventListener("keydown", onKey);
  }, [open, onClose]);

  if (!open) return null;

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center p-4 ac-fade"
      style={{ background: "rgba(4,5,7,0.72)", backdropFilter: "blur(8px)" }}
      onClick={onClose}
      role="presentation"
    >
      <div
        ref={ref}
        tabIndex={-1}
        role="dialog"
        aria-modal="true"
        aria-label={title}
        className="ac-panel ac-enter w-full overflow-hidden outline-none"
        style={{ maxWidth: wide ? 880 : 560, maxHeight: "86vh", display: "flex", flexDirection: "column" }}
        onClick={(e) => e.stopPropagation()}
      >
        <header className="flex items-center justify-between gap-4 border-b px-5 py-3.5 ac-hairline">
          <h2 className="text-[15px] font-semibold tracking-tight">{title}</h2>
          <button className="ac-btn ac-btn-ghost" onClick={onClose} aria-label="閉じる">
            ✕
          </button>
        </header>
        <div className="flex-1 overflow-y-auto px-5 py-4">{children}</div>
        {footer && (
          <footer className="flex items-center justify-end gap-2 border-t px-5 py-3 ac-hairline">
            {footer}
          </footer>
        )}
      </div>
    </div>
  );
}

export function EmptyState({ title, description }: { title: string; description?: string }) {
  return (
    <div className="flex flex-col items-center justify-center gap-1.5 px-6 py-14 text-center">
      <p className="text-[13px] text-[var(--color-text-muted)]">{title}</p>
      {description && <p className="text-[12px] text-[var(--color-text-faint)]">{description}</p>}
    </div>
  );
}

export function SectionLabel({ children, action }: { children: ReactNode; action?: ReactNode }) {
  return (
    <div className="mb-2.5 flex items-center justify-between">
      <h3 className="text-[11px] font-medium uppercase tracking-[0.08em] text-[var(--color-text-faint)]">
        {children}
      </h3>
      {action}
    </div>
  );
}
