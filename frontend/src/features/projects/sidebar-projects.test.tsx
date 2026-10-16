import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { render, screen, waitFor, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import type { ReactNode } from "react";

import { Toaster } from "@/components/ui/sonner";
import { requestOf } from "@/test/fetch";

import type { Sidebar, SidebarFolder, SidebarProject } from "./projects";
import { SidebarProjects } from "./sidebar-projects";

vi.mock("@tanstack/react-router", () => ({
  Link: ({
    params,
    children,
    className,
  }: {
    params: { projectId: string };
    children: ReactNode;
    className: string;
  }) => (
    <a href={`/projects/${params.projectId}`} className={className}>
      {children}
    </a>
  ),
}));

function project(id: number, name: string, overrides: Partial<SidebarProject> = {}) {
  return {
    kind: "project",
    id,
    name,
    color: "blue",
    icon: "list",
    folder_id: null,
    is_inbox: false,
    is_archived: false,
    open_count: 0,
    ...overrides,
  } satisfies SidebarProject;
}

const WORK = project(1, "Work", { open_count: 2, color: "violet", icon: "briefcase" });
const HEALTH = project(2, "Health", { folder_id: 10 });
const PERSONAL: SidebarFolder = {
  kind: "folder",
  id: 10,
  name: "Personal",
  collapsed: false,
  projects: [HEALTH],
};
const SIDEBAR: Sidebar = {
  inbox: project(99, "Inbox", { icon: "inbox", is_inbox: true }),
  items: [WORK, PERSONAL],
  tags: [],
  people: [],
  archived: [],
  today_count: 0,
  upcoming_count: 0,
  all_count: 0,
};

function json(body: unknown, status = 200) {
  return Promise.resolve(
    new Response(body === null ? null : JSON.stringify(body), {
      status,
      headers: { "Content-Type": "application/json" },
    }),
  );
}

function withoutDeletedProject(sidebar: Sidebar, request: Request): Sidebar {
  if (request.method !== "DELETE" || !request.url.includes("/projects/")) return sidebar;
  return { ...sidebar, items: sidebar.items.filter((item) => item !== WORK) };
}

/** A stand-in server: the sidebar for reads, and an echo of every write. */
function mockApi() {
  let sidebar = SIDEBAR;
  return vi.spyOn(globalThis, "fetch").mockImplementation(async (input) => {
    const request = requestOf(input);
    if (request.method === "GET") return json(sidebar);
    if (request.method === "PATCH" && request.url.includes("/folders/")) {
      const change = (await request.clone().json()) as Partial<SidebarFolder>;
      sidebar = { ...sidebar, items: [WORK, { ...PERSONAL, ...change }] };
      return json({ ...PERSONAL, ...change });
    }
    if (request.method === "DELETE" || request.url.endsWith("/move")) {
      sidebar = withoutDeletedProject(sidebar, request);
      return json(null, 204);
    }
    if (/\/(archive|restore)$/.test(request.url)) {
      return json({ ...WORK, is_archived: request.url.endsWith("/archive") });
    }
    const body = (await request.clone().json()) as object;
    return json({ ...WORK, id: 50, ...body }, request.method === "POST" ? 201 : 200);
  });
}

async function writes(fetchSpy: ReturnType<typeof mockApi>) {
  const requests = fetchSpy.mock.calls
    .map(([input]) => requestOf(input))
    .filter((request) => request.method !== "GET");
  return Promise.all(
    requests.map(async (request) => {
      const text = await request.text();
      const body = text ? (JSON.parse(text) as unknown) : null;
      return [`${request.method} ${new URL(request.url).pathname}`, body];
    }),
  );
}

function renderSidebar() {
  render(
    <QueryClientProvider client={new QueryClient()}>
      <SidebarProjects />
      <Toaster />
    </QueryClientProvider>,
  );
  return userEvent.setup();
}

describe("SidebarProjects", () => {
  it("lists Folders and Projects in the server's order, with open counts", async () => {
    mockApi();
    renderSidebar();

    expect(await screen.findByRole("link", { name: "Work, 2 open" })).toHaveAttribute(
      "href",
      "/projects/1",
    );
    const section = screen.getByRole("region", { name: "Projects" });
    expect(
      within(section)
        .getAllByRole("listitem")
        .map((item) => item.textContent),
    ).toEqual(["Work2, 2 open", "Personal", "Health"]);
  });

  it("collapses a Folder, hiding its Projects straight away", async () => {
    const fetchSpy = mockApi();
    const user = renderSidebar();

    await user.click(await screen.findByRole("button", { name: "Personal", expanded: true }));

    await waitFor(() => {
      expect(screen.queryByRole("link", { name: "Health" })).not.toBeInTheDocument();
    });
    await waitFor(async () => {
      expect(await writes(fetchSpy)).toEqual([["PATCH /api/v1/folders/10", { collapsed: true }]]);
    });
  });

  it("creates a Project with the chosen name, colour and icon", async () => {
    const fetchSpy = mockApi();
    const user = renderSidebar();

    await user.click(await screen.findByRole("button", { name: "Add a project or folder" }));
    await user.click(screen.getByRole("menuitem", { name: "New project" }));
    const dialog = screen.getByRole("dialog", { name: "New project" });
    await user.type(within(dialog).getByLabelText("Name"), "Garden");
    await user.click(within(dialog).getByRole("radio", { name: "Green" }));
    await user.click(within(dialog).getByRole("radio", { name: "leaf" }));
    await user.click(within(dialog).getByRole("button", { name: "Create project" }));

    await waitFor(() => {
      expect(screen.queryByRole("dialog")).not.toBeInTheDocument();
    });
    expect(await writes(fetchSpy)).toEqual([
      ["POST /api/v1/projects", { name: "Garden", icon: "leaf", color: "green", folder_id: null }],
    ]);
  });

  it("edits a Project from its menu", async () => {
    const fetchSpy = mockApi();
    const user = renderSidebar();

    await user.click(await screen.findByRole("button", { name: "Work options" }));
    await user.click(screen.getByRole("menuitem", { name: "Edit" }));
    const name = within(screen.getByRole("dialog", { name: "Edit project" })).getByLabelText(
      "Name",
    );
    await user.clear(name);
    await user.type(name, "Job{Enter}");

    await waitFor(async () => {
      expect(await writes(fetchSpy)).toEqual([
        ["PATCH /api/v1/projects/1", { name: "Job", icon: "briefcase", color: "violet" }],
      ]);
    });
  });

  it("files a Project last in a Folder from its menu", async () => {
    const fetchSpy = mockApi();
    const user = renderSidebar();

    await user.click(await screen.findByRole("button", { name: "Work options" }));
    await user.click(screen.getByRole("menuitem", { name: "Move to folder" }));
    await user.keyboard("{ArrowRight}{ArrowDown}");
    expect(await screen.findByRole("menuitem", { name: "Personal" })).toHaveFocus();
    await user.keyboard("{Enter}");

    await waitFor(async () => {
      expect(await writes(fetchSpy)).toEqual([
        ["POST /api/v1/projects/1/move", { folder_id: 10, after: { kind: "project", id: 2 } }],
      ]);
    });
  });

  it("archives a Project from its menu", async () => {
    const fetchSpy = mockApi();
    const user = renderSidebar();

    await user.click(await screen.findByRole("button", { name: "Work options" }));
    await user.click(screen.getByRole("menuitem", { name: "Archive" }));

    await waitFor(async () => {
      expect(await writes(fetchSpy)).toEqual([["POST /api/v1/projects/1/archive", null]]);
    });
  });

  it("moves a Project to Trash after a confirm, and hides it straight away", async () => {
    const fetchSpy = mockApi();
    const user = renderSidebar();

    await user.click(await screen.findByRole("button", { name: "Work options" }));
    await user.click(screen.getByRole("menuitem", { name: "Delete" }));
    const dialog = screen.getByRole("dialog", { name: "Delete “Work”?" });
    expect(await writes(fetchSpy)).toEqual([]);
    await user.click(within(dialog).getByRole("button", { name: "Delete" }));

    await waitFor(async () => {
      expect(screen.queryByRole("link", { name: "Work, 2 open" })).not.toBeInTheDocument();
      expect(await writes(fetchSpy)).toEqual([["DELETE /api/v1/projects/1", null]]);
    });
  });

  it("offers to undo a Project's delete", async () => {
    const fetchSpy = mockApi();
    const user = renderSidebar();

    await user.click(await screen.findByRole("button", { name: "Work options" }));
    await user.click(screen.getByRole("menuitem", { name: "Delete" }));
    await user.click(screen.getByRole("button", { name: "Delete" }));
    await screen.findByText("Moved “Work” to Trash");
    await user.click(screen.getByRole("button", { name: "Undo" }));

    await waitFor(async () => {
      expect(await writes(fetchSpy)).toEqual([
        ["DELETE /api/v1/projects/1", null],
        ["POST /api/v1/projects/1/restore", null],
      ]);
    });
  });

  it("keeps a Project when its delete is cancelled", async () => {
    const fetchSpy = mockApi();
    const user = renderSidebar();

    await user.click(await screen.findByRole("button", { name: "Work options" }));
    await user.click(screen.getByRole("menuitem", { name: "Delete" }));
    await user.click(screen.getByRole("button", { name: "Cancel" }));

    expect(screen.queryByRole("dialog")).not.toBeInTheDocument();
    expect(screen.getByRole("link", { name: "Work, 2 open" })).toBeInTheDocument();
    expect(await writes(fetchSpy)).toEqual([]);
  });

  it("deletes a Folder from its menu", async () => {
    const fetchSpy = mockApi();
    const user = renderSidebar();

    await user.click(await screen.findByRole("button", { name: "Personal options" }));
    await user.click(screen.getByRole("menuitem", { name: "Delete folder" }));

    await waitFor(async () => {
      expect(await writes(fetchSpy)).toEqual([["DELETE /api/v1/folders/10", null]]);
    });
  });
});
