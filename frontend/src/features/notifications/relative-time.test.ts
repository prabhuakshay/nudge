import { timeAgo } from "./relative-time";

const now = new Date(2026, 9, 15, 12, 0);

function minutesBefore(minutes: number) {
  return new Date(now.getTime() - minutes * 60 * 1000);
}

describe("timeAgo", () => {
  it.each([
    [0, "Just now"],
    [0.5, "Just now"],
    [5, "5 min. ago"],
    [90, "1 hr. ago"],
    [60 * 24, "yesterday"],
    [60 * 24 * 3, "3 days ago"],
  ])("describes %s minutes ago as %s", (minutes, expected) => {
    expect(timeAgo(minutesBefore(minutes), now)).toBe(expected);
  });

  it("shows the date for anything older than a week", () => {
    const date = minutesBefore(60 * 24 * 10);

    expect(timeAgo(date, now)).toBe(
      date.toLocaleDateString(undefined, { month: "short", day: "numeric" }),
    );
  });
});
