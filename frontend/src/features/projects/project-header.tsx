import type { ReactNode } from "react";

import { Badge } from "@/components/ui/badge";
import { cn } from "@/lib/utils";

import { LayoutSwitch } from "./layout-switch";
import { ProjectIcon } from "./project-icon";
import { HUE } from "./project-style";
import type { SidebarProject } from "./projects";

/**
 * A Project's page title: its icon on a tile of its colour, its name, its open count or that it
 * is archived, then any page actions passed as children and, outside the Inbox, the Layout
 * switch.
 */
export function ProjectHeader({
  project,
  children,
}: {
  project: SidebarProject;
  children?: ReactNode;
}) {
  return (
    <header className="mb-4 flex items-center gap-2.5 sm:gap-3">
      <span
        className={cn(
          "flex size-9 shrink-0 items-center justify-center rounded-lg",
          HUE[project.color].soft,
        )}
      >
        <ProjectIcon project={project} className="size-5" />
      </span>
      <h1 className="min-w-0 truncate text-2xl font-extrabold tracking-tight sm:text-3xl">
        {project.name}
      </h1>
      <Badge variant="secondary" className="shrink-0 tabular-nums">
        {project.is_archived ? "Archived" : `${String(project.open_count)} open`}
      </Badge>
      <div className="ml-auto flex shrink-0 items-center gap-2">
        {children}
        {!project.is_inbox && <LayoutSwitch project={project} />}
      </div>
    </header>
  );
}
