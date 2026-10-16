import { useQuery, useSuspenseQuery } from "@tanstack/react-query";
import { createFileRoute } from "@tanstack/react-router";

import { sessionQuery } from "@/features/auth/session";
import { validateCalendarSearch } from "@/features/calendar/calendar";
import { CalendarView } from "@/features/calendar/calendar-view";
import { sidebarQuery } from "@/features/tasks/tasks";

export const Route = createFileRoute("/_app/calendar")({
  validateSearch: validateCalendarSearch,
  loader: ({ context }) => context.queryClient.query(sidebarQuery),
  component: CalendarPage,
});

function CalendarPage() {
  const { user: signedIn } = Route.useRouteContext();
  const { data: session } = useQuery(sessionQuery);
  // The cached session follows a time zone changed in Settings; the route context doesn't.
  const user = session ?? signedIn;
  const { data: sidebar } = useSuspenseQuery(sidebarQuery);
  return <CalendarView inbox={sidebar.inbox} timeZone={user.time_zone} />;
}
