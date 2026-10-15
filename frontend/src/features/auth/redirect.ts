/**
 * Return `target` if it is a path on this site, otherwise "/".
 *
 * The login page sends people back to where they came from via `?redirect=`; accepting full
 * URLs or protocol-relative paths (`//evil.example`) there would allow open redirects.
 */
export function safeRedirectPath(target: string | undefined): string {
  if (!target?.startsWith("/") || target.startsWith("//") || target.startsWith("/\\")) {
    return "/";
  }
  return target;
}
