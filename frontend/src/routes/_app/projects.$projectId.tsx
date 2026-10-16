import { createFileRoute } from "@tanstack/react-router";

import { ProjectPage } from "@/features/projects/project-page";
import { validateTaskSearch } from "@/features/tasks/open-task";
import { sidebarQuery } from "@/features/tasks/tasks";

export const Route = createFileRoute("/_app/projects/$projectId")({
  validateSearch: validateTaskSearch,
  loader: ({ context }) => context.queryClient.query(sidebarQuery),
  component: ProjectRoute,
});

function ProjectRoute() {
  const { projectId } = Route.useParams();
  return <ProjectPage projectId={Number(projectId)} />;
}
