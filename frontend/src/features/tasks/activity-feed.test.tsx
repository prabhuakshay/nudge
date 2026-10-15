import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";

import { TooltipProvider } from "@/components/ui/tooltip";

import { ActivityFeed } from "./activity-feed";

const NEWER = { id: 2, kind: "description_edited", at: "2026-10-15T09:00:00Z", data: {} };
const OLDER = { id: 1, kind: "created", at: "2026-10-14T09:00:00Z", data: {} };

describe("ActivityFeed", () => {
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

  it("says which Projects a Task moved between", async () => {
    const moved = {
      id: 3,
      kind: "moved",
      at: "2026-10-15T09:00:00Z",
      data: { from_project: "Inbox", to_project: "Work" },
    };
    vi.spyOn(globalThis, "fetch").mockResolvedValue(
      new Response(JSON.stringify({ items: [moved], next_cursor: null, count: 1 }), {
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

    expect(await screen.findByText("Moved from “Inbox” to “Work”")).toBeInTheDocument();
  });
});
