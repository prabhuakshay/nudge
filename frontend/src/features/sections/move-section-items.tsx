import { ArrowDown, ArrowUp } from "lucide-react";

import { DropdownMenuItem } from "@/components/ui/dropdown-menu";

import { useMoveSection, type Section } from "./sections";

/** A Section menu's Move up and Move down items, which swap it with its neighbour in `order`. */
export function MoveSectionItems({ section, order }: { section: Section; order: Section[] }) {
  const moveSection = useMoveSection(section.project_id);
  const index = order.findIndex(({ id }) => id === section.id);
  const above = order[index - 1];
  const below = order[index + 1];
  return (
    <>
      <DropdownMenuItem
        disabled={!above}
        onSelect={() => {
          moveSection.mutate({ id: section.id, after_id: order[index - 2]?.id ?? null });
        }}
      >
        <ArrowUp aria-hidden /> Move up
      </DropdownMenuItem>
      <DropdownMenuItem
        disabled={!below}
        onSelect={() => {
          if (below) moveSection.mutate({ id: section.id, after_id: below.id });
        }}
      >
        <ArrowDown aria-hidden /> Move down
      </DropdownMenuItem>
    </>
  );
}
