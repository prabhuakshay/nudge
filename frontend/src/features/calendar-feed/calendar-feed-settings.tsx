import { useQuery } from "@tanstack/react-query";
import { useId, useState } from "react";

import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { SettingsCard, SettingsStack } from "@/features/settings/settings-layout";

import { calendarFeedQuery, useTurnOffCalendarFeed, useTurnOnCalendarFeed } from "./calendar-feed";

/** The settings page that turns the private Calendar feed on, resets its link or turns it off. */
export function CalendarFeedSettings() {
  const { data: url, isError } = useQuery(calendarFeedQuery);
  const turnOn = useTurnOnCalendarFeed();
  const turnOff = useTurnOffCalendarFeed();
  const pending = turnOn.isPending || turnOff.isPending;
  const failed = turnOn.isError || turnOff.isError;

  return (
    <SettingsStack>
      <SettingsCard className="flex flex-col gap-4">
        <div className="flex items-center justify-between gap-4">
          <div>
            <p className="font-medium">Calendar feed</p>
            <p className="text-sm text-muted-foreground">
              {url === undefined ? (isError ? "Couldn't check" : "Checking…") : url ? "On" : "Off"}
            </p>
          </div>
          {url === null && (
            <Button
              disabled={pending}
              onClick={() => {
                turnOn.mutate();
              }}
            >
              Turn on
            </Button>
          )}
        </div>
        {url && <FeedAddress url={url} />}
        {url && (
          <div className="flex flex-wrap justify-end gap-2">
            <Button
              variant="outline"
              disabled={pending}
              onClick={() => {
                turnOn.mutate();
              }}
            >
              Reset link
            </Button>
            <Button
              variant="outline"
              disabled={pending}
              onClick={() => {
                turnOff.mutate();
              }}
            >
              Turn off
            </Button>
          </div>
        )}
        {failed && (
          <p role="alert" className="text-xs text-danger">
            Couldn&apos;t change your Calendar feed. Check your connection and try again.
          </p>
        )}
      </SettingsCard>
      <p className="text-xs text-muted-foreground">
        Subscribe to this address in Google Calendar, Apple Calendar or Outlook to see every open
        task with a due date as an event. Calendar apps refresh it on their own schedule, from every
        few minutes to once a day. Anyone with the link can see your tasks: reset it if it leaks.
      </p>
    </SettingsStack>
  );
}

function FeedAddress({ url }: { url: string }) {
  const inputId = useId();
  const [copied, setCopied] = useState<boolean | null>(null);

  async function copy() {
    try {
      await navigator.clipboard.writeText(url);
      setCopied(true);
    } catch {
      setCopied(false);
    }
  }

  return (
    <div className="flex flex-col gap-1.5">
      <Label htmlFor={inputId}>Feed address</Label>
      <div className="flex gap-2">
        <Input
          id={inputId}
          value={url}
          readOnly
          spellCheck={false}
          onFocus={(event) => {
            event.currentTarget.select();
          }}
        />
        <Button variant="outline" className="shrink-0" onClick={() => void copy()}>
          Copy link
        </Button>
      </div>
      {copied !== null && (
        <p role="status" className="text-xs text-muted-foreground">
          {copied ? "Copied." : "Couldn't copy. Select the address and copy it yourself."}
        </p>
      )}
    </div>
  );
}
