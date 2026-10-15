/* How Quick add's matches and chips look: their colours, icons and labels. */

import { AtSign, CalendarDays, Flag, FolderInput, Hash, type LucideIcon } from "lucide-react";

import { HUE } from "@/features/projects/project-style";
import { tagHue } from "@/features/tags/tags";
import { cn } from "@/lib/utils";

import type { QuickAddMatch } from "./quick-add";
import type { ViewDefault } from "./quick-add-view";
import { PRIORITY } from "./task-properties";

const GREY = "bg-surface-muted text-muted-foreground";

/** A match's highlight colours, the same as its item's everywhere else. New items are grey. */
export function matchClass(match: QuickAddMatch | ViewDefault): string {
  switch (match.kind) {
    case "priority":
      return cn(PRIORITY[match.priority].soft, PRIORITY[match.priority].text);
    case "tag":
      return match.tag ? cn(tagHue(match.tag).soft, tagHue(match.tag).text) : GREY;
    case "person":
      return match.person ? cn(HUE[match.person.color].soft, HUE[match.person.color].text) : GREY;
    case "project":
      return cn(HUE[match.project.color].soft, HUE[match.project.color].text);
    case "date":
      return "bg-success-soft text-success";
  }
}

/** The icon on each kind of chip. */
export const CHIP_ICON: Record<(QuickAddMatch | ViewDefault)["kind"], LucideIcon> = {
  priority: Flag,
  tag: Hash,
  person: AtSign,
  project: FolderInput,
  date: CalendarDays,
};

/** What a chip says: the item's name, and whether it will be created. */
export function chipLabel(match: QuickAddMatch | ViewDefault) {
  switch (match.kind) {
    case "priority":
      return PRIORITY[match.priority].long;
    case "tag":
      return "name" in match ? match.name : match.tag.name;
    case "person":
      return "name" in match ? match.name : match.person.name;
    case "project":
      return match.project.name;
    case "date":
      return match.label;
  }
}

/** Whether a match names a Tag or Person to create. */
export function isNew(match: QuickAddMatch | ViewDefault) {
  return (match.kind === "tag" && !match.tag) || (match.kind === "person" && !match.person);
}
