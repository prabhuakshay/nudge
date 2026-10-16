import { screen, within } from "@testing-library/react";

import { day, fakeCalendarToday, mockApi, renderCalendar } from "@/test/calendar";
import { requestOf } from "@/test/fetch";
import { makeTask as task } from "@/test/tasks";

fakeCalendarToday();

describe("CalendarView's +N more", () => {
  const busyDay = () =>
    [1, 2, 3, 4, 5].map((id) =>
      task({ id, title: `Errand ${String(id)}`, due_date: "2026-10-15" }),
    );

  it("shows how many Tasks a full day leaves out", async () => {
    mockApi([...busyDay(), task({ id: 9, title: "Pay rent", due_date: "2026-10-16" })]);
    renderCalendar();
    await screen.findByText("Errand 1");

    const thursday = within(day("Thursday 15 October"));
    expect(thursday.getAllByRole("listitem")).toHaveLength(3);
    expect(
      thursday.getByRole("button", { name: "+2 more on Thursday 15 October" }),
    ).toHaveTextContent("+2 more");
    expect(within(day("Friday 16 October")).queryByRole("button", { name: /more/ })).toBeNull();
  });

  it("lists every Task of the day, each still tickable and opening its detail", async () => {
    const fetchSpy = mockApi(busyDay());
    const { user, router } = renderCalendar();
    await screen.findByText("Errand 1");

    await user.click(screen.getByRole("button", { name: "+2 more on Thursday 15 October" }));

    const list = await screen.findByRole("dialog", { name: "Thursday 15 October 2026" });
    expect(within(list).getAllByRole("listitem")).toHaveLength(5);
    await user.click(within(list).getByRole("checkbox", { name: "Complete “Errand 5”" }));
    const patches = fetchSpy.mock.calls
      .map(([input]) => requestOf(input))
      .filter((request) => request.method === "PATCH");
    expect(patches.map((request) => new URL(request.url).pathname)).toEqual(["/api/v1/tasks/5"]);

    await user.click(within(list).getByRole("button", { name: /^Errand 4/ }));

    expect(await screen.findByRole("dialog", { name: "Task details" })).toBeInTheDocument();
    expect(router.state.location.search).toMatchObject({ task: 4 });
  });

  it("is reached with Tab from its day and opens with the keyboard", async () => {
    mockApi(busyDay());
    const { user } = renderCalendar();
    await screen.findByText("Errand 1");

    day("Thursday 15 October").focus();
    await user.keyboard("{Tab}{Tab}{Tab}{Tab}{Tab}{Tab}{Tab}");
    expect(screen.getByRole("button", { name: "+2 more on Thursday 15 October" })).toHaveFocus();
    await user.keyboard("{Enter}");

    expect(
      await screen.findByRole("dialog", { name: "Thursday 15 October 2026" }),
    ).toBeInTheDocument();
  });
});
