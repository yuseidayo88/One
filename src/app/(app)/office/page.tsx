import { requireSession } from "@/lib/auth/session";
import { getStore } from "@/lib/db";
import { availableBalance, getWallet } from "@/lib/credits/ledger";
import { buildFeed } from "@/lib/views/feed";
import { suggestNextWork } from "@/lib/orchestrator/workflow";
import { OfficeClient } from "@/app/(app)/office/OfficeClient";

export const dynamic = "force-dynamic";

export default async function OfficePage() {
  const auth = await requireSession();
  const store = await getStore();
  const orgId = auth.organization.id;

  const [businesses, employees, tasks, approvals, artifacts, projects] = await Promise.all([
    store.list("businesses", orgId),
    store.list("employee_instances", orgId, { orderBy: "createdAt", direction: "asc" }),
    store.list("tasks", orgId, { orderBy: "createdAt", direction: "asc" }),
    store.list("approvals", orgId, { filter: { status: "pending" } }),
    store.list("artifacts", orgId, { orderBy: "createdAt", direction: "desc", limit: 40 }),
    store.list("projects", orgId, { orderBy: "createdAt", direction: "desc" }),
  ]);

  const [wallet, notifications, events, suggestions] = await Promise.all([
    getWallet(store, orgId),
    store.list("notifications", orgId, { orderBy: "createdAt", direction: "desc", limit: 20 }),
    store.list("task_events", orgId, { orderBy: "createdAt", direction: "desc", limit: 200 }),
    suggestNextWork(store, orgId),
  ]);

  // 成果物の本文はモーダルで開くときに必要なので、最新版だけ先読みする
  const versions = await Promise.all(
    artifacts.slice(0, 8).map(async (artifact) => {
      const list = await store.list("artifact_versions", orgId, {
        filter: { artifactId: artifact.id },
        orderBy: "version",
        direction: "desc",
        limit: 1,
      });
      return [artifact.id, list[0]?.content ?? ""] as const;
    }),
  );

  // 今日のフィード（成果物・承認・引き継ぎ・提案を 1 本にまとめたもの）
  const feed = buildFeed({
    employees,
    tasks,
    artifacts,
    approvals,
    notifications,
    events,
    suggestions,
  });

  return (
    <OfficeClient
      business={businesses[0] ?? null}
      employees={employees}
      tasks={tasks}
      approvals={approvals}
      artifacts={artifacts}
      projects={projects}
      feed={feed}
      artifactContents={Object.fromEntries(versions)}
      credits={{
        balance: wallet.balance,
        reserved: wallet.reserved,
        available: availableBalance(wallet),
      }}
    />
  );
}
