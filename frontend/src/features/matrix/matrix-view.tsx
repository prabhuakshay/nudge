import { useQuery } from "@tanstack/react-query";
import { LayoutGrid } from "lucide-react";
import { useCallback, useMemo } from "react";

import { Badge } from "@/components/ui/badge";
import { useOpenTask } from "@/features/tasks/open-task";
import { todayIn } from "@/features/tasks/schedule";
import { useSetTaskStatus } from "@/features/tasks/set-status";
import { TaskDetail } from "@/features/tasks/task-detail";
import { isClosed } from "@/features/tasks/task-properties";
import { viewTasksQuery, type SidebarProject, type Task } from "@/features/tasks/tasks";
import { useMediaQuery } from "@/lib/use-media-query";

import { useCollapsedQuadrants } from "./collapsed-quadrants";
import { QuadrantSection } from "./quadrant-section";
import { matrixQuadrants, QUADRANTS } from "./quadrants";

/**
 * The Matrix: every open root Task All shows, sorted into four Quadrants by whether it is
 * Important and whether it is Urgent on the user's clock. From `lg` the Quadrants form a 2×2 grid,
 * Important on top and Urgent on the left; on phones they stack as sections that fold away.
 */
export function MatrixView({
  inbox,
  timeZone,
}: {
  /** The drawer's fallback Project. */
  inbox: SidebarProject;
  /** The user's zone, which says what date today is. */
  timeZone: string;
}) {
  const { data: tasks = [] } = useQuery(viewTasksQuery("all"));
  const today = todayIn(timeZone);
  const quadrants = useMemo(() => matrixQuadrants(tasks, today), [tasks, today]);
  const order = QUADRANTS.flatMap((id) => quadrants[id].map((task) => task.id));
  const wide = useMediaQuery("(min-width: 1024px)");
  const folds = useCollapsedQuadrants();
  const { openTaskId, setOpenTask } = useOpenTask();
  const { mutate: setStatus } = useSetTaskStatus();
  const toggle = useCallback(
    (task: Task) => {
      setStatus({ task, status: isClosed(task.status) ? "open" : "completed" });
    },
    [setStatus],
  );

  return (
    // `data-wide` lets the app shell drop its reading width for the grid.
    <div data-wide className="mx-auto w-full max-w-6xl">
      <header className="mb-4 flex items-center gap-2.5 sm:gap-3">
        <span className="flex size-9 shrink-0 items-center justify-center rounded-lg bg-hue-orange-soft text-hue-orange">
          <LayoutGrid className="size-5" aria-hidden />
        </span>
        <h1 className="truncate text-2xl font-extrabold tracking-tight sm:text-3xl">Matrix</h1>
        <Badge variant="secondary" className="shrink-0 tabular-nums">
          {order.length} open
        </Badge>
      </header>

      <div className="flex flex-col gap-3 lg:grid lg:grid-cols-2">
        {QUADRANTS.map((id) => (
          <QuadrantSection
            key={id}
            quadrant={id}
            tasks={quadrants[id]}
            today={today}
            openId={openTaskId}
            onOpen={setOpenTask}
            onToggle={toggle}
            fold={
              wide
                ? undefined
                : {
                    collapsed: folds.collapsed.includes(id),
                    onToggle: () => {
                      folds.toggle(id);
                    },
                  }
            }
          />
        ))}
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
