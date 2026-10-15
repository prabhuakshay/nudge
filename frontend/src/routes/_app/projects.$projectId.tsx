import { useSuspenseQuery } from "@tanstack/react-query";
import { createFileRoute } from "@tanstack/react-router";
import { FolderX } from "lucide-react";

import { EmptyState } from "@/components/layout/empty-state";
import { findProject } from "@/features/projects/projects";
import { TaskList } from "@/features/tasks/task-list";
import { sidebarQuery } from "@/features/tasks/tasks";

export const Route = createFileRoute("/_app/projects/$projectId")({
  loader: ({ context }) => context.queryClient.query(sidebarQuery),
  component: ProjectPage,
});

function ProjectPage() {
  const { projectId } = Route.useParams();
  const { data } = useSuspenseQuery(sidebarQuery);
  const project = findProject(data, Number(projectId));
  if (!project) {
    return (
      <EmptyState
        icon={FolderX}
        title="Project not found"
        description="It may have been deleted, or the link is wrong."
      />
    );
  }
  // Keyed so switching Projects starts with a closed drawer and a collapsed Closed group.
  return <TaskList key={project.id} project={project} />;
}
