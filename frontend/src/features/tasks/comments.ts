import { queryOptions } from "@tanstack/react-query";

import { api } from "@/api/client";
import { failureReason } from "@/api/errors";
import type { components } from "@/api/schema";
import { editing, useCacheMutation } from "@/lib/cache-mutation";

import { taskKeys } from "./task-cache";

export type Comment = components["schemas"]["CommentOut"];

/**
 * A Task's Comments, oldest first. Keyed under the Task lists, so a change to a Comment refreshes
 * the rows' Comment counts and the Person views its Mentions feed in the same invalidation.
 */
export function commentsQuery(taskId: number) {
  return queryOptions({
    queryKey: taskKeys.comments(taskId),
    queryFn: async (): Promise<Comment[]> => {
      const { data } = await api.GET("/api/v1/tasks/{task_id}/comments", {
        params: { path: { task_id: taskId } },
      });
      if (!data) {
        throw new Error("Could not load the comments.");
      }
      return data;
    },
  });
}

/** Whether the Comment was changed after it was posted. */
export function isEdited(comment: Comment) {
  return comment.updated_at !== comment.created_at;
}

/** Add a Comment to a Task. */
export function useAddComment(taskId: number) {
  return useCacheMutation({
    mutationFn: async (body: string) => {
      const { data, error } = await api.POST("/api/v1/tasks/{task_id}/comments", {
        params: { path: { task_id: taskId } },
        body: { body },
      });
      if (error) {
        // The server explains a refusal, such as a Mention of a Person that is gone.
        throw new Error(failureReason(error, "Could not add the comment."));
      }
      return data;
    },
    refetch: [taskKeys.all],
  });
}

/** Replace a Comment's body. */
export function useEditComment() {
  return useCacheMutation({
    mutationFn: async ({ id, body }: { id: number; body: string }) => {
      const { data, error } = await api.PATCH("/api/v1/comments/{comment_id}", {
        params: { path: { comment_id: id } },
        body: { body },
      });
      if (error) {
        throw new Error(failureReason(error, "Could not save the comment."));
      }
      return data;
    },
    refetch: [taskKeys.all],
  });
}

/** Delete a Comment for good. It leaves the drawer before the server answers. */
export function useDeleteComment(taskId: number) {
  return useCacheMutation({
    mutationFn: async (commentId: number) => {
      const { response } = await api.DELETE("/api/v1/comments/{comment_id}", {
        params: { path: { comment_id: commentId } },
      });
      if (!response.ok) {
        throw new Error("Could not delete the comment.");
      }
    },
    optimistic: editing(commentsQuery(taskId).queryKey, (items, commentId: number) =>
      items.filter((item) => item.id !== commentId),
    ),
    refetch: [taskKeys.all],
  });
}
