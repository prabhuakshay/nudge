import { Plus } from "lucide-react";
import { useEffect, useRef, useState } from "react";

import { Kbd } from "@/components/ui/kbd";
import { cn } from "@/lib/utils";

import { useCreateTask } from "./tasks";

/** Whether a key press happened where typing `c` means text, not a shortcut. */
function isTyping(target: EventTarget | null) {
  return (
    target instanceof Element &&
    target.closest("input, textarea, select, [contenteditable], [role=menu], [role=dialog]") !==
      null
  );
}

/**
 * The card above a list for adding a Task in one line: type a title and press Enter. The input
 * stays focused so several Tasks can be added in a row, and `C` focuses it from anywhere on the
 * page. In a Tag's list, new Tasks go to the Inbox with that Tag.
 */
export function QuickAddCard({ projectId, tagId }: { projectId: number; tagId?: number }) {
  const inputRef = useRef<HTMLInputElement>(null);
  const [title, setTitle] = useState("");
  const [focused, setFocused] = useState(false);
  const createTask = useCreateTask(projectId, tagId);

  useEffect(() => {
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key !== "c" || event.metaKey || event.ctrlKey || event.altKey) return;
      if (isTyping(event.target)) return;
      event.preventDefault();
      inputRef.current?.focus();
    };
    window.addEventListener("keydown", onKeyDown);
    return () => {
      window.removeEventListener("keydown", onKeyDown);
    };
  }, []);

  const submit = () => {
    const trimmed = title.trim();
    if (!trimmed) return;
    createTask.mutate(trimmed);
    setTitle("");
  };

  return (
    <div
      className={cn(
        "mb-3 rounded-xl border border-border bg-surface px-3 py-1.5 shadow-sm transition-colors",
        focused && "border-primary ring-2 ring-primary/15",
      )}
    >
      <div className="flex min-h-10 items-center gap-2.5">
        <span
          className={cn(
            "flex size-[18px] shrink-0 items-center justify-center rounded-[5px] border-2 border-dashed",
            focused
              ? "border-primary text-primary"
              : "border-muted-foreground/40 text-muted-foreground",
          )}
        >
          <Plus className="size-3" strokeWidth={3} aria-hidden />
        </span>
        <input
          ref={inputRef}
          aria-label="New task"
          value={title}
          autoComplete="off"
          maxLength={500}
          placeholder="New task…"
          onChange={(event) => {
            setTitle(event.target.value);
          }}
          onKeyDown={(event) => {
            if (event.key === "Enter" && !event.nativeEvent.isComposing) {
              event.preventDefault();
              submit();
            }
          }}
          onFocus={() => {
            setFocused(true);
          }}
          onBlur={() => {
            setFocused(false);
          }}
          // 16px on touch screens: iOS Safari zooms the page into any smaller input.
          className="h-9 min-w-0 flex-1 bg-transparent text-sm outline-none placeholder:text-muted-foreground pointer-coarse:h-11 pointer-coarse:text-base"
        />
        {!focused && !title && (
          <Kbd className="hidden shrink-0 lg:inline-flex" aria-label="Press C to add a task">
            C
          </Kbd>
        )}
        {focused && title && (
          <span className="hidden shrink-0 text-[11px] text-muted-foreground lg:inline">
            <Kbd>Enter</Kbd> to add
          </span>
        )}
      </div>
    </div>
  );
}
