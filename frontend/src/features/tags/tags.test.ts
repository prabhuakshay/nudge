import { dropAfter, moveAfter, tagNameProblem } from "./tags";

const TAGS = [{ id: 1 }, { id: 2 }, { id: 3 }];

describe("dropAfter", () => {
  it("follows the Tag it's dropped on when dragged down", () => {
    expect(dropAfter(TAGS, 1, 2)).toBe(2);
    expect(dropAfter(TAGS, 1, 3)).toBe(3);
  });

  it("takes the place of the Tag it's dropped on when dragged up", () => {
    expect(dropAfter(TAGS, 3, 2)).toBe(1);
    expect(dropAfter(TAGS, 3, 1)).toBeNull();
  });
});

describe("moveAfter", () => {
  it("puts a Tag right after another, or first for null", () => {
    expect(moveAfter(TAGS, 1, 3).map((tag) => tag.id)).toEqual([2, 3, 1]);
    expect(moveAfter(TAGS, 3, null).map((tag) => tag.id)).toEqual([3, 1, 2]);
  });
});

describe("tagNameProblem", () => {
  it("refuses spaces and # but allows other characters", () => {
    expect(tagNameProblem("two words")).toBe("Tag names can't have spaces or #.");
    expect(tagNameProblem("#work")).toBe("Tag names can't have spaces or #.");
    expect(tagNameProblem("  dev-ops/ü  ")).toBeNull();
  });
});
