import {
  calendar,
  emptyRange,
  GYM,
  NOVEMBER,
  OCTOBER,
  rangeIds,
  seeded,
  TRIP,
} from "@/test/task-cache";

import { showTaskChanges, type DayRange } from "./task-cache";

describe("showTaskChanges with a patch that changes a Task's dates", () => {
  function withNovember() {
    const queryClient = seeded();
    emptyRange(queryClient, NOVEMBER);
    return queryClient;
  }

  it("adds a newly dated Task to an overlapping range, with its new dates", () => {
    const queryClient = seeded();

    showTaskChanges(queryClient, [
      { kind: "patch", patch: { id: TRIP.id, dates: { due_date: "2026-10-20" } } },
    ]);

    expect(calendar(queryClient).items.at(-1)).toMatchObject({
      id: TRIP.id,
      due_date: "2026-10-20",
    });
  });

  it("adds the Task to every range its span overlaps and no other", () => {
    const queryClient = withNovember();
    const december: DayRange = { start: "2026-12-01", end: "2026-12-31" };
    emptyRange(queryClient, december);
    const dates = { start_date: "2026-10-30", due_date: "2026-11-02" };

    showTaskChanges(queryClient, [{ kind: "patch", patch: { id: TRIP.id, dates } }]);

    expect(rangeIds(queryClient, OCTOBER)).toEqual([GYM.id, TRIP.id]);
    expect(rangeIds(queryClient, NOVEMBER)).toEqual([TRIP.id]);
    expect(rangeIds(queryClient, december)).toEqual([]);
  });

  it("moves the Task out of a range its new dates leave", () => {
    const queryClient = withNovember();

    showTaskChanges(queryClient, [
      { kind: "patch", patch: { id: GYM.id, dates: { due_date: "2026-11-05" } } },
    ]);

    expect(rangeIds(queryClient, OCTOBER)).toEqual([]);
    expect(rangeIds(queryClient, NOVEMBER)).toEqual([GYM.id]);
  });

  it("removes the Task from every range when its dates are removed", () => {
    const queryClient = withNovember();
    showTaskChanges(queryClient, [
      {
        kind: "patch",
        patch: { id: GYM.id, dates: { start_date: "2026-10-30", due_date: "2026-11-02" } },
      },
    ]);

    showTaskChanges(queryClient, [{ kind: "patch", patch: { id: GYM.id, dates: null } }]);

    expect(rangeIds(queryClient, OCTOBER)).toEqual([]);
    expect(rangeIds(queryClient, NOVEMBER)).toEqual([]);
  });

  it("keeps a Task that stays in a range once, patched in place", () => {
    const queryClient = seeded();

    showTaskChanges(queryClient, [
      { kind: "patch", patch: { id: GYM.id, dates: { due_date: "2026-10-20" } } },
    ]);

    expect(calendar(queryClient).items).toEqual([
      expect.objectContaining({ id: GYM.id, due_date: "2026-10-20" }),
    ]);
  });

  it("adds nothing when no cached shape holds the Task", () => {
    const queryClient = withNovember();

    showTaskChanges(queryClient, [
      {
        kind: "patch",
        patch: { id: 99, dates: { start_date: "2026-10-30", due_date: "2026-11-02" } },
      },
    ]);

    expect(rangeIds(queryClient, OCTOBER)).toEqual([GYM.id]);
    expect(rangeIds(queryClient, NOVEMBER)).toEqual([]);
  });

  it("adds and removes nothing for a patch without dates", () => {
    const queryClient = withNovember();

    showTaskChanges(queryClient, [{ kind: "patch", patch: { id: TRIP.id, title: "Holiday" } }]);

    expect(rangeIds(queryClient, OCTOBER)).toEqual([GYM.id]);
    expect(rangeIds(queryClient, NOVEMBER)).toEqual([]);
  });
});
