import { useQuery } from "@tanstack/react-query";
import { addDays, format, nextMonday } from "date-fns";
import {
  CalendarDays,
  Check,
  CircleDot,
  Flag,
  FolderInput,
  Minus,
  Tag as TagIcon,
  Trash2,
  X,
} from "lucide-react";
import { useState, type ComponentProps, type ReactNode } from "react";

import { Button } from "@/components/ui/button";
import { Calendar } from "@/components/ui/calendar";
import {
  Command,
  CommandEmpty,
  CommandGroup,
  CommandInput,
  CommandItem,
  CommandList,
} from "@/components/ui/command";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { ProjectPicker } from "@/features/projects/project-picker";
import { useShortcuts } from "@/features/shortcuts/use-shortcuts";
import { tagHue } from "@/features/tags/tags";
import { cn } from "@/lib/utils";

import { PRIORITIES, PRIORITY, STATUS, STATUSES } from "./task-properties";
import type { RowContext } from "./task-row";
import { hasTag, useUndoableTaskChanges } from "./task-undo";
import { sidebarQuery, type Task } from "./tasks";

type Changes = ReturnType<typeof useUndoableTaskChanges>;

/** The chosen Tasks and the changes to make to them. */
type BarProps = { chosen: Task[]; changes: Changes };

const isoDate = (day: Date) => format(day, "yyyy-MM-dd");

/**
 * The "N selected" bar: floats at the bottom of a list while rows are selected and changes them
 * all at once: Status, Priority, due date, Tags, Project, or Trash. Esc clears the selection.
 * `tasks` are the list's rows; the selection may name rows that have since left the list.
 */
export function SelectionBar({ tasks, context }: { tasks: Task[]; context: RowContext }) {
  const { selectedIds, clearSelection } = context;
  const chosen = tasks.filter((task) => selectedIds.has(task.id));
  const changes = useUndoableTaskChanges();
  useShortcuts({ clearSelection }, chosen.length > 0);
  if (chosen.length === 0) return null;
  const projects = new Set(chosen.map((task) => task.project_id));
  const [onlyProject = 0] = projects.size === 1 ? projects : [];

  return (
    <div
      role="toolbar"
      aria-label="Selected tasks"
      className="fixed inset-x-0 bottom-6 z-40 mx-auto flex w-fit items-center gap-1 rounded-xl border border-border bg-surface p-1.5 pl-4 shadow-lg"
    >
      <span role="status" className="mr-2 text-sm font-semibold tabular-nums">
        {chosen.length} selected
      </span>
      <StatusMenu chosen={chosen} changes={changes} />
      <PriorityMenu chosen={chosen} changes={changes} />
      <DueMenu chosen={chosen} changes={changes} />
      <TagMenu chosen={chosen} changes={changes} />
      <ProjectPicker
        currentId={onlyProject}
        onSelect={(project) => {
          changes.moveTo(chosen, project);
        }}
      >
        <BarButton icon={<FolderInput />}>Move</BarButton>
      </ProjectPicker>
      <Button
        variant="ghost"
        onClick={() => {
          changes.remove(chosen, tasks);
        }}
        className="text-danger hover:text-danger"
      >
        <Trash2 aria-hidden />
        Delete
      </Button>
      <Button variant="ghost" size="icon" aria-label="Clear the selection" onClick={clearSelection}>
        <X aria-hidden />
      </Button>
    </div>
  );
}

/** One of the bar's menu buttons; it forwards the props a menu trigger gives it. */
function BarButton({
  icon,
  children,
  ...props
}: { icon: ReactNode; children: ReactNode } & ComponentProps<"button">) {
  return (
    <Button variant="ghost" {...props}>
      <span aria-hidden className="contents">
        {icon}
      </span>
      {children}
    </Button>
  );
}

function StatusMenu({ chosen, changes }: BarProps) {
  return (
    <DropdownMenu>
      <DropdownMenuTrigger asChild>
        <BarButton icon={<CircleDot />}>Status</BarButton>
      </DropdownMenuTrigger>
      <DropdownMenuContent align="center" side="top" className="w-48">
        <DropdownMenuLabel>Status</DropdownMenuLabel>
        {STATUSES.map((status) => {
          const { label, icon: Icon, text } = STATUS[status];
          return (
            <DropdownMenuItem
              key={status}
              onSelect={() => {
                changes.setStatus(chosen, status);
              }}
            >
              <Icon className={cn("size-4", text)} aria-hidden />
              {label}
            </DropdownMenuItem>
          );
        })}
      </DropdownMenuContent>
    </DropdownMenu>
  );
}

function PriorityMenu({ chosen, changes }: BarProps) {
  return (
    <DropdownMenu>
      <DropdownMenuTrigger asChild>
        <BarButton icon={<Flag />}>Priority</BarButton>
      </DropdownMenuTrigger>
      <DropdownMenuContent align="center" side="top" className="w-44">
        <DropdownMenuLabel>Priority</DropdownMenuLabel>
        {PRIORITIES.map((priority) => (
          <DropdownMenuItem
            key={priority}
            onSelect={() => {
              changes.setPriority(chosen, priority);
            }}
          >
            <Flag
              className={cn("size-4", priority > 0 && "fill-current", PRIORITY[priority].text)}
              aria-hidden
            />
            {PRIORITY[priority].long}
          </DropdownMenuItem>
        ))}
      </DropdownMenuContent>
    </DropdownMenu>
  );
}

/** Quick days and a calendar; the Tasks become due that day, all-day. */
function DueMenu({ chosen, changes }: BarProps) {
  const [open, setOpen] = useState(false);
  const today = new Date();
  const pick = (day: Date) => {
    setOpen(false);
    changes.setDueDate(chosen, isoDate(day));
  };
  const quick = [
    { label: "Today", day: today },
    { label: "Tomorrow", day: addDays(today, 1) },
    { label: "Next week", day: nextMonday(today) },
  ];
  return (
    <Popover open={open} onOpenChange={setOpen}>
      <PopoverTrigger asChild>
        <BarButton icon={<CalendarDays />}>Date</BarButton>
      </PopoverTrigger>
      <PopoverContent side="top" aria-label="Due date" className="w-[19rem] p-0">
        <div className="grid grid-cols-3 gap-1 border-b border-border p-2">
          {quick.map(({ label, day }) => (
            <Button
              key={label}
              variant="ghost"
              onClick={() => {
                pick(day);
              }}
            >
              {label}
            </Button>
          ))}
        </div>
        <Calendar
          mode="single"
          defaultMonth={today}
          onSelect={(day: Date | undefined) => {
            if (day) pick(day);
          }}
          className="mx-auto"
        />
      </PopoverContent>
    </Popover>
  );
}

/**
 * The user's Tags, each ticked when every selected Task has it and dashed when only some do.
 * Picking a Tag that every Task has takes it off them all; any other puts it on them all.
 */
function TagMenu({ chosen, changes }: BarProps) {
  const [open, setOpen] = useState(false);
  const { data: sidebar } = useQuery(sidebarQuery);
  const tags = sidebar?.tags ?? [];
  return (
    <Popover open={open} onOpenChange={setOpen}>
      <PopoverTrigger asChild>
        <BarButton icon={<TagIcon />}>Tags</BarButton>
      </PopoverTrigger>
      <PopoverContent side="top" className="w-60 p-0">
        <Command>
          <CommandInput placeholder="Find a tag…" aria-label="Find a tag" />
          <CommandList>
            <CommandEmpty>No tags match.</CommandEmpty>
            <CommandGroup>
              {tags.map((tag) => {
                const count = chosen.filter((task) => hasTag(task, tag)).length;
                const all = count === chosen.length;
                return (
                  <CommandItem
                    key={tag.id}
                    value={`${tag.name} ${String(tag.id)}`}
                    onSelect={() => {
                      setOpen(false);
                      if (all) changes.removeTag(chosen, tag);
                      else changes.addTag(chosen, tag);
                    }}
                  >
                    <span
                      className={cn("size-2.5 shrink-0 rounded-full", tagHue(tag).bg)}
                      aria-hidden
                    />
                    <span className="flex-1 truncate">{tag.name}</span>
                    {all && <Check className="size-4 text-primary" aria-label="On every task" />}
                    {count > 0 && !all && (
                      <Minus className="size-4 text-muted-foreground" aria-label="On some tasks" />
                    )}
                  </CommandItem>
                );
              })}
            </CommandGroup>
          </CommandList>
        </Command>
      </PopoverContent>
    </Popover>
  );
}
