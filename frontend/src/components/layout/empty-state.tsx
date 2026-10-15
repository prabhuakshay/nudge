import type { LucideIcon } from "lucide-react";

type EmptyStateProps = {
  icon: LucideIcon;
  title: string;
  description: string;
};

export function EmptyState({ icon: Icon, title, description }: EmptyStateProps) {
  return (
    <div className="flex flex-col items-center rounded-xl border border-dashed border-border bg-surface px-6 py-14 text-center">
      <span className="mb-4 flex size-14 items-center justify-center rounded-full bg-primary-soft text-primary">
        <Icon className="size-7" aria-hidden />
      </span>
      <h2 className="text-lg font-bold">{title}</h2>
      <p className="mt-1 max-w-sm text-sm text-muted-foreground">{description}</p>
    </div>
  );
}
