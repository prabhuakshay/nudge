import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { render, screen, waitFor, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";

import { Toaster } from "@/components/ui/sonner";
import { sessionQuery, type User } from "@/features/auth/session";
import { json } from "@/test/drawer";
import { requestOf } from "@/test/fetch";

import type { Habit, HabitSettings } from "./habits";
import { HabitsPage } from "./habits-page";

function habit(overrides: Partial<Habit> = {}): Habit {
  return {
    id: 1,
    name: "Read",
    icon: "book-open",
    color: "teal",
    frequency: "daily",
    weekdays: [],
    times_per_week: null,
    start_date: "2026-10-17",
    ...overrides,
  };
}

/**
 * A stand-in server holding the user's Habits, which adds a new one last and edits one in place
 * as the real one does.
 */
function mockApi(habits: Habit[]) {
  const created: HabitSettings[] = [];
  const edited: HabitSettings[] = [];
  vi.spyOn(globalThis, "fetch").mockImplementation(async (input) => {
    const request = requestOf(input);
    const path = new URL(request.url).pathname;
    if (request.method === "PATCH") {
      // `json()` is untyped; the only edit the page sends is a Habit's settings.
      const fields = (await request.clone().json()) as HabitSettings;
      edited.push(fields);
      const index = habits.findIndex((one) => path.endsWith(`/${String(one.id)}`));
      const changed = { ...fields, id: habits[index]?.id ?? 0 };
      habits.splice(index, 1, changed);
      return json(changed);
    }
    if (request.method === "POST") {
      // `json()` is untyped; the only write the page sends is a new Habit.
      const fields = (await request.clone().json()) as HabitSettings;
      created.push(fields);
      const added = habit({ ...fields, id: habits.length + 1 });
      habits.push(added);
      return json(added, 201);
    }
    return json(habits);
  });
  return { created, edited };
}

/** The signed-in user, whose clock is in Kiritimati, far from the test machine's. */
const ada: User = {
  id: 1,
  email: "ada@example.com",
  full_name: "Ada Lovelace",
  time_zone: "Pacific/Kiritimati",
  single_key_shortcuts: true,
  projects_collapsed: true,
  tags_collapsed: true,
  people_collapsed: true,
};

function renderPage() {
  const queryClient = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  queryClient.setQueryData(sessionQuery.queryKey, ada);
  render(
    <QueryClientProvider client={queryClient}>
      <HabitsPage />
      <Toaster />
    </QueryClientProvider>,
  );
  return userEvent.setup();
}

const names = () =>
  within(screen.getByRole("list", { name: "Habits" }))
    .getAllByRole("listitem")
    .map((row) => row.textContent);

const EVERY_DAY = { frequency: "daily", weekdays: [], times_per_week: null } as const;

describe("The Habits page", () => {
  beforeEach(() => {
    // 11:00 on 17 October in UTC is already 18 October in Kiritimati.
    vi.useFakeTimers({ now: new Date("2026-10-17T11:00:00Z"), toFake: ["Date"] });
  });
  afterEach(() => {
    vi.useRealTimers();
  });

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
    expect(within(dialog).getByRole("radio", { name: "Every day" })).toBeChecked();
    expect(within(dialog).getByLabelText("Start date")).toHaveValue("2026-10-18");
    await user.type(within(dialog).getByLabelText("Name"), "Drink water");
    await user.click(within(dialog).getByRole("radio", { name: "Blue" }));
    await user.click(within(dialog).getByRole("radio", { name: "Water" }));
    await user.click(within(dialog).getByRole("button", { name: "Add habit" }));

    await waitFor(() => {
      expect(names()).toEqual(["Read", "Drink water"]);
    });
    expect(created).toEqual([
      {
        name: "Drink water",
        color: "blue",
        icon: "droplet",
        ...EVERY_DAY,
        start_date: "2026-10-18",
      },
    ]);
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
    expect(created).toEqual([
      {
        name: "Read",
        color: "green",
        icon: "circle-check",
        ...EVERY_DAY,
        start_date: "2026-10-18",
      },
    ]);
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

  it("adds a Habit done on chosen weekdays, from a chosen start date", async () => {
    const { created } = mockApi([]);
    const user = renderPage();
    await screen.findByRole("heading", { name: "No habits yet" });

    await user.click(screen.getByRole("button", { name: "Add habit" }));
    const dialog = await screen.findByRole("dialog", { name: "New habit" });
    await user.type(within(dialog).getByLabelText("Name"), "Gym");
    await user.click(within(dialog).getByRole("radio", { name: "On chosen days" }));
    const days = within(dialog).getByRole("group", { name: "Days" });
    for (const day of ["Monday", "Tuesday", "Wednesday", "Thursday", "Friday"]) {
      expect(within(days).getByRole("checkbox", { name: day })).toBeChecked();
    }
    await user.click(within(days).getByRole("checkbox", { name: "Tuesday" }));
    await user.click(within(days).getByRole("checkbox", { name: "Thursday" }));
    await user.click(within(days).getByRole("checkbox", { name: "Sunday" }));
    await user.clear(within(dialog).getByLabelText("Start date"));
    await user.type(within(dialog).getByLabelText("Start date"), "2026-11-02");
    await user.click(within(dialog).getByRole("button", { name: "Add habit" }));

    await waitFor(() => {
      expect(names()).toEqual(["Gym"]);
    });
    expect(created).toEqual([
      expect.objectContaining({
        frequency: "weekdays",
        weekdays: [1, 3, 5, 7],
        times_per_week: null,
        start_date: "2026-11-02",
      }),
    ]);
  });

  it("adds a Habit done a number of times a week, on any days", async () => {
    const { created } = mockApi([]);
    const user = renderPage();
    await screen.findByRole("heading", { name: "No habits yet" });

    await user.click(screen.getByRole("button", { name: "Add habit" }));
    const dialog = await screen.findByRole("dialog", { name: "New habit" });
    await user.type(within(dialog).getByLabelText("Name"), "Run");
    await user.click(within(dialog).getByRole("radio", { name: "Times a week" }));
    const times = within(dialog).getByRole("radiogroup", { name: "How many times a week" });
    expect(
      within(times)
        .getAllByRole("radio")
        .map((radio) => radio.getAttribute("value")),
    ).toEqual(["1", "2", "3", "4", "5", "6"]);
    await user.click(within(times).getByRole("radio", { name: "4" }));
    await user.click(within(dialog).getByRole("button", { name: "Add habit" }));

    await waitFor(() => {
      expect(names()).toEqual(["Run"]);
    });
    expect(created).toEqual([
      expect.objectContaining({ frequency: "times_per_week", weekdays: [], times_per_week: 4 }),
    ]);
  });

  it("refuses chosen weekdays with no day chosen, and says why", async () => {
    const { created } = mockApi([]);
    const user = renderPage();
    await screen.findByRole("heading", { name: "No habits yet" });

    await user.click(screen.getByRole("button", { name: "Add habit" }));
    const dialog = await screen.findByRole("dialog", { name: "New habit" });
    await user.type(within(dialog).getByLabelText("Name"), "Gym");
    await user.click(within(dialog).getByRole("radio", { name: "On chosen days" }));
    for (const day of ["Monday", "Tuesday", "Wednesday", "Thursday", "Friday"]) {
      await user.click(within(dialog).getByRole("checkbox", { name: day }));
    }
    await user.click(within(dialog).getByRole("button", { name: "Add habit" }));

    expect(within(dialog).getByRole("alert")).toHaveTextContent("Choose at least one day.");
    expect(created).toEqual([]);
    expect(screen.getByRole("dialog", { name: "New habit" })).toBeInTheDocument();
  });

  it("refuses a Habit with only spaces for a name, and says why", async () => {
    const { created } = mockApi([]);
    const user = renderPage();
    await screen.findByRole("heading", { name: "No habits yet" });

    await user.click(screen.getByRole("button", { name: "Add habit" }));
    const dialog = await screen.findByRole("dialog", { name: "New habit" });
    await user.type(within(dialog).getByLabelText("Name"), "   ");
    await user.click(within(dialog).getByRole("button", { name: "Add habit" }));

    expect(within(dialog).getByRole("alert")).toHaveTextContent("Give the habit a name.");
    expect(created).toEqual([]);
  });

  it("edits a Habit's settings from its row", async () => {
    const { edited } = mockApi([
      habit({ id: 1, name: "Read" }),
      habit({ id: 2, name: "Gym", frequency: "weekdays", weekdays: [1, 3] }),
    ]);
    const user = renderPage();
    await screen.findByText("Gym");

    await user.click(screen.getByRole("button", { name: "Edit Gym" }));
    const dialog = await screen.findByRole("dialog", { name: "Edit habit" });
    expect(within(dialog).getByLabelText("Name")).toHaveValue("Gym");
    expect(within(dialog).getByRole("radio", { name: "On chosen days" })).toBeChecked();
    expect(within(dialog).getByRole("checkbox", { name: "Monday" })).toBeChecked();
    expect(within(dialog).getByRole("checkbox", { name: "Tuesday" })).not.toBeChecked();
    expect(within(dialog).getByLabelText("Start date")).toHaveValue("2026-10-17");
    await user.clear(within(dialog).getByLabelText("Name"));
    await user.type(within(dialog).getByLabelText("Name"), "Lift");
    await user.click(within(dialog).getByRole("radio", { name: "Times a week" }));
    await user.click(within(dialog).getByRole("radio", { name: "2" }));
    await user.click(within(dialog).getByRole("button", { name: "Save" }));

    await waitFor(() => {
      expect(names()).toEqual(["Read", "Lift"]);
    });
    expect(edited).toEqual([
      {
        name: "Lift",
        color: "teal",
        icon: "book-open",
        frequency: "times_per_week",
        weekdays: [],
        times_per_week: 2,
        start_date: "2026-10-17",
      },
    ]);
    expect(screen.queryByRole("dialog")).not.toBeInTheDocument();
  });
});
