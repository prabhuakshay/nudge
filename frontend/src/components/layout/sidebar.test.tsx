import { QueryClientProvider } from "@tanstack/react-query";
import { render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import type { ReactNode } from "react";

import type { components } from "@/api/schema";
import type { Sidebar as SidebarData } from "@/features/tasks/tasks";
import { INBOX, json } from "@/test/drawer";
import { requestOf } from "@/test/fetch";
import { EXPANDED_USER, signedInClient } from "@/test/session";

import { Sidebar } from "./sidebar";

vi.mock("@tanstack/react-router", () => ({
  Link: ({ to, children, className }: { to: string; children: ReactNode; className: string }) => (
    <a href={to} className={className}>
      {children}
    </a>
  ),
}));
vi.mock("@/features/settings/settings-dialog", () => ({ SettingsDialog: () => null }));

type SidebarSectionsIn = components["schemas"]["SidebarSectionsIn"];

const ada = {
  ...EXPANDED_USER,
  projects_collapsed: true,
  tags_collapsed: true,
  people_collapsed: true,
};

const SIDEBAR: SidebarData = {
  inbox: INBOX,
  items: [],
  archived: [],
  tags: [{ id: 21, name: "work", color: null, open_count: 0, task_count: 0 }],
  people: [{ id: 1, name: "Al", color: "teal" }],
  today_count: 0,
  upcoming_count: 0,
};

/** A stand-in server: the sidebar for reads, and the updated user for section changes. */
function mockApi(sidebar: SidebarData = SIDEBAR) {
  return vi.spyOn(globalThis, "fetch").mockImplementation(async (input) => {
    const request = requestOf(input);
    if (request.method === "GET") return json(sidebar);
    // `json()` is untyped; the only write the sidebar sends is a sidebar sections change.
    const changes = (await request.clone().json()) as SidebarSectionsIn;
    return json({ ...ada, ...changes });
  });
}

async function writes(fetchSpy: ReturnType<typeof mockApi>) {
  const requests = fetchSpy.mock.calls
    .map(([input]) => requestOf(input))
    .filter((request) => request.method !== "GET");
  return Promise.all(
    requests.map(async (request) => {
      const body: unknown = await request.clone().json();
      return [`${request.method} ${new URL(request.url).pathname}`, body];
    }),
  );
}

function renderSidebar(onSearch = vi.fn()) {
  render(
    <QueryClientProvider client={signedInClient(ada)}>
      <Sidebar user={ada} onSearch={onSearch} />
    </QueryClientProvider>,
  );
  return userEvent.setup();
}

describe("Sidebar", () => {
  it("lists the views, the Inbox first with its open Task count, and Trash last", async () => {
    mockApi();
    renderSidebar();

    expect(await screen.findByRole("link", { name: "Inbox, 3 open" })).toBeInTheDocument();
    expect(screen.getAllByRole("link").map((link) => link.getAttribute("href"))).toEqual([
      "/inbox",
      "/",
      "/upcoming",
      "/trash",
    ]);
  });

  it("counts Today, Overdue included, and Upcoming", async () => {
    mockApi({ ...SIDEBAR, today_count: 4, upcoming_count: 2 });
    renderSidebar();

    expect(await screen.findByRole("link", { name: "Today, 4 open" })).toBeInTheDocument();
    expect(screen.getByRole("link", { name: "Upcoming, 2 open" })).toBeInTheDocument();
  });

  it("opens the command bar from the Search row, by click or keyboard", async () => {
    mockApi();
    const onSearch = vi.fn();
    const user = renderSidebar(onSearch);

    const search = screen.getByRole("button", { name: "Search" });
    expect(search).toHaveAttribute("aria-keyshortcuts", "Control+K /");
    await user.click(search);
    expect(onSearch).toHaveBeenCalledOnce();

    search.focus();
    await user.keyboard("{Enter}");
    expect(onSearch).toHaveBeenCalledTimes(2);
  });

  it("starts every section collapsed, and expanding one shows its rows and saves it", async () => {
    const fetchSpy = mockApi();
    const user = renderSidebar();

    for (const name of ["Projects", "Tags", "People"]) {
      expect(screen.getByRole("button", { name, expanded: false })).toBeInTheDocument();
    }
    expect(screen.queryByRole("link", { name: "work" })).not.toBeInTheDocument();

    await user.click(screen.getByRole("button", { name: "Tags" }));

    expect(screen.getByRole("button", { name: "Tags", expanded: true })).toBeInTheDocument();
    expect(await screen.findByRole("link", { name: "work" })).toBeInTheDocument();
    await waitFor(async () => {
      expect(await writes(fetchSpy)).toEqual([
        ["PATCH /api/v1/auth/sidebar-sections", { tags_collapsed: false }],
      ]);
    });
  });

  it("toggles a section from the keyboard with Enter or Space", async () => {
    const fetchSpy = mockApi();
    const user = renderSidebar();

    screen.getByRole("button", { name: "People" }).focus();
    await user.keyboard("{Enter}");
    expect(await screen.findByRole("link", { name: "Al" })).toBeInTheDocument();
    await user.keyboard(" ");

    expect(screen.getByRole("button", { name: "People", expanded: false })).toBeInTheDocument();
    expect(screen.queryByRole("link", { name: "Al" })).not.toBeInTheDocument();
    await waitFor(async () => {
      expect(await writes(fetchSpy)).toEqual([
        ["PATCH /api/v1/auth/sidebar-sections", { people_collapsed: false }],
        ["PATCH /api/v1/auth/sidebar-sections", { people_collapsed: true }],
      ]);
    });
  });

  it("adds to a collapsed section from its heading", async () => {
    mockApi();
    const user = renderSidebar();

    await user.click(screen.getByRole("button", { name: "Add a project or folder" }));
    expect(screen.getByRole("menuitem", { name: "New project" })).toBeInTheDocument();
    expect(screen.getByRole("menuitem", { name: "New folder" })).toBeInTheDocument();
    await user.keyboard("{Escape}");

    await user.click(screen.getByRole("button", { name: "Add a person" }));
    expect(screen.getByRole("dialog", { name: "New person" })).toBeInTheDocument();
    await user.keyboard("{Escape}");

    await user.click(screen.getByRole("button", { name: "Add a tag" }));
    expect(screen.getByRole("dialog", { name: "New tag" })).toBeInTheDocument();
    await user.keyboard("{Escape}");

    expect(screen.getByRole("button", { name: "Tags", expanded: false })).toBeInTheDocument();
  });
});
