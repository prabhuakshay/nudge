import { useDroppable } from "@dnd-kit/core";
import { ChevronRight } from "lucide-react";
import type { ReactNode } from "react";

import { BoardCard } from "@/features/projects/board-card";
import { flatRows } from "@/features/tasks/task-tree";
import type { Task } from "@/features/tasks/tasks";
import { plural } from "@/lib/plural";
import { cn } from "@/lib/utils";

import { DraggableMatrixCard } from "./matrix-drag";
import { QuadrantAddTask } from "./quadrant-add-task";
import { QUADRANT_LABEL, type Quadrant } from "./quadrants";

/** Each Quadrant's accent, as TickTick colours them: red, amber, blue and green. */
const ACCENT: Record<Quadrant, string> = {
  "urgent-important": "bg-hue-red",
  important: "bg-hue-amber",
  urgent: "bg-hue-blue",
  neither: "bg-hue-green",
};

/** Whether a phone's Quadrant is folded away, and what folds or opens it. */
export type QuadrantFold = { collapsed: boolean; onToggle: () => void };

/** That a Quadrant's cards drag inside `MatrixDrag`, and whether it would take the one dragged. */
export type QuadrantDrop = { accepts: boolean };

/**
 * One Quadrant of the Matrix: its label and how many Tasks it holds, then its Tasks as cards, or
 * a line saying it is empty, and Quick add for adding one there. Given `fold`, as on a phone, its
 * heading folds it away. Given `drop`, its cards drag and it takes dropped ones.
 */
export function QuadrantSection({
  quadrant,
  tasks,
  today,
  openId,
  onOpen,
  onToggle,
  fold,
  drop,
}: {
  quadrant: Quadrant;
  tasks: Task[];
  /** The user's ISO date, which Quick add gives an Urgent Quadrant's new Tasks. */
  today: string;
  /** The Task open in the drawer, whose card shows as selected. */
  openId: number | null;
  onOpen: (taskId: number) => void;
  onToggle: (task: Task) => void;
  /** Left out in the grid, where every Quadrant shows. */
  fold?: QuadrantFold;
  /** Left out on phones, where Priority changes in the drawer and touch scrolls the page. */
  drop?: QuadrantDrop;
}) {
  const { setNodeRef } = useDroppable({ id: quadrant, disabled: !drop });
  const Card = drop ? DraggableMatrixCard : BoardCard;
  const label = QUADRANT_LABEL[quadrant];
  const labelId = `quadrant-${quadrant}`;
  const heading = (
    <>
      <span className={cn("size-2.5 shrink-0 rounded-full", ACCENT[quadrant])} aria-hidden />
      <span id={labelId}>{label}</span>
      <span aria-hidden className="ml-auto text-xs font-medium text-muted-foreground tabular-nums">
        {tasks.length}
      </span>
      <span className="sr-only">, {plural(tasks.length, "task")}</span>
    </>
  );
  return (
    <section
      ref={setNodeRef}
      aria-labelledby={labelId}
      className={cn(
        "flex min-w-0 flex-col rounded-xl border border-border/60 bg-surface-muted/60 transition-colors",
        drop?.accepts && "border-primary/60 bg-primary-soft/40",
      )}
    >
      <h2 className="flex h-10 text-sm font-semibold">
        {fold ? (
          <FoldButton fold={fold}>{heading}</FoldButton>
        ) : (
          <span className="flex flex-1 items-center gap-2 px-3">{heading}</span>
        )}
      </h2>
      {fold?.collapsed ? null : tasks.length === 0 ? (
        <p className="px-3 pt-2 pb-4 text-center text-xs text-muted-foreground">Nothing here.</p>
      ) : (
        <ul aria-label={`${label} tasks`} className="flex flex-col gap-2 px-2 pb-2">
          {flatRows(tasks).map((card, index) => (
            <Card
              key={card.task.id}
              card={card}
              place={{ index, count: tasks.length, column: label }}
              selected={card.task.id === openId}
              readOnly={false}
              onOpen={onOpen}
              onToggle={onToggle}
            />
          ))}
        </ul>
      )}
      {!fold?.collapsed && <QuadrantAddTask quadrant={quadrant} today={today} />}
    </section>
  );
}

function FoldButton({ fold, children }: { fold: QuadrantFold; children: ReactNode }) {
  return (
    <button
      type="button"
      aria-expanded={!fold.collapsed}
      onClick={fold.onToggle}
      className="flex flex-1 items-center gap-2 rounded-xl px-3 text-left outline-none focus-visible:ring-2 focus-visible:ring-ring"
    >
      <ChevronRight
        className={cn(
          "size-3.5 shrink-0 text-muted-foreground transition-transform",
          !fold.collapsed && "rotate-90",
        )}
        aria-hidden
      />
      {children}
    </button>
  );
}
