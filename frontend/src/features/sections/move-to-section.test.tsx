import { screen, waitFor, within } from "@testing-library/react";

import type { TaskDetail } from "@/features/tasks/tasks";
import { INBOX, WORK, json, renderTaskList } from "@/test/drawer";
import { requestOf } from "@/test/fetch";
import { makeTask } from "@/test/tasks";

import type { Section } from "./sections";

const KITCHEN: Section = { id: 31, project_id: WORK.id, name: "Kitchen", collapsed: false };
const BATHROOM: Section = { id: 32, project_id: WORK.id, name: "Bathroom", collapsed: false };

/** A stand-in server for one Project with two Sections, which saves the Section a move names. */
function mockApi(tasks: TaskDetail[]) {
  return vi.spyOn(globalThis, "fetch").mockImplementation(async (input) => {
    const request = requestOf(input);
    const url = new URL(request.url);
    const [, id, action] = /\/tasks\/(\d+)(?:\/(\w+))?$/.exec(url.pathname) ?? [];
    const found = tasks.find((item) => item.id === Number(id));
    if (url.pathname === "/api/v1/sidebar") {
      return json({ inbox: INBOX, items: [WORK], archived: [] });
    }
    if (url.pathname.endsWith("/sections")) return json([KITCHEN, BATHROOM]);
    if (action === "move" && found) {
      const { section_id } = (await request.clone().json()) as { section_id: number | null };
      found.section_id = section_id;
      return json({ task: found, affected: [] });
    }
    if (action === "activity") return json({ items: [], next_cursor: null, count: 0 });
    if (action) return json([]);
    if (found) return json(found);
    if (url.searchParams.get("closed") === "true") return json({ items: [], next_cursor: null });
    return json({ items: tasks, next_cursor: null });
  });
}

async function moves(fetchSpy: ReturnType<typeof mockApi>) {
  const requests = fetchSpy.mock.calls
    .map(([input]) => requestOf(input))
    .filter((request) => request.url.endsWith("/move"));
  return Promise.all(requests.map(async (request) => (await request.json()) as unknown));
}

function row(title: string) {
  const found = screen
    .getAllByRole("row")
    .find((candidate) => candidate.querySelector("[data-task-title]")?.textContent === title);
  if (!found) throw new Error(`No row for “${title}”`);
  return found;
}

function titlesIn(group: string) {
  return within(screen.getByRole("region", { name: group }))
    .queryAllByRole("row")
    .map((candidate) => candidate.querySelector("[data-task-title]")?.textContent);
}

/** A root Task in Kitchen, fresh for each test because the stand-in server changes it. */
function tile() {
  return makeTask({ id: 1, project_id: WORK.id, title: "Tile the wall", section_id: 31 });
}

describe("Move to section", () => {
  it("moves a Task to another Section from its right-click menu", async () => {
    const fetchSpy = mockApi([tile()]);
    const { user } = renderTaskList({ project: WORK });
    await screen.findByText("Tile the wall");

    await user.pointer({ keys: "[MouseRight]", target: row("Tile the wall") });
    (await screen.findByRole("menuitem", { name: "Move to section" })).focus();
    // Kitchen, the Section it is in, isn't offered: No section, then Bathroom.
    await user.keyboard("{ArrowRight}{ArrowDown}{Enter}");

    await waitFor(() => {
      expect(titlesIn("Bathroom")).toEqual(["Tile the wall"]);
    });
    await waitFor(async () => {
      expect(await moves(fetchSpy)).toEqual([{ parent_id: null, after_id: null, section_id: 32 }]);
    });
  });

  it("moves a Task to No section from the detail panel with the keyboard", async () => {
    const fetchSpy = mockApi([tile()]);
    const { user } = renderTaskList({ project: WORK, url: "/?task=1" });
    const drawer = await screen.findByRole("dialog", { name: "Task details" });

    await user.click(await within(drawer).findByRole("button", { name: "More actions" }));
    (await screen.findByRole("menuitem", { name: "Move to section" })).focus();
    await user.keyboard("{ArrowRight}");
    expect(await screen.findByRole("menuitem", { name: "No section" })).toBeInTheDocument();
    expect(screen.queryByRole("menuitem", { name: "Kitchen" })).not.toBeInTheDocument();
    await user.keyboard("{Enter}");

    await waitFor(async () => {
      expect(await moves(fetchSpy)).toEqual([
        { parent_id: null, after_id: null, section_id: null },
      ]);
    });
  });

  it("offers no Section move for a Subtask", async () => {
    const step = makeTask({
      id: 2,
      project_id: WORK.id,
      title: "Buy tiles",
      parent_id: 1,
      depth: 1,
      parent_title: "Tile the wall",
    });
    mockApi([tile(), step]);
    const { user } = renderTaskList({ project: WORK });
    await screen.findByText("Buy tiles");

    await user.pointer({ keys: "[MouseRight]", target: row("Buy tiles") });

    expect(await screen.findByRole("menuitem", { name: "Duplicate" })).toBeInTheDocument();
    expect(screen.queryByRole("menuitem", { name: "Move to section" })).not.toBeInTheDocument();
  });
});
