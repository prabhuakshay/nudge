import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";

import { TooltipProvider } from "@/components/ui/tooltip";

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
    vi.spyOn(globalThis, "fetch").mockResolvedValue(
      new Response(JSON.stringify({ items: events, next_cursor: null, count: 1 }), {
        headers: { "Content-Type": "application/json" },
      }),
    );

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
    vi.spyOn(globalThis, "fetch").mockResolvedValue(
      new Response(JSON.stringify({ items: events, next_cursor: null, count: 6 }), {
        headers: { "Content-Type": "application/json" },
      }),
    );

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

  it("describes pinning and unpinning", async () => {
    const events = [
      { id: 2, kind: "unpinned", at: at(15), data: {} },
      { id: 1, kind: "pinned", at: at(14), data: {} },
    ];
    vi.spyOn(globalThis, "fetch").mockResolvedValue(
      new Response(JSON.stringify({ items: events, next_cursor: null, count: 2 }), {
        headers: { "Content-Type": "application/json" },
      }),
    );

    renderFeed();

    const items = await screen.findAllByRole("listitem");
    expect(items.map((item) => item.querySelector("p")?.textContent)).toEqual([
      "Unpinned",
      "Pinned to the top",
    ]);
  });

  it("loads older events a page at a time", async () => {
    const fetchSpy = vi.spyOn(globalThis, "fetch").mockImplementation((input) => {
      const cursor = new URL((input as Request).url).searchParams.get("cursor");
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
    vi.spyOn(globalThis, "fetch").mockResolvedValue(
      new Response(JSON.stringify({ items: events, next_cursor: null, count: 2 }), {
        headers: { "Content-Type": "application/json" },
      }),
    );
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
});
