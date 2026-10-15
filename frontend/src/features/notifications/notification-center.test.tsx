import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { render, screen, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";

import { NotificationCenter } from "./notification-center";
import type { Notification } from "./notifications";

const push = vi.fn();
vi.mock("@tanstack/react-router", () => ({ useRouter: () => ({ history: { push } }) }));

function notification(overrides: Partial<Notification>): Notification {
  return {
    id: 1,
    title: "Pay rent",
    body: "Due today",
    url: "/inbox",
    is_reminder: false,
    created_at: new Date().toISOString(),
    read_at: null,
    ...overrides,
  };
}

function mockApi(items: Notification[]) {
  return vi.spyOn(globalThis, "fetch").mockImplementation((input) => {
    const request = input as Request;
    if (request.method === "GET") {
      const unread = items.filter((item) => item.read_at === null).length;
      return Promise.resolve(
        new Response(JSON.stringify({ items, unread_count: unread }), {
          headers: { "Content-Type": "application/json" },
        }),
      );
    }
    return Promise.resolve(new Response(null, { status: 204 }));
  });
}

function sent(fetchSpy: ReturnType<typeof mockApi>) {
  return fetchSpy.mock.calls
    .map(([input]) => input as Request)
    .filter((request) => request.method !== "GET")
    .map((request) => `${request.method} ${new URL(request.url).pathname}`);
}

async function openCenter() {
  render(
    <QueryClientProvider client={new QueryClient()}>
      <NotificationCenter />
    </QueryClientProvider>,
  );
  const user = userEvent.setup();
  await user.click(await screen.findByRole("button", { name: /^Notifications/ }));
  return user;
}

describe("NotificationCenter", () => {
  it("counts unread notifications on the bell", async () => {
    mockApi([notification({ id: 1 }), notification({ id: 2, read_at: new Date().toISOString() })]);
    render(
      <QueryClientProvider client={new QueryClient()}>
        <NotificationCenter />
      </QueryClientProvider>,
    );

    expect(
      await screen.findByRole("button", { name: "Notifications, 1 unread" }),
    ).toBeInTheDocument();
  });

  it("lists notifications, newest first as the server sends them", async () => {
    mockApi([notification({ id: 2, title: "Call mum" }), notification({ id: 1 })]);

    await openCenter();

    const dialog = await screen.findByRole("dialog", { name: "Notifications" });
    const titles = within(dialog)
      .getAllByRole("listitem")
      .map((item) => item.querySelector("span span")?.textContent);
    expect(titles).toEqual(["Call mum (unread)", "Pay rent (unread)"]);
  });

  it("says when there is nothing to show", async () => {
    mockApi([]);

    await openCenter();

    expect(await screen.findByText("You're all caught up.")).toBeInTheDocument();
  });

  it("marks a notification read and opens its page when clicked", async () => {
    const fetchSpy = mockApi([notification({ id: 7 })]);
    const user = await openCenter();

    await user.click(await screen.findByRole("button", { name: /^Pay rent/ }));

    expect(sent(fetchSpy)).toEqual(["POST /api/v1/notifications/7/read"]);
    expect(push).toHaveBeenCalledWith("/inbox");
    expect(screen.queryByRole("dialog")).not.toBeInTheDocument();
  });

  it("marks everything read", async () => {
    const fetchSpy = mockApi([notification({ id: 1 })]);
    const user = await openCenter();

    await user.click(await screen.findByRole("button", { name: "Mark all as read" }));

    expect(sent(fetchSpy)).toEqual(["POST /api/v1/notifications/read-all"]);
  });

  it("dismisses a notification", async () => {
    const fetchSpy = mockApi([notification({ id: 3 })]);
    const user = await openCenter();

    await user.click(await screen.findByRole("button", { name: "Dismiss Pay rent" }));

    expect(sent(fetchSpy)).toEqual(["DELETE /api/v1/notifications/3"]);
  });
});
