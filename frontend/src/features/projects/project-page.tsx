import { useSuspenseQuery } from "@tanstack/react-query";
import { FolderX } from "lucide-react";

import { EmptyState } from "@/components/layout/empty-state";
import { TaskList } from "@/features/tasks/task-list";
import { sidebarQuery } from "@/features/tasks/tasks";

import { ProjectBoard } from "./board";
import { findProject } from "./projects";

/** A Project's page, drawn in its Layout: a Board, or else a list. The Inbox is always a list. */
export function ProjectPage({ projectId }: { projectId: number }) {
  const { data } = useSuspenseQuery(sidebarQuery);
  const project = findProject(data, projectId);
  if (!project) {
    return (
      <EmptyState
        icon={FolderX}
        title="Project not found"
        description="It may have been deleted, or the link is wrong."
      />
    );
  }
  if (project.layout === "board" && !project.is_inbox) {
    return <ProjectBoard key={project.id} project={project} />;
  }
  // Keyed so switching Projects starts with a collapsed Closed group.
  return <TaskList key={project.id} project={project} />;
}
