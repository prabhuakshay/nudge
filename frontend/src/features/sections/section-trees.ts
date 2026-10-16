import { treesWhere } from "@/features/tasks/task-tree";
import type { Task } from "@/features/tasks/tasks";

import type { Section } from "./sections";

/** A Project's Task trees split by the Section their root sits in, each in the order given. */
export type SectionTrees = {
  /** The trees in No section, including any whose Section the list doesn't know yet. */
  unsectioned: Task[];
  sections: { section: Section; tasks: Task[] }[];
};

/**
 * Split flat Task rows by their root's Section, keeping their order within each, so the Pinned
 * Tasks the server lists first stay at the top of their Section.
 */
export function bySection(rows: Task[], sections: Section[]): SectionTrees {
  const known = new Set(sections.map((section) => section.id));
  return {
    unsectioned: treesWhere(
      rows,
      (root) => root.section_id === null || !known.has(root.section_id),
    ),
    sections: sections.map((section) => ({
      section,
      tasks: treesWhere(rows, (root) => root.section_id === section.id),
    })),
  };
}
