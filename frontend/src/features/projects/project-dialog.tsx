import { X } from "lucide-react";
import { useId, useState, type ReactNode, type SubmitEvent } from "react";

import { Button } from "@/components/ui/button";
import { Dialog, DialogClose, DialogContent, DialogTitle } from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { cn } from "@/lib/utils";

import { ColorField } from "./color-field";
import { HUE, PICKABLE_ICONS, PROJECT_ICONS } from "./project-style";
import {
  useCreateFolder,
  useCreateProject,
  useUpdateFolder,
  useUpdateProject,
  type PaletteColor,
  type ProjectIconKey,
  type SidebarFolder,
  type SidebarProject,
} from "./projects";

type ProjectDialogProps = {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  /** The Project to edit; a new Project is created when left out. */
  project?: SidebarProject;
  /** The Folder a new Project goes in. */
  folderId?: number | null;
};

/**
 * Create or edit a Project: its name, colour and icon. A new Project with no colour picked gets
 * a random one from the server.
 */
export function ProjectDialog({ open, onOpenChange, project, folderId }: ProjectDialogProps) {
  return (
    <SidebarDialog
      open={open}
      onOpenChange={onOpenChange}
      title={project ? "Edit project" : "New project"}
    >
      {/* Keyed by `open` so each opening starts from the Project's current values. */}
      <ProjectForm
        key={String(open)}
        project={project}
        folderId={folderId ?? null}
        onDone={() => {
          onOpenChange(false);
        }}
      />
    </SidebarDialog>
  );
}

function ProjectForm({
  project,
  folderId,
  onDone,
}: {
  project?: SidebarProject;
  folderId: number | null;
  onDone: () => void;
}) {
  const nameId = useId();
  const [name, setName] = useState(project?.name ?? "");
  const [color, setColor] = useState<PaletteColor | null>(project?.color ?? null);
  const [icon, setIcon] = useState<ProjectIconKey>(project?.icon ?? "list");
  const create = useCreateProject();
  const update = useUpdateProject();
  const pending = create.isPending || update.isPending;

  function handleSubmit(event: SubmitEvent<HTMLFormElement>) {
    event.preventDefault();
    const fields = { name, icon, ...(color && { color }) };
    if (project) {
      update.mutate({ id: project.id, ...fields }, { onSuccess: onDone });
    } else {
      create.mutate({ ...fields, folder_id: folderId }, { onSuccess: onDone });
    }
  }

  return (
    <form onSubmit={handleSubmit} className="flex min-h-0 flex-1 flex-col">
      <div className="flex min-h-0 flex-1 flex-col gap-5 overflow-y-auto px-5 pb-5">
        <div className="flex flex-col gap-1.5">
          <Label htmlFor={nameId}>Name</Label>
          <Input
            id={nameId}
            required
            maxLength={64}
            autoComplete="off"
            value={name}
            onChange={(event) => {
              setName(event.target.value);
            }}
          />
        </div>

        <ColorField value={color} onChange={setColor} />

        <fieldset>
          <legend className="mb-2 text-sm font-semibold">Icon</legend>
          <div className="grid grid-cols-8 gap-1">
            {PICKABLE_ICONS.map((key) => {
              const Icon = PROJECT_ICONS[key];
              return (
                <label key={key} className="relative">
                  <input
                    type="radio"
                    name="icon"
                    value={key}
                    checked={icon === key}
                    onChange={() => {
                      setIcon(key);
                    }}
                    aria-label={key.replace(/-\d$/, "").replaceAll("-", " ")}
                    className="peer sr-only"
                  />
                  <span
                    className={cn(
                      "flex aspect-square cursor-pointer items-center justify-center rounded-md text-muted-foreground transition-colors peer-checked:bg-primary-soft peer-focus-visible:outline-2 peer-focus-visible:outline-ring hover:bg-surface-muted",
                      icon === key && color ? HUE[color].text : "peer-checked:text-primary",
                    )}
                  >
                    <Icon className="size-5 sm:size-4" aria-hidden />
                  </span>
                </label>
              );
            })}
          </div>
        </fieldset>
      </div>

      <DialogFooter pending={pending} label={project ? "Save" : "Create project"} />
    </form>
  );
}

type FolderDialogProps = {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  /** The Folder to rename; a new Folder is created when left out. */
  folder?: SidebarFolder;
};

/** Create a Folder or rename one. */
export function FolderDialog({ open, onOpenChange, folder }: FolderDialogProps) {
  return (
    <SidebarDialog
      open={open}
      onOpenChange={onOpenChange}
      title={folder ? "Rename folder" : "New folder"}
    >
      <FolderForm
        key={String(open)}
        folder={folder}
        onDone={() => {
          onOpenChange(false);
        }}
      />
    </SidebarDialog>
  );
}

function FolderForm({ folder, onDone }: { folder?: SidebarFolder; onDone: () => void }) {
  const nameId = useId();
  const [name, setName] = useState(folder?.name ?? "");
  const create = useCreateFolder();
  const update = useUpdateFolder();

  function handleSubmit(event: SubmitEvent<HTMLFormElement>) {
    event.preventDefault();
    if (folder) {
      update.mutate({ id: folder.id, name }, { onSuccess: onDone });
    } else {
      create.mutate(name, { onSuccess: onDone });
    }
  }

  return (
    <form onSubmit={handleSubmit} className="flex flex-col">
      <div className="flex flex-col gap-1.5 px-5 pb-5">
        <Label htmlFor={nameId}>Name</Label>
        <Input
          id={nameId}
          required
          maxLength={64}
          autoComplete="off"
          value={name}
          onChange={(event) => {
            setName(event.target.value);
          }}
        />
      </div>
      <DialogFooter
        pending={create.isPending || update.isPending}
        label={folder ? "Save" : "Create folder"}
      />
    </form>
  );
}

/** The shared frame: full screen on phones, a small centred panel from `sm`. */
export function SidebarDialog({
  open,
  onOpenChange,
  title,
  children,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  title: string;
  children: ReactNode;
}) {
  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent aria-describedby={undefined} className="sm:max-h-[90dvh] sm:w-[26rem]">
        <div className="flex h-14 shrink-0 items-center pr-14 pl-5">
          <DialogTitle className="text-lg font-bold tracking-tight">{title}</DialogTitle>
        </div>
        {children}
        {/* After the form, so the dialog focuses the Name field first when it opens. */}
        <DialogClose asChild>
          <Button
            variant="ghost"
            size="icon"
            aria-label="Close"
            className="absolute top-[calc(env(safe-area-inset-top)+0.375rem)] right-2 text-muted-foreground sm:top-2.5"
          >
            <X aria-hidden />
          </Button>
        </DialogClose>
      </DialogContent>
    </Dialog>
  );
}

/** Cancel and the submit button, along the bottom of a sidebar dialog's form. */
export function DialogFooter({ pending, label }: { pending: boolean; label: string }) {
  return (
    <div className="flex shrink-0 justify-end gap-2 border-t border-border px-5 py-3">
      <DialogClose asChild>
        <Button type="button" variant="outline">
          Cancel
        </Button>
      </DialogClose>
      <Button type="submit" disabled={pending}>
        {label}
      </Button>
    </div>
  );
}
