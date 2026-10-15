import type { ReactNode } from "react";

type PageHeaderProps = {
  title: string;
  eyebrow?: ReactNode;
  description?: ReactNode;
};

export function PageHeader({ title, eyebrow, description }: PageHeaderProps) {
  return (
    <header className="mb-8 flex flex-col gap-1">
      {eyebrow && <p className="text-sm font-semibold text-muted-foreground">{eyebrow}</p>}
      <h1 className="text-3xl font-extrabold tracking-tight text-balance sm:text-4xl">{title}</h1>
      {description && <p className="mt-1 text-muted-foreground">{description}</p>}
    </header>
  );
}
