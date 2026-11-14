import { useQuery } from "@tanstack/react-query";
import { useState } from "react";
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
  useUpdateShareLink,
  type ShareLink,
  type ShareLinkChange,
} from "./share-links";
import {
  currentSettings,
  DEFAULT_SETTINGS,
  describeRange,
  newLinkBody,
  settingsBody,
} from "./share-settings";
import { ShareSettingsFields } from "./share-settings-fields";

/** A Project menu's Share item. The menu's owner shows the panel, which outlives the closed menu. */
export function ShareProjectItem({ onSelect }: { onSelect: () => void }) {
  return (
    <DropdownMenuItem onSelect={onSelect}>
      <Share2 aria-hidden /> Share
    </DropdownMenuItem>
  );
}

/**
 * The Share panel: a Project's Share links, each with its address to copy, its settings to change
 * and a way to stop sharing it, and a form that creates another.
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
  const update = useUpdateShareLink(projectId);
  const stop = useStopShareLink(projectId);
  const [settings, setSettings] = useState(DEFAULT_SETTINGS);
  const failure = create.error ?? update.error ?? stop.error;

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
              onChange={(change, onSaved) => {
                update.mutate({ linkId: link.id, change }, { onSuccess: onSaved });
              }}
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
      <form
        onSubmit={(event) => {
          event.preventDefault();
          create.mutate(newLinkBody(settings));
        }}
        className="flex flex-col gap-3 border-t border-border pt-4"
      >
        <ShareSettingsFields settings={settings} onChange={setSettings} />
        <Button type="submit" className="self-start" disabled={create.isPending}>
          Create link
        </Button>
      </form>
    </div>
  );
}

function ShareLinkItem({
  link,
  stopping,
  onChange,
  onStop,
}: {
  link: ShareLink;
  stopping: boolean;
  onChange: (change: ShareLinkChange, onSaved: () => void) => void;
  onStop: () => void;
}) {
  const [editing, setEditing] = useState(false);
  const expiry = link.expires_at ? `Expires ${longDate(link.expires_at)}` : "Never expires";
  const opened = link.last_opened_at
    ? `Last opened ${format(parseISO(link.last_opened_at), "d MMM yyyy, HH:mm")}`
    : "Never opened";

  return (
    <li className="flex flex-col gap-2 rounded-lg border border-border p-3">
      <CopyField label="Share link address" value={link.url} />
      {editing ? (
        <EditShareLink
          link={link}
          currentExpiry={`Keep: ${link.expires_at ? longDate(link.expires_at) : "never"}`}
          onCancel={() => {
            setEditing(false);
          }}
          onSave={(change) => {
            onChange(change, () => {
              setEditing(false);
            });
          }}
        />
      ) : (
        <>
          <p className="text-xs text-muted-foreground">
            {expiry} · {describeRange(link.range_days)} · {opened}
          </p>
          <div className="flex items-center justify-end gap-2">
            <Button
              variant="outline"
              onClick={() => {
                setEditing(true);
              }}
            >
              Edit
            </Button>
            <Button variant="outline" disabled={stopping} onClick={onStop}>
              Stop sharing
            </Button>
          </div>
        </>
      )}
    </li>
  );
}

function EditShareLink({
  link,
  currentExpiry,
  onCancel,
  onSave,
}: {
  link: ShareLink;
  currentExpiry: string;
  onCancel: () => void;
  onSave: (change: ShareLinkChange) => void;
}) {
  const [settings, setSettings] = useState(() => currentSettings(link.range_days));

  return (
    <form
      onSubmit={(event) => {
        event.preventDefault();
        onSave(settingsBody(settings, link.range_days));
      }}
      className="flex flex-col gap-2"
    >
      <ShareSettingsFields
        settings={settings}
        currentExpiry={currentExpiry}
        onChange={setSettings}
      />
      <div className="flex items-center justify-end gap-2">
        <Button type="button" variant="outline" onClick={onCancel}>
          Cancel
        </Button>
        <Button type="submit">Save</Button>
      </div>
    </form>
  );
}

function longDate(iso: string) {
  return format(parseISO(iso), "d MMM yyyy");
}
