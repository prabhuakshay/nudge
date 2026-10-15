/* How Quick add fits the page: the `C` key that summons it, and a toast pointing to a new Task. */

import { useQuery } from "@tanstack/react-query";
import { useNavigate } from "@tanstack/react-router";
import { useEffect } from "react";
import { toast } from "sonner";

import { findProject } from "@/features/projects/projects";

import { sidebarQuery, type Task } from "./tasks";

/** Whether a key press happened where typing `c` means text, not a shortcut. */
function isTyping(target: EventTarget | null) {
  return (
    target instanceof Element &&
    target.closest("input, textarea, select, [contenteditable], [role=menu], [role=dialog]") !==
      null
  );
}

/** Whether a key press is `C` on its own, outside a text field. */
export function isAddKey(event: KeyboardEvent) {
  const plain = !event.metaKey && !event.ctrlKey && !event.altKey;
  return event.key === "c" && plain && !isTyping(event.target);
}

/** Focus the input when `C` is pressed anywhere on the page outside a text field. */
export function useFocusOnC(input: { current: HTMLInputElement | null }) {
  useEffect(() => {
    const onKeyDown = (event: KeyboardEvent) => {
      if (!isAddKey(event)) return;
      event.preventDefault();
      input.current?.focus();
    };
    window.addEventListener("keydown", onKeyDown);
    return () => {
      window.removeEventListener("keydown", onKeyDown);
    };
  }, [input]);
}

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
