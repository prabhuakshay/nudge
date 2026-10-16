import { makeTask } from "@/test/tasks";

import { futureOccurrences } from "./occurrences";

describe("futureOccurrences", () => {
  it("moves a repeating Task's dates to each Occurrence, open and not overdue", () => {
    const trip = makeTask({
      id: 4,
      start_date: "2026-10-01",
      start_time: "09:00:00",
      due_date: "2026-10-03",
      due_time: "17:00:00",
      is_overdue: true,
    });

    const [occurrence] = futureOccurrences({
      items: [],
      occurrences: [{ task_id: 4, date: "2026-11-03" }],
      repeating: [trip],
    });

    expect(occurrence).toMatchObject({
      id: 4,
      start_date: "2026-11-01",
      start_time: "09:00:00",
      due_date: "2026-11-03",
      due_time: "17:00:00",
      status: "open",
      is_overdue: false,
      occurrence: true,
    });
  });

  it("skips an Occurrence whose Task didn't come with it", () => {
    expect(
      futureOccurrences({
        items: [],
        occurrences: [{ task_id: 4, date: "2026-11-03" }],
        repeating: [],
      }),
    ).toEqual([]);
  });
});
