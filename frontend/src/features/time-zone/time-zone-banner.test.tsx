import { QueryClient, QueryClientProvider, useQuery } from "@tanstack/react-query";
import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";

import { sessionQuery, type User } from "@/features/auth/session";

import { TimeZoneBanner } from "./time-zone-banner";

const ada = {
  id: 1,
  email: "ada@example.com",
  full_name: "Ada Lovelace",
  time_zone: "Asia/Kolkata",
};

function useBrowserTimeZone(timeZone: string) {
  const real = new Intl.DateTimeFormat().resolvedOptions();
  vi.spyOn(Intl.DateTimeFormat.prototype, "resolvedOptions").mockReturnValue({ ...real, timeZone });
}

/** Renders the banner for the cached user, as the app shell does. */
function Shell() {
  const { data: user } = useQuery(sessionQuery);
  return user ? <TimeZoneBanner user={user} /> : null;
}

function renderBanner(user: User = ada) {
  const queryClient = new QueryClient({ defaultOptions: { mutations: { retry: false } } });
  queryClient.setQueryData(sessionQuery.queryKey, user);
  return render(
    <QueryClientProvider client={queryClient}>
      <Shell />
    </QueryClientProvider>,
  );
}

afterEach(() => {
  vi.restoreAllMocks();
  localStorage.clear();
});

describe("TimeZoneBanner", () => {
  it("stays hidden while the browser is in the user's zone", () => {
    useBrowserTimeZone("Asia/Kolkata");
    renderBanner();

    expect(screen.queryByRole("region", { name: "Time zone" })).not.toBeInTheDocument();
  });

  it("offers to switch when the browser is in another zone", () => {
    useBrowserTimeZone("Europe/London");
    renderBanner();

    const banner = screen.getByRole("region", { name: "Time zone" });
    expect(banner).toHaveTextContent("Switch to Europe/London?");
    expect(banner).toHaveTextContent("Asia/Kolkata");
  });

  it("switches the user's zone when accepted", async () => {
    useBrowserTimeZone("Europe/London");
    const fetch = vi.spyOn(globalThis, "fetch").mockResolvedValue(
      new Response(JSON.stringify({ ...ada, time_zone: "Europe/London" }), {
        status: 200,
        headers: { "Content-Type": "application/json" },
      }),
    );
    renderBanner();

    await userEvent.setup().click(screen.getByRole("button", { name: "Switch" }));

    expect(screen.queryByRole("region", { name: "Time zone" })).not.toBeInTheDocument();
    const request = fetch.mock.calls[0]?.[0] as Request; // The API client always passes a Request.
    expect(request.method).toBe("PUT");
    expect(await request.json()).toEqual({ time_zone: "Europe/London" });
  });

  it("keeps the user's zone when dismissed, and stays dismissed for that zone", async () => {
    useBrowserTimeZone("Europe/London");
    const fetch = vi.spyOn(globalThis, "fetch");
    const { unmount } = renderBanner();

    await userEvent.setup().click(screen.getByRole("button", { name: "Dismiss" }));

    expect(screen.queryByRole("region", { name: "Time zone" })).not.toBeInTheDocument();
    expect(fetch).not.toHaveBeenCalled();
    unmount();
    renderBanner();
    expect(screen.queryByRole("region", { name: "Time zone" })).not.toBeInTheDocument();
  });

  it("offers again when the browser moves to yet another zone", async () => {
    useBrowserTimeZone("Europe/London");
    const { unmount } = renderBanner();
    await userEvent.setup().click(screen.getByRole("button", { name: "Dismiss" }));
    unmount();

    useBrowserTimeZone("America/New_York");
    renderBanner();

    expect(screen.getByRole("region", { name: "Time zone" })).toHaveTextContent(
      "Switch to America/New_York?",
    );
  });

  it("says so when switching fails", async () => {
    useBrowserTimeZone("Europe/London");
    vi.spyOn(globalThis, "fetch").mockResolvedValue(new Response(null, { status: 500 }));
    renderBanner();

    await userEvent.setup().click(screen.getByRole("button", { name: "Switch" }));

    expect(await screen.findByRole("alert")).toHaveTextContent("Couldn't switch");
  });
});
