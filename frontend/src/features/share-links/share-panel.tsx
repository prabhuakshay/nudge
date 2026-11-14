import { useQuery } from "@tanstack/react-query";
import { format, parseISO } from "date-fns";
import { Share2 } from "lucide-react";

import { Button } from "@/components/ui/button";
import { CopyField } from "@/components/ui/copy-field";
import { DropdownMenuItem } from "@/components/ui/dropdown-menu";
import { SidebarDialog } from "@/features/projects/project-dialog";
import type { SidebarProject } from "@/features/projects/projects";

import {
  shareLinksQuery,
  useCreateShareLink,
  useStopShareLink,
  type ShareLink,
} from "./share-links";

/** A Project menu's Share item. The menu's owner shows the panel, which outlives the closed menu. */
export function ShareProjectItem({ onSelect }: { onSelect: () => void }) {
  return (
    <DropdownMenuItem onSelect={onSelect}>
      <Share2 aria-hidden /> Share
    </DropdownMenuItem>
  );
}

/**
 * The Share panel: a Project's Share links, each with its address to copy and a way to stop
 * sharing it, and a button that creates another.
 */
export function SharePanel({
  project,
  open,
  onOpenChange,
}: {
  project: SidebarProject;
  open: boolean;
  onOpenChange: (open: boolean) => void;
}) {
  return (
    <SidebarDialog open={open} onOpenChange={onOpenChange} title={`Share “${project.name}”`}>
      {open && <ShareLinks projectId={project.id} />}
    </SidebarDialog>
  );
}

function ShareLinks({ projectId }: { projectId: number }) {
  const { data: links, isError } = useQuery(shareLinksQuery(projectId));
  const create = useCreateShareLink(projectId);
  const stop = useStopShareLink(projectId);
  const failure = create.error ?? stop.error;

  return (
    <div className="flex min-h-0 flex-col gap-4 overflow-y-auto px-5 pb-5">
      <p className="text-sm text-muted-foreground">
        Anyone with a link can read this project&apos;s tasks without signing in, until it expires
        or you stop sharing it.
      </p>
      {links === undefined ? (
        <p className="text-sm text-muted-foreground">
          {isError ? "Couldn't load the Share links." : "Loading…"}
        </p>
      ) : links.length === 0 ? (
        <p className="text-sm text-muted-foreground">This project is not shared yet.</p>
      ) : (
        <ul className="flex flex-col gap-3">
          {links.map((link) => (
            <ShareLinkItem
              key={link.id}
              link={link}
              stopping={stop.isPending && stop.variables === link.id}
              onStop={() => {
                stop.mutate(link.id);
              }}
            />
          ))}
        </ul>
      )}
      {failure && (
        <p role="alert" className="text-xs text-danger">
          {failure.message}
        </p>
      )}
      <Button
        className="self-start"
        disabled={create.isPending}
        onClick={() => {
          create.mutate();
        }}
      >
        Create link
      </Button>
    </div>
  );
}

function ShareLinkItem({
  link,
  stopping,
  onStop,
}: {
  link: ShareLink;
  stopping: boolean;
  onStop: () => void;
}) {
  return (
    <li className="flex flex-col gap-2 rounded-lg border border-border p-3">
      <CopyField label="Share link address" value={link.url} />
      <div className="flex items-center justify-between gap-2">
        <p className="text-xs text-muted-foreground">
          {link.expires_at
            ? `Expires ${format(parseISO(link.expires_at), "d MMM yyyy")}`
            : "Never expires"}
        </p>
        <Button variant="outline" disabled={stopping} onClick={onStop}>
          Stop sharing
        </Button>
      </div>
    </li>
  );
}
