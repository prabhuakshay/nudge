import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { render, screen, waitFor, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";

import { Toaster } from "@/components/ui/sonner";
import { fakeCalendarToday } from "@/test/calendar";
import { json } from "@/test/drawer";
import { requestOf } from "@/test/fetch";

import type { Habit, HabitFields } from "./habits";
import { HabitsPage } from "./habits-page";

function habit(overrides: Partial<Habit> = {}): Habit {
  return {
    id: 1,
    name: "Read",
    icon: "book-open",
    color: "teal",
    frequency: "daily",
    goal: 1,
    start_date: "2026-10-15",
    today_count: 0,
    ...overrides,
  };
}

/** A Check-in request the page sent: which Habit, which day and the count it set. */
type CheckInSent = { path: string; count: number };

/**
 * A stand-in server holding the user's Habits, which adds a new one last and sets a day's
 * Check-ins as the real one does. `checkIns` holds every Check-in request, in order.
 */
function mockApi(habits: Habit[]) {
  const created: HabitFields[] = [];
  const checkIns: CheckInSent[] = [];
  vi.spyOn(globalThis, "fetch").mockImplementation(async (input) => {
    const request = requestOf(input);
    const { pathname } = new URL(request.url);
    if (request.method === "PUT") {
      // `json()` is untyped; the only PUT the page sends is a day's Check-ins.
      const { count } = (await request.clone().json()) as { count: number };
      checkIns.push({ path: pathname, count });
      const id = Number(pathname.split("/")[4]);
      const index = habits.findIndex((found) => found.id === id);
      const updated = habit({ ...habits[index], today_count: count });
      habits[index] = updated;
      return json(updated);
    }
    if (request.method === "POST") {
      // `json()` is untyped; the only write the page sends is a new Habit.
      const fields = (await request.clone().json()) as HabitFields;
      created.push(fields);
      const added = habit({ ...fields, id: habits.length + 1 });
      habits.push(added);
      return json(added, 201);
    }
    return json(habits);
  });
  return { created, checkIns };
}

function renderPage() {
  const queryClient = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  render(
    <QueryClientProvider client={queryClient}>
      <HabitsPage timeZone="Europe/London" />
      <Toaster />
    </QueryClientProvider>,
  );
  return userEvent.setup();
}

/** The listed Habits' names, read from each row's Check-in button, which is named after it. */
const names = () =>
  within(screen.getByRole("list", { name: "Habits" }))
    .getAllByRole("listitem")
    .map((row) =>
      within(row)
        .getByRole("button", { name: /^Check in / })
        .getAttribute("aria-label")
        ?.replace("Check in ", ""),
    );

const checkInButton = (name: string) => screen.getByRole("button", { name: `Check in ${name}` });

describe("The Habits page", () => {
  fakeCalendarToday();

  it("lists the user's Habits in their order", async () => {
    mockApi([habit({ id: 1, name: "Read" }), habit({ id: 2, name: "Run", icon: "footprints" })]);

    renderPage();

    expect(await screen.findByRole("heading", { name: "Habits" })).toBeInTheDocument();
    await waitFor(() => {
      expect(names()).toEqual(["Read", "Run"]);
    });
  });

  it("invites the user to add a first Habit when there are none", async () => {
    mockApi([]);

    renderPage();

    expect(await screen.findByRole("heading", { name: "No habits yet" })).toBeInTheDocument();
    expect(screen.queryByRole("list", { name: "Habits" })).not.toBeInTheDocument();
  });

  it("adds a Habit with a name, colour and icon at the bottom of the list", async () => {
    const { created } = mockApi([habit({ id: 1, name: "Read" })]);
    const user = renderPage();
    await screen.findByText("Read");

    await user.click(screen.getByRole("button", { name: "Add habit" }));
    const dialog = await screen.findByRole("dialog", { name: "New habit" });
    expect(within(dialog).getByRole("group", { name: "Frequency" })).toHaveTextContent("Every day");
    await user.type(within(dialog).getByLabelText("Name"), "Drink water");
    await user.click(within(dialog).getByRole("radio", { name: "Blue" }));
    await user.click(within(dialog).getByRole("radio", { name: "Water" }));
    await user.click(within(dialog).getByRole("button", { name: "Add habit" }));

    await waitFor(() => {
      expect(names()).toEqual(["Read", "Drink water"]);
    });
    expect(created).toEqual([{ name: "Drink water", color: "blue", icon: "droplet", goal: 1 }]);
    expect(screen.queryByRole("dialog")).not.toBeInTheDocument();
  });

  it("adds a Habit from the keyboard alone, with a colour and icon picked for it", async () => {
    const { created } = mockApi([]);
    const user = renderPage();
    await screen.findByRole("heading", { name: "No habits yet" });

    await user.tab();
    expect(screen.getByRole("button", { name: "Add habit" })).toHaveFocus();
    await user.keyboard("{Enter}");
    await screen.findByRole("dialog", { name: "New habit" });
    expect(screen.getByLabelText("Name")).toHaveFocus();
    await user.keyboard("Read{Enter}");

    await waitFor(() => {
      expect(names()).toEqual(["Read"]);
    });
    expect(created).toEqual([{ name: "Read", color: "green", icon: "circle-check", goal: 1 }]);
  });

  it("keeps the dialog open and says why when the server refuses the Habit", async () => {
    mockApi([]);
    vi.mocked(fetch).mockImplementation(async (input) => {
      const request = requestOf(input);
      if (request.method === "POST") return json({ detail: [{ msg: "too long" }] }, 422);
      return json([]);
    });
    const user = renderPage();
    await screen.findByRole("heading", { name: "No habits yet" });

    await user.click(screen.getByRole("button", { name: "Add habit" }));
    await user.type(screen.getByLabelText("Name"), "Read{Enter}");

    expect(await screen.findByText("Could not add the habit.")).toBeInTheDocument();
    expect(screen.getByRole("dialog", { name: "New habit" })).toBeInTheDocument();
  });

  it("adds a Habit with a daily Goal", async () => {
    const { created } = mockApi([]);
    const user = renderPage();
    await screen.findByRole("heading", { name: "No habits yet" });

    await user.click(screen.getByRole("button", { name: "Add habit" }));
    const dialog = await screen.findByRole("dialog", { name: "New habit" });
    const goal = within(dialog).getByRole("spinbutton", { name: "Goal per day" });
    expect(goal).toHaveValue(1);
    await user.type(within(dialog).getByLabelText("Name"), "Drink water");
    await user.clear(goal);
    await user.type(goal, "8");
    await user.click(within(dialog).getByRole("button", { name: "Add habit" }));

    await waitFor(() => {
      expect(created).toEqual([
        { name: "Drink water", color: "green", icon: "circle-check", goal: 8 },
      ]);
    });
  });

  it("checks in for today with one tap", async () => {
    const { checkIns } = mockApi([habit({ id: 1, name: "Read" })]);
    const user = renderPage();
    await screen.findByText("Read");
    expect(checkInButton("Read")).toHaveAccessibleDescription("Not done today");

    await user.click(checkInButton("Read"));

    await waitFor(() => {
      expect(checkInButton("Read")).toHaveAccessibleDescription("Done today");
    });
    expect(checkIns).toEqual([{ path: "/api/v1/habits/1/check-ins/2026-10-15", count: 1 }]);
  });

  it("fills the ring one Check-in at a time toward the Goal", async () => {
    const { checkIns } = mockApi([habit({ id: 2, name: "Drink water", goal: 3, today_count: 1 })]);
    const user = renderPage();
    await screen.findByText("Drink water");
    expect(checkInButton("Drink water")).toHaveAccessibleDescription("1 of 3 today");

    await user.click(checkInButton("Drink water"));

    expect(checkInButton("Drink water")).toHaveAccessibleDescription("2 of 3 today");
    await waitFor(() => {
      expect(checkIns).toEqual([{ path: "/api/v1/habits/2/check-ins/2026-10-15", count: 2 }]);
    });
  });

  it("shows a Check-in at once, before the server answers", async () => {
    mockApi([habit({ id: 1, name: "Read", goal: 2 })]);
    const user = renderPage();
    await screen.findByText("Read");
    vi.mocked(fetch).mockImplementation(() => new Promise(() => undefined));

    await user.click(checkInButton("Read"));

    expect(checkInButton("Read")).toHaveAccessibleDescription("1 of 2 today");
  });

  it("does nothing on a tap once today's Goal is met", async () => {
    const { checkIns } = mockApi([habit({ id: 1, name: "Read", goal: 2, today_count: 2 })]);
    const user = renderPage();
    await screen.findByText("Read");

    await user.click(checkInButton("Read"));

    expect(checkInButton("Read")).toHaveAccessibleDescription("Done today");
    expect(checkIns).toEqual([]);
  });

  it("undoes one Check-in from the Habit's menu", async () => {
    const { checkIns } = mockApi([habit({ id: 1, name: "Drink water", goal: 3, today_count: 2 })]);
    const user = renderPage();
    await screen.findByText("Drink water");

    await user.click(screen.getByRole("button", { name: "Drink water actions" }));
    await user.click(await screen.findByRole("menuitem", { name: "Undo Check-in" }));

    expect(checkInButton("Drink water")).toHaveAccessibleDescription("1 of 3 today");
    await waitFor(() => {
      expect(checkIns).toEqual([{ path: "/api/v1/habits/1/check-ins/2026-10-15", count: 1 }]);
    });
  });

  it("offers no undo before the first Check-in of the day", async () => {
    mockApi([habit({ id: 1, name: "Read" })]);
    const user = renderPage();
    await screen.findByText("Read");

    await user.click(screen.getByRole("button", { name: "Read actions" }));

    expect(await screen.findByRole("menuitem", { name: "Undo Check-in" })).toHaveAttribute(
      "aria-disabled",
      "true",
    );
  });
});
