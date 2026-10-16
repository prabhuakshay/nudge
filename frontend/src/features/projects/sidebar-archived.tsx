import { useQuery } from "@tanstack/react-query";
import { ChevronDown, ChevronRight } from "lucide-react";
import { useState } from "react";

import { sidebarQuery } from "@/features/tasks/tasks";

import { ArchivedProjectRow } from "./sidebar-rows";

/**
 * The sidebar's Archived section under the Projects: collapsed until opened, and absent while
 * nothing is archived. Archived Projects are listed by name and open read-only.
 */
export function SidebarArchived({ onNavigate }: { onNavigate?: () => void }) {
  const { data: sidebar } = useQuery(sidebarQuery);
  const [expanded, setExpanded] = useState(false);
  const archived = sidebar?.archived ?? [];
  if (archived.length === 0) return null;
  const Chevron = expanded ? ChevronDown : ChevronRight;

  return (
    <section aria-label="Archived" className="px-2">
      <button
        type="button"
        aria-expanded={expanded}
        onClick={() => {
          setExpanded(!expanded);
        }}
        className="flex h-8 w-full items-center gap-1.5 rounded-md pr-2 pl-2.5 text-xs font-bold tracking-wider text-muted-foreground uppercase transition-colors outline-none hover:text-foreground focus-visible:ring-2 focus-visible:ring-ring"
      >
        <Chevron className="size-3.5" aria-hidden />
        Archived
        <span aria-hidden className="ml-auto font-medium tracking-normal tabular-nums">
          {archived.length}
        </span>
      </button>
      {expanded && (
        <ul>
          {archived.map((project) => (
            <li key={project.id}>
              <ArchivedProjectRow project={project} onNavigate={onNavigate} />
            </li>
          ))}
        </ul>
      )}
    </section>
  );
}
