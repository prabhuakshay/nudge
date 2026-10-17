import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { render, screen, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";

import { Toaster } from "@/components/ui/sonner";
import { sessionQuery, type User } from "@/features/auth/session";
import type { Habit, HabitSettings } from "@/features/habits/habits";
import { HabitsPage } from "@/features/habits/habits-page";
import { json } from "@/test/drawer";
import { requestOf } from "@/test/fetch";
import { EXPANDED_USER } from "@/test/session";

export function makeHabit(overrides: Partial<Habit> = {}): Habit {
  return {
    id: 1,
    name: "Read",
    icon: "book-open",
    color: "teal",
    frequency: "daily",
    weekdays: [],
    times_per_week: null,
    start_date: "2026-10-17",
    is_archived: false,
    ...overrides,
  };
}

/** A request the page sent that changes Habits: its method, path and body. */
export type Write = { method: string; path: string; body: unknown };

const HABIT_PATH = /^\/api\/v1\/habits\/(\d+)(?:\/(\w+))?$/;

/** Answer a write to one Habit as the real server does, changing `habits` to match. */
function answer(habits: Habit[], { method, path, body }: Write) {
  const [, id, action] = HABIT_PATH.exec(path) ?? [];
  const index = habits.findIndex((each) => each.id === Number(id));
  const found = habits[index];
  if (!found) return json({ detail: "Habit not found." }, 404);
  if (method === "DELETE" || action === "move") {
    habits.splice(index, 1);
    if (action === "move") {
      // The page only moves with `{ after_id }`.
      const afterId = (body as { after_id: number | null }).after_id;
      const at = afterId === null ? 0 : habits.findIndex((each) => each.id === afterId) + 1;
      habits.splice(at, 0, found);
    }
    return Promise.resolve(new Response(null, { status: 204 }));
  }
  if (method === "PATCH") {
    // The page only edits with a Habit's settings.
    Object.assign(found, body as HabitSettings);
    return json(found);
  }
  found.is_archived = action === "archive";
  return json(found);
}

/**
 * A stand-in server holding the user's Habits, which adds, edits, moves, archives and deletes them
 * as the real one does. Returns the writes the page sent, in order.
 */
export function mockApi(habits: Habit[]) {
  const sent: Write[] = [];
  vi.spyOn(globalThis, "fetch").mockImplementation(async (input) => {
    const request = requestOf(input);
    const path = new URL(request.url).pathname;
    if (request.method === "GET") return json(habits);
    const text = await request.clone().text();
    const write = {
      method: request.method,
      path,
      body: text ? (JSON.parse(text) as unknown) : null,
    };
    sent.push(write);
    if (path !== "/api/v1/habits") return answer(habits, write);
    // The only write to the collection is a new Habit.
    const added = makeHabit({ ...(write.body as HabitSettings), id: habits.length + 1 });
    habits.push(added);
    return json(added, 201);
  });
  return sent;
}

/** What the page sent other than new Habits. */
export const changes = (sent: Write[]) => sent.filter((write) => write.path !== "/api/v1/habits");

/** The new Habits the page sent, in order. */
export const added = (sent: Write[]) =>
  sent.filter((write) => write.path === "/api/v1/habits").map((write) => write.body);

/** The signed-in user, whose clock is in Kiritimati, far from the test machine's. */
const ada: User = { ...EXPANDED_USER, time_zone: "Pacific/Kiritimati" };

export function renderPage() {
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

export const namesIn = (list: string) =>
  within(screen.getByRole("list", { name: list }))
    .getAllByRole("listitem")
    .map((row) => row.textContent);

export const names = () => namesIn("Habits");

/** Open a Habit's row menu and pick an item from it. */
export async function pick(user: ReturnType<typeof userEvent.setup>, name: string, item: string) {
  await user.click(await screen.findByRole("button", { name: `${name} options` }));
  await user.click(await screen.findByRole("menuitem", { name: item }));
}

export const EVERY_DAY = { frequency: "daily", weekdays: [], times_per_week: null } as const;

/** Fixes the clock at 11:00 UTC on 17 October 2026, already 18 October on the user's clock. */
export function fakeHabitsToday() {
  beforeEach(() => {
    vi.useFakeTimers({ now: new Date("2026-10-17T11:00:00Z"), toFake: ["Date"] });
  });
  afterEach(() => {
    vi.useRealTimers();
  });
}
