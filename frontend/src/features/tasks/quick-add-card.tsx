import { useQuery } from "@tanstack/react-query";
import { Plus } from "lucide-react";
import { useEffect, useRef, useState } from "react";

import { Kbd } from "@/components/ui/kbd";
import { shortcutText } from "@/features/shortcuts/registry";
import { useShortcuts, useSingleKeyShortcuts } from "@/features/shortcuts/use-shortcuts";
import { cn } from "@/lib/utils";

import type { QuickAdd } from "./quick-add";
import { QuickAddChips, QuickAddHint } from "./quick-add-chips";
import { QuickAddField } from "./quick-add-field";
import { useAnnounceTask } from "./announce-task";
import { useQuickAddTitle } from "./quick-add-people";
import {
  keptDefaults,
  newTaskFields,
  showsTask,
  viewDefaults,
  withGivenMention,
  type QuickAddView,
  type ViewDefault,
} from "./quick-add-view";
import { sidebarQuery, useCreateTask, type Task } from "./tasks";
import { useQuickAdd } from "./use-quick-add";

/** Focus the input on the Quick add shortcut, `C`, pressed anywhere outside a field or dialog. */
function useFocusOnShortcut(input: { current: HTMLInputElement | null }) {
  useShortcuts({
    quickAdd: (event) => {
      // The drawer or another dialog is open over the list.
      if (event.target instanceof Element && event.target.closest("[role=dialog]")) return;
      input.current?.focus();
    },
  });
}

/**
 * Point to a new Task that landed outside the view, such as one sent to another Project with `~`.
 */
function useAnnounceElsewhere(view: QuickAddView) {
  const announce = useAnnounceTask();
  return (task: Task) => {
    if (!showsTask(view, task)) announce(task);
  };
}

/** The dashed + in front of the input, blue while it's focused. */
function AddMark({ focused }: { focused: boolean }) {
  return (
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
  );
}

/** The keys at the end of the input on wide screens: `C` while idle, Enter and ⌫ while typing. */
function KeyHints({ focused, typed }: { focused: boolean; typed: boolean }) {
  const singleKey = useSingleKeyShortcuts();
  if (!focused && !typed) {
    if (!singleKey) return null;
    const key = shortcutText("quickAdd");
    return (
      <Kbd className="hidden shrink-0 lg:inline-flex" aria-label={`Press ${key} to add a task`}>
        {key}
      </Kbd>
    );
  }
  if (!focused) return null;
  return (
    <span className="hidden shrink-0 text-[11px] text-muted-foreground lg:inline">
      <Kbd>Enter</Kbd> to add · <Kbd>⌫</Kbd> after a match keeps it as text
    </span>
  );
}

/**
 * The card above a list for adding a Task in one line. It reads `#tag`, `~project`, `!1`–`!4` and
 * `@person` as they are typed, highlighting each and showing it as a chip. The view starts it with
 * a removable chip of its own, such as today in Today, so new Tasks land where the user is
 * looking. Enter adds the Task and keeps the input focused for the next, and `C` focuses it from
 * anywhere on the page. Given `onClose`, as when a button opens it, it takes focus at once and
 * closes when left empty.
 */
export function QuickAddCard({
  view,
  initialText,
  className,
  onAdded,
  onClose,
}: {
  view: QuickAddView;
  /** Text to start with, as if typed. */
  initialText?: string;
  className?: string;
  /** Called with each new Task instead of pointing to ones that landed outside the view. */
  onAdded?: (task: Task) => void;
  onClose?: () => void;
}) {
  const { data: sidebar } = useQuery(sidebarQuery);
  const [focused, setFocused] = useState(false);
  const [dropped, setDropped] = useState<readonly ViewDefault["kind"][]>([]);
  const given = viewDefaults(view).filter((chip) => !dropped.includes(chip.kind));
  const { mutate: createTask } = useCreateTask();
  const titleOf = useQuickAddTitle();
  const announce = useAnnounceElsewhere(view);
  const inputRef = useRef<HTMLInputElement>(null);
  useFocusOnShortcut(inputRef);

  const add = async (text: string, parsed: QuickAdd) => {
    if (!sidebar) return;
    const fields = newTaskFields(parsed, given, sidebar.inbox.id);
    const title = withGivenMention(await titleOf(text, parsed), given);
    createTask({ title, ...fields }, { onSuccess: onAdded ?? announce });
  };
  const quick = useQuickAdd({
    inputRef,
    initialValue: initialText,
    onSubmit: (text, parsed) => {
      setDropped([]);
      void add(text, parsed);
    },
  });

  const { matches } = quick.parsed;
  const shownGiven = keptDefaults(quick.parsed, given);
  const opened = onClose !== undefined;
  useEffect(() => {
    if (opened) inputRef.current?.focus();
  }, [opened]);

  return (
    <div
      // Marks the page as having Quick add, so `C` focuses it rather than opening the dialog.
      data-quick-add-card
      className={cn(
        "mb-3 rounded-xl border border-border bg-surface px-3 py-1.5 shadow-sm transition-colors",
        focused && "border-primary ring-2 ring-primary/15",
        className,
      )}
    >
      <div className="flex min-h-10 items-center gap-2.5">
        <AddMark focused={focused} />
        <QuickAddField
          quick={quick}
          inputRef={inputRef}
          label="New task"
          placeholder="New task… try “Call @Priya #phone !2”"
          onFocusChange={(next) => {
            setFocused(next);
            if (!next && !quick.value.trim()) onClose?.();
          }}
        />
        <KeyHints focused={focused} typed={quick.value !== ""} />
      </div>
      {(focused || matches.length > 0) && (
        <div className="flex flex-col gap-2 pb-1.5 pl-7">
          <QuickAddChips
            matches={matches}
            given={shownGiven}
            onKeep={quick.keep}
            onDropGiven={(chip) => {
              setDropped([...dropped, chip.kind]);
            }}
          />
          {focused && <QuickAddHint />}
        </div>
      )}
    </div>
  );
}
