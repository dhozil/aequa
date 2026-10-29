import Link from "next/link";
import { Brand } from "@/components/brand";
import { CopyButton } from "@/components/shared/address";
import { CONTRACT_ADDRESS, MARKETING } from "@/lib/config";

export function SiteFooter() {
  return (
    <footer className="border-t border-border bg-background">
      <div className="shell py-14">
        <div className="grid gap-10 md:grid-cols-[1.4fr_1fr_1fr]">
          <div className="min-w-0">
            <Brand />
            <p className="mt-4 max-w-sm text-sm leading-relaxed text-muted-foreground">
              Grant rounds with an open rubric. AI validators re-evaluate every proposal
              independently, and the treasury only moves when a decision passes consensus.
            </p>
            <div className="mt-5 flex min-w-0 items-center gap-2 rounded-md border border-border bg-card px-3 py-2">
              <span className="label shrink-0">Contract</span>
              <code className="min-w-0 truncate font-mono text-[11px] text-foreground/75">
                {CONTRACT_ADDRESS}
              </code>
              <CopyButton value={CONTRACT_ADDRESS} label="Copy" />
            </div>
          </div>

          <div>
            <p className="label mb-4">Product</p>
            <ul className="space-y-2.5 text-sm text-muted-foreground">
              <li>
                <Link href="/rounds" className="transition-colors hover:text-ink">
                  Round list
                </Link>
              </li>
              <li>
                <Link href="/how-it-works" className="transition-colors hover:text-ink">
                  How it works
                </Link>
              </li>
              <li>
                <Link href="/rubric" className="transition-colors hover:text-ink">
                  Rubric &amp; gates
                </Link>
              </li>
              <li>
                <Link href="/admin" className="transition-colors hover:text-ink">
                  Owner panel
                </Link>
              </li>
            </ul>
          </div>

          <div>
            <p className="label mb-4">GenLayer</p>
            <ul className="space-y-2.5 text-sm text-muted-foreground">
              <li>
                <Link
                  href={MARKETING.docs}
                  target="_blank"
                  rel="noreferrer"
                  className="transition-colors hover:text-ink"
                >
                  Documentation
                </Link>
              </li>
              <li>
                <Link
                  href={MARKETING.studio}
                  target="_blank"
                  rel="noreferrer"
                  className="transition-colors hover:text-ink"
                >
                  Studio
                </Link>
              </li>
              <li>
                <Link
                  href={MARKETING.github}
                  target="_blank"
                  rel="noreferrer"
                  className="transition-colors hover:text-ink"
                >
                  GitHub
                </Link>
              </li>
            </ul>
          </div>
        </div>

        <div className="mt-12 flex flex-col gap-3 border-t border-border pt-6 sm:flex-row sm:items-center sm:justify-between">
          <p className="font-mono text-[10px] uppercase tracking-[0.16em] text-muted-foreground">
            © Aequa Grants · AI Governance
          </p>
          <p className="font-mono text-[10px] uppercase tracking-[0.16em] text-muted-foreground">
            Studionet · chain 61999
          </p>
        </div>
      </div>
    </footer>
  );
}
