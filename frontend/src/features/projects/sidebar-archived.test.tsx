import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import type { ReactNode } from "react";

import { requestOf } from "@/test/fetch";
import type { Sidebar, SidebarProject } from "./projects";
import { SidebarArchived } from "./sidebar-archived";

vi.mock("@tanstack/react-router", () => ({
  Link: ({ params, children }: { params: { projectId: string }; children: ReactNode }) => (
    <a href={`/projects/${params.projectId}`}>{children}</a>
  ),
}));

const GARDEN: SidebarProject = {
  kind: "project",
  id: 3,
  name: "Garden",
  color: "green",
  icon: "leaf",
  folder_id: null,
  is_inbox: false,
  is_archived: true,
  open_count: 0,
};

function sidebar(archived: SidebarProject[]): Sidebar {
  return {
    inbox: { ...GARDEN, id: 99, name: "Inbox", icon: "inbox", is_inbox: true, is_archived: false },
    items: [],
    archived,
    tags: [],
    people: [],
    today_count: 0,
    upcoming_count: 0,
    all_count: 0,
  };
}

function mockApi(archived: SidebarProject[]) {
  return vi.spyOn(globalThis, "fetch").mockImplementation((input) => {
    const request = requestOf(input);
    const body = request.method === "GET" ? sidebar(archived) : { ...GARDEN, is_archived: false };
    return Promise.resolve(
      new Response(JSON.stringify(body), { headers: { "Content-Type": "application/json" } }),
    );
  });
}

function renderArchived() {
  render(
    <QueryClientProvider client={new QueryClient()}>
      <SidebarArchived />
    </QueryClientProvider>,
  );
  return userEvent.setup();
}

describe("SidebarArchived", () => {
  it("starts collapsed and lists archived Projects once expanded", async () => {
    mockApi([GARDEN]);
    const user = renderArchived();

    const toggle = await screen.findByRole("button", { name: "Archived", expanded: false });
    expect(screen.queryByRole("link", { name: "Garden" })).not.toBeInTheDocument();
    await user.click(toggle);

    expect(screen.getByRole("link", { name: "Garden" })).toHaveAttribute("href", "/projects/3");
  });

  it("unarchives a Project from its menu", async () => {
    const fetchSpy = mockApi([GARDEN]);
    const user = renderArchived();

    await user.click(await screen.findByRole("button", { name: "Archived" }));
    await user.click(screen.getByRole("button", { name: "Garden options" }));
    await user.click(screen.getByRole("menuitem", { name: "Unarchive" }));

    await waitFor(() => {
      const posts = fetchSpy.mock.calls
        .map(([input]) => requestOf(input))
        .filter((request) => request.method === "POST")
        .map((request) => new URL(request.url).pathname);
      expect(posts).toEqual(["/api/v1/projects/3/unarchive"]);
    });
  });

  it("moves an archived Project to Trash after a confirm", async () => {
    const fetchSpy = mockApi([GARDEN]);
    const user = renderArchived();

    await user.click(await screen.findByRole("button", { name: "Archived" }));
    await user.click(screen.getByRole("button", { name: "Garden options" }));
    await user.click(screen.getByRole("menuitem", { name: "Delete" }));
    await user.click(screen.getByRole("button", { name: "Delete" }));

    await waitFor(() => {
      const deletes = fetchSpy.mock.calls
        .map(([input]) => requestOf(input))
        .filter((request) => request.method === "DELETE")
        .map((request) => new URL(request.url).pathname);
      expect(deletes).toEqual(["/api/v1/projects/3"]);
    });
  });

  it("shows nothing while no Project is archived", async () => {
    const fetchSpy = mockApi([]);
    renderArchived();

    await waitFor(() => {
      expect(fetchSpy).toHaveBeenCalled();
    });
    expect(screen.queryByRole("button", { name: /Archived/ })).not.toBeInTheDocument();
  });
});
