import { createFileRoute } from "@tanstack/react-router";
import { Inbox } from "lucide-react";

import { EmptyState } from "@/components/layout/empty-state";
import { PageHeader } from "@/components/layout/page-header";

export const Route = createFileRoute("/_app/inbox")({
  component: InboxPage,
});

function InboxPage() {
  return (
    <>
      <PageHeader title="Inbox" description="Everything you haven't sorted into a list yet." />
      <EmptyState
        icon={Inbox}
        title="Your inbox is empty"
        description="New tasks land here until you give them a list."
      />
    </>
  );
}
