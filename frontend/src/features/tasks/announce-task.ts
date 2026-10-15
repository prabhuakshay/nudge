/* The toast that points to a Task Quick add just added, wherever it landed. */

import { useQuery } from "@tanstack/react-query";
import { useNavigate } from "@tanstack/react-router";
import { toast } from "sonner";

import { findProject } from "@/features/projects/projects";

import { sidebarQuery, type Task } from "./tasks";

/** Point to a new Task with a toast whose "Open" shows it in its Project. */
export function useAnnounceTask() {
  const { data: sidebar } = useQuery(sidebarQuery);
  const navigate = useNavigate();
  return (task: Task) => {
    const project = sidebar && findProject(sidebar, task.project_id);
    toast(`Added to ${project?.name ?? "a project"}`, {
      action: {
        label: "Open",
        onClick: () => {
          void navigate(
            project?.is_inbox
              ? { to: "/inbox", search: { task: task.id } }
              : {
                  to: "/projects/$projectId",
                  params: { projectId: String(task.project_id) },
                  search: { task: task.id },
                },
          );
        },
      },
    });
  };
}
