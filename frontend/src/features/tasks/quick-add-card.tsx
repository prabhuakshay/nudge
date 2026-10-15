import { useQuery } from "@tanstack/react-query";
import { Plus } from "lucide-react";
import { useRef, useState } from "react";

import { Kbd } from "@/components/ui/kbd";
import { cn } from "@/lib/utils";

import type { QuickAdd } from "./quick-add";
import { QuickAddChips, QuickAddHint } from "./quick-add-chips";
import { QuickAddField } from "./quick-add-field";
import { useAnnounceTask, useFocusOnC } from "./quick-add-page";
import { useQuickAddTitle } from "./quick-add-people";
import {
  keptDefault,
  newTaskFields,
  showsTask,
  viewDefault,
  withGivenMention,
  type QuickAddView,
} from "./quick-add-view";
import { sidebarQuery, useCreateTask, type Task } from "./tasks";
import { useQuickAdd } from "./use-quick-add";

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
  if (!focused && !typed) {
    return (
      <Kbd className="hidden shrink-0 lg:inline-flex" aria-label="Press C to add a task">
        C
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
 * anywhere on the page.
 */
export function QuickAddCard({
  view,
  onAdded,
}: {
  view: QuickAddView;
  /** Called with each new Task instead of pointing to ones that landed outside the view. */
  onAdded?: (task: Task) => void;
}) {
  const { data: sidebar } = useQuery(sidebarQuery);
  const [focused, setFocused] = useState(false);
  const [givenDropped, setGivenDropped] = useState(false);
  const given = givenDropped ? null : viewDefault(view);
  const { mutate: createTask } = useCreateTask();
  const titleOf = useQuickAddTitle();
  const announce = useAnnounceElsewhere(view);
  const inputRef = useRef<HTMLInputElement>(null);
  useFocusOnC(inputRef);

  const add = async (text: string, parsed: QuickAdd) => {
    if (!sidebar) return;
    const fields = newTaskFields(parsed, given, sidebar.inbox.id);
    const title = withGivenMention(await titleOf(text, parsed), given);
    createTask({ title, ...fields }, { onSuccess: onAdded ?? announce });
  };
  const quick = useQuickAdd({
    inputRef,
    onSubmit: (text, parsed) => {
      setGivenDropped(false);
      void add(text, parsed);
    },
  });

  const { matches } = quick.parsed;
  const shownGiven = keptDefault(quick.parsed, given);

  return (
    <div
      // Marks the page as having Quick add, so `C` focuses it rather than opening the dialog.
      data-quick-add-card
      className={cn(
        "mb-3 rounded-xl border border-border bg-surface px-3 py-1.5 shadow-sm transition-colors",
        focused && "border-primary ring-2 ring-primary/15",
      )}
    >
      <div className="flex min-h-10 items-center gap-2.5">
        <AddMark focused={focused} />
        <QuickAddField
          quick={quick}
          inputRef={inputRef}
          label="New task"
          placeholder="New task… try “Call @Priya #phone !2”"
          onFocusChange={setFocused}
        />
        <KeyHints focused={focused} typed={quick.value !== ""} />
      </div>
      {(focused || matches.length > 0) && (
        <div className="flex flex-col gap-2 pb-1.5 pl-7">
          <QuickAddChips
            matches={matches}
            given={shownGiven}
            onKeep={quick.keep}
            onDropGiven={() => {
              setGivenDropped(true);
            }}
          />
          {focused && <QuickAddHint />}
        </div>
      )}
    </div>
  );
}
