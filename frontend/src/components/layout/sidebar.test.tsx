import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { render, screen } from "@testing-library/react";
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
        <Sidebar user={ada} />
      </QueryClientProvider>,
    );

    expect(await screen.findByRole("link", { name: "Inbox, 3 open" })).toBeInTheDocument();
    expect(screen.getAllByRole("link").map((link) => link.getAttribute("href"))).toEqual([
      "/inbox",
      "/",
      "/upcoming",
    ]);
  });
});
