import { screen, waitFor } from "@testing-library/react";

import { json, patches } from "@/test/drawer";
import { requestOf } from "@/test/fetch";
import { layOutMatrix, mockApi, renderMatrix, titlesIn } from "@/test/matrix";
import { makeTask as task } from "@/test/tasks";

type User = ReturnType<typeof renderMatrix>["user"];

/** Lift a card by its grip, press the arrow `keys` and drop it. */
async function dragByKeyboard(user: User, title: string, keys: string) {
  (await screen.findByRole("button", { name: `Drag “${title}”` })).focus();
  await user.keyboard(` ${keys} `);
}

beforeEach(() => {
  // Thursday 15 October 2026, 10:00 in London.
  vi.useFakeTimers({ now: new Date("2026-10-15T09:00:00Z"), toFake: ["Date"] });
  layOutMatrix();
});

afterEach(() => {
  vi.useRealTimers();
  vi.unstubAllGlobals();
});

describe("dragging Matrix cards", () => {
  it("makes a Task dragged up into Important P2", async () => {
    const fetchSpy = mockApi([task({ id: 1, title: "Tidy the shed", priority: 4 })]);
    const { user } = renderMatrix();

    await dragByKeyboard(user, "Tidy the shed", "{ArrowUp}");

    await waitFor(() => {
      expect(titlesIn("Important not urgent")).toEqual(["Tidy the shed"]);
    });
    expect(titlesIn("Neither")).toEqual([]);
    expect(await patches(fetchSpy)).toEqual([["/api/v1/tasks/1", { priority: 2 }]]);
  });

  it("makes a Task dragged down out of Important P3", async () => {
    const fetchSpy = mockApi([
      task({ id: 1, title: "Pay rent", priority: 1, due_date: "2026-10-15" }),
    ]);
    const { user } = renderMatrix();

    await dragByKeyboard(user, "Pay rent", "{ArrowDown}");

    await waitFor(() => {
      expect(titlesIn("Urgent not important")).toEqual(["Pay rent"]);
    });
    expect(await patches(fetchSpy)).toEqual([["/api/v1/tasks/1", { priority: 3 }]]);
  });

  it("leaves a Task dropped sideways where it was, since dates don't change by dragging", async () => {
    const fetchSpy = mockApi([
      task({ id: 1, title: "Pay rent", priority: 1, due_date: "2026-10-15" }),
    ]);
    const { user } = renderMatrix();

    await dragByKeyboard(user, "Pay rent", "{ArrowRight}");

    expect(titlesIn("Urgent & Important")).toEqual(["Pay rent"]);
    expect(await patches(fetchSpy)).toEqual([]);
  });

  it("leaves a Task dropped across both row and column where it was", async () => {
    const fetchSpy = mockApi([
      task({ id: 1, title: "Pay rent", priority: 1, due_date: "2026-10-15" }),
    ]);
    const { user } = renderMatrix();

    await dragByKeyboard(user, "Pay rent", "{ArrowDown}{ArrowRight}");

    expect(titlesIn("Urgent & Important")).toEqual(["Pay rent"]);
    expect(await patches(fetchSpy)).toEqual([]);
  });

  it("sends nothing when a Task is dropped on its own Quadrant", async () => {
    const fetchSpy = mockApi([task({ id: 1, title: "Plan the trip", priority: 2 })]);
    const { user } = renderMatrix();

    await dragByKeyboard(user, "Plan the trip", "");

    expect(titlesIn("Important not urgent")).toEqual(["Plan the trip"]);
    expect(await patches(fetchSpy)).toEqual([]);
  });

  it("says where a dragged Task is and what its drop did", async () => {
    mockApi([task({ id: 1, title: "Tidy the shed", priority: 4 })]);
    const { user } = renderMatrix();

    (await screen.findByRole("button", { name: "Drag “Tidy the shed”" })).focus();
    await user.keyboard(" ");
    expect(await screen.findByText("Picked up “Tidy the shed” from Neither.")).toBeInTheDocument();
    await user.keyboard("{ArrowUp}");
    expect(
      await screen.findByText("“Tidy the shed” is over Important not urgent."),
    ).toBeInTheDocument();
    await user.keyboard(" ");

    expect(
      await screen.findByText("“Tidy the shed” moved to Important not urgent, now Priority 2."),
    ).toBeInTheDocument();
  });

  it("says a sideways drop leaves the Task where it was", async () => {
    mockApi([task({ id: 1, title: "Tidy the shed", priority: 4 })]);
    const { user } = renderMatrix();

    await dragByKeyboard(user, "Tidy the shed", "{ArrowLeft}");

    expect(await screen.findByText("“Tidy the shed” stays in Neither.")).toBeInTheDocument();
  });

  it("puts a Task back and says why when the change fails", async () => {
    const fetchSpy = mockApi([task({ id: 1, title: "Tidy the shed", priority: 4 })]);
    const server = fetchSpy.getMockImplementation();
    fetchSpy.mockImplementation(async (input, init) => {
      if (requestOf(input).method === "PATCH") return json({ detail: "That Task is gone." }, 422);
      return server?.(input, init) ?? json({});
    });
    const { user } = renderMatrix();

    await dragByKeyboard(user, "Tidy the shed", "{ArrowUp}");

    expect(await screen.findByText("That Task is gone.")).toBeInTheDocument();
    await waitFor(() => {
      expect(titlesIn("Neither")).toEqual(["Tidy the shed"]);
    });
    expect(titlesIn("Important not urgent")).toEqual([]);
  });

  it("doesn't drag on a phone, where touch scrolls the page", async () => {
    mockApi([task({ id: 1, title: "Tidy the shed", priority: 4 })]);

    renderMatrix({ wide: false });

    expect(await screen.findByText("Tidy the shed")).toBeInTheDocument();
    expect(screen.queryByRole("button", { name: "Drag “Tidy the shed”" })).not.toBeInTheDocument();
  });
});
