// Vitest stubs CSS imports (css: false), so the stylesheets are read from disk.
import { readFileSync } from "node:fs";

const read = (path: string) => readFileSync(new URL(path, import.meta.url), "utf8");
const globalsCss = read("./globals.css");
const tokensCss = read("./tokens.css");

const TOKENS = [
  "success",
  "warning",
  "p1",
  "p2",
  "p3",
  "p4",
  "hue-red",
  "hue-orange",
  "hue-amber",
  "hue-green",
  "hue-teal",
  "hue-blue",
  "hue-violet",
  "hue-pink",
].flatMap((name) => [name, `${name}-soft`]);

const HEX = "#[0-9a-f]{6}";

describe.each(TOKENS)("colour token %s", (name) => {
  it("has a light and a dark value", () => {
    expect(tokensCss).toMatch(new RegExp(`--${name}: light-dark\\(${HEX}, ${HEX}\\);`));
  });

  it("is a Tailwind colour", () => {
    expect(globalsCss).toContain(`--color-${name}: var(--${name});`);
  });
});

it("loads the generated tokens into the global stylesheet", () => {
  expect(globalsCss).toContain('@import "./tokens.css";');
});

it("matches the tokens exported by the brand build", () => {
  expect(tokensCss).toBe(read("../../../branding/colors/tokens.css"));
});
