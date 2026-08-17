import { loadOffice } from "@/lib/views/office";
import { OfficeClient } from "@/app/(app)/office/OfficeClient";
import { getStore } from "@/lib/db";

export const dynamic = "force-dynamic";

export default async function OfficePage() {
  const view = await loadOffice();
  const store = await getStore();

  // 成果物の本文は Inspector で開くときに必要なので、最新版だけ先読みする
  const versions = await Promise.all(
    view.artifacts.slice(0, 8).map(async (artifact) => {
      const list = await store.list("artifact_versions", view.auth.organization.id, {
        filter: { artifactId: artifact.id },
        orderBy: "version",
        direction: "desc",
        limit: 1,
      });
      return [artifact.id, list[0]?.content ?? ""] as const;
    }),
  );

  return (
    <OfficeClient
      business={view.business}
      employees={view.employees}
      conversationId={view.conversationId}
      messages={view.messages}
      pendingDecision={view.pendingDecision}
      tasks={view.tasks}
      approvals={view.approvals}
      artifacts={view.artifacts}
      artifactContents={Object.fromEntries(versions)}
      notifications={view.notifications}
      recentEvents={view.recentEvents}
      feed={view.feed}
      credits={view.credits}
      suggestions={view.suggestions}
    />
  );
}
