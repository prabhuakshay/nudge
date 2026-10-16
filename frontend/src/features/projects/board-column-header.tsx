import { ChevronDown, ChevronRight } from "lucide-react";
import { useRef, useState } from "react";

import { DeleteSectionDialog, DeleteSectionItem } from "@/features/sections/delete-section";
import { SectionMenu } from "@/features/sections/section-menu";
import { SectionNameField } from "@/features/sections/section-name-field";
import { useUpdateSection, type Section } from "@/features/sections/sections";
import { cn } from "@/lib/utils";

/**
 * The top of a Board column: its name and how many Tasks it holds. A Section's name collapses or
 * expands the column, which the server remembers, and its ⋯ menu renames or deletes it. No
 * section, given as null, has neither.
 */
export function BoardColumnHeader({
  section,
  count,
  readOnly,
}: {
  section: Section | null;
  count: number;
  /** An archived Project's columns have no menu and can't be collapsed or expanded. */
  readOnly: boolean;
}) {
  if (!section) {
    return (
      <header className="flex min-h-10 items-center gap-2 px-3 pt-1">
        <h2 className="min-w-0 truncate text-sm font-semibold">No section</h2>
        <ColumnCount count={count} />
      </header>
    );
  }
  return <SectionColumnHeader section={section} count={count} readOnly={readOnly} />;
}

/** How many Tasks a column holds. */
function ColumnCount({ count }: { count: number }) {
  return (
    <span className="text-xs text-muted-foreground tabular-nums">
      {count}
      <span className="sr-only"> tasks</span>
    </span>
  );
}

/**
 * A Section column's header. Collapsed, it stacks the name, sideways, over the count and drops
 * the menu, so the column fits a narrow strip.
 */
function SectionColumnHeader({
  section,
  count,
  readOnly,
}: {
  section: Section;
  count: number;
  readOnly: boolean;
}) {
  const { mutate: update } = useUpdateSection(section.project_id);
  const [renaming, setRenaming] = useState(false);
  const [confirmingDelete, setConfirmingDelete] = useState(false);
  const menuRef = useRef<HTMLButtonElement>(null);
  const expanded = !section.collapsed;
  const Chevron = expanded ? ChevronDown : ChevronRight;

  return (
    <header
      className={cn("flex items-center gap-2", expanded ? "min-h-10 px-3 pt-1" : "flex-col py-2")}
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
            className={cn(
              "flex min-w-0 items-center gap-1 rounded-md text-sm font-semibold",
              !expanded && "flex-col",
            )}
          >
            <Chevron className="size-4 shrink-0 text-muted-foreground" aria-hidden />
            <span className={cn("truncate", !expanded && "max-h-60 [writing-mode:vertical-rl]")}>
              {section.name}
            </span>
          </button>
        </h2>
      )}
      <ColumnCount count={count} />
      {expanded && !readOnly && (
        <div className="ml-auto flex shrink-0 items-center">
          <SectionMenu
            section={section}
            triggerRef={menuRef}
            onRename={() => {
              setRenaming(true);
            }}
          >
            <DeleteSectionItem
              onSelect={() => {
                setConfirmingDelete(true);
              }}
            />
          </SectionMenu>
          <DeleteSectionDialog
            section={section}
            open={confirmingDelete}
            onOpenChange={setConfirmingDelete}
          />
        </div>
      )}
    </header>
  );
}
