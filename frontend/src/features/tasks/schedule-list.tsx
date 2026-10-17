import { useInfiniteQuery, useQuery } from "@tanstack/react-query";
import {
  CalendarCheck,
  CalendarClock,
  CalendarDays,
  CalendarOff,
  Layers,
  type LucideIcon,
} from "lucide-react";
import { useMemo, useState } from "react";

import { Badge } from "@/components/ui/badge";
import { cn } from "@/lib/utils";

import { CountdownHeadline } from "./countdown-headline";
import { useOpenTask } from "./open-task";
import { QuickAddCard } from "./quick-add-card";
import { useRowContext } from "./row-context";
import { addDays, allSections, todayIn, upcomingGroups, type ScheduleView } from "./schedule";
import { SelectionBar } from "./selection-bar";
import { TaskDetail } from "./task-detail";
import { ClosedGroup, Group, PinnedGroup, TaskTableHeader } from "./task-groups";
import { TreeRows, type RowContext } from "./task-row";
import { flatRows } from "./task-tree";
import { closedTodayQuery, viewTasksQuery, type SidebarProject, type Task } from "./tasks";

const TITLES: Record<ScheduleView, { title: string; icon: LucideIcon; tone: string }> = {
  today: { title: "Today", icon: CalendarCheck, tone: "bg-hue-green-soft text-hue-green" },
  upcoming: { title: "Upcoming", icon: CalendarDays, tone: "bg-hue-violet-soft text-hue-violet" },
  all: { title: "All", icon: Layers, tone: "bg-hue-blue-soft text-hue-blue" },
};

/** Folding is for trees; these lists are flat, so nothing is ever folded. */
const NONE_FOLDED: ReadonlySet<number> = new Set();
const ignoreFold = () => undefined;

/**
 * Today, Upcoming or All as a table, its Tasks picked by date on the server. Each shows Pinned
 * Tasks first. Today names the soonest Countdown to come under its title, then shows Overdue,
 * then Today, then a collapsed Closed today group; Upcoming shows a group per day for the coming
 * week, then per month; All shows Overdue, Today, then Upcoming's groups, then No date. Rows are flat, a Subtask naming its parent above its title,
 * and each row names its Project. Quick add puts new Tasks in the Inbox, due today in Today,
 * tomorrow in Upcoming and undated in All.
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
  const pinned = useMemo(() => tasks.filter((task) => task.pinned_at !== null), [tasks]);
  const unpinned = useMemo(() => tasks.filter((task) => task.pinned_at === null), [tasks]);
  const [showClosed, setShowClosed] = useState(false);
  const closed = useInfiniteQuery({ ...closedTodayQuery, enabled: showClosed && view === "today" });
  const closedTasks = useMemo(
    () => (showClosed ? (closed.data?.pages.flatMap((page) => page.items) ?? []) : []),
    [showClosed, closed.data],
  );
  const today = todayIn(timeZone);
  const tomorrow = addDays(today, 1);
  const { openTaskId, setOpenTask } = useOpenTask();
  const context = useRowContext({
    collapsed: NONE_FOLDED,
    onToggleCollapsed: ignoreFold,
    showProject: true,
  });
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
          {view === "today" && <CountdownHeadline today={today} onOpen={setOpenTask} />}
        </div>
        <Badge variant="secondary" className="shrink-0 tabular-nums">
          {tasks.length} open
        </Badge>
      </header>

      <QuickAddCard view={view === "all" ? { kind: "all" } : { kind: view, today, tomorrow }} />

      <div
        role="treegrid"
        aria-label={`${title} tasks`}
        className="rounded-xl border border-border bg-surface shadow-sm"
      >
        <TaskTableHeader />
        {pinned.length > 0 && (
          <PinnedGroup count={pinned.length}>
            <TreeRows rows={flatRows(pinned)} context={context} />
          </PinnedGroup>
        )}
        {view === "today" ? (
          <>
            <TodayGroups tasks={unpinned} context={context} />
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
        ) : view === "upcoming" ? (
          <UpcomingGroups tasks={unpinned} today={today} context={context} />
        ) : (
          <AllGroups tasks={unpinned} today={today} context={context} />
        )}
      </div>

      <SelectionBar tasks={[...tasks, ...closedTasks]} context={context} />

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
      <OverdueGroup tasks={overdue} context={context} />
      <TodayGroup tasks={dueToday} context={context} empty="Nothing else due today." />
    </>
  );
}

/** The Overdue group, left out when nothing is overdue. */
function OverdueGroup({ tasks, context }: { tasks: Task[]; context: RowContext }) {
  if (tasks.length === 0) return null;
  return (
    <Group
      icon={<CalendarClock className="size-3.5 text-warning" aria-hidden />}
      label="Overdue"
      count={tasks.length}
    >
      <TreeRows rows={flatRows(tasks)} context={context} />
    </Group>
  );
}

/** The Today group, saying `empty` when it has no Tasks. */
function TodayGroup({
  tasks,
  context,
  empty,
}: {
  tasks: Task[];
  context: RowContext;
  /** What the group says when it has no Tasks. */
  empty?: string;
}) {
  return (
    <Group
      icon={<CalendarCheck className="size-3.5 text-success" aria-hidden />}
      label="Today"
      count={tasks.length}
    >
      {tasks.length === 0 && empty ? (
        <p className="px-4 py-8 text-center text-sm text-muted-foreground">{empty}</p>
      ) : (
        <TreeRows rows={flatRows(tasks)} context={context} />
      )}
    </Group>
  );
}

/** All's groups: Overdue, Today, a group per later day or month, then No date. */
function AllGroups({
  tasks,
  today,
  context,
}: {
  tasks: Task[];
  today: string;
  context: RowContext;
}) {
  if (tasks.length === 0) {
    return (
      <p className="px-4 py-8 text-center text-sm text-muted-foreground">
        Nothing open. Every open Task in the Inbox and your Projects shows here.
      </p>
    );
  }
  const sections = allSections(tasks, today);
  return (
    <>
      <OverdueGroup tasks={sections.overdue} context={context} />
      {sections.today.length > 0 && <TodayGroup tasks={sections.today} context={context} />}
      <DayGroups tasks={sections.later} today={today} context={context} />
      {sections.undated.length > 0 && (
        <Group
          icon={<CalendarOff className="size-3.5 text-muted-foreground" aria-hidden />}
          label="No date"
          count={sections.undated.length}
        >
          <TreeRows rows={flatRows(sections.undated)} context={context} />
        </Group>
      )}
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
  if (tasks.length === 0) {
    return (
      <p className="px-4 py-8 text-center text-sm text-muted-foreground">
        Nothing coming up. Tasks with a later due date show here, grouped by day.
      </p>
    );
  }
  return <DayGroups tasks={tasks} today={today} context={context} />;
}

/** A group per day for the coming week, then per month. */
function DayGroups({
  tasks,
  today,
  context,
}: {
  tasks: Task[];
  today: string;
  context: RowContext;
}) {
  return upcomingGroups(tasks, today).map((group) => (
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
