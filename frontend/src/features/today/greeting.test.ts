import { formatLongDate, greetingFor } from "./greeting";

describe("greetingFor", () => {
  it.each([
    [0, "Good morning"],
    [11, "Good morning"],
    [12, "Good afternoon"],
    [17, "Good afternoon"],
    [18, "Good evening"],
    [23, "Good evening"],
  ])("at %i:00 says %s", (hour, expected) => {
    expect(greetingFor(new Date(2026, 9, 15, hour))).toBe(expected);
  });
});

describe("formatLongDate", () => {
  it("includes the weekday, day and month", () => {
    expect(formatLongDate(new Date(2026, 9, 15), "en-GB")).toBe("Thursday 15 October");
  });
});
