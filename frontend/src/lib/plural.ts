/** "1 item" or "3 items". */
export function plural(count: number, noun: string) {
  return `${String(count)} ${noun}${count === 1 ? "" : "s"}`;
}
