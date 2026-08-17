import "server-only";
import type {
  Approval,
  Artifact,
  Business,
  Decision,
  DecisionOption,
  EmployeeInstance,
  Message,
  Project,
  Task,
  TaskEvent,
} from "@/lib/core/types";
import { getStore } from "@/lib/db";
import { requireSession, type AuthContext } from "@/lib/auth/session";
import { availableBalance, getWallet } from "@/lib/credits/ledger";
import { ensureDirectorConversation } from "@/lib/projects/service";
import { orchestratorPlacement } from "@/lib/projects/status";

export interface ProjectView {
  auth: AuthContext;
  project: Project;
  projects: Project[];
  business: Business | null;
  employees: EmployeeInstance[];
  tasks: Task[];
  events: TaskEvent[];
  artifacts: Artifact[];
  artifactContents: Record<string, string>;
  approvals: Approval[];
  conversationId: string;
  messages: Message[];
  pendingDecision: (Decision & { options: DecisionOption[] }) | null;
  credits: { balance: number; reserved: number; available: number };
  /** サーバー側で決めた統括AIの位置。リロードしても復元される。 */
  placement: "center" | "right" | "none";
}

export async function loadProject(projectId: string): Promise<ProjectView | null> {
  const auth = await requireSession();
  const store = await getStore();
  const orgId = auth.organization.id;

  const project = await store.get("projects", orgId, projectId);
  if (!project) return null;

  const [projects, businesses, employees, allTasks, allArtifacts, approvals] = await Promise.all([
    store.list("projects", orgId, { orderBy: "createdAt", direction: "asc" }),
    store.list("businesses", orgId),
    store.list("employee_instances", orgId, { orderBy: "createdAt", direction: "asc" }),
    store.list("tasks", orgId, { orderBy: "createdAt", direction: "asc" }),
    store.list("artifacts", orgId, { orderBy: "createdAt", direction: "desc" }),
    store.list("approvals", orgId, { filter: { status: "pending" } }),
  ]);

  const tasks = allTasks.filter((t) => t.projectId === project.id);
  const taskIds = new Set(tasks.map((t) => t.id));
  const artifacts = allArtifacts.filter(
    (a) => a.projectId === project.id || (a.taskId && taskIds.has(a.taskId)),
  );

  const allEvents = await store.list("task_events", orgId, {
    orderBy: "createdAt",
    direction: "asc",
  });
  const events = allEvents.filter((e) => taskIds.has(e.taskId)).slice(-200);

  const conversation = await ensureDirectorConversation(store, orgId, project.id, auth.user.id);
  const messages = await store.list("messages", orgId, {
    filter: { conversationId: conversation.id },
    orderBy: "createdAt",
    direction: "asc",
  });

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

  // 成果物は中央（モーダル）で開く。右パネルには置かない。
  const versions = await Promise.all(
    artifacts.slice(0, 12).map(async (artifact) => {
      const list = await store.list("artifact_versions", orgId, {
        filter: { artifactId: artifact.id },
        orderBy: "version",
        direction: "desc",
        limit: 1,
      });
      return [artifact.id, list[0]?.content ?? ""] as const;
    }),
  );

  const wallet = await getWallet(store, orgId);

  return {
    auth,
    project,
    projects,
    business: businesses[0] ?? null,
    employees,
    tasks,
    events,
    artifacts,
    artifactContents: Object.fromEntries(versions),
    approvals: approvals.filter(
      (a) => !a.taskId || taskIds.has(a.taskId),
    ),
    conversationId: conversation.id,
    messages,
    pendingDecision: decision ? { ...decision, options } : null,
    credits: {
      balance: wallet.balance,
      reserved: wallet.reserved,
      available: availableBalance(wallet),
    },
    placement: orchestratorPlacement(project.status),
  };
}

/** 一覧やリダイレクト用: いま作業対象にすべきプロジェクト */
export async function findCurrentProjectId(): Promise<string | null> {
  const auth = await requireSession();
  const store = await getStore();
  const projects = await store.list("projects", auth.organization.id, {
    orderBy: "createdAt",
    direction: "desc",
  });
  if (projects.length === 0) return null;
  const open = projects.find((p) => p.status !== "cancelled" && p.status !== "completed");
  return (open ?? projects[0])!.id;
}
