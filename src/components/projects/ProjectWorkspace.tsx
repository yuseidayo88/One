"use client";

import { useEffect, useMemo, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { LayoutGroup } from "motion/react";
import type {
  Approval,
  Artifact,
  EmployeeInstance,
  Project,
  Task,
  TaskEvent,
} from "@/lib/core/types";
import { ROLE_DEFINITIONS } from "@/lib/roles/registry";
import { PROJECT_STATUS_LABEL, hasWorkspace } from "@/lib/projects/status";
import { useOrchestrator } from "@/components/orchestrator/OrchestratorContext";
import { OrchestratorCenter } from "@/components/orchestrator/OrchestratorCenter";
import { OrchestratorPanel, OrchestratorSheet } from "@/components/orchestrator/OrchestratorPanel";
import { ProgressGraph } from "@/components/projects/ProgressGraph";
import { EmployeeParticles } from "@/components/particles/EmployeeParticles";
import { Markdown } from "@/components/markdown/Markdown";
import { ArtifactActions } from "@/components/artifacts/ArtifactActions";
import {
  AllGlyphs as Glyphs,
  EmployeeStatusBadge,
  EmptyState,
  IconTile,
  Modal,
  SectionLabel,
  TaskStatusBadge,
} from "@/components/ui/primitives";

type Tab = "overview" | "tasks" | "files" | "history";

const TABS: { key: Tab; label: string }[] = [
  { key: "overview", label: "概要" },
  { key: "tasks", label: "タスク" },
  { key: "files", label: "ファイル" },
  { key: "history", label: "履歴" },
];

export interface WorkspaceProps {
  project: Project;
  employees: EmployeeInstance[];
  tasks: Task[];
  events: TaskEvent[];
  artifacts: Artifact[];
  artifactContents: Record<string, string>;
  approvals: Approval[];
  credits: { balance: number; reserved: number; available: number };
}

/**
 * プロジェクト画面。
 *
 * 開始前は中央が統括AI、開始後は中央が実務（タブ）で統括AIは右パネル。
 * 判断は projectStatus のみに基づく（`hasWorkspace` / `placement`）。
 */
export function ProjectWorkspace(props: WorkspaceProps) {
  const { placement, projectStatus } = useOrchestrator();

  /* サーバー（RSC）が持ってくる内容を土台にし、ポーリングで分かった差分だけを重ねる。
     配列ごと state に写し取ると、router.refresh() で届いた新しいタスクが無視されるため。 */
  const [liveTasks, setLiveTasks] = useState<Map<string, Partial<Task>>>(new Map());
  const [liveEmployees, setLiveEmployees] = useState<Map<string, Partial<EmployeeInstance>>>(
    new Map(),
  );
  const [extraEvents, setExtraEvents] = useState<TaskEvent[]>([]);

  const tasks = useMemo(
    () => props.tasks.map((t) => ({ ...t, ...(liveTasks.get(t.id) ?? {}) })),
    [props.tasks, liveTasks],
  );
  const employees = useMemo(
    () => props.employees.map((e) => ({ ...e, ...(liveEmployees.get(e.id) ?? {}) })),
    [props.employees, liveEmployees],
  );
  const events = useMemo(() => {
    const known = new Set(props.events.map((e) => e.id));
    const taskIds = new Set(props.tasks.map((t) => t.id));
    return [
      ...props.events,
      ...extraEvents.filter((e) => !known.has(e.id) && taskIds.has(e.taskId)),
    ];
  }, [props.events, props.tasks, extraEvents]);

  // task_events をポーリングし、UI を実データと同期させる
  useEffect(() => {
    let stopped = false;
    let since = "";

    const tick = async () => {
      try {
        const res = await fetch(`/api/events${since ? `?since=${encodeURIComponent(since)}` : ""}`, {
          cache: "no-store",
        });
        if (!res.ok || stopped) return;
        const json = await res.json();
        const data = json.data as {
          events: TaskEvent[];
          tasks: { id: string; status: Task["status"]; usedWorkTokens: number }[];
          employees: { id: string; status: EmployeeInstance["status"]; currentTaskId: string | null }[];
        };
        if (data.events.length > 0) {
          since = data.events[data.events.length - 1]!.createdAt;
          setExtraEvents((prev) => [...prev, ...data.events].slice(-200));
        }
        setLiveTasks((prev) => {
          const next = new Map(prev);
          for (const t of data.tasks) {
            next.set(t.id, { status: t.status, usedWorkTokens: t.usedWorkTokens });
          }
          return next;
        });
        setLiveEmployees((prev) => {
          const next = new Map(prev);
          for (const e of data.employees) {
            next.set(e.id, { status: e.status, currentTaskId: e.currentTaskId });
          }
          return next;
        });
      } catch {
        // 一時的な失敗は次の周期を待つ
      }
    };

    void tick();
    const id = setInterval(tick, 2500);
    return () => {
      stopped = true;
      clearInterval(id);
    };
  }, []);

  const workspace = hasWorkspace(projectStatus);

  return (
    <LayoutGroup>
      <div className="flex min-h-[calc(100vh-48px)] md:min-h-screen lg:h-screen">
        <div className="flex min-w-0 flex-1 flex-col">
          {workspace ? (
            <WorkspaceTabs
              {...props}
              employees={employees}
              tasks={tasks}
              events={events}
            />
          ) : (
            <OrchestratorCenter employees={employees} />
          )}
        </div>

        {placement === "right" && <OrchestratorPanel employees={employees} />}
      </div>

      {placement === "right" && <OrchestratorSheet employees={employees} />}
    </LayoutGroup>
  );
}

function WorkspaceTabs({
  project,
  employees,
  tasks,
  events,
  artifacts,
  artifactContents,
  approvals,
  credits,
}: WorkspaceProps) {
  const router = useRouter();
  const [tab, setTab] = useState<Tab>("overview");
  const [openArtifactId, setOpenArtifactId] = useState<string | null>(null);
  const [menuOpen, setMenuOpen] = useState(false);
  const [busy, setBusy] = useState(false);
  const [notice, setNotice] = useState("");

  const openArtifact = artifacts.find((a) => a.id === openArtifactId) ?? null;
  const running = tasks.filter((t) => t.status === "running");

  async function changeStatus(status: Project["status"]) {
    setBusy(true);
    setNotice("");
    setMenuOpen(false);
    try {
      const res = await fetch("/api/projects", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ action: "set_status", projectId: project.id, status }),
      });
      const json = await res.json();
      if (!res.ok) {
        setNotice(json?.error?.message ?? "変更できませんでした");
        return;
      }
      router.refresh();
    } finally {
      setBusy(false);
    }
  }

  return (
    <>
      <header className="shrink-0 border-b px-4 py-3 ac-hairline">
        <div className="flex flex-wrap items-center gap-2">
          {/* 狭い画面では名前を 1 行占有させる（チップに押し潰されないように） */}
          <h1 className="min-w-0 basis-full truncate text-[15px] font-semibold tracking-tight sm:flex-1 sm:basis-auto">
            {project.name}
          </h1>
          <span className="ac-chip">{PROJECT_STATUS_LABEL[project.status]}</span>
          <span className="ac-chip tabular-nums">
            残 {credits.available.toLocaleString("ja-JP")} WT
          </span>

          {project.status === "active" ? (
            <button className="ac-btn h-8" disabled={busy} onClick={() => changeStatus("paused")}>
              {Glyphs.pause}
              一時停止
            </button>
          ) : project.status === "paused" ? (
            <button
              className="ac-btn ac-btn-go h-8"
              disabled={busy}
              onClick={() => changeStatus("active")}
            >
              再開
            </button>
          ) : null}

          <div className="relative">
            <button
              className="ac-btn ac-btn-ghost h-8 px-2"
              aria-label="プロジェクトの操作"
              aria-expanded={menuOpen}
              onClick={() => setMenuOpen((v) => !v)}
            >
              ⋯
            </button>
            {menuOpen && (
              <div
                className="ac-panel absolute right-0 top-9 z-20 w-44 p-1 text-[12.5px]"
                role="menu"
              >
                <button
                  role="menuitem"
                  className="w-full rounded-lg px-3 py-2 text-left hover:bg-[var(--color-bg-hover)]"
                  disabled={busy}
                  onClick={() => changeStatus("completed")}
                >
                  完了にする
                </button>
                <button
                  role="menuitem"
                  className="w-full rounded-lg px-3 py-2 text-left hover:bg-[var(--color-bg-hover)]"
                  disabled={busy}
                  onClick={() => changeStatus("cancelled")}
                >
                  中止する
                </button>
                <Link
                  role="menuitem"
                  href="/projects"
                  className="block rounded-lg px-3 py-2 hover:bg-[var(--color-bg-hover)]"
                >
                  プロジェクト一覧へ
                </Link>
              </div>
            )}
          </div>
        </div>

        {notice && (
          <p role="status" className="mt-1.5 text-[12px] text-[var(--color-caution)]">
            {notice}
          </p>
        )}

        <nav className="mt-3 flex gap-0.5" aria-label="プロジェクトのタブ">
          {TABS.map((item) => (
            <button
              key={item.key}
              role="tab"
              aria-selected={tab === item.key}
              onClick={() => setTab(item.key)}
              className="rounded-lg px-3 py-1.5 text-[12.5px] transition-colors"
              style={{
                background: tab === item.key ? "var(--color-bg-active)" : "transparent",
                color: tab === item.key ? "var(--color-text)" : "var(--color-text-muted)",
              }}
            >
              {item.label}
              {item.key === "files" && artifacts.length > 0 && (
                <span className="ml-1.5 text-[11px] text-[var(--color-text-faint)]">
                  {artifacts.length}
                </span>
              )}
            </button>
          ))}
        </nav>
      </header>

      <div className="ac-fade min-h-0 flex-1 overflow-y-auto px-4 py-4">
        {tab === "overview" && (
          <div className="mx-auto flex w-full max-w-[860px] flex-col gap-5">
            <section className="ac-panel p-4">
              <SectionLabel>進捗</SectionLabel>
              <ProgressGraph tasks={tasks} events={events} />
            </section>

            <section>
              <SectionLabel>いま動いている仕事</SectionLabel>
              {running.length === 0 ? (
                <EmptyState title="実行中のタスクはありません" />
              ) : (
                <ul className="flex flex-col gap-1.5">
                  {running.map((task) => {
                    const employee = employees.find((e) => e.id === task.assigneeEmployeeId);
                    return (
                      <li key={task.id} className="ac-panel flex items-center gap-2.5 p-3">
                        {employee && (
                          <EmployeeParticles
                            roleKey={employee.roleKey}
                            status={employee.status}
                            seed={employee.avatarSeed}
                            size={30}
                          />
                        )}
                        <span className="min-w-0 flex-1">
                          <span className="block truncate text-[12.5px] font-medium">
                            {task.title}
                          </span>
                          <span className="block truncate text-[11px] text-[var(--color-text-faint)]">
                            {employee?.name ?? "未割り当て"} ・{" "}
                            {task.usedWorkTokens.toLocaleString("ja-JP")} /{" "}
                            {task.estimatedWorkTokens.toLocaleString("ja-JP")} WT
                          </span>
                        </span>
                        <TaskStatusBadge status={task.status} />
                      </li>
                    );
                  })}
                </ul>
              )}
            </section>

            {approvals.length > 0 && (
              <section>
                <SectionLabel>承認待ち {approvals.length} 件</SectionLabel>
                <ul className="flex flex-col gap-1.5">
                  {approvals.map((approval) => (
                    <li key={approval.id} className="ac-panel flex items-center gap-2.5 p-3">
                      <IconTile color="var(--color-caution)" glyph={Glyphs.warn} />
                      <span className="min-w-0 flex-1 truncate text-[12.5px]">{approval.title}</span>
                      <Link href="/approvals" className="ac-btn h-8 text-[12px]">
                        確認する
                      </Link>
                    </li>
                  ))}
                </ul>
              </section>
            )}

            <section>
              <SectionLabel>このプロジェクトの担当</SectionLabel>
              <ul className="flex flex-wrap gap-2">
                {employees
                  .filter((e) => tasks.some((t) => t.assigneeEmployeeId === e.id))
                  .map((employee) => (
                    <li key={employee.id} className="ac-panel flex items-center gap-2 p-2.5">
                      <EmployeeParticles
                        roleKey={employee.roleKey}
                        status={employee.status}
                        seed={employee.avatarSeed}
                        size={26}
                      />
                      <span className="text-[12px]">{employee.name}</span>
                      <EmployeeStatusBadge status={employee.status} />
                    </li>
                  ))}
              </ul>
            </section>
          </div>
        )}

        {tab === "tasks" && (
          <div className="mx-auto w-full max-w-[860px]">
            {tasks.length === 0 ? (
              <EmptyState title="タスクはまだありません" />
            ) : (
              <ul className="flex flex-col gap-1.5">
                {tasks.map((task) => {
                  const employee = employees.find((e) => e.id === task.assigneeEmployeeId);
                  return (
                    <li key={task.id} className="ac-panel p-3">
                      <div className="flex items-center gap-2">
                        <span className="min-w-0 flex-1 truncate text-[12.5px] font-medium">
                          {task.title}
                        </span>
                        <TaskStatusBadge status={task.status} />
                      </div>
                      <p className="mt-1 text-[11.5px] text-[var(--color-text-muted)]">
                        {task.description}
                      </p>
                      <p className="mt-1.5 text-[11px] text-[var(--color-text-faint)]">
                        {employee
                          ? `${employee.name}（${ROLE_DEFINITIONS[employee.roleKey].name}）`
                          : "未割り当て"}{" "}
                        ・ {task.usedWorkTokens.toLocaleString("ja-JP")} /{" "}
                        {task.estimatedWorkTokens.toLocaleString("ja-JP")} WT
                      </p>
                    </li>
                  );
                })}
              </ul>
            )}
            <Link href="/tasks" className="ac-btn mt-4">
              タスク管理を開く
            </Link>
          </div>
        )}

        {tab === "files" && (
          <div className="mx-auto w-full max-w-[860px]">
            {artifacts.length === 0 ? (
              <EmptyState
                title="成果物はまだありません"
                description="AI社員が仕事を終えると、ここに完成物が並びます。"
              />
            ) : (
              <ul className="grid gap-2 sm:grid-cols-2">
                {artifacts.map((artifact) => {
                  const employee = employees.find((e) => e.id === artifact.employeeId);
                  return (
                    <li key={artifact.id}>
                      <button
                        className="ac-panel flex w-full items-center gap-2.5 p-3 text-left transition-colors hover:bg-[var(--color-bg-hover)]"
                        onClick={() => setOpenArtifactId(artifact.id)}
                      >
                        <IconTile color="var(--color-accent)" glyph={Glyphs.doc} />
                        <span className="min-w-0 flex-1">
                          <span className="block truncate text-[12.5px] font-medium">
                            {artifact.title}
                          </span>
                          <span className="block truncate text-[11px] text-[var(--color-text-faint)]">
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
        )}

        {tab === "history" && (
          <div className="mx-auto w-full max-w-[860px]">
            {events.length === 0 ? (
              <EmptyState title="履歴はまだありません" />
            ) : (
              <ol className="flex flex-col gap-1.5">
                {[...events].reverse().map((event) => {
                  const employee = employees.find((e) => e.id === event.employeeId);
                  const task = tasks.find((t) => t.id === event.taskId);
                  return (
                    <li key={event.id} className="flex items-start gap-2.5 py-1.5">
                      <span className="mt-1.5 h-1.5 w-1.5 shrink-0 rounded-full" style={{ background: "var(--color-line-strong)" }} aria-hidden />
                      <span className="min-w-0 flex-1">
                        <span className="block text-[12.5px]">{event.message}</span>
                        <span className="block text-[11px] text-[var(--color-text-faint)]">
                          {new Date(event.createdAt).toLocaleString("ja-JP")}
                          {task && ` ・ ${task.title}`}
                          {employee && ` ・ ${employee.name}`}
                        </span>
                      </span>
                    </li>
                  );
                })}
              </ol>
            )}
          </div>
        )}
      </div>

      {/* 成果物は中央（モーダル）で開く。右パネルには置かない。 */}
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
            <Markdown content={artifactContents[openArtifact.id] ?? "（本文がありません）"} />
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
    </>
  );
}
