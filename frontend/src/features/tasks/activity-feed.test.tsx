import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";

import { TooltipProvider } from "@/components/ui/tooltip";

import { ActivityFeed } from "./activity-feed";

const NEWER = { id: 2, kind: "description_edited", at: "2026-10-15T09:00:00Z", data: {} };
const OLDER = { id: 1, kind: "created", at: "2026-10-14T09:00:00Z", data: {} };

function serve(items: unknown[]) {
  return vi.spyOn(globalThis, "fetch").mockImplementation(() =>
    Promise.resolve(
      new Response(JSON.stringify({ items, next_cursor: null, count: items.length }), {
        headers: { "Content-Type": "application/json" },
      }),
    ),
  );
}

function renderFeed() {
  render(
    <QueryClientProvider client={new QueryClient()}>
      <TooltipProvider>
        <ActivityFeed taskId={1} />
      </TooltipProvider>
    </QueryClientProvider>,
  );
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
    serve([{ id: 1, kind: "dates_changed", at: "2026-10-15T09:00:00Z", data }]);

    renderFeed();

    expect(await screen.findByText(text)).toBeInTheDocument();
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
});
