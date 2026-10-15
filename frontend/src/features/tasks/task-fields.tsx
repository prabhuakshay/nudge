import { useCallback, useState } from "react";

import { AutosizeTextarea } from "@/components/ui/textarea";
import { plainMentions } from "@/features/people/mentions";
import { useWithMentions } from "@/features/people/people";
import { cn } from "@/lib/utils";

import { Markdown } from "./markdown";
import { isClosed } from "./task-properties";
import { useUpdateTask, type TaskDetail } from "./tasks";

/**
 * The title as a borderless field that grows with it. Saves on blur or Enter, like TickTick.
 * Mentions read as `@Name` while editing, as in every text field of a Task.
 */
export function TitleField({ task, className }: { task: TaskDetail; className?: string }) {
  const { mutate: update } = useUpdateTask();
  const withMentions = useWithMentions();
  return (
    <AutosizeTextarea
      // A new key whenever the saved title changes resets the field to it.
      key={`${String(task.id)}-${task.title}`}
      aria-label="Title"
      defaultValue={plainMentions(task.title)}
      rows={1}
      maxLength={500}
      onKeyDown={(event) => {
        if (event.key === "Enter") {
          event.preventDefault();
          event.currentTarget.blur();
        }
      }}
      onBlur={(event) => {
        const title = withMentions(event.currentTarget.value.trim());
        if (!title) {
          event.currentTarget.value = plainMentions(task.title);
        } else if (title !== task.title) {
          update({ id: task.id, title });
        }
      }}
      className={cn(
        "min-h-0 rounded-none border-0 bg-transparent p-0 text-xl leading-snug font-bold shadow-none focus-visible:outline-none sm:text-xl",
        isClosed(task.status) && "text-muted-foreground line-through decoration-2",
        className,
      )}
    />
  );
}

/** The Description as rendered markdown that turns into a plain-text editor when clicked. */
export function DescriptionField({ task }: { task: TaskDetail }) {
  const { mutate: update } = useUpdateTask();
  const withMentions = useWithMentions();
  const [editing, setEditing] = useState(false);
  const focus = useCallback((element: HTMLTextAreaElement | null) => {
    element?.focus();
  }, []);

  if (editing || !task.description) {
    return (
      <AutosizeTextarea
        key={task.id}
        ref={editing ? focus : undefined}
        aria-label="Description"
        defaultValue={plainMentions(task.description)}
        placeholder="Add a description… (markdown works)"
        rows={2}
        onBlur={(event) => {
          setEditing(false);
          const description = withMentions(event.currentTarget.value);
          if (description !== task.description) {
            update({ id: task.id, description });
          }
        }}
        className="min-h-10 rounded-none border-0 bg-transparent p-0 leading-relaxed shadow-none focus-visible:outline-none"
      />
    );
  }
  return (
    // The button covers the whole preview so a click anywhere edits it, while links inside stay
    // clickable on top of it: a button can't contain links itself.
    <div className="relative min-h-10 rounded-md hover:bg-surface-muted/60">
      <button
        type="button"
        aria-label="Edit description"
        onClick={() => {
          setEditing(true);
        }}
        className="absolute inset-0 cursor-text rounded-md focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ring"
      />
      <Markdown
        text={task.description}
        className="pointer-events-none relative [&_a]:pointer-events-auto"
      />
    </div>
  );
}
