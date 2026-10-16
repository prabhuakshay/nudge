import { Ellipsis, Trash2 } from "lucide-react";
import { useState, type SubmitEvent } from "react";

import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { DialogFooter, SidebarDialog } from "@/features/projects/project-dialog";

import { useDeleteSection, type Section } from "./sections";

/** A Section header's ⋯ menu: one item per thing that can be done to the Section. */
export function SectionMenu({ section }: { section: Section }) {
  const [confirmingDelete, setConfirmingDelete] = useState(false);
  return (
    <>
      <DropdownMenu>
        <DropdownMenuTrigger
          aria-label={`${section.name} options`}
          className="flex size-7 shrink-0 items-center justify-center rounded-md text-muted-foreground transition-colors hover:bg-surface hover:text-foreground"
        >
          <Ellipsis className="size-4" aria-hidden />
        </DropdownMenuTrigger>
        <DropdownMenuContent align="end">
          <DropdownMenuItem
            variant="danger"
            onSelect={() => {
              setConfirmingDelete(true);
            }}
          >
            <Trash2 aria-hidden /> Delete
          </DropdownMenuItem>
        </DropdownMenuContent>
      </DropdownMenu>
      {/* Outside the menu, so the confirm outlives the menu closing. */}
      <DeleteSectionDialog
        section={section}
        open={confirmingDelete}
        onOpenChange={setConfirmingDelete}
      />
    </>
  );
}

/** Asks before a Section is deleted, saying its Tasks move to No section. */
function DeleteSectionDialog({
  section,
  open,
  onOpenChange,
}: {
  section: Section;
  open: boolean;
  onOpenChange: (open: boolean) => void;
}) {
  const deleteSection = useDeleteSection(section.project_id);

  function handleSubmit(event: SubmitEvent<HTMLFormElement>) {
    event.preventDefault();
    deleteSection.mutate(section.id);
    onOpenChange(false);
  }

  return (
    <SidebarDialog open={open} onOpenChange={onOpenChange} title={`Delete “${section.name}”?`}>
      <form onSubmit={handleSubmit} className="flex flex-col">
        <p className="px-5 pb-5 text-sm text-muted-foreground">
          Its tasks move to No section. This can&apos;t be undone.
        </p>
        <DialogFooter pending={false} label="Delete" />
      </form>
    </SidebarDialog>
  );
}
