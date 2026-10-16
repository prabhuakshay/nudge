import { List, SquareKanban, type LucideIcon } from "lucide-react";

import { cn } from "@/lib/utils";

import { useSetLayout, type ProjectLayout, type SidebarProject } from "./projects";

const LAYOUTS: { layout: ProjectLayout; label: string; icon: LucideIcon }[] = [
  { layout: "list", label: "List", icon: List },
  { layout: "board", label: "Board", icon: SquareKanban },
];

/**
 * The Project header's List | Board toggle. The choice is saved on the Project, so every device
 * opens it the same way. On phones the buttons show only their icons.
 */
export function LayoutSwitch({ project }: { project: SidebarProject }) {
  const { mutate: setLayout } = useSetLayout();
  return (
    <div
      role="group"
      aria-label="Layout"
      className="flex shrink-0 items-center rounded-md border border-border bg-surface p-0.5 shadow-xs"
    >
      {LAYOUTS.map(({ layout, label, icon: Icon }) => {
        const current = project.layout === layout;
        return (
          <button
            key={layout}
            type="button"
            aria-pressed={current}
            onClick={() => {
              if (!current) setLayout({ id: project.id, layout });
            }}
            className={cn(
              "flex h-7 items-center gap-1.5 rounded px-2 text-xs font-medium transition-colors focus-visible:outline-2 focus-visible:outline-ring",
              current
                ? "bg-primary-soft text-primary"
                : "text-muted-foreground hover:bg-surface-muted hover:text-foreground",
            )}
          >
            <Icon className="size-4" aria-hidden />
            <span className="sr-only sm:not-sr-only">{label}</span>
          </button>
        );
      })}
    </div>
  );
}
