import { Plus } from "lucide-react";
import { useRef, useState } from "react";

import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";

import { SECTION_NAME_MAX_LENGTH, useCreateSection } from "./sections";

// A stable ref callback runs once when the field appears, not on every keystroke.
function focusOnMount(element: HTMLElement | null) {
  element?.focus();
}

/**
 * The control after a Project's Sections, under its list or at the end of its Board, that adds a
 * Section last. The button opens a name field; Enter adds the Section, and Escape, or leaving the
 * field empty, closes it again. `className` places it in its Layout.
 */
export function AddSection({ projectId, className }: { projectId: number; className: string }) {
  const { mutate: create } = useCreateSection(projectId);
  const [open, setOpen] = useState(false);
  const [name, setName] = useState("");
  const buttonRef = useRef<HTMLButtonElement>(null);

  const close = ({ refocus }: { refocus: boolean }) => {
    setOpen(false);
    setName("");
    if (refocus) buttonRef.current?.focus();
  };

  return (
    <div className={className}>
      <Button
        ref={buttonRef}
        variant="ghost"
        aria-expanded={open}
        onClick={() => {
          setOpen(true);
        }}
        className="text-muted-foreground"
      >
        <Plus aria-hidden />
        Add section
      </Button>
      {open && (
        <form
          className="pt-1.5 pb-1"
          onSubmit={(event) => {
            event.preventDefault();
            if (name.trim()) create({ name });
            close({ refocus: true });
          }}
        >
          <Input
            ref={focusOnMount}
            aria-label="Section name"
            placeholder="Section name"
            maxLength={SECTION_NAME_MAX_LENGTH}
            value={name}
            onChange={(event) => {
              setName(event.target.value);
            }}
            onKeyDown={(event) => {
              if (event.key === "Escape") close({ refocus: true });
            }}
            onBlur={() => {
              if (!name.trim()) close({ refocus: false });
            }}
          />
        </form>
      )}
    </div>
  );
}
