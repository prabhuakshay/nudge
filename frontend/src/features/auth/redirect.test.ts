import { safeRedirectPath } from "./redirect";

describe("safeRedirectPath", () => {
  it.each(["/", "/inbox", "/upcoming?view=week"])("keeps the local path %s", (path) => {
    expect(safeRedirectPath(path)).toBe(path);
  });

  it.each([undefined, "", "https://evil.example", "//evil.example", "/\\evil.example", "inbox"])(
    "falls back to / for %s",
    (path) => {
      expect(safeRedirectPath(path)).toBe("/");
    },
  );
});
