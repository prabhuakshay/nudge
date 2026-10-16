import { Plus } from "lucide-react";
import { useState } from "react";

import { QuickAddCard } from "@/features/tasks/quick-add-card";
import type { QuickAddView } from "@/features/tasks/quick-add-view";

import { QUADRANT, type Quadrant } from "./quadrants";

/** What Quick add gives a new Task so that it lands in the Quadrant: its Priority and today. */
function quadrantView(quadrant: Quadrant, today: string): QuickAddView {
  const { addedPriority, urgent } = QUADRANT[quadrant];
  return { kind: "quadrant", priority: addedPriority, today: urgent ? today : null };
}

/**
 * The control at the bottom of a Quadrant that adds a Task there: a button that opens Quick add,
 * started with the Quadrant's Priority and today, which closes when left empty. Opening it on
 * demand keeps the four Quadrants from all answering Quick add's `C`.
 */
export function QuadrantAddTask({ quadrant, today }: { quadrant: Quadrant; today: string }) {
  const [adding, setAdding] = useState(false);
  if (adding) {
    return (
      <QuickAddCard
        view={quadrantView(quadrant, today)}
        className="mx-2 mb-2"
        onClose={() => {
          setAdding(false);
        }}
      />
    );
  }
  return (
    <button
      type="button"
      aria-label={`Add a task to ${QUADRANT[quadrant].label}`}
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
