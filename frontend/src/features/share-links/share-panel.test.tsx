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

/** Fakes the Share link endpoints: POST adds the next link, stop takes it off the list. */
function mockServer(initial: ShareLink[]) {
  let links = initial;
  let nextId = 100;
  return vi.spyOn(globalThis, "fetch").mockImplementation((input) => {
    const request = requestOf(input);
    const stopped = /\/share-links\/(\d+)\/stop$/.exec(request.url);
    if (stopped) {
      links = links.filter(({ id }) => id !== Number(stopped[1]));
      return Promise.resolve(new Response(null, { status: 204 }));
    }
    if (request.method === "POST") {
      const created = link(nextId++);
      links = [...links, created];
      return json(created, 201);
    }
    return json(links);
  });
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

  it("creates a Share link and shows its address", async () => {
    const fetch = mockServer([]);
    const user = renderPanel();

    await user.click(await screen.findByRole("button", { name: "Create link" }));

    expect(await screen.findByRole("textbox", { name: "Share link address" })).toHaveValue(
      link(100).url,
    );
    const created = fetch.mock.calls.map(([input]) => requestOf(input)).find(isPost);
    expect(created?.url).toContain(`/api/v1/projects/${String(WORK.id)}/share-links`);
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

function isPost(request: Request) {
  return request.method === "POST";
}
