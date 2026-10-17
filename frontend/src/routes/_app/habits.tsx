import { useQuery } from "@tanstack/react-query";
import { createFileRoute } from "@tanstack/react-router";

import { sessionQuery } from "@/features/auth/session";
import { HabitsPage } from "@/features/habits/habits-page";
import { habitsQuery } from "@/features/habits/habits";
import { validateHabitSearch } from "@/features/habits/open-habit";

export const Route = createFileRoute("/_app/habits")({
  validateSearch: validateHabitSearch,
  loader: ({ context }) => context.queryClient.query(habitsQuery),
  component: HabitsRoute,
});

function HabitsRoute() {
  const { user: signedIn } = Route.useRouteContext();
  const { data: session } = useQuery(sessionQuery);
  // The cached session follows a time zone changed in Settings; the route context doesn't.
  const user = session ?? signedIn;
  return <HabitsPage timeZone={user.time_zone} />;
}
