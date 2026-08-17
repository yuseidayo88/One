import Link from "next/link";
import { requireSession } from "@/lib/auth/session";
import { getStore } from "@/lib/db";
import { EmptyState, SectionLabel, TaskStatusBadge } from "@/components/ui/primitives";
import { ROLE_DEFINITIONS } from "@/lib/roles/registry";
import { PROJECT_STATUS_LABEL } from "@/lib/projects/status";

export const dynamic = "force-dynamic";

export default async function ProjectsPage() {
  const auth = await requireSession();
  const store = await getStore();
  const orgId = auth.organization.id;

  const [projects, tasks, artifacts, employees, business] = await Promise.all([
    store.list("projects", orgId, { orderBy: "createdAt", direction: "desc" }),
    store.list("tasks", orgId),
    store.list("artifacts", orgId),
    store.list("employee_instances", orgId),
    store.list("businesses", orgId),
  ]);

  return (
    <div className="mx-auto w-full px-4 py-5" style={{ maxWidth: 1000 }}>
      <div className="mb-4 flex items-center gap-2">
        <h1 className="flex-1 text-[16px] font-semibold tracking-tight">プロジェクト</h1>
        <Link href="/projects/new" className="ac-btn ac-btn-primary h-8 text-[12px]">
          新しい業務
        </Link>
      </div>

      {business[0] && (
        <section className="ac-panel mb-5 p-4">
          <SectionLabel>事業</SectionLabel>
          <h2 className="text-[14px] font-medium">{business[0].name}</h2>
          <p className="mt-1.5 whitespace-pre-wrap text-[12.5px] leading-relaxed text-[var(--color-text-muted)]">
            {business[0].summary}
          </p>
          {business[0].hypotheses.length > 0 && (
            <div className="mt-3">
              <p className="text-[11px] uppercase tracking-[0.08em] text-[var(--color-text-faint)]">
                検証すべき仮説
              </p>
              <ul className="mt-1 flex flex-col gap-0.5 text-[12.5px] text-[var(--color-text-muted)]">
                {business[0].hypotheses.map((h, i) => (
                  <li key={i}>
                    {i + 1}. {h}
                  </li>
                ))}
              </ul>
            </div>
          )}
          {business[0].regulatedNotes && (
            <p
              className="mt-3 rounded-lg px-3 py-2 text-[12px]"
              style={{ background: "#1b1710", color: "var(--color-caution)" }}
            >
              {business[0].regulatedNotes}
            </p>
          )}
        </section>
      )}

      <div className="flex flex-col gap-4">
        {projects.map((project) => {
          const projectTasks = tasks.filter((t) => t.projectId === project.id);
          const projectArtifacts = artifacts.filter((a) => a.projectId === project.id);
          const done = projectTasks.filter((t) => t.status === "done").length;

          return (
            <section key={project.id} className="ac-panel p-4">
              <div className="flex flex-wrap items-center gap-2">
                <Link
                  href={`/projects/${project.id}`}
                  className="text-[14px] font-medium hover:underline"
                >
                  {project.name}
                </Link>
                <span className="ac-chip">{PROJECT_STATUS_LABEL[project.status]}</span>
                <span className="ml-auto text-[12px] text-[var(--color-text-muted)]">
                  {done} / {projectTasks.length} 完了
                </span>
                <Link href={`/projects/${project.id}`} className="ac-btn h-8 text-[12px]">
                  開く
                </Link>
              </div>
              <p className="mt-1 text-[12.5px] text-[var(--color-text-muted)]">
                {project.description}
              </p>

              <div
                className="mt-3 h-1 overflow-hidden rounded-full"
                style={{ background: "var(--color-bg-active)" }}
              >
                <div
                  className="h-full rounded-full transition-all duration-500"
                  style={{
                    width: `${projectTasks.length ? (done / projectTasks.length) * 100 : 0}%`,
                    background: "var(--color-positive)",
                  }}
                />
              </div>

              <div className="mt-4 grid gap-4 sm:grid-cols-2">
                <div>
                  <SectionLabel>タスク</SectionLabel>
                  <ul className="flex flex-col gap-1">
                    {projectTasks.map((task) => {
                      const employee = employees.find((e) => e.id === task.assigneeEmployeeId);
                      return (
                        <li key={task.id} className="flex items-center justify-between gap-2">
                          <span className="min-w-0 flex-1 truncate text-[12.5px]">
                            {task.title}
                            {employee && (
                              <span className="ml-1.5 text-[11px] text-[var(--color-text-faint)]">
                                {ROLE_DEFINITIONS[employee.roleKey].name}
                              </span>
                            )}
                          </span>
                          <TaskStatusBadge status={task.status} />
                        </li>
                      );
                    })}
                    {projectTasks.length === 0 && (
                      <li className="text-[12px] text-[var(--color-text-faint)]">なし</li>
                    )}
                  </ul>
                </div>

                <div>
                  <SectionLabel>完成した成果物</SectionLabel>
                  <ul className="flex flex-col gap-1">
                    {projectArtifacts.map((artifact) => (
                      <li key={artifact.id} className="text-[12.5px]">
                        {artifact.title}
                        <span className="ml-1.5 text-[11px] text-[var(--color-text-faint)]">
                          v{artifact.currentVersion} ・ {artifact.status}
                        </span>
                      </li>
                    ))}
                    {projectArtifacts.length === 0 && (
                      <li className="text-[12px] text-[var(--color-text-faint)]">なし</li>
                    )}
                  </ul>
                </div>
              </div>
            </section>
          );
        })}
        {projects.length === 0 && (
          <EmptyState
            title="プロジェクトはまだありません"
            description="「新しい業務」から、やりたいことを統括AIに相談できます。"
          />
        )}
      </div>
    </div>
  );
}
