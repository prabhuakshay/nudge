import { useQuery } from "@tanstack/react-query";
import { useCallback, useMemo } from "react";

import { AddSection } from "@/features/sections/add-section";
import { bySection } from "@/features/sections/section-trees";
import { sectionsQuery, type Section } from "@/features/sections/sections";
import { useOpenTask } from "@/features/tasks/open-task";
import { QuickAddCard } from "@/features/tasks/quick-add-card";
import { useSetTaskStatus } from "@/features/tasks/set-status";
import { TaskDetail } from "@/features/tasks/task-detail";
import { isClosed } from "@/features/tasks/task-properties";
import { treeRows } from "@/features/tasks/task-tree";
import { openTasksQuery, type Task } from "@/features/tasks/tasks";

import { ArchivedNotice } from "./archived-notice";
import { BoardColumn, type BoardColumnCards } from "./board-column";
import { ProjectHeader } from "./project-header";
import type { SidebarProject } from "./projects";

/**
 * A Project's open Tasks as a Board: one column of cards per Section, in Section order, after a
 * No section column that only shows when it has Tasks. A card is a root Task; its Subtasks show
 * as progress on it. An Add section control ends the Board. On phones the columns scroll sideways inside the Board, one at a time, so
 * the page itself never does. An archived Project's Board is read-only.
 */
export function ProjectBoard({ project }: { project: SidebarProject }) {
  const { data: open = [] } = useQuery(openTasksQuery(project.id));
  const { data: sections = [] } = useQuery(sectionsQuery(project.id));
  const columns = useMemo(() => boardColumns(open, sections), [open, sections]);
  const order = useMemo(
    () => columns.flatMap(({ cards }) => cards.map(({ task }) => task.id)),
    [columns],
  );
  const { openTaskId, setOpenTask } = useOpenTask();
  const { mutate: setStatus } = useSetTaskStatus();
  const toggle = useCallback(
    (task: Task) => {
      setStatus({ task, status: isClosed(task.status) ? "open" : "completed" });
    },
    [setStatus],
  );

  return (
    // `data-wide` lets the app shell drop its reading width for the Board.
    <div data-wide className="mx-auto w-full max-w-6xl min-w-0">
      <ProjectHeader project={project} />
      {project.is_archived ? (
        <ArchivedNotice project={project} />
      ) : (
        <QuickAddCard view={{ kind: "project", project }} />
      )}

      {columns.length === 0 && (
        <p className="px-4 py-8 text-center text-sm text-muted-foreground">
          Nothing here yet. Add a task above.
        </p>
      )}
      {(columns.length > 0 || !project.is_archived) && (
        <div
          role="group"
          aria-label={`${project.name} board`}
          className="flex snap-x snap-mandatory items-start gap-3 overflow-x-auto overscroll-x-contain pb-4"
        >
          {columns.map((column, index) => (
            <BoardColumn
              key={column.section?.id ?? "none"}
              column={column}
              position={index + 1}
              count={columns.length}
              openId={openTaskId}
              readOnly={project.is_archived}
              onOpen={setOpenTask}
              onToggle={toggle}
            />
          ))}
          {!project.is_archived && (
            <AddSection
              projectId={project.id}
              className="w-[85%] max-w-80 shrink-0 snap-start sm:w-72"
            />
          )}
        </div>
      )}

      <TaskDetail
        taskId={openTaskId}
        project={project}
        order={order}
        onOpen={setOpenTask}
        onClose={() => {
          setOpenTask(null);
        }}
      />
    </div>
  );
}

/** The Board's columns in order: No section first when it has Tasks, then every Section. */
function boardColumns(open: Task[], sections: Section[]) {
  const cardsOf = (tasks: Task[]) => treeRows(tasks).filter(({ level }) => level === 0);
  const trees = bySection(open, sections);
  const columns: BoardColumnCards[] = trees.sections.map(({ section, tasks }) => ({
    section,
    cards: cardsOf(tasks),
  }));
  const unsectioned = cardsOf(trees.unsectioned);
  return unsectioned.length > 0 ? [{ section: null, cards: unsectioned }, ...columns] : columns;
}
