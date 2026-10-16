import { ChevronRight } from "lucide-react";
import type { ReactNode } from "react";

import { cn } from "@/lib/utils";

import { useSidebarSection, type SidebarSectionName } from "./use-sidebar-section";

/** The `+` on a section heading, shown on hover or focus where there is a pointer, always on touch. */
export const HEADING_ACTION =
  "flex size-8 shrink-0 items-center justify-center rounded-md text-muted-foreground transition-colors group-focus-within:opacity-100 group-hover:opacity-100 hover:bg-surface hover:text-foreground focus-visible:opacity-100 data-[state=open]:opacity-100 lg:size-7 pointer-fine:opacity-0";

/**
 * A collapsible sidebar section: a heading on a grey band that toggles the rows below it, with
 * the section's `add` control on the right. The collapsed state is saved on the user's account.
 */
export function SidebarSection({
  section,
  title,
  add,
  children,
}: {
  section: SidebarSectionName;
  title: string;
  add: ReactNode;
  children: ReactNode;
}) {
  const { collapsed, toggle } = useSidebarSection(section);
  const headingId = `${section}-heading`;
  return (
    <section aria-labelledby={headingId} className="px-2">
      <div className="group flex h-8 items-center rounded-md bg-surface-muted pr-1">
        <h2 id={headingId} className="flex h-full min-w-0 flex-1">
          <button
            type="button"
            aria-expanded={!collapsed}
            onClick={toggle}
            className="flex flex-1 items-center gap-1 rounded-md pl-1.5 text-left text-sm font-semibold text-muted-foreground outline-none focus-visible:ring-2 focus-visible:ring-ring"
          >
            <ChevronRight
              className={cn("size-3.5 shrink-0 transition-transform", !collapsed && "rotate-90")}
              aria-hidden
            />
            {title}
          </button>
        </h2>
        {add}
      </div>
      {!collapsed && <div className="mt-1">{children}</div>}
    </section>
  );
}
