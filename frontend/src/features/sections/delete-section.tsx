import { Trash2 } from "lucide-react";
import type { SubmitEvent } from "react";

import { DropdownMenuItem, DropdownMenuSeparator } from "@/components/ui/dropdown-menu";
import { DialogFooter, SidebarDialog } from "@/features/projects/project-dialog";

import { useDeleteSection, type Section } from "./sections";

/** A Section menu's Delete item. It only asks for the confirm, which the header shows. */
export function DeleteSectionItem({ onSelect }: { onSelect: () => void }) {
  return (
    <>
      <DropdownMenuSeparator />
      <DropdownMenuItem variant="danger" onSelect={onSelect}>
        <Trash2 aria-hidden /> Delete
      </DropdownMenuItem>
    </>
  );
}

/** Asks before a Section is deleted, saying its Tasks move to No section. */
export function DeleteSectionDialog({
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
