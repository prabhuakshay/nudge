import { queryOptions, useQuery } from "@tanstack/react-query";

import { api } from "@/api/client";
import { failureReason } from "@/api/errors";
import type { components } from "@/api/schema";
import { taskKeys } from "@/features/tasks/task-cache";
import { sidebarQuery, type Task } from "@/features/tasks/tasks";
import { useCacheMutation } from "@/lib/cache-mutation";

import { fromEditable } from "./mentions";

export type Person = components["schemas"]["PersonOut"];
export type PersonFields = components["schemas"]["PersonIn"];

/** The user's People, A to Z, read from the sidebar so one query key holds them. */
export const peopleQuery = queryOptions({
  ...sidebarQuery,
  select: (sidebar): Person[] => sidebar.people,
});

/**
 * A function that turns the `@Name`s of the user's People in an edited text back into Mentions,
 * for saving a field that was edited as plain text.
 */
export function useWithMentions() {
  const { data: people = [] } = useQuery(peopleQuery);
  return (text: string) => fromEditable(text, people);
}

/**
 * The open Tasks that mention a Person. Keyed with the other open lists, so a change to a Task
 * shows here before the server answers too.
 */
export function personTasksQuery(personId: number) {
  return queryOptions({
    queryKey: taskKeys.open({ person: personId }),
    queryFn: async (): Promise<Task[]> => {
      const { data } = await api.GET("/api/v1/tasks", {
        params: { query: { person: personId } },
      });
      if (!data) throw new Error("Could not load the tasks.");
      return data.items;
    },
  });
}

/**
 * A change to People. Renames, deletes and merges rewrite the Mentions in Task texts, so every
 * one refreshes the Task lists as well as the People.
 */
function usePeopleMutation<V, R>(change: (variables: V) => Promise<R>) {
  return useCacheMutation({ mutationFn: change, refetch: [peopleQuery.queryKey, taskKeys.all] });
}

/** Add a Person; a new one without a colour gets a random one from the server. */
export function useCreatePerson() {
  return usePeopleMutation(async (fields: PersonFields) => {
    const { data, error } = await api.POST("/api/v1/people", { body: fields });
    if (error) throw new Error(failureReason(error, "Could not add the person."));
    return data;
  });
}

/** Rename or recolour a Person. A rename shows in every Mention of them. */
export function useUpdatePerson() {
  return usePeopleMutation(async ({ id, ...fields }: { id: number } & Partial<PersonFields>) => {
    const { data, error } = await api.PATCH("/api/v1/people/{person_id}", {
      params: { path: { person_id: id } },
      body: fields,
    });
    if (error) throw new Error(failureReason(error, "Could not save the person."));
    return data;
  });
}

/** Delete a Person for good; their Mentions become plain `@Name` text. */
export function useDeletePerson() {
  return usePeopleMutation(async (id: number) => {
    const { response } = await api.DELETE("/api/v1/people/{person_id}", {
      params: { path: { person_id: id } },
    });
    if (!response.ok) throw new Error("Could not delete the person.");
  });
}

/** Fold a Person into another: their Mentions move over and they are deleted. */
export function useMergePerson() {
  return usePeopleMutation(async ({ id, intoId }: { id: number; intoId: number }) => {
    const { data, error } = await api.POST("/api/v1/people/{person_id}/merge", {
      params: { path: { person_id: id } },
      body: { into_id: intoId },
    });
    if (error) throw new Error(failureReason(error, "Could not merge the people."));
    return data;
  });
}
