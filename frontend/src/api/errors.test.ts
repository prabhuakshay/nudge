import { describe, expect, it } from "vitest";

import { failureReason } from "./errors";

describe("failureReason", () => {
  it("is the reason the server gives", () => {
    expect(failureReason({ detail: "A task repeats at most daily." }, "Could not save.")).toBe(
      "A task repeats at most daily.",
    );
  });

  it("falls back to the general reason when there is no error body", () => {
    expect(failureReason(undefined, "Could not save.")).toBe("Could not save.");
  });

  it("falls back to the general reason when the reason isn't a sentence", () => {
    const fieldErrors = { detail: [{ msg: "Field required" }] };

    expect(failureReason(fieldErrors, "Could not save.")).toBe("Could not save.");
  });

  it("falls back to the general reason when the reason is empty", () => {
    expect(failureReason({ detail: "" }, "Could not save.")).toBe("Could not save.");
  });
});
