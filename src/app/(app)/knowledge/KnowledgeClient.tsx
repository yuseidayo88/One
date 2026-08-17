"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import type { Artifact, EmployeeInstance, MemoryRecord, MemoryScope } from "@/lib/core/types";
import { EmptyState, SectionLabel } from "@/components/ui/primitives";

const SCOPE_LABEL: Record<MemoryScope, string> = {
  organization: "組織",
  business: "事業",
  project: "プロジェクト",
  employee: "社員個別",
  run: "実行時",
};

export function KnowledgeClient({
  memories,
  employees,
  artifacts,
}: {
  memories: MemoryRecord[];
  employees: EmployeeInstance[];
  artifacts: Artifact[];
}) {
  const router = useRouter();
  const [scope, setScope] = useState<MemoryScope | "all">("all");
  const [title, setTitle] = useState("");
  const [content, setContent] = useState("");
  const [busy, setBusy] = useState(false);
  const [editing, setEditing] = useState<string | null>(null);
  const [editContent, setEditContent] = useState("");

  const filtered = scope === "all" ? memories : memories.filter((m) => m.scope === scope);

  async function post(payload: Record<string, unknown>) {
    setBusy(true);
    try {
      await fetch("/api/memories", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify(payload),
      });
      router.refresh();
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="mx-auto w-full px-4 py-5" style={{ maxWidth: 1100 }}>
      <h1 className="mb-4 text-[16px] font-semibold tracking-tight">ナレッジ</h1>

      <div className="grid gap-5 lg:grid-cols-[1fr_320px]">
        <div>
          <div className="mb-3 flex flex-wrap gap-1">
            {(["all", "organization", "business", "project", "employee", "run"] as const).map((s) => (
              <button
                key={s}
                className="rounded-md px-2.5 py-1 text-[12px] transition-colors"
                style={{
                  background: scope === s ? "var(--color-bg-active)" : "transparent",
                  color: scope === s ? "var(--color-text)" : "var(--color-text-muted)",
                }}
                onClick={() => setScope(s as MemoryScope | "all")}
              >
                {s === "all" ? "すべて" : SCOPE_LABEL[s as MemoryScope]}
              </button>
            ))}
          </div>

          {filtered.length === 0 ? (
            <EmptyState title="メモリはまだありません" description="社員が仕事を進めると自動的に蓄積されます。" />
          ) : (
            <ul className="flex flex-col gap-2">
              {filtered.map((memory) => {
                const owner = employees.find((e) => e.id === memory.employeeId);
                return (
                  <li key={memory.id} className="ac-panel p-3">
                    <div className="flex flex-wrap items-center gap-1.5">
                      <span className="text-[13px] font-medium">{memory.title}</span>
                      {memory.pinned && <span className="ac-chip">固定</span>}
                      <span className="ac-chip">{SCOPE_LABEL[memory.scope]}</span>
                      <span className="ac-chip">{memory.confidentiality}</span>
                      {owner && <span className="ac-chip">{owner.name}</span>}
                    </div>

                    {editing === memory.id ? (
                      <div className="mt-2">
                        <textarea
                          className="ac-input"
                          rows={3}
                          value={editContent}
                          onChange={(e) => setEditContent(e.target.value)}
                        />
                        <div className="mt-2 flex gap-2">
                          <button
                            className="ac-btn ac-btn-primary"
                            disabled={busy}
                            onClick={async () => {
                              await post({
                                action: "update",
                                memoryId: memory.id,
                                content: editContent,
                              });
                              setEditing(null);
                            }}
                          >
                            保存
                          </button>
                          <button className="ac-btn" onClick={() => setEditing(null)}>
                            キャンセル
                          </button>
                        </div>
                      </div>
                    ) : (
                      <p className="mt-1.5 whitespace-pre-wrap text-[12.5px] leading-relaxed text-[var(--color-text-muted)]">
                        {memory.content}
                      </p>
                    )}

                    <div className="mt-2 flex flex-wrap items-center gap-2">
                      <span className="text-[11px] text-[var(--color-text-faint)]">
                        出典: {memory.source} ・ {new Date(memory.createdAt).toLocaleString("ja-JP")}
                      </span>
                      <div className="ml-auto flex gap-1.5">
                        <button
                          className="ac-btn ac-btn-ghost h-7 text-[11.5px]"
                          onClick={() => {
                            setEditing(memory.id);
                            setEditContent(memory.content);
                          }}
                        >
                          編集
                        </button>
                        <button
                          className="ac-btn ac-btn-ghost h-7 text-[11.5px]"
                          disabled={busy}
                          onClick={() =>
                            post({ action: "pin", memoryId: memory.id, pinned: !memory.pinned })
                          }
                        >
                          {memory.pinned ? "固定を解除" : "固定する"}
                        </button>
                        <button
                          className="ac-btn ac-btn-ghost h-7 text-[11.5px]"
                          disabled={busy}
                          onClick={() => {
                            if (confirm("このメモリを削除しますか？")) {
                              void post({ action: "delete", memoryId: memory.id });
                            }
                          }}
                        >
                          削除
                        </button>
                      </div>
                    </div>
                  </li>
                );
              })}
            </ul>
          )}
        </div>

        <aside className="flex flex-col gap-5">
          <section className="ac-panel p-4">
            <SectionLabel>メモリを追加</SectionLabel>
            <input
              className="ac-input mb-2"
              placeholder="タイトル"
              value={title}
              onChange={(e) => setTitle(e.target.value)}
            />
            <textarea
              className="ac-input"
              rows={4}
              placeholder="内容（AI社員が参照します）"
              value={content}
              onChange={(e) => setContent(e.target.value)}
            />
            <button
              className="ac-btn ac-btn-primary mt-2 w-full"
              disabled={busy || !title.trim() || !content.trim()}
              onClick={async () => {
                await post({ action: "create", scope: "organization", title, content });
                setTitle("");
                setContent("");
              }}
            >
              追加する
            </button>
            <p className="mt-2 text-[11px] leading-relaxed text-[var(--color-text-faint)]">
              メモリは組織ごとに分離されています。他の組織と共有されることはありません。
            </p>
          </section>

          <section className="ac-panel p-4">
            <SectionLabel>成果物から作られた知識</SectionLabel>
            <ul className="flex flex-col gap-1">
              {artifacts.slice(0, 8).map((a) => (
                <li key={a.id} className="truncate text-[12px] text-[var(--color-text-muted)]">
                  {a.title}
                </li>
              ))}
              {artifacts.length === 0 && (
                <li className="text-[12px] text-[var(--color-text-faint)]">なし</li>
              )}
            </ul>
          </section>
        </aside>
      </div>
    </div>
  );
}
