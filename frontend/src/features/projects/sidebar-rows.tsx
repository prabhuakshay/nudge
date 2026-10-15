import { Link } from "@tanstack/react-router";
import {
  ChevronDown,
  ChevronRight,
  Ellipsis,
  Folder,
  FolderInput,
  Pencil,
  Plus,
  Trash2,
} from "lucide-react";
import type { ReactNode, SyntheticEvent } from "react";
import { toast } from "sonner";

import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuSub,
  DropdownMenuSubContent,
  DropdownMenuSubTrigger,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { cn } from "@/lib/utils";

import { ProjectIcon } from "./project-icon";
import {
  useDeleteFolder,
  useUpdateFolder,
  type SidebarFolder,
  type SidebarItem,
  type SidebarProject,
} from "./projects";
import type { Placement } from "./sidebar-order";

/** A sidebar row: the classes every Project, Folder and Person row shares. */
export const ROW =
  "group flex h-10 items-center gap-2.5 rounded-md pr-1 pl-2.5 text-sm font-semibold text-muted-foreground transition-colors hover:bg-surface-muted hover:text-foreground lg:h-9";

/** Keeps a press on a row's own controls from starting a drag of the row. */
function keepFromDragging(event: SyntheticEvent) {
  event.stopPropagation();
}

const DRAG_GUARD = {
  onMouseDown: keepFromDragging,
  onTouchStart: keepFromDragging,
  onKeyDown: keepFromDragging,
};

/** A row's ⋯ menu, shown on hover or focus where there is a pointer, always on touch. */
export function RowMenu({ label, children }: { label: string; children: ReactNode }) {
  return (
    <DropdownMenu>
      <DropdownMenuTrigger
        aria-label={label}
        {...DRAG_GUARD}
        className="flex size-8 shrink-0 items-center justify-center rounded-md text-muted-foreground transition-colors group-focus-within:opacity-100 group-hover:opacity-100 hover:bg-surface hover:text-foreground focus-visible:opacity-100 data-[state=open]:opacity-100 lg:size-7 pointer-fine:opacity-0"
      >
        <Ellipsis className="size-4" aria-hidden />
      </DropdownMenuTrigger>
      <DropdownMenuContent align="start">{children}</DropdownMenuContent>
    </DropdownMenu>
  );
}

/** A Project in the sidebar: a link to its list, its open count and its menu. */
export function ProjectRow({
  project,
  items,
  folders,
  onNavigate,
  onEdit,
  onMove,
}: {
  project: SidebarProject;
  items: SidebarItem[];
  folders: SidebarFolder[];
  onNavigate?: () => void;
  onEdit: () => void;
  onMove: (placement: Placement) => void;
}) {
  const last = (siblings: SidebarItem[]) => {
    const item = siblings.filter((sibling) => sibling.id !== project.id).at(-1);
    return item ? { kind: item.kind, id: item.id } : null;
  };
  return (
    <div className={cn(ROW, "has-[a[data-status=active]]:bg-primary-soft")}>
      <Link
        to="/projects/$projectId"
        params={{ projectId: String(project.id) }}
        onClick={onNavigate}
        className="flex min-w-0 flex-1 items-center gap-2.5 self-stretch rounded-md outline-none focus-visible:ring-2 focus-visible:ring-ring data-[status=active]:text-primary"
      >
        <ProjectIcon project={project} />
        <span className="truncate">{project.name}</span>
        {project.open_count > 0 && (
          <>
            <span
              aria-hidden
              className="ml-auto text-xs font-medium tabular-nums group-hover:hidden"
            >
              {project.open_count}
            </span>
            <span className="sr-only">, {project.open_count} open</span>
          </>
        )}
      </Link>
      <RowMenu label={`${project.name} options`}>
        <DropdownMenuItem onSelect={onEdit}>
          <Pencil aria-hidden /> Edit
        </DropdownMenuItem>
        <DropdownMenuSub>
          <DropdownMenuSubTrigger>
            <FolderInput aria-hidden /> Move to folder
          </DropdownMenuSubTrigger>
          <DropdownMenuSubContent>
            <DropdownMenuItem
              disabled={project.folder_id === null}
              onSelect={() => {
                onMove({ folderId: null, after: last(items) });
              }}
            >
              No folder
            </DropdownMenuItem>
            {folders.map((folder) => (
              <DropdownMenuItem
                key={folder.id}
                disabled={project.folder_id === folder.id}
                onSelect={() => {
                  onMove({ folderId: folder.id, after: last(folder.projects) });
                }}
              >
                <Folder aria-hidden /> {folder.name}
              </DropdownMenuItem>
            ))}
          </DropdownMenuSubContent>
        </DropdownMenuSub>
      </RowMenu>
    </div>
  );
}

/** A Folder in the sidebar: a button that collapses it, and its menu. */
export function FolderRow({
  folder,
  onNewProject,
  onRename,
}: {
  folder: SidebarFolder;
  onNewProject: () => void;
  onRename: () => void;
}) {
  const updateFolder = useUpdateFolder();
  const deleteFolder = useDeleteFolder();
  const Chevron = folder.collapsed ? ChevronRight : ChevronDown;
  return (
    <div className={ROW}>
      <button
        type="button"
        aria-expanded={!folder.collapsed}
        onClick={() => {
          updateFolder.mutate({ id: folder.id, collapsed: !folder.collapsed });
        }}
        className="flex min-w-0 flex-1 items-center gap-2.5 self-stretch rounded-md text-left outline-none focus-visible:ring-2 focus-visible:ring-ring"
      >
        <Chevron className="size-4 shrink-0" aria-hidden />
        <span className="truncate">{folder.name}</span>
      </button>
      <RowMenu label={`${folder.name} options`}>
        <DropdownMenuItem onSelect={onNewProject}>
          <Plus aria-hidden /> New project here
        </DropdownMenuItem>
        <DropdownMenuItem onSelect={onRename}>
          <Pencil aria-hidden /> Rename
        </DropdownMenuItem>
        <DropdownMenuSeparator />
        <DropdownMenuItem
          variant="danger"
          onSelect={() => {
            deleteFolder.mutate(folder.id, {
              onSuccess: () => toast(`Deleted “${folder.name}”. Its projects stay in the sidebar.`),
            });
          }}
        >
          <Trash2 aria-hidden /> Delete folder
        </DropdownMenuItem>
      </RowMenu>
    </div>
  );
}
