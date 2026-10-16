import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";

import { sessionQuery } from "@/features/auth/session";
import { requestOf } from "@/test/fetch";

import { TimeZoneSettings } from "./time-zone-settings";

const ada = {
  id: 1,
  email: "ada@example.com",
  full_name: "Ada Lovelace",
  time_zone: "Asia/Kolkata",
  single_key_shortcuts: true,
  projects_collapsed: true,
  tags_collapsed: true,
  people_collapsed: true,
};

function renderSettings() {
  const queryClient = new QueryClient({ defaultOptions: { mutations: { retry: false } } });
  queryClient.setQueryData(sessionQuery.queryKey, ada);
  render(
    <QueryClientProvider client={queryClient}>
      <TimeZoneSettings timeZone={ada.time_zone} />
    </QueryClientProvider>,
  );
  return { queryClient, user: userEvent.setup() };
}

async function pick(user: ReturnType<typeof userEvent.setup>, timeZone: string) {
  await user.click(screen.getByRole("button", { name: "Change" }));
  const input = screen.getByRole("combobox", { name: "Time zone" });
  await user.clear(input);
  await user.type(input, timeZone);
  await user.click(screen.getByRole("button", { name: "Save" }));
}

afterEach(() => {
  vi.restoreAllMocks();
});

describe("TimeZoneSettings", () => {
  it("shows the user's zone", () => {
    renderSettings();

    expect(screen.getByText("Asia/Kolkata")).toBeInTheDocument();
  });

  it("offers every zone as a search suggestion", async () => {
    const { user } = renderSettings();

    await user.click(screen.getByRole("button", { name: "Change" }));

    const input = screen.getByRole<HTMLInputElement>("combobox", { name: "Time zone" });
    expect(input).toHaveValue("Asia/Kolkata");
    const options = Array.from(input.list?.options ?? [], (option) => option.value);
    expect(options).toContain("Europe/London");
    expect(options).toContain("America/New_York");
  });

  it("saves the picked zone and updates the signed-in user", async () => {
    const london = { ...ada, time_zone: "Europe/London" };
    const fetch = vi.spyOn(globalThis, "fetch").mockResolvedValue(
      new Response(JSON.stringify(london), {
        status: 200,
        headers: { "Content-Type": "application/json" },
      }),
    );
    const { queryClient, user } = renderSettings();

    await pick(user, "Europe/London");

    const request = requestOf(fetch.mock.calls[0]?.[0]);
    expect(await request.json()).toEqual({ time_zone: "Europe/London" });
    expect(queryClient.getQueryData(sessionQuery.queryKey)).toEqual(london);
    expect(screen.queryByRole("combobox")).not.toBeInTheDocument();
  });

  it("refuses a name that isn't a time zone without asking the server", async () => {
    const fetch = vi.spyOn(globalThis, "fetch");
    const { user } = renderSettings();

    await pick(user, "Atlantis");

    expect(screen.getByRole("alert")).toHaveTextContent("Pick a time zone from the list");
    expect(screen.getByRole("combobox", { name: "Time zone" })).toHaveAttribute(
      "aria-invalid",
      "true",
    );
    expect(fetch).not.toHaveBeenCalled();
  });

  it("says so when saving fails", async () => {
    vi.spyOn(globalThis, "fetch").mockResolvedValue(new Response(null, { status: 500 }));
    const { user } = renderSettings();

    await pick(user, "Europe/London");

    expect(await screen.findByRole("alert")).toHaveTextContent("Couldn't save");
  });

  it("cancels without saving", async () => {
    const fetch = vi.spyOn(globalThis, "fetch");
    const { user } = renderSettings();

    await user.click(screen.getByRole("button", { name: "Change" }));
    await user.click(screen.getByRole("button", { name: "Cancel" }));

    expect(screen.queryByRole("combobox")).not.toBeInTheDocument();
    expect(fetch).not.toHaveBeenCalled();
  });
});
