import { useId, useState, type SubmitEvent } from "react";

import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { ColorField } from "@/features/projects/color-field";
import { DialogFooter, SidebarDialog } from "@/features/projects/project-dialog";

import { tagNameProblem, useCreateTag, useUpdateTag, type SidebarTag } from "./tags";

/** Create a Tag, or rename and recolour one. A Tag with no colour shows grey. */
export function TagDialog({
  open,
  onOpenChange,
  tag,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  /** The Tag to edit; a new Tag is created when left out. */
  tag?: SidebarTag;
}) {
  return (
    <SidebarDialog open={open} onOpenChange={onOpenChange} title={tag ? "Edit tag" : "New tag"}>
      {/* Keyed by `open` so each opening starts from the Tag's current values. */}
      <TagForm
        key={String(open)}
        tag={tag}
        onDone={() => {
          onOpenChange(false);
        }}
      />
    </SidebarDialog>
  );
}

function TagForm({ tag, onDone }: { tag?: SidebarTag; onDone: () => void }) {
  const nameId = useId();
  const problemId = useId();
  const [name, setName] = useState(tag?.name ?? "");
  const [color, setColor] = useState(tag?.color ?? null);
  const create = useCreateTag();
  const update = useUpdateTag();
  const problem = tagNameProblem(name);

  function handleSubmit(event: SubmitEvent<HTMLFormElement>) {
    event.preventDefault();
    if (problem) return;
    const fields = { name: name.trim(), color };
    if (tag) {
      update.mutate({ id: tag.id, ...fields }, { onSuccess: onDone });
    } else {
      create.mutate(fields, { onSuccess: onDone });
    }
  }

  return (
    <form onSubmit={handleSubmit} className="flex min-h-0 flex-1 flex-col">
      <div className="flex min-h-0 flex-1 flex-col gap-5 overflow-y-auto px-5 pb-5">
        <div className="flex flex-col gap-1.5">
          <Label htmlFor={nameId}>Name</Label>
          <Input
            id={nameId}
            required
            maxLength={64}
            autoComplete="off"
            value={name}
            aria-invalid={problem !== null}
            aria-describedby={problem ? problemId : undefined}
            onChange={(event) => {
              setName(event.target.value);
            }}
          />
          {problem && (
            <p id={problemId} className="text-xs text-danger">
              {problem}
            </p>
          )}
        </div>

        <ColorField value={color} onChange={setColor} allowNone />
      </div>

      <DialogFooter
        pending={create.isPending || update.isPending}
        label={tag ? "Save" : "Create tag"}
      />
    </form>
  );
}
