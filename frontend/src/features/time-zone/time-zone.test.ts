import { QueryClient } from "@tanstack/react-query";

import { sessionQuery } from "@/features/auth/session";
import { requestOf } from "@/test/fetch";

import { adoptBrowserTimeZone } from "./time-zone";

const ada = {
  id: 1,
  email: "ada@example.com",
  full_name: "Ada Lovelace",
  time_zone: "",
  single_key_shortcuts: true,
  projects_collapsed: true,
  tags_collapsed: true,
  people_collapsed: true,
};

function useBrowserTimeZone(timeZone: string) {
  const real = new Intl.DateTimeFormat().resolvedOptions();
  vi.spyOn(Intl.DateTimeFormat.prototype, "resolvedOptions").mockReturnValue({ ...real, timeZone });
}

function mockFetch(status: number, body: unknown) {
  return vi.spyOn(globalThis, "fetch").mockResolvedValue(
    new Response(JSON.stringify(body), {
      status,
      headers: { "Content-Type": "application/json" },
    }),
  );
}

afterEach(() => {
  vi.restoreAllMocks();
});

describe("adoptBrowserTimeZone", () => {
  it("saves the browser's zone for a user who has none and caches the result", async () => {
    useBrowserTimeZone("Asia/Kolkata");
    const saved = { ...ada, time_zone: "Asia/Kolkata" };
    const fetch = mockFetch(200, saved);
    const queryClient = new QueryClient();

    const user = await adoptBrowserTimeZone(queryClient, ada);

    expect(user).toEqual(saved);
    expect(queryClient.getQueryData(sessionQuery.queryKey)).toEqual(saved);
    const request = requestOf(fetch.mock.calls[0]?.[0]);
    expect(request.method).toBe("PUT");
    expect(request.url).toMatch(/\/api\/v1\/auth\/time-zone$/);
    expect(await request.json()).toEqual({ time_zone: "Asia/Kolkata" });
  });

  it("leaves a user who already has a zone alone", async () => {
    useBrowserTimeZone("Asia/Kolkata");
    const fetch = vi.spyOn(globalThis, "fetch");
    const london = { ...ada, time_zone: "Europe/London" };

    const user = await adoptBrowserTimeZone(new QueryClient(), london);

    expect(user).toBe(london);
    expect(fetch).not.toHaveBeenCalled();
  });

  it("keeps the user without a zone when the server refuses the browser's", async () => {
    useBrowserTimeZone("Etc/Unknown");
    mockFetch(422, { detail: [] });

    const user = await adoptBrowserTimeZone(new QueryClient(), ada);

    expect(user).toBe(ada);
  });
});
