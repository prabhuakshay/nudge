import { useRef, useState } from "react";

import { Input } from "@/components/ui/input";

import { SECTION_NAME_MAX_LENGTH } from "./sections";

// A stable ref callback runs once when the field appears, so the whole name is ready to replace.
function selectOnMount(element: HTMLInputElement | null) {
  element?.focus();
  element?.select();
}

/**
 * The field that renames a Section in place of its header's name. Enter, or leaving the field,
 * saves a changed name; Escape keeps the old one. `onDone` gets the new name, or null when there
 * is nothing to save, and whether focus should go back to the header.
 */
export function SectionNameField({
  name: initial,
  onDone,
}: {
  name: string;
  onDone: (name: string | null, refocus: boolean) => void;
}) {
  const [name, setName] = useState(initial);
  // Refocusing the header blurs the field, which would finish it a second time.
  const finished = useRef(false);

  const finish = ({ save, refocus }: { save: boolean; refocus: boolean }) => {
    if (finished.current) return;
    finished.current = true;
    const trimmed = name.trim();
    onDone(save && trimmed && trimmed !== initial ? trimmed : null, refocus);
  };

  return (
    <form
      className="min-w-0 flex-1"
      onSubmit={(event) => {
        event.preventDefault();
        finish({ save: true, refocus: true });
      }}
    >
      <Input
        ref={selectOnMount}
        aria-label="Section name"
        maxLength={SECTION_NAME_MAX_LENGTH}
        value={name}
        onChange={(event) => {
          setName(event.target.value);
        }}
        onKeyDown={(event) => {
          if (event.key === "Escape") finish({ save: false, refocus: true });
        }}
        onBlur={() => {
          finish({ save: true, refocus: false });
        }}
        className="h-7 text-xs font-semibold sm:text-xs"
      />
    </form>
  );
}
