import type { Sidebar, SidebarFolder, SidebarProject } from "./projects";
import { applyPlacement, dropPlacement, flattenSidebar } from "./sidebar-order";

function project(id: number, name: string, folderId: number | null = null): SidebarProject {
  return {
    kind: "project",
    id,
    name,
    color: "blue",
    icon: "list",
    folder_id: folderId,
    is_inbox: false,
    is_archived: false,
    open_count: 0,
  };
}

function folder(id: number, name: string, projects: SidebarProject[], collapsed = false) {
  return { kind: "folder", id, name, collapsed, projects } satisfies SidebarFolder;
}

const WORK = project(1, "Work");
const HEALTH = project(2, "Health", 10);
const GARDEN = project(3, "Garden", 10);
const READING = project(4, "Reading");
const PERSONAL = folder(10, "Personal", [HEALTH, GARDEN]);
const SIDEBAR: Sidebar = {
  inbox: { ...project(99, "Inbox"), icon: "inbox", is_inbox: true },
  items: [WORK, PERSONAL, READING],
  tags: [],
  people: [],
  archived: [],
  today_count: 0,
  upcoming_count: 0,
};

/** The sidebar as `name` lines, Projects in a Folder indented. */
function outline(sidebar: Sidebar) {
  return flattenSidebar(sidebar.items).map(({ item, depth }) => `${depth ? "  " : ""}${item.name}`);
}

const rows = flattenSidebar(SIDEBAR.items);

describe("flattenSidebar", () => {
  it("lists Folders with their Projects, and hides the Projects of a collapsed Folder", () => {
    expect(outline(SIDEBAR)).toEqual(["Work", "Personal", "  Health", "  Garden", "Reading"]);
    const collapsed = { ...SIDEBAR, items: [WORK, { ...PERSONAL, collapsed: true }, READING] };
    expect(outline(collapsed)).toEqual(["Work", "Personal", "Reading"]);
  });
});

describe("dropPlacement", () => {
  it("puts a Project dropped first at the top of the sidebar", () => {
    expect(dropPlacement(rows, "project-4", "project-1", 0)).toEqual({
      folderId: null,
      after: null,
    });
  });

  it("nests a Project dropped right under an open Folder in it, first", () => {
    expect(dropPlacement(rows, "project-4", "project-2", 0)).toEqual({
      folderId: 10,
      after: null,
    });
  });

  it("nests a Project dropped between a Folder's Projects after the one above", () => {
    expect(dropPlacement(rows, "project-4", "project-3", 0)).toEqual({
      folderId: 10,
      after: { kind: "project", id: 2 },
    });
  });

  it("takes a Project dragged left at the end of a Folder out, after the Folder", () => {
    expect(dropPlacement(rows, "project-2", "project-3", -1)).toEqual({
      folderId: null,
      after: { kind: "folder", id: 10 },
    });
  });

  it("keeps a Project in its Folder when dropped at the end without dragging left", () => {
    expect(dropPlacement(rows, "project-2", "project-3", 0)).toEqual({
      folderId: 10,
      after: { kind: "project", id: 3 },
    });
  });

  it("keeps a Folder on the top level, after the item above it", () => {
    const dragging = flattenSidebar(SIDEBAR.items, 10);
    expect(dropPlacement(dragging, "folder-10", "project-4", 1)).toEqual({
      folderId: null,
      after: { kind: "project", id: 4 },
    });
  });

  it("refuses to drop a Folder between another Folder's Projects", () => {
    const other = folder(11, "Work things", []);
    const withTwo = flattenSidebar([other, WORK, PERSONAL], 11);
    expect(dropPlacement(withTwo, "folder-11", "project-2", 0)).toBeNull();
  });
});

describe("applyPlacement", () => {
  it("moves a Project into a Folder after a sibling", () => {
    const moved = applyPlacement(
      SIDEBAR,
      { kind: "project", id: 1 },
      { folderId: 10, after: { kind: "project", id: 2 } },
    );

    expect(outline(moved)).toEqual(["Personal", "  Health", "  Work", "  Garden", "Reading"]);
  });

  it("moves a Project out of its Folder to the top", () => {
    const moved = applyPlacement(
      SIDEBAR,
      { kind: "project", id: 3 },
      { folderId: null, after: null },
    );

    expect(outline(moved)).toEqual(["Garden", "Work", "Personal", "  Health", "Reading"]);
  });

  it("puts an item whose neighbour is gone last", () => {
    const moved = applyPlacement(
      SIDEBAR,
      { kind: "folder", id: 10 },
      { folderId: null, after: { kind: "project", id: 404 } },
    );

    expect(outline(moved)).toEqual(["Work", "Reading", "Personal", "  Health", "  Garden"]);
  });
});
