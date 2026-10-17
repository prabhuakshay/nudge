import { useInfiniteQuery, useQuery } from "@tanstack/react-query";
import { useMemo } from "react";

import { AddSection } from "@/features/sections/add-section";
import { bySection } from "@/features/sections/section-trees";
import { sectionsQuery, type Section } from "@/features/sections/sections";
import { useOpenTask } from "@/features/tasks/open-task";
import { QuickAddCard } from "@/features/tasks/quick-add-card";
import { TaskDetail } from "@/features/tasks/task-detail";
import { treeRows } from "@/features/tasks/task-tree";
import { openTasksQuery, sectionClosedQuery, type Task } from "@/features/tasks/tasks";
import { useToggleComplete } from "@/features/tasks/use-task-verbs";

import { ArchivedNotice } from "./archived-notice";
import { BoardColumn, type BoardColumnCards } from "./board-column";
import { BoardDrag } from "./board-drag";
import { pinnedFirst } from "./board-moves";
import { ProjectHeader } from "./project-header";
import type { SidebarProject } from "./projects";

/**
 * A Project's open Tasks as a Board: one column of cards per Section, in Section order, after a
 * No section column that only shows when it has open or Closed Tasks, or while a card is dragged
 * so it can be dropped there. A card is a root Task; its Subtasks show
 * as progress on it; cards drag between and within columns. An Add section control ends the
 * Board. On phones the columns scroll sideways inside the Board, one at a time, so the page itself
 * never does. An archived Project's Board is read-only.
 */
export function ProjectBoard({ project }: { project: SidebarProject }) {
  const { data: open = [], isSuccess: loaded } = useQuery(openTasksQuery(project.id));
  const { data: sections = [] } = useQuery(sectionsQuery(project.id));
  const columns = useMemo(() => boardColumns(open, sections), [open, sections]);
  const noSectionEmpty = columns[0]?.cards.length === 0;
  const noSectionClosed = useNoSectionHasClosed(project.id, loaded && noSectionEmpty);
  const visible = onShow(columns, noSectionClosed);
  const order = useMemo(
    () => columns.flatMap(({ cards }) => cards.map(({ task }) => task.id)),
    [columns],
  );
  const { openTaskId, setOpenTask } = useOpenTask();
  const toggle = useToggleComplete();

  return (
    // `data-wide` lets the app shell drop its reading width for the Board.
    <div data-wide className="mx-auto w-full max-w-6xl min-w-0">
      <ProjectHeader project={project} />
      {project.is_archived ? (
        <ArchivedNotice project={project} />
      ) : (
        <QuickAddCard view={{ kind: "project", project }} />
      )}

      {visible.length === 0 && (
        <p className="px-4 py-8 text-center text-sm text-muted-foreground">
          Nothing here yet. Add a task above.
        </p>
      )}
      {(visible.length > 0 || !project.is_archived) && (
        <div
          role="group"
          aria-label={`${project.name} board`}
          className="flex snap-x snap-mandatory items-start gap-3 overflow-x-auto overscroll-x-contain pb-4"
        >
          <BoardDrag projectId={project.id} columns={columns}>
            {(current, cardDragged) =>
              onShow(current, noSectionClosed || cardDragged).map((column, index, shown) => (
                <BoardColumn
                  key={column.section?.id ?? "none"}
                  projectId={project.id}
                  column={column}
                  order={sections}
                  position={index + 1}
                  count={shown.length}
                  openId={openTaskId}
                  readOnly={project.is_archived}
                  onOpen={setOpenTask}
                  onToggle={toggle}
                />
              ))
            }
          </BoardDrag>
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

/** The Board's columns in order: No section first, then every Section. */
function boardColumns(open: Task[], sections: Section[]) {
  const cardsOf = (tasks: Task[]) =>
    pinnedFirst(treeRows(tasks).filter(({ level }) => level === 0));
  const trees = bySection(open, sections);
  const columns: BoardColumnCards[] = trees.sections.map(({ section, tasks }) => ({
    section,
    cards: cardsOf(tasks),
  }));
  return [{ section: null, cards: cardsOf(trees.unsectioned) }, ...columns];
}

/** The columns on show: No section only when it has cards or `keepNoSection` says so. */
function onShow(columns: BoardColumnCards[], keepNoSection: boolean) {
  const [noSection, ...sectioned] = columns;
  return noSection && (noSection.cards.length > 0 || keepNoSection) ? columns : sectioned;
}

/**
 * Whether No section has Closed Tasks, asked only when `ask` is set, so its column can show to
 * reach them. Its fold reads the same first page.
 */
function useNoSectionHasClosed(projectId: number, ask: boolean) {
  const { data } = useInfiniteQuery({ ...sectionClosedQuery(projectId, null), enabled: ask });
  return (data?.pages[0]?.items.length ?? 0) > 0;
}
