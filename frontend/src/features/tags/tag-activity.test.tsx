import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { render, screen } from "@testing-library/react";

import { TooltipProvider } from "@/components/ui/tooltip";
import { ActivityFeed } from "@/features/tasks/activity-feed";

describe("Tag events in a Task's Activity", () => {
  it("names the Tags put on, taken off and merged", async () => {
    const events = [
      {
        id: 3,
        kind: "tags_merged",
        at: "2026-10-15T09:00:00Z",
        data: { from_tag: "job", into_tag: "work" },
      },
      { id: 2, kind: "tag_removed", at: "2026-10-15T08:00:00Z", data: { name: "home" } },
      { id: 1, kind: "tag_added", at: "2026-10-14T09:00:00Z", data: { name: "job" } },
    ];
    vi.spyOn(globalThis, "fetch").mockResolvedValue(
      new Response(JSON.stringify({ items: events, next_cursor: null, count: 3 }), {
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

    expect(await screen.findByText("Merged the tag #job into #work")).toBeInTheDocument();
    expect(screen.getByText("Removed the tag #home")).toBeInTheDocument();
    expect(screen.getByText("Added the tag #job")).toBeInTheDocument();
  });
});
