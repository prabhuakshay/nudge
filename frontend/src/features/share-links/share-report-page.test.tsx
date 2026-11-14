import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { render, screen, within } from "@testing-library/react";

import { json } from "@/test/drawer";
import { requestOf } from "@/test/fetch";
import type { ShareReport } from "./share-links";
import { ShareReportPage } from "./share-report-page";

type ReportTask = ShareReport["sections"][number]["tasks"][number];

function reportTask(id: number, title: string, fields: Partial<ReportTask> = {}): ReportTask {
  return {
    id,
    title,
    status: "open",
    priority: 0,
    due_date: null,
    due_time: null,
    start_date: null,
    start_time: null,
    is_overdue: false,
    tags: [],
    description: "",
    blocked_reason: "",
    attachments: [],
    comments: [],
    subtasks: [],
    ...fields,
  };
}

const REPORT: ShareReport = {
  project: { name: "Launch", is_archived: false },
  summary: { completed: 1, total: 5, blocked: 1, overdue: 2 },
  sections: [
    {
      name: null,
      tasks: [
        reportTask(1, "Write the brief", {
          comments: [
            { id: 1, at: "2026-10-31T23:15:00-08:00", body: "Ask **Grace**" },
            { id: 2, at: "2026-11-01T18:45:00-08:00", body: "Draft is ready" },
          ],
        }),
      ],
    },
    {
      name: "Venue",
      tasks: [
        reportTask(2, "Book the venue", {
          status: "blocked",
          blocked_reason: "Waiting on Grace",
          priority: 1,
          due_date: "2026-11-01",
          is_overdue: true,
          tags: ["client"],
          description: "Ask about **parking**",
          subtasks: [
            reportTask(3, "Call the caterer", {
              subtasks: [reportTask(5, "Ask about vegan options")],
            }),
          ],
        }),
        reportTask(4, "Pick a date", { status: "completed" }),
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
  it("shows the Project's name and a summary", async () => {
    const fetch = mockServer(() => json(REPORT));
    renderPage();

    expect(await screen.findByRole("heading", { level: 1, name: "Launch" })).toBeInTheDocument();
    expect(screen.queryByText(/As of/)).not.toBeInTheDocument();
    expect(screen.getByText("1 of 5 completed · 1 blocked · 2 overdue")).toBeInTheDocument();
    expect(requestOf(fetch.mock.calls[0]?.[0]).url).toContain("/api/v1/share/the-key");
  });

  it("lists Sections as plain headings with their Tasks in order", async () => {
    mockServer(() => json(REPORT));
    renderPage();

    const venue = await screen.findByRole("heading", { level: 2, name: "Venue" });
    expect(screen.getAllByRole("heading", { level: 2 })).toEqual([venue]);
    const titles = screen.getAllByRole("heading", { level: 3 }).map((title) => title.textContent);
    expect(titles).toEqual([
      "Write the brief",
      "Book the venue",
      "Call the caterer",
      "Ask about vegan options",
      "Pick a date",
    ]);
  });

  it("nests each Task's Subtasks under it", async () => {
    mockServer(() => json(REPORT));
    renderPage();

    const parentOf = (title: string) =>
      screen
        .getByRole("heading", { name: title })
        .closest('ul[aria-label="Subtasks"]')
        ?.closest("li")
        ?.querySelector("h3")?.textContent;
    await screen.findByRole("heading", { name: "Book the venue" });
    expect(parentOf("Call the caterer")).toBe("Book the venue");
    expect(parentOf("Ask about vegan options")).toBe("Call the caterer");
    expect(parentOf("Book the venue")).toBeUndefined();
  });

  it("shows each Task's details", async () => {
    mockServer(() => json(REPORT));
    renderPage();

    const venue = within(
      (await screen.findByRole("heading", { name: "Book the venue" })).closest("li") ??
        document.body,
    );
    expect(venue.getByText("Blocked")).toBeInTheDocument();
    expect(venue.getByText("P1")).toBeInTheDocument();
    expect(venue.getByText("Due 1 Nov 2026")).toBeInTheDocument();
    expect(venue.getByText("Overdue")).toBeInTheDocument();
    expect(venue.getByText("#client")).toBeInTheDocument();
    expect(venue.getByText("Blocked: Waiting on Grace")).toBeInTheDocument();
    expect(venue.getByText("parking").tagName).toBe("STRONG");
    const done = within(
      screen.getByRole("heading", { name: "Pick a date" }).closest("li") ?? document.body,
    );
    expect(done.getByText("Completed")).toBeInTheDocument();
  });

  it("links each Task's Attachments for download through the Share link", async () => {
    const withFiles = reportTask(1, "Write the brief", {
      attachments: [
        { id: 7, name: "brief.pdf", size: 34_816 },
        { id: 8, name: "notes.txt", size: 512 },
      ],
    });
    mockServer(() => json({ ...REPORT, sections: [{ name: null, tasks: [withFiles] }] }));
    renderPage();

    const brief = await screen.findByRole("link", { name: "brief.pdf (34 KB)" });
    expect(brief).toHaveAttribute("href", "/api/v1/share/the-key/attachments/7");
    expect(screen.getByRole("link", { name: "notes.txt (512 B)" })).toHaveAttribute(
      "href",
      "/api/v1/share/the-key/attachments/8",
    );
  });

  it("shows each Task's Comments oldest first, dated on the owner's calendar", async () => {
    mockServer(() => json(REPORT));
    renderPage();

    const brief = within(
      (await screen.findByRole("heading", { name: "Write the brief" })).closest("li") ??
        document.body,
    );
    const entries = within(brief.getByRole("list", { name: "Comments" })).getAllByRole("listitem");
    expect(entries.map((entry) => entry.textContent)).toEqual([
      "Ask Grace31 Oct 2026",
      "Draft is ready1 Nov 2026",
    ]);
    expect(within(entries[0] ?? document.body).getByText("Grace").tagName).toBe("STRONG");
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
