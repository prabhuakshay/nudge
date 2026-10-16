import { ChevronDown, ChevronRight } from "lucide-react";
import { useRef, useState } from "react";

import { DeleteSectionDialog, DeleteSectionItem } from "@/features/sections/delete-section";
import { MoveSectionItems } from "@/features/sections/move-section-items";
import { SectionMenu } from "@/features/sections/section-menu";
import { SectionNameField } from "@/features/sections/section-name-field";
import { sectionName, useUpdateSection, type Section } from "@/features/sections/sections";
import { Grip } from "@/features/tasks/row-grip";
import type { DragHandle } from "@/features/tasks/sortable-tree";
import { cn } from "@/lib/utils";

/**
 * The top of a Board column: its name and how many Tasks it holds. A Section's name collapses or
 * expands the column, which the server remembers, and its ⋯ menu renames, moves or deletes it.
 * No section, given as null, has neither.
 */
export function BoardColumnHeader({
  section,
  ...props
}: {
  section: Section | null;
} & Omit<SectionColumnHeaderProps, "section">) {
  const { count } = props;
  if (!section) {
    return (
      <header className="flex min-h-10 items-center gap-2 px-3 pt-1">
        <h2 className="min-w-0 truncate text-sm font-semibold">{sectionName(null)}</h2>
        <ColumnCount count={count} />
      </header>
    );
  }
  return <SectionColumnHeader section={section} {...props} />;
}

type SectionColumnHeaderProps = {
  section: Section;
  /** The Board's Sections in order, which Move left and Move right step through. */
  order: Section[];
  count: number;
  /** An archived Project's columns have no menu and can't be collapsed or expanded. */
  readOnly: boolean;
  /** How the column drags by its header; left out where it doesn't. */
  drag?: { handle: DragHandle; touch: boolean } | undefined;
};

/**
 * What makes a header drag its column: a press on it, after a 5 px move or a press and hold on
 * touch screens, as on a card.
 */
function dragProps(drag: SectionColumnHeaderProps["drag"]) {
  if (!drag) return {};
  return drag.touch
    ? { onTouchStart: drag.handle.onTouchStart }
    : { onPointerDown: drag.handle.onPointerDown };
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
 * the menu and grip, so the column fits a narrow strip. It doesn't drag while renaming.
 */
function SectionColumnHeader({ section, order, count, readOnly, drag }: SectionColumnHeaderProps) {
  const { mutate: update } = useUpdateSection(section.project_id);
  const [renaming, setRenaming] = useState(false);
  const [confirmingDelete, setConfirmingDelete] = useState(false);
  const menuRef = useRef<HTMLButtonElement>(null);
  const expanded = !section.collapsed;
  const dragging = renaming ? undefined : drag;

  return (
    <header
      {...dragProps(dragging)}
      className={cn(
        "group/row relative flex items-center gap-2",
        dragging && "select-none [-webkit-touch-callout:none]",
        expanded ? "min-h-10 px-3 pt-1" : "flex-col py-2",
      )}
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
        <CollapseToggle
          section={section}
          readOnly={readOnly}
          onToggle={() => {
            update({ id: section.id, collapsed: expanded });
          }}
        />
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
            <MoveSectionItems section={section} order={order} horizontal />
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
      {expanded && dragging && (
        <Grip title={section.name} handle={dragging.handle} touch={dragging.touch} left={0} />
      )}
    </header>
  );
}

/** A Section column's name, as the button that collapses or expands the column. */
function CollapseToggle({
  section,
  readOnly,
  onToggle,
}: {
  section: Section;
  readOnly: boolean;
  onToggle: () => void;
}) {
  const expanded = !section.collapsed;
  const Chevron = expanded ? ChevronDown : ChevronRight;
  return (
    <h2 className="min-w-0">
      <button
        type="button"
        aria-expanded={expanded}
        disabled={readOnly}
        onClick={onToggle}
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
  );
}
