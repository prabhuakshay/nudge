import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import {
  createMemoryHistory,
  createRootRoute,
  createRouter,
  RouterProvider,
} from "@tanstack/react-router";
import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import type { ReactNode } from "react";

import { Toaster } from "@/components/ui/sonner";
import { TooltipProvider } from "@/components/ui/tooltip";
import { validateTaskSearch } from "@/features/tasks/open-task";
import { TaskList } from "@/features/tasks/task-list";
import type { Person } from "@/features/people/people";
import type { SidebarTag } from "@/features/tags/tags";
import type { Comment } from "@/features/tasks/comments";
import type { SidebarProject, TaskActivity, TaskDetail } from "@/features/tasks/tasks";
import { makeTask } from "@/test/tasks";

/* A stand-in server and a rendered list for the tasks feature's tests, shared by their files. */

export const INBOX: SidebarProject = {
  kind: "project",
  id: 7,
  name: "Inbox",
  color: "blue",
  icon: "inbox",
  folder_id: null,
  is_inbox: true,
  is_archived: false,
  open_count: 3,
};
export const WORK: SidebarProject = {
  ...INBOX,
  id: 8,
  name: "Work",
  color: "violet",
  icon: "briefcase",
  is_inbox: false,
  is_archived: false,
};

export const GARDEN: SidebarProject = {
  ...WORK,
  id: 9,
  name: "Garden",
  color: "green",
  icon: "leaf",
  is_archived: true,
};

export const TAGS: SidebarTag[] = [
  { id: 21, name: "work", color: "teal", open_count: 1, task_count: 1 },
  { id: 22, name: "home", color: null, open_count: 0, task_count: 0 },
];

export const task = makeTask;

export const PRIYA: Person = { id: 1, name: "Priya", color: "violet" };

/** A JSON response, as the mocked `fetch` returns it. */
export function json(body: unknown, status = 200) {
  return Promise.resolve(
    new Response(JSON.stringify(body), {
      status,
      headers: { "Content-Type": "application/json" },
    }),
  );
}

export function minutesAgo(minutes: number) {
  return new Date(Date.now() - minutes * 60_000).toISOString();
}

/**
 * A stand-in for the server holding a few Tasks, which saves PATCHes to them. Each Task starts
 * with the given history and Comments, and a rename adds to the history as the real server does.
 */
export function mockApi(
  tasks: TaskDetail[],
  history: TaskActivity[] = [],
  comments: Comment[] = [],
) {
  const activity = [...history];
  const tags = [...TAGS];
  return vi.spyOn(globalThis, "fetch").mockImplementation(async (input) => {
    const request = input as Request;
    const url = new URL(request.url);
    const sidebarOrTag = await sidebarAndTags(request, tags);
    if (sidebarOrTag) return sidebarOrTag;
    if (url.pathname.endsWith("/activity")) {
      return json({ items: activity, next_cursor: null, count: activity.length });
    }
    if (url.pathname.endsWith("/attachments")) return json([]);
    if (url.pathname.endsWith("/comments")) return json(comments);
    if (url.pathname.endsWith("/people")) return json([PRIYA]);
    const id = Number(url.pathname.split("/").at(-1));
    const found = tasks.find((item) => item.id === id);
    if (request.method === "PATCH" && found) {
      const patch = (await request.clone().json()) as TaskPatch;
      return json(applyPatch(found, withTags(patch, tags), activity));
    }
    if (found) return json(found);
    if (url.searchParams.get("closed") === "true") {
      return json({ items: [], next_cursor: null });
    }
    return json({ items: tasks, next_cursor: null });
  });
}

/** The sidebar, with the Tags so far, and Tag creation, which adds to them. */
async function sidebarAndTags(request: Request, tags: SidebarTag[]) {
  const { pathname } = new URL(request.url);
  if (pathname.endsWith("/sidebar")) {
    return json({ inbox: INBOX, items: [WORK], archived: [GARDEN], tags });
  }
  if (!pathname.endsWith("/tags") || request.method !== "POST") return undefined;
  const { name } = (await request.clone().json()) as { name: string };
  const created = { id: 100 + tags.length, name, color: null, open_count: 0, task_count: 0 };
  tags.push(created);
  return json(created, 201);
}

type TaskPatch = Partial<TaskDetail> & { tag_ids?: number[] };

/** The patch with its Tag ids turned into the Tags the server would return. */
function withTags({ tag_ids: tagIds, ...change }: TaskPatch, tags: SidebarTag[]) {
  return tagIds ? { ...change, tags: tags.filter((tag) => tagIds.includes(tag.id)) } : change;
}

function applyPatch(found: TaskDetail, change: Partial<TaskDetail>, activity: TaskActivity[]) {
  if (change.title !== undefined) {
    const data = { old: found.title, new: change.title };
    activity.unshift({ id: activity.length + 1, kind: "title_changed", at: minutesAgo(0), data });
  }
  const statusChanged = change.status !== undefined && change.status !== found.status;
  const affected = statusChanged
    ? [{ id: found.id, prior_status: found.status, prior_blocked_reason: found.blocked_reason }]
    : [];
  Object.assign(found, statusChanged ? { blocked_reason: "" } : {}, change);
  return { task: found, affected };
}

export async function patches(fetchSpy: ReturnType<typeof mockApi>) {
  const requests = fetchSpy.mock.calls
    .map(([input]) => input as Request)
    .filter((request) => request.method === "PATCH");
  return Promise.all(
    requests.map(async (request) => [
      new URL(request.url).pathname,
      (await request.json()) as unknown,
    ]),
  );
}

/**
 * Render a Project's TaskList, the Inbox's by default, at `url` in a router of its own, as a
 * list route renders it.
 * Returns the router, to read the URL, and a user to drive the page.
 */
export function renderTaskList({ url = "/", project = INBOX } = {}) {
  return renderListRoute(<TaskList project={project} />, { url });
}

/** Render a list at a route that takes `?task=`, as every list route does, with a fresh cache. */
export function renderListRoute(list: ReactNode, { url = "/" } = {}) {
  const user = userEvent.setup();
  const rootRoute = createRootRoute({
    validateSearch: validateTaskSearch,
    component: () => (
      <TooltipProvider>
        {list}
        <Toaster />
      </TooltipProvider>
    ),
  });
  const router = createRouter({
    routeTree: rootRoute,
    history: createMemoryHistory({ initialEntries: [url] }),
  });
  render(
    <QueryClientProvider
      client={new QueryClient({ defaultOptions: { queries: { retry: false } } })}
    >
      <RouterProvider router={router} />
    </QueryClientProvider>,
  );
  return { user, router };
}

/** Render the list at the given width, as the drawer's tests need it. */
export function renderList({ wide = true, project = INBOX } = {}) {
  vi.stubGlobal("matchMedia", (query: string) => ({
    media: query,
    matches: wide,
    addEventListener: () => undefined,
    removeEventListener: () => undefined,
  }));
  return renderTaskList({ project }).user;
}

export async function openTask(user: ReturnType<typeof userEvent.setup>, title: string) {
  await user.click(await screen.findByText(title));
  return screen.findByRole("dialog", { name: "Task details" });
}
