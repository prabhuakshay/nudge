import { useQuery } from "@tanstack/react-query";

import { Avatar } from "@/components/ui/avatar";
import { HUE } from "@/features/projects/project-style";
import { cn } from "@/lib/utils";

import { splitMentions, type Mention } from "./mentions";
import { peopleQuery } from "./people";

/**
 * A mentioned Person as an inline chip: their initials and name in their colour. A Person the
 * address book doesn't hold (yet) shows the name the Mention was written with.
 */
export function PersonChip({ mention, className }: { mention: Mention; className?: string }) {
  const { data: people } = useQuery(peopleQuery);
  const person = people?.find((candidate) => candidate.id === mention.id);
  const name = person?.name ?? mention.name;
  const hue = person ? HUE[person.color] : null;
  return (
    <span
      data-mention
      className={cn(
        "inline-flex max-w-full items-center gap-1 rounded-full py-px pr-1.5 pl-px align-baseline text-[0.92em] font-semibold",
        hue ? [hue.soft, hue.text] : "bg-surface-muted text-muted-foreground",
        className,
      )}
    >
      <Avatar
        name={name}
        size="xs"
        className={cn("size-4 text-[8px] text-surface", hue ? hue.bg : "bg-muted-foreground")}
      />
      <span className="truncate">{name}</span>
    </span>
  );
}

/** Text with its Mention tokens shown as Person chips. */
export function MentionText({ text }: { text: string }) {
  return (
    <>
      {splitMentions(text).map((part) =>
        typeof part === "string" ? part : <PersonChip key={part.start} mention={part} />,
      )}
    </>
  );
}
