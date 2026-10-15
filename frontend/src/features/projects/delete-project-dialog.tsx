import type { SubmitEvent } from "react";

import { DialogFooter, SidebarDialog } from "./project-dialog";
import { useDeleteProject, type SidebarProject } from "./projects";

/** Asks before a Project and its Tasks go to Trash, saying they can come back from there. */
export function DeleteProjectDialog({
  project,
  open,
  onOpenChange,
}: {
  project: SidebarProject;
  open: boolean;
  onOpenChange: (open: boolean) => void;
}) {
  const deleteProject = useDeleteProject();

  function handleSubmit(event: SubmitEvent<HTMLFormElement>) {
    event.preventDefault();
    deleteProject.mutate(project);
    onOpenChange(false);
  }

  return (
    <SidebarDialog open={open} onOpenChange={onOpenChange} title={`Delete “${project.name}”?`}>
      <form onSubmit={handleSubmit} className="flex flex-col">
        <p className="px-5 pb-5 text-sm text-muted-foreground">
          It moves to Trash with all its tasks. You can restore it from Trash.
        </p>
        <DialogFooter pending={false} label="Delete" />
      </form>
    </SidebarDialog>
  );
}
