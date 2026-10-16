import { fireEvent, screen, within } from "@testing-library/react";

import { fakeCalendarToday, mockApi, renderCalendar } from "@/test/calendar";
import { json } from "@/test/drawer";
import { requestOf } from "@/test/fetch";
import { makeTask } from "@/test/tasks";

const task = makeTask;

/*
 * jsdom lays nothing out, so the Week grid is given one: day columns 100 px wide after a 56 px
 * gutter, the all-day strip 30 px tall from y = 30, and hour slots 48 px tall from y = 60.
 */
const GUTTER = 56;
const HOUR_TOP = 60;
const HOUR_HEIGHT = 48;

function columnOf(day: string) {
  const days = Array.from(
    document.querySelectorAll<HTMLElement>('[data-hour="all-day"]'),
    (cell) => cell.dataset["day"],
  );
  return GUTTER + days.indexOf(day) * 100;
}

/** The y of a time on the timeline, in minutes from midnight. */
function yOf(minutes: number) {
  return HOUR_TOP + (minutes / 60) * HOUR_HEIGHT;
}

function slotRect(slot: HTMLElement) {
  const { day = "", hour = "" } = slot.dataset;
  const x = columnOf(day);
  if (hour === "all-day") return new DOMRect(x, 30, 100, 30);
  return new DOMRect(x, yOf(Number(hour) * 60), 100, HOUR_HEIGHT);
}

/** A block sits in its slot at the top and height its style gives as percentages of the slot. */
function blockRect(block: HTMLElement, slot: HTMLElement) {
  const { x, y, width } = slotRect(slot);
  const fraction = (value: string) => parseFloat(value) / 100;
  return new DOMRect(
    x,
    y + fraction(block.style.top) * HOUR_HEIGHT,
    width,
    fraction(block.style.height) * HOUR_HEIGHT,
  );
}

function layOutWeek() {
  vi.spyOn(Element.prototype, "getBoundingClientRect").mockImplementation(function (this: Element) {
    const slot = this.closest<HTMLElement>("[role=gridcell]");
    if (!slot) return new DOMRect(0, 0, 0, 0);
    const block = this.closest<HTMLElement>("li[style]");
    return block ? blockRect(block, slot) : slotRect(slot);
  });
}

/** The Task's current Occurrence, the one that can be dragged. */
function itemOf(title: string) {
  const name = new RegExp(`^${title},(?!.*future Occurrence$)`);
  const item = screen.getByRole("button", { name }).closest("li");
  if (!item) throw new Error(`${title} isn't on the Calendar.`);
  return item;
}

/** Drags with the mouse from `grip` by however far the pointer moves to reach (x, y). */
function dragBy(grip: Element, dx: number, dy: number) {
  const { x, y } = grip.getBoundingClientRect();
  const start = { clientX: x + 50, clientY: y + 2 };
  fireEvent.mouseDown(grip, { button: 0, ...start });
  // The first move only starts the drag.
  fireEvent.mouseMove(document, { clientX: start.clientX + 10, clientY: start.clientY });
  const end = { clientX: start.clientX + dx, clientY: start.clientY + dy };
  fireEvent.mouseMove(document, end);
  fireEvent.mouseUp(document, end);
}

/** Drags a Task so its top lands `minutes` after midnight (or in the all-day strip) on `day`. */
function dragTo(title: string, day: string, minutes: number | "all-day") {
  const item = itemOf(title);
  const { x, y } = item.getBoundingClientRect();
  const top = minutes === "all-day" ? 32 : yOf(minutes);
  // Three pixels past the time, which snapping takes back.
  dragBy(item, columnOf(day) - x, top + 3 - y);
}

/** Drags a block's bottom edge so it ends `minutes` after midnight. */
function resizeTo(title: string, minutes: number) {
  const grip = itemOf(title).querySelector("[data-resize]");
  if (!grip) throw new Error(`${title} can't be resized.`);
  const { bottom } = grip.getBoundingClientRect();
  dragBy(grip, 0, yOf(minutes) - 2 - bottom);
}

async function patchedDates(fetchSpy: ReturnType<typeof mockApi>) {
  const patches = fetchSpy.mock.calls
    .map(([input]) => requestOf(input))
    .filter((request) => request.method === "PATCH");
  return Promise.all(patches.map(async (request): Promise<unknown> => request.clone().json()));
}

async function expectPatch(fetchSpy: ReturnType<typeof mockApi>, dates: object) {
  await vi.waitFor(async () => {
    expect(await patchedDates(fetchSpy)).toEqual([{ dates, move_occurrence: true }]);
  });
}

async function renderWeek(...tasks: Parameters<typeof task>[0][]) {
  const fetchSpy = mockApi(tasks.map((each) => task(each)));
  renderCalendar("/?mode=week&date=2026-10-15");
  await screen.findAllByRole("button", { name: new RegExp(`^${tasks[0]?.title ?? ""},`) });
  return fetchSpy;
}

fakeCalendarToday();

describe("CalendarView drag and resize in Week mode", () => {
  beforeEach(layOutWeek);

  it("moves a Task to the day and time it is dropped on, snapped to 15 minutes", async () => {
    const fetchSpy = await renderWeek({
      id: 4,
      title: "Call the bank",
      due_date: "2026-10-15",
      due_time: "09:30:00",
    });

    dragTo("Call the bank", "2026-10-16", 14 * 60 + 15);

    const friday = screen.getByRole("gridcell", { name: "Friday 16 October 2026, 14:00" });
    expect(await within(friday).findByText("Call the bank")).toBeInTheDocument();
    await expectPatch(fetchSpy, {
      start_date: null,
      start_time: null,
      due_date: "2026-10-16",
      due_time: "14:15:00",
    });
  });

  it("moves a range by its start, keeping its length", async () => {
    const fetchSpy = await renderWeek({
      id: 2,
      title: "Workshop",
      start_date: "2026-10-15",
      start_time: "09:00:00",
      due_date: "2026-10-15",
      due_time: "10:30:00",
    });

    dragTo("Workshop", "2026-10-14", 13 * 60 + 45);

    await expectPatch(fetchSpy, {
      start_date: "2026-10-14",
      start_time: "13:45:00",
      due_date: "2026-10-14",
      due_time: "15:15:00",
    });
  });

  it("moves only a repeating Task's current Occurrence, leaving its Repeat as it is", async () => {
    const fetchSpy = await renderWeek({
      id: 6,
      title: "Stand-up",
      due_date: "2026-10-15",
      due_time: "09:00:00",
      repeat_rule: "FREQ=DAILY",
    });

    dragTo("Stand-up", "2026-10-15", 9 * 60 + 30);

    await expectPatch(fetchSpy, {
      start_date: null,
      start_time: null,
      due_date: "2026-10-15",
      due_time: "09:30:00",
    });
  });

  it("gives an all-day Task the time it is dropped on", async () => {
    const fetchSpy = await renderWeek({ id: 3, title: "Pay rent", due_date: "2026-10-15" });

    dragTo("Pay rent", "2026-10-17", 11 * 60);

    await expectPatch(fetchSpy, {
      start_date: null,
      start_time: null,
      due_date: "2026-10-17",
      due_time: "11:00:00",
    });
  });

  it("takes the time off a timed Task dropped in the all-day strip", async () => {
    const fetchSpy = await renderWeek({
      id: 4,
      title: "Call the bank",
      due_date: "2026-10-15",
      due_time: "09:30:00",
    });

    dragTo("Call the bank", "2026-10-13", "all-day");

    const strip = screen.getByRole("gridcell", { name: "Tuesday 13 October 2026, all day" });
    expect(await within(strip).findByText("Call the bank")).toBeInTheDocument();
    await expectPatch(fetchSpy, {
      start_date: null,
      start_time: null,
      due_date: "2026-10-13",
      due_time: null,
    });
  });

  it("sets when a Task ends from its block's bottom edge, starting it at the block's top", async () => {
    const fetchSpy = await renderWeek({
      id: 4,
      title: "Dentist",
      due_date: "2026-10-15",
      due_time: "14:00:00",
    });

    resizeTo("Dentist", 15 * 60 + 30);

    await expectPatch(fetchSpy, {
      start_date: "2026-10-15",
      start_time: "14:00:00",
      due_date: "2026-10-15",
      due_time: "15:30:00",
    });
  });

  it("puts a Task back and says why when its new time can't be saved", async () => {
    const fetchSpy = await renderWeek({
      id: 4,
      title: "Call the bank",
      due_date: "2026-10-15",
      due_time: "09:30:00",
    });
    const serve = fetchSpy.getMockImplementation();
    let refused = false;
    fetchSpy.mockImplementation(async (input, init) => {
      const request = requestOf(input);
      if (request.method === "PATCH") {
        refused = true;
        return json({ detail: "This Task is in Trash." }, 422);
      }
      // The Calendar never answers again, so only the drop itself can put the Task back.
      if (refused && request.url.includes("/tasks/calendar")) return new Promise(() => undefined);
      if (!serve) throw new Error("The stand-in server has no handler.");
      return serve(input, init);
    });

    dragTo("Call the bank", "2026-10-16", 14 * 60);

    expect(await screen.findByText("This Task is in Trash.")).toBeInTheDocument();
    const thursday = screen.getByRole("gridcell", {
      name: "Thursday 15 October 2026, today, 09:00",
    });
    expect(within(thursday).getByText("Call the bank")).toBeInTheDocument();
  });

  it("moves a repeating Task's future Occurrences to its new time with it", async () => {
    const fetchSpy = await renderStandUp();
    // The save never answers, so only the drop itself can move the Occurrences.
    const serve = fetchSpy.getMockImplementation();
    fetchSpy.mockImplementation(async (input, init) => {
      if (requestOf(input).method === "PATCH") return new Promise(() => undefined);
      if (!serve) throw new Error("The stand-in server has no handler.");
      return serve(input, init);
    });

    dragTo("Stand-up", "2026-10-15", 14 * 60);

    const friday = screen.getByRole("gridcell", { name: "Friday 16 October 2026, 14:00" });
    expect(await within(friday).findByText("Stand-up")).toBeInTheDocument();
  });

  it("can't move or resize a future Occurrence, whose date doesn't exist yet", async () => {
    const fetchSpy = await renderStandUp();
    const later = screen.getByRole("button", { name: /^Stand-up,.*future Occurrence$/ });
    const item = later.closest("li");
    if (!item) throw new Error("The Occurrence isn't on the Calendar.");

    dragBy(item, 0, HOUR_HEIGHT * 2);
    // A drop saves after a tick, so wait one before checking that nothing was sent.
    await new Promise((resolve) => setTimeout(resolve, 0));

    expect(item.querySelector("[data-resize]")).toBeNull();
    expect(await patchedDates(fetchSpy)).toEqual([]);
  });
});

/** Renders a daily 09:00 Stand-up due today, with its Occurrence tomorrow. */
async function renderStandUp() {
  const standUp = () =>
    task({
      id: 6,
      title: "Stand-up",
      due_date: "2026-10-15",
      due_time: "09:00:00",
      repeat_rule: "FREQ=DAILY",
    });
  const fetchSpy = mockApi([standUp()], {
    occurrences: [{ task_id: 6, date: "2026-10-16" }],
    repeating: [standUp()],
  });
  renderCalendar("/?mode=week&date=2026-10-15");
  await screen.findByRole("button", { name: /^Stand-up,.*future Occurrence$/ });
  return fetchSpy;
}
