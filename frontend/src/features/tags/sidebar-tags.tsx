import { closestCenter, DndContext, type DragEndEvent } from "@dnd-kit/core";
import { SortableContext, useSortable, verticalListSortingStrategy } from "@dnd-kit/sortable";
import { CSS } from "@dnd-kit/utilities";
import { useQuery } from "@tanstack/react-query";
import { Link } from "@tanstack/react-router";
import { Hash, Merge, Pencil, Plus, Trash2 } from "lucide-react";
import { useRef, useState, type SubmitEvent } from "react";
import { toast } from "sonner";

import {
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuSub,
  DropdownMenuSubContent,
  DropdownMenuSubTrigger,
} from "@/components/ui/dropdown-menu";
import { DialogFooter, SidebarDialog } from "@/features/projects/project-dialog";
import { useSidebarSensors } from "@/features/projects/sidebar-drag";
import { ROW, RowMenu } from "@/features/projects/sidebar-rows";
import { sidebarQuery } from "@/features/tasks/tasks";
import { cn } from "@/lib/utils";

import { TagDialog } from "./tag-dialog";
import { dropAfter, tagHue, useDeleteTag, useMergeTag, useMoveTag, type SidebarTag } from "./tags";

type OpenDialog =
  | { kind: "edit"; tag?: SidebarTag }
  | { kind: "merge"; tag: SidebarTag; into: SidebarTag }
  | { kind: "delete"; tag: SidebarTag }
  | null;

/**
 * The sidebar's Tags section: the user's Tags in their order, each with its open Task count.
 * Rows drag to reorder, and each row's menu edits, merges or deletes its Tag.
 */
export function SidebarTags({ onNavigate }: { onNavigate?: () => void }) {
  const { data: sidebar } = useQuery(sidebarQuery);
  const [dialog, setDialog] = useState<OpenDialog>(null);
  const tags = sidebar?.tags ?? [];

  return (
    <section aria-labelledby="tags-heading" className="px-2">
      <div className="flex h-8 items-center justify-between pr-1 pl-2.5">
        <h2
          id="tags-heading"
          className="text-xs font-bold tracking-wider text-muted-foreground uppercase"
        >
          Tags
        </h2>
        <button
          type="button"
          aria-label="Add a tag"
          onClick={() => {
            setDialog({ kind: "edit" });
          }}
          className="flex size-9 items-center justify-center rounded-md text-muted-foreground transition-colors hover:bg-surface-muted hover:text-foreground lg:size-7"
        >
          <Plus className="size-4" aria-hidden />
        </button>
      </div>

      {tags.length === 0 ? (
        <button
          type="button"
          onClick={() => {
            setDialog({ kind: "edit" });
          }}
          className="w-full rounded-md px-2.5 py-2 text-left text-sm text-muted-foreground hover:bg-surface-muted"
        >
          Label tasks across projects. <span className="text-primary">Add a tag</span>
        </button>
      ) : (
        <SortableTags
          tags={tags}
          onNavigate={onNavigate}
          onEdit={(tag) => {
            setDialog({ kind: "edit", tag });
          }}
          onMerge={(tag, into) => {
            setDialog({ kind: "merge", tag, into });
          }}
          onDelete={(tag) => {
            setDialog({ kind: "delete", tag });
          }}
        />
      )}

      <TagDialogs
        dialog={dialog}
        onClose={() => {
          setDialog(null);
        }}
      />
    </section>
  );
}

/** The edit and confirm dialogs, one open at a time. */
function TagDialogs({ dialog, onClose }: { dialog: OpenDialog; onClose: () => void }) {
  const edit = dialog?.kind === "edit" ? dialog : null;
  return (
    <>
      <TagDialog
        open={edit !== null}
        onOpenChange={(open) => {
          if (!open) onClose();
        }}
        tag={edit?.tag}
      />
      <ConfirmDialog dialog={dialog?.kind === "edit" ? null : dialog} onClose={onClose} />
    </>
  );
}

type RowActions = {
  onNavigate?: () => void;
  onEdit: (tag: SidebarTag) => void;
  onMerge: (tag: SidebarTag, into: SidebarTag) => void;
  onDelete: (tag: SidebarTag) => void;
};

/** The Tags as one sortable list; a drop moves the Tag right after the one above it. */
function SortableTags({ tags, ...actions }: { tags: SidebarTag[] } & RowActions) {
  const sensors = useSidebarSensors();
  const moveTag = useMoveTag();
  const justDropped = useRef(false);

  const onDragEnd = ({ active, over, activatorEvent }: DragEndEvent) => {
    // A pointer drop ends with a click on the dragged row, which would follow its link.
    justDropped.current = !(activatorEvent instanceof KeyboardEvent);
    if (!over || active.id === over.id) return;
    const id = Number(active.id);
    moveTag.mutate({ id, afterId: dropAfter(tags, id, Number(over.id)) });
  };

  return (
    <DndContext sensors={sensors} collisionDetection={closestCenter} onDragEnd={onDragEnd}>
      <SortableContext items={tags.map((tag) => tag.id)} strategy={verticalListSortingStrategy}>
        <ul
          className="flex flex-col gap-px"
          onClickCapture={(event) => {
            if (!justDropped.current) return;
            justDropped.current = false;
            event.preventDefault();
            event.stopPropagation();
          }}
          onPointerDownCapture={() => {
            justDropped.current = false;
          }}
        >
          {tags.map((tag) => (
            <SortableTagRow key={tag.id} tag={tag} tags={tags} {...actions} />
          ))}
        </ul>
      </SortableContext>
    </DndContext>
  );
}

function SortableTagRow({
  tag,
  tags,
  onNavigate,
  onEdit,
  onMerge,
  onDelete,
}: { tag: SidebarTag; tags: SidebarTag[] } & RowActions) {
  const { setNodeRef, listeners, attributes, transform, transition, isDragging } = useSortable({
    id: tag.id,
  });
  const hue = tagHue(tag);
  const others = tags.filter((other) => other.id !== tag.id);
  return (
    <li
      ref={setNodeRef}
      style={{ transform: CSS.Translate.toString(transform), transition }}
      // Only the listeners and the instructions: dnd-kit's other attributes would turn the Tag's
      // link into a button for assistive tech.
      {...listeners}
      aria-describedby={attributes["aria-describedby"]}
      className={cn(
        "relative touch-manipulation select-none [-webkit-touch-callout:none]",
        isDragging && "z-10 rounded-md bg-surface opacity-90 shadow-lg",
      )}
    >
      <div className={cn(ROW, "has-[a[data-status=active]]:bg-primary-soft")}>
        <Link
          to="/tags/$tagId"
          params={{ tagId: String(tag.id) }}
          onClick={onNavigate}
          className="flex min-w-0 flex-1 items-center gap-2.5 self-stretch rounded-md outline-none focus-visible:ring-2 focus-visible:ring-ring data-[status=active]:text-primary"
        >
          <Hash className={cn("size-4 shrink-0", hue.text)} aria-hidden />
          <span className="truncate">{tag.name}</span>
          {tag.open_count > 0 && (
            <>
              <span
                aria-hidden
                className="ml-auto text-xs font-medium tabular-nums group-hover:hidden"
              >
                {tag.open_count}
              </span>
              <span className="sr-only">, {tag.open_count} open</span>
            </>
          )}
        </Link>
        <RowMenu label={`${tag.name} options`}>
          <DropdownMenuItem
            onSelect={() => {
              onEdit(tag);
            }}
          >
            <Pencil aria-hidden /> Edit
          </DropdownMenuItem>
          <DropdownMenuSub>
            <DropdownMenuSubTrigger disabled={others.length === 0}>
              <Merge aria-hidden /> Merge into
            </DropdownMenuSubTrigger>
            <DropdownMenuSubContent>
              {others.map((into) => (
                <DropdownMenuItem
                  key={into.id}
                  onSelect={() => {
                    onMerge(tag, into);
                  }}
                >
                  <Hash className={tagHue(into).text} aria-hidden /> {into.name}
                </DropdownMenuItem>
              ))}
            </DropdownMenuSubContent>
          </DropdownMenuSub>
          <DropdownMenuSeparator />
          <DropdownMenuItem
            variant="danger"
            onSelect={() => {
              onDelete(tag);
            }}
          >
            <Trash2 aria-hidden /> Delete
          </DropdownMenuItem>
        </RowMenu>
      </div>
    </li>
  );
}

function tasksPhrase(count: number) {
  return count === 1 ? "1 task" : `${String(count)} tasks`;
}

/** Asks before a merge or delete, which can't be undone, saying how many Tasks it touches. */
function ConfirmDialog({
  dialog,
  onClose,
}: {
  dialog:
    | { kind: "merge"; tag: SidebarTag; into: SidebarTag }
    | { kind: "delete"; tag: SidebarTag }
    | null;
  onClose: () => void;
}) {
  const mergeTag = useMergeTag();
  const deleteTag = useDeleteTag();
  if (!dialog) return null;
  const { tag } = dialog;
  const tasks = tasksPhrase(tag.task_count);
  const merge = dialog.kind === "merge" ? dialog : null;

  function handleSubmit(event: SubmitEvent<HTMLFormElement>) {
    event.preventDefault();
    if (merge) {
      mergeTag.mutate(
        { id: tag.id, intoId: merge.into.id },
        { onSuccess: () => toast(`Merged #${tag.name} into #${merge.into.name}`) },
      );
    } else {
      deleteTag.mutate(tag.id, { onSuccess: () => toast(`Deleted #${tag.name}`) });
    }
    onClose();
  }

  return (
    <SidebarDialog
      open
      onOpenChange={(open) => {
        if (!open) onClose();
      }}
      title={merge ? `Merge #${tag.name}?` : `Delete #${tag.name}?`}
    >
      <form onSubmit={handleSubmit} className="flex flex-col">
        <p className="px-5 pb-5 text-sm text-muted-foreground">
          {merge
            ? `Its ${tasks} get #${merge.into.name}, and #${tag.name} is deleted. This can't be undone.`
            : `It comes off its ${tasks}. This can't be undone.`}
        </p>
        <DialogFooter pending={false} label={merge ? "Merge" : "Delete"} />
      </form>
    </SidebarDialog>
  );
}
