import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { render, screen } from "@testing-library/react";

import { TooltipProvider } from "@/components/ui/tooltip";

import { ActivityFeed } from "./activity-feed";

function renderFeed() {
  render(
    <QueryClientProvider client={new QueryClient()}>
      <TooltipProvider>
        <ActivityFeed taskId={1} />
      </TooltipProvider>
    </QueryClientProvider>,
  );
}

describe("Repeat in the Activity tab", () => {
  it.each([
    [
      "repeat_changed",
      { old: null, new: { rule: "FREQ=WEEKLY;BYDAY=TH", repeat_from: "calendar" } },
      "Set to repeat Weekly on Thursday",
    ],
    [
      "repeat_changed",
      {
        old: { rule: "FREQ=DAILY", repeat_from: "calendar" },
        new: { rule: "FREQ=DAILY", repeat_from: "completion" },
      },
      "Changed repeat from Daily (Calendar) to Daily (Completion date)",
    ],
    [
      "repeat_changed",
      { old: { rule: "FREQ=DAILY", repeat_from: "due" }, new: null },
      "Stopped repeating (was Daily)",
    ],
    [
      "repeat_removed",
      { rule: "FREQ=DAILY", repeat_from: "due" },
      "Stopped repeating Daily, as only dated top-level tasks repeat",
    ],
    [
      "repeat_advanced",
      { action: "completed", occurrence: "2026-11-05", next: "2026-11-06" },
      "Completed 5 Nov 2026; next on 6 Nov 2026",
    ],
    [
      "repeat_advanced",
      { action: "skipped", occurrence: "2026-11-05", next: "2026-11-12" },
      "Skipped 5 Nov 2026; next on 12 Nov 2026",
    ],
  ])("describes a %s event %#", async (kind, data, text) => {
    const events = [{ id: 1, kind, at: "2026-10-15T09:00:00Z", data }];
    vi.spyOn(globalThis, "fetch").mockResolvedValue(
      new Response(JSON.stringify({ items: events, next_cursor: null, count: 1 }), {
        headers: { "Content-Type": "application/json" },
      }),
    );

    renderFeed();

    expect(await screen.findByText(text)).toBeInTheDocument();
  });
});
