import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { render, screen, within } from "@testing-library/react";

import { json } from "@/test/drawer";
import { requestOf } from "@/test/fetch";
import type { ShareReport } from "./share-links";
import { ShareReportPage } from "./share-report-page";

const REPORT: ShareReport = {
  project: { name: "Launch", is_archived: false },
  as_of: "2026-11-02T15:00:00+05:30",
  sections: [
    {
      name: null,
      tasks: [
        { id: 1, title: "Write the brief" },
        { id: 2, title: "Book the venue" },
      ],
    },
  ],
};

function mockServer(answer: () => Promise<Response>) {
  return vi.spyOn(globalThis, "fetch").mockImplementation(answer);
}

function renderPage() {
  const queryClient = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  render(
    <QueryClientProvider client={queryClient}>
      <ShareReportPage shareKey="the-key" />
    </QueryClientProvider>,
  );
}

describe("ShareReportPage", () => {
  it("shows the Project's name, when the report is from and its open Tasks in order", async () => {
    const fetch = mockServer(() => json(REPORT));
    renderPage();

    expect(await screen.findByRole("heading", { level: 1, name: "Launch" })).toBeInTheDocument();
    expect(screen.getByText("As of 2 Nov 2026, 15:00")).toBeInTheDocument();
    const tasks = within(screen.getByRole("list")).getAllByRole("listitem");
    expect(tasks.map((task) => task.textContent)).toEqual(["Write the brief", "Book the venue"]);
    expect(requestOf(fetch.mock.calls[0]?.[0]).url).toContain("/api/v1/share/the-key");
  });

  it("says when the Project is archived", async () => {
    mockServer(() => json({ ...REPORT, project: { name: "Launch", is_archived: true } }));
    renderPage();

    expect(await screen.findByText("Archived")).toBeInTheDocument();
  });

  it("tells search engines not to index the page", async () => {
    mockServer(() => json(REPORT));
    renderPage();

    await screen.findByRole("heading", { level: 1 });
    expect(document.head.querySelector('meta[name="robots"]')).toHaveAttribute(
      "content",
      "noindex",
    );
  });

  it("says when the link is no longer active", async () => {
    mockServer(() => json({ detail: "This link is no longer active." }, 410));
    renderPage();

    expect(
      await screen.findByRole("heading", { name: "This link is no longer active" }),
    ).toBeInTheDocument();
    expect(screen.queryByText("Launch")).not.toBeInTheDocument();
  });

  it("says when the link doesn't exist", async () => {
    mockServer(() => json({ detail: "Share link not found." }, 404));
    renderPage();

    expect(
      await screen.findByRole("heading", { name: "This link doesn't exist" }),
    ).toBeInTheDocument();
  });
});
