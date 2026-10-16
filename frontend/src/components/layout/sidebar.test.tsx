import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import type { ReactNode } from "react";

import { Sidebar } from "./sidebar";

vi.mock("@tanstack/react-router", () => ({
  Link: ({ to, children, className }: { to: string; children: ReactNode; className: string }) => (
    <a href={to} className={className}>
      {children}
    </a>
  ),
}));
vi.mock("@/features/settings/settings-dialog", () => ({ SettingsDialog: () => null }));
vi.mock("@/features/projects/sidebar-projects", () => ({ SidebarProjects: () => null }));
vi.mock("@/features/people/sidebar-people", () => ({ SidebarPeople: () => null }));

const ada = {
  id: 1,
  email: "ada@example.com",
  full_name: "Ada Lovelace",
  time_zone: "Europe/London",
  single_key_shortcuts: true,
};

describe("Sidebar", () => {
  it("lists the Inbox first, with its open Task count", async () => {
    vi.spyOn(globalThis, "fetch").mockResolvedValue(
      new Response(
        JSON.stringify({ inbox: { id: 7, name: "Inbox", open_count: 3 }, items: [], archived: [] }),
        {
          headers: { "Content-Type": "application/json" },
        },
      ),
    );

    render(
      <QueryClientProvider client={new QueryClient()}>
        <Sidebar user={ada} onSearch={vi.fn()} />
      </QueryClientProvider>,
    );

    expect(await screen.findByRole("link", { name: "Inbox, 3 open" })).toBeInTheDocument();
    expect(screen.getAllByRole("link").map((link) => link.getAttribute("href"))).toEqual([
      "/inbox",
      "/",
      "/upcoming",
      "/trash",
    ]);
  });

  it("counts Today, Overdue included, and Upcoming", async () => {
    vi.spyOn(globalThis, "fetch").mockResolvedValue(
      new Response(
        JSON.stringify({
          inbox: { id: 7, name: "Inbox", open_count: 0 },
          items: [],
          archived: [],
          today_count: 4,
          upcoming_count: 2,
        }),
        { headers: { "Content-Type": "application/json" } },
      ),
    );

    render(
      <QueryClientProvider client={new QueryClient()}>
        <Sidebar user={ada} onSearch={vi.fn()} />
      </QueryClientProvider>,
    );

    expect(await screen.findByRole("link", { name: "Today, 4 open" })).toBeInTheDocument();
    expect(screen.getByRole("link", { name: "Upcoming, 2 open" })).toBeInTheDocument();
  });

  it("opens the command bar from the Search row, by click or keyboard", async () => {
    vi.spyOn(globalThis, "fetch").mockResolvedValue(
      new Response(
        JSON.stringify({ inbox: { id: 7, name: "Inbox", open_count: 0 }, items: [], archived: [] }),
        { headers: { "Content-Type": "application/json" } },
      ),
    );
    const onSearch = vi.fn();
    render(
      <QueryClientProvider client={new QueryClient()}>
        <Sidebar user={ada} onSearch={onSearch} />
      </QueryClientProvider>,
    );
    const user = userEvent.setup();

    const search = screen.getByRole("button", { name: "Search" });
    expect(search).toHaveAttribute("aria-keyshortcuts", "Control+K /");
    await user.click(search);
    expect(onSearch).toHaveBeenCalledOnce();

    search.focus();
    await user.keyboard("{Enter}");
    expect(onSearch).toHaveBeenCalledTimes(2);
  });
});
