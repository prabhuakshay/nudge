import { repeatLabel, repeatOptions } from "./repeat";

describe("repeatLabel", () => {
  it.each([
    ["FREQ=DAILY", "Daily"],
    ["FREQ=DAILY;INTERVAL=3", "Every 3 days"],
    ["FREQ=WEEKLY", "Weekly"],
    ["FREQ=WEEKLY;BYDAY=TH", "Weekly on Thursday"],
    ["FREQ=WEEKLY;BYDAY=MO,WE", "Weekly on Monday, Wednesday"],
    ["FREQ=WEEKLY;BYDAY=MO,TU,WE,TH,FR", "Every weekday"],
    ["FREQ=WEEKLY;INTERVAL=2", "Every other week"],
    ["FREQ=WEEKLY;INTERVAL=3;BYDAY=FR", "Every 3 weeks on Friday"],
    ["FREQ=MONTHLY;BYMONTHDAY=1", "Monthly on the 1st"],
    ["FREQ=MONTHLY;BYMONTHDAY=22", "Monthly on the 22nd"],
    ["FREQ=MONTHLY;BYMONTHDAY=13", "Monthly on the 13th"],
    ["FREQ=MONTHLY;BYMONTHDAY=-1", "Monthly on the last day"],
    ["FREQ=MONTHLY;INTERVAL=2", "Every 2 months"],
    ["FREQ=YEARLY;BYMONTH=10;BYMONTHDAY=15", "Yearly on 15 Oct"],
    ["FREQ=DAILY;COUNT=5", "Daily, 5 times"],
    ["FREQ=WEEKLY;UNTIL=20261231", "Weekly, until 31 Dec 2026"],
    ["FREQ=MONTHLY;BYDAY=-1FR", "Custom repeat"],
  ])("describes %s as “%s”", (rule, label) => {
    expect(repeatLabel(rule)).toBe(label);
  });
});

describe("repeatOptions", () => {
  it("offers the presets for the due date, as TickTick does", () => {
    expect(repeatOptions("2026-10-15").map((option) => option.label)).toEqual([
      "Daily",
      "Weekly on Thursday",
      "Every weekday",
      "Every other week",
      "Monthly on the 15th",
      "Monthly on the last day",
      "Yearly on 15 Oct",
      "Every 3 days",
    ]);
  });

  it("gives each preset its rule", () => {
    expect(repeatOptions("2026-10-15")[1]).toEqual({
      rule: "FREQ=WEEKLY;BYDAY=TH",
      label: "Weekly on Thursday",
    });
  });
});
