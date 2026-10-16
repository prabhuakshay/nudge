import { screen, waitFor } from "@testing-library/react";

import { ProjectPage } from "@/features/projects/project-page";
import { BOARD, layOutBoard } from "@/test/board";
import { WORK, json, renderListRoute } from "@/test/drawer";
import { requestOf } from "@/test/fetch";
import { DOING, DONE, TO_DO, columnNames, mockApi, writes } from "@/test/sections";
import { makeTask } from "@/test/tasks";

/** A Board with a card in No section, so its column shows, then To do, Doing and Done. */
function renderBoard() {
  const fetchSpy = mockApi({
    project: BOARD,
    sections: [TO_DO, DOING, DONE],
    open: [makeTask({ id: 1, project_id: WORK.id, title: "Loose end" })],
  });
  const { user } = renderListRoute(<ProjectPage projectId={BOARD.id} />);
  return { fetchSpy, user };
}

type User = ReturnType<typeof renderBoard>["user"];

/** Open a column's header menu from the keyboard and pick `item`. */
async function pickFromMenu(user: User, column: string, item: string) {
  (await screen.findByRole("button", { name: `${column} actions` })).focus();
  await user.keyboard("{Enter}");
  await user.click(await screen.findByRole("menuitem", { name: item }));
}

/** Lift a column by its header's grip, press the arrow `keys` and drop it. */
async function dragByKeyboard(user: User, column: string, keys: string) {
  (await screen.findByRole("button", { name: `Drag “${column}”` })).focus();
  await user.keyboard(` ${keys} `);
}

/** The column names in order, without their positions. */
function names() {
  return columnNames().map((label) => label?.replace(/, column .*/, ""));
}

describe("reordering Board columns from the header menu", () => {
  it("moves a column left or right", async () => {
    const { fetchSpy, user } = renderBoard();

    await pickFromMenu(user, "Done", "Move left");
    await waitFor(() => {
      expect(names()).toEqual(["No section", "To do", "Done", "Doing"]);
    });

    await pickFromMenu(user, "To do", "Move right");
    await waitFor(() => {
      expect(names()).toEqual(["No section", "Done", "To do", "Doing"]);
    });

    expect(await writes(fetchSpy)).toEqual([
      [`POST /api/v1/sections/${String(DONE.id)}/move`, { after_id: TO_DO.id }],
      [`POST /api/v1/sections/${String(TO_DO.id)}/move`, { after_id: DONE.id }],
    ]);
  });

  it("moves the second Section first, still after No section", async () => {
    const { fetchSpy, user } = renderBoard();

    await pickFromMenu(user, "Doing", "Move left");

    await waitFor(() => {
      expect(names()).toEqual(["No section", "Doing", "To do", "Done"]);
    });
    expect(await writes(fetchSpy)).toEqual([
      [`POST /api/v1/sections/${String(DOING.id)}/move`, { after_id: null }],
    ]);
  });

  it("disables Move left on the first Section and Move right on the last", async () => {
    const { user } = renderBoard();

    await user.click(await screen.findByRole("button", { name: "To do actions" }));
    expect(screen.getByRole("menuitem", { name: "Move left" })).toHaveAttribute(
      "aria-disabled",
      "true",
    );
    expect(screen.getByRole("menuitem", { name: "Move right" })).not.toHaveAttribute(
      "aria-disabled",
    );
    await user.keyboard("{Escape}");

    await user.click(screen.getByRole("button", { name: "Done actions" }));
    expect(screen.getByRole("menuitem", { name: "Move right" })).toHaveAttribute(
      "aria-disabled",
      "true",
    );
  });
});

describe("dragging Board columns", () => {
  beforeEach(() => {
    layOutBoard();
  });

  it("moves a column left, after the column it lands behind", async () => {
    const { fetchSpy, user } = renderBoard();

    await dragByKeyboard(user, "Done", "{ArrowLeft}");

    await waitFor(() => {
      expect(names()).toEqual(["No section", "To do", "Done", "Doing"]);
    });
    expect(await writes(fetchSpy)).toEqual([
      [`POST /api/v1/sections/${String(DONE.id)}/move`, { after_id: TO_DO.id }],
    ]);
  });

  it("moves a column right to the end", async () => {
    const { fetchSpy, user } = renderBoard();

    await dragByKeyboard(user, "To do", "{ArrowRight}{ArrowRight}");

    await waitFor(() => {
      expect(names()).toEqual(["No section", "Doing", "Done", "To do"]);
    });
    expect(await writes(fetchSpy)).toEqual([
      [`POST /api/v1/sections/${String(TO_DO.id)}/move`, { after_id: DONE.id }],
    ]);
  });

  it("drops nothing before No section", async () => {
    const { fetchSpy, user } = renderBoard();

    await dragByKeyboard(user, "Doing", "{ArrowLeft}{ArrowLeft}");

    await waitFor(() => {
      expect(names()).toEqual(["No section", "Doing", "To do", "Done"]);
    });
    expect(await writes(fetchSpy)).toEqual([
      [`POST /api/v1/sections/${String(DOING.id)}/move`, { after_id: null }],
    ]);
  });

  it("shows a dropped column in its new place before the server answers", async () => {
    const { fetchSpy, user } = renderBoard();
    const server = fetchSpy.getMockImplementation();
    fetchSpy.mockImplementation(async (input, init) =>
      requestOf(input).url.endsWith("/move")
        ? new Promise<Response>(() => undefined)
        : (server?.(input, init) ?? json({})),
    );

    await dragByKeyboard(user, "Done", "{ArrowLeft}");

    await waitFor(() => {
      expect(names()).toEqual(["No section", "To do", "Done", "Doing"]);
    });
  });

  it("puts a column back and says why when the move fails", async () => {
    const { fetchSpy, user } = renderBoard();
    const server = fetchSpy.getMockImplementation();
    fetchSpy.mockImplementation(async (input, init) =>
      requestOf(input).url.endsWith("/move")
        ? json({ detail: "That Section is gone." }, 422)
        : (server?.(input, init) ?? json({})),
    );

    await dragByKeyboard(user, "Done", "{ArrowLeft}");

    expect(await screen.findByText("That Section is gone.")).toBeInTheDocument();
    await waitFor(() => {
      expect(names()).toEqual(["No section", "To do", "Doing", "Done"]);
    });
  });

  it("sends nothing when a column is dropped where it was", async () => {
    const { fetchSpy, user } = renderBoard();

    await dragByKeyboard(user, "Doing", "");

    expect(names()).toEqual(["No section", "To do", "Doing", "Done"]);
    expect(await writes(fetchSpy)).toEqual([]);
  });

  it("offers no grip on No section", async () => {
    renderBoard();

    await screen.findByRole("button", { name: "Drag “To do”" });
    expect(screen.queryByRole("button", { name: "Drag “No section”" })).not.toBeInTheDocument();
  });
});
