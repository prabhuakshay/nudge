import { createFileRoute } from "@tanstack/react-router";
import { CalendarDays } from "lucide-react";

import { EmptyState } from "@/components/layout/empty-state";
import { PageHeader } from "@/components/layout/page-header";

export const Route = createFileRoute("/_app/upcoming")({
  component: UpcomingPage,
});

function UpcomingPage() {
  return (
    <>
      <PageHeader title="Upcoming" description="What's due over the next seven days." />
      <EmptyState
        icon={CalendarDays}
        title="Nothing coming up"
        description="Tasks with a due date in the next week will show up here, grouped by day."
      />
    </>
  );
}
