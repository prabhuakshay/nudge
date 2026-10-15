import { LoaderCircle } from "lucide-react";
import { useId, type SubmitEvent } from "react";

import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";

import { useUpdateProfile } from "./session";

type EditNameFormProps = {
  fullName: string;
  onSuccess: () => void;
  onCancel: () => void;
};

/** Changes the name shown in the app; the email used to sign in stays the same. */
export function EditNameForm({ fullName, onSuccess, onCancel }: EditNameFormProps) {
  const updateProfile = useUpdateProfile();
  const inputId = useId();
  const errorId = useId();
  const failed = updateProfile.isError;

  function handleSubmit(event: SubmitEvent<HTMLFormElement>) {
    event.preventDefault();
    const value = new FormData(event.currentTarget).get("full_name");
    updateProfile.mutate({ full_name: typeof value === "string" ? value : "" }, { onSuccess });
  }

  return (
    <form onSubmit={handleSubmit} className="flex flex-col gap-4">
      {failed && (
        <p
          id={errorId}
          role="alert"
          className="rounded-md bg-danger-soft px-3 py-2 text-sm font-medium text-danger"
        >
          Couldn&apos;t save your name. Check your connection and try again.
        </p>
      )}
      <div className="flex flex-col gap-1.5">
        <Label htmlFor={inputId}>Full name</Label>
        <Input
          id={inputId}
          name="full_name"
          defaultValue={fullName}
          maxLength={150}
          autoComplete="name"
          aria-describedby={failed ? errorId : undefined}
        />
      </div>
      <div className="mt-1 flex justify-end gap-2">
        <Button type="button" variant="outline" onClick={onCancel}>
          Cancel
        </Button>
        <Button type="submit" disabled={updateProfile.isPending}>
          {updateProfile.isPending && <LoaderCircle className="animate-spin" aria-hidden />}
          {updateProfile.isPending ? "Saving…" : "Save"}
        </Button>
      </div>
    </form>
  );
}
