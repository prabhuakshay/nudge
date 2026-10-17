/* Reading why the server refused a request, the same way for every request. */

/**
 * The reason the server gave for refusing a request, to show the user, or `fallback` when it gave
 * none. A proxy's error page has no reason, and a request the schema rejects gives a list of field
 * errors instead of a sentence.
 */
export function failureReason(error: unknown, fallback: string): string {
  const detail = typeof error === "object" && error !== null && "detail" in error && error.detail;
  return typeof detail === "string" && detail !== "" ? detail : fallback;
}
