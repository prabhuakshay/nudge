import type { Person } from "@/features/people/people";
import type { SidebarProject } from "@/features/tasks/tasks";

import { parseQuickAdd, quickAddTitle, type QuickAddContext } from "./quick-add";

function project(id: number, name: string): SidebarProject {
  return {
    kind: "project",
    id,
    name,
    color: "blue",
    icon: "list",
    folder_id: null,
    is_inbox: id === 7,
    is_archived: false,
    open_count: 0,
  };
}

const PRIYA: Person = { id: 1, name: "Priya", color: "violet" };
const SAM: Person = { id: 2, name: "Sam Lee", color: "blue" };

const CONTEXT: QuickAddContext = {
  projects: [project(7, "Inbox"), project(8, "Work"), project(10, "Side project")],
  tags: [
    { id: 21, name: "work", color: "teal" },
    { id: 22, name: "home", color: null },
  ],
  people: [PRIYA, SAM],
};

/** The title and fields a parse gives a new Task, leaving out the match spans. */
function fields(text: string, context: Partial<QuickAddContext> = {}) {
  const { title, priority, projectId, tagIds, newTags, newPeople } = parseQuickAdd(text, {
    ...CONTEXT,
    ...context,
  });
  return { title, priority, projectId, tagIds, newTags, newPeople };
}

const NOTHING = {
  priority: 0,
  projectId: null,
  tagIds: [],
  newTags: [],
  newPeople: [],
};

describe("parseQuickAdd", () => {
  it.each([
    ["Buy milk", { title: "Buy milk" }],
    ["  Buy   milk  ", { title: "Buy milk" }],
    // Priority: !1–!4 or !p1–!p4, any case; the first one wins.
    ["Pay rent !1", { title: "Pay rent", priority: 1 }],
    ["!p2 Pay rent", { title: "Pay rent", priority: 2 }],
    ["Pay rent !P3", { title: "Pay rent", priority: 3 }],
    ["Pay !4 rent", { title: "Pay rent", priority: 4 }],
    ["Pay rent !1 !2", { title: "Pay rent !2", priority: 1 }],
    ["Pay rent !5", { title: "Pay rent !5" }],
    ["Pay rent!1", { title: "Pay rent!1" }],
    ["Pay rent !1x", { title: "Pay rent !1x" }],
    // Tags: a known name in any case, or a new one created on submit.
    ["Report #work", { title: "Report", tagIds: [21] }],
    ["Report #WORK #home", { title: "Report", tagIds: [21, 22] }],
    ["Report #work #work", { title: "Report", tagIds: [21] }],
    ["Report #urgent", { title: "Report", newTags: ["urgent"] }],
    ["Report #urgent #Urgent", { title: "Report", newTags: ["urgent"] }],
    ["Report #", { title: "Report #" }],
    ["Report a#work", { title: "Report a#work" }],
    // People: a Mention stays in the title as a token; a new name is created on submit.
    ["Call @priya", { title: "Call [@Priya](person:1)" }],
    ["@Priya to call", { title: "[@Priya](person:1) to call" }],
    ["Call @Bob", { title: "Call @Bob", newPeople: ["Bob"] }],
    ["Call @Bob and @bob", { title: "Call @Bob and @bob", newPeople: ["Bob"] }],
    ["Mail ada@example.com", { title: "Mail ada@example.com" }],
    // Projects: a known name only; an unknown one stays text.
    ["Buy seeds ~work", { title: "Buy seeds", projectId: 8 }],
    ["Buy seeds ~Work ~Inbox", { title: "Buy seeds ~Inbox", projectId: 8 }],
    ["Buy seeds ~Garden", { title: "Buy seeds ~Garden" }],
    // Tokens end at the first space, and all of them can come together.
    [
      "Call @Priya #home !3 ~Work about rent",
      { title: "Call [@Priya](person:1) about rent", priority: 3, tagIds: [22], projectId: 8 },
    ],
  ])("reads %j", (text, expected) => {
    expect(fields(text)).toEqual({ ...NOTHING, ...expected });
  });

  it("gives the span and kind of each match, in order", () => {
    const { matches } = parseQuickAdd("Call @Priya #home !3 ~Work", CONTEXT);

    expect(matches.map(({ kind, start, end, text }) => ({ kind, start, end, text }))).toEqual([
      { kind: "person", start: 5, end: 11, text: "@Priya" },
      { kind: "tag", start: 12, end: 17, text: "#home" },
      { kind: "priority", start: 18, end: 20, text: "!3" },
      { kind: "project", start: 21, end: 26, text: "~Work" },
    ]);
  });

  it("marks unknown Tags and People as new", () => {
    const { matches } = parseQuickAdd("Ask @Bob #urgent", CONTEXT);

    expect(matches).toMatchObject([
      { kind: "person", name: "Bob", person: null },
      { kind: "tag", name: "urgent", tag: null },
    ]);
  });

  it("leaves `~` as text where Projects aren't allowed, as in Add subtask", () => {
    expect(fields("Book flights ~Work #work", { allowProject: false })).toEqual({
      ...NOTHING,
      title: "Book flights ~Work",
      tagIds: [21],
    });
  });

  it("matches names with spaces when they were picked from the picker", () => {
    const picked = [
      { kind: "project" as const, id: 10, text: "~Side project" },
      { kind: "person" as const, id: 2, text: "@Sam Lee" },
    ];

    expect(fields("Fix bug ~Side project with @Sam Lee", { picked })).toEqual({
      ...NOTHING,
      title: "Fix bug with [@Sam Lee](person:2)",
      projectId: 10,
    });
  });

  it("ignores a picked name that is no longer the user's", () => {
    const picked = [{ kind: "tag" as const, id: 99, text: "#gone" }];

    expect(fields("Fix #gone", { picked })).toEqual({
      ...NOTHING,
      title: "Fix",
      newTags: ["gone"],
    });
  });

  it("keeps a match as text once it was turned back", () => {
    const kept = new Set(["priority:!1", "person:@Priya"]);

    expect(fields("Meet @Priya !1 #home", { kept })).toEqual({
      ...NOTHING,
      title: "Meet @Priya !1",
      tagIds: [22],
    });
  });
});

describe("quickAddTitle", () => {
  it("mentions People created on submit by their new ids", () => {
    const text = "Call @Bob and @Priya";
    const { matches } = parseQuickAdd(text, CONTEXT);

    expect(quickAddTitle(text, matches, [{ id: 5, name: "Bob", color: "red" }])).toBe(
      "Call [@Bob](person:5) and [@Priya](person:1)",
    );
  });
});
