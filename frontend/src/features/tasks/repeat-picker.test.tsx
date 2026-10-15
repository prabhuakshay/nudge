import { screen, within } from "@testing-library/react";

import { INBOX, json, renderTaskList } from "@/test/drawer";
import { makeTask } from "@/test/tasks";

import type { TaskDetail } from "./tasks";

const task = makeTask;

/**
 * A stand-in server holding one Task. A PATCH saves its fields to it; closing a repeating Task
 * moves it on a day, as the server would.
 */
function mockApi(saved: TaskDetail) {
  return vi.spyOn(globalThis, "fetch").mockImplementation(async (input) => {
    const request = input as Request;
    const url = new URL(request.url);
    if (request.method === "PATCH") {
      save(saved, (await request.clone().json()) as Partial<TaskDetail>);
      return json({ task: saved, affected: [{ id: saved.id, prior_status: "open" }] });
    }
    if (url.pathname.endsWith("/sidebar")) return json({ inbox: INBOX, items: [], archived: [] });
    if (url.pathname.endsWith("/activity")) {
      return json({ items: [], next_cursor: null, count: 0 });
    }
    if (url.pathname.endsWith("/attachments") || url.pathname.endsWith("/comments")) {
      return json([]);
    }
    if (url.pathname.endsWith(`/tasks/${String(saved.id)}`)) return json(saved);
    if (url.searchParams.get("closed") === "true") return json({ items: [], next_cursor: null });
    return json({ items: [saved], next_cursor: null });
  });
}

function save(saved: TaskDetail, { status, ...fields }: Partial<TaskDetail>) {
  Object.assign(saved, fields);
  if (status === "completed" && saved.repeat_rule) saved.due_date = "2026-10-16";
}

async function patches(fetchSpy: ReturnType<typeof mockApi>) {
  const sent = fetchSpy.mock.calls
    .map(([input]) => input as Request)
    .filter((request) => request.method === "PATCH");
  return Promise.all(sent.map(async (request) => (await request.json()) as unknown));
}

function renderList() {
  vi.stubGlobal("matchMedia", (query: string) => ({
    media: query,
    matches: true,
    addEventListener: () => undefined,
    removeEventListener: () => undefined,
  }));
  return renderTaskList().user;
}

async function openPicker(user: ReturnType<typeof renderList>) {
  await user.click(await screen.findByRole("button", { name: /^Due: / }));
  return screen.findByRole("dialog", { name: "Date" });
}

beforeEach(() => {
  // Thursday 15 October 2026. Only Date is faked, so user-event's timers still run.
  vi.useFakeTimers({ toFake: ["Date"] });
  vi.setSystemTime(new Date(2026, 9, 15, 10, 30));
});

afterEach(() => {
  vi.useRealTimers();
  vi.unstubAllGlobals();
});

describe("Repeat", () => {
  it("offers presets for the due date and saves the chosen rule", async () => {
    const fetchSpy = mockApi(task({ due_date: "2026-10-20" }));
    const user = renderList();
    const picker = await openPicker(user);

    await user.selectOptions(
      within(picker).getByRole("combobox", { name: "Repeat" }),
      "Weekly on Tuesday",
    );

    expect(await patches(fetchSpy)).toEqual([{ repeat_rule: "FREQ=WEEKLY;BYDAY=TU" }]);
  });

  it("dates an undated Task today when it starts repeating", async () => {
    const fetchSpy = mockApi(task({}));
    const user = renderList();
    const picker = await openPicker(user);

    await user.selectOptions(within(picker).getByRole("combobox", { name: "Repeat" }), "Daily");

    expect(await patches(fetchSpy)).toEqual([
      { repeat_rule: "FREQ=DAILY", dates: { due_date: "2026-10-15" } },
    ]);
  });

  it("asks what a repeating Task counts from", async () => {
    const fetchSpy = mockApi(task({ due_date: "2026-10-15", repeat_rule: "FREQ=DAILY" }));
    const user = renderList();
    const picker = await openPicker(user);

    await user.selectOptions(
      within(picker).getByRole("combobox", { name: "Repeat from" }),
      "Completion date",
    );

    expect(await patches(fetchSpy)).toEqual([{ repeat_from: "completion" }]);
  });

  it("keeps a rule the presets don't offer", async () => {
    mockApi(task({ due_date: "2026-10-15", repeat_rule: "FREQ=MONTHLY;BYDAY=-1FR" }));
    const user = renderList();
    const picker = await openPicker(user);

    expect(within(picker).getByRole("combobox", { name: "Repeat" })).toHaveDisplayValue(
      "Monthly on the last Friday",
    );
  });

  it("shows that a Task repeats next to its due date", async () => {
    mockApi(task({ due_date: "2026-10-16", repeat_rule: "FREQ=DAILY" }));
    renderList();

    const cell = await screen.findByRole("button", { name: "Due: Tomorrow" });

    expect(within(cell).getByRole("img", { name: "Repeats Daily" })).toBeInTheDocument();
  });

  it("moves a completed repeating Task on and offers Undo", async () => {
    const fetchSpy = mockApi(task({ due_date: "2026-10-15", repeat_rule: "FREQ=DAILY" }));
    const user = renderList();

    await user.click(await screen.findByRole("checkbox", { name: "Complete “Buy milk”" }));
    expect(await screen.findByText("Completed “Buy milk”; next due Tomorrow")).toBeVisible();
    await user.click(screen.getByRole("button", { name: "Undo" }));

    expect(await patches(fetchSpy)).toEqual([{ status: "completed" }, { status: "open" }]);
    expect(screen.getByRole("checkbox", { name: "Complete “Buy milk”" })).toBeVisible();
  });

  it("puts the Repeat back when undoing No date", async () => {
    const fetchSpy = mockApi(
      task({ due_date: "2026-10-15", repeat_rule: "FREQ=DAILY", repeat_from: "due" }),
    );
    const user = renderList();
    const picker = await openPicker(user);

    await user.click(within(picker).getByRole("button", { name: "No date" }));
    await user.click(await screen.findByRole("button", { name: "Undo" }));

    expect((await patches(fetchSpy))[1]).toEqual({
      dates: { due_date: "2026-10-15", due_time: null, start_date: null, start_time: null },
      reminders: [],
      repeat_rule: "FREQ=DAILY",
      repeat_from: "due",
    });
  });
});

describe("Repeat on a Subtask", () => {
  it("is unavailable, since only top-level Tasks repeat", async () => {
    mockApi(task({ parent_id: 3, depth: 1, due_date: "2026-10-15" }));
    const user = renderList();
    const picker = await openPicker(user);

    expect(within(picker).getByRole("combobox", { name: "Repeat" })).toBeDisabled();
    expect(within(picker).getByText("Only top-level Tasks repeat")).toBeInTheDocument();
  });
});
