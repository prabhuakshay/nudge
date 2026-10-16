import { useQuery } from "@tanstack/react-query";

import { ProjectIcon } from "@/features/projects/project-icon";
import { findProject } from "@/features/projects/projects";

import { sidebarQuery } from "./tasks";

/**
 * The Project a row's Task is in, muted at the end of its title cell. It shrinks far faster than
 * the title, so a long name truncates before the title does.
 */
export function RowProject({ projectId }: { projectId: number }) {
  const { data: sidebar } = useQuery(sidebarQuery);
  const project = sidebar && findProject(sidebar, projectId);
  if (!project) return null;
  return (
    <span className="ml-auto flex min-w-8 shrink-[100] items-center gap-1 pl-2 text-xs text-muted-foreground">
      <ProjectIcon project={project} className="size-3" />
      <span className="sr-only">in</span>
      <span className="truncate">{project.name}</span>
    </span>
  );
}
