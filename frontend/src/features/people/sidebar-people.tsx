import { useQuery } from "@tanstack/react-query";
import { Link } from "@tanstack/react-router";
import { Merge, Pencil, Plus, Trash2 } from "lucide-react";
import { useState } from "react";

import { DropdownMenuItem, DropdownMenuSeparator } from "@/components/ui/dropdown-menu";
import { ROW, RowMenu } from "@/features/projects/sidebar-rows";
import { cn } from "@/lib/utils";

import { PersonAvatar } from "./person-avatar";
import { DeletePersonDialog, MergePersonDialog, PersonDialog } from "./person-dialogs";
import { peopleQuery, type Person } from "./people";

type OpenDialog = { kind: "new" } | { kind: "edit" | "merge" | "delete"; person: Person } | null;

/**
 * The sidebar's People section: the user's address book A to Z, each Person a link to the
 * Tasks that mention them, with a menu to edit, merge or delete them.
 */
export function SidebarPeople({ onNavigate }: { onNavigate?: () => void }) {
  const { data: people = [] } = useQuery(peopleQuery);
  const [dialog, setDialog] = useState<OpenDialog>(null);
  const add = () => {
    setDialog({ kind: "new" });
  };

  return (
    <section aria-labelledby="people-heading" className="px-2">
      <div className="flex h-8 items-center justify-between pr-1 pl-2.5">
        <h2
          id="people-heading"
          className="text-xs font-bold tracking-wider text-muted-foreground uppercase"
        >
          People
        </h2>
        <button
          type="button"
          aria-label="Add a person"
          onClick={add}
          className="flex size-9 items-center justify-center rounded-md text-muted-foreground transition-colors hover:bg-surface-muted hover:text-foreground lg:size-7"
        >
          <Plus className="size-4" aria-hidden />
        </button>
      </div>

      {people.length === 0 ? (
        <button
          type="button"
          onClick={add}
          className="w-full rounded-md px-2.5 py-2 text-left text-sm text-muted-foreground hover:bg-surface-muted"
        >
          Mention people in tasks to track what you're waiting on.{" "}
          <span className="text-primary">Add someone</span>
        </button>
      ) : (
        <ul className="flex flex-col gap-0.5">
          {people.map((person) => (
            <li key={person.id}>
              <PersonRow
                person={person}
                onNavigate={onNavigate}
                onOpen={(kind) => {
                  setDialog({ kind, person });
                }}
              />
            </li>
          ))}
        </ul>
      )}

      <PeopleDialogs
        dialog={dialog}
        onClose={() => {
          setDialog(null);
        }}
      />
    </section>
  );
}

/** The add, edit, merge and delete dialogs, one open at a time. */
function PeopleDialogs({ dialog, onClose }: { dialog: OpenDialog; onClose: () => void }) {
  const onOpenChange = (open: boolean) => {
    if (!open) onClose();
  };
  return (
    <>
      <PersonDialog
        open={dialog?.kind === "new" || dialog?.kind === "edit"}
        onOpenChange={onOpenChange}
        person={dialog?.kind === "edit" ? dialog.person : undefined}
      />
      {dialog?.kind === "merge" && (
        <MergePersonDialog open onOpenChange={onOpenChange} person={dialog.person} />
      )}
      {dialog?.kind === "delete" && (
        <DeletePersonDialog open onOpenChange={onOpenChange} person={dialog.person} />
      )}
    </>
  );
}

function PersonRow({
  person,
  onNavigate,
  onOpen,
}: {
  person: Person;
  onNavigate?: () => void;
  onOpen: (dialog: "edit" | "merge" | "delete") => void;
}) {
  return (
    <div className={cn(ROW, "has-[a[data-status=active]]:bg-primary-soft")}>
      <Link
        to="/people/$personId"
        params={{ personId: String(person.id) }}
        onClick={onNavigate}
        className="flex min-w-0 flex-1 items-center gap-2.5 self-stretch rounded-md outline-none focus-visible:ring-2 focus-visible:ring-ring data-[status=active]:text-primary"
      >
        <PersonAvatar person={person} size="xs" />
        <span className="truncate">{person.name}</span>
      </Link>
      <RowMenu label={`${person.name} options`}>
        <DropdownMenuItem
          onSelect={() => {
            onOpen("edit");
          }}
        >
          <Pencil aria-hidden /> Edit
        </DropdownMenuItem>
        <DropdownMenuItem
          onSelect={() => {
            onOpen("merge");
          }}
        >
          <Merge aria-hidden /> Merge into…
        </DropdownMenuItem>
        <DropdownMenuSeparator />
        <DropdownMenuItem
          variant="danger"
          onSelect={() => {
            onOpen("delete");
          }}
        >
          <Trash2 aria-hidden /> Delete
        </DropdownMenuItem>
      </RowMenu>
    </div>
  );
}
