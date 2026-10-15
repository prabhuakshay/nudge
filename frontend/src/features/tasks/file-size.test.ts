import { fileSize } from "./file-size";

describe("fileSize", () => {
  it.each([
    [512, "512 B"],
    [34 * 1024, "34 KB"],
    [2.5 * 1024 * 1024, "2.5 MB"],
  ])("shows %i bytes as %s", (bytes, shown) => {
    expect(fileSize(bytes)).toBe(shown);
  });
});
