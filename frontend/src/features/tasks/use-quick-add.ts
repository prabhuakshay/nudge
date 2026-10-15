import { useQuery } from "@tanstack/react-query";
import {
  useLayoutEffect,
  useMemo,
  useRef,
  useState,
  type KeyboardEvent,
  type RefObject,
  type SyntheticEvent,
} from "react";

import { sessionQuery } from "@/features/auth/session";
import { peopleQuery, type Person } from "@/features/people/people";
import { allProjects } from "@/features/projects/projects";

import {
  matchKey,
  parseQuickAdd,
  type PickedName,
  type QuickAdd,
  type QuickAddContext,
  type QuickAddMatch,
  type QuickAddTag,
} from "./quick-add";
import { byRecent, rememberPicks, type RecentKey } from "./recent-picks";
import { wallClock } from "./schedule";
import { sidebarQuery, type SidebarProject } from "./tasks";

/** How many of the user's items the picker lists at once. */
const PICKER_SIZE = 6;

type Sigil = "#" | "@" | "~";

/** A row in Quick add's picker: one of the user's items, or a new Tag or Person to create. */
export type PickerOption =
  | { kind: "tag"; item: QuickAddTag }
  | { kind: "person"; item: Person }
  | { kind: "project"; item: SidebarProject }
  | { kind: "new"; sigil: "#" | "@"; name: string };

/** The `#x`, `@x` or `~x` being typed at the caret, if any. */
function tokenAt(text: string, caret: number) {
  const found = /(?:^|\s)([#@~])([^\s#@~]*)$/.exec(text.slice(0, caret));
  if (!found) return null;
  const query = found[2] ?? "";
  return { sigil: found[1] as Sigil, query, start: caret - query.length - 1 };
}

function recentKey(option: Exclude<PickerOption, { kind: "new" }>): RecentKey {
  return `${option.kind}:${String(option.item.id)}`;
}

/** The items of the user's that a match stands for, as the picker remembers them. */
function usedIn(matches: readonly QuickAddMatch[]): RecentKey[] {
  return matches.flatMap((match): RecentKey[] => {
    if (match.kind === "tag" && match.tag) return [`tag:${String(match.tag.id)}`];
    if (match.kind === "person" && match.person) return [`person:${String(match.person.id)}`];
    if (match.kind === "project") return [`project:${String(match.project.id)}`];
    return [];
  });
}

function optionsFor(
  sigil: Sigil,
  query: string,
  context: Pick<QuickAddContext, "tags" | "people" | "projects">,
): PickerOption[] {
  const all: Exclude<PickerOption, { kind: "new" }>[] =
    sigil === "#"
      ? context.tags.map((item) => ({ kind: "tag", item }))
      : sigil === "@"
        ? context.people.map((item) => ({ kind: "person", item }))
        : context.projects.map((item) => ({ kind: "project", item }));
  const wanted = query.toLowerCase();
  const found = byRecent(
    all.filter(({ item }) => item.name.toLowerCase().includes(wanted)),
    recentKey,
  ).slice(0, PICKER_SIZE);
  const exact = all.some(({ item }) => item.name.toLowerCase() === wanted);
  // Projects are never created from Quick add, so an unknown `~x` offers nothing.
  if (!query || exact || sigil === "~") return found;
  return [...found, { kind: "new", sigil, name: query }];
}

/** The user's Projects (none where `~` is off), Tags and People, for reading and picking. */
function useUserItems(allowProject: boolean) {
  const { data: sidebar } = useQuery(sidebarQuery);
  const { data: people = [] } = useQuery(peopleQuery);
  return useMemo(
    () => ({
      projects: sidebar
        ? allProjects(sidebar).filter((project) => allowProject && !project.is_archived)
        : [],
      tags: sidebar?.tags ?? [],
      people,
    }),
    [sidebar, people, allowProject],
  );
}

/** Now on the user's clock, or the browser's until their time zone is known. */
function useWallClock(): Date {
  const { data: user } = useQuery(sessionQuery);
  return user?.time_zone ? wallClock(user.time_zone) : new Date();
}

/**
 * The state of one Quick add input: its text, what the text means, and the `#`/`@`/`~` picker at
 * the caret. Backspace right after a match, or `keep`, turns the match back into plain text.
 * Enter picks the picker's active row when it's open, and otherwise calls `onSubmit` with what was
 * typed and what it means; the input then starts over. `inputRef` is the input's, for putting the
 * caret after a pick.
 */
export function useQuickAdd({
  inputRef,
  allowProject = true,
  allowRepeat = true,
  onSubmit,
}: {
  inputRef: RefObject<HTMLInputElement | null>;
  allowProject?: boolean;
  allowRepeat?: boolean;
  onSubmit: (text: string, parsed: QuickAdd) => void;
}) {
  const [value, setValueState] = useState("");
  const [caret, setCaret] = useState(0);
  const [picked, setPicked] = useState<PickedName[]>([]);
  const [kept, setKept] = useState<ReadonlySet<string>>(new Set());
  const [active, setActive] = useState(0);
  const [pickerClosed, setPickerClosed] = useState(false);
  // Where the caret goes after a pick, applied before paint so typing on lands in the right place.
  const pendingCaret = useRef<number | null>(null);
  useLayoutEffect(() => {
    if (pendingCaret.current === null) return;
    inputRef.current?.setSelectionRange(pendingCaret.current, pendingCaret.current);
    pendingCaret.current = null;
  });

  const items = useUserItems(allowProject);
  const now = useWallClock();
  const parsed = parseQuickAdd(value, { ...items, now, allowProject, allowRepeat, picked, kept });

  const token = pickerClosed ? null : tokenAt(value, caret);
  const options = token ? optionsFor(token.sigil, token.query, items) : [];
  const pickerOpen = token !== null && (token.sigil !== "~" || allowProject);

  const setValue = (text: string, nextCaret = text.length) => {
    setValueState(text);
    setCaret(nextCaret);
    setActive(0);
    setPickerClosed(false);
    if (!text) {
      setPicked([]);
      setKept(new Set());
    }
  };

  const choose = (option: PickerOption) => {
    if (!token) return;
    const name = option.kind === "new" ? option.name : option.item.name;
    const insert = `${token.sigil}${name}`;
    const after = value.slice(caret).replace(/^\s+/, "");
    const at = token.start + insert.length + 1;
    if (option.kind !== "new") {
      setPicked((previous) => [
        ...previous,
        { kind: option.kind, id: option.item.id, text: insert },
      ]);
      rememberPicks([recentKey(option)]);
    }
    pendingCaret.current = at;
    setValue(`${value.slice(0, token.start)}${insert} ${after}`, at);
  };

  const keep = (match: QuickAddMatch) => {
    setKept((previous) => new Set(previous).add(matchKey(match)));
    setPicked((previous) => previous.filter((pick) => pick.text !== match.text));
  };

  const submit = () => {
    if (!parsed.title) return;
    rememberPicks(usedIn(parsed.matches));
    onSubmit(value, parsed);
    setValue("");
  };

  const onPickerKey = (event: KeyboardEvent<HTMLInputElement>) => {
    if (event.key === "ArrowDown" || event.key === "ArrowUp") {
      const step = event.key === "ArrowDown" ? 1 : options.length - 1;
      setActive((index) => (index + step) % options.length);
    } else if (event.key === "Enter" || event.key === "Tab") {
      const option = options[active];
      if (option) choose(option);
    } else if (event.key === "Escape") {
      setPickerClosed(true);
    } else {
      return false;
    }
    event.preventDefault();
    event.stopPropagation();
    return true;
  };

  /** Backspace right after a match turns it back into text instead of deleting a character. */
  const keepBeforeCaret = (event: KeyboardEvent<HTMLInputElement>) => {
    const { selectionStart, selectionEnd } = event.currentTarget;
    if (event.key !== "Backspace" || selectionStart !== selectionEnd) return false;
    const match = parsed.matches.find((candidate) => candidate.end === selectionStart);
    if (!match) return false;
    event.preventDefault();
    keep(match);
    return true;
  };

  const onKeyDown = (event: KeyboardEvent<HTMLInputElement>) => {
    if (event.nativeEvent.isComposing) return;
    if (pickerOpen && options.length > 0 && onPickerKey(event)) return;
    if (keepBeforeCaret(event)) return;
    if (event.key === "Enter") {
      event.preventDefault();
      submit();
    } else if (event.key === "Escape" && value) {
      // Clear the text first; a second Escape reaches the page, which may close a drawer.
      event.stopPropagation();
      setValue("");
    }
  };

  const syncCaret = (event: SyntheticEvent<HTMLInputElement>) => {
    setCaret(event.currentTarget.selectionStart ?? value.length);
  };

  return {
    value,
    setValue,
    parsed,
    onKeyDown,
    syncCaret,
    keep,
    picker: { open: pickerOpen, sigil: token?.sigil, options, active, setActive, choose },
  };
}

/** One Quick add input's state, as `useQuickAdd` returns it. */
export type QuickAddState = ReturnType<typeof useQuickAdd>;
