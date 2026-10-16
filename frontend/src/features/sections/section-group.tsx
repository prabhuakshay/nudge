import type { ReactNode } from "react";

import { GroupCount } from "@/features/tasks/task-groups";

import type { Section } from "./sections";

/**
 * One Section of a Project's list: a header with its name, how many root Tasks it holds and any
 * header `actions`, then its Task rows as `children`.
 */
export function SectionGroup({
  section,
  count,
  actions,
  children,
}: {
  section: Section;
  count: number;
  /** Controls at the header's end, such as adding a Task or the Section's menu. */
  actions?: ReactNode;
  children?: ReactNode;
}) {
  return (
    <section aria-label={section.name} className="border-b border-border">
      <div className="flex h-9 items-center gap-2 border-b border-border/70 bg-surface-muted/50 px-3">
        <h2 className="min-w-0 truncate text-xs font-semibold text-foreground">{section.name}</h2>
        <GroupCount count={count} />
        {actions && <div className="ml-auto flex shrink-0 items-center gap-1">{actions}</div>}
      </div>
      {children}
    </section>
  );
}
