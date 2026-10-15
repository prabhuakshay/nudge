import { CalendarDays, ChevronDown, Flag } from "lucide-react";
import type { ComponentProps } from "react";
import { toast } from "sonner";

import { ProjectIcon } from "@/features/projects/project-icon";
import { ProjectPicker } from "@/features/projects/project-picker";
import { cn } from "@/lib/utils";

import { DatePicker } from "./date-picker";
import { dueName } from "./due";
import { DueBadge } from "./due-badge";
import { PriorityMenu } from "./task-priority";
import { PRIORITY, STATUS } from "./task-properties";
import { StatusMenu } from "./task-status";
import { useMoveTaskToProject } from "./task-placement";
import type { SidebarProject, Task } from "./tasks";

function Chip({ className, ...props }: ComponentProps<"button">) {
  return (
    <button
      type="button"
      className={cn(
        "inline-flex h-8 items-center gap-1.5 rounded-lg border px-2.5 text-xs font-semibold transition-colors focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ring",
        className,
      )}
      {...props}
    />
  );
}

/** The drawer's row of property chips under the title, each coloured by its value and opening its picker. */
export function PropertyChips({ task, project }: { task: Task; project: SidebarProject }) {
  const status = STATUS[task.status];
  const StatusIcon = status.icon;
  const priority = PRIORITY[task.priority];
  const priorityLabel = priority.long;

  return (
    <div className="mt-4 flex flex-wrap items-center gap-1.5 sm:pl-9">
      <StatusMenu task={task}>
        <Chip
          aria-label={`Status: ${status.label}`}
          className={cn("border-transparent hover:brightness-95", status.soft, status.text)}
        >
          <StatusIcon className="size-3.5" aria-hidden />
          {status.label}
          <ChevronDown className="size-3 opacity-60" aria-hidden />
        </Chip>
      </StatusMenu>

      <PriorityMenu task={task}>
        <Chip
          aria-label={`Priority: ${priorityLabel}`}
          className={
            task.priority > 0
              ? cn("border-transparent", priority.soft, priority.text)
              : "border-dashed border-border text-muted-foreground hover:bg-surface-muted"
          }
        >
          <Flag className={cn("size-3.5", task.priority > 0 && "fill-current")} aria-hidden />
          {task.priority > 0 ? priorityLabel : "Priority"}
        </Chip>
      </PriorityMenu>

      <DatePicker task={task}>
        <Chip
          aria-label={`Date: ${dueName(task, new Date())}`}
          className={
            task.due_date === null
              ? "border-dashed border-border text-muted-foreground hover:bg-surface-muted"
              : "border-transparent bg-surface-muted hover:brightness-95"
          }
        >
          <CalendarDays className="size-3.5 text-muted-foreground" aria-hidden />
          {task.due_date === null ? "Date" : <DueBadge task={task} />}
        </Chip>
      </DatePicker>

      {/* A Subtask lives in its root's Project, so it has no Project of its own to change. */}
      {task.parent_id === null && <ProjectChip task={task} project={project} />}
    </div>
  );
}

/** The Task's Project; picking another Project moves the Task there. */
function ProjectChip({ task, project }: { task: Task; project: SidebarProject }) {
  const { mutate: moveTask } = useMoveTaskToProject();
  return (
    <ProjectPicker
      currentId={task.project_id}
      onSelect={(target) => {
        moveTask(
          { id: task.id, projectId: target.id },
          { onSuccess: () => toast(`Moved to ${target.name}`) },
        );
      }}
    >
      <Chip
        aria-label={`Project: ${project.name}. Move to another project`}
        className="border-border bg-surface text-foreground hover:bg-surface-muted"
      >
        <ProjectIcon project={project} className="size-3.5" />
        {project.name}
      </Chip>
    </ProjectPicker>
  );
}
