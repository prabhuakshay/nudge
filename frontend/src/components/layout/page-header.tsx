import type { ReactNode } from "react";

type PageHeaderProps = {
  title: string;
  description?: ReactNode;
};

export function PageHeader({ title, description }: PageHeaderProps) {
  return (
    <header className="mb-5 flex flex-col gap-1">
      <h1 className="text-2xl font-extrabold tracking-tight text-balance sm:text-3xl">{title}</h1>
      {description && <p className="text-sm text-muted-foreground">{description}</p>}
    </header>
  );
}
