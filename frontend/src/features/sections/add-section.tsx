import { ListPlus, Plus } from "lucide-react";
import { useRef, useState, type Ref } from "react";

import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Tooltip, TooltipContent, TooltipTrigger } from "@/components/ui/tooltip";

import { SECTION_NAME_MAX_LENGTH, useCreateSection } from "./sections";

// A stable ref callback runs once when the field appears, not on every keystroke.
function focusOnMount(element: HTMLElement | null) {
  element?.focus();
}

/**
 * The control at the end of a Board that adds a Section last. The button opens a name field;
 * Enter adds the Section, and Escape, or leaving the field empty, closes it again. `className`
 * places it in the Board.
 */
export function AddSection({ projectId, className }: { projectId: number; className: string }) {
  const [open, setOpen] = useState(false);
  const buttonRef = useRef<HTMLButtonElement>(null);

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
        <NewSectionField
          projectId={projectId}
          onClose={({ refocus }) => {
            setOpen(false);
            if (refocus) buttonRef.current?.focus();
          }}
        />
      )}
    </div>
  );
}

/** The list header's button that opens the name field for adding a Section last. */
export function AddSectionButton({
  open,
  onOpen,
  buttonRef,
}: {
  open: boolean;
  onOpen: () => void;
  buttonRef: Ref<HTMLButtonElement>;
}) {
  return (
    <Tooltip>
      <TooltipTrigger asChild>
        <button
          ref={buttonRef}
          type="button"
          aria-label="Add section"
          aria-expanded={open}
          onClick={onOpen}
          className="flex size-11 items-center justify-center rounded-md border border-border bg-surface text-muted-foreground shadow-xs transition-colors hover:bg-surface-muted hover:text-foreground focus-visible:outline-2 focus-visible:outline-ring sm:size-9"
        >
          <ListPlus className="size-4" aria-hidden />
        </button>
      </TooltipTrigger>
      <TooltipContent>Add section</TooltipContent>
    </Tooltip>
  );
}

/**
 * The name field that adds a Section last. Enter adds it; Escape, or leaving the field empty,
 * closes it, and `refocus` says whether focus should go back to what opened it.
 */
export function NewSectionField({
  projectId,
  onClose,
}: {
  projectId: number;
  onClose: (options: { refocus: boolean }) => void;
}) {
  const { mutate: create } = useCreateSection(projectId);
  const [name, setName] = useState("");

  return (
    <form
      className="pt-1.5 pb-1"
      onSubmit={(event) => {
        event.preventDefault();
        if (name.trim()) create({ name });
        onClose({ refocus: true });
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
          if (event.key === "Escape") onClose({ refocus: true });
        }}
        onBlur={() => {
          if (!name.trim()) onClose({ refocus: false });
        }}
      />
    </form>
  );
}
