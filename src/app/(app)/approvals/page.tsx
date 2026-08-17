import { requireSession } from "@/lib/auth/session";
import { getStore } from "@/lib/db";
import { ApprovalsClient } from "@/app/(app)/approvals/ApprovalsClient";

export const dynamic = "force-dynamic";

export default async function ApprovalsPage() {
  const auth = await requireSession();
  const store = await getStore();
  const orgId = auth.organization.id;

  const [approvals, employees] = await Promise.all([
    store.list("approvals", orgId, {
      filter: { status: "pending" },
      orderBy: "createdAt",
      direction: "desc",
    }),
    store.list("employee_instances", orgId),
  ]);

  return <ApprovalsClient approvals={approvals} employees={employees} />;
}
