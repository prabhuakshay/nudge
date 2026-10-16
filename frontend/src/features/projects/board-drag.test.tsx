import { screen, waitFor, within } from "@testing-library/react";

import { ProjectPage } from "@/features/projects/project-page";
import { BOARD, layOutBoard } from "@/test/board";
import { WORK, json, renderListRoute } from "@/test/drawer";
import { requestOf } from "@/test/fetch";
import { DOING, TO_DO, cardsIn, mockApi, writes } from "@/test/sections";
import { makeTask } from "@/test/tasks";

const LOOSE = { id: 1, project_id: WORK.id, title: "Loose end" };
const BRIEF = { id: 2, project_id: WORK.id, title: "Write brief", section_id: TO_DO.id };
const OUTLINE = { id: 3, project_id: WORK.id, title: "Outline", section_id: TO_DO.id };
const REVIEW = { id: 4, project_id: WORK.id, title: "Review copy", section_id: DOING.id };

/** Loose end in No section, Write brief and Outline in To do, Review copy in Doing. */
function seed() {
  return [makeTask(LOOSE), makeTask(BRIEF), makeTask(OUTLINE), makeTask(REVIEW)];
}

function renderBoard(open = seed(), sections = [TO_DO, DOING]) {
  const fetchSpy = mockApi({ project: BOARD, open, sections });
  const { user } = renderListRoute(<ProjectPage projectId={BOARD.id} />);
  return { fetchSpy, user };
}

type User = ReturnType<typeof renderBoard>["user"];

/** Lift a card by its grip, press the arrow `keys` and drop it. */
async function dragByKeyboard(user: User, title: string, keys: string) {
  (await screen.findByRole("button", { name: `Drag “${title}”` })).focus();
  await user.keyboard(` ${keys} `);
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

  it("shows No section while a card is dragged, so it can be dropped there", async () => {
    const { fetchSpy, user } = renderBoard([makeTask(BRIEF), makeTask(OUTLINE)]);
    await screen.findByText("Write brief");
    expect(screen.queryByRole("region", { name: /^No section, column/ })).not.toBeInTheDocument();

    await dragByKeyboard(user, "Outline", "{ArrowLeft}");

    await waitFor(() => {
      expect(cardsIn("No section")).toEqual(["Outline"]);
    });
    expect(await moves(fetchSpy)).toEqual([{ parent_id: null, after_id: null, section_id: null }]);
  });

  it("moves a card to the end of a collapsed column", async () => {
    const { fetchSpy, user } = renderBoard(seed(), [TO_DO, { ...DOING, collapsed: true }]);

    await dragByKeyboard(user, "Write brief", "{ArrowRight}");

    await waitFor(() => {
      expect(cardsIn("To do")).toEqual(["Outline"]);
    });
    const doing = screen.getByRole("region", { name: /^Doing, column/ });
    expect(within(doing).getByText("2")).toBeVisible();
    expect(await moves(fetchSpy)).toEqual([
      { parent_id: null, after_id: REVIEW.id, section_id: DOING.id },
    ]);
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

  it("keeps a card dragged above a Pinned one below it, first of the rest", async () => {
    const pinned = makeTask({ ...BRIEF, pinned_at: "2026-10-01T09:00:00Z" });
    const draft = makeTask({ id: 5, project_id: WORK.id, title: "Draft", section_id: TO_DO.id });
    const { fetchSpy, user } = renderBoard([pinned, makeTask(OUTLINE), draft]);

    await dragByKeyboard(user, "Draft", "{ArrowUp}{ArrowUp}");

    await waitFor(() => {
      expect(cardsIn("To do")).toEqual(["Write brief", "Draft", "Outline"]);
    });
    expect(await moves(fetchSpy)).toEqual([
      { parent_id: null, after_id: null, section_id: TO_DO.id },
    ]);
  });

  it("keeps a Pinned card among the Pinned ones, where it was", async () => {
    const pinned = makeTask({ ...BRIEF, pinned_at: "2026-10-01T09:00:00Z" });
    const { fetchSpy, user } = renderBoard([pinned, makeTask(OUTLINE)]);

    await dragByKeyboard(user, "Write brief", "{ArrowDown}");

    expect(cardsIn("To do")).toEqual(["Write brief", "Outline"]);
    expect(await moves(fetchSpy)).toEqual([]);
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
