import { formatLongDate } from "./datetime";

describe("formatLongDate", () => {
  it("includes the weekday, day and month", () => {
    expect(formatLongDate(new Date(2026, 9, 15), "en-GB")).toBe("Thursday 15 October");
  });
});
