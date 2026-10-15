import { useInfiniteQuery, useQuery } from "@tanstack/react-query";
import type { ReactNode } from "react";

import { TabsList, TabsTrigger } from "@/components/ui/tabs";
import { cn } from "@/lib/utils";

import { commentsQuery } from "./comments";
import { taskActivityQuery } from "./tasks";

/** The drawer's tabs: Details, counting the Task's Comments, and Activity, counting its events. */
export function DetailTabsList({ taskId, tab }: { taskId: number; tab: string }) {
  const { data: comments = [] } = useQuery(commentsQuery(taskId));
  const { data: activity } = useInfiniteQuery(taskActivityQuery(taskId));
  const activityCount = activity?.pages[0]?.count;
  return (
    <TabsList variant="underline" className="w-full justify-start gap-6">
      <TabsTrigger value="details">
        Details{" "}
        {comments.length > 0 && (
          <CountPill active={tab === "details"}>
            {comments.length} <span className="sr-only">comments</span>
          </CountPill>
        )}
      </TabsTrigger>
      <TabsTrigger value="activity">
        Activity{" "}
        {activityCount !== undefined && (
          <CountPill active={tab === "activity"}>{activityCount}</CountPill>
        )}
      </TabsTrigger>
    </TabsList>
  );
}

/** A tab's count, highlighted while its tab is open. */
function CountPill({ active, children }: { active: boolean; children: ReactNode }) {
  return (
    <span
      className={cn(
        "rounded-full px-1.5 py-px text-[10px] font-bold tabular-nums",
        active ? "bg-primary-soft text-primary" : "bg-surface-muted text-muted-foreground",
      )}
    >
      {children}
    </span>
  );
}
