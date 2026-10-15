/** Name of the cookie Django sets with the CSRF token. */
export const CSRF_COOKIE_NAME = "csrftoken";

/** Read Django's CSRF token from `document.cookie`, or `undefined` if it isn't set. */
export function readCsrfToken(cookies: string = document.cookie): string | undefined {
  for (const pair of cookies.split(";")) {
    const [name, ...value] = pair.trim().split("=");
    if (name === CSRF_COOKIE_NAME) {
      return decodeURIComponent(value.join("="));
    }
  }
  return undefined;
}

const SAFE_METHODS = new Set(["GET", "HEAD", "OPTIONS", "TRACE"]);

/** Whether Django requires a CSRF token for a request with this HTTP method. */
export function needsCsrfToken(method: string): boolean {
  return !SAFE_METHODS.has(method.toUpperCase());
}
