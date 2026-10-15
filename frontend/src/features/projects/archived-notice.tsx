import { Archive } from "lucide-react";

import { Button } from "@/components/ui/button";

import { useSetArchived, type SidebarProject } from "./projects";

/** Takes Quick add's place on an archived Project's list: says why it's read-only, and undoes it. */
export function ArchivedNotice({ project }: { project: SidebarProject }) {
  const setArchived = useSetArchived();
  return (
    <div className="mb-4 flex items-center gap-3 rounded-xl border border-border bg-surface-muted/60 py-2 pr-2 pl-3.5 text-sm text-muted-foreground">
      <Archive className="size-4 shrink-0" aria-hidden />
      <p className="min-w-0 flex-1">This project is archived. Its tasks are read-only.</p>
      <Button
        variant="outline"
        onClick={() => {
          setArchived(project, false);
        }}
      >
        Unarchive
      </Button>
    </div>
  );
}
