import { ChevronDown, ChevronRight } from "lucide-react";
import { useRef, useState, type ReactNode } from "react";

import type { GroupHeader } from "@/features/tasks/sortable-tree";
import { GroupCount } from "@/features/tasks/task-groups";

import { SectionMenu } from "./section-menu";
import { SectionNameField } from "./section-name-field";
import { useUpdateSection, type Section } from "./sections";

/**
 * One Section of a Project's list: a header with its name, which collapses or expands it, how
 * many open root Tasks it holds, any header `actions` and its menu, then its Task rows as
 * `children` while it is expanded. The server remembers whether it is collapsed.
 */
export function SectionBlock({
  section,
  count,
  readOnly = false,
  actions,
  menuItems,
  header,
  children,
}: {
  section: Section;
  count: number;
  /** An archived Project's Sections have no menu and can't be collapsed or expanded. */
  readOnly?: boolean;
  /** Controls at the header's end, before the menu, such as adding a Task. */
  actions?: ReactNode;
  /** The menu's items after Rename. */
  menuItems?: ReactNode;
  /** Lets dragged Tasks pass the header into this Section. */
  header?: GroupHeader | null;
  children?: ReactNode;
}) {
  const { mutate: update } = useUpdateSection(section.project_id);
  const [renaming, setRenaming] = useState(false);
  const menuRef = useRef<HTMLButtonElement>(null);
  const expanded = !section.collapsed;
  const Chevron = expanded ? ChevronDown : ChevronRight;

  return (
    <section aria-label={section.name} className="border-b border-border">
      <div
        ref={header?.setNode}
        style={header?.style}
        className="flex h-9 items-center gap-2 border-b border-border/70 bg-surface-muted/50 px-3"
      >
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
              disabled={readOnly}
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
          {!readOnly && (
            <SectionMenu
              section={section}
              triggerRef={menuRef}
              onRename={() => {
                setRenaming(true);
              }}
            >
              {menuItems}
            </SectionMenu>
          )}
        </div>
      </div>
      {expanded && children}
    </section>
  );
}
