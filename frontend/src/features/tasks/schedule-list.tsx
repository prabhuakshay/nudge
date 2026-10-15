import { useInfiniteQuery, useQuery } from "@tanstack/react-query";
import { CalendarCheck, CalendarClock, CalendarDays, type LucideIcon } from "lucide-react";
import { useMemo, useState } from "react";

import { Badge } from "@/components/ui/badge";
import { cn } from "@/lib/utils";

import { useOpenTask } from "./open-task";
import { QuickAddCard } from "./quick-add-card";
import { useRowContext } from "./row-context";
import { addDays, todayIn, upcomingGroups, type ScheduleView } from "./schedule";
import { TaskDetail } from "./task-detail";
import { ClosedGroup, Group, TaskTableHeader } from "./task-list";
import { TreeRows, type RowContext } from "./task-row";
import { flatRows } from "./task-tree";
import { closedTodayQuery, viewTasksQuery, type SidebarProject, type Task } from "./tasks";

const TITLES: Record<ScheduleView, { title: string; icon: LucideIcon; tone: string }> = {
  today: { title: "Today", icon: CalendarCheck, tone: "bg-hue-green-soft text-hue-green" },
  upcoming: { title: "Upcoming", icon: CalendarDays, tone: "bg-hue-violet-soft text-hue-violet" },
};

/** Folding is for trees; these lists are flat, so nothing is ever folded. */
const NONE_FOLDED: ReadonlySet<number> = new Set();
const ignoreFold = () => undefined;

/**
 * Today or Upcoming as a table, its Tasks picked by date on the server. Today shows Overdue,
 * then Today, then a collapsed Closed today group; Upcoming shows a group per day for the coming
 * week, then per month. Rows are flat, a Subtask naming its parent above its title. Quick add
 * puts new Tasks in the Inbox, due today in Today and tomorrow in Upcoming.
 */
export function ScheduleList({
  view,
  inbox,
  timeZone,
  description,
}: {
  view: ScheduleView;
  /** The drawer's fallback Project; Quick add puts new Tasks there too. */
  inbox: SidebarProject;
  /** The user's zone, which says what date today is. */
  timeZone: string;
  description?: string;
}) {
  const { data: tasks = [] } = useQuery(viewTasksQuery(view));
  const [showClosed, setShowClosed] = useState(false);
  const closed = useInfiniteQuery({ ...closedTodayQuery, enabled: showClosed && view === "today" });
  const closedTasks = useMemo(
    () => (showClosed ? (closed.data?.pages.flatMap((page) => page.items) ?? []) : []),
    [showClosed, closed.data],
  );
  const today = todayIn(timeZone);
  const tomorrow = addDays(today, 1);
  const { openTaskId, setOpenTask } = useOpenTask();
  const context = useRowContext({ collapsed: NONE_FOLDED, onToggleCollapsed: ignoreFold });
  const order = [...tasks, ...closedTasks].map((task) => task.id);
  const { title, icon: Icon, tone } = TITLES[view];

  return (
    // `data-wide` lets the app shell drop its reading width for this table.
    <div data-wide className="mx-auto w-full max-w-6xl">
      <header className="mb-4 flex items-center gap-2.5 sm:gap-3">
        <span className={cn("flex size-9 shrink-0 items-center justify-center rounded-lg", tone)}>
          <Icon className="size-5" aria-hidden />
        </span>
        <div className="min-w-0">
          <h1 className="truncate text-2xl font-extrabold tracking-tight sm:text-3xl">{title}</h1>
          {description && <p className="truncate text-sm text-muted-foreground">{description}</p>}
        </div>
        <Badge variant="secondary" className="shrink-0 tabular-nums">
          {tasks.length} open
        </Badge>
      </header>

      <QuickAddCard view={{ kind: view, today, tomorrow }} />

      <div
        role="treegrid"
        aria-label={`${title} tasks`}
        className="rounded-xl border border-border bg-surface shadow-sm"
      >
        <TaskTableHeader />
        {view === "today" ? (
          <>
            <TodayGroups tasks={tasks} context={context} />
            <ClosedGroup
              label="Closed today"
              query={closed}
              empty={closedTasks.length === 0}
              expanded={showClosed}
              onExpandedChange={setShowClosed}
            >
              <TreeRows rows={flatRows(closedTasks)} context={context} />
            </ClosedGroup>
          </>
        ) : (
          <UpcomingGroups tasks={tasks} today={today} context={context} />
        )}
      </div>

      <TaskDetail
        taskId={openTaskId}
        project={inbox}
        order={order}
        onOpen={setOpenTask}
        onClose={() => {
          setOpenTask(null);
        }}
      />
    </div>
  );
}

function TodayGroups({ tasks, context }: { tasks: Task[]; context: RowContext }) {
  const overdue = tasks.filter((task) => task.is_overdue);
  const dueToday = tasks.filter((task) => !task.is_overdue);
  return (
    <>
      {overdue.length > 0 && (
        <Group
          icon={<CalendarClock className="size-3.5 text-warning" aria-hidden />}
          label="Overdue"
          count={overdue.length}
        >
          <TreeRows rows={flatRows(overdue)} context={context} />
        </Group>
      )}
      <Group
        icon={<CalendarCheck className="size-3.5 text-success" aria-hidden />}
        label="Today"
        count={dueToday.length}
      >
        {dueToday.length === 0 ? (
          <p className="px-4 py-8 text-center text-sm text-muted-foreground">
            Nothing else due today.
          </p>
        ) : (
          <TreeRows rows={flatRows(dueToday)} context={context} />
        )}
      </Group>
    </>
  );
}

function UpcomingGroups({
  tasks,
  today,
  context,
}: {
  tasks: Task[];
  today: string;
  context: RowContext;
}) {
  const groups = upcomingGroups(tasks, today);
  if (groups.length === 0) {
    return (
      <p className="px-4 py-8 text-center text-sm text-muted-foreground">
        Nothing coming up. Tasks with a later due date show here, grouped by day.
      </p>
    );
  }
  return groups.map((group) => (
    <Group
      key={group.key}
      icon={<CalendarDays className="size-3.5 text-muted-foreground" aria-hidden />}
      label={group.label}
      hint={group.hint}
      count={group.tasks.length}
    >
      <TreeRows rows={flatRows(group.tasks)} context={context} />
    </Group>
  ));
}
