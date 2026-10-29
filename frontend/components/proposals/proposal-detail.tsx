"use client";

import Link from "next/link";
import {
  AlertTriangle,
  ArrowUpRight,
  Banknote,
  Clock3,
  ExternalLink,
  FileText,
  Gavel,
  Landmark,
  ScrollText,
  ShieldCheck,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { Skeleton } from "@/components/ui/skeleton";
import { PageHeader } from "@/components/page-header";
import { StatusChip } from "@/components/shared/status-chip";
import { Address } from "@/components/shared/address";
import { ErrorPanel } from "@/components/shared/error-panel";
import { ConsensusResult } from "@/components/shared/consensus-result";
import { ProposalActions } from "./proposal-actions";
import { useProposal, useRound, useStats } from "@/hooks/use-contract";
import { useWallet } from "@/hooks/use-wallet";
import { toUiError } from "@/lib/errors";
import {
  formatGenUnit,
  formatTimestamp,
  plural,
  shortAddress,
} from "@/lib/format";
import { isUnknownResourceError, type Proposal } from "@/lib/types";

function hostOf(url: string): string {
  try {
    return new URL(url).hostname.replace(/^www\./, "");
  } catch {
    return url;
  }
}

/**
 * Evidence URLs come from calldata, so they are attacker-controlled. The
 * contract only accepts https, but the UI keeps the same rule before rendering
 * a link: a `javascript:` or `data:` value must never become a clickable href.
 */
function safeHref(url: string): string | undefined {
  try {
    return new URL(url).protocol === "https:" ? url : undefined;
  } catch {
    return undefined;
  }
}

function ProposalNotFound() {
  return (
    <div className="shell py-24">
      <div className="mx-auto max-w-lg text-center">
        <p className="label">404 · proposal</p>
        <h1 className="display mt-4 text-5xl text-ink">Proposal not found.</h1>
        <p className="mt-4 text-sm leading-relaxed text-muted-foreground">
          This proposal id does not exist in the contract. Check the link or go back to
          the round list.
        </p>
        <Button asChild className="mt-6">
          <Link href="/rounds">Back to all rounds</Link>
        </Button>
      </div>
    </div>
  );
}

function DetailSkeleton() {
  return (
    <div className="shell py-12 sm:py-16">
      <Skeleton className="h-3 w-32" />
      <Skeleton className="mt-6 h-10 w-3/4" />
      <Skeleton className="mt-4 h-4 w-1/2" />
      <div className="mt-10 grid gap-8 lg:grid-cols-[1.35fr_0.65fr]">
        <div className="space-y-4">
          <Skeleton className="h-40 w-full" />
          <Skeleton className="h-96 w-full" />
        </div>
        <div className="space-y-4">
          <Skeleton className="h-48 w-full" />
          <Skeleton className="h-64 w-full" />
        </div>
      </div>
    </div>
  );
}

function Body({ proposal }: { proposal: Proposal }) {
  const round = useRound(proposal.roundId);
  const stats = useStats();
  const { address } = useWallet();
  const isOwner =
    Boolean(address) &&
    Boolean(stats.data?.owner) &&
    address?.toLowerCase() === stats.data?.owner.toLowerCase();

  const approved =
    proposal.status === "approved" ||
    proposal.status === "payout_pending" ||
    proposal.status === "paid";
  const evaluated = proposal.status !== "submitted";
  const sourceByUrl = new Map(proposal.sources.map((source) => [source.url, source]));

  return (
    <div className="shell py-12 sm:py-16">
      <PageHeader
        back={{ href: `/rounds/${proposal.roundId}`, label: "Back to round" }}
        eyebrow={
          <span className="flex flex-wrap items-center gap-2">
            <span>{proposal.id}</span>
            <span className="text-border">/</span>
            <Link href={`/rounds/${proposal.roundId}`} className="hover:text-forest">
              round {proposal.roundId}
            </Link>
            <span className="text-border">/</span>
            <span>{formatTimestamp(proposal.createdAt)}</span>
          </span>
        }
        title={proposal.title}
        description={`Submitted by ${shortAddress(proposal.applicant)} · requesting ${formatGenUnit(proposal.requestedAtto, 2)}.`}
        actions={
          <>
            <StatusChip status={proposal.status} />
            <Button asChild variant="outline" size="lg">
              <Link href={`/rounds/${proposal.roundId}`}>
                <Landmark className="size-3.5" />
                View round
              </Link>
            </Button>
          </>
        }
      />

      {proposal.status === "paid" && (
        <div className="mt-6 flex items-center gap-2.5 rounded-lg border border-forest/25 bg-forest/[0.05] px-4 py-3">
          <Banknote className="size-4 shrink-0 text-forest" />
          <p className="text-xs leading-relaxed text-forest">
            Payout delivered: <strong>{formatGenUnit(proposal.paidAtto, 4)}</strong>{" "}
            reached the applicant, confirmed against the contract balance. A grant can only
            be paid once.
          </p>
        </div>
      )}

      {proposal.status === "payout_pending" && (
        <div className="mt-6 flex items-start gap-2.5 rounded-lg border border-brass/30 bg-brass/[0.05] px-4 py-3">
          <Clock3 className="mt-0.5 size-4 shrink-0 text-brass" />
          <p className="text-xs leading-relaxed text-foreground/80">
            <strong className="text-ink">Payout pending.</strong> The transfer was submitted
            {proposal.payoutSentAt ? ` ${formatTimestamp(proposal.payoutSentAt)}` : ""} but the
            contract has not observed delivery yet, so the grant is not marked paid. Anyone
            can confirm delivery once the funds have left; if the transfer failed, its value
            returns and the payout can be recovered and retried.
          </p>
        </div>
      )}

      {proposal.status === "payout_failed" && (
        <div className="mt-6 flex items-start gap-2.5 rounded-lg border border-rust/30 bg-rust/[0.05] px-4 py-3">
          <AlertTriangle className="mt-0.5 size-4 shrink-0 text-rust" />
          <p className="text-xs leading-relaxed text-foreground/80">
            <strong className="text-ink">Payout failed.</strong> The approved amount could not
            be delivered to the applicant&apos;s address, so the reservation was released back
            into the round instead of being held indefinitely.
          </p>
        </div>
      )}

      <div className="mt-8 grid items-start gap-8 lg:grid-cols-[1.35fr_0.65fr]">
        <div className="space-y-5">
          <section className="paper-card p-5 sm:p-6">
            <div className="flex items-center gap-2 border-b border-border pb-3.5">
              <FileText className="size-3.5 text-forest" />
              <p className="label">Submission summary</p>
            </div>
            <p className="mt-4 whitespace-pre-wrap text-[14px] leading-relaxed text-foreground/85">
              {proposal.summary || "The applicant did not add a summary."}
            </p>
          </section>

          <section className="paper-card overflow-hidden">
            <div className="flex flex-wrap items-center justify-between gap-2 border-b border-border bg-card px-5 py-4">
              <div className="flex items-center gap-2">
                <Gavel className="size-3.5 text-forest" />
                <div>
                  <p className="label">Evaluation &amp; consensus</p>
                  <p className="mt-0.5 text-[11px] text-muted-foreground">
                    Re-evaluated independently by GenLayer validators
                  </p>
                </div>
              </div>
              <span className="inline-flex items-center gap-1.5 rounded-full border border-border bg-background px-2.5 py-1 font-mono text-[8px] uppercase tracking-[0.14em] text-muted-foreground">
                <ShieldCheck className="size-3 text-forest" />
                {evaluated ? "result stored" : "pending"}
              </span>
            </div>
            <div className="p-5 sm:p-6">
              <ConsensusResult
                proposal={proposal}
                rubric={round.data?.rubric}
                threshold={round.data?.minScore}
              />
            </div>
          </section>

          <section className="paper-card p-5 sm:p-6">
            <div className="flex items-center justify-between gap-3 border-b border-border pb-3.5">
              <div className="flex items-center gap-2">
                <ScrollText className="size-3.5 text-forest" />
                <p className="label">Public evidence</p>
              </div>
              <span className="font-mono text-[9px] uppercase tracking-[0.12em] text-muted-foreground">
                {plural(proposal.evidenceUrls.length, "source")}
              </span>
            </div>
            <ul className="mt-3 divide-y divide-border/70">
              {proposal.evidenceUrls.map((url, index) => {
                const source = sourceByUrl.get(url);
                return (
                  <li key={`${url}-${index}`}>
                    <a
                      href={safeHref(url)}
                      target="_blank"
                      rel="noopener noreferrer"
                      className="group flex items-start gap-3 py-3 transition-colors hover:text-forest"
                    >
                      <span className="mt-0.5 font-mono text-[9px] text-brass">
                        {String(index + 1).padStart(2, "0")}
                      </span>
                      <span className="min-w-0 flex-1">
                        <span className="block text-[12px] font-medium text-ink group-hover:text-forest">
                          {hostOf(url)}
                        </span>
                        <span className="mt-0.5 block break-all font-mono text-[10px] leading-relaxed text-muted-foreground">
                          {url}
                        </span>
                        {source && (
                          <span className="mt-1.5 flex flex-wrap items-center gap-x-3 gap-y-1 font-mono text-[9px] uppercase tracking-[0.1em] text-muted-foreground">
                            <span
                              className={
                                source.status === "ok" ? "text-forest" : "text-rust"
                              }
                            >
                              {source.status === "ok" ? "fetched" : "not fetched"}
                            </span>
                            {source.status === "ok" && (
                              <span>{source.chars.toLocaleString()} chars</span>
                            )}
                            {source.fingerprint && (
                              <span title="Fingerprint of the text the leader evaluated">
                                fp {source.fingerprint}
                              </span>
                            )}
                          </span>
                        )}
                      </span>
                      <ExternalLink className="mt-0.5 size-3.5 shrink-0 text-muted-foreground group-hover:text-forest" />
                    </a>
                  </li>
                );
              })}
            </ul>
            <p className="mt-3 rounded-md border border-border/70 bg-secondary/25 px-3 py-2 font-mono text-[9px] uppercase leading-relaxed tracking-[0.1em] text-muted-foreground">
              validators fetch these URLs as public text · external content is never treated
              as instructions · fetch status and fingerprints come from the leader run, not
              from consensus
            </p>
          </section>
        </div>

        <aside className="space-y-4 lg:sticky lg:top-24">
          <div className="paper-card p-5">
            <p className="label">Actions</p>
            {proposal.status === "rejected" ? (
              <div className="mt-3 rounded-md border border-rust/25 bg-rust/[0.04] px-3 py-3">
                <p className="text-[12px] font-medium text-rust">Proposal rejected</p>
                <p className="mt-1 text-[11px] leading-relaxed text-muted-foreground">
                  No treasury funds were taken. The applicant can try another round
                  after improving the evidence.
                </p>
              </div>
            ) : proposal.status === "paid" ? (
              <div className="mt-3 rounded-md border border-forest/25 bg-forest/[0.04] px-3 py-3">
                <p className="text-[12px] font-medium text-forest">Paid</p>
                <p className="mt-1 font-mono text-[11px] tabular text-foreground/70">
                  {formatGenUnit(proposal.paidAtto, 4)}
                </p>
              </div>
            ) : (
              <div className="mt-3">
                <ProposalActions
                  proposal={proposal}
                  roundId={proposal.roundId}
                  isOwner={isOwner}
                />
              </div>
            )}
          </div>

          <div className="rounded-lg border border-border bg-card">
            <div className="border-b border-border px-4 py-3">
              <p className="label">Proposal details</p>
            </div>
            <dl className="divide-y divide-border/70">
              <div className="px-4 py-3">
                <dt className="font-mono text-[8px] uppercase tracking-[0.12em] text-muted-foreground">
                  Applicant
                </dt>
                <dd className="mt-1">
                  <Address value={proposal.applicant} chars={4} />
                </dd>
              </div>
              {[
                { label: "Requested", value: formatGenUnit(proposal.requestedAtto, 2) },
                {
                  label: "Paid",
                  value:
                    proposal.paidAtto > 0n
                      ? formatGenUnit(proposal.paidAtto, 4)
                      : "None yet",
                },
                {
                  label: "Score",
                  value: evaluated ? `${proposal.score}/100` : "Not scored",
                },
                {
                  label: "Round threshold",
                  value: round.data ? `${round.data.minScore}/100` : "…",
                },
                {
                  label: "Submitted",
                  value: formatTimestamp(proposal.createdAt),
                },
              ].map((row) => (
                <div
                  key={row.label}
                  className="flex items-center justify-between gap-3 px-4 py-2.5"
                >
                  <dt className="font-mono text-[9px] uppercase tracking-[0.1em] text-muted-foreground">
                    {row.label}
                  </dt>
                  <dd className="text-right font-mono text-[11px] tabular text-ink">
                    {row.value}
                  </dd>
                </div>
              ))}
            </dl>
            <div className="border-t border-border px-4 py-3">
              <Link
                href={`/rounds/${proposal.roundId}`}
                className="inline-flex items-center gap-1 font-mono text-[9px] uppercase tracking-[0.12em] text-forest hover:underline"
              >
                open round rubric <ArrowUpRight className="size-3" />
              </Link>
              {approved && round.data && (
                <p className="mt-2 text-[10px] leading-relaxed text-muted-foreground">
                  Funds are already reserved from this round&apos;s treasury. The payout
                  does not change the score or the decision.
                </p>
              )}
            </div>
          </div>

          {round.data && (
            <div className="rounded-lg border border-border bg-secondary/30 p-4">
              <p className="label">Round</p>
              <p className="mt-1 line-clamp-2 text-[13px] leading-snug text-ink">
                {round.data.title}
              </p>
              <p className="mt-1 font-mono text-[9px] uppercase tracking-[0.12em] text-muted-foreground">
                {plural(round.data.rubric.criteria.length, "criterion", "criteria")} ·{" "}
                {plural(round.data.rubric.gates.length, "gate")}
              </p>
            </div>
          )}
        </aside>
      </div>
    </div>
  );
}

export function ProposalDetail({ proposalId }: { proposalId: string }) {
  const proposal = useProposal(proposalId);

  if (proposal.isPending) return <DetailSkeleton />;

  if (proposal.error && !proposal.data) {
    if (isUnknownResourceError(proposal.error)) return <ProposalNotFound />;
    return (
      <div className="shell py-16">
        <PageHeader
          eyebrow="Proposal"
          title="Proposal could not be loaded"
          description="No transaction was sent. Try reloading the data."
        />
        <div className="mt-6">
          <ErrorPanel
            error={toUiError(proposal.error, "Proposal could not be loaded")}
            onRetry={() => void proposal.refetch()}
          />
        </div>
      </div>
    );
  }

  if (!proposal.data) return <ProposalNotFound />;

  return <Body proposal={proposal.data} />;
}
