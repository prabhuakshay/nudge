import { afterEach, describe, expect, it, vi } from "vitest";

import { patchTask } from "./tasks";

function answer(body: string, status: number, type = "application/json") {
  vi.spyOn(globalThis, "fetch").mockResolvedValue(
    new Response(body, { status, headers: { "Content-Type": type } }),
  );
}

afterEach(() => {
  vi.restoreAllMocks();
});

describe("patchTask", () => {
  it("fails with the reason the server gives", async () => {
    answer(JSON.stringify({ detail: "A task repeats at most daily." }), 422);

    await expect(patchTask({ id: 1, title: "Gym" })).rejects.toThrow(
      "A task repeats at most daily.",
    );
  });

  it("fails with a general reason when the server gives none", async () => {
    answer("<h1>Bad Gateway</h1>", 502, "text/html");

    await expect(patchTask({ id: 1, title: "Gym" })).rejects.toThrow("Could not save the task.");
  });

  it("fails with a general reason when the reason isn't a sentence", async () => {
    answer(JSON.stringify({ detail: [{ msg: "Field required" }] }), 422);

    await expect(patchTask({ id: 1, title: "Gym" })).rejects.toThrow("Could not save the task.");
  });
});
