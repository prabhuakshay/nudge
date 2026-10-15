import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";

import { requestOf } from "@/test/fetch";
import { NotificationSettings } from "./notification-settings";
import type * as push from "./push";
import { disablePush, enablePush, PushError, type PushStatus } from "./push";

let status: PushStatus = "off";

vi.mock("./push", async (importOriginal) => {
  const actual = await importOriginal<typeof push>();
  return {
    ...actual,
    pushStatusQuery: { queryKey: ["push-status"], queryFn: () => Promise.resolve(status) },
    enablePush: vi.fn(),
    disablePush: vi.fn(),
  };
});

function renderSettings(pushStatus: PushStatus) {
  status = pushStatus;
  render(
    <QueryClientProvider
      client={new QueryClient({ defaultOptions: { mutations: { retry: false } } })}
    >
      <NotificationSettings />
    </QueryClientProvider>,
  );
  return userEvent.setup();
}

describe("NotificationSettings", () => {
  it("turns push on", async () => {
    vi.mocked(enablePush).mockImplementation(() => {
      status = "on";
      return Promise.resolve();
    });
    const user = renderSettings("off");

    await user.click(await screen.findByRole("button", { name: "Turn on" }));

    expect(enablePush).toHaveBeenCalledOnce();
    expect(await screen.findByRole("button", { name: "Turn off" })).toBeInTheDocument();
  });

  it("turns push off", async () => {
    vi.mocked(disablePush).mockResolvedValue();
    const user = renderSettings("on");

    await user.click(await screen.findByRole("button", { name: "Turn off" }));

    expect(disablePush).toHaveBeenCalledOnce();
  });

  it("shows why push couldn't be turned on", async () => {
    vi.mocked(enablePush).mockRejectedValue(new PushError("Allow notifications first."));
    const user = renderSettings("off");

    await user.click(await screen.findByRole("button", { name: "Turn on" }));

    expect(await screen.findByRole("alert")).toHaveTextContent("Allow notifications first.");
  });

  it.each([
    ["unsupported", "add Nudge to your Home Screen"],
    ["unavailable", "aren't set up on this server"],
    ["blocked", "blocked for this site"],
  ] as const)("explains why push is %s", async (pushStatus, explanation) => {
    renderSettings(pushStatus);

    expect(await screen.findByText(new RegExp(explanation))).toBeInTheDocument();
    expect(screen.queryByRole("button", { name: /Turn/ })).not.toBeInTheDocument();
  });

  it("sends a test notification", async () => {
    const fetchSpy = vi
      .spyOn(globalThis, "fetch")
      .mockResolvedValue(new Response(JSON.stringify({}), { status: 201 }));
    const user = renderSettings("on");

    await user.click(screen.getByRole("button", { name: "Send" }));

    expect(await screen.findByRole("status")).toHaveTextContent("Sent");
    const request = requestOf(fetchSpy.mock.calls[0]?.[0]);
    expect(new URL(request.url).pathname).toBe("/api/v1/notifications/test");
  });

  it("says when the test couldn't be sent", async () => {
    vi.spyOn(globalThis, "fetch").mockResolvedValue(new Response(null, { status: 500 }));
    const user = renderSettings("on");

    await user.click(screen.getByRole("button", { name: "Send" }));

    expect(await screen.findByRole("alert")).toHaveTextContent("Couldn't send");
  });
});
