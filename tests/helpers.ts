import { MemoryStore } from "@/lib/db/memory-store";
import { newId, nowIso } from "@/lib/core/ids";
import { hireEmployee } from "@/lib/orchestrator/workflow";
import { grantMonthly } from "@/lib/credits/ledger";
import type { RoleKey, Task, TaskStatus } from "@/lib/core/types";

export interface TestOrg {
  store: MemoryStore;
  orgId: string;
  userId: string;
  conversationId: string;
}

export async function createOrg(
  store: MemoryStore,
  name = "テスト組織",
  planKey: "free" | "starter" | "founder" | "ceo" = "founder",
): Promise<TestOrg> {
  const userId = newId();
  const orgId = newId();
  const now = nowIso();

  await store.insert("profiles", {
    id: userId,
    email: `${userId.slice(0, 8)}@example.com`,
    displayName: "テストユーザー",
    passwordHash: "scrypt:x:y",
    createdAt: now,
    updatedAt: now,
  });

  await store.insert("organizations", {
    id: orgId,
    name,
    ownerUserId: userId,
    planKey,
    locale: "ja",
    createdAt: now,
    updatedAt: now,
    createdBy: userId,
  });

  await store.insert("organization_members", {
    id: newId(),
    organizationId: orgId,
    userId,
    role: "owner",
    createdAt: now,
  });

  const conversationId = newId();
  await store.insert("conversations", {
    id: conversationId,
    organizationId: orgId,
    employeeId: null,
    projectId: null,
    title: "統括AIとの相談",
    kind: "director",
    createdAt: now,
    updatedAt: now,
    createdBy: userId,
  });

  await store.insert("businesses", {
    id: newId(),
    organizationId: orgId,
    name: "テスト事業",
    summary: "個人経営の美容室向けに、予約と集客を支援するSaaSを作る",
    targetCustomer: "個人美容室",
    problem: "予約の取りこぼし",
    progress: "構想段階",
    budgetJpy: 300000,
    deadline: null,
    ownerCanDo: "接客",
    delegateToAi: "調査・実装",
    market: "domestic",
    regulatedNotes: "",
    hypotheses: [],
    createdAt: now,
    updatedAt: now,
    createdBy: userId,
  });

  await grantMonthly(store, orgId, planKey, `test-grant-${orgId}`);
  await hireEmployee(store, { organizationId: orgId, roleKey: "director", userId });

  return { store, orgId, userId, conversationId };
}

export async function hire(org: TestOrg, roleKey: RoleKey, specialty?: string) {
  return hireEmployee(org.store, {
    organizationId: org.orgId,
    roleKey,
    userId: org.userId,
    specialty,
  });
}

export async function makeTask(
  org: TestOrg,
  input: {
    title?: string;
    assigneeEmployeeId?: string | null;
    status?: TaskStatus;
    estimatedWorkTokens?: number;
  } = {},
): Promise<Task> {
  const now = nowIso();
  const task: Task = {
    id: newId(),
    organizationId: org.orgId,
    projectId: null,
    title: input.title ?? "テストタスク",
    description: "テスト用",
    status: input.status ?? "todo",
    priority: "normal",
    assigneeEmployeeId: input.assigneeEmployeeId ?? null,
    requiredCapabilities: [],
    dueDate: null,
    tools: [],
    estimatedWorkTokens: input.estimatedWorkTokens ?? 1000,
    usedWorkTokens: 0,
    safetyLevel: "GREEN",
    parentTaskId: null,
    createdAt: now,
    updatedAt: now,
    createdBy: org.userId,
  };
  return org.store.insert("tasks", task);
}
