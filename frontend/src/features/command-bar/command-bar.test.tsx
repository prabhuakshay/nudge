import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import {
  createMemoryHistory,
  createRootRoute,
  createRoute,
  createRouter,
  Outlet,
  RouterProvider,
} from "@tanstack/react-router";
import { render, screen, waitFor, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";

import { TooltipProvider } from "@/components/ui/tooltip";
import type { SearchResult } from "@/features/search/search";
import { validateTaskSearch } from "@/features/tasks/open-task";
import { rememberTask } from "@/features/tasks/recent-tasks";
import { GARDEN, INBOX, json, TAGS, WORK } from "@/test/drawer";
import { makeTask } from "@/test/tasks";
import { requestOf } from "@/test/fetch";

import { CommandBar, type CommandActions } from "./command-bar";

const TOOLS = { ...GARDEN, name: "Tools" };
const TODO_TAG = { ...TAGS[1], name: "todo" };
const TOM = { id: 3, name: "Tom", color: "teal" };

function result(id: number, title: string): SearchResult {
  return { ...makeTask({ id, title, project_id: WORK.id }), match_in: "title", snippet: title };
}

/**
 * A stand-in server: the sidebar, People, Task 5 in Work, search results for any words, and
 * PATCHes to Tasks, which it logs.
 */
function mockApi(results: SearchResult[] = []) {
  const patches: unknown[] = [];
  vi.spyOn(globalThis, "fetch").mockImplementation(async (input) => {
    const request = requestOf(input);
    const { pathname } = new URL(request.url);
    if (pathname.endsWith("/sidebar")) {
      return json({
        inbox: INBOX,
        items: [WORK],
        archived: [TOOLS],
        tags: [TODO_TAG],
        people: [TOM],
      });
    }
    if (pathname.endsWith("/tasks/search")) return json(results);
    const task = makeTask({ id: 5, title: "Water plants", project_id: WORK.id });
    if (request.method === "PATCH") {
      const change = (await request.json()) as object;
      patches.push(change);
      return json({ task: { ...task, ...change }, affected: [] });
    }
    return json(task);
  });
  return patches;
}

/**
 * The command bar on a page at `url`, among the routes it goes to. The home page has one Task
 * row, for Task 5.
 */
function renderBar({
  url = "/",
  actions = { goToInbox: vi.fn() },
  onCreateTask = vi.fn(),
}: {
  url?: string;
  actions?: CommandActions;
  onCreateTask?: (text: string) => void;
} = {}) {
  const rootRoute = createRootRoute({
    validateSearch: (search: Record<string, unknown>) => {
      const { q } = search;
      return { ...validateTaskSearch(search), ...(typeof q === "string" && { q }) };
    },
    component: () => (
      <TooltipProvider>
        <CommandBar actions={actions} onCreateTask={onCreateTask} />
        <Outlet />
      </TooltipProvider>
    ),
  });
  const page = (path: string) =>
    createRoute({ getParentRoute: () => rootRoute, path, component: () => null });
  const home = createRoute({
    getParentRoute: () => rootRoute,
    path: "/",
    component: () => (
      <div role="row" tabIndex={0} data-task-id={5}>
        Water plants
      </div>
    ),
  });
  const router = createRouter({
    routeTree: rootRoute.addChildren([
      home,
      ...["/inbox", "/search", "/projects/$projectId", "/tags/$tagId", "/people/$personId"].map(
        page,
      ),
    ]),
    history: createMemoryHistory({ initialEntries: [url] }),
  });
  render(
    <QueryClientProvider
      client={new QueryClient({ defaultOptions: { queries: { retry: false } } })}
    >
      <RouterProvider router={router} />
    </QueryClientProvider>,
  );
  return { user: userEvent.setup(), router };
}

/** The headings of the groups the command bar shows, in order. */
function groups() {
  const bar = screen.getByRole("dialog", { name: "Command bar" });
  return within(bar)
    .getAllByRole("group")
    .map((group) => {
      const heading = group.getAttribute("aria-labelledby");
      return (heading && document.getElementById(heading)?.textContent) ?? "";
    });
}

async function openBar(user: ReturnType<typeof userEvent.setup>) {
  await screen.findByText("Water plants");
  await user.keyboard("{Control>}k{/Control}");
  return screen.findByRole("combobox", { name: "Command bar" });
}

afterEach(() => {
  localStorage.clear();
});

describe("CommandBar", () => {
  it("offers Go to and the Tasks opened last when empty, with keys from the registry", async () => {
    mockApi();
    rememberTask({ id: 9, title: "Pay rent", project_id: WORK.id });
    const { user, router } = renderBar();

    await openBar(user);

    expect(groups()).toEqual(["Go to", "Recent"]);
    const inbox = screen.getByRole("option", { name: /Go to Inbox/ });
    expect(
      within(inbox)
        .getAllByText(/^[GI]$/)
        .map((cap) => cap.textContent),
    ).toEqual(["G", "I"]);
    await user.click(screen.getByRole("option", { name: "Pay rent" }));

    await waitFor(() => {
      expect(router.state.location.pathname).toBe("/projects/8");
    });
    expect(router.state.location.search).toEqual({ task: 9 });
    expect(screen.queryByRole("dialog", { name: "Command bar" })).not.toBeInTheDocument();
  });

  it("opens on / and runs what Enter picks", async () => {
    mockApi();
    const goToInbox = vi.fn();
    const { user } = renderBar({ actions: { goToInbox } });
    await screen.findByText("Water plants");

    await user.keyboard("/");
    await user.keyboard("{Enter}");

    await waitFor(() => {
      expect(goToInbox).toHaveBeenCalledOnce();
    });
  });

  it("finds Tasks, Projects, Tags, People and Actions, then offers to create a Task", async () => {
    mockApi([result(1, "Book tickets to Rome")]);
    const { user } = renderBar({ url: "/inbox" });
    await user.keyboard("{Control>}k{/Control}");
    const input = await screen.findByRole("combobox", { name: "Command bar" });

    await user.type(input, "to");

    expect(await screen.findByRole("option", { name: /Book tickets to Rome/ })).toBeVisible();
    expect(groups()).toEqual(["Tasks", "Projects", "Tags", "People", "Actions", ""]);
    expect(screen.getByRole("option", { name: /Tools/ })).toHaveTextContent("Archived");
    expect(screen.getAllByRole("option").at(-1)).toHaveTextContent("Create task: to");
  });

  it("shows the top five Tasks and a link to all of them in Search", async () => {
    mockApi([1, 2, 3, 4, 5, 6].map((id) => result(id, `Trip ${String(id)}`)));
    const { user, router } = renderBar();
    const input = await openBar(user);

    await user.type(input, "trip");
    await screen.findByRole("option", { name: /Trip 1/ });

    expect(screen.queryByRole("option", { name: /Trip 6/ })).not.toBeInTheDocument();
    await user.click(screen.getByRole("option", { name: /See all results/ }));
    await waitFor(() => {
      expect(router.state.location.pathname).toBe("/search");
    });
    expect(router.state.location.search).toEqual({ q: "trip" });
  });

  it("opens the global Quick add with what was typed", async () => {
    mockApi();
    const onCreateTask = vi.fn();
    const { user } = renderBar({ onCreateTask });
    const input = await openBar(user);

    await user.type(input, "Call the bank !1{Enter}");

    await waitFor(() => {
      expect(onCreateTask).toHaveBeenCalledWith("Call the bank !1");
    });
  });

  it("runs an Action", async () => {
    mockApi();
    const showShortcuts = vi.fn();
    const { user } = renderBar({ actions: { showShortcuts } });
    const input = await openBar(user);

    await user.type(input, "keyboard");
    await user.click(screen.getByRole("option", { name: /Show keyboard shortcuts/ }));

    await waitFor(() => {
      expect(showShortcuts).toHaveBeenCalledOnce();
    });
  });

  it("puts the focused Task's actions first, each with its key", async () => {
    const patches = mockApi();
    const { user } = renderBar();
    (await screen.findByRole("row")).focus();

    await user.keyboard("/");
    await user.type(screen.getByRole("combobox", { name: "Command bar" }), "to");
    expect(await screen.findByRole("option", { name: /Move to project/ })).toBeVisible();
    expect(groups()[0]).toBe("This task");

    await user.clear(screen.getByRole("combobox", { name: "Command bar" }));
    await user.type(screen.getByRole("combobox", { name: "Command bar" }), "priority");
    const p1 = screen.getByRole("option", { name: /Set priority: P1/ });
    expect(within(p1).getByText("1")).toBeInTheDocument();
    await user.click(p1);

    await waitFor(() => {
      expect(patches).toEqual([{ priority: 1 }]);
    });
  });

  it("acts on the Task open in the drawer, opening a picker there", async () => {
    mockApi();
    const { user, router } = renderBar({ url: "/inbox?task=5" });
    await user.keyboard("{Control>}k{/Control}");
    const input = await screen.findByRole("combobox", { name: "Command bar" });

    await user.type(input, "date");
    await user.click(await screen.findByRole("option", { name: /Set date/ }));

    await waitFor(() => {
      expect(screen.queryByRole("dialog", { name: "Command bar" })).not.toBeInTheDocument();
    });
    expect(router.state.location.search).toEqual({ task: 5 });
  });

  it("leaves This task out when no Task is focused or open", async () => {
    mockApi();
    const { user } = renderBar({ url: "/inbox" });
    await user.keyboard("{Control>}k{/Control}");
    const input = await screen.findByRole("combobox", { name: "Command bar" });

    await user.type(input, "to");

    await screen.findByRole("option", { name: /Tools/ });
    expect(groups()).not.toContain("This task");
  });
});
