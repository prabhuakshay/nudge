import { useQuery, useSuspenseQuery } from "@tanstack/react-query";
import { createFileRoute } from "@tanstack/react-router";

import { sessionQuery } from "@/features/auth/session";
import { validateTaskSearch } from "@/features/tasks/open-task";
import { ScheduleList } from "@/features/tasks/schedule-list";
import { sidebarQuery } from "@/features/tasks/tasks";

export const Route = createFileRoute("/_app/upcoming")({
  validateSearch: validateTaskSearch,
  loader: ({ context }) => context.queryClient.query(sidebarQuery),
  component: UpcomingPage,
});

function UpcomingPage() {
  const { user: signedIn } = Route.useRouteContext();
  const { data: session } = useQuery(sessionQuery);
  // The cached session follows a time zone changed in Settings; the route context doesn't.
  const user = session ?? signedIn;
  const { data: sidebar } = useSuspenseQuery(sidebarQuery);
  return <ScheduleList view="upcoming" inbox={sidebar.inbox} timeZone={user.time_zone} />;
}
