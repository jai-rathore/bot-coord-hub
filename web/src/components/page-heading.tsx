import type { ReactNode } from "react";

export function PageHeading({
  eyebrow = "Your workspace",
  title,
  description,
  action,
}: {
  eyebrow?: string;
  title: string;
  description: ReactNode;
  action?: ReactNode;
}) {
  return (
    <header className="flex flex-col gap-5 border-b border-line/80 pb-7 sm:flex-row sm:items-end sm:justify-between">
      <div>
        <p className="section-kicker">{eyebrow}</p>
        <h1 className="display-title mt-2 text-3xl sm:text-4xl">
          {title}
        </h1>
        <p className="mt-3 max-w-2xl text-sm leading-7 text-muted sm:text-base">
          {description}
        </p>
      </div>
      {action ? <div className="shrink-0">{action}</div> : null}
    </header>
  );
}
