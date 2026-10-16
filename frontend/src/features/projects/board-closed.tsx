import { useInfiniteQuery } from "@tanstack/react-query";
import { useMemo, useState } from "react";

import { sectionName, type Section } from "@/features/sections/sections";
import { ClosedGroup } from "@/features/tasks/task-groups";
import { treeRows } from "@/features/tasks/task-tree";
import { sectionClosedQuery, type Task } from "@/features/tasks/tasks";

import { BoardCard } from "./board-card";

/**
 * The fold at the bottom of a Board column holding its Section's Closed Tasks as cards, newest
 * first. It starts collapsed and loads nothing until opened, so finished work stays out of the
 * way but reachable. Reopening a card sends it back up among the column's open cards.
 */
export function BoardClosedFold({
  projectId,
  section,
  openId,
  readOnly,
  onOpen,
  onToggle,
}: {
  projectId: number;
  section: Section | null;
  openId: number | null;
  readOnly: boolean;
  onOpen: (taskId: number) => void;
  onToggle: (task: Task) => void;
}) {
  const [expanded, setExpanded] = useState(false);
  const closed = useInfiniteQuery({
    ...sectionClosedQuery(projectId, section?.id ?? null),
    enabled: expanded,
  });
  const cards = useMemo(
    () =>
      treeRows(closed.data?.pages.flatMap((page) => page.items) ?? []).filter(
        ({ level }) => level === 0,
      ),
    [closed.data],
  );
  const name = sectionName(section);

  return (
    <ClosedGroup
      query={closed}
      empty={cards.length === 0}
      expanded={expanded}
      onExpandedChange={setExpanded}
    >
      {cards.length > 0 && (
        <ul aria-label={`${name} closed tasks`} className="flex flex-col gap-2 px-2 pt-2">
          {cards.map((card, index) => (
            <BoardCard
              key={card.task.id}
              card={card}
              label={`${String(index + 1)} of ${String(cards.length)} closed in ${name}`}
              selected={card.task.id === openId}
              readOnly={readOnly}
              onOpen={onOpen}
              onToggle={onToggle}
            />
          ))}
        </ul>
      )}
    </ClosedGroup>
  );
}
