import { screen, within } from "@testing-library/react";

import type { Person } from "@/features/people/people";
import { PersonTasks } from "@/features/people/person-tasks";
import { TagTaskList } from "@/features/tags/tag-task-list";
import { INBOX, json, PRIYA, renderListRoute, renderTaskList, TAGS, WORK } from "@/test/drawer";
import { makeTask } from "@/test/tasks";

import type { NewTask } from "./tasks";

/**
 * A stand-in server for Quick add: the sidebar with the Work Project and two Tags, Priya, and
 * People and Tasks created as asked. Every request is logged as `METHOD path` with its body.
 */
function mockApi() {
  const log: [string, unknown][] = [];
  let nextId = 100;
  const fetchSpy = vi.spyOn(globalThis, "fetch").mockImplementation(async (input) => {
    const request = input as Request;
    const { pathname } = new URL(request.url);
    const body: unknown = request.method === "GET" ? undefined : await request.clone().json();
    log.push([`${request.method} ${pathname}`, body]);
    if (pathname.endsWith("/sidebar")) {
      return json({ inbox: INBOX, items: [WORK], archived: [], tags: TAGS });
    }
    if (pathname.endsWith("/people")) {
      return request.method === "POST"
        ? json({ id: nextId++, color: "red", ...(body as object) }, 201)
        : json([PRIYA]);
    }
    if (request.method === "POST") {
      const { title, project_id: projectId, priority, tag_ids: tagIds = [] } = body as NewTask;
      const created = makeTask({
        id: nextId++,
        title,
        project_id: projectId ?? INBOX.id,
        priority: priority ?? 0,
        tags: TAGS.filter((tag) => tagIds.includes(tag.id)),
      });
      return json(created, 201);
    }
    return json({ items: [], next_cursor: null });
  });
  return { fetchSpy, log };
}

function posts(log: [string, unknown][]) {
  return log.filter(([request]) => request.startsWith("POST"));
}

const input = () => screen.findByRole("combobox", { name: "New task" });

describe("Quick add", () => {
  beforeEach(() => {
    localStorage.clear();
  });

  it("reads Priority, Tags and a Project from the line and sends them as fields", async () => {
    const { log } = mockApi();
    const { user, router } = renderTaskList();

    await user.type(await input(), "Pay rent !1 #work #urgent ~Work{Escape}");
    const chips = screen.getByText("Priority 1").parentElement?.parentElement;
    expect(chips && within(chips).getByText("new")).toBeInTheDocument();
    await user.keyboard("{Enter}");

    await vi.waitFor(() => {
      expect(posts(log)).toEqual([
        [
          "POST /api/v1/tasks",
          { title: "Pay rent", project_id: WORK.id, priority: 1, tag_ids: [21], tags: ["urgent"] },
        ],
      ]);
    });
    expect(await input()).toHaveValue("");
    // The Task went to Work, not the Inbox shown, so a toast points to it.
    expect(await screen.findByText("Added to Work")).toBeInTheDocument();
    await user.click(screen.getByRole("button", { name: "Open" }));
    expect(router.state.location.pathname).toBe(`/projects/${String(WORK.id)}`);
    expect(router.state.location.search).toEqual({ task: 100 });
  });

  it("creates a new Person just before the Task that mentions them", async () => {
    const { log } = mockApi();
    const { user } = renderTaskList();

    await user.type(await input(), "Call @Bob and @Priya{Escape}{Enter}");

    await vi.waitFor(() => {
      expect(posts(log)).toEqual([
        ["POST /api/v1/people", { name: "Bob" }],
        [
          "POST /api/v1/tasks",
          { title: "Call [@Bob](person:100) and [@Priya](person:1)", project_id: INBOX.id },
        ],
      ]);
    });
    expect(screen.queryByText(/^Added to/)).not.toBeInTheDocument();
  });

  it("turns a match back into text with Backspace right after it, or its chip's ×", async () => {
    const { log } = mockApi();
    const { user } = renderTaskList();

    await user.type(await input(), "Meeting with May !2{Backspace} #home");
    expect(screen.queryByText("Priority 2")).not.toBeInTheDocument();
    await user.keyboard("{Escape}");
    await user.click(screen.getByRole("button", { name: "Keep “#home” as text" }));
    await user.keyboard("{Enter}");

    await vi.waitFor(() => {
      expect(posts(log)).toEqual([
        ["POST /api/v1/tasks", { title: "Meeting with May !2 #home", project_id: INBOX.id }],
      ]);
    });
  });

  it("picks a Tag at the caret from the user's own, then lists it first next time", async () => {
    mockApi();
    const { user } = renderTaskList();
    const field = await input();

    await user.type(field, "Water #");
    const tags = await screen.findByRole("listbox", { name: "Tags" });
    expect(
      within(tags)
        .getAllByRole("option")
        .map((option) => option.textContent),
    ).toEqual(["work", "home"]);
    await user.keyboard("{ArrowDown}{Enter}");

    expect(field).toHaveValue("Water #home ");
    expect(screen.getAllByText("home").length).toBeGreaterThan(0);
    await user.type(field, "#");
    expect(
      within(screen.getByRole("listbox", { name: "Tags" }))
        .getAllByRole("option")
        .map((option) => option.textContent),
    ).toEqual(["home", "work"]);
  });

  it("offers to create a Tag or Person it doesn't know, but never a Project", async () => {
    mockApi();
    const { user } = renderTaskList();
    const field = await input();

    await user.type(field, "@Bo");
    expect(await screen.findByRole("option", { name: "Create “Bo”" })).toBeInTheDocument();
    await user.clear(field);
    await user.type(field, "~Gard");
    expect(screen.getByText("No project")).toBeInTheDocument();
    expect(screen.queryByRole("option")).not.toBeInTheDocument();
  });

  it("starts a Tag's Quick add with the Tag, which can be removed", async () => {
    const { log } = mockApi();
    const work = TAGS[0];
    if (!work) throw new Error("The test Tags are missing.");
    const { user } = renderListRoute(<TagTaskList tag={work} />);

    await user.click(await input());
    await user.click(screen.getByRole("button", { name: "Remove work" }));
    await user.type(await input(), "Plan{Enter}");

    await vi.waitFor(() => {
      expect(posts(log)).toEqual([["POST /api/v1/tasks", { title: "Plan", project_id: INBOX.id }]]);
    });
    // Without the Tag, the Task doesn't show in the Tag's list.
    expect(await screen.findByText("Added to Inbox")).toBeInTheDocument();
  });

  it("reads a Repeat and starts the Task on its first day", async () => {
    // Thursday 15 October 2026.
    vi.useFakeTimers({ now: new Date(2026, 9, 15, 10, 0), toFake: ["Date"] });
    const { log } = mockApi();
    const { user } = renderTaskList();

    await user.type(await input(), "Water every monday 9am");
    expect(screen.getByText("Weekly on Monday")).toBeInTheDocument();
    expect(screen.getByText("Monday, 09:00")).toBeInTheDocument();
    await user.keyboard("{Enter}");

    await vi.waitFor(() => {
      expect(posts(log)).toEqual([
        [
          "POST /api/v1/tasks",
          {
            title: "Water",
            project_id: INBOX.id,
            dates: {
              due_date: "2026-10-19",
              due_time: "09:00",
              start_date: null,
              start_time: null,
            },
            repeat_rule: "FREQ=WEEKLY;BYDAY=MO",
          },
        ],
      ]);
    });
    vi.useRealTimers();
  });

  it("mentions the Person in their view's new Tasks", async () => {
    const { log } = mockApi();
    const priya: Person = PRIYA;
    const { user } = renderListRoute(<PersonTasks person={priya} />);

    await user.type(await input(), "Send the slides{Enter}");

    await vi.waitFor(() => {
      expect(posts(log)).toEqual([
        [
          "POST /api/v1/tasks",
          { title: "Send the slides [@Priya](person:1)", project_id: INBOX.id },
        ],
      ]);
    });
  });
});
