import { useCreatePerson } from "@/features/people/people";

import { quickAddTitle, type QuickAdd } from "./quick-add";

/**
 * A function that creates the People a Quick add line names for the first time, then returns the
 * line's title with every Mention as a token. A Mention needs its Person's id, so they are created
 * just before the Task.
 */
export function useQuickAddTitle() {
  const { mutateAsync: createPerson } = useCreatePerson();
  return async (text: string, parsed: QuickAdd) => {
    const created = await Promise.all(parsed.newPeople.map((name) => createPerson({ name })));
    return quickAddTitle(text, parsed.matches, created);
  };
}
