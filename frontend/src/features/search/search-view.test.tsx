import { screen, waitFor, within } from "@testing-library/react";

import { GARDEN, INBOX, json, renderListRoute, WORK } from "@/test/drawer";
import { makeTask } from "@/test/tasks";

import type { SearchResult } from "./search";
import { SearchView } from "./search-view";

/** A Task that matched on its title, as the search endpoint returns it. */
function result(overrides: Partial<SearchResult> = {}): SearchResult {
  const task = makeTask(overrides);
  return { ...task, match_in: "title", snippet: task.title, ...overrides };
}

/** A stand-in server answering searches with the given results, whatever the words. */
function mockApi(results: SearchResult[]) {
  return vi.spyOn(globalThis, "fetch").mockImplementation((input) => {
    const url = new URL((input as Request).url);
    if (url.pathname.endsWith("/sidebar")) {
      return json({ inbox: INBOX, items: [WORK], archived: [GARDEN] });
    }
    if (url.pathname.endsWith("/people")) return json([]);
    if (url.pathname.endsWith("/comments")) return json([]);
    if (url.pathname.endsWith("/attachments")) return json([]);
    if (url.pathname.endsWith("/activity")) return json({ items: [], next_cursor: null, count: 0 });
    if (url.pathname.endsWith("/tasks/search")) return json(results);
    return json(makeTask({ id: Number(url.pathname.split("/").at(-1)) }));
  });
}

function searches(fetchSpy: ReturnType<typeof mockApi>) {
  return fetchSpy.mock.calls
    .map(([input]) => new URL((input as Request).url))
    .filter((url) => url.pathname.endsWith("/tasks/search"))
    .map((url) => url.searchParams.get("q"));
}

function renderView(initialQuery = "") {
  vi.stubGlobal("matchMedia", (query: string) => ({
    media: query,
    matches: true,
    addEventListener: () => undefined,
    removeEventListener: () => undefined,
  }));
  return renderListRoute(<SearchView initialQuery={initialQuery} inbox={INBOX} />);
}

afterEach(() => {
  vi.unstubAllGlobals();
});

describe("SearchView", () => {
  it("searches once typing pauses, from two characters", async () => {
    const fetchSpy = mockApi([result({ title: "Book flights to Lisbon" })]);
    const { user } = renderView();

    const box = await screen.findByRole("searchbox", { name: "Search tasks" });
    expect(box).toHaveFocus();
    await user.type(box, "l");
    await new Promise((resolve) => setTimeout(resolve, 300));
    expect(searches(fetchSpy)).toEqual([]);

    await user.type(box, "isbon");

    expect(await screen.findByText("Lisbon", { selector: "mark" })).toBeInTheDocument();
    expect(searches(fetchSpy)).toEqual(["lisbon"]);
  });

  it("starts from the query in the address", async () => {
    const fetchSpy = mockApi([result({ title: "Book flights" })]);
    renderView("flights");

    expect(await screen.findByRole("searchbox", { name: "Search tasks" })).toHaveValue("flights");
    expect(await screen.findByText("flights", { selector: "mark" })).toBeInTheDocument();
    expect(searches(fetchSpy)).toEqual(["flights"]);
  });

  it("shows where a result matched, with the words highlighted in the snippet", async () => {
    mockApi([
      result({ id: 2, title: "Trip", match_in: "comment", snippet: "The visa takes two weeks" }),
    ]);
    renderView("visa");

    const row = await screen.findByRole("button", { name: /Trip/ });
    expect(within(row).getByText("In a comment")).toBeInTheDocument();
    expect(within(row).getByText("visa", { selector: "mark" })).toBeInTheDocument();
  });

  it("names the Project, and marks an archived one", async () => {
    mockApi([result({ id: 3, project_id: GARDEN.id, title: "Prune roses" })]);
    renderView("roses");

    const row = await screen.findByRole("button", { name: /Prune roses/ });
    expect(await within(row).findByText("Garden")).toBeInTheDocument();
    expect(within(row).getByText("Archived")).toBeInTheDocument();
  });

  it("opens a result in the drawer", async () => {
    mockApi([result({ id: 4, title: "Book flights" })]);
    const { user, router } = renderView("flights");

    await user.click(await screen.findByRole("button", { name: /Book flights/ }));

    await waitFor(() => {
      expect(router.state.location.search).toEqual({ q: "flights", task: 4 });
    });
    expect(await screen.findByRole("dialog", { name: "Task details" })).toBeInTheDocument();
  });

  it("says so when nothing matches", async () => {
    mockApi([]);
    renderView("zebra");

    expect(await screen.findByText("No tasks match “zebra”")).toBeInTheDocument();
  });
});
