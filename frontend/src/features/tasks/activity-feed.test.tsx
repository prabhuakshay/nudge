import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";

import { TooltipProvider } from "@/components/ui/tooltip";
import { requestOf } from "@/test/fetch";

import { ActivityFeed } from "./activity-feed";

const NEWER = { id: 2, kind: "description_edited", at: "2026-10-15T09:00:00Z", data: {} };
const OLDER = { id: 1, kind: "created", at: "2026-10-14T09:00:00Z", data: {} };

function renderFeed() {
  render(
    <QueryClientProvider client={new QueryClient()}>
      <TooltipProvider>
        <ActivityFeed taskId={1} />
      </TooltipProvider>
    </QueryClientProvider>,
  );
}

/** Answer the feed's request with one page holding every event. */
function respondWith(items: unknown[]) {
  vi.spyOn(globalThis, "fetch").mockResolvedValue(
    new Response(JSON.stringify({ items, next_cursor: null, count: items.length }), {
      headers: { "Content-Type": "application/json" },
    }),
  );
}

function at(day: number) {
  return `2026-10-${String(day)}T09:00:00Z`;
}

const DAY = { due_date: "2026-11-06", due_time: null, start_date: null, start_time: null };
const TRIP = {
  due_date: "2026-11-04",
  due_time: "06:30:00",
  start_date: "2026-11-03",
  start_time: "22:00:00",
};

describe("ActivityFeed", () => {
  it.each([
    [{ old: null, new: DAY }, "Set the date to 6 Nov 2026"],
    [
      { old: DAY, new: TRIP },
      "Changed the date from 6 Nov 2026 to 3 Nov 2026, 22:00 – 4 Nov 2026, 06:30",
    ],
    [{ old: DAY, new: null }, "Removed the date (was 6 Nov 2026)"],
  ])("describes a date change %#", async (data, text) => {
    const events = [{ id: 1, kind: "dates_changed", at: at(15), data }];
    respondWith(events);

    renderFeed();

    expect(await screen.findByText(text)).toBeInTheDocument();
  });

  it.each([
    [{ old: [], new: [-30, 0], all_day: false }, "Set reminders: 30 minutes before, On time"],
    [
      { old: [540], new: [-900], all_day: true },
      "Changed reminders from On the day, 09:00 to 1 day before, 09:00",
    ],
    [{ old: [-5], new: [], all_day: false }, "Removed reminders (was 5 minutes before)"],
  ])("describes a Reminders change %#", async (data, text) => {
    const events = [{ id: 1, kind: "reminders_changed", at: at(15), data }];
    respondWith(events);

    renderFeed();

    expect(await screen.findByText(text)).toBeInTheDocument();
  });

  it("describes Status and Priority changes, with a Blocked reason", async () => {
    const events = [
      {
        id: 6,
        kind: "status_changed",
        at: at(15),
        data: { old: "blocked", new: "open", blocked_reason: "" },
      },
      {
        id: 5,
        kind: "status_changed",
        at: at(14),
        data: { old: "open", new: "blocked", blocked_reason: "Waiting on Ada" },
      },
      {
        id: 4,
        kind: "status_changed",
        at: at(13),
        data: { old: "wont_do", new: "blocked", blocked_reason: "" },
      },
      {
        id: 3,
        kind: "status_changed",
        at: at(12),
        data: { old: "completed", new: "wont_do", blocked_reason: "" },
      },
      {
        id: 2,
        kind: "status_changed",
        at: at(11),
        data: { old: "open", new: "completed", blocked_reason: "" },
      },
      { id: 1, kind: "priority_changed", at: at(10), data: { old: 0, new: 1 } },
    ];
    respondWith(events);

    renderFeed();

    const items = await screen.findAllByRole("listitem");
    expect(items.map((item) => item.querySelector("p")?.textContent)).toEqual([
      "Reopened",
      "Marked Blocked: “Waiting on Ada”",
      "Marked Blocked",
      "Marked Won't do",
      "Completed",
      "Changed priority from None to P1",
    ]);
  });

  it("names the relative behind a cascade and counts the Subtasks closed with a parent", async () => {
    const status = { blocked_reason: "", via_parent: null, via_subtask: null, closed_subtasks: 0 };
    const events = [
      {
        id: 4,
        kind: "status_changed",
        at: at(13),
        data: { ...status, old: "completed", new: "open", via_subtask: "Book seats" },
      },
      {
        id: 3,
        kind: "status_changed",
        at: at(12),
        data: { ...status, old: "open", new: "wont_do", via_parent: "Plan the trip" },
      },
      {
        id: 2,
        kind: "status_changed",
        at: at(11),
        data: { ...status, old: "open", new: "completed", closed_subtasks: 1 },
      },
      {
        id: 1,
        kind: "status_changed",
        at: at(10),
        data: { ...status, old: "open", new: "completed", closed_subtasks: 3 },
      },
    ];
    respondWith(events);

    renderFeed();

    const items = await screen.findAllByRole("listitem");
    expect(items.map((item) => item.querySelector("p")?.textContent)).toEqual([
      "Reopened via Subtask “Book seats”",
      "Marked Won't do via parent “Plan the trip”",
      "Completed with 1 Subtask",
      "Completed with 3 Subtasks",
    ]);
  });

  it("describes pinning and unpinning", async () => {
    const events = [
      { id: 2, kind: "unpinned", at: at(15), data: {} },
      { id: 1, kind: "pinned", at: at(14), data: {} },
    ];
    respondWith(events);

    renderFeed();

    const items = await screen.findAllByRole("listitem");
    expect(items.map((item) => item.querySelector("p")?.textContent)).toEqual([
      "Unpinned",
      "Pinned to the top",
    ]);
  });

  it("loads older events a page at a time", async () => {
    const fetchSpy = vi.spyOn(globalThis, "fetch").mockImplementation((input) => {
      const cursor = new URL(requestOf(input).url).searchParams.get("cursor");
      const page =
        cursor === "next"
          ? { items: [OLDER], next_cursor: null, count: 2 }
          : { items: [NEWER], next_cursor: "next", count: 2 };
      return Promise.resolve(
        new Response(JSON.stringify(page), { headers: { "Content-Type": "application/json" } }),
      );
    });
    render(
      <QueryClientProvider client={new QueryClient()}>
        <TooltipProvider>
          <ActivityFeed taskId={1} />
        </TooltipProvider>
      </QueryClientProvider>,
    );
    const user = userEvent.setup();
    expect(await screen.findByText("Edited the description")).toBeInTheDocument();

    await user.click(screen.getByRole("button", { name: "Show older activity" }));

    expect(await screen.findByText("Created this task")).toBeInTheDocument();
    expect(screen.queryByRole("button", { name: "Show older activity" })).not.toBeInTheDocument();
    expect(fetchSpy).toHaveBeenCalledTimes(2);
  });

  it("names the file in Attachment events", async () => {
    const events = [
      { id: 2, kind: "attachment_removed", at: NEWER.at, data: { name: "old.pdf" } },
      { id: 1, kind: "attachment_added", at: OLDER.at, data: { name: "receipt.png" } },
    ];
    respondWith(events);
    render(
      <QueryClientProvider client={new QueryClient()}>
        <TooltipProvider>
          <ActivityFeed taskId={1} />
        </TooltipProvider>
      </QueryClientProvider>,
    );

    expect(await screen.findByText("Deleted the attachment “old.pdf”")).toBeInTheDocument();
    expect(screen.getByText("Attached “receipt.png”")).toBeInTheDocument();
  });

  it("says which Projects a Task moved between", async () => {
    const moved = {
      id: 3,
      kind: "moved",
      at: NEWER.at,
      data: { from_project: "Inbox", to_project: "Work" },
    };
    respondWith([moved]);
    render(
      <QueryClientProvider client={new QueryClient()}>
        <TooltipProvider>
          <ActivityFeed taskId={1} />
        </TooltipProvider>
      </QueryClientProvider>,
    );

    expect(await screen.findByText("Moved from “Inbox” to “Work”")).toBeInTheDocument();
  });

  it("says which parent a Task moved under or out of", async () => {
    const inbox = { from_project: "Inbox", to_project: "Inbox" };
    const events = [
      {
        id: 3,
        kind: "moved",
        at: NEWER.at,
        data: { ...inbox, from_parent: "Trip", to_parent: null },
      },
      {
        id: 2,
        kind: "moved",
        at: OLDER.at,
        data: { ...inbox, from_parent: null, to_parent: "Trip" },
      },
      {
        id: 1,
        kind: "moved",
        at: OLDER.at,
        data: { from_project: "Inbox", to_project: "Work", from_parent: null, to_parent: "Launch" },
      },
    ];
    respondWith(events);

    renderFeed();

    expect(await screen.findByText("Moved to the top level")).toBeInTheDocument();
    expect(screen.getByText("Moved under “Trip”")).toBeInTheDocument();
    expect(screen.getByText("Moved from “Inbox” to “Work”, under “Launch”")).toBeInTheDocument();
  });

  it("says which Section a Task moved to", async () => {
    const work = { from_project: "Work", to_project: "Work", from_parent: null, to_parent: null };
    const events = [
      { id: 2, kind: "moved", at: NEWER.at, data: { ...work, from_section: "Kitchen" } },
      {
        id: 1,
        kind: "moved",
        at: OLDER.at,
        data: { ...work, from_section: null, to_section: "Kitchen" },
      },
    ];
    respondWith(events);

    renderFeed();

    expect(await screen.findByText("Moved to No section")).toBeInTheDocument();
    expect(screen.getByText("Moved to the section “Kitchen”")).toBeInTheDocument();
  });

  it("writes Mentions as plain names and says which People were merged", async () => {
    const events = [
      {
        id: 2,
        kind: "person_merged",
        at: NEWER.at,
        data: { from_person: "Al", to_person: "Alice" },
      },
      {
        id: 1,
        kind: "title_changed",
        at: OLDER.at,
        data: { old: "Call Al", new: "Call [@Al](person:4)" },
      },
    ];
    respondWith(events);

    renderFeed();

    expect(await screen.findByText("Merged @Al into @Alice")).toBeInTheDocument();
    expect(screen.getByText("Renamed from “Call Al” to “Call @Al”")).toBeInTheDocument();
  });

  it("says when the task went to Trash and came back", async () => {
    const events = [
      { id: 2, kind: "restored", at: NEWER.at, data: {} },
      { id: 1, kind: "trashed", at: OLDER.at, data: {} },
    ];
    respondWith(events);

    renderFeed();

    expect(await screen.findByText("Restored from Trash")).toBeInTheDocument();
    expect(screen.getByText("Moved to Trash")).toBeInTheDocument();
  });
});
