import type { Sidebar, SidebarFolder, SidebarItem, SidebarProject } from "./projects";

/** A Folder or Project, named by kind because the two share the sidebar's top level. */
export type SiblingRef = { kind: "folder" | "project"; id: number };

/** Where an item lands: in a Folder (or on the top level for null), right after a sibling. */
export type Placement = { folderId: number | null; after: SiblingRef | null };

/** One visible line of the sidebar tree: a Folder, or a Project at depth 0 or inside a Folder. */
export type SidebarRow = { item: SidebarItem; depth: 0 | 1; key: string };

/** The key dnd-kit tracks a row by; ids alone would clash between Folders and Projects. */
export function rowKey(ref: SiblingRef) {
  return `${ref.kind}-${String(ref.id)}`;
}

/** The sidebar tree as visible rows, top to bottom. Collapsed Folders hide their Projects. */
export function flattenSidebar(items: SidebarItem[], hideFolderId?: number): SidebarRow[] {
  return items.flatMap((item): SidebarRow[] => {
    const row: SidebarRow = { item, depth: 0, key: rowKey(item) };
    if (item.kind === "project" || item.collapsed || item.id === hideFolderId) return [row];
    return [
      row,
      ...item.projects.map((project): SidebarRow => ({
        item: project,
        depth: 1,
        key: rowKey(project),
      })),
    ];
  });
}

/**
 * Where a dragged row would land if dropped over `overKey`, with `steps` whole indents of
 * sideways drag (negative is left). A Project nests in the Folder above it unless dragged left
 * out of it; a Folder only ever lands on the top level. Null when the drop isn't allowed.
 */
export function dropPlacement(
  rows: SidebarRow[],
  activeKey: string,
  overKey: string,
  steps: number,
): Placement | null {
  const active = rows.find((row) => row.key === activeKey);
  const to = rows.findIndex((row) => row.key === overKey);
  if (!active || to < 0) return null;
  const moved = rows.filter((row) => row.key !== activeKey);
  moved.splice(to, 0, active);
  const above = moved.slice(0, to);
  const depth = dropDepth(active, above.at(-1), moved[to + 1], steps);
  return depth === null ? null : placementAt(above, depth);
}

/** The level a dragged row lands at between two rows, or null if it can't go there. */
function dropDepth(
  active: SidebarRow,
  previous: SidebarRow | undefined,
  next: SidebarRow | undefined,
  steps: number,
) {
  const maxDepth = active.item.kind === "project" && opensIntoFolder(previous) ? 1 : 0;
  const minDepth = next ? next.depth : 0;
  if (maxDepth < minDepth) return null;
  return Math.min(Math.max(active.depth + steps, minDepth), maxDepth);
}

/** Where a row lands at `depth` below the rows `above` it. */
function placementAt(above: SidebarRow[], depth: number): Placement {
  const topLevel = above.findLast((row) => row.depth === 0)?.item;
  const ref = (item: SidebarItem): SiblingRef => ({ kind: item.kind, id: item.id });
  if (depth === 0) {
    return { folderId: null, after: topLevel ? ref(topLevel) : null };
  }
  const previous = above.at(-1);
  return {
    folderId: topLevel ? topLevel.id : null,
    after: previous?.depth === 1 ? ref(previous.item) : null,
  };
}

/** Whether a Project dropped right below this row can go into a Folder. */
function opensIntoFolder(row: SidebarRow | undefined) {
  if (!row) return false;
  return row.depth === 1 || (row.item.kind === "folder" && !row.item.collapsed);
}

/** The sidebar with one item moved, as the server will order it, so a drop shows at once. */
export function applyPlacement(
  sidebar: Sidebar,
  moving: SiblingRef,
  placement: Placement,
): Sidebar {
  const same = (item: SiblingRef) => item.kind === moving.kind && item.id === moving.id;
  let found: SidebarItem | undefined;
  const items = sidebar.items
    .filter((item) => {
      if (!same(item)) return true;
      found = item;
      return false;
    })
    .map((item): SidebarItem => {
      if (item.kind === "project") return item;
      const projects = item.projects.filter((project) => {
        if (!same(project)) return true;
        found = project;
        return false;
      });
      return { ...item, projects };
    });
  if (!found) return sidebar;

  if (placement.folderId === null) {
    const entry: SidebarItem = found.kind === "project" ? { ...found, folder_id: null } : found;
    return { ...sidebar, items: insertAfter(items, entry, placement.after) };
  }
  if (found.kind === "folder") return sidebar;
  const project: SidebarProject = { ...found, folder_id: placement.folderId };
  return {
    ...sidebar,
    items: items.map((item): SidebarItem =>
      item.kind === "folder" && item.id === placement.folderId
        ? ({
            ...item,
            projects: insertAfter(item.projects, project, placement.after),
          } satisfies SidebarFolder)
        : item,
    ),
  };
}

/** Siblings with `entry` right after `after`: first for null, last when `after` isn't there. */
function insertAfter<T extends SiblingRef>(siblings: T[], entry: T, after: SiblingRef | null) {
  let at = 0;
  if (after) {
    const index = siblings.findIndex((item) => item.kind === after.kind && item.id === after.id);
    at = index < 0 ? siblings.length : index + 1;
  }
  return [...siblings.slice(0, at), entry, ...siblings.slice(at)];
}
