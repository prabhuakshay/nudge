import { makeTask } from "@/test/tasks";

import { addDays, todayIn, upcomingGroups } from "./schedule";

describe("todayIn", () => {
  it("reads the date on the user's clock, not the browser's", () => {
    // 23:30 on the 15th in London is already the 16th in Kolkata.
    const now = new Date("2026-10-15T22:30:00Z");

    expect(todayIn("Europe/London", now)).toBe("2026-10-15");
    expect(todayIn("Asia/Kolkata", now)).toBe("2026-10-16");
  });
});

describe("addDays", () => {
  it("steps over the end of a month", () => {
    expect(addDays("2026-10-31", 1)).toBe("2026-11-01");
  });
});

describe("upcomingGroups", () => {
  it("groups a week by day, from Tomorrow, then later Tasks by month", () => {
    // Thursday 15 October 2026.
    const today = "2026-10-15";
    const tasks = [
      makeTask({ id: 1, due_date: "2026-10-16" }),
      makeTask({ id: 2, due_date: "2026-10-18" }),
      makeTask({ id: 3, start_date: "2026-10-18", due_date: "2026-10-20" }),
      makeTask({ id: 4, due_date: "2026-10-22" }),
      makeTask({ id: 5, due_date: "2026-10-23" }),
      makeTask({ id: 6, due_date: "2026-11-02" }),
      makeTask({ id: 7, due_date: "2027-01-05" }),
    ];

    const groups = upcomingGroups(tasks, today);

    expect(groups.map(({ label, tasks }) => [label, tasks.map((task) => task.id)])).toEqual([
      ["Tomorrow", [1]],
      ["Sunday", [2, 3]],
      ["Thursday", [4]],
      ["October", [5]],
      ["November", [6]],
      ["January 2027", [7]],
    ]);
  });
});
