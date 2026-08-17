import { requireSession } from "@/lib/auth/session";
import { getStore } from "@/lib/db";
import { KnowledgeClient } from "@/app/(app)/knowledge/KnowledgeClient";

export const dynamic = "force-dynamic";

export default async function KnowledgePage() {
  const auth = await requireSession();
  const store = await getStore();
  const orgId = auth.organization.id;

  const [memories, employees, artifacts] = await Promise.all([
    store.list("memories", orgId, { orderBy: "createdAt", direction: "desc" }),
    store.list("employee_instances", orgId),
    store.list("artifacts", orgId, { orderBy: "createdAt", direction: "desc" }),
  ]);

  return <KnowledgeClient memories={memories} employees={employees} artifacts={artifacts} />;
}
