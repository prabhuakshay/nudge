import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";

import { Button } from "@/components/ui/button";
import { SettingsCard, SettingsStack } from "@/features/settings/settings-layout";

import { useSendTestNotification } from "./notifications";
import {
  disablePush,
  enablePush,
  PUSH_STATUS_LABELS,
  PushError,
  pushStatusQuery,
  type PushStatus,
} from "./push";

const EXPLANATIONS: Partial<Record<PushStatus, string>> = {
  unsupported:
    "This browser can't receive push notifications. On iPhone and iPad, add Nudge to your Home Screen and open it from there.",
  unavailable:
    "Push notifications aren't set up on this server. Ask whoever runs it to add VAPID keys.",
  blocked: "Notifications are blocked for this site. Allow them in your browser's site settings.",
};

/** The settings page for push on this device and a test notification. */
export function NotificationSettings() {
  return (
    <SettingsStack>
      <PushSetting />
      <TestNotificationSetting />
    </SettingsStack>
  );
}

function PushSetting() {
  const queryClient = useQueryClient();
  const { data: status, isError } = useQuery(pushStatusQuery);
  const toggle = useMutation({
    mutationFn: (on: boolean) => (on ? enablePush() : disablePush()),
    onSettled: () => queryClient.invalidateQueries(pushStatusQuery),
  });
  const label = status ? PUSH_STATUS_LABELS[status] : isError ? "Couldn't check" : "Checking…";

  return (
    <SettingsCard className="flex flex-col gap-3">
      <div className="flex items-center justify-between gap-4">
        <div>
          <p className="font-medium">Push notifications</p>
          <p className="text-sm text-muted-foreground">On this device: {label}</p>
        </div>
        {(status === "on" || status === "off") && (
          <Button
            variant={status === "on" ? "outline" : "primary"}
            disabled={toggle.isPending}
            onClick={() => {
              toggle.mutate(status === "off");
            }}
          >
            {status === "on" ? "Turn off" : "Turn on"}
          </Button>
        )}
      </div>
      <PushNote status={status} error={toggle.error} />
    </SettingsCard>
  );
}

/** Why turning push on or off failed, or else why push can't be turned on here. */
function PushNote({ status, error }: { status: PushStatus | undefined; error: Error | null }) {
  if (error) {
    return (
      <p role="alert" className="text-xs text-danger">
        {error instanceof PushError ? error.message : "Something went wrong. Try again."}
      </p>
    );
  }
  const explanation = status && EXPLANATIONS[status];
  return explanation && <p className="text-xs text-muted-foreground">{explanation}</p>;
}

function TestNotificationSetting() {
  const sendTest = useSendTestNotification();

  return (
    <SettingsCard className="flex items-center justify-between gap-4">
      <div>
        <p className="font-medium">Test notification</p>
        <p className="text-sm text-muted-foreground">
          {sendTest.isSuccess ? (
            <span role="status">Sent.</span>
          ) : sendTest.isError ? (
            <span role="alert" className="text-danger">
              Couldn&apos;t send.
            </span>
          ) : (
            "Appears in the notification center and on every device with push on."
          )}
        </p>
      </div>
      <Button
        variant="outline"
        disabled={sendTest.isPending}
        onClick={() => {
          sendTest.mutate(undefined);
        }}
      >
        {sendTest.isPending ? "Sending…" : "Send"}
      </Button>
    </SettingsCard>
  );
}
