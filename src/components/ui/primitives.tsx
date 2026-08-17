"use client";

import { useEffect, useRef, type CSSProperties, type ReactNode } from "react";
import type { EmployeeStatus, Notification, SafetyLevel, TaskStatus } from "@/lib/core/types";
import { EMPLOYEE_STATUS_LABEL, TASK_STATUS_LABEL } from "@/lib/core/types";

/* ============================================================
   ステータス表示は「色付きティントのバッジ + アイコン + テキスト」。
   色だけに依存せず、必ずアイコンと文字でも区別する。
   ============================================================ */

const stroke = {
  stroke: "currentColor",
  strokeWidth: 1.7,
  strokeLinecap: "round" as const,
  strokeLinejoin: "round" as const,
  fill: "none",
};

function Svg({ children }: { children: ReactNode }) {
  return (
    <svg width="12" height="12" viewBox="0 0 16 16" aria-hidden>
      {children}
    </svg>
  );
}

/** 小さなステータスアイコン群（絵文字は使わない） */
export const Glyphs = {
  /** 進行中: 破線サークル */
  progress: (
    <Svg>
      <circle cx="8" cy="8" r="5.6" {...stroke} strokeWidth={1.9} strokeDasharray="2.8 2.7" />
    </Svg>
  ),
  /** 待機: 空円 */
  ring: (
    <Svg>
      <circle cx="8" cy="8" r="5" {...stroke} />
    </Svg>
  ),
  /** アイデア等: ドット */
  dot: (
    <Svg>
      <circle cx="8" cy="8" r="3.1" fill="currentColor" />
    </Svg>
  ),
  /** 完了 */
  check: (
    <Svg>
      <circle cx="8" cy="8" r="5.8" {...stroke} />
      <path d="m5.4 8.3 1.8 1.8 3.4-3.9" {...stroke} />
    </Svg>
  ),
  /** 失敗 */
  fail: (
    <Svg>
      <circle cx="8" cy="8" r="5.8" {...stroke} />
      <path d="m6.1 6.1 3.8 3.8M9.9 6.1l-3.8 3.8" {...stroke} />
    </Svg>
  ),
  /** 要注意 */
  warn: (
    <Svg>
      <path d="M8 2.9 14.1 13H1.9L8 2.9Z" {...stroke} />
      <path d="M8 6.7v2.7" {...stroke} />
      <circle cx="8" cy="11.4" r="0.55" fill="currentColor" />
    </Svg>
  ),
  /** 期限・保留 */
  clock: (
    <Svg>
      <circle cx="8" cy="8" r="5.8" {...stroke} />
      <path d="M8 4.9V8l2.1 1.3" {...stroke} />
    </Svg>
  ),
  /** 一時停止 */
  pause: (
    <Svg>
      <path d="M6.1 5.2v5.6M9.9 5.2v5.6" {...stroke} strokeWidth={1.9} />
    </Svg>
  ),
  /** キュー投入・引き継ぎ */
  send: (
    <Svg>
      <path d="M13.4 2.6 8.4 13.4 7 9 2.6 7.6 13.4 2.6Z" {...stroke} />
    </Svg>
  ),
  /** 修正中 */
  loop: (
    <Svg>
      <path d="M12.9 8.4A5 5 0 1 1 11.2 4.4" {...stroke} />
      <path d="M11.4 1.9v2.7H8.7" {...stroke} />
    </Svg>
  ),
  /** ドキュメント（成果物） */
  doc: (
    <Svg>
      <path d="M4.3 2.4h4.9l2.5 2.5v8.7H4.3V2.4Z" {...stroke} />
      <path d="M6.1 8h3.8M6.1 10.6h3.8" {...stroke} />
    </Svg>
  ),
  /** 情報 */
  info: (
    <Svg>
      <circle cx="8" cy="8" r="5.8" {...stroke} />
      <path d="M8 7.5v3.1" {...stroke} />
      <circle cx="8" cy="5.2" r="0.6" fill="currentColor" />
    </Svg>
  ),
} satisfies Record<string, ReactNode>;

/** ナビゲーション用アイコン（Glyphs と同じ語彙で使えるようマージする） */
const NavGlyphsBase = {
  grid: (
    <Svg>
      <rect x="2.4" y="2.4" width="4.8" height="4.8" rx="1.3" {...stroke} />
      <rect x="8.8" y="2.4" width="4.8" height="4.8" rx="1.3" {...stroke} />
      <rect x="2.4" y="8.8" width="4.8" height="4.8" rx="1.3" {...stroke} />
      <rect x="8.8" y="8.8" width="4.8" height="4.8" rx="1.3" {...stroke} />
    </Svg>
  ),
  checklist: (
    <Svg>
      <path d="M2.6 4.4l1.4 1.4 2.2-2.4" {...stroke} />
      <path d="M2.6 11.2l1.4 1.4 2.2-2.4" {...stroke} />
      <path d="M8.6 4.6h4.8M8.6 11.4h4.8" {...stroke} />
    </Svg>
  ),
  folder: (
    <Svg>
      <path d="M2 4.4a1.4 1.4 0 0 1 1.4-1.4h2.6l1.4 1.7h5.2A1.4 1.4 0 0 1 14 6.1v5.5a1.4 1.4 0 0 1-1.4 1.4H3.4A1.4 1.4 0 0 1 2 11.6V4.4Z" {...stroke} />
    </Svg>
  ),
  book: (
    <Svg>
      <path d="M3 3.2h4.2a1.8 1.8 0 0 1 1.8 1.8v8a1.5 1.5 0 0 0-1.5-1.5H3V3.2Z" {...stroke} />
      <path d="M13 3.2H8.8A1.8 1.8 0 0 0 7 5v8a1.5 1.5 0 0 1 1.5-1.5H13V3.2Z" {...stroke} />
    </Svg>
  ),
  plug: (
    <Svg>
      <path d="M6 2.4v3.4M10 2.4v3.4" {...stroke} />
      <path d="M3.8 5.8h8.4v2.4a4.2 4.2 0 0 1-8.4 0V5.8Z" {...stroke} />
      <path d="M8 12.4v2.2" {...stroke} />
    </Svg>
  ),
  gauge: (
    <Svg>
      <path d="M2.6 11.6a6 6 0 1 1 10.8 0" {...stroke} />
      <path d="M8 11.4l3-3.4" {...stroke} />
    </Svg>
  ),
  gear: (
    <Svg>
      <circle cx="8" cy="8" r="2.3" {...stroke} />
      <path d="M8 1.8v1.9M8 12.3v1.9M14.2 8h-1.9M3.7 8H1.8M12.4 3.6l-1.3 1.3M4.9 11.1l-1.3 1.3M12.4 12.4l-1.3-1.3M4.9 4.9L3.6 3.6" {...stroke} />
    </Svg>
  ),
  shield: (
    <Svg>
      <path d="M8 1.9l5 2v4.3c0 3-2.1 5.2-5 5.9-2.9-.7-5-2.9-5-5.9V3.9l5-2Z" {...stroke} />
    </Svg>
  ),
  plus: (
    <Svg>
      <path d="M8 3.4v9.2M3.4 8h9.2" {...stroke} strokeWidth={1.9} />
    </Svg>
  ),
  search: (
    <Svg>
      <circle cx="7.2" cy="7.2" r="4.3" {...stroke} />
      <path d="M10.4 10.4l3 3" {...stroke} />
    </Svg>
  ),
  menu: (
    <Svg>
      <path d="M2.6 4.4h10.8M2.6 8h10.8M2.6 11.6h10.8" {...stroke} />
    </Svg>
  ),
  panelRight: (
    <Svg>
      <rect x="2.2" y="3" width="11.6" height="10" rx="1.6" {...stroke} />
      <path d="M9.8 3v10" {...stroke} />
    </Svg>
  ),
  pause: (
    <Svg>
      <path d="M6.1 4.4v7.2M9.9 4.4v7.2" {...stroke} strokeWidth={1.9} />
    </Svg>
  ),
  attach: (
    <Svg>
      <path d="M11.6 7.3l-4.3 4.3a2.6 2.6 0 0 1-3.7-3.7l5-5a1.8 1.8 0 0 1 2.5 2.5l-4.9 5a.9.9 0 0 1-1.2-1.2l4.4-4.4" {...stroke} />
    </Svg>
  ),
} satisfies Record<string, ReactNode>;

/** ステータス用 + ナビ用をまとめた1つの語彙 */
export const AllGlyphs = { ...Glyphs, ...NavGlyphsBase };

function Badge({
  color,
  glyph,
  children,
}: {
  color: string;
  glyph: ReactNode;
  children: ReactNode;
}) {
  return (
    <span className="ac-badge" style={{ "--badge": color } as CSSProperties}>
      {glyph}
      {children}
    </span>
  );
}

/* ── 社員ステータス ─────────────────────────────────── */

const EMPLOYEE_TONE: Record<EmployeeStatus, { color: string; glyph: ReactNode }> = {
  working: { color: "#4da3ff", glyph: Glyphs.progress },
  idle: { color: "#8f97a5", glyph: Glyphs.ring },
  awaiting_approval: { color: "#f2a33c", glyph: Glyphs.warn },
  awaiting_info: { color: "#a78bfa", glyph: Glyphs.info },
  done: { color: "#34d27b", glyph: Glyphs.check },
  error: { color: "#f26b5e", glyph: Glyphs.fail },
  paused: { color: "#8f97a5", glyph: Glyphs.pause },
};

export function EmployeeStatusBadge({ status }: { status: EmployeeStatus }) {
  const tone = EMPLOYEE_TONE[status];
  return (
    <Badge color={tone.color} glyph={tone.glyph}>
      {EMPLOYEE_STATUS_LABEL[status]}
    </Badge>
  );
}

/* ── タスクステータス ───────────────────────────────── */

const TASK_TONE: Record<TaskStatus, { color: string; glyph: ReactNode }> = {
  idea: { color: "#8f97a5", glyph: Glyphs.dot },
  todo: { color: "#8f97a5", glyph: Glyphs.ring },
  queued: { color: "#a78bfa", glyph: Glyphs.send },
  running: { color: "#4da3ff", glyph: Glyphs.progress },
  awaiting_approval: { color: "#f2a33c", glyph: Glyphs.warn },
  revising: { color: "#e2c13c", glyph: Glyphs.loop },
  done: { color: "#34d27b", glyph: Glyphs.check },
  blocked: { color: "#f26b5e", glyph: Glyphs.fail },
};

export function TaskStatusBadge({ status }: { status: TaskStatus }) {
  const tone = TASK_TONE[status];
  return (
    <Badge color={tone.color} glyph={tone.glyph}>
      {TASK_STATUS_LABEL[status]}
    </Badge>
  );
}

/* ── 安全レベル ─────────────────────────────────────── */

const SAFETY_TONE: Record<Exclude<SafetyLevel, "GREEN">, { color: string; label: string }> = {
  YELLOW: { color: "#e2c13c", label: "注意" },
  ORANGE: { color: "#f2793d", label: "要確認" },
  RED: { color: "#f26b5e", label: "停止" },
};

export function SafetyBadge({ level }: { level: SafetyLevel }) {
  if (level === "GREEN") return null;
  const tone = SAFETY_TONE[level];
  return (
    <Badge color={tone.color} glyph={level === "RED" ? Glyphs.fail : Glyphs.warn}>
      {tone.label}
    </Badge>
  );
}

/* ── アイコンタイル（Insights タイムライン用） ────────── */

export function IconTile({
  color,
  glyph,
}: {
  color: string;
  glyph: ReactNode;
}) {
  return (
    <span className="ac-icon-tile" style={{ "--tile": color } as CSSProperties} aria-hidden>
      {glyph}
    </span>
  );
}

const NOTIFICATION_TILE: Record<Notification["kind"], { color: string; glyph: ReactNode }> = {
  artifact_ready: { color: "var(--color-positive)", glyph: Glyphs.doc },
  approval_required: { color: "var(--color-caution)", glyph: Glyphs.warn },
  task_done: { color: "var(--color-positive)", glyph: Glyphs.check },
  task_failed: { color: "var(--color-danger)", glyph: Glyphs.fail },
  safety: { color: "var(--color-warn)", glyph: Glyphs.warn },
  system: { color: "var(--color-info)", glyph: Glyphs.info },
};

export function NotificationTile({ kind }: { kind: Notification["kind"] }) {
  const tone = NOTIFICATION_TILE[kind];
  return <IconTile color={tone.color} glyph={tone.glyph} />;
}

/* ── その他の共通部品 ───────────────────────────────── */

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
      style={{ background: "rgba(5,6,9,0.72)", backdropFilter: "blur(10px)" }}
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
        style={{
          maxWidth: wide ? 880 : 560,
          maxHeight: "86vh",
          display: "flex",
          flexDirection: "column",
          borderRadius: 20,
        }}
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
