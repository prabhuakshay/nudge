/* Mutations that show their change in the query cache at once and put it back if they fail. */

import {
  useMutation,
  useQueryClient,
  type DataTag,
  type QueryClient,
  type QueryKey,
} from "@tanstack/react-query";
import { toast } from "sonner";

/** What a mutation shows in the cache before the server answers. */
export type Optimistic<V> = {
  /** The key prefix of every query the change edits, which a failed request puts back. */
  touches: QueryKey;
  /** Edit the cached queries to show the change. */
  show: (queryClient: QueryClient, variables: V) => void;
};

/** A request that changes server data, and what it does to the cache. */
export type CacheMutation<V, R> = {
  mutationFn: (variables: V) => Promise<R>;
  optimistic?: Optimistic<V>;
  onSuccess?: (result: R, variables: V, queryClient: QueryClient) => void;
  /** The key prefixes to refetch once the request settles, whether it succeeded or not. */
  refetch: readonly QueryKey[];
};

/**
 * A mutation that shows its change at once, puts the cache back and toasts the reason if the
 * request fails, and refetches what it touched once the request settles.
 */
export function useCacheMutation<V, R>({
  mutationFn,
  optimistic,
  onSuccess,
  refetch,
}: CacheMutation<V, R>) {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn,
    onMutate: async (variables) => {
      if (!optimistic) return [];
      // A fetch that lands after the edit would overwrite it with the data from before.
      await queryClient.cancelQueries({ queryKey: optimistic.touches });
      const before = queryClient.getQueriesData({ queryKey: optimistic.touches });
      optimistic.show(queryClient, variables);
      return before;
    },
    onSuccess: (result, variables) => onSuccess?.(result, variables, queryClient),
    onError: (error, _variables, before) => {
      for (const [queryKey, data] of before ?? []) queryClient.setQueryData(queryKey, data);
      toast.error(error.message);
    },
    onSettled: () =>
      Promise.all(refetch.map((queryKey) => queryClient.invalidateQueries({ queryKey }))),
  });
}

/** An optimistic change to one query's data, applied only once the query has data. */
export function editing<D, V>(
  queryKey: DataTag<QueryKey, D, Error>,
  change: (data: D, variables: V) => D,
): Optimistic<V> {
  return {
    touches: queryKey,
    show: (queryClient, variables) => {
      queryClient.setQueryData(queryKey, (data) => data && change(data, variables));
    },
  };
}
