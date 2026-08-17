import { requireSession } from "@/lib/auth/session";
import { getStore } from "@/lib/db";
import { usageSummary } from "@/lib/credits/ledger";
import { CREDIT_PACKS, PLANS } from "@/config/pricing";
import { UsageClient } from "@/app/(app)/usage/UsageClient";

export const dynamic = "force-dynamic";

export default async function UsagePage() {
  const auth = await requireSession();
  const store = await getStore();
  const orgId = auth.organization.id;

  const [summary, employees, ledger, subscriptions] = await Promise.all([
    usageSummary(store, orgId),
    store.list("employee_instances", orgId),
    store.list("credit_ledger", orgId, { orderBy: "createdAt", direction: "desc", limit: 40 }),
    store.list("subscriptions", orgId),
  ]);

  return (
    <UsageClient
      summary={summary}
      employeeNames={Object.fromEntries(employees.map((e) => [e.id, e.name]))}
      ledger={ledger}
      currentPlan={auth.organization.planKey}
      subscriptionStatus={subscriptions[0]?.status ?? "active"}
      plans={Object.values(PLANS)}
      packs={CREDIT_PACKS}
    />
  );
}
