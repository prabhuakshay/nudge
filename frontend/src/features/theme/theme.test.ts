import { readTheme, saveTheme } from "./theme";

afterEach(() => {
  localStorage.clear();
  document.documentElement.removeAttribute("data-theme");
});

describe("readTheme", () => {
  it("defaults to system", () => {
    expect(readTheme()).toBe("system");
  });

  it("ignores unknown saved values", () => {
    localStorage.setItem("nudge-theme", "sepia");
    expect(readTheme()).toBe("system");
  });
});

describe("saveTheme", () => {
  it("applies and remembers an explicit theme", () => {
    saveTheme("dark");
    expect(document.documentElement.getAttribute("data-theme")).toBe("dark");
    expect(readTheme()).toBe("dark");
  });

  it("clears the override when switching back to system", () => {
    saveTheme("light");
    saveTheme("system");
    expect(document.documentElement.getAttribute("data-theme")).toBeNull();
    expect(readTheme()).toBe("system");
  });
});
