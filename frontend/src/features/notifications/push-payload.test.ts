import { parsePushPayload } from "./push-payload";

describe("parsePushPayload", () => {
  it("reads the server's message", () => {
    expect(
      parsePushPayload({ id: 1, title: "Pay rent", body: "Due today", url: "/inbox" }),
    ).toEqual({ title: "Pay rent", body: "Due today", url: "/inbox" });
  });

  it.each([undefined, null, "text", 42])("falls back to a generic notification for %s", (value) => {
    expect(parsePushPayload(value)).toEqual({ title: "Nudge", body: "", url: "/" });
  });

  it("fills in missing or empty fields", () => {
    expect(parsePushPayload({ title: "", body: 3, url: "" })).toEqual({
      title: "Nudge",
      body: "",
      url: "/",
    });
  });
});
