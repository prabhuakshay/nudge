import { useQuery } from "@tanstack/react-query";
import { useNavigate, useRouter, useSearch } from "@tanstack/react-router";
import { useCallback } from "react";

import { sidebarQuery } from "./tasks";

/** A list route's search parameters: the Task open in the drawer, if any. */
export type TaskSearch = { task?: number };

/** Keep `?task=` only when it is a Task id, so a mistyped link just shows the list. */
export function validateTaskSearch(search: Record<string, unknown>): TaskSearch {
  const { task } = search;
  return typeof task === "number" && Number.isSafeInteger(task) && task > 0 ? { task } : {};
}

/**
 * The Task open in the drawer, kept in the URL's `?task=` so a link can open it. Returns the open
 * Task's id and a function to open another, or to close it with null.
 */
export function useOpenTask() {
  // Without a route to tie it to, the search comes unvalidated, so validate it here too.
  const { task } = validateTaskSearch(useSearch({ strict: false }));
  const setOpenTask = useSetOpenTask();
  return { openTaskId: task ?? null, setOpenTask };
}

/**
 * Open a Task in the drawer, or close it with null. Unlike `useOpenTask` it doesn't follow the
 * URL, so the rows that use it don't re-render whenever another Task opens.
 */
export function useSetOpenTask() {
  const navigate = useNavigate();
  return useCallback(
    (taskId: number | null) => {
      // Stepping between Tasks shouldn't fill the browser history.
      void navigate({
        to: ".",
        search: (prev) => ({ ...prev, task: taskId ?? undefined }),
        replace: true,
      });
    },
    [navigate],
  );
}

/**
 * Show a Task in its own Project's list with the drawer open on it, wherever the user is. Inbox
 * Tasks show in the Inbox.
 */
export function useShowTask() {
  const { data: sidebar } = useQuery(sidebarQuery);
  const navigate = useNavigate();
  return useCallback(
    (task: { id: number; project_id: number }) => {
      void navigate(
        task.project_id === sidebar?.inbox.id
          ? { to: "/inbox", search: { task: task.id } }
          : {
              to: "/projects/$projectId",
              params: { projectId: String(task.project_id) },
              search: { task: task.id },
            },
      );
    },
    [navigate, sidebar],
  );
}

/**
 * Build the address that opens a Task in the current list. Unlike `useOpenTask` it doesn't follow
 * the URL, so the rows that use it don't re-render whenever another Task opens.
 */
export function useTaskLink() {
  const router = useRouter();
  return useCallback(
    (taskId: number) => {
      const { href } = router.buildLocation({
        to: ".",
        search: (prev) => ({ ...prev, task: taskId }),
      });
      return new URL(href, globalThis.location.origin).href;
    },
    [router],
  );
}
