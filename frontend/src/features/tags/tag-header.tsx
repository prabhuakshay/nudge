import { Hash } from "lucide-react";

import { Badge } from "@/components/ui/badge";
import { cn } from "@/lib/utils";

import { tagHue, type SidebarTag } from "./tags";

/** A Tag's page title: a hash on a tile of its colour, its name and its open count. */
export function TagHeader({ tag }: { tag: SidebarTag }) {
  const hue = tagHue(tag);
  return (
    <header className="mb-4 flex items-center gap-2.5 sm:gap-3">
      <span
        className={cn(
          "flex size-9 shrink-0 items-center justify-center rounded-lg",
          hue.soft,
          hue.text,
        )}
      >
        <Hash className="size-5" aria-hidden />
      </span>
      <h1 className="min-w-0 truncate text-2xl font-extrabold tracking-tight sm:text-3xl">
        {tag.name}
      </h1>
      <Badge variant="secondary" className="shrink-0 tabular-nums">
        {tag.open_count} open
      </Badge>
    </header>
  );
}
