import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";

import { SettingsGroup, SettingsRow } from "@/features/settings/settings-layout";
import { cn } from "@/lib/utils";

import { useSendTestNotification } from "./notifications";
import { disablePush, enablePush, PushError, pushStatusQuery, type PushStatus } from "./push";

const ACTION = "font-medium text-primary hover:underline disabled:opacity-60";

const STATUS_LABELS: Record<PushStatus, string> = {
  unsupported: "Unavailable",
  unavailable: "Unavailable",
  blocked: "Blocked",
  off: "Off",
  on: "On",
};

const EXPLANATIONS: Partial<Record<PushStatus, string>> = {
  unsupported:
    "This browser can't receive push notifications. On iPhone and iPad, add Nudge to your Home Screen and open it from there.",
  unavailable:
    "Push notifications aren't set up on this server. Ask whoever runs it to add VAPID keys.",
  blocked: "Notifications are blocked for this site. Allow them in your browser's site settings.",
};

/** The settings tab for push on this device and a test notification. */
export function NotificationSettings() {
  return (
    <>
      <PushSetting />
      <TestNotificationSetting />
    </>
  );
}

function PushSetting() {
  const queryClient = useQueryClient();
  const { data: status, isError } = useQuery(pushStatusQuery);
  const toggle = useMutation({
    mutationFn: (on: boolean) => (on ? enablePush() : disablePush()),
    onSettled: () => queryClient.invalidateQueries(pushStatusQuery),
  });
  const label = status ? STATUS_LABELS[status] : isError ? "Couldn't check" : "Checking…";

  return (
    <SettingsGroup>
      <SettingsRow label="Push notifications on this device">
        <span className="text-muted-foreground">{label}</span>
        {(status === "on" || status === "off") && (
          <button
            type="button"
            disabled={toggle.isPending}
            onClick={() => {
              toggle.mutate(status === "off");
            }}
            className={cn(ACTION, "ml-4")}
          >
            {status === "on" ? "Turn off" : "Turn on"}
          </button>
        )}
      </SettingsRow>
      {toggle.error ? (
        <p role="alert" className="px-4 pb-3 text-xs text-danger">
          {toggle.error instanceof PushError
            ? toggle.error.message
            : "Something went wrong. Try again."}
        </p>
      ) : (
        status &&
        EXPLANATIONS[status] && (
          <p className="px-4 pb-3 text-xs text-muted-foreground">{EXPLANATIONS[status]}</p>
        )
      )}
    </SettingsGroup>
  );
}

function TestNotificationSetting() {
  const sendTest = useSendTestNotification();

  return (
    <>
      <SettingsGroup>
        <SettingsRow label="Test notification">
          {sendTest.isSuccess && (
            <span role="status" className="mr-4 text-muted-foreground">
              Sent
            </span>
          )}
          {sendTest.isError && (
            <span role="alert" className="mr-4 text-danger">
              Couldn&apos;t send
            </span>
          )}
          <button
            type="button"
            disabled={sendTest.isPending}
            onClick={() => {
              sendTest.mutate(undefined);
            }}
            className={ACTION}
          >
            {sendTest.isPending ? "Sending…" : "Send"}
          </button>
        </SettingsRow>
      </SettingsGroup>
      <p className="px-1 text-xs text-muted-foreground">
        The test appears in the notification center and on every device with push turned on.
      </p>
    </>
  );
}
