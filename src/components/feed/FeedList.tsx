"use client";

import type { EmployeeInstance } from "@/lib/core/types";
import type { FeedItem, FeedItemKind } from "@/lib/views/feed";
import { EmployeeParticles } from "@/components/particles/EmployeeParticles";
import { EmptyState, Glyphs, IconTile } from "@/components/ui/primitives";

/**
 * 今日のフィード。
 * AI社員が出したものを 1 本の時系列で見せ、その場で確認・承認できるようにする。
 */

const KIND_STYLE: Record<FeedItemKind, { color: string; glyph: React.ReactNode; label: string }> = {
  approval_required: { color: "var(--color-caution)", glyph: Glyphs.warn, label: "承認待ち" },
  artifact_ready: { color: "var(--color-positive)", glyph: Glyphs.doc, label: "成果物" },
  handoff: { color: "var(--color-violet)", glyph: Glyphs.send, label: "引き継ぎ" },
  task_started: { color: "var(--color-info)", glyph: Glyphs.progress, label: "着手" },
  task_done: { color: "var(--color-positive)", glyph: Glyphs.check, label: "完了" },
  blocked: { color: "var(--color-danger)", glyph: Glyphs.fail, label: "停止" },
  safety: { color: "var(--color-warn)", glyph: Glyphs.warn, label: "安全確認" },
  suggestion: { color: "var(--color-accent)", glyph: Glyphs.info, label: "次の提案" },
};

export type FeedFilter = "action" | "all";

export function FeedList({
  items,
  employees,
  filter,
  busy,
  onOpenArtifact,
  onApprove,
  onReject,
  onAskDirector,
}: {
  items: FeedItem[];
  employees: EmployeeInstance[];
  filter: FeedFilter;
  busy: boolean;
  onOpenArtifact: (artifactId: string) => void;
  onApprove: (approvalId: string) => void;
  onReject: (approvalId: string) => void;
  onAskDirector: (text: string) => void;
}) {
  const visible = filter === "action" ? items.filter((i) => i.actionable) : items;

  if (visible.length === 0) {
    return (
      <EmptyState
        title={filter === "action" ? "対応が必要なものはありません" : "まだ動きがありません"}
        description="AI社員が仕事を進めると、ここに時系列で表示されます。"
      />
    );
  }

  return (
    <ul className="mx-auto flex max-w-[720px] flex-col gap-2">
      {visible.map((item) => {
        const style = KIND_STYLE[item.kind];
        const employee = employees.find((e) => e.id === item.employeeId);
        return (
          <li
            key={item.id}
            className="ac-panel p-3.5 ac-rise"
            style={
              item.actionable
                ? { borderColor: "color-mix(in srgb, var(--color-caution) 30%, var(--color-line))" }
                : undefined
            }
          >
            <div className="flex items-start gap-3">
              {employee ? (
                <span
                  className="flex h-8 w-8 shrink-0 items-center justify-center rounded-[9px]"
                  style={{ background: "var(--color-bg-raised)" }}
                  aria-hidden
                >
                  <EmployeeParticles
                    roleKey={employee.roleKey}
                    status={employee.status}
                    seed={employee.avatarSeed}
                    size={24}
                  />
                </span>
              ) : (
                <IconTile color={style.color} glyph={style.glyph} />
              )}

              <div className="min-w-0 flex-1">
                <div className="flex flex-wrap items-center gap-1.5">
                  <span className="text-[11px] text-[var(--color-text-faint)]">
                    {item.employeeName ?? "システム"}
                  </span>
                  <span
                    className="ac-badge"
                    style={{ "--badge": style.color } as React.CSSProperties}
                  >
                    {style.glyph}
                    {style.label}
                  </span>
                  <span className="ml-auto text-[11px] text-[var(--color-text-faint)]">
                    {formatTime(item.createdAt)}
                  </span>
                </div>

                <p className="mt-1 text-[13.5px] font-medium leading-snug">{item.title}</p>
                {item.body && (
                  <p className="mt-0.5 text-[12px] leading-relaxed text-[var(--color-text-muted)]">
                    {item.body}
                  </p>
                )}

                <div className="mt-2.5 flex flex-wrap gap-2">
                  {item.artifactId && (
                    <button
                      className="ac-btn h-8 text-[12px]"
                      onClick={() => onOpenArtifact(item.artifactId!)}
                    >
                      確認する
                    </button>
                  )}
                  {item.approvalId && (
                    <>
                      <button
                        className="ac-btn ac-btn-go h-8 text-[12px]"
                        disabled={busy}
                        onClick={() => onApprove(item.approvalId!)}
                      >
                        承認する
                      </button>
                      <button
                        className="ac-btn h-8 text-[12px]"
                        disabled={busy}
                        onClick={() => onReject(item.approvalId!)}
                      >
                        却下
                      </button>
                    </>
                  )}
                  {item.kind === "suggestion" && (
                    <button
                      className="ac-btn h-8 text-[12px]"
                      disabled={busy}
                      onClick={() => onAskDirector(item.title)}
                    >
                      統括AIに依頼する
                    </button>
                  )}
                </div>
              </div>
            </div>
          </li>
        );
      })}
    </ul>
  );
}

function formatTime(iso: string): string {
  const d = new Date(iso);
  const diffMin = Math.floor((Date.now() - d.getTime()) / 60000);
  if (diffMin < 1) return "たった今";
  if (diffMin < 60) return `${diffMin}分前`;
  const diffHour = Math.floor(diffMin / 60);
  if (diffHour < 24) return `${diffHour}時間前`;
  return d.toLocaleDateString("ja-JP", { month: "numeric", day: "numeric" });
}
