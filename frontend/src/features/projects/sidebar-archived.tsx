import { useQuery } from "@tanstack/react-query";
import { Archive } from "lucide-react";
import { useState } from "react";

import { sidebarQuery } from "@/features/tasks/tasks";

import { ArchivedProjectRow, ROW, ToggleButton } from "./sidebar-rows";
import { INDENT } from "./sidebar-tree";

/**
 * The Archived row at the end of the Projects section: it opens like a Folder, starts closed,
 * and is absent while nothing is archived. Archived Projects are listed by name and open
 * read-only.
 */
export function SidebarArchived({ onNavigate }: { onNavigate?: () => void }) {
  const { data: sidebar } = useQuery(sidebarQuery);
  const [expanded, setExpanded] = useState(false);
  const archived = sidebar?.archived ?? [];
  if (archived.length === 0) return null;

  return (
    <div className="mt-px">
      <div className={ROW}>
        <ToggleButton
          expanded={expanded}
          icon={Archive}
          onToggle={() => {
            setExpanded(!expanded);
          }}
        >
          Archived
        </ToggleButton>
      </div>
      {expanded && (
        <ul aria-label="Archived" className="flex flex-col gap-px" style={{ paddingLeft: INDENT }}>
          {archived.map((project) => (
            <li key={project.id}>
              <ArchivedProjectRow project={project} onNavigate={onNavigate} />
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
