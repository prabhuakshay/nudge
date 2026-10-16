import { screen, waitFor } from "@testing-library/react";

import { WORK, renderTaskList } from "@/test/drawer";
import { DOING, TO_DO, mockApi, titlesIn, writes } from "@/test/sections";
import { makeTask } from "@/test/tasks";

/** The bodies of the Task moves sent. */
async function moves(fetchSpy: ReturnType<typeof mockApi>) {
  return (await writes(fetchSpy))
    .filter(([request]) => String(request).endsWith("/move"))
    .map(([, body]) => body);
}

/**
 * jsdom lays nothing out, so stack the list's elements in document order for dnd-kit to measure.
 * The drag preview floats outside the list, so it sits where the focused grip is.
 */
function layOutInDocumentOrder() {
  vi.spyOn(Element.prototype, "getBoundingClientRect").mockImplementation(function (this: Element) {
    const elements = [...document.querySelectorAll("[role=treegrid] *")];
    const at = this.closest("[role=treegrid]") ? this : document.activeElement;
    return new DOMRect(0, at ? elements.indexOf(at) * 10 : 0, 400, 10);
  });
}

function rowOf(title: string) {
  return screen.getByText(title).closest("[role=row]");
}

type User = ReturnType<typeof renderTaskList>["user"];

/** Lift a row by its grip, step it `steps` places (down when positive) and drop it. */
async function dragByKeyboard(user: User, title: string, steps: number) {
  (await screen.findByRole("button", { name: `Drag “${title}”` })).focus();
  const arrow = steps > 0 ? "{ArrowDown}" : "{ArrowUp}";
  await user.keyboard(` ${arrow.repeat(Math.abs(steps))} `);
}

const PAINT = { id: 1, project_id: WORK.id, title: "Paint" };
const TILE = { id: 2, project_id: WORK.id, title: "Tile", section_id: TO_DO.id };
const GROUT = { id: 3, project_id: WORK.id, title: "Grout", section_id: TO_DO.id };
const SHIP = { id: 4, project_id: WORK.id, title: "Ship", section_id: DOING.id };

/** Paint in No section, Tile and Grout in To do, Ship in Doing. */
function seed() {
  return [makeTask(PAINT), makeTask(TILE), makeTask(GROUT), makeTask(SHIP)];
}

function render(open = seed()) {
  const fetchSpy = mockApi({ open });
  const { user } = renderTaskList({ project: WORK });
  return { fetchSpy, user };
}

describe("dragging Tasks between Sections", () => {
  beforeEach(() => {
    layOutInDocumentOrder();
  });

  it("moves a Task into the next Section, after the Task it is dropped below", async () => {
    const { fetchSpy, user } = render();

    // Past the Doing header, then past Ship.
    await dragByKeyboard(user, "Grout", 2);

    await waitFor(() => {
      expect(titlesIn("Doing")).toEqual(["Ship", "Grout"]);
    });
    expect(await moves(fetchSpy)).toEqual([{ parent_id: null, after_id: 4, section_id: 32 }]);
  });

  it("moves a Task to the top of the next Section when dropped just past its header", async () => {
    const { fetchSpy, user } = render();

    await dragByKeyboard(user, "Grout", 1);

    await waitFor(() => {
      expect(titlesIn("Doing")).toEqual(["Grout", "Ship"]);
    });
    expect(await moves(fetchSpy)).toEqual([{ parent_id: null, after_id: null, section_id: 32 }]);
  });

  it("moves a Task back to the end of the Section above", async () => {
    const { fetchSpy, user } = render();

    await dragByKeyboard(user, "Ship", -1);

    await waitFor(() => {
      expect(titlesIn("To do")).toEqual(["Tile", "Grout", "Ship"]);
    });
    expect(await moves(fetchSpy)).toEqual([{ parent_id: null, after_id: 3, section_id: 31 }]);
  });

  it("reorders a Task within its Section", async () => {
    const { fetchSpy, user } = render();

    await dragByKeyboard(user, "Tile", 1);

    await waitFor(() => {
      expect(titlesIn("To do")).toEqual(["Grout", "Tile"]);
    });
    expect(await moves(fetchSpy)).toEqual([{ parent_id: null, after_id: 3, section_id: 31 }]);
  });

  it("moves a Task to No section by dropping it above the first Section", async () => {
    const { fetchSpy, user } = render(seed().filter((task) => task.id !== PAINT.id));

    await dragByKeyboard(user, "Tile", -1);

    await waitFor(() => {
      expect(titlesIn("No section")).toEqual(["Tile"]);
    });
    expect(await moves(fetchSpy)).toEqual([{ parent_id: null, after_id: null, section_id: null }]);
  });

  it("keeps a Task's Section when Alt+↓ swaps it with its sibling", async () => {
    const { fetchSpy, user } = render();
    (await screen.findByText("Tile")).closest<HTMLElement>("[role=row]")?.focus();

    await user.keyboard("{Alt>}{ArrowDown}{/Alt}");

    await waitFor(() => {
      expect(titlesIn("To do")).toEqual(["Grout", "Tile"]);
    });
    expect(await moves(fetchSpy)).toEqual([{ parent_id: null, after_id: 3, section_id: 31 }]);
  });

  it("nests a Task with Tab, after which it follows its root's Section", async () => {
    const { fetchSpy, user } = render();
    (await screen.findByText("Grout")).closest<HTMLElement>("[role=row]")?.focus();

    await user.keyboard("{Tab}");

    await waitFor(() => {
      expect(rowOf("Grout")).toHaveAttribute("aria-level", "2");
    });
    expect(await moves(fetchSpy)).toEqual([{ parent_id: 2, after_id: null }]);
  });

  it("keeps a Subtask in its root's Section when Shift+Tab makes it a root", async () => {
    const grout = { ...GROUT, section_id: null, parent_id: TILE.id, depth: 1 };
    const { fetchSpy, user } = render([makeTask(TILE), makeTask(grout), makeTask(SHIP)]);
    (await screen.findByText("Grout")).closest<HTMLElement>("[role=row]")?.focus();

    await user.keyboard("{Shift>}{Tab}{/Shift}");

    await waitFor(() => {
      expect(rowOf("Grout")).toHaveAttribute("aria-level", "1");
    });
    expect(await moves(fetchSpy)).toEqual([{ parent_id: null, after_id: 2, section_id: 31 }]);
  });
});
