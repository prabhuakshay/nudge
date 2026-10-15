import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";

import { Toaster } from "@/components/ui/sonner";
import { TooltipProvider } from "@/components/ui/tooltip";
import { TaskList } from "@/features/tasks/task-list";
import type { SidebarProject, SidebarTag, TaskActivity, TaskDetail } from "@/features/tasks/tasks";
import { makeTask } from "@/test/tasks";

/* A stand-in server and a rendered list for the drawer's tests, shared by their test files. */

export const INBOX: SidebarProject = {
  kind: "project",
  id: 7,
  name: "Inbox",
  color: "blue",
  icon: "inbox",
  folder_id: null,
  is_inbox: true,
  open_count: 3,
};
export const WORK: SidebarProject = {
  ...INBOX,
  id: 8,
  name: "Work",
  color: "violet",
  icon: "briefcase",
  is_inbox: false,
};

export const TAGS: SidebarTag[] = [
  { id: 21, name: "work", color: "teal", open_count: 1, task_count: 1 },
  { id: 22, name: "home", color: null, open_count: 0, task_count: 0 },
];

export const task = makeTask;

function json(body: unknown, status = 200) {
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
 * with the given history, and a rename adds to it as the real server does.
 */
export function mockApi(tasks: TaskDetail[], history: TaskActivity[] = []) {
  const activity = [...history];
  const tags = [...TAGS];
  return vi.spyOn(globalThis, "fetch").mockImplementation(async (input) => {
    const request = input as Request;
    const url = new URL(request.url);
    if (url.pathname.endsWith("/sidebar")) {
      return json({ inbox: INBOX, items: [WORK], tags });
    }
    if (url.pathname.endsWith("/tags") && request.method === "POST") {
      const { name } = (await request.clone().json()) as { name: string };
      const created = { id: 100 + tags.length, name, color: null, open_count: 0, task_count: 0 };
      tags.push(created);
      return json(created, 201);
    }
    if (url.pathname.endsWith("/activity")) {
      return json({ items: activity, next_cursor: null, count: activity.length });
    }
    if (url.pathname.endsWith("/attachments")) return json([]);
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

export function renderList({ wide = true } = {}) {
  vi.stubGlobal("matchMedia", (query: string) => ({
    media: query,
    matches: wide,
    addEventListener: () => undefined,
    removeEventListener: () => undefined,
  }));
  render(
    <QueryClientProvider client={new QueryClient()}>
      <TooltipProvider>
        <TaskList project={INBOX} />
        <Toaster />
      </TooltipProvider>
    </QueryClientProvider>,
  );
  return userEvent.setup();
}

export async function openTask(user: ReturnType<typeof userEvent.setup>, title: string) {
  await user.click(await screen.findByText(title));
  return screen.findByRole("dialog", { name: "Task details" });
}
