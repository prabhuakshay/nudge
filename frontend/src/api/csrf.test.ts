import { needsCsrfToken, readCsrfToken } from "./csrf";

describe("readCsrfToken", () => {
  it("finds the token among other cookies", () => {
    expect(readCsrfToken("theme=dark; csrftoken=abc123; lang=en")).toBe("abc123");
  });

  it("decodes encoded values", () => {
    expect(readCsrfToken("csrftoken=a%3Db")).toBe("a=b");
  });

  it("returns undefined when the cookie is missing", () => {
    expect(readCsrfToken("theme=dark")).toBeUndefined();
  });
});

describe("needsCsrfToken", () => {
  it.each(["POST", "put", "PATCH", "DELETE"])("requires a token for %s", (method) => {
    expect(needsCsrfToken(method)).toBe(true);
  });

  it.each(["GET", "head", "OPTIONS"])("skips the token for %s", (method) => {
    expect(needsCsrfToken(method)).toBe(false);
  });
});
