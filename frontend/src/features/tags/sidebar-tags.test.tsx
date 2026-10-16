import { QueryClientProvider } from "@tanstack/react-query";
import { render, screen, waitFor, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import type { ReactNode } from "react";

import { Toaster } from "@/components/ui/sonner";
import type { Sidebar } from "@/features/tasks/tasks";
import { INBOX } from "@/test/drawer";
import { requestOf } from "@/test/fetch";
import { signedInClient } from "@/test/session";

import { SidebarTags } from "./sidebar-tags";

vi.mock("@tanstack/react-router", () => ({
  Link: ({
    params,
    children,
    className,
  }: {
    params: { tagId: string };
    children: ReactNode;
    className: string;
  }) => (
    <a href={`/tags/${params.tagId}`} className={className}>
      {children}
    </a>
  ),
}));

const WORK_TAG = { id: 21, name: "work", color: "teal", open_count: 3, task_count: 5 } as const;
const HOME_TAG = { id: 22, name: "home", color: null, open_count: 0, task_count: 1 };
const SIDEBAR: Sidebar = {
  inbox: INBOX,
  items: [],
  archived: [],
  tags: [WORK_TAG, HOME_TAG],
  people: [],
  today_count: 0,
  upcoming_count: 0,
};

function json(body: unknown, status = 200) {
  return Promise.resolve(
    new Response(body === null ? null : JSON.stringify(body), {
      status,
      headers: { "Content-Type": "application/json" },
    }),
  );
}

/** A stand-in server: the sidebar for reads, and an echo of every write. */
function mockApi(sidebar: Sidebar = SIDEBAR) {
  return vi.spyOn(globalThis, "fetch").mockImplementation(async (input) => {
    const request = requestOf(input);
    if (request.method === "GET") return json(sidebar);
    if (request.method === "DELETE" || /\/(move|merge)$/.test(request.url)) return json(null, 204);
    const body = (await request.clone().json()) as object;
    return json({ id: 50, ...body }, request.method === "POST" ? 201 : 200);
  });
}

async function writes(fetchSpy: ReturnType<typeof mockApi>) {
  const requests = fetchSpy.mock.calls
    .map(([input]) => requestOf(input))
    .filter((request) => request.method !== "GET");
  return Promise.all(
    requests.map(async (request) => {
      const body = request.method === "DELETE" ? null : ((await request.json()) as unknown);
      return [`${request.method} ${new URL(request.url).pathname}`, body];
    }),
  );
}

function renderSidebar() {
  render(
    <QueryClientProvider client={signedInClient()}>
      <SidebarTags />
      <Toaster />
    </QueryClientProvider>,
  );
  return userEvent.setup();
}

describe("SidebarTags", () => {
  it("lists the Tags in the server's order, linking to each with its open count", async () => {
    mockApi();
    renderSidebar();

    expect(await screen.findByRole("link", { name: "work, 3 open" })).toHaveAttribute(
      "href",
      "/tags/21",
    );
    expect(screen.getByRole("link", { name: "home" })).toHaveAttribute("href", "/tags/22");
    const section = screen.getByRole("region", { name: "Tags" });
    expect(
      within(section)
        .getAllByRole("link")
        .map((link) => link.textContent),
    ).toEqual(["work3, 3 open", "home"]);
  });

  it("invites the user to add a Tag when there are none", async () => {
    mockApi({ ...SIDEBAR, tags: [] });
    renderSidebar();

    expect(await screen.findByText("Label tasks across projects.")).toBeInTheDocument();
    expect(screen.queryByRole("link")).toBeNull();
  });

  it("creates a grey Tag, refusing a name with a space", async () => {
    const fetchSpy = mockApi();
    const user = renderSidebar();

    await user.click(await screen.findByRole("button", { name: "Add a tag" }));
    const dialog = screen.getByRole("dialog", { name: "New tag" });
    await user.type(within(dialog).getByLabelText("Name"), "two words");
    expect(within(dialog).getByText("Tag names can't have spaces or #.")).toBeInTheDocument();
    await user.clear(within(dialog).getByLabelText("Name"));
    await user.type(within(dialog).getByLabelText("Name"), "errands");
    await user.click(within(dialog).getByRole("button", { name: "Create tag" }));

    await waitFor(async () => {
      expect(await writes(fetchSpy)).toEqual([
        ["POST /api/v1/tags", { name: "errands", color: null }],
      ]);
    });
  });

  it("renames and recolours a Tag", async () => {
    const fetchSpy = mockApi();
    const user = renderSidebar();

    await user.click(await screen.findByRole("button", { name: "home options" }));
    await user.click(screen.getByRole("menuitem", { name: "Edit" }));
    const dialog = screen.getByRole("dialog", { name: "Edit tag" });
    await user.clear(within(dialog).getByLabelText("Name"));
    await user.type(within(dialog).getByLabelText("Name"), "house");
    await user.click(within(dialog).getByRole("radio", { name: "Green" }));
    await user.click(within(dialog).getByRole("button", { name: "Save" }));

    await waitFor(async () => {
      expect(await writes(fetchSpy)).toEqual([
        ["PATCH /api/v1/tags/22", { name: "house", color: "green" }],
      ]);
    });
  });

  it("merges a Tag into another after a confirm that counts its Tasks", async () => {
    const fetchSpy = mockApi();
    const user = renderSidebar();

    await user.click(await screen.findByRole("button", { name: "work options" }));
    await user.click(screen.getByRole("menuitem", { name: "Merge into" }));
    await user.keyboard("{ArrowRight}");
    expect(await screen.findByRole("menuitem", { name: "home" })).toHaveFocus();
    await user.keyboard("{Enter}");
    const dialog = screen.getByRole("dialog", { name: "Merge #work?" });
    expect(dialog).toHaveTextContent("Its 5 tasks get #home, and #work is deleted.");
    await user.click(within(dialog).getByRole("button", { name: "Merge" }));

    expect(await screen.findByText("Merged #work into #home")).toBeInTheDocument();
    expect(await writes(fetchSpy)).toEqual([["POST /api/v1/tags/21/merge", { into_id: 22 }]]);
  });

  it("deletes a Tag after a confirm, and not when cancelled", async () => {
    const fetchSpy = mockApi();
    const user = renderSidebar();

    await user.click(await screen.findByRole("button", { name: "home options" }));
    await user.click(screen.getByRole("menuitem", { name: "Delete" }));
    await user.click(screen.getByRole("button", { name: "Cancel" }));
    expect(await writes(fetchSpy)).toEqual([]);

    await user.click(screen.getByRole("button", { name: "home options" }));
    await user.click(screen.getByRole("menuitem", { name: "Delete" }));
    const dialog = screen.getByRole("dialog", { name: "Delete #home?" });
    expect(dialog).toHaveTextContent("It comes off its 1 task.");
    await user.click(within(dialog).getByRole("button", { name: "Delete" }));

    expect(await screen.findByText("Deleted #home")).toBeInTheDocument();
    expect(await writes(fetchSpy)).toEqual([["DELETE /api/v1/tags/22", null]]);
  });
});
