import { useSuspenseQuery } from "@tanstack/react-query";
import { createFileRoute } from "@tanstack/react-router";
import { Hash } from "lucide-react";

import { EmptyState } from "@/components/layout/empty-state";
import { TaskList } from "@/features/tasks/task-list";
import { sidebarQuery } from "@/features/tasks/tasks";

export const Route = createFileRoute("/_app/tags/$tagId")({
  loader: ({ context }) => context.queryClient.query(sidebarQuery),
  component: TagPage,
});

function TagPage() {
  const { tagId } = Route.useParams();
  const { data } = useSuspenseQuery(sidebarQuery);
  const tag = data.tags.find((candidate) => String(candidate.id) === tagId);
  if (!tag) {
    return (
      <EmptyState
        icon={Hash}
        title="Tag not found"
        description="It may have been deleted or merged, or the link is wrong."
      />
    );
  }
  // Keyed so switching Tags starts with a closed drawer and a collapsed Closed group.
  return <TaskList key={tag.id} tag={tag} />;
}
