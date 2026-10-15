import { useQuery } from "@tanstack/react-query";
import { useId, useState, type SubmitEvent } from "react";

import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { ColorField, DialogFooter, SidebarDialog } from "@/features/projects/project-dialog";
import type { PaletteColor } from "@/features/projects/projects";

import { PersonAvatar } from "./person-avatar";
import {
  peopleQuery,
  useCreatePerson,
  useDeletePerson,
  useMergePerson,
  useUpdatePerson,
  type Person,
} from "./people";

type DialogProps = { open: boolean; onOpenChange: (open: boolean) => void };

/**
 * Add a Person or edit one: their name and colour. A new Person with no colour picked gets a
 * random one from the server.
 */
export function PersonDialog({ open, onOpenChange, person }: DialogProps & { person?: Person }) {
  return (
    <SidebarDialog
      open={open}
      onOpenChange={onOpenChange}
      title={person ? "Edit person" : "New person"}
    >
      {/* Keyed by `open` so each opening starts from the Person's current values. */}
      <PersonForm
        key={String(open)}
        person={person}
        onDone={() => {
          onOpenChange(false);
        }}
      />
    </SidebarDialog>
  );
}

function PersonForm({ person, onDone }: { person?: Person; onDone: () => void }) {
  const nameId = useId();
  const [name, setName] = useState(person?.name ?? "");
  const [color, setColor] = useState<PaletteColor | null>(person?.color ?? null);
  const create = useCreatePerson();
  const update = useUpdatePerson();

  function handleSubmit(event: SubmitEvent<HTMLFormElement>) {
    event.preventDefault();
    const fields = { name, ...(color && { color }) };
    if (person) {
      update.mutate({ id: person.id, ...fields }, { onSuccess: onDone });
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
            // The characters a Mention token is written with can't be part of a name.
            pattern="[^@\[\]\(\)]+"
            title="A name can't contain @ [ ] ( )"
            autoComplete="off"
            value={name}
            onChange={(event) => {
              setName(event.target.value);
            }}
          />
        </div>
        <ColorField value={color} onChange={setColor} />
      </div>
      <DialogFooter
        pending={create.isPending || update.isPending}
        label={person ? "Save" : "Add person"}
      />
    </form>
  );
}

/** Pick another Person to fold this one into; their Mentions move over and they are deleted. */
export function MergePersonDialog({
  open,
  onOpenChange,
  person,
}: DialogProps & { person: Person }) {
  return (
    <SidebarDialog open={open} onOpenChange={onOpenChange} title={`Merge “${person.name}” into…`}>
      <MergeForm
        key={String(open)}
        person={person}
        onDone={() => {
          onOpenChange(false);
        }}
      />
    </SidebarDialog>
  );
}

function MergeForm({ person, onDone }: { person: Person; onDone: () => void }) {
  const { data: people = [] } = useQuery(peopleQuery);
  const others = people.filter((other) => other.id !== person.id);
  const [intoId, setIntoId] = useState<number | null>(null);
  const merge = useMergePerson();

  function handleSubmit(event: SubmitEvent<HTMLFormElement>) {
    event.preventDefault();
    if (intoId !== null) merge.mutate({ id: person.id, intoId }, { onSuccess: onDone });
  }

  return (
    <form onSubmit={handleSubmit} className="flex min-h-0 flex-1 flex-col">
      <fieldset className="flex min-h-0 flex-1 flex-col gap-1 overflow-y-auto px-5 pb-5">
        <legend className="mb-2 text-sm text-muted-foreground">
          Every Mention of {person.name} becomes a Mention of the person you pick, and {person.name}{" "}
          is removed.
        </legend>
        {others.length === 0 && (
          <p className="text-sm text-muted-foreground">There is nobody else to merge into.</p>
        )}
        {others.map((other) => (
          <label
            key={other.id}
            className="flex h-11 cursor-pointer items-center gap-2.5 rounded-md px-2.5 text-sm font-semibold hover:bg-surface-muted has-checked:bg-primary-soft has-focus-visible:outline-2 has-focus-visible:outline-ring lg:h-9"
          >
            <input
              type="radio"
              name="into"
              checked={intoId === other.id}
              onChange={() => {
                setIntoId(other.id);
              }}
              aria-label={other.name}
              className="sr-only"
            />
            <PersonAvatar person={other} />
            {other.name}
          </label>
        ))}
      </fieldset>
      <DialogFooter pending={merge.isPending || intoId === null} label="Merge" />
    </form>
  );
}

/** Ask before deleting a Person for good. Their Mentions stay behind as plain text. */
export function DeletePersonDialog({
  open,
  onOpenChange,
  person,
}: DialogProps & { person: Person }) {
  const remove = useDeletePerson();
  return (
    <SidebarDialog open={open} onOpenChange={onOpenChange} title={`Delete “${person.name}”?`}>
      <form
        onSubmit={(event) => {
          event.preventDefault();
          remove.mutate(person.id, {
            onSuccess: () => {
              onOpenChange(false);
            },
          });
        }}
        className="flex flex-col"
      >
        <p className="px-5 pb-5 text-sm text-muted-foreground">
          Mentions of {person.name} become plain text in your tasks. This can't be undone.
        </p>
        <DialogFooter pending={remove.isPending} label="Delete" />
      </form>
    </SidebarDialog>
  );
}
