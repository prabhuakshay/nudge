import { useSuspenseQuery } from "@tanstack/react-query";
import { createFileRoute } from "@tanstack/react-router";

import { validateTaskSearch } from "@/features/tasks/open-task";
import { TaskList } from "@/features/tasks/task-list";
import { sidebarQuery } from "@/features/tasks/tasks";

export const Route = createFileRoute("/_app/inbox")({
  validateSearch: validateTaskSearch,
  loader: ({ context }) => context.queryClient.query(sidebarQuery),
  component: InboxPage,
});

function InboxPage() {
  const { data } = useSuspenseQuery(sidebarQuery);
  return <TaskList project={data.inbox} />;
}
