import { Plus } from "lucide-react";
import { useState } from "react";

import { AddSectionTask } from "@/features/sections/add-section-task";
import { addTaskLabel, type Section } from "@/features/sections/sections";

/**
 * The control at the bottom of a Board column that adds a Task there: a button that opens a Quick
 * add field, which adds each Task as the column's last card and closes when left empty.
 */
export function BoardAddTask({
  projectId,
  section,
}: {
  projectId: number;
  /** The column's Section, or null for No section. */
  section: Section | null;
}) {
  const [adding, setAdding] = useState(false);
  if (adding) {
    return (
      <AddSectionTask
        projectId={projectId}
        section={section}
        last
        className="mx-2 mb-2 rounded-lg border bg-surface px-2"
        onClose={() => {
          setAdding(false);
        }}
      />
    );
  }
  return (
    <button
      type="button"
      aria-label={addTaskLabel(section)}
      onClick={() => {
        setAdding(true);
      }}
      className="mx-2 mb-2 flex min-h-11 items-center gap-2 rounded-lg px-2 text-sm text-muted-foreground hover:bg-surface hover:text-foreground focus-visible:outline-2 focus-visible:outline-ring sm:min-h-9"
    >
      <Plus className="size-4" aria-hidden />
      Add a task
    </button>
  );
}
