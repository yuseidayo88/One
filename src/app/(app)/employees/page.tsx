import { requireSession } from "@/lib/auth/session";
import { getStore } from "@/lib/db";
import { EmployeesClient } from "@/app/(app)/employees/EmployeesClient";

export const dynamic = "force-dynamic";

export default async function EmployeesPage() {
  const auth = await requireSession();
  const store = await getStore();
  const orgId = auth.organization.id;

  const [employees, tasks, memories, artifacts] = await Promise.all([
    store.list("employee_instances", orgId, { orderBy: "createdAt", direction: "asc" }),
    store.list("tasks", orgId),
    store.list("memories", orgId),
    store.list("artifacts", orgId),
  ]);

  return (
    <EmployeesClient
      employees={employees}
      tasks={tasks}
      memories={memories}
      artifacts={artifacts}
    />
  );
}
