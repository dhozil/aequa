import Link from "next/link";
import * as React from "react";
import { ArrowLeft } from "lucide-react";

/**
 * The one page header used by every route (rounds, proposals, admin, and the
 * explanation pages). It is rendered inside the page's `.shell` container and
 * fills its full width, so the content column never shifts when navigating
 * between pages.
 */
export function PageHeader({
  eyebrow,
  title,
  description,
  actions,
  back,
}: {
  eyebrow?: React.ReactNode;
  title: React.ReactNode;
  description?: React.ReactNode;
  actions?: React.ReactNode;
  back?: { href: string; label: string };
}) {
  return (
    <header className="border-b border-border pb-8 lg:pb-10">
      {back && (
        <Link
          href={back.href}
          className="mb-6 inline-flex items-center gap-1.5 font-mono text-[10px] uppercase tracking-[0.18em] text-muted-foreground transition-colors hover:text-foreground"
        >
          <ArrowLeft className="size-3" />
          {back.label}
        </Link>
      )}

      {eyebrow && <p className="label">{eyebrow}</p>}

      <div className="mt-5 grid gap-6 lg:grid-cols-[minmax(0,1.5fr)_minmax(0,1fr)] lg:items-end lg:gap-16">
        <h1 className="display text-[clamp(34px,4.6vw,56px)] text-ink">{title}</h1>

        {(description || actions) && (
          <div className="lg:pb-1.5">
            {description && (
              <p className="text-[15px] leading-relaxed text-muted-foreground">
                {description}
              </p>
            )}
            {actions && (
              <div className="mt-5 flex flex-wrap items-center gap-2">{actions}</div>
            )}
          </div>
        )}
      </div>
    </header>
  );
}
