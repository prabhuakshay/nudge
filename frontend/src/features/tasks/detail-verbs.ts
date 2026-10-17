/**
 * How a verb that needs the drawer, such as Set date, reaches the picker or field that does it.
 * Whoever runs the verb asks for it with `requestDetailVerb`; the drawer hands the request to the
 * part that registered for it with `useDetailVerb`, as soon as that part shows.
 */
import { createContext, useContext, useEffect, useLayoutEffect, useRef, useState } from "react";

import type { DetailVerbId } from "./task-verbs";

let pending: { taskId: number; verb: DetailVerbId } | null = null;
const listeners = new Set<() => void>();

/**
 * Ask the drawer to do `verb` when it next shows this Task, as a row's D does, or straight away
 * if it shows the Task already, as when the command bar asks.
 */
export function requestDetailVerb(taskId: number, verb: DetailVerbId) {
  pending = { taskId, verb };
  for (const listener of listeners) listener();
}

function requestedVerb(taskId: number): DetailVerbId | null {
  return pending?.taskId === taskId ? pending.verb : null;
}

type DetailVerbs = {
  /** Have `handler` do `verb`, until the returned function is called. */
  register: (verb: DetailVerbId, handler: () => void) => () => void;
};

/** The drawer's verbs, which its pickers and fields register with. */
export const DetailVerbsContext = createContext<DetailVerbs | null>(null);

/**
 * Do the drawer's requested verbs for one Task, for `DetailVerbsContext`. A verb whose part
 * doesn't show yet waits for it, as the Blocked reason only shows once B makes the Task Blocked.
 */
export function useDetailVerbs(taskId: number): DetailVerbs {
  const [verbs] = useState(() => {
    const handlers = new Map<DetailVerbId, () => void>();
    let waiting = requestedVerb(taskId);
    return {
      run: (verb: DetailVerbId) => {
        const handler = handlers.get(verb);
        waiting = handler ? null : verb;
        handler?.();
      },
      register: (verb: DetailVerbId, handler: () => void) => {
        handlers.set(verb, handler);
        if (waiting === verb) {
          waiting = null;
          handler();
        }
        return () => {
          handlers.delete(verb);
        };
      },
    };
  });

  // Children register before this runs, so a request made before the drawer opened is done first.
  useEffect(() => {
    pending = null;
  }, []);
  useEffect(() => {
    const listener = () => {
      const verb = requestedVerb(taskId);
      if (!verb) return;
      pending = null;
      verbs.run(verb);
    };
    listeners.add(listener);
    return () => {
      listeners.delete(listener);
    };
  }, [taskId, verbs]);

  return verbs;
}

/** Do `verb` with `handler` when the drawer is asked to. Does nothing outside the drawer. */
export function useDetailVerb(verb: DetailVerbId, handler: () => void) {
  const verbs = useContext(DetailVerbsContext);
  const latest = useRef(handler);
  useLayoutEffect(() => {
    latest.current = handler;
  });
  useEffect(
    () =>
      verbs?.register(verb, () => {
        latest.current();
      }),
    [verbs, verb],
  );
}

/** A picker's open state that the drawer opens for `verb`, for its `open` and `onOpenChange`. */
export function useDetailPicker(verb: DetailVerbId) {
  const [open, setOpen] = useState(false);
  useDetailVerb(verb, () => {
    setOpen(true);
  });
  return { open, onOpenChange: setOpen };
}
