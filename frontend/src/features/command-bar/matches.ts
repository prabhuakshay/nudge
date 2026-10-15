/** Whether a name holds every word of the query, ignoring case: "to in" matches "Go to Inbox". */
export function matches(name: string, query: string): boolean {
  const lower = name.toLowerCase();
  return query
    .toLowerCase()
    .split(/\s+/)
    .every((word) => lower.includes(word));
}

/** Run a command once the command bar has closed and handed focus back. */
export type Run = (command: () => void) => void;
