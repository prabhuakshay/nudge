import { initialsFor } from "./initials";

describe("initialsFor", () => {
  it.each([
    ["Ada Lovelace", "AL"],
    ["plato", "P"],
    ["  Grace   Brewster Hopper ", "GB"],
  ])("uses the name %j", (fullName, expected) => {
    expect(initialsFor({ full_name: fullName, email: "x@example.com" })).toBe(expected);
  });

  it("falls back to the email", () => {
    expect(initialsFor({ full_name: "", email: "ada@example.com" })).toBe("A");
  });
});
