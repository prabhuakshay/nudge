import { createFileRoute } from "@tanstack/react-router";
import { CalendarCheck } from "lucide-react";

import { EmptyState } from "@/components/layout/empty-state";
import { PageHeader } from "@/components/layout/page-header";
import { greetingFor } from "@/features/today/greeting";

export const Route = createFileRoute("/_app/")({
  component: TodayPage,
});

function TodayPage() {
  const { user } = Route.useRouteContext();
  const now = new Date();
  const firstName = user.full_name.trim().split(/\s+/)[0];

  return (
    <>
      <PageHeader
        title="Today"
        description={firstName ? `${greetingFor(now)}, ${firstName}.` : `${greetingFor(now)}.`}
      />
      <EmptyState
        icon={CalendarCheck}
        title="Nothing due today"
        description="Tasks due today and anything overdue will show up here."
      />
    </>
  );
}
