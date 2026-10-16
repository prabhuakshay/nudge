import { useQuery } from "@tanstack/react-query";
import { Check } from "lucide-react";
import { useState, type ReactNode } from "react";

import {
  Command,
  CommandEmpty,
  CommandGroup,
  CommandInput,
  CommandItem,
  CommandList,
} from "@/components/ui/command";
import { ResponsivePopover } from "@/components/ui/responsive-popover";
import { sidebarQuery } from "@/features/tasks/tasks";

import { ProjectIcon } from "./project-icon";
import type { SidebarProject } from "./projects";

type ProjectPickerProps = {
  /** The Project the Task is in now, ticked in the list. */
  currentId: number;
  onSelect: (project: SidebarProject) => void;
  /** The element that opens the picker; it must accept a ref, like a button. */
  children: ReactNode;
};

/**
 * A searchable list of the user's Projects, grouped as the sidebar groups them: the Inbox,
 * ungrouped Projects, then each Folder.
 */
export function ProjectPicker({ currentId, onSelect, children }: ProjectPickerProps) {
  const [open, setOpen] = useState(false);
  const { data: sidebar } = useQuery(sidebarQuery);
  if (!sidebar) return children;
  const ungrouped = sidebar.items.filter((item) => item.kind === "project");
  const folders = sidebar.items.filter((item) => item.kind === "folder");

  const option = (project: SidebarProject) => (
    <CommandItem
      key={project.id}
      value={`${project.name} ${String(project.id)}`}
      onSelect={() => {
        setOpen(false);
        if (project.id !== currentId) onSelect(project);
      }}
    >
      <ProjectIcon project={project} />
      <span className="flex-1 truncate">{project.name}</span>
      {project.id === currentId && <Check className="size-4 text-primary" aria-label="Current" />}
    </CommandItem>
  );

  return (
    <ResponsivePopover
      label="Move to project"
      trigger={children}
      open={open}
      onOpenChange={setOpen}
      className="w-64"
    >
      <Command>
        <CommandInput placeholder="Move to…" aria-label="Find a project" />
        <CommandList>
          <CommandEmpty>No projects match.</CommandEmpty>
          <CommandGroup>
            {option(sidebar.inbox)}
            {ungrouped.map(option)}
          </CommandGroup>
          {folders.map((folder) => (
            <CommandGroup key={folder.id} heading={folder.name}>
              {folder.projects.map(option)}
            </CommandGroup>
          ))}
        </CommandList>
      </Command>
    </ResponsivePopover>
  );
}
