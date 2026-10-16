import { screen, waitFor, within } from "@testing-library/react";

import type { NewTask } from "@/features/tasks/tasks";
import { INBOX } from "@/test/drawer";
import { requestOf } from "@/test/fetch";
import { day, fakeCalendarToday, mockApi, renderCalendar } from "@/test/calendar";
import { makeTask as task } from "@/test/tasks";

fakeCalendarToday();

/** The body of every Task the page added. */
async function postsOf(fetchSpy: ReturnType<typeof mockApi>) {
  const posts = fetchSpy.mock.calls
    .map(([input]) => requestOf(input))
    .filter((request) => request.method === "POST");
  return Promise.all(posts.map(async (request) => (await request.clone().json()) as NewTask));
}

describe("Quick add from an empty Calendar slot", () => {
  it("opens Quick add with a Month day's date and draws the new Task on it", async () => {
    const fetchSpy = mockApi();
    const { user } = renderCalendar();
    await screen.findByRole("gridcell", { name: /^Tuesday 20 October/ });

    await user.click(day("Tuesday 20 October"));

    const dialog = await screen.findByRole("dialog", { name: "Add a task" });
    expect(within(dialog).getByText("Tue 20 Oct")).toBeInTheDocument();
    await user.type(within(dialog).getByRole("combobox", { name: "New task" }), "Pay rent{Enter}");

    await waitFor(async () => {
      expect(await postsOf(fetchSpy)).toEqual([
        { title: "Pay rent", project_id: INBOX.id, dates: { due_date: "2026-10-20" } },
      ]);
    });
    expect(screen.queryByRole("dialog", { name: "Add a task" })).not.toBeInTheDocument();
    expect(await within(day("Tuesday 20 October")).findByText("Pay rent")).toBeInTheDocument();
  });

  it("opens Quick add with an hour's date and time in Week mode", async () => {
    const fetchSpy = mockApi();
    const { user } = renderCalendar("/?mode=week&date=2026-10-15");
    const slot = await screen.findByRole("gridcell", { name: "Friday 16 October 2026, 14:00" });

    await user.click(slot);

    const dialog = await screen.findByRole("dialog", { name: "Add a task" });
    expect(within(dialog).getByText("Fri 16 Oct, 14:00")).toBeInTheDocument();
    await user.type(
      within(dialog).getByRole("combobox", { name: "New task" }),
      "Call Priya{Enter}",
    );

    await waitFor(async () => {
      expect(await postsOf(fetchSpy)).toEqual([
        {
          title: "Call Priya",
          project_id: INBOX.id,
          dates: { due_date: "2026-10-16", due_time: "14:00" },
        },
      ]);
    });
  });

  it("opens Quick add with only the date from the all-day strip in Day mode", async () => {
    const fetchSpy = mockApi();
    const { user } = renderCalendar("/?mode=day&date=2026-10-15");

    await user.click(
      await screen.findByRole("gridcell", { name: "Thursday 15 October 2026, today, all day" }),
    );

    const dialog = await screen.findByRole("dialog", { name: "Add a task" });
    await user.type(within(dialog).getByRole("combobox", { name: "New task" }), "Pay rent{Enter}");
    await waitFor(async () => {
      expect(await postsOf(fetchSpy)).toEqual([
        { title: "Pay rent", project_id: INBOX.id, dates: { due_date: "2026-10-15" } },
      ]);
    });
  });

  it("opens Quick add from the focused slot with Enter", async () => {
    mockApi();
    const { user } = renderCalendar("/?mode=day&date=2026-10-15");
    const slot = await screen.findByRole("gridcell", {
      name: "Thursday 15 October 2026, today, 08:00",
    });
    slot.focus();

    await user.keyboard("{ArrowDown}{Enter}");

    const dialog = await screen.findByRole("dialog", { name: "Add a task" });
    expect(within(dialog).getByText("Thu 15 Oct, 09:00")).toBeInTheDocument();
  });

  it("leaves a click on a Task to the Task", async () => {
    mockApi([task({ id: 1, title: "Buy milk", due_date: "2026-10-15" })]);
    const { user } = renderCalendar();

    await user.click(await screen.findByRole("button", { name: /^Buy milk/ }));

    expect(await screen.findByRole("dialog", { name: "Task details" })).toBeInTheDocument();
    expect(screen.queryByRole("dialog", { name: "Add a task" })).not.toBeInTheDocument();
  });
});
