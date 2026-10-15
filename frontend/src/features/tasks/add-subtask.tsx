import { Plus } from "lucide-react";
import { useRef } from "react";

import { Kbd } from "@/components/ui/kbd";
import { cn } from "@/lib/utils";

import { QuickAddChips } from "./quick-add-chips";
import { QuickAddField } from "./quick-add-field";
import { useQuickAddTitle } from "./quick-add-people";
import { typedFields } from "./quick-add-view";
import { useCreateSubtask } from "./task-placement";
import { useQuickAdd } from "./use-quick-add";

/**
 * The drawer's field that adds a Subtask last under the Task and stays ready for the next. It is
 * Quick add without `~project`, since a Subtask always shares its root's Project.
 */
export function AddSubtask({ parentId, bordered }: { parentId: number; bordered: boolean }) {
  const { mutate: create } = useCreateSubtask(parentId);
  const titleOf = useQuickAddTitle();
  const inputRef = useRef<HTMLInputElement>(null);
  const quick = useQuickAdd({
    inputRef,
    allowProject: false,
    onSubmit: (text, parsed) => {
      void titleOf(text, parsed).then((title) => {
        create({ title, ...typedFields(parsed) });
      });
    },
  });
  const { matches } = quick.parsed;

  return (
    <div className={cn("px-3", bordered && "border-t border-border/70")}>
      <div className="flex min-h-11 items-center gap-2 sm:min-h-10">
        <Plus className="size-4 shrink-0 text-primary" aria-hidden />
        <QuickAddField
          quick={quick}
          inputRef={inputRef}
          label="Add a subtask"
          placeholder="Add a subtask"
        />
        {quick.value.trim() && <Kbd>Enter</Kbd>}
      </div>
      {matches.length > 0 && (
        <div className="pb-2 pl-6">
          <QuickAddChips matches={matches} onKeep={quick.keep} />
        </div>
      )}
    </div>
  );
}
