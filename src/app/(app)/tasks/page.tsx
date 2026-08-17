import { requireSession } from "@/lib/auth/session";
import { getStore } from "@/lib/db";
import { TasksClient } from "@/app/(app)/tasks/TasksClient";

export const dynamic = "force-dynamic";

export default async function TasksPage() {
  const auth = await requireSession();
  const store = await getStore();
  const orgId = auth.organization.id;

  const [tasks, employees, projects, dependencies, artifacts] = await Promise.all([
    store.list("tasks", orgId, { orderBy: "createdAt", direction: "asc" }),
    store.list("employee_instances", orgId),
    store.list("projects", orgId),
    store.list("task_dependencies", orgId),
    store.list("artifacts", orgId),
  ]);

  return (
    <TasksClient
      tasks={tasks}
      employees={employees}
      projects={projects}
      dependencies={dependencies}
      artifacts={artifacts}
    />
  );
}
