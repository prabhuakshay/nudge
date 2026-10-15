/**
 * The Tags, Projects and People this browser used last in Quick add, so its picker can list them
 * first. Kept in localStorage: it's a convenience, so a browser that can't store it lists items in
 * their usual order instead.
 */

const KEY = "nudge.quick-add.recent";
const LIMIT = 30;

/** How an item is remembered: its kind and id, such as `tag:21`. */
export type RecentKey = `${"tag" | "project" | "person"}:${string}`;

function load(): RecentKey[] {
  try {
    const stored: unknown = JSON.parse(localStorage.getItem(KEY) ?? "[]");
    return Array.isArray(stored)
      ? stored.filter((key): key is RecentKey => typeof key === "string")
      : [];
  } catch {
    return [];
  }
}

/** Remember items as the most recently used, newest first. */
export function rememberPicks(keys: readonly RecentKey[]): void {
  if (keys.length === 0) return;
  const recent = [...new Set([...keys, ...load()])].slice(0, LIMIT);
  try {
    localStorage.setItem(KEY, JSON.stringify(recent));
  } catch {
    // Storage is full or blocked; the picker just keeps its usual order.
  }
}

/** The items with the most recently used first; the rest keep their order. */
export function byRecent<T>(items: readonly T[], keyOf: (item: T) => RecentKey): T[] {
  const recent = load();
  const rank = (item: T) => {
    const at = recent.indexOf(keyOf(item));
    return at < 0 ? recent.length : at;
  };
  return items
    .map((item, index) => ({ item, index, rank: rank(item) }))
    .sort((a, b) => a.rank - b.rank || a.index - b.index)
    .map(({ item }) => item);
}
