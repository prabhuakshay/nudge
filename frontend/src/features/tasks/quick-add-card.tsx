import { Plus } from "lucide-react";
import { useRef, useState } from "react";

import { Kbd } from "@/components/ui/kbd";
import { shortcutText } from "@/features/shortcuts/registry";
import { useShortcuts, useSingleKeyShortcuts } from "@/features/shortcuts/use-shortcuts";
import { cn } from "@/lib/utils";

import { useCreateTask, type DatesIn } from "./tasks";

/**
 * The card above a list for adding a Task in one line: type a title and press Enter. The input
 * stays focused so several Tasks can be added in a row, and `C` focuses it from anywhere on the
 * page. A view can date the new Task, as Today does with today, or tag it, as a Tag's list does.
 */
export function QuickAddCard({
  projectId,
  dates,
  tagId,
}: {
  projectId: number;
  dates?: DatesIn;
  tagId?: number;
}) {
  const inputRef = useRef<HTMLInputElement>(null);
  const [title, setTitle] = useState("");
  const [focused, setFocused] = useState(false);
  const createTask = useCreateTask(projectId, dates, tagId);
  const singleKey = useSingleKeyShortcuts();

  useShortcuts({
    quickAdd: (event) => {
      // The drawer or another dialog is open over the list.
      if (event.target instanceof Element && event.target.closest("[role=dialog]")) return;
      inputRef.current?.focus();
    },
  });

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
            } else if (event.key === "Escape") {
              event.currentTarget.blur();
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
        {!focused && !title && singleKey && (
          <Kbd
            className="hidden shrink-0 lg:inline-flex"
            aria-label={`Press ${shortcutText("quickAdd")} to add a task`}
          >
            {shortcutText("quickAdd")}
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
