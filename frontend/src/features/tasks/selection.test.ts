import { describe, expect, it } from "vitest";

import { NO_SELECTION, selectRange, toggleSelected } from "./selection";

const ORDER = [1, 2, 3, 4, 5];

describe("selecting rows", () => {
  it("adds a row with Mod-click and takes it off again", () => {
    const one = toggleSelected(NO_SELECTION, 2);
    const two = toggleSelected(one, 4);

    expect([...two.ids]).toEqual([2, 4]);
    expect([...toggleSelected(two, 2).ids]).toEqual([4]);
  });

  it("selects every row between the anchor and the row Shift-clicked", () => {
    const anchored = toggleSelected(NO_SELECTION, 2);

    expect([...selectRange(anchored, 2, 4, ORDER).ids]).toEqual([2, 3, 4]);
    expect([...selectRange(anchored, 2, 1, ORDER).ids].sort()).toEqual([1, 2]);
  });

  it("starts a range at the given row when nothing is selected yet", () => {
    const range = selectRange(NO_SELECTION, 3, 5, ORDER);

    expect([...range.ids]).toEqual([3, 4, 5]);
    expect(range.anchor).toBe(3);
  });

  it("grows and shrinks a range from its anchor, as Shift+↑/↓ do", () => {
    const grown = selectRange(selectRange(NO_SELECTION, 2, 3, ORDER), 3, 4, ORDER);
    const shrunk = selectRange(grown, 4, 3, ORDER);

    expect([...grown.ids]).toEqual([2, 3, 4]);
    expect([...shrunk.ids]).toEqual([2, 3]);
  });

  it("keeps rows picked with Mod-click when Shift adds a range", () => {
    const picked = toggleSelected(toggleSelected(NO_SELECTION, 1), 4);

    expect([...selectRange(picked, 4, 5, ORDER).ids].sort()).toEqual([1, 4, 5]);
  });
});
