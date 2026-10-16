import { screen, waitFor, within } from "@testing-library/react";

import { ProjectPage } from "@/features/projects/project-page";
import type { SidebarProject } from "@/features/projects/projects";
import { WORK, json, renderListRoute } from "@/test/drawer";
import { requestOf } from "@/test/fetch";
import { DOING, TO_DO, mockApi, writes } from "@/test/sections";
import { makeTask } from "@/test/tasks";

const BOARD: SidebarProject = { ...WORK, layout: "board" };

const LOOSE = { id: 1, project_id: WORK.id, title: "Loose end" };
const BRIEF = { id: 2, project_id: WORK.id, title: "Write brief", section_id: TO_DO.id };
const OUTLINE = { id: 3, project_id: WORK.id, title: "Outline", section_id: TO_DO.id };
const REVIEW = { id: 4, project_id: WORK.id, title: "Review copy", section_id: DOING.id };

/** Loose end in No section, Write brief and Outline in To do, Review copy in Doing. */
function seed() {
  return [makeTask(LOOSE), makeTask(BRIEF), makeTask(OUTLINE), makeTask(REVIEW)];
}

/**
 * jsdom lays nothing out, so place each column side by side and stack its cards down it for
 * dnd-kit to measure. The drag preview floats outside the Board, so it sits where the focused
 * grip's card is.
 */
function layOutBoard() {
  vi.spyOn(Element.prototype, "getBoundingClientRect").mockImplementation(function (this: Element) {
    const target = this.closest("section[aria-label]") ? this : document.activeElement;
    const column = target?.closest("section[aria-label]");
    if (!target || !column) return new DOMRect(0, 0, 0, 0);
    const columns = [...document.querySelectorAll("section[aria-label]")];
    const left = columns.indexOf(column) * 300;
    const card = target.closest("li");
    if (!card) return new DOMRect(left, 0, 280, 600);
    const top = 40 + [...column.querySelectorAll("li")].indexOf(card) * 60;
    return new DOMRect(left, top, 280, 50);
  });
}

function renderBoard(open = seed()) {
  const fetchSpy = mockApi({ project: BOARD, open });
  const { user } = renderListRoute(<ProjectPage projectId={BOARD.id} />);
  return { fetchSpy, user };
}

type User = ReturnType<typeof renderBoard>["user"];

/** Lift a card by its grip, press the arrow `keys` and drop it. */
async function dragByKeyboard(user: User, title: string, keys: string) {
  (await screen.findByRole("button", { name: `Drag “${title}”` })).focus();
  await user.keyboard(` ${keys} `);
}

/** The card titles in one column, top to bottom. */
function cardsIn(column: string) {
  return within(screen.getByRole("list", { name: `${column} tasks` }))
    .getAllByRole("listitem")
    .map((card) => card.querySelector("[data-task-title]")?.textContent);
}

/** The bodies of the Task moves sent. */
async function moves(fetchSpy: ReturnType<typeof mockApi>) {
  return (await writes(fetchSpy))
    .filter(([request]) => String(request).endsWith("/move"))
    .map(([, body]) => body);
}

describe("dragging Board cards", () => {
  beforeEach(() => {
    layOutBoard();
  });

  it("moves a card to the next column, after the card it is dropped below", async () => {
    const { fetchSpy, user } = renderBoard();

    await dragByKeyboard(user, "Write brief", "{ArrowRight}{ArrowDown}");

    await waitFor(() => {
      expect(cardsIn("Doing")).toEqual(["Review copy", "Write brief"]);
    });
    expect(cardsIn("To do")).toEqual(["Outline"]);
    expect(await moves(fetchSpy)).toEqual([
      { parent_id: null, after_id: REVIEW.id, section_id: DOING.id },
    ]);
  });

  it("moves a card to the top of No section", async () => {
    const { fetchSpy, user } = renderBoard();

    await dragByKeyboard(user, "Outline", "{ArrowLeft}");

    await waitFor(() => {
      expect(cardsIn("No section")).toEqual(["Outline", "Loose end"]);
    });
    expect(await moves(fetchSpy)).toEqual([{ parent_id: null, after_id: null, section_id: null }]);
  });

  it("reorders a card within its column", async () => {
    const { fetchSpy, user } = renderBoard();

    await dragByKeyboard(user, "Write brief", "{ArrowDown}");

    await waitFor(() => {
      expect(cardsIn("To do")).toEqual(["Outline", "Write brief"]);
    });
    expect(await moves(fetchSpy)).toEqual([
      { parent_id: null, after_id: OUTLINE.id, section_id: TO_DO.id },
    ]);
  });

  it("sends nothing when a card is dropped where it was", async () => {
    const { fetchSpy, user } = renderBoard();

    await dragByKeyboard(user, "Write brief", "");

    expect(cardsIn("To do")).toEqual(["Write brief", "Outline"]);
    expect(await moves(fetchSpy)).toEqual([]);
  });

  it("puts a card back and says why when the move fails", async () => {
    const { fetchSpy, user } = renderBoard();
    const server = fetchSpy.getMockImplementation();
    let refused = false;
    fetchSpy.mockImplementation(async (input, init) => {
      if (requestOf(input).url.endsWith("/move")) {
        refused = true;
        return json({ detail: "That Section is gone." }, 422);
      }
      // The Board must not wait on a refetch to put the card back.
      if (refused) return new Promise<Response>(() => undefined);
      return server?.(input, init) ?? json({});
    });

    await dragByKeyboard(user, "Write brief", "{ArrowRight}");

    expect(await screen.findByText("That Section is gone.")).toBeInTheDocument();
    await waitFor(() => {
      expect(cardsIn("To do")).toEqual(["Write brief", "Outline"]);
    });
    expect(cardsIn("Doing")).toEqual(["Review copy"]);
  });
});
