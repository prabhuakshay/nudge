import { Ellipsis, Pencil } from "lucide-react";
import { useRef, type ReactNode, type Ref } from "react";

import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";

import type { Section } from "./sections";

/**
 * A Section header's ⋯ menu: Rename, then the `children`, so each Layout adds its own actions.
 * `onRename` runs once the menu has closed, so the name field it shows can take focus.
 */
export function SectionMenu({
  section,
  triggerRef,
  onRename,
  children,
}: {
  section: Section;
  triggerRef?: Ref<HTMLButtonElement>;
  onRename: () => void;
  children?: ReactNode;
}) {
  // The menu traps focus while open, so the name field can only take it once the menu has closed.
  const renameOnClose = useRef(false);
  return (
    <DropdownMenu>
      <DropdownMenuTrigger
        ref={triggerRef}
        aria-label={`${section.name} actions`}
        className="flex size-8 shrink-0 items-center justify-center rounded-md text-muted-foreground transition-colors hover:bg-surface hover:text-foreground lg:size-7"
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
        {children}
      </DropdownMenuContent>
    </DropdownMenu>
  );
}
