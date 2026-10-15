/* The toast that points to a Task Quick add just added, wherever it landed. */

import { useQuery } from "@tanstack/react-query";
import { toast } from "sonner";

import { findProject } from "@/features/projects/projects";

import { useShowTask } from "./open-task";
import { sidebarQuery, type Task } from "./tasks";

/** Point to a new Task with a toast whose "Open" shows it in its Project. */
export function useAnnounceTask() {
  const { data: sidebar } = useQuery(sidebarQuery);
  const showTask = useShowTask();
  return (task: Task) => {
    const project = sidebar && findProject(sidebar, task.project_id);
    toast(`Added to ${project?.name ?? "a project"}`, {
      action: {
        label: "Open",
        onClick: () => {
          showTask(task);
        },
      },
    });
  };
}
