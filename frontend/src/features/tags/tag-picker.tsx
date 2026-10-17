import { useQuery } from "@tanstack/react-query";
import { Check, Plus } from "lucide-react";
import { useState, type ReactNode } from "react";

import {
  Command,
  CommandEmpty,
  CommandGroup,
  CommandInput,
  CommandItem,
  CommandList,
  CommandSeparator,
} from "@/components/ui/command";
import { ResponsivePopover } from "@/components/ui/responsive-popover";
import { sidebarQuery, useUpdateTask, type Task } from "@/features/tasks/tasks";
import { cn } from "@/lib/utils";

import { tagHue, tagNameProblem, useCreateTag, type Tag } from "./tags";

/**
 * A searchable list of the user's Tags that puts Tags on a Task and takes them off. It stays open
 * so several can be toggled, and typing a name the user doesn't have offers to create it.
 */
export function TagPicker({
  task,
  children,
  align = "start",
  open,
  onOpenChange,
}: {
  task: Task;
  /** The element that opens the picker; it must accept a ref, like a button. */
  children: ReactNode;
  align?: "start" | "center" | "end";
  /** Whether the picker shows, when its owner opens it, as the drawer does on T. */
  open?: boolean;
  onOpenChange?: (open: boolean) => void;
}) {
  const [query, setQuery] = useState("");
  const { data: sidebar } = useQuery(sidebarQuery);
  const { mutate: updateTask } = useUpdateTask();
  const createTag = useCreateTag();
  const tags = sidebar?.tags ?? [];
  const name = query.trim();
  const exists = tags.some((tag) => tag.name.toLowerCase() === name.toLowerCase());
  const problem = tagNameProblem(name);
  const has = (tag: Tag) => task.tags.some((current) => current.id === tag.id);

  const toggle = (tag: Tag) => {
    const next = has(tag)
      ? task.tags.filter((current) => current.id !== tag.id)
      : [...task.tags, tag];
    updateTask({ id: task.id, tags: next });
  };

  return (
    <ResponsivePopover
      label="Tags"
      trigger={children}
      align={align}
      className="w-60"
      open={open}
      onOpenChange={(next) => {
        setQuery("");
        onOpenChange?.(next);
      }}
    >
      <Command>
        <CommandInput placeholder="Find or create a tag…" value={query} onValueChange={setQuery} />
        <CommandList>
          <CommandEmpty>{problem ?? "No tags match."}</CommandEmpty>
          <CommandGroup>
            {tags.map((tag) => (
              <CommandItem
                key={tag.id}
                value={`${tag.name} ${String(tag.id)}`}
                onSelect={() => {
                  toggle(tag);
                }}
              >
                <span
                  className={cn("size-2.5 shrink-0 rounded-full", tagHue(tag).bg)}
                  aria-hidden
                />
                <span className="flex-1 truncate">{tag.name}</span>
                {has(tag) && <Check className="size-4 text-primary" aria-label="On this task" />}
              </CommandItem>
            ))}
          </CommandGroup>
          {name && !exists && !problem && (
            <>
              <CommandSeparator />
              <CommandGroup>
                <CommandItem
                  value={`create ${name}`}
                  disabled={createTag.isPending}
                  onSelect={() => {
                    createTag.mutate(
                      { name, color: null },
                      {
                        onSuccess: (tag) => {
                          updateTask({ id: task.id, tags: [...task.tags, tag] });
                        },
                      },
                    );
                    setQuery("");
                  }}
                >
                  <Plus className="size-4" aria-hidden />
                  Create “{name}”
                </CommandItem>
              </CommandGroup>
            </>
          )}
        </CommandList>
      </Command>
    </ResponsivePopover>
  );
}
