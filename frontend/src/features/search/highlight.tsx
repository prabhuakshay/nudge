import { escapeRegExp } from "@/lib/utils";

/** Text with every occurrence of the query's words marked, ignoring case. */
export function Highlight({ text, query }: { text: string; query: string }) {
  const words = query.split(/\s+/).filter(Boolean).map(escapeRegExp);
  if (words.length === 0) return text;
  // A capturing group keeps the matches in the split, at the odd indexes.
  const parts = text.split(new RegExp(`(${words.join("|")})`, "gi"));
  return parts.map((part, index) =>
    index % 2 === 1 ? (
      // The same word can match twice, so only its place tells the marks apart.
      <mark key={index} className="rounded-sm bg-warning-soft px-px text-foreground">
        {part}
      </mark>
    ) : (
      part
    ),
  );
}
