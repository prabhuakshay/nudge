import { parsePushPayload, pushActionRequest, pushActions } from "./push-payload";

const REMINDER = parsePushPayload({
  id: 7,
  title: "Pay rent",
  body: "Today 14:00 · Inbox",
  url: "/inbox?task=3",
  is_reminder: true,
});

describe("parsePushPayload", () => {
  it("reads the server's message", () => {
    expect(
      parsePushPayload({
        id: 1,
        title: "Pay rent",
        body: "Due today",
        url: "/inbox",
        is_reminder: true,
      }),
    ).toEqual({ id: 1, title: "Pay rent", body: "Due today", url: "/inbox", isReminder: true });
  });

  it.each([undefined, null, "text", 42])("falls back to a generic notification for %s", (value) => {
    expect(parsePushPayload(value)).toEqual({
      title: "Nudge",
      body: "",
      url: "/",
      isReminder: false,
    });
  });

  it("fills in missing or empty fields", () => {
    expect(parsePushPayload({ id: "7", title: "", body: 3, url: "", is_reminder: "yes" })).toEqual({
      title: "Nudge",
      body: "",
      url: "/",
      isReminder: false,
    });
  });
});

describe("pushActions", () => {
  it("offers Complete and Snooze 15 min on a Reminder", () => {
    expect(pushActions(REMINDER)).toEqual([
      { action: "complete", title: "Complete" },
      { action: "snooze", title: "Snooze 15 min" },
    ]);
  });

  it("offers nothing on other notifications", () => {
    expect(pushActions({ ...REMINDER, isReminder: false })).toEqual([]);
    expect(pushActions({ ...REMINDER, id: undefined })).toEqual([]);
  });
});

describe("pushActionRequest", () => {
  it("completes the Task", () => {
    expect(pushActionRequest("complete", REMINDER)).toEqual({
      path: "/api/v1/notifications/7/complete",
    });
  });

  it("snoozes for 15 minutes", () => {
    expect(pushActionRequest("snooze", REMINDER)).toEqual({
      path: "/api/v1/notifications/7/snooze",
      body: { until: "in_15_minutes" },
    });
  });

  it("makes no call for a click on the notification itself", () => {
    expect(pushActionRequest("", REMINDER)).toBeUndefined();
    expect(pushActionRequest("complete", { ...REMINDER, isReminder: false })).toBeUndefined();
  });
});
