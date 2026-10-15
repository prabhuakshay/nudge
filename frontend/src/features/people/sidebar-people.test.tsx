import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { render, screen, waitFor, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import type { ReactNode } from "react";

import type { Person } from "./people";
import { SidebarPeople } from "./sidebar-people";

vi.mock("@tanstack/react-router", () => ({
  Link: ({
    params,
    children,
    className,
  }: {
    params: { personId: string };
    children: ReactNode;
    className: string;
  }) => (
    <a href={`/people/${params.personId}`} className={className}>
      {children}
    </a>
  ),
}));

const AL: Person = { id: 1, name: "Al", color: "teal" };
const ALICE: Person = { id: 2, name: "Alice", color: "violet" };

function json(body: unknown, status = 200) {
  return Promise.resolve(
    new Response(body === null ? null : JSON.stringify(body), {
      status,
      headers: { "Content-Type": "application/json" },
    }),
  );
}

/** A stand-in server: the sidebar with the People for reads, and an echo of every write. */
function mockApi(people: Person[] = [AL, ALICE]) {
  return vi.spyOn(globalThis, "fetch").mockImplementation(async (input) => {
    const request = input as Request;
    if (request.method === "GET") return json({ people });
    if (request.method === "DELETE") return json(null, 204);
    const body = (await request.clone().json()) as object;
    return json({ ...AL, id: 50, ...body }, request.method === "POST" ? 201 : 200);
  });
}

async function writes(fetchSpy: ReturnType<typeof mockApi>) {
  const requests = fetchSpy.mock.calls
    .map(([input]) => input as Request)
    .filter((request) => request.method !== "GET");
  return Promise.all(
    requests.map(async (request) => [
      `${request.method} ${new URL(request.url).pathname}`,
      request.method === "DELETE" ? null : ((await request.json()) as unknown),
    ]),
  );
}

function renderPeople() {
  render(
    <QueryClientProvider client={new QueryClient()}>
      <SidebarPeople />
    </QueryClientProvider>,
  );
  return userEvent.setup();
}

describe("SidebarPeople", () => {
  it("lists People in the server's A to Z order, each a link to their view", async () => {
    mockApi();
    renderPeople();

    const links = await screen.findAllByRole("link");

    expect(links).toHaveLength(2);
    expect(links[0]).toHaveAccessibleName("Al");
    expect(links[0]).toHaveAttribute("href", "/people/1");
    expect(links[1]).toHaveAccessibleName("Alice");
    expect(links[1]).toHaveAttribute("href", "/people/2");
  });

  it("invites the user to add someone when there is nobody yet", async () => {
    mockApi([]);
    renderPeople();

    expect(await screen.findByText(/Mention people in tasks/)).toBeInTheDocument();
  });

  it("adds a Person from the section's + button", async () => {
    const fetchSpy = mockApi();
    const user = renderPeople();

    await user.click(await screen.findByRole("button", { name: "Add a person" }));
    const dialog = await screen.findByRole("dialog", { name: "New person" });
    await user.type(within(dialog).getByLabelText("Name"), "Priya");
    await user.click(within(dialog).getByRole("radio", { name: "Pink" }));
    await user.click(within(dialog).getByRole("button", { name: "Add person" }));

    await waitFor(() => {
      expect(screen.queryByRole("dialog")).not.toBeInTheDocument();
    });
    expect(await writes(fetchSpy)).toEqual([
      ["POST /api/v1/people", { name: "Priya", color: "pink" }],
    ]);
  });

  it("renames a Person from their menu", async () => {
    const fetchSpy = mockApi();
    const user = renderPeople();

    await user.click(await screen.findByRole("button", { name: "Al options" }));
    await user.click(await screen.findByRole("menuitem", { name: "Edit" }));
    const name = within(await screen.findByRole("dialog", { name: "Edit person" })).getByLabelText(
      "Name",
    );
    expect(name).toHaveValue("Al");
    await user.clear(name);
    await user.type(name, "Albert{Enter}");

    await waitFor(async () => {
      expect(await writes(fetchSpy)).toEqual([
        ["PATCH /api/v1/people/1", { name: "Albert", color: "teal" }],
      ]);
    });
  });

  it("merges a Person into another picked from the list", async () => {
    const fetchSpy = mockApi();
    const user = renderPeople();

    await user.click(await screen.findByRole("button", { name: "Al options" }));
    await user.click(await screen.findByRole("menuitem", { name: "Merge into…" }));
    const dialog = await screen.findByRole("dialog", { name: "Merge “Al” into…" });
    expect(within(dialog).queryByRole("radio", { name: "Al" })).not.toBeInTheDocument();
    await user.click(within(dialog).getByRole("radio", { name: "Alice" }));
    await user.click(within(dialog).getByRole("button", { name: "Merge" }));

    await waitFor(async () => {
      expect(await writes(fetchSpy)).toEqual([["POST /api/v1/people/1/merge", { into_id: 2 }]]);
    });
  });

  it("deletes a Person once the user confirms", async () => {
    const fetchSpy = mockApi();
    const user = renderPeople();

    await user.click(await screen.findByRole("button", { name: "Alice options" }));
    await user.click(await screen.findByRole("menuitem", { name: "Delete" }));
    const dialog = await screen.findByRole("dialog", { name: "Delete “Alice”?" });
    expect(dialog).toHaveTextContent("Mentions of Alice become plain text");
    await user.click(within(dialog).getByRole("button", { name: "Delete" }));

    await waitFor(async () => {
      expect(await writes(fetchSpy)).toEqual([["DELETE /api/v1/people/2", null]]);
    });
  });
});
