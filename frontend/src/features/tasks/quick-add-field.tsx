import { Plus } from "lucide-react";
import { useId, useRef, useState, type RefObject } from "react";

import { PersonAvatar } from "@/features/people/person-avatar";
import { ProjectIcon } from "@/features/projects/project-icon";
import { tagHue } from "@/features/tags/tags";
import { cn } from "@/lib/utils";

import { matchClass } from "./quick-add-style";
import type { PickerOption, QuickAddState } from "./use-quick-add";

/**
 * Quick add's input with live highlighting: a mirror behind the input, whose own text is
 * transparent, paints each match in its colour. Typing `#`, `@` or `~` opens a picker of the
 * user's items under it.
 */
export function QuickAddField({
  quick,
  inputRef,
  label,
  placeholder,
  onFocusChange,
}: {
  quick: QuickAddState;
  inputRef: RefObject<HTMLInputElement | null>;
  label: string;
  placeholder: string;
  onFocusChange?: (focused: boolean) => void;
}) {
  const mirror = useRef<HTMLDivElement>(null);
  const listId = useId();
  const [focused, setFocused] = useState(false);
  const { value, parsed, picker } = quick;
  const showPicker = picker.open && focused;

  const parts: { text: string; className?: string }[] = [];
  let last = 0;
  for (const match of parsed.matches) {
    parts.push({ text: value.slice(last, match.start) });
    parts.push({ text: match.text, className: matchClass(match) });
    last = match.end;
  }
  parts.push({ text: value.slice(last) });

  const focus = (next: boolean) => {
    setFocused(next);
    onFocusChange?.(next);
  };
  // 16px on touch screens: iOS Safari zooms the page into any input smaller than that.
  const shared =
    "col-start-1 row-start-1 h-9 w-full whitespace-pre text-sm leading-9 pointer-coarse:h-11 pointer-coarse:text-base pointer-coarse:leading-11";

  return (
    <div className="relative min-w-0 flex-1">
      <div className="grid overflow-hidden">
        <div ref={mirror} aria-hidden className={cn(shared, "pointer-events-none overflow-hidden")}>
          {parts.map((part, index) =>
            part.className ? (
              <mark
                key={index}
                className={cn("rounded-[3px] ring-1 ring-current/25", part.className)}
              >
                {part.text}
              </mark>
            ) : (
              <span key={index}>{part.text}</span>
            ),
          )}
        </div>
        <input
          ref={inputRef}
          aria-label={label}
          role="combobox"
          aria-expanded={showPicker}
          aria-controls={showPicker ? listId : undefined}
          aria-activedescendant={
            showPicker && picker.options.length > 0
              ? `${listId}-${String(picker.active)}`
              : undefined
          }
          aria-autocomplete="list"
          value={value}
          maxLength={500}
          spellCheck={false}
          autoComplete="off"
          placeholder={placeholder}
          onChange={(event) => {
            const { value: text, selectionStart } = event.target;
            quick.setValue(text, selectionStart ?? text.length);
          }}
          onKeyDown={quick.onKeyDown}
          onKeyUp={quick.syncCaret}
          onClick={quick.syncCaret}
          onScroll={(event) => {
            if (mirror.current) mirror.current.scrollLeft = event.currentTarget.scrollLeft;
          }}
          onFocus={() => {
            focus(true);
          }}
          onBlur={() => {
            focus(false);
          }}
          className={cn(
            shared,
            "bg-transparent text-transparent caret-foreground outline-none selection:bg-primary/25 placeholder:text-muted-foreground",
          )}
        />
      </div>
      {showPicker && <TokenPicker id={listId} quick={quick} />}
    </div>
  );
}

const PICKER_TITLE = { "#": "Tags", "@": "People", "~": "Projects" } as const;

/** The picker at the caret: the user's Tags, People or Projects, most recently used first. */
function TokenPicker({ id, quick: { picker } }: { id: string; quick: QuickAddState }) {
  const title = PICKER_TITLE[picker.sigil ?? "#"];
  return (
    <div className="absolute top-full left-0 z-50 mt-1.5 w-64 max-w-full overflow-hidden rounded-lg border border-border bg-surface p-1 shadow-xl">
      <p className="px-2 pt-1 pb-1.5 text-[11px] font-semibold tracking-wide text-muted-foreground uppercase">
        {title}
      </p>
      {picker.options.length === 0 && (
        <p className="px-2 py-1.5 text-sm text-muted-foreground">
          {picker.sigil === "~" ? "No project" : "Type a name"}
        </p>
      )}
      <div id={id} role="listbox" aria-label={title}>
        {picker.options.map((option, index) => (
          <button
            type="button"
            key={option.kind === "new" ? "new" : `${option.kind}-${String(option.item.id)}`}
            id={`${id}-${String(index)}`}
            role="option"
            tabIndex={-1}
            aria-selected={index === picker.active}
            // Keep focus in the input, so typing carries on after a pick.
            onMouseDown={(event) => {
              event.preventDefault();
            }}
            onMouseEnter={() => {
              picker.setActive(index);
            }}
            onClick={() => {
              picker.choose(option);
            }}
            className={cn(
              "flex w-full cursor-pointer items-center gap-2 rounded-md px-2 py-1.5 text-sm",
              index === picker.active && "bg-surface-muted",
            )}
          >
            <OptionIcon option={option} />
            <span className="flex-1 truncate">
              {option.kind === "new" ? `Create “${option.name}”` : option.item.name}
            </span>
          </button>
        ))}
      </div>
      <p className="mt-1 hidden border-t border-border px-2 pt-1.5 pb-0.5 text-[11px] text-muted-foreground lg:block">
        ↑↓ move · Enter or Tab pick · Esc keep text
      </p>
    </div>
  );
}

function OptionIcon({ option }: { option: PickerOption }) {
  switch (option.kind) {
    case "new":
      return <Plus className="size-4 text-muted-foreground" aria-hidden />;
    case "project":
      return <ProjectIcon project={option.item} className="size-4" />;
    case "person":
      return <PersonAvatar person={option.item} size="xs" />;
    case "tag":
      return <span className={cn("size-2.5 rounded-full", tagHue(option.item).bg)} aria-hidden />;
  }
}
