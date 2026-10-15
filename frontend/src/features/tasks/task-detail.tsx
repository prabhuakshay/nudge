import { useInfiniteQuery, useQuery } from "@tanstack/react-query";
import { ChevronDown, ChevronUp, X } from "lucide-react";
import { useEffect, useState, type ReactNode } from "react";
import { toast } from "sonner";

import { Drawer, DrawerContent, DrawerTitle } from "@/components/ui/drawer";
import { Sheet, SheetContent, SheetTitle } from "@/components/ui/sheet";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Tooltip, TooltipContent, TooltipTrigger } from "@/components/ui/tooltip";
import { ProjectIcon } from "@/features/projects/project-icon";
import { ProjectPicker } from "@/features/projects/project-picker";
import { allProjects } from "@/features/projects/projects";
import { useMediaQuery } from "@/lib/use-media-query";
import { cn } from "@/lib/utils";

import { ActivityFeed } from "./activity-feed";
import { TaskCheckbox } from "./task-checkbox";
import { DescriptionField, TitleField } from "./task-fields";
import {
  sidebarQuery,
  taskActivityQuery,
  taskQuery,
  useMoveTaskToProject,
  useSetTaskStatus,
  type SidebarProject,
  type TaskDetail as Task,
} from "./tasks";

/** The bottom sheet opens at 60% of the screen and drags up to all of it. */
const PEEK = 0.6;
const SNAP_POINTS = [PEEK, 1];

type TaskDetailProps = {
  /** The open Task, or null when the drawer is closed. */
  taskId: number | null;
  /** The list the Task was opened from. */
  project: SidebarProject;
  /** Task ids in the list's current order, so J/K step the way the list reads. */
  order: number[];
  onOpen: (taskId: number) => void;
  onClose: () => void;
};

/**
 * A Task opened from a list: a side drawer from `sm`, a bottom sheet on phones. Closing it hands
 * focus back to the Task's row, so keyboard users carry on where they were.
 */
export function TaskDetail(props: TaskDetailProps) {
  const wide = useMediaQuery("(min-width: 640px)");
  const { taskId, onClose } = props;
  const { data: task } = useQuery({ ...taskQuery(taskId ?? 0), enabled: taskId !== null });
  const [snap, setSnap] = useState<number | string | null>(PEEK);
  const [lastOpened, setLastOpened] = useState(taskId);
  if (taskId !== null && taskId !== lastOpened) {
    setLastOpened(taskId);
    setSnap(PEEK);
  }

  const body = task?.id === taskId && <DetailBody key={task.id} {...props} task={task} />;
  const onOpenChange = (open: boolean) => {
    if (!open) onClose();
  };
  const returnFocus = (event: Event) => {
    event.preventDefault();
    document.querySelector<HTMLElement>(`[data-task-id="${String(lastOpened)}"]`)?.focus();
  };

  if (wide) {
    return (
      <Sheet open={taskId !== null} onOpenChange={onOpenChange}>
        <SheetContent
          side="right"
          showClose={false}
          aria-describedby={undefined}
          onOpenAutoFocus={(event) => {
            // Focus the drawer itself, not its first field, so J/K work straight away.
            event.preventDefault();
            (event.currentTarget as HTMLElement | null)?.focus();
          }}
          onCloseAutoFocus={returnFocus}
          className="gap-0 p-0 sm:max-w-[600px]"
        >
          <SheetTitle className="sr-only">Task details</SheetTitle>
          {body}
        </SheetContent>
      </Sheet>
    );
  }
  return (
    <Drawer
      open={taskId !== null}
      onOpenChange={onOpenChange}
      snapPoints={SNAP_POINTS}
      activeSnapPoint={snap}
      setActiveSnapPoint={setSnap}
      fadeFromIndex={0}
    >
      <DrawerContent
        aria-describedby={undefined}
        onCloseAutoFocus={returnFocus}
        className="h-[96dvh] max-h-[96dvh]"
      >
        <DrawerTitle className="sr-only">Task details</DrawerTitle>
        {body}
      </DrawerContent>
    </Drawer>
  );
}

/** Whether a key press belongs to a field or menu rather than to the drawer's shortcuts. */
function isEditing(target: EventTarget | null) {
  return (
    target instanceof Element &&
    target.closest("input, textarea, select, [contenteditable], [role=menu], [role=listbox]") !==
      null
  );
}

function DetailBody({ task, project, order, onOpen, onClose }: TaskDetailProps & { task: Task }) {
  const { mutate: setStatus } = useSetTaskStatus(project.id);
  const { data: sidebar } = useQuery(sidebarQuery);
  const taskProject =
    (sidebar && allProjects(sidebar).find((candidate) => candidate.id === task.project_id)) ??
    project;
  const [tab, setTab] = useState("details");
  const { data: activity } = useInfiniteQuery(taskActivityQuery(task.id));
  const activityCount = activity?.pages[0]?.count;
  const index = order.indexOf(task.id);
  const previous = index > 0 ? order[index - 1] : undefined;
  const next = index >= 0 ? order[index + 1] : undefined;

  useEffect(() => {
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.metaKey || event.ctrlKey || event.altKey || isEditing(event.target)) return;
      const step = { j: next, ArrowDown: next, k: previous, ArrowUp: previous }[event.key];
      if (step === undefined) return;
      event.preventDefault();
      onOpen(step);
    };
    window.addEventListener("keydown", onKeyDown);
    return () => {
      window.removeEventListener("keydown", onKeyDown);
    };
  }, [next, previous, onOpen]);

  return (
    <div className="flex min-h-0 flex-1 flex-col">
      <header className="flex h-14 shrink-0 items-center gap-1 border-b border-border px-3 sm:px-4">
        <p className="flex min-w-0 flex-1 items-center gap-1.5 text-xs font-semibold text-muted-foreground">
          <ProjectIcon project={taskProject} className="size-3.5" />
          <span className="truncate">{taskProject.name}</span>
        </p>
        <HeaderButton
          label="Previous task"
          shortcut="K"
          disabled={previous === undefined}
          onClick={() => {
            if (previous !== undefined) onOpen(previous);
          }}
        >
          <ChevronUp className="size-4" aria-hidden />
        </HeaderButton>
        <HeaderButton
          label="Next task"
          shortcut="J"
          disabled={next === undefined}
          onClick={() => {
            if (next !== undefined) onOpen(next);
          }}
        >
          <ChevronDown className="size-4" aria-hidden />
        </HeaderButton>
        <span className="mx-1 h-5 w-px bg-border" aria-hidden />
        <HeaderButton label="Close" shortcut="Esc" onClick={onClose}>
          <X className="size-4" aria-hidden />
        </HeaderButton>
      </header>

      {/* Scrolling the body mustn't drag the bottom sheet. */}
      <div className="min-h-0 flex-1 overflow-y-auto overscroll-contain" data-vaul-no-drag>
        <div className="flex items-start gap-3 px-5 pt-5 sm:px-6">
          <TaskCheckbox
            task={task}
            onToggle={() => {
              setStatus({ id: task.id, status: task.status === "open" ? "completed" : "open" });
            }}
            className="mt-1 size-[22px] rounded-md"
          />
          <TitleField task={task} className="flex-1 sm:text-[22px] sm:leading-snug" />
        </div>

        <div className="flex flex-wrap gap-2 px-5 pt-3 sm:px-6">
          <ProjectChip task={task} project={taskProject} />
        </div>

        <Tabs value={tab} onValueChange={setTab} className="mt-5">
          <div className="sticky top-0 z-10 bg-surface px-5 sm:px-6">
            <TabsList variant="underline" className="w-full justify-start gap-6">
              <TabsTrigger value="details">Details</TabsTrigger>
              <TabsTrigger value="activity">
                Activity{" "}
                {activityCount !== undefined && (
                  <CountPill active={tab === "activity"}>{activityCount}</CountPill>
                )}
              </TabsTrigger>
            </TabsList>
          </div>

          <TabsContent value="details" className="px-5 py-5 sm:px-6">
            <section aria-labelledby="task-description">
              <h3
                id="task-description"
                className="mb-2 text-[11px] font-bold tracking-wider text-muted-foreground uppercase"
              >
                Description
              </h3>
              <div className="rounded-xl border border-border bg-surface-muted/40 px-3.5 py-3">
                <DescriptionField task={task} />
              </div>
            </section>
          </TabsContent>

          <TabsContent value="activity" className="px-5 py-5 sm:px-6">
            <ActivityFeed taskId={task.id} />
          </TabsContent>
        </Tabs>
      </div>
    </div>
  );
}

/** The Task's Project as a chip; picking another Project moves the Task there. */
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
      <button
        type="button"
        aria-label={`Project: ${project.name}. Move to another project`}
        className="inline-flex h-8 items-center gap-1.5 rounded-lg border border-border bg-surface px-2.5 text-xs font-semibold text-foreground transition-colors hover:bg-surface-muted focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ring"
      >
        <ProjectIcon project={project} className="size-3.5" />
        {project.name}
      </button>
    </ProjectPicker>
  );
}

/** A tab's count, highlighted while its tab is open. */
function CountPill({ active, children }: { active: boolean; children: ReactNode }) {
  return (
    <span
      className={cn(
        "rounded-full px-1.5 py-px text-[10px] font-bold tabular-nums",
        active ? "bg-primary-soft text-primary" : "bg-surface-muted text-muted-foreground",
      )}
    >
      {children}
    </span>
  );
}

function HeaderButton({
  label,
  shortcut,
  disabled,
  onClick,
  children,
}: {
  label: string;
  shortcut: string;
  disabled?: boolean;
  onClick: () => void;
  children: ReactNode;
}) {
  return (
    <Tooltip>
      <TooltipTrigger asChild>
        <button
          type="button"
          aria-label={label}
          aria-keyshortcuts={shortcut === "Esc" ? "Escape" : shortcut}
          disabled={disabled}
          onClick={onClick}
          className="flex size-11 shrink-0 items-center justify-center rounded-md text-muted-foreground transition-colors hover:bg-surface-muted hover:text-foreground disabled:pointer-events-none disabled:opacity-35 sm:size-8"
        >
          {children}
        </button>
      </TooltipTrigger>
      <TooltipContent>
        {label} <span className="ml-1 opacity-60">{shortcut}</span>
      </TooltipContent>
    </Tooltip>
  );
}
