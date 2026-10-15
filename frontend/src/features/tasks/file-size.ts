/** A size the way file managers show it: 512 B, 34 KB, 2.5 MB. */
export function fileSize(bytes: number) {
  if (bytes < 1024) return `${String(bytes)} B`;
  const kilobytes = bytes / 1024;
  if (kilobytes < 1024) return `${String(Math.round(kilobytes))} KB`;
  return `${(kilobytes / 1024).toFixed(1)} MB`;
}
