import { formatLongDate, formatTime } from "./datetime";

describe("formatLongDate", () => {
  it("includes the weekday, day and month", () => {
    expect(formatLongDate(new Date(2026, 9, 15), "en-GB")).toBe("Thursday 15 October");
  });
});

describe("formatTime", () => {
  it("uses the locale's clock style", () => {
    const date = new Date(2026, 9, 15, 14, 5);
    expect(formatTime(date, "en-GB")).toBe("14:05");
    expect(formatTime(date, "en-US")).toBe("2:05 PM");
  });
});
