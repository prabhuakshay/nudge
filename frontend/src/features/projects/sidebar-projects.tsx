import { useQuery } from "@tanstack/react-query";
import { FolderPlus, Plus } from "lucide-react";
import { useState } from "react";

import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { sidebarQuery } from "@/features/tasks/tasks";

import { FolderDialog, ProjectDialog } from "./project-dialog";
import { useMoveFolder, useMoveProject, type SidebarFolder, type SidebarProject } from "./projects";
import { FolderRow, ProjectRow } from "./sidebar-rows";
import { SidebarTree } from "./sidebar-tree";

type OpenDialog =
  | { kind: "project"; project?: SidebarProject; folderId?: number }
  | { kind: "folder"; folder?: SidebarFolder }
  | null;

/**
 * The sidebar's Projects section: Folders and ungrouped Projects in the user's order, each
 * Project with its open Task count. Rows drag to reorder, and menus create, edit and file them.
 */
export function SidebarProjects({ onNavigate }: { onNavigate?: () => void }) {
  const { data: sidebar } = useQuery(sidebarQuery);
  const [dialog, setDialog] = useState<OpenDialog>(null);
  const moveProject = useMoveProject();
  const moveFolder = useMoveFolder();
  const items = sidebar?.items ?? [];
  const folders = items.filter((item) => item.kind === "folder");

  return (
    <section aria-labelledby="projects-heading" className="px-2">
      <div className="flex h-8 items-center justify-between pr-1 pl-2.5">
        <h2
          id="projects-heading"
          className="text-xs font-bold tracking-wider text-muted-foreground uppercase"
        >
          Projects
        </h2>
        <DropdownMenu>
          <DropdownMenuTrigger
            aria-label="Add a project or folder"
            className="flex size-9 items-center justify-center rounded-md text-muted-foreground transition-colors hover:bg-surface-muted hover:text-foreground lg:size-7"
          >
            <Plus className="size-4" aria-hidden />
          </DropdownMenuTrigger>
          <DropdownMenuContent align="end">
            <DropdownMenuItem
              onSelect={() => {
                setDialog({ kind: "project" });
              }}
            >
              <Plus aria-hidden /> New project
            </DropdownMenuItem>
            <DropdownMenuItem
              onSelect={() => {
                setDialog({ kind: "folder" });
              }}
            >
              <FolderPlus aria-hidden /> New folder
            </DropdownMenuItem>
          </DropdownMenuContent>
        </DropdownMenu>
      </div>

      {items.length === 0 ? (
        <button
          type="button"
          onClick={() => {
            setDialog({ kind: "project" });
          }}
          className="w-full rounded-md px-2.5 py-2 text-left text-sm text-muted-foreground hover:bg-surface-muted"
        >
          Group your tasks into projects. <span className="text-primary">Add one</span>
        </button>
      ) : (
        <SidebarTree
          items={items}
          onMove={(moving, placement) => {
            if (moving.kind === "project") {
              moveProject.mutate({ id: moving.id, placement });
            } else {
              moveFolder.mutate({ id: moving.id, after: placement.after });
            }
          }}
          renderRow={({ item }) =>
            item.kind === "folder" ? (
              <FolderRow
                folder={item}
                onNewProject={() => {
                  setDialog({ kind: "project", folderId: item.id });
                }}
                onRename={() => {
                  setDialog({ kind: "folder", folder: item });
                }}
              />
            ) : (
              <ProjectRow
                project={item}
                items={items}
                folders={folders}
                onNavigate={onNavigate}
                onEdit={() => {
                  setDialog({ kind: "project", project: item });
                }}
                onMove={(placement) => {
                  moveProject.mutate({ id: item.id, placement });
                }}
              />
            )
          }
        />
      )}

      <SidebarDialogs
        dialog={dialog}
        onClose={() => {
          setDialog(null);
        }}
      />
    </section>
  );
}

/** The create and edit dialogs, one open at a time. */
function SidebarDialogs({ dialog, onClose }: { dialog: OpenDialog; onClose: () => void }) {
  const onOpenChange = (open: boolean) => {
    if (!open) onClose();
  };
  const project = dialog?.kind === "project" ? dialog : null;
  const folder = dialog?.kind === "folder" ? dialog : null;
  return (
    <>
      <ProjectDialog
        open={project !== null}
        onOpenChange={onOpenChange}
        project={project?.project}
        folderId={project?.folderId}
      />
      <FolderDialog open={folder !== null} onOpenChange={onOpenChange} folder={folder?.folder} />
    </>
  );
}
