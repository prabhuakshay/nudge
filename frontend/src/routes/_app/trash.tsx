import { createFileRoute } from "@tanstack/react-router";

import { TrashList } from "@/features/trash/trash-list";
import { trashQuery } from "@/features/trash/trash";

export const Route = createFileRoute("/_app/trash")({
  loader: ({ context }) => context.queryClient.query(trashQuery),
  component: TrashList,
});
