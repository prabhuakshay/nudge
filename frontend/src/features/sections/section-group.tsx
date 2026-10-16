import { ChevronDown, ChevronRight } from "lucide-react";
import { useRef, useState, type ReactNode } from "react";

import { GroupCount } from "@/features/tasks/task-groups";

import { SectionMenu } from "./section-menu";
import { SectionNameField } from "./section-name-field";
import { useUpdateSection, type Section } from "./sections";

/**
 * One Section of a Project's list: a header with its name, which collapses or expands it, how
 * many open root Tasks it holds, any header `actions` and its menu, then its Task rows as
 * `children` while it is expanded. The server remembers whether it is collapsed.
 */
export function SectionGroup({
  section,
  count,
  actions,
  children,
}: {
  section: Section;
  count: number;
  /** Controls at the header's end, such as adding a Task. */
  actions?: ReactNode;
  children?: ReactNode;
}) {
  const { mutate: update } = useUpdateSection(section.project_id);
  const [renaming, setRenaming] = useState(false);
  const menuRef = useRef<HTMLButtonElement>(null);
  const expanded = !section.collapsed;
  const Chevron = expanded ? ChevronDown : ChevronRight;

  return (
    <section aria-label={section.name} className="border-b border-border">
      <div className="group flex h-9 items-center gap-2 border-b border-border/70 bg-surface-muted/50 px-3">
        {renaming ? (
          <SectionNameField
            name={section.name}
            onDone={(name, refocus) => {
              if (name !== null) update({ id: section.id, name });
              setRenaming(false);
              if (refocus) menuRef.current?.focus();
            }}
          />
        ) : (
          <h2 className="min-w-0">
            <button
              type="button"
              aria-expanded={expanded}
              onClick={() => {
                update({ id: section.id, collapsed: expanded });
              }}
              className="flex min-w-0 items-center gap-1 rounded-md text-xs font-semibold text-foreground"
            >
              <Chevron className="size-4 shrink-0 text-muted-foreground" aria-hidden />
              <span className="truncate">{section.name}</span>
            </button>
          </h2>
        )}
        <GroupCount count={count} />
        <div className="ml-auto flex shrink-0 items-center gap-1">
          {actions}
          <SectionMenu
            section={section}
            triggerRef={menuRef}
            onRename={() => {
              setRenaming(true);
            }}
          />
        </div>
      </div>
      {expanded && children}
    </section>
  );
}
