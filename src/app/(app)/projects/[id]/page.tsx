import { notFound } from "next/navigation";
import { loadProject } from "@/lib/views/project";
import { OrchestratorProvider } from "@/components/orchestrator/OrchestratorContext";
import { ProjectWorkspace } from "@/components/projects/ProjectWorkspace";

export const dynamic = "force-dynamic";

export default async function ProjectPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const view = await loadProject(id);
  if (!view) notFound();

  return (
    <OrchestratorProvider
      projectId={view.project.id}
      projectName={view.project.name}
      projectStatus={view.project.status}
      conversationId={view.conversationId}
      initialMessages={view.messages}
      initialOptions={
        view.pendingDecision?.options.map((option) => ({
          id: option.id,
          kind: option.kind,
          title: option.title,
          description: option.description,
          roleKey: option.roleKey,
          reason: option.reason,
          estimatedDurationMinutes: option.estimatedDurationMinutes,
          estimatedWorkTokens: option.estimatedWorkTokens,
          riskLevel: option.riskLevel,
          recommended: option.recommended,
        })) ?? []
      }
      initialDecisionId={view.pendingDecision?.id ?? null}
    >
      <ProjectWorkspace
        project={view.project}
        employees={view.employees}
        tasks={view.tasks}
        events={view.events}
        artifacts={view.artifacts}
        artifactContents={view.artifactContents}
        approvals={view.approvals}
        credits={view.credits}
      />
    </OrchestratorProvider>
  );
}
