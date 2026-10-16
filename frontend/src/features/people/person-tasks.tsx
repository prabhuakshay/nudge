import { useQuery } from "@tanstack/react-query";

import { Badge } from "@/components/ui/badge";
import { FlatTaskTable } from "@/features/tasks/flat-task-table";

import { PersonAvatar } from "./person-avatar";
import { personTasksQuery, type Person } from "./people";

/**
 * A Person's view: every open Task that mentions them, grouped by Project, with a collapsed Closed
 * group. Quick add mentions them in new Tasks.
 */
export function PersonTasks({ person }: { person: Person }) {
  const { data: open = [] } = useQuery(personTasksQuery(person.id));
  return (
    <FlatTaskTable
      label={`Tasks mentioning ${person.name}`}
      header={
        <header className="mb-4 flex items-center gap-2.5 sm:gap-3">
          <PersonAvatar person={person} size="md" className="size-9 text-sm" />
          <h1 className="min-w-0 truncate text-2xl font-extrabold tracking-tight sm:text-3xl">
            {person.name}
          </h1>
          <Badge variant="secondary" className="shrink-0 tabular-nums">
            {open.length} open
          </Badge>
        </header>
      }
      quickAdd={{ kind: "person", person }}
      open={open}
      source={{ person: person.id }}
      empty={`No open tasks mention ${person.name}.`}
    />
  );
}
