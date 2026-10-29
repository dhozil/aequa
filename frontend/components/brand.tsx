import Link from "next/link";

/**
 * Brand mark: a blue gradient tile with an "A" whose crossbar is split,
 * so it doubles as an equals sign — "equal criteria" for every applicant.
 * Same geometry as app/icon.svg so the favicon and the UI mark match.
 */
export function BrandMark({ className = "size-10" }: { className?: string }) {
  return (
    <span
      className={`relative grid shrink-0 place-items-center overflow-hidden rounded-[12px] bg-[linear-gradient(145deg,#1e40af_0%,#2563eb_45%,#60a5fa_100%)] text-white shadow-[0_8px_18px_-8px_rgba(37,99,235,0.85),inset_0_1px_0_rgba(255,255,255,0.35)] ring-1 ring-inset ring-white/25 transition-transform duration-300 group-hover:-rotate-3 ${className}`}
      aria-hidden="true"
    >
      <svg viewBox="0 0 32 32" className="relative size-[84%]" fill="none">
        <path
          d="M7.5 25.5 16 7l8.5 18.5"
          stroke="currentColor"
          strokeWidth="2.2"
          strokeLinecap="round"
          strokeLinejoin="round"
        />
        <path
          d="M11.6 19.4h3.3M17.1 19.4h3.3"
          stroke="currentColor"
          strokeWidth="2.2"
          strokeLinecap="round"
        />
      </svg>
    </span>
  );
}

export function Brand({
  href = "/",
  compact = false,
}: {
  href?: string;
  compact?: boolean;
}) {
  return (
    <Link
      href={href}
      className="group flex items-center gap-3"
      aria-label="Aequa Grants"
    >
      <BrandMark className="size-10" />
      {!compact && (
        <span className="flex flex-col leading-none">
          <span className="font-serif text-[27px] leading-[0.9] tracking-[-0.02em] text-ink">
            aequa
          </span>
          <span className="mt-[5px] font-mono text-[9px] uppercase tracking-[0.36em] text-muted-foreground">
            grants
          </span>
        </span>
      )}
    </Link>
  );
}
