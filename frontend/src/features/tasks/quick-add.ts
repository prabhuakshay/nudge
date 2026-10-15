/**
 * Quick add's parser: it reads `#tag`, `~project`, `!1`–`!4` (or `!p1`–`!p4`), `@person`, dates and
 * Repeat phrases out of one line of text. It is pure, so the card can parse on every keystroke and
 * highlight each match.
 */

import type { Person } from "@/features/people/people";
import type { Tag } from "@/features/tags/tags";

import {
  readSchedule,
  type DateMatch,
  type QuickAddDates,
  type RepeatMatch,
} from "./quick-add-dates";
import type { SidebarProject, TaskPriority } from "./tasks";

/** The kinds of token Quick add understands. */
export type QuickAddKind = QuickAddMatch["kind"];

/** A name chosen in Quick add's picker. Kept by its exact text, so names with spaces match. */
export type PickedName = { kind: "tag" | "project" | "person"; id: number; text: string };

export type QuickAddTag = Pick<Tag, "id" | "name" | "color">;

/** What Quick add knows besides the text: the user's items, and what was picked or turned back. */
export type QuickAddContext = {
  /** Now on the user's clock, which dates count forwards from. */
  now: Date;
  projects: readonly SidebarProject[];
  tags: readonly QuickAddTag[];
  people: readonly Person[];
  /** False where a Task can't choose its Project, as in Add subtask, so `~` stays text. */
  allowProject?: boolean;
  /** False where a Task can't repeat, as in Add subtask, so Repeat phrases stay text. */
  allowRepeat?: boolean;
  picked?: readonly PickedName[];
  /** Matches turned back into text, by `matchKey`. */
  kept?: ReadonlySet<string>;
};

/** A token Quick add understood, where it sits in the text, and what it stands for. */
export type QuickAddMatch =
  | DateMatch
  | RepeatMatch
  | ({ start: number; end: number; text: string } & (
      | { kind: "priority"; priority: Exclude<TaskPriority, 0> }
      | { kind: "tag"; name: string; tag: QuickAddTag | null }
      | { kind: "person"; name: string; person: Person | null }
      | { kind: "project"; project: SidebarProject }
    ));

/** What a line of Quick add makes: a title and the fields of the new Task. */
export type QuickAdd = {
  /** The text without its tokens; Mentions of known People stay in it as Mention tokens. */
  title: string;
  matches: QuickAddMatch[];
  priority: TaskPriority;
  projectId: number | null;
  tagIds: number[];
  /** Tags to create with the Task, by name. */
  newTags: string[];
  /** People to create before the Task, so that their Mentions have ids. */
  newPeople: string[];
  /** The first date typed, or the first day of the Repeat. */
  dates: QuickAddDates | null;
  repeatRule: string | null;
};

/** How a match is remembered once it is turned back into text. */
export function matchKey(match: Pick<QuickAddMatch, "kind" | "text">): string {
  return `${match.kind}:${match.text}`;
}

const same = (a: string, b: string) => a.toLowerCase() === b.toLowerCase();

/** A sigil, then everything up to the next space; only at the start or after a space. */
const TOKEN = /(?<=^|\s)([#~@!])(\S+)/g;
const PRIORITY = /^p?([1-4])$/i;

/** Omit keys from each member of a union, keeping it a union that narrows by `kind`. */
type DistributiveOmit<T, K extends PropertyKey> = T extends unknown ? Omit<T, K> : never;

type Meaning = DistributiveOmit<
  Exclude<QuickAddMatch, DateMatch | RepeatMatch>,
  "start" | "end" | "text"
>;

/** How to read what follows each sigil; null when it means nothing, as an unknown `~project`. */
const READERS: Record<string, (rest: string, context: QuickAddContext) => Meaning | null> = {
  "!": (rest) => {
    const digit = PRIORITY.exec(rest)?.[1];
    // PRIORITY only matches the digits 1 to 4.
    return digit ? { kind: "priority", priority: Number(digit) as 1 | 2 | 3 | 4 } : null;
  },
  "#": (rest, { tags }) => {
    if (rest.includes("#")) return null;
    const tag = tags.find((candidate) => same(candidate.name, rest)) ?? null;
    return { kind: "tag", name: tag?.name ?? rest, tag };
  },
  "@": (rest, { people }) => {
    const person = people.find((candidate) => same(candidate.name, rest)) ?? null;
    return { kind: "person", name: person?.name ?? rest, person };
  },
  "~": (rest, { projects, allowProject }) => {
    const project = projects.find((candidate) => same(candidate.name, rest));
    return project && allowProject !== false ? { kind: "project", project } : null;
  },
};

/** Where a picked name sits in the text as a whole token, and what it stands for. */
function* pickedMatches(text: string, context: QuickAddContext): Generator<QuickAddMatch> {
  for (const pick of context.picked ?? []) {
    let start = text.indexOf(pick.text);
    for (; start >= 0; start = text.indexOf(pick.text, start + 1)) {
      const end = start + pick.text.length;
      const whole = /^\s?$/.test(text.charAt(start - 1)) && /^\s?$/.test(text.charAt(end));
      const found = whole ? pickedItem(pick, context) : null;
      if (found) yield { start, end, text: pick.text, ...found };
    }
  }
}

function pickedItem(pick: PickedName, context: QuickAddContext) {
  const byId = <T extends { id: number }>(items: readonly T[]) =>
    items.find((item) => item.id === pick.id);
  if (pick.kind === "tag") {
    const tag = byId(context.tags);
    return tag && { kind: "tag" as const, name: tag.name, tag };
  }
  if (pick.kind === "person") {
    const person = byId(context.people);
    return person && { kind: "person" as const, name: person.name, person };
  }
  const project = context.allowProject === false ? undefined : byId(context.projects);
  return project && { kind: "project" as const, project };
}

function* typedMatches(text: string, context: QuickAddContext): Generator<QuickAddMatch> {
  for (const token of text.matchAll(TOKEN)) {
    const found = READERS[token[1] ?? ""]?.(token[2] ?? "", context);
    if (found) {
      yield { start: token.index, end: token.index + token[0].length, text: token[0], ...found };
    }
  }
}

/** The text with tokens taken out and Mentions written as tokens, People created since included. */
export function quickAddTitle(
  text: string,
  matches: readonly QuickAddMatch[],
  createdPeople: readonly Person[] = [],
): string {
  let title = "";
  let last = 0;
  for (const match of matches) {
    title += text.slice(last, match.start);
    if (match.kind === "person") {
      const person =
        match.person ?? createdPeople.find((candidate) => same(candidate.name, match.name));
      title += person ? `[@${person.name}](person:${String(person.id)})` : match.text;
    }
    last = match.end;
  }
  return (title + text.slice(last)).replace(/\s+/g, " ").trim();
}

function unique<T>(items: T[], key: (item: T) => string | number = String): T[] {
  const seen = new Set<string | number>();
  return items.filter((item) => !seen.has(key(item)) && seen.add(key(item)));
}

type TokenFields = Omit<QuickAdd, "title" | "matches" | "dates" | "repeatRule">;

/** The fields the token matches give a new Task. */
function fieldsOf(matches: readonly QuickAddMatch[]): TokenFields {
  const fields: TokenFields = {
    priority: 0,
    projectId: null,
    tagIds: [],
    newTags: [],
    newPeople: [],
  };
  for (const match of matches) {
    if (match.kind === "priority") fields.priority = match.priority;
    else if (match.kind === "project") fields.projectId = match.project.id;
    else if (match.kind === "tag" && match.tag) fields.tagIds.push(match.tag.id);
    else if (match.kind === "tag") fields.newTags.push(match.name);
    else if (match.kind === "person" && !match.person) fields.newPeople.push(match.name);
  }
  return {
    ...fields,
    tagIds: unique(fields.tagIds),
    newTags: unique(fields.newTags, (name) => name.toLowerCase()),
    newPeople: unique(fields.newPeople, (name) => name.toLowerCase()),
  };
}

/** Whether a match can join the ones taken so far. */
function fits(match: QuickAddMatch, taken: readonly QuickAddMatch[], context: QuickAddContext) {
  const overlaps = taken.some((other) => match.start < other.end && match.end > other.start);
  const once = match.kind === "priority" || match.kind === "project";
  const repeated = once && taken.some((other) => other.kind === match.kind);
  return !overlaps && !repeated && !context.kept?.has(matchKey(match));
}

/**
 * Read a line of Quick add. Picked names match first, then typed tokens, each ending at the first
 * space, then the first Repeat phrase and the first date in what's left. A token overlapping an
 * earlier match, a second Priority or Project, and anything turned back into text stay plain text.
 */
export function parseQuickAdd(text: string, context: QuickAddContext): QuickAdd {
  const matches: QuickAddMatch[] = [];
  for (const match of [...pickedMatches(text, context), ...typedMatches(text, context)]) {
    if (fits(match, matches, context)) matches.push(match);
  }
  const schedule = readSchedule(text, matches, {
    now: context.now,
    allowRepeat: context.allowRepeat,
    isKept: (match) => context.kept?.has(matchKey(match)) ?? false,
  });
  matches.push(...schedule.matches);
  matches.sort((a, b) => a.start - b.start);
  return {
    title: quickAddTitle(text, matches),
    matches,
    ...fieldsOf(matches),
    dates: schedule.dates,
    repeatRule: schedule.repeatRule,
  };
}
