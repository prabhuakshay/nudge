import { Plus } from "lucide-react";
import { useEffect, useRef } from "react";

import { Kbd } from "@/components/ui/kbd";
import { QuickAddChips } from "@/features/tasks/quick-add-chips";
import { QuickAddField } from "@/features/tasks/quick-add-field";
import { useQuickAddTitle } from "@/features/tasks/quick-add-people";
import { typedFields } from "@/features/tasks/quick-add-view";
import { useCreateTask } from "@/features/tasks/tasks";
import { useQuickAdd } from "@/features/tasks/use-quick-add";

import type { Section } from "./sections";

function addLabel(section: Section) {
  return `Add a task to ${section.name}`;
}

/** The + at the end of a Section's header that opens the field for adding a Task in it. */
export function AddSectionTaskButton({
  section,
  open,
  onOpen,
}: {
  section: Section;
  open: boolean;
  onOpen: () => void;
}) {
  return (
    <button
      type="button"
      aria-label={addLabel(section)}
      aria-expanded={open}
      onClick={onOpen}
      className="relative flex size-7 items-center justify-center rounded-md text-muted-foreground after:absolute after:-inset-2 after:content-[''] hover:bg-surface hover:text-foreground focus-visible:outline-2 focus-visible:outline-ring"
    >
      <Plus className="size-4" aria-hidden />
    </button>
  );
}

/**
 * The field at the top of a Section that adds a Task in it and stays ready for the next. It is
 * Quick add without `~project`, since the Section already fixes the Project. Leaving it empty
 * closes it.
 */
export function AddSectionTask({ section, onClose }: { section: Section; onClose: () => void }) {
  const { mutate: create } = useCreateTask();
  const titleOf = useQuickAddTitle();
  const inputRef = useRef<HTMLInputElement>(null);
  const quick = useQuickAdd({
    inputRef,
    allowProject: false,
    onSubmit: (text, parsed) => {
      void titleOf(text, parsed).then((title) => {
        create({
          title,
          project_id: section.project_id,
          section_id: section.id,
          ...typedFields(parsed),
        });
      });
    },
  });
  const { matches } = quick.parsed;
  useEffect(() => {
    inputRef.current?.focus();
  }, []);

  return (
    <div className="border-b border-border/70 px-3">
      <div className="flex min-h-11 items-center gap-2 sm:min-h-10">
        <Plus className="size-4 shrink-0 text-primary" aria-hidden />
        <QuickAddField
          quick={quick}
          inputRef={inputRef}
          label={addLabel(section)}
          placeholder={addLabel(section)}
          onFocusChange={(focused) => {
            if (!focused && !quick.value.trim()) onClose();
          }}
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
