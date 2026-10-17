import { closestCenter, DndContext, type DragEndEvent } from "@dnd-kit/core";
import { SortableContext, useSortable, verticalListSortingStrategy } from "@dnd-kit/sortable";
import { CSS } from "@dnd-kit/utilities";
import { Archive, ArchiveRestore, ChevronRight, GripVertical, Pencil, Trash2 } from "lucide-react";
import { useState, type ReactNode } from "react";

import { DropdownMenuItem, DropdownMenuSeparator } from "@/components/ui/dropdown-menu";
import { useSidebarSensors } from "@/features/projects/sidebar-drag";
import { RowMenu } from "@/features/projects/sidebar-rows";
import { dropAfter } from "@/features/tags/tags";
import { cn } from "@/lib/utils";

import { CheckInButton, UndoCheckInItem } from "./check-in";
import { HabitIcon } from "./habit-icon";
import { RecentDays, StreakLine } from "./habit-progress";
import { useMoveHabit, useSetArchived, type Habit } from "./habits";

const LIST = "overflow-hidden rounded-xl border border-border bg-surface";
const ROW = "group flex min-h-14 items-center gap-3 border-b border-border/60 px-4 py-2";

/**
 * A Habit's icon, name and menu, the parts every row shares, with `details` under the name. The
 * name opens the Habit's details.
 */
function HabitLine({
  habit,
  menu,
  details,
  onOpen,
}: {
  habit: Habit;
  menu: ReactNode;
  details?: ReactNode;
  onOpen: (habit: Habit) => void;
}) {
  return (
    <>
      <HabitIcon habit={habit} />
      <span className="flex min-w-0 flex-1 flex-col items-start">
        <button
          type="button"
          onClick={() => {
            onOpen(habit);
          }}
          className="max-w-full truncate rounded-sm text-left text-sm font-medium hover:underline focus-visible:outline-2 focus-visible:outline-ring"
        >
          {habit.name}
        </button>
        {details}
      </span>
      <RowMenu label={`${habit.name} options`}>{menu}</RowMenu>
    </>
  );
}

function DeleteItem({ onSelect }: { onSelect: () => void }) {
  return (
    <>
      <DropdownMenuSeparator />
      <DropdownMenuItem variant="danger" onSelect={onSelect}>
        <Trash2 aria-hidden /> Delete
      </DropdownMenuItem>
    </>
  );
}

/**
 * The user's live Habits in their order. Each row's name opens its details, and the row shows its
 * Streak and last 7 days, drags by its
 * grip (Space picks it up from the keyboard), checks in for today with its ring button, and its
 * menu edits it, undoes today's
 * latest Check-in, archives or deletes it. `timeZone` is the user's, which decides what today is.
 */
export function HabitList({
  habits,
  timeZone,
  onOpen,
  onEdit,
  onDelete,
}: {
  habits: Habit[];
  timeZone: string;
  onOpen: (habit: Habit) => void;
  onEdit: (habit: Habit) => void;
  onDelete: (habit: Habit) => void;
}) {
  const sensors = useSidebarSensors();
  const move = useMoveHabit();

  const onDragEnd = ({ active, over }: DragEndEvent) => {
    if (!over || active.id === over.id) return;
    const id = Number(active.id);
    move.mutate({ id, afterId: dropAfter(habits, id, Number(over.id)) });
  };

  return (
    <DndContext sensors={sensors} collisionDetection={closestCenter} onDragEnd={onDragEnd}>
      <SortableContext
        items={habits.map((habit) => habit.id)}
        strategy={verticalListSortingStrategy}
      >
        <ul aria-label="Habits" className={LIST}>
          {habits.map((habit) => (
            <SortableHabitRow
              key={habit.id}
              habit={habit}
              timeZone={timeZone}
              onOpen={onOpen}
              onEdit={onEdit}
              onDelete={onDelete}
            />
          ))}
        </ul>
      </SortableContext>
    </DndContext>
  );
}

function SortableHabitRow({
  habit,
  timeZone,
  onOpen,
  onEdit,
  onDelete,
}: {
  habit: Habit;
  timeZone: string;
  onOpen: (habit: Habit) => void;
  onEdit: (habit: Habit) => void;
  onDelete: (habit: Habit) => void;
}) {
  const {
    setNodeRef,
    setActivatorNodeRef,
    listeners,
    attributes,
    transform,
    transition,
    isDragging,
  } = useSortable({ id: habit.id });
  const setArchived = useSetArchived();
  return (
    <li
      ref={setNodeRef}
      style={{ transform: CSS.Translate.toString(transform), transition }}
      className={cn(
        ROW,
        "relative pl-1 last:border-b-0",
        isDragging && "z-10 bg-surface opacity-90 shadow-lg",
      )}
    >
      <button
        type="button"
        ref={setActivatorNodeRef}
        {...attributes}
        {...listeners}
        aria-label={`Drag “${habit.name}”`}
        className="flex h-8 w-5 shrink-0 cursor-grab touch-none items-center justify-center rounded text-muted-foreground/60 hover:text-foreground focus-visible:outline-2 focus-visible:outline-ring active:cursor-grabbing"
      >
        <GripVertical className="size-4" aria-hidden />
      </button>
      <HabitLine
        habit={habit}
        onOpen={onOpen}
        details={<StreakLine habit={habit} />}
        menu={
          <>
            <DropdownMenuItem
              onSelect={() => {
                onEdit(habit);
              }}
            >
              <Pencil aria-hidden /> Edit
            </DropdownMenuItem>
            <UndoCheckInItem habit={habit} timeZone={timeZone} />
            <DropdownMenuItem
              onSelect={() => {
                setArchived.mutate({ id: habit.id, archived: true });
              }}
            >
              <Archive aria-hidden /> Archive
            </DropdownMenuItem>
            <DeleteItem
              onSelect={() => {
                onDelete(habit);
              }}
            />
          </>
        }
      />
      <RecentDays habit={habit} timeZone={timeZone} />
      <CheckInButton habit={habit} timeZone={timeZone} />
    </li>
  );
}

/**
 * The Archived section at the bottom of the page: it starts closed and is absent while nothing
 * is archived. Each row's menu unarchives or deletes its Habit.
 */
export function ArchivedHabits({
  habits,
  onOpen,
  onDelete,
}: {
  habits: Habit[];
  onOpen: (habit: Habit) => void;
  onDelete: (habit: Habit) => void;
}) {
  const [expanded, setExpanded] = useState(false);
  const setArchived = useSetArchived();
  if (habits.length === 0) return null;

  return (
    <section className="mt-6">
      <button
        type="button"
        aria-expanded={expanded}
        onClick={() => {
          setExpanded(!expanded);
        }}
        className="flex h-10 items-center gap-1.5 rounded-md px-1 text-sm font-semibold text-muted-foreground outline-none hover:text-foreground focus-visible:ring-2 focus-visible:ring-ring lg:h-8"
      >
        <ChevronRight
          className={cn("size-4 transition-transform", expanded && "rotate-90")}
          aria-hidden
        />
        Archived
      </button>
      {expanded && (
        <ul aria-label="Archived habits" className={cn(LIST, "mt-1")}>
          {habits.map((habit) => (
            <li key={habit.id} className={cn(ROW, "text-muted-foreground last:border-b-0")}>
              <HabitLine
                habit={habit}
                onOpen={onOpen}
                menu={
                  <>
                    <DropdownMenuItem
                      onSelect={() => {
                        setArchived.mutate({ id: habit.id, archived: false });
                      }}
                    >
                      <ArchiveRestore aria-hidden /> Unarchive
                    </DropdownMenuItem>
                    <DeleteItem
                      onSelect={() => {
                        onDelete(habit);
                      }}
                    />
                  </>
                }
              />
            </li>
          ))}
        </ul>
      )}
    </section>
  );
}
