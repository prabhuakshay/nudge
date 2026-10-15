import { LoaderCircle } from "lucide-react";
import { useId, useState, type SubmitEvent } from "react";

import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { SettingsCard, SettingsStack } from "@/features/settings/settings-layout";

import { TIME_ZONES, useSetTimeZone } from "./time-zone";

/** The user's time zone, with a searchable picker behind a Change button. */
export function TimeZoneSettings({ timeZone }: { timeZone: string }) {
  const [editing, setEditing] = useState(false);

  return (
    <SettingsStack>
      <SettingsCard>
        {editing ? (
          <TimeZoneForm
            timeZone={timeZone}
            onDone={() => {
              setEditing(false);
            }}
          />
        ) : (
          <div className="flex items-center justify-between gap-4">
            <div className="min-w-0">
              <p className="font-medium">Time zone</p>
              <p className="truncate text-sm text-muted-foreground">{timeZone || "Not set"}</p>
            </div>
            <Button
              variant="outline"
              onClick={() => {
                setEditing(true);
              }}
            >
              Change
            </Button>
          </div>
        )}
      </SettingsCard>
      <p className="text-xs text-muted-foreground">
        Due times and reminders are clock times in this zone. Changing it keeps them at the same
        time on the clock: a task due at 09:00 stays due at 09:00.
      </p>
    </SettingsStack>
  );
}

type TimeZoneFormProps = { timeZone: string; onDone: () => void };

function TimeZoneForm({ timeZone, onDone }: TimeZoneFormProps) {
  const setTimeZone = useSetTimeZone();
  const [unknown, setUnknown] = useState(false);
  const inputId = useId();
  const listId = useId();
  const errorId = useId();
  const error = unknown
    ? "Pick a time zone from the list, such as Europe/London."
    : setTimeZone.isError
      ? "Couldn't save your time zone. Check your connection and try again."
      : null;

  function handleSubmit(event: SubmitEvent<HTMLFormElement>) {
    event.preventDefault();
    const value = new FormData(event.currentTarget).get("time_zone");
    const picked = typeof value === "string" ? value.trim() : "";
    // The browser's own zone can be an alias, such as Asia/Calcutta, that the list leaves out.
    const known = picked === timeZone || TIME_ZONES.includes(picked);
    setUnknown(!known);
    if (known) {
      setTimeZone.mutate(picked, { onSuccess: onDone });
    }
  }

  return (
    <form onSubmit={handleSubmit} className="flex flex-col gap-4">
      {error && (
        <p
          id={errorId}
          role="alert"
          className="rounded-md bg-danger-soft px-3 py-2 text-sm font-medium text-danger"
        >
          {error}
        </p>
      )}
      <div className="flex flex-col gap-1.5">
        <Label htmlFor={inputId}>Time zone</Label>
        <Input
          id={inputId}
          name="time_zone"
          list={listId}
          defaultValue={timeZone}
          placeholder="Search, for example London"
          autoComplete="off"
          spellCheck={false}
          aria-invalid={unknown || undefined}
          aria-describedby={error ? errorId : undefined}
          onFocus={(event) => {
            event.currentTarget.select();
          }}
        />
        <datalist id={listId}>
          {TIME_ZONES.map((zone) => (
            <option key={zone} value={zone} />
          ))}
        </datalist>
      </div>
      <div className="mt-1 flex justify-end gap-2">
        <Button type="button" variant="outline" onClick={onDone}>
          Cancel
        </Button>
        <Button type="submit" disabled={setTimeZone.isPending}>
          {setTimeZone.isPending && <LoaderCircle className="animate-spin" aria-hidden />}
          {setTimeZone.isPending ? "Saving…" : "Save"}
        </Button>
      </div>
    </form>
  );
}
