import type { Notification } from "@/lib/core/types";
import type { Store } from "@/lib/db/store";
import { newId, nowIso } from "@/lib/core/ids";

export async function notify(
  store: Store,
  input: {
    organizationId: string;
    userId?: string | null;
    kind: Notification["kind"];
    title: string;
    body: string;
    linkArtifactId?: string | null;
    linkTaskId?: string | null;
  },
): Promise<Notification> {
  return store.insert("notifications", {
    id: newId(),
    organizationId: input.organizationId,
    userId: input.userId ?? null,
    kind: input.kind,
    title: input.title,
    body: input.body,
    linkArtifactId: input.linkArtifactId ?? null,
    linkTaskId: input.linkTaskId ?? null,
    read: false,
    createdAt: nowIso(),
  });
}

export async function listNotifications(
  store: Store,
  organizationId: string,
  limit = 30,
): Promise<Notification[]> {
  return store.list("notifications", organizationId, {
    orderBy: "createdAt",
    direction: "desc",
    limit,
  });
}

export async function markRead(
  store: Store,
  organizationId: string,
  notificationId: string,
): Promise<void> {
  await store.update("notifications", organizationId, notificationId, { read: true });
}
