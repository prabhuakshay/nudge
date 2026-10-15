import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { render, screen, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";

import { TooltipProvider } from "@/components/ui/tooltip";
import { makeTask } from "@/test/tasks";

import { INBOX as DRAWER_INBOX } from "./drawer-test-utils";
import { TaskList } from "./task-list";
import type { TaskDetail } from "./tasks";

const INBOX = { ...DRAWER_INBOX, open_count: 1 };

const task = makeTask;

function json(body: unknown) {
  return Promise.resolve(
    new Response(JSON.stringify(body), { headers: { "Content-Type": "application/json" } }),
  );
}

/** A stand-in server holding one Task, which saves PATCHed dates to it. */
function mockApi(saved: TaskDetail) {
  return vi.spyOn(globalThis, "fetch").mockImplementation(async (input) => {
    const request = input as Request;
    const url = new URL(request.url);
    if (request.method === "PATCH") {
      const { dates } = (await request.clone().json()) as { dates: Partial<TaskDetail> | null };
      Object.assign(saved, dates ?? {});
      return json({ task: saved, affected: [] });
    }
    if (url.pathname.endsWith("/sidebar")) return json({ inbox: INBOX, items: [] });
    if (url.pathname.endsWith("/activity")) {
      return json({ items: [], next_cursor: null, count: 0 });
    }
    if (url.pathname.endsWith("/attachments")) return json([]);
    if (url.pathname.endsWith(`/tasks/${String(saved.id)}`)) return json(saved);
    if (url.searchParams.get("closed") === "true") return json({ items: [], next_cursor: null });
    return json({ items: [saved], next_cursor: null });
  });
}

async function patchedDates(fetchSpy: ReturnType<typeof mockApi>) {
  const patches = fetchSpy.mock.calls
    .map(([input]) => input as Request)
    .filter((request) => request.method === "PATCH");
  return Promise.all(patches.map(async (request) => (await request.json()) as unknown));
}

function renderList({ wide = true } = {}) {
  vi.stubGlobal("matchMedia", (query: string) => ({
    media: query,
    matches: wide,
    addEventListener: () => undefined,
    removeEventListener: () => undefined,
  }));
  render(
    <QueryClientProvider client={new QueryClient()}>
      <TooltipProvider>
        <TaskList project={INBOX} />
      </TooltipProvider>
    </QueryClientProvider>,
  );
  return userEvent.setup();
}

beforeEach(() => {
  // Thursday 15 October 2026. Only Date is faked, so user-event's timers still run.
  vi.useFakeTimers({ toFake: ["Date"] });
  vi.setSystemTime(new Date(2026, 9, 15, 10, 30));
});

afterEach(() => {
  vi.useRealTimers();
  vi.unstubAllGlobals();
});

describe("Due dates", () => {
  it("shows a Task's due date in its Due cell", async () => {
    mockApi(task({ due_date: "2026-10-16", due_time: "09:00:00" }));
    renderList();

    expect(await screen.findByRole("button", { name: "Due: Tomorrow, 09:00" })).toBeInTheDocument();
  });

  it("says when a Task is overdue, in the warning colour", async () => {
    mockApi(task({ due_date: "2026-10-14", is_overdue: true }));
    renderList();

    const cell = await screen.findByRole("button", { name: "Due: Yesterday, overdue" });

    expect(within(cell).getByText("Yesterday")).toHaveClass("text-warning");
  });

  it("shows the due date on the phone meta line", async () => {
    mockApi(task({ due_date: "2026-10-16" }));
    renderList({ wide: false });

    const row = await screen.findByRole("row", { name: /Buy milk/ });

    expect(within(row).getAllByText("Tomorrow").length).toBeGreaterThan(0);
  });

  it("sets a date from the Due cell without opening the Task", async () => {
    const fetchSpy = mockApi(task({}));
    const user = renderList();

    await user.click(await screen.findByRole("button", { name: "Due: none" }));
    await user.click(await screen.findByRole("button", { name: "Tomorrow" }));

    expect(await patchedDates(fetchSpy)).toEqual([
      {
        dates: { due_date: "2026-10-16", due_time: null, start_date: null, start_time: null },
      },
    ]);
    expect(screen.queryByRole("dialog", { name: "Task details" })).not.toBeInTheDocument();
  });

  it("adds a time and a start to the date from the drawer's Date chip", async () => {
    const fetchSpy = mockApi(task({ due_date: "2026-10-20" }));
    const user = renderList();
    await user.click(await screen.findByText("Buy milk"));
    const drawer = await screen.findByRole("dialog", { name: "Task details" });

    await user.click(within(drawer).getByRole("button", { name: "Date: Tuesday" }));
    const picker = await screen.findByRole("dialog", { name: "Date" });
    await user.selectOptions(within(picker).getByRole("combobox", { name: "Due time" }), "14:30");
    await user.type(within(picker).getByLabelText("Start date"), "2026-10-18");

    expect(await patchedDates(fetchSpy)).toEqual([
      {
        dates: { due_date: "2026-10-20", due_time: "14:30", start_date: null, start_time: null },
      },
      {
        dates: {
          due_date: "2026-10-20",
          due_time: "14:30",
          start_date: "2026-10-18",
          start_time: "14:30",
        },
      },
    ]);
  });

  it("removes every date with No date", async () => {
    const fetchSpy = mockApi(task({ start_date: "2026-10-18", due_date: "2026-10-20" }));
    const user = renderList();

    await user.click(await screen.findByRole("button", { name: /^Due: / }));
    await user.click(await screen.findByRole("button", { name: "No date" }));

    expect(await patchedDates(fetchSpy)).toEqual([{ dates: null }]);
  });
});
