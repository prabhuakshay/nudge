import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import {
  createMemoryHistory,
  createRootRoute,
  createRouter,
  RouterProvider,
} from "@tanstack/react-router";
import { render, screen, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";

import { TooltipProvider } from "@/components/ui/tooltip";
import { validateTaskSearch } from "@/features/tasks/open-task";
import type { Task } from "@/features/tasks/tasks";
import { INBOX, json, TAGS, WORK } from "@/test/drawer";
import { makeTask } from "@/test/tasks";

import { TagTaskList } from "./tag-task-list";

const [WORK_TAG] = TAGS as [(typeof TAGS)[number]];

/** A stand-in server with the given open Tasks for the Tag, which records Task creation. */
function mockApi(open: Task[]) {
  return vi.spyOn(globalThis, "fetch").mockImplementation(async (input) => {
    const request = input as Request;
    const url = new URL(request.url);
    if (url.pathname === "/api/v1/sidebar") {
      return json({ inbox: INBOX, items: [WORK], archived: [], tags: TAGS });
    }
    if (request.method === "POST") {
      const body = (await request.clone().json()) as { title: string };
      return json(makeTask({ id: 99, title: body.title, project_id: INBOX.id }), 201);
    }
    return json({ items: open, next_cursor: null });
  });
}

function renderTagList() {
  const user = userEvent.setup();
  const rootRoute = createRootRoute({
    validateSearch: validateTaskSearch,
    component: () => (
      <TooltipProvider>
        <TagTaskList tag={WORK_TAG} />
      </TooltipProvider>
    ),
  });
  const router = createRouter({
    routeTree: rootRoute,
    history: createMemoryHistory({ initialEntries: ["/"] }),
  });
  render(
    <QueryClientProvider client={new QueryClient()}>
      <RouterProvider router={router} />
    </QueryClientProvider>,
  );
  return user;
}

function rowsIn(group: string) {
  return within(screen.getByRole("region", { name: group }))
    .queryAllByRole("row")
    .map((row) => row.querySelector("[data-task-title]")?.textContent);
}

describe("A Tag's list", () => {
  it("lists the Tag's open Tasks grouped by Project in sidebar order", async () => {
    const fetchSpy = mockApi([
      makeTask({ id: 1, title: "Report", project_id: WORK.id }),
      makeTask({ id: 2, title: "Email", project_id: INBOX.id }),
    ]);

    renderTagList();

    expect(await screen.findByRole("heading", { name: "work", level: 1 })).toBeInTheDocument();
    expect(await screen.findByText("Report")).toBeInTheDocument();
    expect(rowsIn("Inbox")).toEqual(["Email"]);
    expect(rowsIn("Work")).toEqual(["Report"]);
    const regions = screen
      .getAllByRole("region")
      .map((region) => region.getAttribute("aria-label"));
    expect(regions.slice(0, 2)).toEqual(["Inbox", "Work"]);
    const lists = fetchSpy.mock.calls.map(([request]) => new URL((request as Request).url).search);
    expect(lists).toContain(`?tag=${String(WORK_TAG.id)}`);
  });

  it("shows a Subtask flat, with its parent's title", async () => {
    mockApi([
      makeTask({ id: 3, title: "Write the post", parent_id: 1, parent_title: "Launch", depth: 1 }),
    ]);

    renderTagList();

    const row = await screen.findByRole("row", { name: /Write the post/ });
    expect(row).toHaveTextContent("Subtask ofLaunch");
    expect(row).toHaveAttribute("aria-level", "1");
  });

  it("adds a Task from Quick add to the Inbox with the Tag", async () => {
    const fetchSpy = mockApi([]);
    const user = renderTagList();

    await user.type(await screen.findByRole("textbox", { name: "New task" }), "Plan{Enter}");

    expect(await screen.findByText("Plan")).toBeInTheDocument();
    const created = fetchSpy.mock.calls
      .map(([input]) => input as Request)
      .find((request) => request.method === "POST");
    expect(created && (await created.json())).toEqual({
      title: "Plan",
      project_id: INBOX.id,
      tag_ids: [WORK_TAG.id],
    });
  });
});
