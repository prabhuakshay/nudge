import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";

import { sessionQuery } from "@/features/auth/session";
import { requestOf } from "@/test/fetch";

import { ShortcutSettings } from "./shortcut-settings";

const ada = {
  id: 1,
  email: "ada@example.com",
  full_name: "Ada Lovelace",
  time_zone: "Europe/London",
  single_key_shortcuts: true,
};

afterEach(() => {
  vi.restoreAllMocks();
});

describe("ShortcutSettings", () => {
  it("turns single-key shortcuts off for the user", async () => {
    const saved = { ...ada, single_key_shortcuts: false };
    const fetch = vi.spyOn(globalThis, "fetch").mockResolvedValue(
      new Response(JSON.stringify(saved), {
        headers: { "Content-Type": "application/json" },
      }),
    );
    const queryClient = new QueryClient({ defaultOptions: { mutations: { retry: false } } });
    queryClient.setQueryData(sessionQuery.queryKey, ada);
    render(
      <QueryClientProvider client={queryClient}>
        <ShortcutSettings singleKey />
      </QueryClientProvider>,
    );
    const user = userEvent.setup();

    const toggle = screen.getByRole("checkbox", { name: "Single-key shortcuts" });
    expect(toggle).toBeChecked();
    await user.click(toggle);

    const request = requestOf(fetch.mock.calls[0]?.[0]);
    expect(`${request.method} ${new URL(request.url).pathname}`).toBe("PUT /api/v1/auth/shortcuts");
    expect(await request.json()).toEqual({ single_key: false });
    expect(queryClient.getQueryData(sessionQuery.queryKey)).toEqual(saved);
  });

  it("lists every shortcut", () => {
    render(
      <QueryClientProvider client={new QueryClient()}>
        <ShortcutSettings singleKey />
      </QueryClientProvider>,
    );

    expect(screen.getByText("Go to Trash")).toBeInTheDocument();
    expect(screen.getByText("Set priority (none, P1–P4)")).toBeInTheDocument();
  });
});
