import { fireEvent, screen, within } from "@testing-library/react";

import { day, fakeCalendarToday, mockApi, renderCalendar } from "@/test/calendar";
import { json } from "@/test/drawer";
import { requestOf } from "@/test/fetch";
import { makeTask } from "@/test/tasks";

const task = makeTask;

/** Where a day sits in jsdom, which lays nothing out: 100 px squares, seven to a row. */
function dayRect(cell: Element) {
  const index = screen.getAllByRole("gridcell").findIndex((each) => each === cell);
  return new DOMRect((index % 7) * 100, Math.floor(index / 7) * 100, 100, 100);
}

/** Lay the grid out, so dnd-kit can tell which day the pointer is over. */
function layOutGrid() {
  vi.spyOn(Element.prototype, "getBoundingClientRect").mockImplementation(function (this: Element) {
    const cell = this.closest("[role=gridcell]");
    return cell ? dayRect(cell) : new DOMRect(0, 0, 0, 0);
  });
}

/** Drag a Task's chip with the mouse from the day it is on to the middle of another day. */
function drag(title: string, from: string, to: string) {
  const chip = within(day(from)).getByRole("button", { name: new RegExp(`^${title}`) });
  const start = dayRect(day(from));
  const end = dayRect(day(to));
  fireEvent.mouseDown(chip, { button: 0, clientX: start.x + 50, clientY: start.y + 50 });
  // The first move only starts the drag.
  fireEvent.mouseMove(document, { clientX: start.x + 60, clientY: start.y + 50 });
  fireEvent.mouseMove(document, { clientX: end.x + 50, clientY: end.y + 50 });
  fireEvent.mouseUp(document, { clientX: end.x + 50, clientY: end.y + 50 });
}

/** Every PATCH sent, as its path and body. */
function patchesOf(fetchSpy: ReturnType<typeof mockApi>) {
  return Promise.all(
    fetchSpy.mock.calls
      .map(([input]) => requestOf(input))
      .filter((request) => request.method === "PATCH")
      .map(async (request): Promise<[string, unknown]> => [
        new URL(request.url).pathname,
        await request.clone().json(),
      ]),
  );
}

fakeCalendarToday();

describe("CalendarView drag to reschedule in Month mode", () => {
  beforeEach(layOutGrid);

  it("moves a Task to the day it is dragged to, keeping its time", async () => {
    const fetchSpy = mockApi([
      task({ id: 4, title: "Call the bank", due_date: "2026-10-15", due_time: "09:30:00" }),
    ]);
    renderCalendar();
    await screen.findByText("Call the bank");

    drag("Call the bank", "Thursday 15 October", "Tuesday 20 October");

    expect(await within(day("Tuesday 20 October")).findByText("Call the bank")).toBeInTheDocument();
    expect(within(day("Thursday 15 October")).queryByText("Call the bank")).not.toBeInTheDocument();
    await vi.waitFor(async () => {
      expect(await patchesOf(fetchSpy)).toEqual([
        [
          "/api/v1/tasks/4",
          {
            dates: {
              start_date: null,
              start_time: null,
              due_date: "2026-10-20",
              due_time: "09:30:00",
            },
          },
        ],
      ]);
    });
  });

  it("moves a range's start and due together, keeping its length", async () => {
    const fetchSpy = mockApi([
      task({ id: 2, title: "Trip", start_date: "2026-10-20", due_date: "2026-10-22" }),
    ]);
    renderCalendar();
    await screen.findAllByText("Trip");

    drag("Trip", "Wednesday 21 October", "Wednesday 28 October");

    for (const covered of ["Tuesday 27 October", "Wednesday 28 October", "Thursday 29 October"]) {
      expect(await within(day(covered)).findByText("Trip")).toBeInTheDocument();
    }
    expect(within(day("Monday 26 October")).queryByText("Trip")).not.toBeInTheDocument();
    await vi.waitFor(async () => {
      expect(await patchesOf(fetchSpy)).toEqual([
        [
          "/api/v1/tasks/2",
          {
            dates: {
              start_date: "2026-10-27",
              start_time: null,
              due_date: "2026-10-29",
              due_time: null,
            },
          },
        ],
      ]);
    });
  });

  it("moves only a repeating Task's current Occurrence, leaving its Repeat as it is", async () => {
    const fetchSpy = mockApi([
      task({ id: 6, title: "Water plants", due_date: "2026-10-15", repeat_rule: "FREQ=WEEKLY" }),
    ]);
    renderCalendar();
    await screen.findByText("Water plants");

    drag("Water plants", "Thursday 15 October", "Saturday 17 October");

    await vi.waitFor(async () => {
      expect(await patchesOf(fetchSpy)).toEqual([
        [
          "/api/v1/tasks/6",
          {
            dates: {
              start_date: null,
              start_time: null,
              due_date: "2026-10-17",
              due_time: null,
            },
          },
        ],
      ]);
    });
  });

  it("puts a Task back and says why when its new date can't be saved", async () => {
    const fetchSpy = mockApi([task({ id: 4, title: "Pay rent", due_date: "2026-10-15" })]);
    const serve = fetchSpy.getMockImplementation();
    let refused = false;
    fetchSpy.mockImplementation(async (input, init) => {
      const request = requestOf(input);
      if (request.method === "PATCH") {
        refused = true;
        return json({ detail: "Ranges can't be longer than a year." }, 422);
      }
      // The Calendar never answers again, so only the drop itself can put the Task back.
      if (refused && request.url.includes("/tasks/calendar")) return new Promise(() => undefined);
      if (!serve) throw new Error("The stand-in server has no handler.");
      return serve(input, init);
    });
    renderCalendar();
    await screen.findByText("Pay rent");

    drag("Pay rent", "Thursday 15 October", "Tuesday 20 October");

    expect(await screen.findByText("Ranges can't be longer than a year.")).toBeInTheDocument();
    expect(within(day("Thursday 15 October")).getByText("Pay rent")).toBeInTheDocument();
    expect(within(day("Tuesday 20 October")).queryByText("Pay rent")).not.toBeInTheDocument();
  });

  it("leaves a Task where it is when it is dropped back on its own day", async () => {
    const fetchSpy = mockApi([task({ id: 4, title: "Pay rent", due_date: "2026-10-15" })]);
    renderCalendar();
    await screen.findByText("Pay rent");

    drag("Pay rent", "Thursday 15 October", "Thursday 15 October");

    expect(within(day("Thursday 15 October")).getByText("Pay rent")).toBeInTheDocument();
    expect(await patchesOf(fetchSpy)).toEqual([]);
  });
});
