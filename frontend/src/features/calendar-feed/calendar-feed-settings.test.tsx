import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";

import { CalendarFeedSettings } from "./calendar-feed-settings";

const FIRST = "https://nudge.example.com/api/v1/calendar/first.ics";
const SECOND = "https://nudge.example.com/api/v1/calendar/second.ics";

function json(body: unknown) {
  return new Response(JSON.stringify(body), { headers: { "Content-Type": "application/json" } });
}

/** Fakes the feed endpoints: each POST hands out the next address, DELETE clears it. */
function mockServer(initial: string | null, failWrites = false) {
  let url = initial;
  const addresses = [FIRST, SECOND];
  return vi.spyOn(globalThis, "fetch").mockImplementation((input) => {
    const request = input as Request; // The API client always passes a Request.
    if (request.method === "GET") return Promise.resolve(json({ url }));
    if (failWrites) return Promise.resolve(new Response(null, { status: 500 }));
    if (request.method === "POST") {
      url = addresses.shift() ?? null;
      return Promise.resolve(json({ url }));
    }
    url = null;
    return Promise.resolve(new Response(null, { status: 204 }));
  });
}

function renderSettings() {
  const queryClient = new QueryClient({ defaultOptions: { mutations: { retry: false } } });
  render(
    <QueryClientProvider client={queryClient}>
      <CalendarFeedSettings />
    </QueryClientProvider>,
  );
  return userEvent.setup();
}

describe("CalendarFeedSettings", () => {
  it("turns the feed on and shows its address", async () => {
    mockServer(null);
    const user = renderSettings();

    await user.click(await screen.findByRole("button", { name: "Turn on" }));

    expect(await screen.findByRole("textbox", { name: "Feed address" })).toHaveValue(FIRST);
  });

  it("copies the address", async () => {
    mockServer(FIRST);
    const user = renderSettings();
    const writeText = vi.spyOn(navigator.clipboard, "writeText").mockResolvedValue();

    await user.click(await screen.findByRole("button", { name: "Copy link" }));

    expect(writeText).toHaveBeenCalledWith(FIRST);
    expect(await screen.findByRole("status")).toHaveTextContent("Copied");
  });

  it("resets the link to a new address", async () => {
    mockServer(SECOND);
    const user = renderSettings();

    await user.click(await screen.findByRole("button", { name: "Reset link" }));

    expect(await screen.findByDisplayValue(FIRST)).toBeInTheDocument();
  });

  it("turns the feed off", async () => {
    const fetch = mockServer(FIRST);
    const user = renderSettings();

    await user.click(await screen.findByRole("button", { name: "Turn off" }));

    expect(await screen.findByRole("button", { name: "Turn on" })).toBeInTheDocument();
    const methods = fetch.mock.calls.map(([input]) => (input as Request).method);
    expect(methods).toContain("DELETE");
  });

  it("says so when a change fails", async () => {
    mockServer(null, true);
    const user = renderSettings();

    await user.click(await screen.findByRole("button", { name: "Turn on" }));

    expect(await screen.findByRole("alert")).toHaveTextContent("Couldn't change");
  });
});
