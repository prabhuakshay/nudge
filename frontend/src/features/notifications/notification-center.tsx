import { useQuery } from "@tanstack/react-query";
import { useRouter } from "@tanstack/react-router";
import { AlarmClock, Bell, BellOff, Check, ChevronDown, X } from "lucide-react";
import { useState } from "react";

import { Button } from "@/components/ui/button";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { cn } from "@/lib/utils";

import {
  notificationsQuery,
  SNOOZE_OPTIONS,
  useCheckInFromReminder,
  useCompleteFromReminder,
  useDismiss,
  useMarkAllRead,
  useMarkRead,
  useSnoozeHabitReminder,
  useSnoozeReminder,
  type Notification,
  type Snooze,
} from "./notifications";
import { timeAgo } from "./relative-time";

/** The bell that opens the notification center, with a dot while anything is unread. */
export function NotificationCenter() {
  const [open, setOpen] = useState(false);
  const { data } = useQuery(notificationsQuery);
  const unread = data?.unread_count ?? 0;

  return (
    <Popover open={open} onOpenChange={setOpen}>
      <PopoverTrigger asChild>
        <Button
          variant="ghost"
          size="icon"
          aria-label={unread > 0 ? `Notifications, ${unread} unread` : "Notifications"}
          className="relative text-muted-foreground"
        >
          <Bell aria-hidden />
          {unread > 0 && (
            <span className="absolute top-[calc(50%-0.5rem)] right-[calc(50%-0.5rem)] size-2 rounded-full bg-accent ring-2 ring-surface" />
          )}
        </Button>
      </PopoverTrigger>
      <PopoverContent
        align="end"
        aria-label="Notifications"
        className="flex max-h-[min(32rem,calc(100dvh-5rem))] w-[calc(100vw-1rem)] flex-col sm:w-[22rem]"
      >
        <NotificationPanel
          onOpenNotification={() => {
            setOpen(false);
          }}
        />
      </PopoverContent>
    </Popover>
  );
}

function NotificationPanel({ onOpenNotification }: { onOpenNotification: () => void }) {
  const { data, isError } = useQuery(notificationsQuery);
  const markAllRead = useMarkAllRead();

  return (
    <>
      <div className="flex h-12 shrink-0 items-center justify-between border-b border-border px-4">
        <h2 className="font-bold">Notifications</h2>
        {data && data.unread_count > 0 && (
          <button
            type="button"
            disabled={markAllRead.isPending}
            onClick={() => {
              markAllRead.mutate(undefined);
            }}
            className="text-sm font-medium text-primary hover:underline disabled:opacity-60"
          >
            Mark all as read
          </button>
        )}
      </div>
      {isError && (
        <p role="alert" className="px-4 py-6 text-center text-sm text-muted-foreground">
          Couldn&apos;t load notifications.
        </p>
      )}
      {data?.items.length === 0 && (
        <div className="flex flex-col items-center gap-2 px-4 py-10 text-center">
          <BellOff className="size-5 text-muted-foreground" aria-hidden />
          <p className="text-sm text-muted-foreground">You&apos;re all caught up.</p>
        </div>
      )}
      {data && data.items.length > 0 && (
        <ul className="min-h-0 overflow-y-auto">
          {data.items.map((notification) => (
            <NotificationItem
              key={notification.id}
              notification={notification}
              onOpen={onOpenNotification}
            />
          ))}
        </ul>
      )}
    </>
  );
}

type NotificationItemProps = {
  notification: Notification;
  onOpen: () => void;
};

function NotificationItem({ notification, onOpen }: NotificationItemProps) {
  const router = useRouter();
  const markRead = useMarkRead();
  const dismiss = useDismiss();
  const unread = notification.read_at === null;

  return (
    <li className="border-b border-border last:border-b-0">
      <div className="flex items-start">
        <button
          type="button"
          onClick={() => {
            if (unread) {
              markRead.mutate(notification.id);
            }
            if (notification.url) {
              onOpen();
              router.history.push(notification.url);
            }
          }}
          className="flex min-w-0 flex-1 gap-3 py-3 pl-4 text-left transition-colors hover:bg-surface-muted"
        >
          <span
            className={cn("mt-1.5 size-2 shrink-0 rounded-full", unread && "bg-primary")}
            aria-hidden
          />
          <span className="flex min-w-0 flex-col gap-0.5">
            <span className={cn("text-sm", unread ? "font-semibold" : "font-medium")}>
              {notification.title}
              {unread && <span className="sr-only"> (unread)</span>}
            </span>
            {notification.body && (
              <span className="text-sm text-muted-foreground">{notification.body}</span>
            )}
            <time dateTime={notification.created_at} className="text-xs text-muted-foreground">
              {timeAgo(new Date(notification.created_at), new Date())}
            </time>
          </span>
        </button>
        <Button
          variant="ghost"
          size="icon"
          aria-label={`Dismiss ${notification.title}`}
          disabled={dismiss.isPending}
          onClick={() => {
            dismiss.mutate(notification.id);
          }}
          className="m-1.5 text-muted-foreground"
        >
          <X aria-hidden />
        </Button>
      </div>
      {notification.is_reminder && <ReminderActions notification={notification} />}
      {notification.is_habit_reminder && <HabitReminderActions notification={notification} />}
    </li>
  );
}

/** Complete and Snooze for a Reminder, under its notification like TickTick's reminder popup. */
function ReminderActions({ notification }: { notification: Notification }) {
  const complete = useCompleteFromReminder();
  const snooze = useSnoozeReminder();
  const busy = complete.isPending || snooze.isPending;

  return (
    <div className="flex gap-2 pr-4 pb-3 pl-9">
      <Button
        variant="outline"
        aria-label={`Complete ${notification.title}`}
        disabled={busy}
        onClick={() => {
          complete.mutate(notification.id);
        }}
        className="h-11 px-3 lg:h-8"
      >
        <Check aria-hidden />
        Complete
      </Button>
      <SnoozeMenu
        title={notification.title}
        disabled={busy}
        onSnooze={(until) => {
          snooze.mutate({ id: notification.id, until });
        }}
      />
    </div>
  );
}

/** Check in and Snooze for a Habit Reminder, laid out like a Task Reminder's actions. */
function HabitReminderActions({ notification }: { notification: Notification }) {
  const checkIn = useCheckInFromReminder();
  const snooze = useSnoozeHabitReminder();
  const busy = checkIn.isPending || snooze.isPending;

  return (
    <div className="flex gap-2 pr-4 pb-3 pl-9">
      <Button
        variant="outline"
        aria-label={`Check in ${notification.title}`}
        disabled={busy}
        onClick={() => {
          checkIn.mutate(notification.id);
        }}
        className="h-11 px-3 lg:h-8"
      >
        <Check aria-hidden />
        Check in
      </Button>
      <SnoozeMenu
        title={notification.title}
        disabled={busy}
        onSnooze={(until) => {
          snooze.mutate({ id: notification.id, until });
        }}
      />
    </div>
  );
}

type SnoozeMenuProps = {
  title: string;
  disabled: boolean;
  onSnooze: (until: Snooze) => void;
};

function SnoozeMenu({ title, disabled, onSnooze }: SnoozeMenuProps) {
  return (
    <DropdownMenu>
      <DropdownMenuTrigger asChild>
        <Button
          variant="outline"
          aria-label={`Snooze ${title}`}
          disabled={disabled}
          className="h-11 px-3 lg:h-8"
        >
          <AlarmClock aria-hidden />
          Snooze
          <ChevronDown aria-hidden />
        </Button>
      </DropdownMenuTrigger>
      <DropdownMenuContent align="start" className="w-44">
        {SNOOZE_OPTIONS.map(({ until, label }) => (
          <DropdownMenuItem
            key={until}
            onSelect={() => {
              onSnooze(until);
            }}
          >
            {label}
          </DropdownMenuItem>
        ))}
      </DropdownMenuContent>
    </DropdownMenu>
  );
}
