import { ArrowDown, ArrowLeft, ArrowRight, ArrowUp } from "lucide-react";

import { DropdownMenuItem } from "@/components/ui/dropdown-menu";

import { useMoveSection, type Section } from "./sections";

/**
 * A Section menu's Move up and Move down items, or Move left and Move right on a Board, which
 * swap it with its neighbour in `order`. They are disabled at the ends.
 */
export function MoveSectionItems({
  section,
  order,
  horizontal = false,
}: {
  section: Section;
  order: Section[];
  /** Name the moves for a Board's columns, which run left to right. */
  horizontal?: boolean;
}) {
  const moveSection = useMoveSection(section.project_id);
  const index = order.findIndex(({ id }) => id === section.id);
  const above = order[index - 1];
  const below = order[index + 1];
  const [Back, Forward] = horizontal ? [ArrowLeft, ArrowRight] : [ArrowUp, ArrowDown];
  return (
    <>
      <DropdownMenuItem
        disabled={!above}
        onSelect={() => {
          moveSection.mutate({ id: section.id, after_id: order[index - 2]?.id ?? null });
        }}
      >
        <Back aria-hidden /> {horizontal ? "Move left" : "Move up"}
      </DropdownMenuItem>
      <DropdownMenuItem
        disabled={!below}
        onSelect={() => {
          if (below) moveSection.mutate({ id: section.id, after_id: below.id });
        }}
      >
        <Forward aria-hidden /> {horizontal ? "Move right" : "Move down"}
      </DropdownMenuItem>
    </>
  );
}
