import { useId, useState } from "react";

import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";

/** A read-only address with a button that copies it, saying whether the copy worked. */
export function CopyField({ label, value }: { label: string; value: string }) {
  const inputId = useId();
  const [copied, setCopied] = useState<boolean | null>(null);

  async function copy() {
    try {
      await navigator.clipboard.writeText(value);
      setCopied(true);
    } catch {
      setCopied(false);
    }
  }

  return (
    <div className="flex flex-col gap-1.5">
      <Label htmlFor={inputId}>{label}</Label>
      <div className="flex gap-2">
        <Input
          id={inputId}
          value={value}
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
