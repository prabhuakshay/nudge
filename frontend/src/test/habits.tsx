import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { render, screen, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import type { ReactNode } from "react";

import { Toaster } from "@/components/ui/sonner";
import type { CheckIn, Habit, HabitSettings } from "@/features/habits/habits";
import { HabitsPage } from "@/features/habits/habits-page";
import { validateHabitSearch } from "@/features/habits/open-habit";
import { TodayHabits } from "@/features/habits/today-strip";
import { json, renderListRoute } from "@/test/drawer";
import { requestOf } from "@/test/fetch";

/** A daily Habit with no Check-ins yet, changed by `overrides`. */
export function habit(overrides: Partial<Habit> = {}): Habit {
  return {
    id: 1,
    name: "Read",
    icon: "book-open",
    color: "teal",
    frequency: "daily",
    weekdays: [],
    times_per_week: null,
    goal: 1,
    start_date: "2026-10-15",
    today_count: 0,
    is_archived: false,
    current_streak: 0,
    best_streak: 0,
    streak_unit: "days",
    ...overrides,
  };
}

/** A request the page sent that changes Habits: its method, path and body. */
export type Write = { method: string; path: string; body: unknown };

const HABIT_PATH = /^\/api\/v1\/habits\/(\d+)(?:\/([\w-]+))?(?:\/([\d-]+))?$/;

/** Today in London on the tests' fixed clock, the day whose Check-ins a Habit counts as today's. */
const TODAY = "2026-10-15";

/** Set a Habit's Check-ins on a day as the real server does; the page only sends `{ count }`. */
function setCheckIns(
  found: Habit,
  checkIns: Record<number, CheckIn[]>,
  day: string,
  body: unknown,
) {
  const { count } = body as { count: number };
  const others = (checkIns[found.id] ?? []).filter((checkIn) => checkIn.date !== day);
  checkIns[found.id] = count > 0 ? [...others, { date: day, count }] : others;
  if (day === TODAY) found.today_count = count;
  return json(found);
}

/**
 * Answer a write to one Habit as the real server does, changing `habits` and the days in
 * `checkIns` to match.
 */
function answer(habits: Habit[], checkIns: Record<number, CheckIn[]>, write: Write) {
  const { method, path, body } = write;
  const [, id, action, day] = HABIT_PATH.exec(path) ?? [];
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
  if (action === "check-ins" && day) return setCheckIns(found, checkIns, day, body);
  found.is_archived = action === "archive";
  return json(found);
}

const CHECK_INS_PATH = /^\/api\/v1\/habits\/(\d+)\/check-ins$/;

/**
 * A stand-in server holding the user's Habits, which adds, edits, moves, archives and deletes them
 * and sets their Check-ins as the real one does. `checkIns` holds each Habit's past days with
 * Check-ins, by Habit id, which it answers whatever range is asked for. Returns the writes the page
 * sent, in order.
 */
export function mockApi(habits: Habit[], checkIns: Record<number, CheckIn[]> = {}) {
  const sent: Write[] = [];
  vi.spyOn(globalThis, "fetch").mockImplementation(async (input) => {
    const request = requestOf(input);
    const path = new URL(request.url).pathname;
    const [, checkInsOf] = CHECK_INS_PATH.exec(path) ?? [];
    if (checkInsOf) return json(checkIns[Number(checkInsOf)] ?? []);
    if (request.method === "GET") return json(habits);
    const text = await request.clone().text();
    const write = {
      method: request.method,
      path,
      body: text ? (JSON.parse(text) as unknown) : null,
    };
    sent.push(write);
    if (path !== "/api/v1/habits") return answer(habits, checkIns, write);
    // The only write to the collection is a new Habit.
    const added = habit({ ...(write.body as HabitSettings), id: habits.length + 1 });
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

/** The Frequency fields of a Habit done every day. */
export const EVERY_DAY = { frequency: "daily", weekdays: [], times_per_week: null } as const;

/** Render a view of Habits as a fresh client would load it. */
function renderFresh(view: ReactNode) {
  const queryClient = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  render(
    <QueryClientProvider client={queryClient}>
      {view}
      <Toaster />
    </QueryClientProvider>,
  );
  return userEvent.setup();
}

/**
 * Render the Habits page for a user in `timeZone` at `url`, as a fresh client would load it.
 * Returns a user to drive the page.
 */
export const renderPage = (timeZone = "Europe/London", url = "/") =>
  renderPageRoute(timeZone, url).user;

/** Render the Habits page at `url` for a user in London; returns the router too, to read the URL. */
export const renderPageRoute = (timeZone = "Europe/London", url = "/") =>
  renderListRoute(<HabitsPage timeZone={timeZone} />, { url, validateSearch: validateHabitSearch });

/** Render Today's strip of Habits for a user in London, as a fresh client would load it. */
export const renderStrip = () => renderFresh(<TodayHabits timeZone="Europe/London" />);

/** The names of the Habits in the list with this label, in order. */
export const namesIn = (list: string) =>
  [...screen.getByRole("list", { name: list }).querySelectorAll<HTMLLIElement>(":scope > li")]
    // A row's name is its first text; its Streak, days and Check-in progress come after it.
    .map((row) => within(row).getAllByText(/./)[0]?.textContent);

/** The Check-in button of the Habit with this name. */
export const checkInButton = (name: string) =>
  screen.getByRole("button", { name: `Check in ${name}` });

/** The names of the live Habits, in order. */
export const names = () => namesIn("Habits");

/** Open a Habit's row menu and pick an item from it. */
export async function pick(user: ReturnType<typeof userEvent.setup>, name: string, item: string) {
  await user.click(await screen.findByRole("button", { name: `${name} options` }));
  await user.click(await screen.findByRole("menuitem", { name: item }));
}
