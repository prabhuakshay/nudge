import type { SidebarProject } from "@/features/tasks/tasks";
import { makeTask } from "@/test/tasks";

import { groupByProject } from "./group-by-project";

function project(id: number, name: string): SidebarProject {
  return {
    kind: "project",
    id,
    name,
    color: "blue",
    icon: "list",
    folder_id: null,
    is_inbox: false,
    open_count: 0,
  };
}

const INBOX = project(1, "Inbox");
const WORK = project(2, "Work");
const HOME = project(3, "Home");

describe("groupByProject", () => {
  it("groups Tasks by Project in sidebar order, keeping their order and skipping empty ones", () => {
    const tasks = [
      makeTask({ id: 1, title: "Mow", project_id: 3 }),
      makeTask({ id: 2, title: "Report", project_id: 2 }),
      makeTask({ id: 3, title: "Paint", project_id: 3 }),
    ];

    const groups = groupByProject(tasks, [INBOX, WORK, HOME]);

    expect(groups.map((group) => [group.project.name, group.tasks.map((t) => t.title)])).toEqual([
      ["Work", ["Report"]],
      ["Home", ["Mow", "Paint"]],
    ]);
  });
});
