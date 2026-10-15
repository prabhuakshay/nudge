/**
 * Mention tokens. A Mention is stored in a Task's text as `[@Name](person:<id>)`; the user reads
 * it as a chip and edits it as plain `@Name`.
 */

const MENTION = /\[@([^\]]*)\]\(person:(\d+)\)/g;

/** A Mention as it sits in a text: the Person's id and the name it was written with. */
export type Mention = { id: number; name: string };

/** A Mention found in a text, with where its token starts. */
export type MentionPart = Mention & { start: number };

/** Split a text into its plain parts and its Mentions, in order. Empty parts are left out. */
export function splitMentions(text: string): (string | MentionPart)[] {
  const parts: (string | MentionPart)[] = [];
  let last = 0;
  for (const match of text.matchAll(MENTION)) {
    if (match.index > last) parts.push(text.slice(last, match.index));
    parts.push({ id: Number(match[2]), name: match[1] ?? "", start: match.index });
    last = match.index + match[0].length;
  }
  if (last < text.length) parts.push(text.slice(last));
  return parts;
}

/** The text with each Mention written as `@Name`, for editing and for plain-text places. */
export function plainMentions(text: string): string {
  return text.replace(MENTION, "@$1");
}

function escapeRegExp(text: string) {
  return text.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

/**
 * The text with every `@Name` of a known Person turned back into a Mention. The longest names
 * match first, so "@Priya Shah" is never read as "@Priya" followed by " Shah".
 */
export function fromEditable(text: string, people: readonly Mention[]): string {
  if (people.length === 0) return text;
  const byName = new Map(people.map((person) => [person.name.toLowerCase(), person]));
  const names = [...byName.keys()].sort((a, b) => b.length - a.length).map(escapeRegExp);
  // An @ inside a word, as in an email address, is not a Mention; nor is a name cut short.
  const pattern = new RegExp(`(?<![\\p{L}\\p{N}])@(${names.join("|")})(?![\\p{L}\\p{N}])`, "giu");
  return text.replace(pattern, (whole, name: string) => {
    const person = byName.get(name.toLowerCase());
    return person ? `[@${person.name}](person:${String(person.id)})` : whole;
  });
}
