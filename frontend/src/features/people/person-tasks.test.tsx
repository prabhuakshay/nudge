import { screen, within } from "@testing-library/react";

import type { Task } from "@/features/tasks/tasks";
import { INBOX, renderListRoute, WORK } from "@/test/drawer";
import { makeTask } from "@/test/tasks";

import type { Person } from "./people";
import { PersonTasks } from "./person-tasks";

const PRIYA: Person = { id: 1, name: "Priya", color: "violet" };
const MENTION = "[@Priya](person:1)";

function json(body: unknown) {
  return Promise.resolve(
    new Response(JSON.stringify(body), { headers: { "Content-Type": "application/json" } }),
  );
}

/** A stand-in server: the sidebar with the address book, and the Tasks that mention Priya. */
function mockApi(open: Task[], closed: Task[] = []) {
  return vi.spyOn(globalThis, "fetch").mockImplementation((input) => {
    const url = new URL((input as Request).url);
    if (url.pathname.endsWith("/sidebar")) {
      return json({ inbox: INBOX, items: [WORK], people: [PRIYA] });
    }
    if (url.searchParams.get("person") !== "1") throw new Error(`Unexpected ${url.href}`);
    const items = url.searchParams.get("closed") === "true" ? closed : open;
    return json({ items, next_cursor: null });
  });
}

function renderView() {
  vi.stubGlobal("matchMedia", (query: string) => ({
    media: query,
    matches: true,
    addEventListener: () => undefined,
    removeEventListener: () => undefined,
  }));
  return renderListRoute(<PersonTasks person={PRIYA} />).user;
}

/** The row titles in a group as read aloud: a Mention chip's avatar initials are decorative. */
function titlesIn(group: string) {
  return within(screen.getByRole("region", { name: group }))
    .queryAllByRole("row")
    .map((row) => {
      const title = row.querySelector("[data-task-title]")?.cloneNode(true);
      if (!(title instanceof Element)) return undefined;
      for (const hidden of title.querySelectorAll("[aria-hidden]")) hidden.remove();
      return title.textContent;
    });
}

afterEach(() => {
  vi.unstubAllGlobals();
});

describe("PersonTasks", () => {
  it("groups the Tasks that mention the Person by Project, in sidebar order", async () => {
    mockApi([
      makeTask({ id: 1, project_id: WORK.id, title: `Review with ${MENTION}` }),
      makeTask({ id: 2, project_id: INBOX.id, title: `Call ${MENTION}` }),
      makeTask({ id: 3, project_id: WORK.id, title: `Send ${MENTION} the deck` }),
    ]);
    renderView();

    expect(await screen.findByRole("heading", { level: 1, name: "Priya" })).toBeInTheDocument();
    expect(await screen.findByText("3 open")).toBeInTheDocument();
    const table = screen.getByRole("treegrid", { name: "Tasks mentioning Priya" });
    const groups = within(table)
      .getAllByRole("region")
      .map((region) => region.getAttribute("aria-label"));
    expect(groups).toEqual(["Inbox", "Work", "Closed"]);
    expect(titlesIn("Work")).toEqual(["Review with Priya", "Send Priya the deck"]);
    expect(titlesIn("Inbox")).toEqual(["Call Priya"]);
  });

  it("lists a mentioning Subtask on its own, under its parent's title", async () => {
    mockApi([
      makeTask({
        id: 5,
        title: `Ask ${MENTION}`,
        parent_id: 9,
        depth: 1,
        parent_title: "Plan the trip",
      }),
    ]);
    renderView();

    expect(await screen.findByText("Plan the trip")).toBeInTheDocument();
    expect(titlesIn("Inbox")).toEqual(["Ask Priya"]);
  });

  it("says so when no open Task mentions the Person", async () => {
    mockApi([]);
    renderView();

    expect(await screen.findByText("No open tasks mention Priya.")).toBeInTheDocument();
  });

  it("shows the Closed Tasks that mention the Person when asked", async () => {
    mockApi([], [makeTask({ id: 4, title: `Thank ${MENTION}`, status: "completed" })]);
    const user = renderView();

    await user.click(await screen.findByRole("button", { name: "Closed" }));

    expect(await screen.findByText("Thank", { exact: false })).toBeInTheDocument();
    expect(titlesIn("Closed")).toEqual(["Thank Priya"]);
  });
});
