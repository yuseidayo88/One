import { NextResponse } from "next/server";
import { defineHandler, jsonOk } from "@/lib/api/handler";
import { getStore } from "@/lib/db";

/**
 * task_events の取得。
 *
 * 進捗アニメーションは、見た目だけのタイマーではなくこのイベント列と同期する。
 * Supabase を有効化した場合は Realtime（supabase_realtime パブリケーション）へ
 * 切り替えられるよう、返す形は同一に保つ。
 */
export const GET = defineHandler({}, async ({ req, auth }) => {
  const store = await getStore();
  const url = new URL(req.url);
  const since = url.searchParams.get("since");
  const taskId = url.searchParams.get("taskId");

  const events = await store.list("task_events", auth.organization.id, {
    ...(taskId ? { filter: { taskId } } : {}),
    orderBy: "createdAt",
    direction: "asc",
    limit: 200,
  });

  const filtered = since
    ? events.filter((e) => new Date(e.createdAt).getTime() > new Date(since).getTime())
    : events;

  const tasks = await store.list("tasks", auth.organization.id);
  const employees = await store.list("employee_instances", auth.organization.id);

  const response = jsonOk({
    events: filtered,
    tasks: tasks.map((t) => ({
      id: t.id,
      title: t.title,
      status: t.status,
      assigneeEmployeeId: t.assigneeEmployeeId,
      usedWorkTokens: t.usedWorkTokens,
    })),
    employees: employees.map((e) => ({
      id: e.id,
      name: e.name,
      roleKey: e.roleKey,
      status: e.status,
      currentTaskId: e.currentTaskId,
    })),
    serverTime: new Date().toISOString(),
  });
  response.headers.set("Cache-Control", "no-store");
  return response as NextResponse;
});
