import { useQuery } from "@tanstack/react-query";
import { ChevronDown, ChevronRight, ChevronUp, X } from "lucide-react";
import { useEffect, useState, type ReactNode } from "react";

import { Drawer, DrawerContent, DrawerTitle } from "@/components/ui/drawer";
import { Sheet, SheetContent, SheetTitle } from "@/components/ui/sheet";
import { Tabs, TabsContent } from "@/components/ui/tabs";
import { Tooltip, TooltipContent, TooltipTrigger } from "@/components/ui/tooltip";
import { ProjectIcon } from "@/features/projects/project-icon";
import { findProject } from "@/features/projects/projects";
import { useMediaQuery } from "@/lib/use-media-query";
import { plainMentions } from "@/features/people/mentions";

import { ActivityFeed } from "./activity-feed";
import { Attachments } from "./attachments";
import { CommentFooter, Comments } from "./comment-section";
import { DetailTabsList } from "./detail-tabs";
import { PropertyChips } from "./property-chips";
import { SubtaskSection } from "./subtask-section";
import { TaskActionsMenu } from "./task-actions";
import { TaskCheckbox } from "./task-checkbox";
import { DescriptionField, TitleField } from "./task-fields";
import { isClosed } from "./task-properties";
import { BlockedReasonField } from "./task-status";
import {
  sidebarQuery,
  taskQuery,
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
  const { data: task, isError } = useQuery({ ...taskQuery(taskId ?? 0), enabled: taskId !== null });
  // A link to a Task that is gone, or never was the user's, just shows the list.
  const open = taskId !== null && !isError;
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
  // A click on a toast, such as its Undo, is not a click away from the drawer.
  const keepOpenForToasts = (event: Event) => {
    if (event.target instanceof Element && event.target.closest("[data-sonner-toaster]")) {
      event.preventDefault();
    }
  };
  // Escape in a filled Quick add field, such as Add subtask, first closes its picker or clears it.
  const keepOpenForTyping = (event: KeyboardEvent) => {
    const { target } = event;
    if (target instanceof HTMLInputElement && target.role === "combobox" && target.value) {
      event.preventDefault();
    }
  };
  const returnFocus = (event: Event) => {
    event.preventDefault();
    document.querySelector<HTMLElement>(`[data-task-id="${String(lastOpened)}"]`)?.focus();
  };

  if (wide) {
    return (
      <Sheet open={open} onOpenChange={onOpenChange}>
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
          onInteractOutside={keepOpenForToasts}
          onEscapeKeyDown={keepOpenForTyping}
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
      open={open}
      onOpenChange={onOpenChange}
      snapPoints={SNAP_POINTS}
      activeSnapPoint={snap}
      setActiveSnapPoint={setSnap}
      fadeFromIndex={0}
    >
      <DrawerContent
        aria-describedby={undefined}
        onCloseAutoFocus={returnFocus}
        onInteractOutside={keepOpenForToasts}
        onEscapeKeyDown={keepOpenForTyping}
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
  const { mutate: setStatus } = useSetTaskStatus();
  const { data: sidebar } = useQuery(sidebarQuery);
  const taskProject = (sidebar && findProject(sidebar, task.project_id)) ?? project;
  const readOnly = taskProject.is_archived;
  const [tab, setTab] = useState("details");
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
        <Breadcrumb task={task} project={taskProject} onOpen={onOpen} />
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
        <TaskActionsMenu task={task} readOnly={readOnly} />
        <span className="mx-1 h-5 w-px bg-border" aria-hidden />
        <HeaderButton label="Close" shortcut="Esc" onClick={onClose}>
          <X className="size-4" aria-hidden />
        </HeaderButton>
      </header>

      {/* Scrolling the body mustn't drag the bottom sheet. */}
      <div className="min-h-0 flex-1 overflow-y-auto overscroll-contain" data-vaul-no-drag>
        {/* A disabled fieldset makes an archived Project's Task read-only in one place. */}
        <fieldset disabled={readOnly} className="min-w-0 px-5 pt-5 sm:px-6">
          <div className="flex items-start gap-3">
            <TaskCheckbox
              task={task}
              onToggle={() => {
                setStatus({ task, status: isClosed(task.status) ? "open" : "completed" });
              }}
              className="mt-1 size-[22px] rounded-md"
            />
            <TitleField task={task} className="flex-1 sm:text-[22px] sm:leading-snug" />
          </div>
          <PropertyChips task={task} project={taskProject} />
          {task.status === "blocked" && <BlockedReasonField task={task} className="mt-4" />}
        </fieldset>

        <Tabs value={tab} onValueChange={setTab} className="mt-5">
          <div className="sticky top-0 z-10 bg-surface px-5 sm:px-6">
            <DetailTabsList taskId={task.id} tab={tab} />
          </div>

          <TabsContent value="details" className="px-5 py-5 sm:px-6">
            <fieldset disabled={readOnly} className="min-w-0 space-y-7">
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
              <SubtaskSection task={task} readOnly={readOnly} onOpen={onOpen} />
              <Attachments taskId={task.id} />
              <Comments taskId={task.id} />
            </fieldset>
          </TabsContent>

          <TabsContent value="activity" className="px-5 py-5 sm:px-6">
            <ActivityFeed taskId={task.id} />
          </TabsContent>
        </Tabs>
      </div>

      {tab === "details" && !readOnly && <CommentFooter taskId={task.id} />}
    </div>
  );
}

/** Where the Task lives: its Project, then each parent from the root down, each one a link. */
function Breadcrumb({
  task,
  project,
  onOpen,
}: {
  task: Task;
  project: SidebarProject;
  onOpen: (taskId: number) => void;
}) {
  return (
    <nav
      aria-label="Breadcrumb"
      className="flex min-w-0 flex-1 items-center gap-1 text-xs text-muted-foreground"
    >
      <span className="flex shrink-0 items-center gap-1.5 font-semibold">
        <ProjectIcon project={project} className="size-3.5" />
        {project.name}
      </span>
      {task.ancestors.map((ancestor) => (
        <span key={ancestor.id} className="flex min-w-0 items-center gap-1">
          <ChevronRight className="size-3 shrink-0 opacity-60" aria-hidden />
          <button
            type="button"
            onClick={() => {
              onOpen(ancestor.id);
            }}
            className="truncate rounded px-1 py-0.5 hover:bg-surface-muted hover:text-foreground focus-visible:outline-2 focus-visible:outline-ring"
          >
            {plainMentions(ancestor.title)}
          </button>
        </span>
      ))}
    </nav>
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
