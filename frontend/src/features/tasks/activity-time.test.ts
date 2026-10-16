import { activityTime, exactTime } from "./activity-time";

const NOW = new Date(2026, 9, 15, 14, 30);

describe("activityTime", () => {
  it.each([
    [new Date(2026, 9, 15, 14, 29, 40), "Just now"],
    [new Date(2026, 9, 15, 14, 25), "5 minutes ago"],
    [new Date(2026, 9, 15, 9, 30), "5 hours ago"],
    [new Date(2026, 9, 14, 23, 50), "Yesterday, 23:50"],
    [new Date(2026, 9, 12, 8, 5), "Monday, 08:05"],
    [new Date(2026, 9, 1, 8, 5), "1 Oct, 08:05"],
  ])("says when %s happened as %s", (at, expected) => {
    expect(activityTime(at, NOW)).toBe(expected);
  });
});

describe("exactTime", () => {
  it("spells out the full date and time", () => {
    expect(exactTime(new Date(2026, 9, 12, 8, 5))).toBe("Monday 12 October 2026, 08:05");
  });
});
