"use client";

import { useEffect, useMemo, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import type {
  Approval,
  Artifact,
  Business,
  EmployeeInstance,
  Project,
  RoleKey,
  Task,
} from "@/lib/core/types";
import { ALL_ROLE_KEYS, ROLE_DEFINITIONS } from "@/lib/roles/registry";
import { EmployeeParticles } from "@/components/particles/EmployeeParticles";
import { FeedList, type FeedFilter } from "@/components/feed/FeedList";
import { countActionable, type FeedItem } from "@/lib/views/feed";
import { Markdown } from "@/components/markdown/Markdown";
import { ArtifactActions } from "@/components/artifacts/ArtifactActions";
import { PROJECT_STATUS_LABEL } from "@/lib/projects/status";
import {
  AllGlyphs as Glyphs,
  EmployeeStatusBadge,
  EmptyState,
  Modal,
  SectionLabel,
  TaskStatusBadge,
} from "@/components/ui/primitives";

/**
 * オフィス。
 *
 * ここは「会社の状態と社員の一覧」を見る場所であって、相談する場所ではない。
 * 統括AIとの会話はプロジェクト画面（中央または右パネル）にあり、ここには置かない。
 */
export function OfficeClient(props: {
  business: Business | null;
  employees: EmployeeInstance[];
  tasks: Task[];
  approvals: Approval[];
  artifacts: Artifact[];
  projects: Project[];
  feed: FeedItem[];
  artifactContents: Record<string, string>;
  credits: { balance: number; reserved: number; available: number };
}) {
  const router = useRouter();
  const [openId, setOpenId] = useState<string | null>(null);
  const [hireOpen, setHireOpen] = useState(false);
  const [busy, setBusy] = useState(false);
  const [notice, setNotice] = useState("");
  const [feedFilter, setFeedFilter] = useState<FeedFilter>("action");
  const [openArtifactId, setOpenArtifactId] = useState<string | null>(null);

  /* サーバー（RSC）の内容を土台に、ポーリングで分かった稼働状況だけを重ねる。
     配列ごと state に写すと、再取得した新しい社員やタスクが表示されなくなる。 */
  const [liveEmployees, setLiveEmployees] = useState<Map<string, Partial<EmployeeInstance>>>(
    new Map(),
  );
  const [liveTasks, setLiveTasks] = useState<Map<string, Partial<Task>>>(new Map());

  const employees = useMemo(
    () => props.employees.map((e) => ({ ...e, ...(liveEmployees.get(e.id) ?? {}) })),
    [props.employees, liveEmployees],
  );
  const tasks = useMemo(
    () => props.tasks.map((t) => ({ ...t, ...(liveTasks.get(t.id) ?? {}) })),
    [props.tasks, liveTasks],
  );

  // 稼働状況は実データと同期させる（見た目だけ動かさない）
  useEffect(() => {
    let stopped = false;
    const tick = async () => {
      try {
        const res = await fetch("/api/events", { cache: "no-store" });
        if (!res.ok || stopped) return;
        const json = await res.json();
        const data = json.data as {
          tasks: { id: string; status: Task["status"]; usedWorkTokens: number }[];
          employees: {
            id: string;
            status: EmployeeInstance["status"];
            currentTaskId: string | null;
          }[];
        };
        setLiveEmployees((prev) => {
          const next = new Map(prev);
          for (const e of data.employees) {
            next.set(e.id, { status: e.status, currentTaskId: e.currentTaskId });
          }
          return next;
        });
        setLiveTasks((prev) => {
          const next = new Map(prev);
          for (const t of data.tasks) {
            next.set(t.id, { status: t.status, usedWorkTokens: t.usedWorkTokens });
          }
          return next;
        });
      } catch {
        // 一時的な失敗は次の周期を待つ
      }
    };
    const id = setInterval(tick, 3000);
    return () => {
      stopped = true;
      clearInterval(id);
    };
  }, []);

  const working = employees.filter((e) => e.status === "working").length;
  const runningTasks = tasks.filter((t) => t.status === "running").length;
  const openEmployee = employees.find((e) => e.id === openId) ?? null;
  const hiredRoles = new Set(employees.map((e) => e.roleKey));
  const actionable = countActionable(props.feed);
  const openArtifact = props.artifacts.find((a) => a.id === openArtifactId) ?? null;
  const activeProject =
    props.projects.find((p) => p.status === "active" || p.status === "paused") ??
    props.projects.find((p) => p.status !== "cancelled") ??
    null;

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

  async function act(body: Record<string, unknown>, message: string) {
    setBusy(true);
    setNotice("");
    try {
      const res = await fetch("/api/employees", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify(body),
      });
      const json = await res.json();
      if (!res.ok) {
        setNotice(json?.error?.message ?? "処理できませんでした");
        return;
      }
      setNotice(message);
      router.refresh();
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="mx-auto w-full px-4 py-5" style={{ maxWidth: 1000 }}>
      {/* ── 会社の状態 ───────────────────────────── */}
      <header className="mb-5">
        <div className="flex flex-wrap items-center gap-2">
          <h1 className="min-w-0 flex-1 truncate text-[16px] font-semibold tracking-tight">
            {props.business?.name ?? "オフィス"}
          </h1>
          <button className="ac-btn h-8" onClick={() => setHireOpen(true)} disabled={busy}>
            {Glyphs.plus}
            社員採用
          </button>
          <button
            className="ac-btn ac-btn-danger h-8"
            disabled={busy}
            onClick={() => act({ action: "emergency_stop" }, "全社員を停止しました。")}
          >
            全社員停止
          </button>
        </div>

        <dl className="mt-3 grid grid-cols-2 gap-2 sm:grid-cols-4">
          <Stat label="AI社員" value={`${employees.length} 名`} sub={`稼働中 ${working} 名`} />
          <Stat label="実行中のタスク" value={`${runningTasks} 件`} sub={`全 ${tasks.length} 件`} />
          <Stat
            label="承認待ち"
            value={`${props.approvals.length} 件`}
            sub={props.approvals.length > 0 ? "確認が必要です" : "なし"}
          />
          <Stat
            label="ワークトークン"
            value={props.credits.available.toLocaleString("ja-JP")}
            sub={`予約中 ${props.credits.reserved.toLocaleString("ja-JP")}`}
          />
        </dl>

        {activeProject && (
          <Link
            href={`/projects/${activeProject.id}`}
            className="ac-panel mt-3 flex items-center gap-2.5 p-3 transition-colors hover:bg-[var(--color-bg-hover)]"
          >
            <span className="min-w-0 flex-1">
              <span className="block text-[10.5px] uppercase tracking-[0.08em] text-[var(--color-text-faint)]">
                進行中のプロジェクト
              </span>
              <span className="block truncate text-[13px] font-medium">{activeProject.name}</span>
            </span>
            <span className="ac-chip shrink-0">{PROJECT_STATUS_LABEL[activeProject.status]}</span>
            <span className="ac-btn h-8 shrink-0 text-[12px]">開く</span>
          </Link>
        )}

        {notice && (
          <p role="status" className="mt-2 text-[12px] text-[var(--color-text-muted)]">
            {notice}
          </p>
        )}
      </header>

      {/* ── 社員一覧（フラットな行） ─────────────────── */}
      <SectionLabel>AI社員 {employees.length}名</SectionLabel>

      {employees.length === 0 ? (
        <EmptyState
          title="まだAI社員はいません"
          description="統括AIに相談すると、必要な職種を提案します。"
        />
      ) : (
        <div className="ac-panel overflow-hidden">
          <div
            className="hidden items-center gap-3 border-b px-3 py-2 text-[11px] uppercase tracking-[0.08em] ac-hairline sm:flex"
            style={{ color: "var(--color-text-faint)" }}
          >
            <span className="w-[36px] shrink-0" aria-hidden />
            <span className="min-w-0 flex-1">社員</span>
            <span className="w-[112px] shrink-0">職種</span>
            <span className="w-[104px] shrink-0">稼働状況</span>
            <span className="w-[30%] shrink-0">現在の仕事</span>
          </div>

          <ul>
            {employees.map((employee) => {
              const role = ROLE_DEFINITIONS[employee.roleKey];
              const current = tasks.find((t) => t.id === employee.currentTaskId);
              return (
                <li key={employee.id} className="border-b last:border-b-0 ac-hairline">
                  <button
                    className="flex w-full flex-wrap items-center gap-3 px-3 py-2.5 text-left transition-colors hover:bg-[var(--color-bg-hover)]"
                    onClick={() => setOpenId(employee.id)}
                    data-testid="office-employee-row"
                  >
                    <EmployeeParticles
                      roleKey={employee.roleKey}
                      status={employee.status}
                      seed={employee.avatarSeed}
                      size={36}
                    />
                    <span className="min-w-0 flex-1">
                      <span className="block truncate text-[13px] font-medium">
                        {employee.name}
                      </span>
                      <span className="block truncate text-[11px] text-[var(--color-text-faint)]">
                        {employee.specialty}
                      </span>
                    </span>
                    <span className="w-[112px] shrink-0 truncate text-[12px] text-[var(--color-text-muted)]">
                      {role.name}
                    </span>
                    <span className="w-[104px] shrink-0">
                      <EmployeeStatusBadge status={employee.status} />
                    </span>
                    <span className="w-full shrink-0 truncate text-[12px] text-[var(--color-text-muted)] sm:w-[30%]">
                      {current ? current.title : "—"}
                    </span>
                  </button>
                </li>
              );
            })}
          </ul>
        </div>
      )}

      {/* ── 今日のフィード ────────────────────────── */}
      <div className="mt-6">
        <SectionLabel
          action={
            <div className="flex gap-1">
              {(
                [
                  ["action", "対応が必要"],
                  ["all", "すべて"],
                ] as const
              ).map(([key, label]) => (
                <button
                  key={key}
                  className="ac-filter-chip"
                  data-active={feedFilter === key}
                  onClick={() => setFeedFilter(key)}
                >
                  {label}
                </button>
              ))}
            </div>
          }
        >
          今日のフィード
          {actionable > 0 && (
            <span className="ml-1.5 text-[var(--color-caution)]">{actionable}</span>
          )}
        </SectionLabel>
        <FeedList
          items={props.feed}
          employees={employees}
          filter={feedFilter}
          busy={busy}
          onOpenArtifact={(id) => setOpenArtifactId(id)}
          onApprove={(id) => decideApproval(id, "approved")}
          onReject={(id) => decideApproval(id, "rejected")}
          onAskDirector={() => {
            if (activeProject) router.push(`/projects/${activeProject.id}`);
          }}
        />
      </div>

      {/* ── 成果物（中央のモーダルで開く） ──────────────── */}
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
            </div>
            <Markdown content={props.artifactContents[openArtifact.id] ?? "（本文がありません）"} />
          </>
        )}
      </Modal>

      {/* ── 社員の詳細 ───────────────────────────── */}
      <Modal
        open={!!openEmployee}
        onClose={() => setOpenId(null)}
        title={openEmployee?.name ?? ""}
      >
        {openEmployee && (
          <EmployeeDetail
            employee={openEmployee}
            tasks={tasks}
            artifacts={props.artifacts}
          />
        )}
      </Modal>

      {/* ── 採用 ────────────────────────────────── */}
      <Modal open={hireOpen} onClose={() => setHireOpen(false)} title="AI社員を採用する">
        <p className="mb-3 text-[12.5px] text-[var(--color-text-muted)]">
          職種は 9 種類で固定です。できる業務・使えるツール・触れるデータは職種ごとに決まっており、
          採用後も変更できません。
        </p>
        <ul className="flex flex-col gap-1.5">
          {ALL_ROLE_KEYS.map((roleKey) => {
            const role = ROLE_DEFINITIONS[roleKey as RoleKey];
            const already = hiredRoles.has(roleKey as RoleKey);
            return (
              <li key={roleKey} className="ac-panel flex items-center gap-2.5 p-3">
                <EmployeeParticles
                  roleKey={roleKey as RoleKey}
                  status="idle"
                  seed={roleKey}
                  size={30}
                />
                <span className="min-w-0 flex-1">
                  <span className="block text-[12.5px] font-medium">{role.name}</span>
                  <span className="block text-[11px] text-[var(--color-text-faint)]">
                    {role.description}
                  </span>
                </span>
                <button
                  className="ac-btn h-8 shrink-0 text-[12px]"
                  disabled={busy || already}
                  onClick={() => act({ action: "hire", roleKey }, `${role.name}を採用しました。`)}
                >
                  {already ? "在籍中" : "採用する"}
                </button>
              </li>
            );
          })}
        </ul>
      </Modal>
    </div>
  );
}

function Stat({ label, value, sub }: { label: string; value: string; sub?: string }) {
  return (
    <div className="ac-panel px-3 py-2.5">
      <dt className="text-[10.5px] uppercase tracking-[0.08em] text-[var(--color-text-faint)]">
        {label}
      </dt>
      <dd className="mt-0.5 text-[15px] font-semibold tabular-nums">{value}</dd>
      {sub && <dd className="text-[11px] text-[var(--color-text-faint)]">{sub}</dd>}
    </div>
  );
}

function EmployeeDetail({
  employee,
  tasks,
  artifacts,
}: {
  employee: EmployeeInstance;
  tasks: Task[];
  artifacts: Artifact[];
}) {
  const role = ROLE_DEFINITIONS[employee.roleKey];
  const own = tasks.filter((t) => t.assigneeEmployeeId === employee.id);
  const ownArtifacts = artifacts.filter((a) => a.employeeId === employee.id);

  return (
    <div>
      <div className="flex items-center gap-3">
        <EmployeeParticles
          roleKey={employee.roleKey}
          status={employee.status}
          seed={employee.avatarSeed}
          size={44}
        />
        <div className="min-w-0">
          <p className="truncate text-[13px] font-medium">{employee.name}</p>
          <p className="truncate text-[11.5px] text-[var(--color-text-faint)]">
            {role.name} ・ {employee.specialty}
          </p>
          <EmployeeStatusBadge status={employee.status} />
        </div>
      </div>

      <p className="mt-3 text-[12px] leading-relaxed text-[var(--color-text-muted)]">
        {role.description}
      </p>

      <div className="mt-4">
        <SectionLabel>担当タスク</SectionLabel>
        {own.length === 0 ? (
          <p className="text-[12px] text-[var(--color-text-faint)]">なし</p>
        ) : (
          <ul className="flex flex-col gap-1">
            {own.map((task) => (
              <li key={task.id} className="flex items-center justify-between gap-2">
                <span className="min-w-0 flex-1 truncate text-[12px]">{task.title}</span>
                <TaskStatusBadge status={task.status} />
              </li>
            ))}
          </ul>
        )}
      </div>

      {ownArtifacts.length > 0 && (
        <div className="mt-4">
          <SectionLabel>過去の成果物</SectionLabel>
          <ul className="flex flex-col gap-0.5 text-[12px] text-[var(--color-text-muted)]">
            {ownArtifacts.map((a) => (
              <li key={a.id} className="truncate">
                {a.title}
              </li>
            ))}
          </ul>
        </div>
      )}

      <div className="mt-4">
        <SectionLabel>使用可能なツール</SectionLabel>
        <div className="flex flex-wrap gap-1">
          {role.allowedTools.map((tool) => (
            <span key={tool} className="ac-chip">
              {tool}
            </span>
          ))}
        </div>
      </div>

      {role.approvalRequiredActions.length > 0 && (
        <p className="mt-3 text-[11.5px] text-[var(--color-caution)]">
          承認が必要な操作: {role.approvalRequiredActions.join(" / ")}
        </p>
      )}
    </div>
  );
}
