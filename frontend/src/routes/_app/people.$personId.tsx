import { useSuspenseQuery } from "@tanstack/react-query";
import { createFileRoute } from "@tanstack/react-router";
import { UserX } from "lucide-react";

import { EmptyState } from "@/components/layout/empty-state";
import { peopleQuery } from "@/features/people/people";
import { PersonTasks } from "@/features/people/person-tasks";

export const Route = createFileRoute("/_app/people/$personId")({
  loader: ({ context }) => context.queryClient.query(peopleQuery),
  component: PersonPage,
});

function PersonPage() {
  const { personId } = Route.useParams();
  const { data: people } = useSuspenseQuery(peopleQuery);
  const person = people.find((candidate) => String(candidate.id) === personId);
  if (!person) {
    return (
      <EmptyState
        icon={UserX}
        title="Person not found"
        description="They may have been deleted or merged, or the link is wrong."
      />
    );
  }
  // Keyed so switching People starts with a closed drawer and a collapsed Closed group.
  return <PersonTasks key={person.id} person={person} />;
}
