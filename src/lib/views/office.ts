import "server-only";
import type {
  Approval,
  Artifact,
  Business,
  Decision,
  DecisionOption,
  EmployeeInstance,
  Message,
  Notification,
  Task,
  TaskEvent,
} from "@/lib/core/types";
import { getStore } from "@/lib/db";
import { requireSession, type AuthContext } from "@/lib/auth/session";
import { availableBalance, getWallet } from "@/lib/credits/ledger";
import { suggestNextWork } from "@/lib/orchestrator/workflow";

export interface OfficeView {
  auth: AuthContext;
  business: Business | null;
  employees: EmployeeInstance[];
  conversationId: string;
  messages: Message[];
  pendingDecision: (Decision & { options: DecisionOption[] }) | null;
  tasks: Task[];
  runningTasks: Task[];
  approvals: Approval[];
  artifacts: Artifact[];
  notifications: Notification[];
  recentEvents: TaskEvent[];
  credits: { balance: number; reserved: number; available: number };
  suggestions: { title: string; reason: string }[];
}

export async function loadOffice(): Promise<OfficeView> {
  const auth = await requireSession();
  const store = await getStore();
  const orgId = auth.organization.id;

  const [businesses, employees, conversations, tasks, approvals, artifacts, notifications] =
    await Promise.all([
      store.list("businesses", orgId),
      store.list("employee_instances", orgId, { orderBy: "createdAt", direction: "asc" }),
      store.list("conversations", orgId, { filter: { kind: "director" } }),
      store.list("tasks", orgId, { orderBy: "createdAt", direction: "asc" }),
      store.list("approvals", orgId, { filter: { status: "pending" }, orderBy: "createdAt", direction: "desc" }),
      store.list("artifacts", orgId, { orderBy: "createdAt", direction: "desc", limit: 20 }),
      store.list("notifications", orgId, { orderBy: "createdAt", direction: "desc", limit: 20 }),
    ]);

  const conversationId = conversations[0]?.id ?? "";
  const messages = conversationId
    ? await store.list("messages", orgId, {
        filter: { conversationId },
        orderBy: "createdAt",
        direction: "asc",
      })
    : [];

  const decisions = await store.list("decisions", orgId, {
    filter: { status: "pending" },
    orderBy: "createdAt",
    direction: "desc",
    limit: 1,
  });
  const decision = decisions[0] ?? null;
  const options = decision
    ? await store.list("decision_options", orgId, { filter: { decisionId: decision.id } })
    : [];

  const recentEvents = await store.list("task_events", orgId, {
    orderBy: "createdAt",
    direction: "desc",
    limit: 40,
  });

  const wallet = await getWallet(store, orgId);
  const suggestions = await suggestNextWork(store, orgId);

  return {
    auth,
    business: businesses[0] ?? null,
    employees,
    conversationId,
    messages,
    pendingDecision: decision ? { ...decision, options } : null,
    tasks,
    runningTasks: tasks.filter((t) => t.status === "running"),
    approvals,
    artifacts,
    notifications,
    recentEvents: recentEvents.reverse(),
    credits: {
      balance: wallet.balance,
      reserved: wallet.reserved,
      available: availableBalance(wallet),
    },
    suggestions,
  };
}
