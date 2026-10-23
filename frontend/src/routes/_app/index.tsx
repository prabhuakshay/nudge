import { useQuery, useSuspenseQuery } from "@tanstack/react-query";
import { createFileRoute } from "@tanstack/react-router";

import { sessionQuery } from "@/features/auth/session";
import { TodayHabits } from "@/features/habits/today-strip";
import { validateTaskSearch } from "@/features/tasks/open-task";
import { ScheduleList } from "@/features/tasks/schedule-list";
import { sidebarQuery } from "@/features/tasks/tasks";
import { greetingFor } from "@/features/today/greeting";

export const Route = createFileRoute("/_app/")({
  validateSearch: validateTaskSearch,
  loader: ({ context }) => context.queryClient.query(sidebarQuery),
  component: TodayPage,
});

function TodayPage() {
  const { user: signedIn } = Route.useRouteContext();
  const { data: session } = useQuery(sessionQuery);
  // The cached session follows a time zone changed in Settings; the route context doesn't.
  const user = session ?? signedIn;
  const { data: sidebar } = useSuspenseQuery(sidebarQuery);
  const greeting = greetingFor(new Date());
  const firstName = user.full_name.trim().split(/\s+/)[0];

  return (
    <ScheduleList
      view="today"
      inbox={sidebar.inbox}
      timeZone={user.time_zone}
      description={firstName ? `${greeting}, ${firstName}.` : `${greeting}.`}
      strip={<TodayHabits timeZone={user.time_zone} />}
    />
  );
}
