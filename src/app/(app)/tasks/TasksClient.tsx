"use client";

import { useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import type {
  Artifact,
  EmployeeInstance,
  Project,
  Task,
  TaskDependency,
  TaskStatus,
} from "@/lib/core/types";
import { TASK_STATUSES, TASK_STATUS_LABEL } from "@/lib/core/types";
import { ROLE_DEFINITIONS } from "@/lib/roles/registry";
import { EmployeeParticles } from "@/components/particles/EmployeeParticles";
import { EmptyState, Modal, SafetyBadge, TaskStatusBadge } from "@/components/ui/primitives";

type ViewMode = "kanban" | "list" | "table" | "timeline";

export function TasksClient({
  tasks: initialTasks,
  employees,
  projects,
  dependencies,
  artifacts,
}: {
  tasks: Task[];
  employees: EmployeeInstance[];
  projects: Project[];
  dependencies: TaskDependency[];
  artifacts: Artifact[];
}) {
  const router = useRouter();
  const [tasks, setTasks] = useState(initialTasks);
  const [view, setView] = useState<ViewMode>("kanban");
  const [dragging, setDragging] = useState<string | null>(null);
  const [error, setError] = useState("");
  const [detailId, setDetailId] = useState<string | null>(null);
  const [projectFilter, setProjectFilter] = useState<string>("all");

  const filtered = useMemo(
    () => (projectFilter === "all" ? tasks : tasks.filter((t) => t.projectId === projectFilter)),
    [tasks, projectFilter],
  );

  async function changeStatus(taskId: string, status: TaskStatus) {
    const previous = tasks;
    // 楽観的更新。サーバーが拒否したら元に戻す
    setTasks((prev) => prev.map((t) => (t.id === taskId ? { ...t, status } : t)));
    setError("");

    const res = await fetch("/api/tasks", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ taskId, action: "set_status", status }),
    });
    const json = await res.json();

    if (!res.ok) {
      setTasks(previous);
      setError(json?.error?.message ?? "ステータスを変更できませんでした");
      return;
    }
    if (json.data?.task) {
      setTasks((prev) => prev.map((t) => (t.id === taskId ? json.data.task : t)));
    }
    router.refresh();
  }

  async function runTask(taskId: string) {
    setError("");
    const res = await fetch("/api/tasks", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ taskId, action: "run" }),
    });
    const json = await res.json();
    if (!res.ok) {
      setError(json?.error?.message ?? "実行を開始できませんでした");
      return;
    }
    setTasks((prev) => prev.map((t) => (t.id === taskId ? { ...t, status: "running" } : t)));
    router.refresh();
  }

  const detail = tasks.find((t) => t.id === detailId) ?? null;

  return (
    <div className="mx-auto w-full px-4 py-5" style={{ maxWidth: 1400 }}>
      <header className="mb-4 flex flex-wrap items-center gap-3">
        <h1 className="text-[16px] font-semibold tracking-tight">タスク</h1>

        <div className="flex gap-0.5 rounded-full border p-1 ac-hairline" style={{ background: "var(--color-bg-raised)" }}>
          {(["kanban", "list", "table", "timeline"] as ViewMode[]).map((mode) => (
            <button
              key={mode}
              onClick={() => setView(mode)}
              className="rounded-full px-3 py-1 text-[12px] transition-colors"
              style={{
                background: view === mode ? "var(--color-bg-active)" : "transparent",
                color: view === mode ? "var(--color-text)" : "var(--color-text-muted)",
              }}
            >
              {{ kanban: "カンバン", list: "リスト", table: "テーブル", timeline: "タイムライン" }[mode]}
            </button>
          ))}
        </div>

        <select
          className="ac-input ml-auto"
          style={{ width: "auto" }}
          value={projectFilter}
          onChange={(e) => setProjectFilter(e.target.value)}
        >
          <option value="all">すべてのプロジェクト</option>
          {projects.map((p) => (
            <option key={p.id} value={p.id}>
              {p.name}
            </option>
          ))}
        </select>
      </header>

      {error && (
        <p
          className="mb-3 rounded-lg px-3 py-2 text-[12.5px]"
          style={{ background: "#1d1211", color: "var(--color-danger)" }}
          role="alert"
        >
          {error}
        </p>
      )}

      {view === "kanban" && (
        <div className="flex gap-3 overflow-x-auto pb-3">
          {TASK_STATUSES.map((status) => {
            const columnTasks = filtered.filter((t) => t.status === status);
            return (
              <div
                key={status}
                className="flex w-[248px] shrink-0 flex-col"
                onDragOver={(e) => e.preventDefault()}
                onDrop={(e) => {
                  e.preventDefault();
                  if (dragging) void changeStatus(dragging, status);
                  setDragging(null);
                }}
              >
                <div className="mb-2 flex items-center justify-between px-1">
                  <span className="text-[12px] font-medium">{TASK_STATUS_LABEL[status]}</span>
                  <span className="text-[11px] text-[var(--color-text-faint)]">
                    {columnTasks.length}
                  </span>
                </div>
                <div
                  className="flex min-h-[120px] flex-col gap-2 rounded-2xl p-2"
                  style={{ background: "var(--color-bg-raised)" }}
                >
                  {columnTasks.map((task) => (
                    <TaskCard
                      key={task.id}
                      task={task}
                      employees={employees}
                      onDragStart={() => setDragging(task.id)}
                      onClick={() => setDetailId(task.id)}
                    />
                  ))}
                  {columnTasks.length === 0 && (
                    <p className="px-2 py-3 text-center text-[11px] text-[var(--color-text-faint)]">
                      なし
                    </p>
                  )}
                </div>
              </div>
            );
          })}
        </div>
      )}

      {view === "list" && (
        <ul className="flex flex-col gap-1.5">
          {filtered.map((task) => {
            const employee = employees.find((e) => e.id === task.assigneeEmployeeId);
            return (
              <li key={task.id}>
                <button
                  className="ac-panel flex w-full items-center gap-3 p-3 text-left transition-colors hover:bg-[var(--color-bg-hover)]"
                  onClick={() => setDetailId(task.id)}
                >
                  {employee && (
                    <EmployeeParticles
                      roleKey={employee.roleKey}
                      status={employee.status}
                      seed={employee.avatarSeed}
                      size={28}
                    />
                  )}
                  <span className="min-w-0 flex-1">
                    <span className="block truncate text-[13px] font-medium">{task.title}</span>
                    <span className="block truncate text-[11.5px] text-[var(--color-text-faint)]">
                      {employee?.name ?? "未割り当て"} ・ 見積 {task.estimatedWorkTokens.toLocaleString("ja-JP")} WT
                    </span>
                  </span>
                  <TaskStatusBadge status={task.status} />
                </button>
              </li>
            );
          })}
          {filtered.length === 0 && <EmptyState title="タスクがありません" />}
        </ul>
      )}

      {view === "table" && (
        <div className="ac-panel overflow-x-auto">
          <table className="w-full text-[12.5px]">
            <thead>
              <tr style={{ background: "var(--color-bg-raised)" }}>
                {["タイトル", "担当", "ステータス", "優先度", "見積WT", "実使用WT", "成果物"].map((h) => (
                  <th key={h} className="border-b px-3 py-2 text-left font-medium ac-hairline">
                    {h}
                  </th>
                ))}
              </tr>
            </thead>
            <tbody>
              {filtered.map((task) => {
                const employee = employees.find((e) => e.id === task.assigneeEmployeeId);
                const count = artifacts.filter((a) => a.taskId === task.id).length;
                return (
                  <tr
                    key={task.id}
                    className="cursor-pointer transition-colors hover:bg-[var(--color-bg-hover)]"
                    onClick={() => setDetailId(task.id)}
                  >
                    <td className="border-b px-3 py-2 ac-hairline">{task.title}</td>
                    <td className="border-b px-3 py-2 ac-hairline">{employee?.name ?? "—"}</td>
                    <td className="border-b px-3 py-2 ac-hairline">
                      <TaskStatusBadge status={task.status} />
                    </td>
                    <td className="border-b px-3 py-2 ac-hairline">{task.priority}</td>
                    <td className="border-b px-3 py-2 text-right ac-hairline">
                      {task.estimatedWorkTokens.toLocaleString("ja-JP")}
                    </td>
                    <td className="border-b px-3 py-2 text-right ac-hairline">
                      {task.usedWorkTokens.toLocaleString("ja-JP")}
                    </td>
                    <td className="border-b px-3 py-2 text-right ac-hairline">{count}</td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      )}

      {view === "timeline" && (
        <div className="ac-panel p-4">
          <ul className="flex flex-col gap-2">
            {filtered.map((task, index) => {
              const deps = dependencies.filter((d) => d.taskId === task.id);
              return (
                <li key={task.id} className="flex items-center gap-3">
                  <span className="w-6 shrink-0 text-right text-[11px] text-[var(--color-text-faint)]">
                    {index + 1}
                  </span>
                  <div
                    className="h-1.5 rounded-full"
                    style={{
                      width: `${Math.min(70, 12 + task.estimatedWorkTokens / 500)}%`,
                      background:
                        task.status === "done"
                          ? "var(--color-positive)"
                          : task.status === "running"
                            ? "var(--color-accent)"
                            : "var(--color-line-strong)",
                    }}
                  />
                  <span className="truncate text-[12px]">{task.title}</span>
                  {deps.length > 0 && (
                    <span className="ac-chip shrink-0">依存 {deps.length}</span>
                  )}
                </li>
              );
            })}
          </ul>
        </div>
      )}

      <Modal
        open={!!detail}
        onClose={() => setDetailId(null)}
        title={detail?.title ?? ""}
        wide
        footer={
          detail && (
            <div className="flex gap-2">
              <button className="ac-btn" onClick={() => changeStatus(detail.id, "queued")}>
                待機に戻す
              </button>
              <button className="ac-btn ac-btn-go" onClick={() => runTask(detail.id)}>
                実行する
              </button>
            </div>
          )
        }
      >
        {detail && (
          <div className="flex flex-col gap-4 text-[13px]">
            <p className="leading-relaxed text-[var(--color-text-muted)]">{detail.description}</p>
            <dl className="grid gap-2 sm:grid-cols-2">
              <Detail label="ステータス">
                <TaskStatusBadge status={detail.status} />
              </Detail>
              <Detail label="安全レベル">
                <SafetyBadge level={detail.safetyLevel} />
                {detail.safetyLevel === "GREEN" && <span className="text-[12px]">通常</span>}
              </Detail>
              <Detail label="担当社員">
                {employees.find((e) => e.id === detail.assigneeEmployeeId)?.name ?? "未割り当て"}
              </Detail>
              <Detail label="優先度">{detail.priority}</Detail>
              <Detail label="見積ワークトークン">
                {detail.estimatedWorkTokens.toLocaleString("ja-JP")} WT
              </Detail>
              <Detail label="実使用ワークトークン">
                {detail.usedWorkTokens.toLocaleString("ja-JP")} WT
              </Detail>
              <Detail label="必要な能力">{detail.requiredCapabilities.join(", ") || "—"}</Detail>
              <Detail label="使用ツール">{detail.tools.join(", ") || "—"}</Detail>
            </dl>

            <div>
              <p className="mb-1 text-[11px] uppercase tracking-[0.08em] text-[var(--color-text-faint)]">
                依存タスク
              </p>
              <ul className="flex flex-col gap-1">
                {dependencies
                  .filter((d) => d.taskId === detail.id)
                  .map((d) => {
                    const upstream = tasks.find((t) => t.id === d.dependsOnTaskId);
                    return (
                      <li key={d.id} className="flex items-center gap-2 text-[12.5px]">
                        <span>{upstream?.title ?? "—"}</span>
                        {upstream && <TaskStatusBadge status={upstream.status} />}
                      </li>
                    );
                  })}
                {dependencies.filter((d) => d.taskId === detail.id).length === 0 && (
                  <li className="text-[12px] text-[var(--color-text-faint)]">なし</li>
                )}
              </ul>
            </div>

            <div>
              <p className="mb-1 text-[11px] uppercase tracking-[0.08em] text-[var(--color-text-faint)]">
                成果物
              </p>
              <ul className="flex flex-col gap-1">
                {artifacts
                  .filter((a) => a.taskId === detail.id)
                  .map((a) => (
                    <li key={a.id} className="text-[12.5px]">
                      {a.title}（v{a.currentVersion}）
                    </li>
                  ))}
                {artifacts.filter((a) => a.taskId === detail.id).length === 0 && (
                  <li className="text-[12px] text-[var(--color-text-faint)]">なし</li>
                )}
              </ul>
            </div>
          </div>
        )}
      </Modal>
    </div>
  );
}

function TaskCard({
  task,
  employees,
  onDragStart,
  onClick,
}: {
  task: Task;
  employees: EmployeeInstance[];
  onDragStart: () => void;
  onClick: () => void;
}) {
  const employee = employees.find((e) => e.id === task.assigneeEmployeeId);
  const role = employee ? ROLE_DEFINITIONS[employee.roleKey] : null;

  return (
    <div
      draggable
      onDragStart={onDragStart}
      onClick={onClick}
      role="button"
      tabIndex={0}
      onKeyDown={(e) => {
        if (e.key === "Enter") onClick();
      }}
      className="ac-panel cursor-grab p-2.5 transition-all active:cursor-grabbing"
      style={{ background: "var(--color-bg-panel)" }}
    >
      <p className="text-[12.5px] font-medium leading-snug">{task.title}</p>
      <div className="mt-2 flex items-center gap-1.5">
        {employee && (
          <EmployeeParticles
            roleKey={employee.roleKey}
            status={employee.status}
            seed={employee.avatarSeed}
            size={20}
          />
        )}
        <span className="truncate text-[11px] text-[var(--color-text-faint)]">
          {employee?.name ?? "未割り当て"}
          {role && role.name !== employee?.name ? `（${role.name}）` : ""}
        </span>
      </div>
      <div className="mt-1.5 flex flex-wrap gap-1">
        <span className="ac-chip">{task.estimatedWorkTokens.toLocaleString("ja-JP")} WT</span>
        <SafetyBadge level={task.safetyLevel} />
      </div>
    </div>
  );
}

function Detail({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div>
      <dt className="text-[11px] uppercase tracking-[0.08em] text-[var(--color-text-faint)]">
        {label}
      </dt>
      <dd className="mt-0.5 flex items-center gap-1.5">{children}</dd>
    </div>
  );
}
