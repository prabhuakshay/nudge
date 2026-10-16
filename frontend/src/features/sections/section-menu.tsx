import { Ellipsis } from "lucide-react";
import type { ComponentProps, ReactNode, Ref } from "react";

import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";

import type { Section } from "./sections";

/** A Section header's ⋯ menu. Its items are the `children`, so each action adds its own. */
export function SectionMenu({
  section,
  triggerRef,
  onCloseAutoFocus,
  children,
}: {
  section: Section;
  triggerRef?: Ref<HTMLButtonElement>;
  /** Runs as the menu closes; preventing it keeps focus where an item put it. */
  onCloseAutoFocus?: ComponentProps<typeof DropdownMenuContent>["onCloseAutoFocus"];
  children: ReactNode;
}) {
  return (
    <DropdownMenu>
      <DropdownMenuTrigger
        ref={triggerRef}
        aria-label={`${section.name} actions`}
        className="flex size-8 shrink-0 items-center justify-center rounded-md text-muted-foreground transition-colors hover:bg-surface hover:text-foreground lg:size-7"
      >
        <Ellipsis className="size-4" aria-hidden />
      </DropdownMenuTrigger>
      <DropdownMenuContent align="end" onCloseAutoFocus={onCloseAutoFocus}>
        {children}
      </DropdownMenuContent>
    </DropdownMenu>
  );
}
