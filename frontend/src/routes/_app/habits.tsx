import { createFileRoute } from "@tanstack/react-router";

import { HabitsPage } from "@/features/habits/habits-page";
import { habitsQuery } from "@/features/habits/habits";

export const Route = createFileRoute("/_app/habits")({
  loader: ({ context }) => context.queryClient.query(habitsQuery),
  component: HabitsPage,
});
