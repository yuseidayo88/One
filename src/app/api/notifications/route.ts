import { z } from "zod";
import { defineHandler, jsonOk } from "@/lib/api/handler";
import { getStore } from "@/lib/db";
import { listNotifications, markRead } from "@/lib/notifications/service";

export const GET = defineHandler({}, async ({ auth }) => {
  const store = await getStore();
  const notifications = await listNotifications(store, auth.organization.id);
  return jsonOk({ notifications });
});

const schema = z.object({
  organizationId: z.string().uuid().optional(),
  notificationId: z.string().uuid(),
});

export const POST = defineHandler({ schema }, async ({ body, auth }) => {
  const store = await getStore();
  await markRead(store, auth.organization.id, body.notificationId);
  return jsonOk({ ok: true });
});
