import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { render, screen, waitFor, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";

import { Toaster } from "@/components/ui/sonner";
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
    start_date: "2026-10-17",
    ...overrides,
  };
}

/** A stand-in server holding the user's Habits, which adds a new one last as the real one does. */
function mockApi(habits: Habit[]) {
  const created: HabitFields[] = [];
  vi.spyOn(globalThis, "fetch").mockImplementation(async (input) => {
    const request = requestOf(input);
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
  return created;
}

function renderPage() {
  const queryClient = new QueryClient({ defaultOptions: { queries: { retry: false } } });
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

describe("The Habits page", () => {
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
    const created = mockApi([habit({ id: 1, name: "Read" })]);
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
    expect(created).toEqual([{ name: "Drink water", color: "blue", icon: "droplet" }]);
    expect(screen.queryByRole("dialog")).not.toBeInTheDocument();
  });

  it("adds a Habit from the keyboard alone, with a colour and icon picked for it", async () => {
    const created = mockApi([]);
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
    expect(created).toEqual([{ name: "Read", color: "green", icon: "circle-check" }]);
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
});
