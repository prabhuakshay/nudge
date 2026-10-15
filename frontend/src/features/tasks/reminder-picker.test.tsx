import { screen, within } from "@testing-library/react";

import { INBOX, json, renderList } from "@/test/drawer";
import { makeTask } from "@/test/tasks";

import type { TaskDetail } from "./tasks";

type Patch = { dates?: Partial<TaskDetail> | null; reminders?: number[] };

/** Save a PATCH as the server does: removing the dates removes the Reminders. */
function save(saved: TaskDetail, { dates, reminders }: Patch) {
  if (dates !== undefined) Object.assign(saved, dates ?? { due_date: null, due_time: null });
  if (dates === null) saved.reminders = [];
  if (reminders) saved.reminders = reminders.map((offset) => ({ offset, fire_at: null }));
  return json({ task: saved, affected: [] });
}

/** A stand-in server holding one Task, which saves PATCHed dates and Reminders to it. */
function mockApi(saved: TaskDetail) {
  return vi.spyOn(globalThis, "fetch").mockImplementation(async (input) => {
    const request = input as Request;
    const url = new URL(request.url);
    if (request.method === "PATCH") return save(saved, (await request.clone().json()) as Patch);
    if (url.pathname.endsWith("/sidebar")) return json({ inbox: INBOX, items: [], archived: [] });
    if (url.pathname.endsWith("/activity")) {
      return json({ items: [], next_cursor: null, count: 0 });
    }
    if (url.pathname.endsWith("/attachments")) return json([]);
    if (url.pathname.endsWith(`/tasks/${String(saved.id)}`)) return json(saved);
    if (url.searchParams.get("closed") === "true") return json({ items: [], next_cursor: null });
    return json({ items: [saved], next_cursor: null });
  });
}

async function patchBodies(fetchSpy: ReturnType<typeof mockApi>) {
  const patches = fetchSpy.mock.calls
    .map(([input]) => input as Request)
    .filter((request) => request.method === "PATCH");
  return Promise.all(patches.map(async (request) => (await request.json()) as unknown));
}

/** Open the date picker from the list's Due cell, then its Reminders list. */
async function openReminders(user: ReturnType<typeof renderList>, due: string) {
  await user.click(await screen.findByRole("button", { name: `Due: ${due}` }));
  const picker = await screen.findByRole("dialog", { name: "Date" });
  const trigger = within(picker).getByRole("button", { name: /^Reminders:/ });
  await vi.waitFor(() => {
    expect(trigger).toBeEnabled();
  });
  await user.click(trigger);
  return screen.findByRole("dialog", { name: "Reminders" });
}

const AT_TWO = { due_date: "2026-10-20", due_time: "14:00:00" };

beforeEach(() => {
  // Thursday 15 October 2026. Only Date is faked, so user-event's timers still run.
  vi.useFakeTimers({ toFake: ["Date"] });
  vi.setSystemTime(new Date(2026, 9, 15, 10, 30));
});

afterEach(() => {
  vi.useRealTimers();
  vi.unstubAllGlobals();
});

describe("Reminders", () => {
  it("adds a preset Reminder to a timed Task", async () => {
    const fetchSpy = mockApi(makeTask(AT_TWO));
    const user = renderList();

    const menu = await openReminders(user, "Tuesday, 14:00");
    await user.click(within(menu).getByRole("button", { name: "30 minutes before" }));

    expect(await patchBodies(fetchSpy)).toEqual([{ reminders: [-30] }]);
    expect(
      within(menu).getByRole("button", { name: "30 minutes before", pressed: true }),
    ).toBeInTheDocument();
  });

  it("removes a Reminder that is set", async () => {
    const fetchSpy = mockApi(makeTask({ ...AT_TWO, reminders: [{ offset: 0, fire_at: null }] }));
    const user = renderList();

    const menu = await openReminders(user, "Tuesday, 14:00");
    await user.click(within(menu).getByRole("button", { name: "On time", pressed: true }));

    expect(await patchBodies(fetchSpy)).toEqual([{ reminders: [] }]);
  });

  it("offers 09:00 presets for an all-day Task", async () => {
    mockApi(makeTask({ due_date: "2026-10-20" }));
    const user = renderList();

    const menu = await openReminders(user, "Tuesday");

    expect(within(menu).getByRole("button", { name: "On the day, 09:00" })).toBeInTheDocument();
    expect(within(menu).getByRole("button", { name: "1 week before, 09:00" })).toBeInTheDocument();
  });

  it("previews and adds a Custom Reminder", async () => {
    const fetchSpy = mockApi(makeTask(AT_TWO));
    const user = renderList();

    const menu = await openReminders(user, "Tuesday, 14:00");
    await user.click(within(menu).getByRole("button", { name: "Custom…" }));
    const amount = within(menu).getByRole("textbox", { name: "Amount" });
    await user.clear(amount);
    await user.type(amount, "2");
    await user.selectOptions(within(menu).getByRole("combobox", { name: "Unit" }), "hours");

    expect(within(menu).getByText("Fires Tue 20 Oct, 12:00")).toBeInTheDocument();
    await user.click(within(menu).getByRole("button", { name: "Add" }));
    expect(await patchBodies(fetchSpy)).toEqual([{ reminders: [-120] }]);
  });

  it("adds a Custom Reminder days before an all-day Task at a set time", async () => {
    const fetchSpy = mockApi(makeTask({ due_date: "2026-10-20" }));
    const user = renderList();

    const menu = await openReminders(user, "Tuesday");
    await user.click(within(menu).getByRole("button", { name: "Custom…" }));
    const days = within(menu).getByRole("textbox", { name: "Days before" });
    await user.clear(days);
    await user.type(days, "3");

    expect(within(menu).getByText("Fires Sat 17 Oct, 09:00")).toBeInTheDocument();
    await user.click(within(menu).getByRole("button", { name: "Add" }));
    expect(await patchBodies(fetchSpy)).toEqual([{ reminders: [-3780] }]);
  });

  it("refuses a Custom Reminder that is already set", async () => {
    mockApi(makeTask({ ...AT_TWO, reminders: [{ offset: -15, fire_at: null }] }));
    const user = renderList();

    const menu = await openReminders(user, "Tuesday, 14:00");
    await user.click(within(menu).getByRole("button", { name: "Custom…" }));

    expect(within(menu).getByText("That reminder is already set.")).toBeInTheDocument();
    expect(within(menu).getByRole("button", { name: "Add" })).toBeDisabled();
  });

  it("waits for a due date", async () => {
    mockApi(makeTask());
    const user = renderList();

    await user.click(await screen.findByRole("button", { name: "Due: none" }));
    const picker = await screen.findByRole("dialog", { name: "Date" });

    expect(within(picker).getByRole("button", { name: "Reminders: None" })).toBeDisabled();
  });

  it("offers Undo after removing the date takes the Reminders with it", async () => {
    const fetchSpy = mockApi(makeTask({ ...AT_TWO, reminders: [{ offset: -30, fire_at: null }] }));
    const user = renderList();

    await openReminders(user, "Tuesday, 14:00");
    await user.keyboard("{Escape}");
    await user.click(screen.getByRole("button", { name: "No date" }));
    await user.click(await screen.findByRole("button", { name: "Undo" }));

    expect(screen.getByText("Date and reminders removed")).toBeInTheDocument();
    expect(await patchBodies(fetchSpy)).toEqual([
      { dates: null },
      {
        dates: { due_date: "2026-10-20", due_time: "14:00:00", start_date: null, start_time: null },
        reminders: [-30],
      },
    ]);
  });
});
