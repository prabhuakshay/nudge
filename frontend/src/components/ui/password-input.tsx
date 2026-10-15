import { Eye, EyeOff } from "lucide-react";
import { useId, useState, type ComponentProps, type KeyboardEvent } from "react";

import { cn } from "@/lib/utils";

import { Input } from "./input";

type PasswordInputProps = Omit<ComponentProps<"input">, "type">;

/**
 * A password field with a button to show what was typed and a warning while Caps Lock is on,
 * the two usual reasons a correct password gets rejected.
 */
export function PasswordInput({
  className,
  onKeyDown,
  onKeyUp,
  "aria-describedby": describedBy,
  ...props
}: PasswordInputProps) {
  const [visible, setVisible] = useState(false);
  const [capsLock, setCapsLock] = useState(false);
  const capsLockId = useId();

  function trackCapsLock(event: KeyboardEvent<HTMLInputElement>) {
    setCapsLock(event.getModifierState("CapsLock"));
  }

  return (
    <div className="flex flex-col gap-1.5">
      <div className="relative">
        <Input
          type={visible ? "text" : "password"}
          className={cn("pr-10", className)}
          aria-describedby={cn(describedBy, capsLock && capsLockId) || undefined}
          onKeyDown={(event) => {
            trackCapsLock(event);
            onKeyDown?.(event);
          }}
          onKeyUp={(event) => {
            trackCapsLock(event);
            onKeyUp?.(event);
          }}
          {...props}
        />
        <button
          type="button"
          aria-label={visible ? "Hide password" : "Show password"}
          aria-pressed={visible}
          onClick={() => {
            setVisible(!visible);
          }}
          className="absolute inset-y-0 right-0 flex w-10 items-center justify-center rounded-r-md text-muted-foreground transition-colors hover:text-foreground"
        >
          {visible ? (
            <EyeOff className="size-4" aria-hidden />
          ) : (
            <Eye className="size-4" aria-hidden />
          )}
        </button>
      </div>
      {capsLock && (
        <p id={capsLockId} className="text-xs font-medium text-muted-foreground">
          Caps Lock is on.
        </p>
      )}
    </div>
  );
}
