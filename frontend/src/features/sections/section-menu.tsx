import { Ellipsis, Pencil } from "lucide-react";
import { useRef, type Ref } from "react";

import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";

import type { Section } from "./sections";

/**
 * A Section header's ⋯ menu, shown on hover or focus where there is a pointer, always on touch.
 * Each item is one thing to do with the Section.
 */
export function SectionMenu({
  section,
  triggerRef,
  onRename,
}: {
  section: Section;
  triggerRef: Ref<HTMLButtonElement>;
  onRename: () => void;
}) {
  // The menu traps focus while open, so the name field can only take it once the menu has closed.
  const renameOnClose = useRef(false);
  return (
    <DropdownMenu>
      <DropdownMenuTrigger
        ref={triggerRef}
        aria-label={`${section.name} options`}
        className="flex size-8 shrink-0 items-center justify-center rounded-md text-muted-foreground transition-colors group-focus-within:opacity-100 group-hover:opacity-100 hover:bg-surface hover:text-foreground focus-visible:opacity-100 data-[state=open]:opacity-100 lg:size-7 pointer-fine:opacity-0"
      >
        <Ellipsis className="size-4" aria-hidden />
      </DropdownMenuTrigger>
      <DropdownMenuContent
        align="end"
        onCloseAutoFocus={(event) => {
          if (!renameOnClose.current) return;
          renameOnClose.current = false;
          event.preventDefault();
          onRename();
        }}
      >
        <DropdownMenuItem
          onSelect={() => {
            renameOnClose.current = true;
          }}
        >
          <Pencil aria-hidden /> Rename
        </DropdownMenuItem>
      </DropdownMenuContent>
    </DropdownMenu>
  );
}
