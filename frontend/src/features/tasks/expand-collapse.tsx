import { ChevronsDownUp, ChevronsUpDown } from "lucide-react";
import type { ReactNode } from "react";

import { Tooltip, TooltipContent, TooltipTrigger } from "@/components/ui/tooltip";
import { cn } from "@/lib/utils";

/** The list header's Expand all / Collapse all pair, for every Task with Subtasks at once. */
export function ExpandCollapse({
  onExpand,
  onCollapse,
}: {
  onExpand: () => void;
  onCollapse: () => void;
}) {
  return (
    <div className="ml-auto flex items-center rounded-md border border-border bg-surface shadow-xs">
      <HeaderIconButton label="Expand all" onClick={onExpand} className="rounded-l-md">
        <ChevronsUpDown className="size-4" aria-hidden />
      </HeaderIconButton>
      <span className="h-5 w-px bg-border" aria-hidden />
      <HeaderIconButton label="Collapse all" onClick={onCollapse} className="rounded-r-md">
        <ChevronsDownUp className="size-4" aria-hidden />
      </HeaderIconButton>
    </div>
  );
}

function HeaderIconButton({
  label,
  onClick,
  className,
  children,
}: {
  label: string;
  onClick: () => void;
  className: string;
  children: ReactNode;
}) {
  return (
    <Tooltip>
      <TooltipTrigger asChild>
        <button
          type="button"
          aria-label={label}
          onClick={onClick}
          className={cn(
            "flex size-11 items-center justify-center text-muted-foreground transition-colors hover:bg-surface-muted hover:text-foreground focus-visible:outline-2 focus-visible:outline-ring sm:size-9",
            className,
          )}
        >
          {children}
        </button>
      </TooltipTrigger>
      <TooltipContent>{label}</TooltipContent>
    </Tooltip>
  );
}
