import { createFileRoute } from "@tanstack/react-router";

import { ShareReportPage } from "@/features/share-links/share-report-page";

/** A Share link's public report. It sits outside `_app`, so viewers need no account. */
export const Route = createFileRoute("/share/$key")({
  component: ShareRoute,
});

function ShareRoute() {
  const { key } = Route.useParams();
  return <ShareReportPage shareKey={key} />;
}
