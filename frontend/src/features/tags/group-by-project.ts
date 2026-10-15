import type { SidebarProject, Task } from "@/features/tasks/tasks";

/** The Tasks of one Project, in a list that spans Projects. */
export type ProjectGroup = { project: SidebarProject; tasks: Task[] };

/**
 * Split Tasks into one group per Project, in the order the Projects are given (the sidebar's),
 * keeping each group's Tasks in the order they came. Projects with no Tasks get no group, and
 * Tasks of a Project that isn't given are left out.
 */
export function groupByProject(tasks: Task[], projects: SidebarProject[]): ProjectGroup[] {
  return projects.flatMap((project) => {
    const own = tasks.filter((task) => task.project_id === project.id);
    return own.length ? [{ project, tasks: own }] : [];
  });
}
