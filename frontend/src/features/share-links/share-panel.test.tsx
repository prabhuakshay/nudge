import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { render, screen, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";

import { json, WORK } from "@/test/drawer";
import { requestOf } from "@/test/fetch";
import type { ShareLink } from "./share-links";
import { SharePanel } from "./share-panel";

function link(id: number): ShareLink {
  return {
    id,
    project_id: WORK.id,
    url: `https://nudge.example.com/share/key-${String(id)}`,
    created_at: "2026-11-02T09:30:00Z",
    expires_at: "2026-11-09T09:30:00Z",
    range_days: 14,
    last_opened_at: null,
  };
}

const NOW = Date.parse("2026-11-02T09:30:00Z");

type Settings = {
  expires_in_days?: number | null;
  range_days?: number | null;
};

/** Applies settings as the server would, counting a new expiry from NOW. */
function applied(target: ShareLink, settings: Settings): ShareLink {
  const { expires_in_days: days, range_days } = settings;
  return {
    ...target,
    ...(days !== undefined && {
      expires_at: days === null ? null : new Date(NOW + days * 86_400_000).toISOString(),
    }),
    ...(range_days !== undefined && { range_days }),
  };
}

/**
 * Fakes the Share link endpoints: POST adds the next link with its settings, PATCH changes one,
 * stop takes one off the list. Returns the bodies the panel sent.
 */
function mockServer(initial: ShareLink[]) {
  let links = initial;
  let nextId = 100;
  const sent: { method: string; url: string; body: Settings }[] = [];
  vi.spyOn(globalThis, "fetch").mockImplementation(async (input) => {
    const request = requestOf(input);
    const stopped = /\/share-links\/(\d+)\/stop$/.exec(request.url);
    if (stopped) {
      links = links.filter(({ id }) => id !== Number(stopped[1]));
      return new Response(null, { status: 204 });
    }
    if (request.method === "GET") return json(links);
    const body = (await request.json()) as Settings;
    sent.push({ method: request.method, url: request.url, body });
    if (request.method === "POST") {
      const created = applied(link(nextId++), body);
      links = [...links, created];
      return json(created, 201);
    }
    const changed = /\/share-links\/(\d+)$/.exec(request.url);
    links = links.map((each) => (each.id === Number(changed?.[1]) ? applied(each, body) : each));
    return json(links.find(({ id }) => id === Number(changed?.[1])));
  });
  return sent;
}

function renderPanel() {
  const queryClient = new QueryClient({ defaultOptions: { mutations: { retry: false } } });
  render(
    <QueryClientProvider client={queryClient}>
      <SharePanel project={WORK} open onOpenChange={() => undefined} />
    </QueryClientProvider>,
  );
  return userEvent.setup();
}

describe("SharePanel", () => {
  it("lists the Project's Share links", async () => {
    mockServer([link(1), link(2)]);
    renderPanel();

    const addresses = await screen.findAllByRole("textbox", { name: "Share link address" });

    expect(addresses[0]).toHaveValue(link(1).url);
    expect(addresses[1]).toHaveValue(link(2).url);
  });

  it("creates a Share link with the default settings and shows its address", async () => {
    const sent = mockServer([]);
    const user = renderPanel();

    await user.click(await screen.findByRole("button", { name: "Create link" }));

    expect(await screen.findByRole("textbox", { name: "Share link address" })).toHaveValue(
      link(100).url,
    );
    expect(sent).toEqual([
      {
        method: "POST",
        url: expect.stringContaining(`/api/v1/projects/${String(WORK.id)}/share-links`) as string,
        body: { expires_in_days: 7, range_days: 14 },
      },
    ]);
  });

  it("creates a Share link with chosen settings", async () => {
    const sent = mockServer([]);
    const user = renderPanel();

    await user.selectOptions(await screen.findByRole("combobox", { name: "Expires" }), "Custom");
    await user.type(screen.getByRole("spinbutton", { name: "Days until it expires" }), "45");
    await user.selectOptions(screen.getByRole("combobox", { name: "History" }), "All");
    await user.click(screen.getByRole("button", { name: "Create link" }));

    expect(await screen.findByRole("listitem")).toHaveTextContent("Shows all history");
    expect(sent[0]?.body).toEqual({ expires_in_days: 45, range_days: null });
  });

  it("shows when each link expires and was last opened", async () => {
    mockServer([link(1), { ...link(2), expires_at: null, last_opened_at: "2026-11-03T18:00:00Z" }]);
    renderPanel();

    const [first, second] = await screen.findAllByRole("listitem");

    expect(first).toHaveTextContent("Expires 9 Nov 2026");
    expect(first).toHaveTextContent("Never opened");
    expect(first).toHaveTextContent("Shows 14 days");
    expect(second).toHaveTextContent("Never expires");
    expect(second).toHaveTextContent("Last opened 3 Nov 2026");
  });

  it("changes a link's expiry", async () => {
    const sent = mockServer([link(1)]);
    const user = renderPanel();
    const item = await screen.findByRole("listitem");

    await user.click(within(item).getByRole("button", { name: "Edit" }));
    await user.selectOptions(within(item).getByRole("combobox", { name: "Expires" }), "30 days");
    await user.click(within(item).getByRole("button", { name: "Save" }));

    expect(await within(item).findByText(/Expires 2 Dec 2026/)).toBeInTheDocument();
    expect(sent).toEqual([
      {
        method: "PATCH",
        url: expect.stringContaining("/api/v1/share-links/1") as string,
        body: { expires_in_days: 30 },
      },
    ]);
  });

  it("changes a link's history range and keeps its expiry", async () => {
    const sent = mockServer([link(1)]);
    const user = renderPanel();
    const item = await screen.findByRole("listitem");

    await user.click(within(item).getByRole("button", { name: "Edit" }));
    await user.selectOptions(within(item).getByRole("combobox", { name: "History" }), "30 days");
    await user.click(within(item).getByRole("button", { name: "Save" }));

    expect(await within(item).findByText(/Shows 30 days/)).toBeInTheDocument();
    expect(within(item).getByText(/Expires 9 Nov 2026/)).toBeInTheDocument();
    expect(sent[0]?.body).toEqual({ range_days: 30 });
  });

  it("copies a link's address", async () => {
    mockServer([link(1)]);
    const user = renderPanel();
    const writeText = vi.spyOn(navigator.clipboard, "writeText").mockResolvedValue();

    await user.click(await screen.findByRole("button", { name: "Copy link" }));

    expect(writeText).toHaveBeenCalledWith(link(1).url);
    expect(await screen.findByRole("status")).toHaveTextContent("Copied");
  });

  it("stops sharing a link", async () => {
    mockServer([link(1), link(2)]);
    const user = renderPanel();
    const [first] = await screen.findAllByRole("listitem");
    if (!first) throw new Error("The panel lists no Share links.");

    await user.click(within(first).getByRole("button", { name: "Stop sharing" }));

    expect(await screen.findByRole("textbox", { name: "Share link address" })).toHaveValue(
      link(2).url,
    );
  });

  it("says so when there are no links yet", async () => {
    mockServer([]);
    renderPanel();

    expect(await screen.findByText(/not shared/i)).toBeInTheDocument();
  });
});
