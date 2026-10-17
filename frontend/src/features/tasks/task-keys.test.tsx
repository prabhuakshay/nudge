import { screen, within } from "@testing-library/react";

import { GARDEN, mockApi, openTask, patches, renderList, task } from "@/test/drawer";

function row(title: string) {
  const found = screen
    .getAllByRole("row")
    .find((candidate) => candidate.querySelector("[data-task-title]")?.textContent === title);
  if (!found) throw new Error(`No row for “${title}”`);
  return found;
}

async function focusRow(title: string) {
  await screen.findByText(title);
  row(title).focus();
}

const MILK = () => task({ id: 1, title: "Buy milk" });
const RENT = () => task({ id: 2, title: "Pay rent", position: "a1" });

afterEach(() => {
  vi.unstubAllGlobals();
});

describe("Task keys on a focused row", () => {
  it("set the Priority with 0–4", async () => {
    const fetchSpy = mockApi([MILK(), RENT()]);
    const user = renderList();
    await focusRow("Pay rent");

    await user.keyboard("2");

    await vi.waitFor(async () => {
      expect(await patches(fetchSpy)).toEqual([["/api/v1/tasks/2", { priority: 2 }]]);
    });
  });

  it("mark it Won't do with W and pin it with P", async () => {
    const fetchSpy = mockApi([MILK()]);
    const user = renderList();
    await focusRow("Buy milk");

    await user.keyboard("p");
    await user.keyboard("w");

    await vi.waitFor(async () => {
      expect(await patches(fetchSpy)).toEqual([
        ["/api/v1/tasks/1", { pinned: true }],
        ["/api/v1/tasks/1", { status: "wont_do" }],
      ]);
    });
  });

  it("complete it with Space and move focus with ↓ and K", async () => {
    const fetchSpy = mockApi([MILK(), RENT()]);
    const user = renderList();
    await focusRow("Buy milk");

    await user.keyboard("{ArrowDown}");
    expect(row("Pay rent")).toHaveFocus();
    await user.keyboard("k");
    expect(row("Buy milk")).toHaveFocus();
    await user.keyboard(" ");

    await vi.waitFor(async () => {
      expect(await patches(fetchSpy)).toEqual([["/api/v1/tasks/1", { status: "completed" }]]);
    });
  });

  it("open the drawer at the date picker with D", async () => {
    mockApi([MILK()]);
    const user = renderList();
    await focusRow("Buy milk");

    await user.keyboard("d");

    expect(await screen.findByRole("dialog", { name: "Task details" })).toBeInTheDocument();
    expect(await screen.findByRole("dialog", { name: "Date" })).toBeInTheDocument();
  });

  it("open the drawer with the title being edited with E", async () => {
    mockApi([MILK()]);
    const user = renderList();
    await focusRow("Buy milk");

    await user.keyboard("e");

    const drawer = await screen.findByRole("dialog", { name: "Task details" });
    await vi.waitFor(() => {
      expect(within(drawer).getByRole("textbox", { name: "Title" })).toHaveFocus();
    });
  });

  it("do nothing that changes a Task in an archived Project", async () => {
    const fetchSpy = mockApi([MILK()]);
    const user = renderList({ project: GARDEN });
    await focusRow("Buy milk");

    await user.keyboard("2w ");

    expect(await patches(fetchSpy)).toEqual([]);
  });
});

describe("Task keys in the drawer", () => {
  it("change the open Task", async () => {
    const fetchSpy = mockApi([MILK()]);
    const user = renderList();
    await openTask(user, "Buy milk");

    await user.keyboard("1");

    await vi.waitFor(async () => {
      expect(await patches(fetchSpy)).toEqual([["/api/v1/tasks/1", { priority: 1 }]]);
    });
  });

  it("open the Tag picker with T", async () => {
    mockApi([MILK()]);
    const user = renderList();
    await openTask(user, "Buy milk");

    await user.keyboard("t");

    expect(await screen.findByRole("option", { name: "work" })).toBeInTheDocument();
  });

  it("open the Project picker with M", async () => {
    mockApi([MILK()]);
    const user = renderList();
    await openTask(user, "Buy milk");

    await user.keyboard("m");

    expect(await screen.findByRole("dialog", { name: "Move to project" })).toBeInTheDocument();
  });

  it("don't move a Subtask to another Project with M", async () => {
    mockApi([MILK(), task({ id: 3, title: "Skimmed", parent_id: 1, position: "a2" })]);
    const user = renderList();
    await openTask(user, "Skimmed");

    await user.keyboard("m");

    expect(screen.queryByRole("dialog", { name: "Move to project" })).not.toBeInTheDocument();
  });

  it("mark it Blocked and focus the reason with B", async () => {
    const fetchSpy = mockApi([MILK()]);
    const user = renderList();
    const drawer = await openTask(user, "Buy milk");

    await user.keyboard("b");

    await vi.waitFor(() => {
      expect(within(drawer).getByRole("textbox", { name: "Blocked reason" })).toHaveFocus();
    });
    expect(await patches(fetchSpy)).toEqual([["/api/v1/tasks/1", { status: "blocked" }]]);
  });
});

describe("Esc in the drawer", () => {
  it("cancels a title edit first, then closes the drawer", async () => {
    const fetchSpy = mockApi([MILK()]);
    const user = renderList();
    const drawer = await openTask(user, "Buy milk");
    const title = within(drawer).getByRole("textbox", { name: "Title" });

    await user.click(title);
    await user.keyboard(" and eggs{Escape}");

    expect(title).toHaveValue("Buy milk");
    expect(title).not.toHaveFocus();
    expect(drawer).toBeInTheDocument();

    await user.keyboard("{Escape}");

    await vi.waitFor(() => {
      expect(screen.queryByRole("dialog", { name: "Task details" })).not.toBeInTheDocument();
    });
    expect(await patches(fetchSpy)).toEqual([]);
  });
});
