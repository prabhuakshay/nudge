import { cn } from "@/lib/utils";

import { HUE, PROJECT_ICONS } from "./project-style";
import type { PaletteColor, ProjectIconKey } from "./projects";

/** A Project's icon in its colour. Decorative: the Project's name always sits beside it. */
export function ProjectIcon({
  project,
  className,
}: {
  project: { icon: ProjectIconKey; color: PaletteColor };
  className?: string;
}) {
  const Icon = PROJECT_ICONS[project.icon];
  return <Icon className={cn("size-4 shrink-0", HUE[project.color].text, className)} aria-hidden />;
}
