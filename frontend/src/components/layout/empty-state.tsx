import type { LucideIcon } from "lucide-react";

type EmptyStateProps = {
  icon: LucideIcon;
  title: string;
  description: string;
};

export function EmptyState({ icon: Icon, title, description }: EmptyStateProps) {
  return (
    <div className="flex flex-col items-center rounded-xl border border-dashed border-border bg-surface px-5 py-10 text-center">
      <span className="mb-3 flex size-11 items-center justify-center rounded-full bg-primary-soft text-primary">
        <Icon className="size-5" aria-hidden />
      </span>
      <h2 className="text-base font-bold">{title}</h2>
      <p className="mt-1 max-w-sm text-sm text-muted-foreground">{description}</p>
    </div>
  );
}
