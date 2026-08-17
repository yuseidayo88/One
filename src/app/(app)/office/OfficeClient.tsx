"use client";

import { useEffect, useRef, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import type {
  Approval,
  Artifact,
  Business,
  Decision,
  DecisionOption,
  EmployeeInstance,
  Message,
  Notification,
  RoleKey,
  SafetyLevel,
  Task,
  TaskEvent,
} from "@/lib/core/types";
import { ROLE_DEFINITIONS } from "@/lib/roles/registry";
import { EmployeeParticles } from "@/components/particles/EmployeeParticles";
import { WorkFlow } from "@/components/flow/WorkFlow";
import { Markdown } from "@/components/markdown/Markdown";
import {
  EmployeeStatusBadge,
  EmptyState,
  Glyphs,
  IconTile,
  Modal,
  NotificationTile,
  SafetyBadge,
  SectionLabel,
  TaskStatusBadge,
} from "@/components/ui/primitives";

interface ChoiceOption {
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

type Selection =
  | { kind: "employee"; id: string }
  | { kind: "task"; id: string }
  | { kind: "artifact"; id: string }
  | null;

export function OfficeClient(props: {
  business: Business | null;
  employees: EmployeeInstance[];
  conversationId: string;
  messages: Message[];
  pendingDecision: (Decision & { options: DecisionOption[] }) | null;
  tasks: Task[];
  approvals: Approval[];
  artifacts: Artifact[];
  artifactContents: Record<string, string>;
  notifications: Notification[];
  recentEvents: TaskEvent[];
  credits: { balance: number; reserved: number; available: number };
  suggestions: { title: string; reason: string }[];
}) {
  const router = useRouter();
  const [employees, setEmployees] = useState(props.employees);
  const [tasks, setTasks] = useState(props.tasks);
  const [events, setEvents] = useState(props.recentEvents);
  const [messages, setMessages] = useState(props.messages);
  const [options, setOptions] = useState<ChoiceOption[]>(
    props.pendingDecision?.options.map(toChoice) ?? [],
  );
  const [decisionId, setDecisionId] = useState<string | null>(props.pendingDecision?.id ?? null);
  const [selectedOptions, setSelectedOptions] = useState<Set<string>>(
    new Set(props.pendingDecision?.options.filter((o) => o.recommended).map((o) => o.id) ?? []),
  );
  const [input, setInput] = useState("");
  const [busy, setBusy] = useState(false);
  const [notice, setNotice] = useState("");
  const [selection, setSelection] = useState<Selection>(null);
  const [openArtifactId, setOpenArtifactId] = useState<string | null>(null);
  const [inspectorOpenMobile, setInspectorOpenMobile] = useState(false);
  const [insightFilter, setInsightFilter] = useState<
    "all" | "approvals" | "notifications" | "artifacts"
  >("all");
  const chatScrollRef = useRef<HTMLDivElement | null>(null);

  /* ── task_events をポーリングし、UI を実データと同期させる ──
     Supabase 有効時は Realtime へ差し替え可能（同じ形の JSON を返す） */
  useEffect(() => {
    let stopped = false;
    let since = props.recentEvents[props.recentEvents.length - 1]?.createdAt ?? "";

    const tick = async () => {
      try {
        const res = await fetch(`/api/events${since ? `?since=${encodeURIComponent(since)}` : ""}`, {
          cache: "no-store",
        });
        if (!res.ok) return;
        const json = await res.json();
        const data = json.data as {
          events: TaskEvent[];
          tasks: { id: string; status: Task["status"]; usedWorkTokens: number }[];
          employees: {
            id: string;
            status: EmployeeInstance["status"];
            currentTaskId: string | null;
          }[];
        };
        if (stopped) return;

        if (data.events.length > 0) {
          since = data.events[data.events.length - 1]!.createdAt;
          setEvents((prev) => [...prev, ...data.events].slice(-80));
        }
        setTasks((prev) =>
          prev.map((t) => {
            const next = data.tasks.find((x) => x.id === t.id);
            return next ? { ...t, status: next.status, usedWorkTokens: next.usedWorkTokens } : t;
          }),
        );
        setEmployees((prev) =>
          prev.map((e) => {
            const next = data.employees.find((x) => x.id === e.id);
            return next ? { ...e, status: next.status, currentTaskId: next.currentTaskId } : e;
          }),
        );
      } catch {
        // ポーリング失敗は無視して次の周期を待つ
      }
    };

    const id = setInterval(tick, 2500);
    return () => {
      stopped = true;
      clearInterval(id);
    };
  }, [props.recentEvents]);

  // ページ全体ではなく、会話コンテナの中だけをスクロールする
  useEffect(() => {
    const el = chatScrollRef.current;
    if (!el) return;
    el.scrollTo({ top: el.scrollHeight, behavior: "smooth" });
  }, [messages.length, options.length]);

  const director = employees.find((e) => e.roleKey === "director") ?? null;
  const creditRatio =
    props.credits.balance > 0 ? props.credits.available / props.credits.balance : 0;
  const unreadNotifications = props.notifications.filter((n) => !n.read);

  async function send() {
    const content = input.trim();
    if (!content || busy) return;
    setBusy(true);
    setNotice("");
    setInput("");
    setMessages((prev) => [
      ...prev,
      {
        id: `local-${Date.now()}`,
        organizationId: "",
        conversationId: props.conversationId,
        author: "user",
        employeeId: null,
        content,
        containsUntrustedData: false,
        createdAt: new Date().toISOString(),
      },
    ]);

    try {
      const res = await fetch("/api/director/message", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ conversationId: props.conversationId, content }),
      });
      const json = await res.json();
      if (!res.ok) {
        setNotice(json?.error?.message ?? "送信に失敗しました");
        return;
      }
      const data = json.data as {
        message: string;
        decisionId: string;
        blocked: boolean;
        options: ChoiceOption[];
      };
      setMessages((prev) => [
        ...prev,
        {
          id: `local-reply-${Date.now()}`,
          organizationId: "",
          conversationId: props.conversationId,
          author: "employee",
          employeeId: director?.id ?? null,
          content: data.message,
          containsUntrustedData: false,
          createdAt: new Date().toISOString(),
        },
      ]);
      setOptions(data.options);
      setDecisionId(data.blocked ? null : data.decisionId);
      setSelectedOptions(new Set(data.options.filter((o) => o.recommended).map((o) => o.id)));
    } catch {
      setNotice("通信に失敗しました");
    } finally {
      setBusy(false);
    }
  }

  async function execute() {
    if (!decisionId || selectedOptions.size === 0) return;
    setBusy(true);
    setNotice("");
    try {
      const res = await fetch("/api/director/execute", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({
          decisionId,
          selectedOptionIds: [...selectedOptions],
          startImmediately: true,
        }),
      });
      const json = await res.json();
      if (!res.ok) {
        setNotice(json?.error?.message ?? "実行に失敗しました");
        return;
      }
      setOptions([]);
      setDecisionId(null);
      setNotice(json.data.message);
      router.refresh();
    } catch {
      setNotice("通信に失敗しました");
    } finally {
      setBusy(false);
    }
  }

  async function decideApproval(approvalId: string, decision: "approved" | "rejected") {
    setBusy(true);
    try {
      await fetch("/api/approvals", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ approvalId, decision }),
      });
      router.refresh();
    } finally {
      setBusy(false);
    }
  }

  const openArtifact = props.artifacts.find((a) => a.id === openArtifactId) ?? null;

  return (
    <div className="flex flex-col lg:h-[calc(100vh-56px)] lg:flex-row">
      {/* ── 左: AI社員一覧 ─────────────────────────── */}
      <aside
        className="max-h-[38vh] shrink-0 overflow-y-auto border-b px-3 py-3.5 ac-hairline lg:max-h-none lg:w-[268px] lg:border-b-0 lg:border-r"
        aria-label="AI社員"
      >
        <SectionLabel>AI社員 {employees.length}名</SectionLabel>
        <ul className="flex flex-col gap-0.5">
          {employees.map((employee) => {
            const role = ROLE_DEFINITIONS[employee.roleKey];
            const currentTask = tasks.find((t) => t.id === employee.currentTaskId);
            const active = selection?.kind === "employee" && selection.id === employee.id;
            const employeeApprovals = props.approvals.filter((a) => a.employeeId === employee.id);
            return (
              <li key={employee.id}>
                <button
                  className="flex w-full items-center gap-2.5 rounded-lg px-2 py-2 text-left transition-colors"
                  style={{ background: active ? "var(--color-bg-active)" : "transparent" }}
                  onClick={() => {
                    setSelection({ kind: "employee", id: employee.id });
                    setInspectorOpenMobile(true);
                  }}
                >
                  <EmployeeParticles
                    roleKey={employee.roleKey}
                    status={employee.status}
                    seed={employee.avatarSeed}
                    size={36}
                  />
                  <span className="min-w-0 flex-1">
                    <span className="flex items-center gap-1.5">
                      <span className="truncate text-[13px] font-medium">{employee.name}</span>
                      {employeeApprovals.length > 0 && (
                        <span
                          className="flex h-3.5 min-w-3.5 items-center justify-center rounded-full px-1 text-[9px] font-semibold"
                          style={{ background: "var(--color-caution)", color: "#1a1206" }}
                        >
                          {employeeApprovals.length}
                        </span>
                      )}
                    </span>
                    <span className="block truncate text-[11px] text-[var(--color-text-faint)]">
                      {role.name} · {employee.specialty}
                    </span>
                    <span className="mt-0.5 flex items-center gap-2">
                      <EmployeeStatusBadge status={employee.status} />
                    </span>
                    {currentTask && (
                      <span className="block truncate text-[11px] text-[var(--color-text-muted)]">
                        {currentTask.title}
                      </span>
                    )}
                  </span>
                </button>
              </li>
            );
          })}
        </ul>

        {props.suggestions.length > 0 && (
          <div className="mt-5">
            <SectionLabel>次の提案</SectionLabel>
            <ul className="flex flex-col gap-1.5">
              {props.suggestions.map((s, i) => (
                <li key={i} className="ac-panel px-3 py-2">
                  <p className="text-[12px] font-medium">{s.title}</p>
                  <p className="mt-0.5 text-[11px] text-[var(--color-text-faint)]">{s.reason}</p>
                </li>
              ))}
            </ul>
          </div>
        )}

        <div className="mt-5">
          <SectionLabel>ワークトークン</SectionLabel>
          <div className="ac-panel p-3">
            <div className="flex items-center gap-3">
              <CreditRing ratio={creditRatio} />
              <div className="min-w-0">
                <p className="text-[14px] font-semibold leading-tight tabular-nums">
                  {props.credits.available.toLocaleString("ja-JP")}
                </p>
                <p className="text-[10.5px] text-[var(--color-text-faint)]">
                  / {props.credits.balance.toLocaleString("ja-JP")} WT
                </p>
              </div>
            </div>
            <Link href="/usage" className="ac-btn mt-2.5 h-8 w-full text-[12px]">
              プランをアップグレード
            </Link>
          </div>
        </div>
      </aside>

      {/* ── 中央: 統括AIとの会話 ───────────────────── */}
      <section className="flex min-w-0 flex-1 flex-col" aria-label="統括AIとの会話">
        <div className="shrink-0 border-b px-4 py-3 ac-hairline">
          <div className="mb-2 flex items-center justify-between gap-3">
            <div className="min-w-0">
              <h1 className="truncate text-[14px] font-semibold tracking-tight">
                {props.business?.name ?? "オフィス"}
              </h1>
              <p className="truncate text-[11.5px] text-[var(--color-text-faint)]">
                実行中 {tasks.filter((t) => t.status === "running").length} 件 ・ 承認待ち{" "}
                {props.approvals.length} 件 ・ 完成した成果物 {props.artifacts.length} 件
              </p>
            </div>
            <span className="ac-chip shrink-0">
              残 {props.credits.available.toLocaleString("ja-JP")} WT
            </span>
          </div>
          <WorkFlow tasks={tasks} employees={employees} events={events} />
        </div>

        <div ref={chatScrollRef} className="min-h-[46vh] flex-1 overflow-y-auto px-4 py-4 lg:min-h-0">
          <ul className="mx-auto flex max-w-[720px] flex-col gap-4">
            {messages.map((message) => {
              const isUser = message.author === "user";
              const employee = employees.find((e) => e.id === message.employeeId);
              return (
                <li key={message.id} className="ac-rise">
                  <div className="mb-1 flex items-center gap-2">
                    {!isUser && employee && (
                      <EmployeeParticles
                        roleKey={employee.roleKey}
                        status={employee.status}
                        seed={employee.avatarSeed}
                        size={22}
                      />
                    )}
                    <span className="text-[11.5px] text-[var(--color-text-faint)]">
                      {isUser ? "あなた" : (employee?.name ?? "統括AI")}
                    </span>
                  </div>
                  <div
                    className="rounded-2xl px-3.5 py-2.5 text-[13.5px] leading-relaxed"
                    style={{
                      background: isUser ? "var(--color-bg-raised)" : "var(--color-bg-panel)",
                      border: "1px solid var(--color-line)",
                      whiteSpace: "pre-wrap",
                    }}
                  >
                    {message.content}
                  </div>
                </li>
              );
            })}

            {options.length > 0 && (
              <li className="ac-enter">
                <SectionLabel>提案（複数選択できます）</SectionLabel>
                <div className="grid gap-2 sm:grid-cols-2">
                  {options.map((option) => {
                    const isSelected = selectedOptions.has(option.id);
                    return (
                      <button
                        key={option.id}
                        type="button"
                        aria-pressed={isSelected}
                        onClick={() =>
                          setSelectedOptions((prev) => {
                            const next = new Set(prev);
                            if (next.has(option.id)) next.delete(option.id);
                            else next.add(option.id);
                            return next;
                          })
                        }
                        className="ac-panel flex flex-col gap-1.5 p-3 text-left transition-all"
                        style={{
                          borderColor: isSelected ? "var(--color-accent)" : "var(--color-line)",
                          background: isSelected ? "#0f1320" : "var(--color-bg-panel)",
                        }}
                      >
                        <div className="flex items-start gap-2">
                          {option.roleKey && (
                            <EmployeeParticles
                              roleKey={option.roleKey}
                              status={isSelected ? "working" : "idle"}
                              size={26}
                              seed={option.id}
                            />
                          )}
                          <span className="flex-1 text-[12.5px] font-medium leading-snug">
                            {option.title}
                          </span>
                          <span
                            className="flex h-4 w-4 shrink-0 items-center justify-center rounded-[5px] text-[10px]"
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
                        <p className="text-[11.5px] leading-relaxed text-[var(--color-text-muted)]">
                          {option.description}
                        </p>
                        <div className="flex flex-wrap gap-1.5">
                          <span className="ac-chip">約 {option.estimatedDurationMinutes} 分</span>
                          <span className="ac-chip">
                            {option.estimatedWorkTokens.toLocaleString("ja-JP")} WT
                          </span>
                          <SafetyBadge level={option.riskLevel} />
                        </div>
                      </button>
                    );
                  })}
                </div>
                {decisionId && (
                  <div className="mt-3 flex items-center justify-end gap-2">
                    <span className="text-[11.5px] text-[var(--color-text-faint)]">
                      選択中 {selectedOptions.size} 件
                    </span>
                    <button
                      className="ac-btn ac-btn-go"
                      onClick={execute}
                      disabled={busy || selectedOptions.size === 0}
                    >
                      実行する
                    </button>
                  </div>
                )}
              </li>
            )}

            {notice && (
              <li className="text-center text-[12px] text-[var(--color-text-muted)]">{notice}</li>
            )}
          </ul>
        </div>

        <div className="shrink-0 border-t px-4 py-3 ac-hairline">
          <div className="mx-auto max-w-[720px]">
            {options.length === 0 && !input && (
              <div className="mb-2 flex flex-wrap gap-1.5">
                {["市場を調査してほしい", "集客の戦略を考えたい", "収支計画を作ってほしい"].map(
                  (suggestion) => (
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
                  ),
                )}
              </div>
            )}
            <div
              className="flex items-end gap-2 rounded-[18px] border p-2 pl-4"
              style={{
                borderColor: "var(--color-line-strong)",
                background: "var(--color-bg-raised)",
              }}
            >
              <textarea
                className="max-h-36 flex-1 resize-none bg-transparent py-1.5 text-[13.5px] outline-none placeholder:text-[var(--color-text-faint)]"
                rows={2}
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
              <button
                aria-label="送信"
                title="送信"
                className="flex h-9 w-9 shrink-0 items-center justify-center rounded-full transition-all active:scale-95 disabled:opacity-40"
                style={{ background: "var(--color-accent)", color: "#ffffff" }}
                onClick={send}
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
      </section>

      {/* ── 右: Inspector ─────────────────────────── */}
      <aside
        className={`shrink-0 overflow-y-auto border-t px-3.5 py-3.5 ac-hairline lg:w-[320px] lg:border-l lg:border-t-0 ${
          inspectorOpenMobile ? "block" : "hidden lg:block"
        }`}
        aria-label="インスペクター"
        id="notifications"
      >
        <div className="mb-3 flex items-center justify-between lg:hidden">
          <span className="text-[12px] text-[var(--color-text-muted)]">インスペクター</span>
          <button className="ac-btn ac-btn-ghost" onClick={() => setInspectorOpenMobile(false)}>
            閉じる
          </button>
        </div>

        <div className="mb-4 flex flex-wrap gap-1">
          {(
            [
              ["all", "すべて"],
              ["approvals", "承認"],
              ["notifications", "通知"],
              ["artifacts", "成果物"],
            ] as const
          ).map(([key, label]) => (
            <button
              key={key}
              className="ac-filter-chip"
              data-active={insightFilter === key}
              onClick={() => setInsightFilter(key)}
            >
              {label}
            </button>
          ))}
        </div>

        {props.approvals.length > 0 && (
          <div
            className="mb-5"
            style={
              insightFilter === "all" || insightFilter === "approvals"
                ? undefined
                : { display: "none" }
            }
          >
            <SectionLabel>承認待ち {props.approvals.length} 件</SectionLabel>
            <ul className="flex flex-col gap-2">
              {props.approvals.map((approval) => (
                <li key={approval.id} className="ac-panel p-3">
                  <div className="flex items-center gap-2.5">
                    <IconTile color="var(--color-caution)" glyph={Glyphs.warn} />
                    <p className="min-w-0 flex-1 text-[12.5px] font-medium leading-snug">
                      {approval.title}
                    </p>
                  </div>
                  <dl className="mt-2 flex flex-col gap-1 text-[11.5px]">
                    <Row label="実行内容" value={approval.what} />
                    <Row label="影響範囲" value={approval.affects} />
                    <Row label="使用サービス" value={approval.service} />
                    <Row label="送信先" value={approval.destination} />
                    <Row label="予想費用" value={`${approval.estimatedCostJpy.toLocaleString("ja-JP")} 円`} />
                    <Row
                      label="ワークトークン"
                      value={`${approval.estimatedWorkTokens.toLocaleString("ja-JP")} WT`}
                    />
                    <Row label="元に戻せるか" value={approval.reversible ? "戻せます" : "戻せません"} />
                    <Row label="リスク" value={approval.risk} />
                  </dl>
                  {approval.diff && (
                    <pre
                      className="mt-2 overflow-x-auto rounded-md p-2 text-[11px]"
                      style={{ background: "var(--color-bg)", color: "var(--color-text-muted)" }}
                    >
                      {approval.diff}
                    </pre>
                  )}
                  <div className="mt-2.5 flex gap-2">
                    <button
                      className="ac-btn ac-btn-go flex-1"
                      onClick={() => decideApproval(approval.id, "approved")}
                      disabled={busy}
                    >
                      承認する
                    </button>
                    <button
                      className="ac-btn flex-1"
                      onClick={() => decideApproval(approval.id, "rejected")}
                      disabled={busy}
                    >
                      却下
                    </button>
                  </div>
                </li>
              ))}
            </ul>
          </div>
        )}

        <div
          className="mb-5"
          style={
            insightFilter === "all" || insightFilter === "notifications"
              ? undefined
              : { display: "none" }
          }
        >
          <SectionLabel>通知</SectionLabel>
          {props.notifications.length === 0 ? (
            <EmptyState title="通知はありません" />
          ) : (
            <ul className="flex flex-col gap-1.5">
              {props.notifications.slice(0, 8).map((notification) => (
                <li key={notification.id} className="ac-panel p-2.5">
                  <div className="flex items-start gap-2.5">
                    <NotificationTile kind={notification.kind} />
                    <div className="min-w-0 flex-1">
                      <p className="text-[12px] font-medium leading-snug">{notification.title}</p>
                      {notification.body && (
                        <p className="mt-0.5 text-[11px] text-[var(--color-text-faint)]">
                          {notification.body}
                        </p>
                      )}
                      {notification.linkArtifactId && (
                        <button
                          className="ac-btn mt-2 h-7 text-[11.5px]"
                          onClick={() => setOpenArtifactId(notification.linkArtifactId)}
                        >
                          確認する
                        </button>
                      )}
                    </div>
                  </div>
                </li>
              ))}
            </ul>
          )}
          {unreadNotifications.length > 0 && (
            <p className="mt-1.5 text-[11px] text-[var(--color-text-faint)]">
              未読 {unreadNotifications.length} 件
            </p>
          )}
        </div>

        <div
          className="mb-5"
          style={
            insightFilter === "all" || insightFilter === "artifacts"
              ? undefined
              : { display: "none" }
          }
        >
          <SectionLabel>完成した成果物</SectionLabel>
          {props.artifacts.length === 0 ? (
            <EmptyState title="まだ成果物はありません" />
          ) : (
            <ul className="flex flex-col gap-1.5">
              {props.artifacts.slice(0, 6).map((artifact) => {
                const employee = employees.find((e) => e.id === artifact.employeeId);
                return (
                  <li key={artifact.id}>
                    <button
                      className="ac-panel flex w-full items-center gap-2.5 p-2.5 text-left transition-colors hover:bg-[var(--color-bg-hover)]"
                      onClick={() => setOpenArtifactId(artifact.id)}
                    >
                      <IconTile color="var(--color-accent)" glyph={Glyphs.doc} />
                      <span className="min-w-0 flex-1">
                        <span className="block truncate text-[12px] font-medium">
                          {artifact.title}
                        </span>
                        <span className="mt-0.5 block truncate text-[11px] text-[var(--color-text-faint)]">
                          {employee?.name ?? "AI社員"} ・ v{artifact.currentVersion} ・{" "}
                          {artifact.usedWorkTokens.toLocaleString("ja-JP")} WT
                        </span>
                      </span>
                    </button>
                  </li>
                );
              })}
            </ul>
          )}
        </div>

        {selection?.kind === "employee" && <EmployeeInspector
          employee={employees.find((e) => e.id === selection.id) ?? null}
          tasks={tasks}
          artifacts={props.artifacts}
        />}

        <div>
          <SectionLabel>ワークトークン</SectionLabel>
          <div className="ac-panel p-3 text-[12px]">
            <Row label="残高" value={`${props.credits.balance.toLocaleString("ja-JP")} WT`} />
            <Row label="予約中" value={`${props.credits.reserved.toLocaleString("ja-JP")} WT`} />
            <Row label="利用可能" value={`${props.credits.available.toLocaleString("ja-JP")} WT`} />
          </div>
        </div>
      </aside>

      {!inspectorOpenMobile && (
        <div className="fixed bottom-4 right-4 z-20 lg:hidden">
          <button className="ac-btn" onClick={() => setInspectorOpenMobile(true)}>
            インスペクター
          </button>
        </div>
      )}

      {/* 成果物モーダル */}
      <Modal
        open={!!openArtifact}
        onClose={() => setOpenArtifactId(null)}
        title={openArtifact?.title ?? ""}
        wide
        footer={
          openArtifact && (
            <ArtifactActions
              artifactId={openArtifact.id}
              onDone={() => {
                setOpenArtifactId(null);
                router.refresh();
              }}
            />
          )
        }
      >
        {openArtifact && (
          <>
            <div className="mb-3 flex flex-wrap items-center gap-1.5">
              <span className="ac-chip">
                {employees.find((e) => e.id === openArtifact.employeeId)?.name ?? "AI社員"}
              </span>
              <span className="ac-chip">v{openArtifact.currentVersion}</span>
              <span className="ac-chip">
                {openArtifact.usedWorkTokens.toLocaleString("ja-JP")} WT
              </span>
              <span className="ac-chip">
                {new Date(openArtifact.createdAt).toLocaleString("ja-JP")}
              </span>
            </div>
            <Markdown content={props.artifactContents[openArtifact.id] ?? "（本文がありません）"} />
            {openArtifact.citations.length > 0 && (
              <div className="mt-5">
                <SectionLabel>情報源</SectionLabel>
                <ul className="flex flex-col gap-1 text-[12px] text-[var(--color-text-muted)]">
                  {openArtifact.citations.map((c, i) => (
                    <li key={i}>
                      {c.title}
                      {c.url && ` — ${c.url}`}（確認日: {c.checkedAt}）
                    </li>
                  ))}
                </ul>
              </div>
            )}
          </>
        )}
      </Modal>
    </div>
  );
}

function EmployeeInspector({
  employee,
  tasks,
  artifacts,
}: {
  employee: EmployeeInstance | null;
  tasks: Task[];
  artifacts: Artifact[];
}) {
  if (!employee) return null;
  const role = ROLE_DEFINITIONS[employee.roleKey];
  const own = tasks.filter((t) => t.assigneeEmployeeId === employee.id);
  const ownArtifacts = artifacts.filter((a) => a.employeeId === employee.id);

  return (
    <div className="mb-5">
      <SectionLabel>選択中の社員</SectionLabel>
      <div className="ac-panel p-3">
        <div className="flex items-center gap-2.5">
          <EmployeeParticles
            roleKey={employee.roleKey}
            status={employee.status}
            seed={employee.avatarSeed}
            size={40}
          />
          <div className="min-w-0">
            <p className="truncate text-[13px] font-medium">{employee.name}</p>
            <p className="truncate text-[11px] text-[var(--color-text-faint)]">
              {role.name} ・ {employee.specialty}
            </p>
            <EmployeeStatusBadge status={employee.status} />
          </div>
        </div>

        <p className="mt-3 text-[11.5px] leading-relaxed text-[var(--color-text-muted)]">
          {role.description}
        </p>

        <div className="mt-3">
          <p className="mb-1 text-[11px] text-[var(--color-text-faint)]">担当タスク</p>
          {own.length === 0 ? (
            <p className="text-[11.5px] text-[var(--color-text-faint)]">なし</p>
          ) : (
            <ul className="flex flex-col gap-1">
              {own.map((task) => (
                <li key={task.id} className="flex items-center justify-between gap-2">
                  <span className="truncate text-[11.5px]">{task.title}</span>
                  <TaskStatusBadge status={task.status} />
                </li>
              ))}
            </ul>
          )}
        </div>

        {ownArtifacts.length > 0 && (
          <div className="mt-3">
            <p className="mb-1 text-[11px] text-[var(--color-text-faint)]">過去の成果物</p>
            <ul className="flex flex-col gap-0.5 text-[11.5px] text-[var(--color-text-muted)]">
              {ownArtifacts.map((a) => (
                <li key={a.id} className="truncate">
                  {a.title}
                </li>
              ))}
            </ul>
          </div>
        )}

        <div className="mt-3">
          <p className="mb-1 text-[11px] text-[var(--color-text-faint)]">使用可能なツール</p>
          <div className="flex flex-wrap gap-1">
            {role.allowedTools.map((tool) => (
              <span key={tool} className="ac-chip">
                {tool}
              </span>
            ))}
          </div>
        </div>

        {role.approvalRequiredActions.length > 0 && (
          <p className="mt-3 text-[11px] text-[var(--color-caution)]">
            承認が必要な操作: {role.approvalRequiredActions.join(" / ")}
          </p>
        )}
      </div>
    </div>
  );
}

function ArtifactActions({ artifactId, onDone }: { artifactId: string; onDone: () => void }) {
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
        <span className="mr-auto text-[11.5px] text-[var(--color-caution)]">{message}</span>
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

function CreditRing({ ratio }: { ratio: number }) {
  const r = 15.5;
  const c = 2 * Math.PI * r;
  const clamped = Math.max(0, Math.min(1, ratio));
  return (
    <svg width="42" height="42" viewBox="0 0 42 42" aria-hidden>
      <circle cx="21" cy="21" r={r} stroke="var(--color-bg-active)" strokeWidth="5" fill="none" />
      <circle
        cx="21"
        cy="21"
        r={r}
        stroke="var(--color-go)"
        strokeWidth="5"
        fill="none"
        strokeLinecap="round"
        strokeDasharray={`${c * clamped} ${c}`}
        transform="rotate(-90 21 21)"
      />
    </svg>
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

function toChoice(option: DecisionOption): ChoiceOption {
  return {
    id: option.id,
    kind: option.kind,
    title: option.title,
    description: option.description,
    roleKey: option.roleKey,
    reason: option.reason,
    estimatedDurationMinutes: option.estimatedDurationMinutes,
    estimatedWorkTokens: option.estimatedWorkTokens,
    riskLevel: option.riskLevel,
    recommended: option.recommended,
  };
}
