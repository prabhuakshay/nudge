import { CalendarDays, ChevronDown, Flag, Hash } from "lucide-react";
import type { ComponentProps } from "react";

import { ProjectIcon } from "@/features/projects/project-icon";
import { ProjectPicker } from "@/features/projects/project-picker";
import { ShortcutTooltip } from "@/features/shortcuts/shortcut-tooltip";
import { TagBadge } from "@/features/tags/tag-badge";
import { TagPicker } from "@/features/tags/tag-picker";
import { cn } from "@/lib/utils";

import { DatePicker } from "./date-picker";
import { useDetailPicker } from "./detail-verbs";
import { dueName } from "./due";
import { DueBadge } from "./due-badge";
import { PriorityMenu } from "./task-priority";
import { PRIORITY, STATUS } from "./task-properties";
import { StatusMenu } from "./task-status";
import type { SidebarProject, Task } from "./tasks";
import { useUndoableTaskChanges } from "./task-undo";

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
  const datePicker = useDetailPicker("setDate");
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
        <ShortcutTooltip label="Set priority" shortcut="setPriority">
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
        </ShortcutTooltip>
      </PriorityMenu>

      <DatePicker task={task} {...datePicker}>
        <ShortcutTooltip label="Set date" shortcut="setDate">
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
        </ShortcutTooltip>
      </DatePicker>

      {/* A Subtask lives in its root's Project, so it has no Project of its own to change. */}
      {task.parent_id === null && <ProjectChip task={task} project={project} />}

      <TagChips task={task} />
    </div>
  );
}

/** The Task's Tags, each with a × to take it off, then a chip that opens the Tag picker. */
function TagChips({ task }: { task: Task }) {
  const { removeTag } = useUndoableTaskChanges();
  const tagPicker = useDetailPicker("addTag");
  return (
    <>
      {task.tags.map((tag) => (
        <TagBadge
          key={tag.id}
          tag={tag}
          className="h-8 rounded-lg px-2.5 text-xs"
          onRemove={() => {
            removeTag([task], tag);
          }}
        />
      ))}
      <TagPicker task={task} {...tagPicker}>
        <ShortcutTooltip label="Add tag" shortcut="addTag">
          <Chip className="border-dashed border-border text-muted-foreground hover:bg-surface-muted">
            <Hash className="size-3.5" aria-hidden />
            {task.tags.length ? "Tag" : "Add tag"}
          </Chip>
        </ShortcutTooltip>
      </TagPicker>
    </>
  );
}

/** The Task's Project; picking another Project moves the Task there. */
function ProjectChip({ task, project }: { task: Task; project: SidebarProject }) {
  const { moveTo } = useUndoableTaskChanges();
  const projectPicker = useDetailPicker("moveToProject");
  return (
    <ProjectPicker
      {...projectPicker}
      currentId={task.project_id}
      onSelect={(target) => {
        moveTo([task], target);
      }}
    >
      <ShortcutTooltip label="Move to project" shortcut="moveToProject">
        <Chip
          aria-label={`Project: ${project.name}. Move to another project`}
          className="border-border bg-surface text-foreground hover:bg-surface-muted"
        >
          <ProjectIcon project={project} className="size-3.5" />
          {project.name}
        </Chip>
      </ShortcutTooltip>
    </ProjectPicker>
  );
}
