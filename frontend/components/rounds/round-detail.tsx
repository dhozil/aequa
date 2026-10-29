"use client";

import * as React from "react";
import Link from "next/link";
import {
  AlertTriangle,
  ArrowRight,
  ArrowUpRight,
  CalendarDays,
  Coins,
  FilePlus2,
  Inbox,
  Landmark,
  Scale,
  Users,
  Wallet,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { Skeleton } from "@/components/ui/skeleton";
import { PageHeader } from "@/components/page-header";
import { StatusChip } from "@/components/shared/status-chip";
import { ErrorPanel } from "@/components/shared/error-panel";
import { EmptyState } from "@/components/shared/empty-state";
import { RubricView } from "@/components/shared/rubric-view";
import { Address } from "@/components/shared/address";
import { ProgressLine } from "@/components/shared/progress-line";
import { FundRoundDialog } from "./fund-dialog";
import { RefundClaim } from "./refund-claim";
import { RoundControls } from "./round-controls";
import { useRound, useRoundProposals, useStats } from "@/hooks/use-contract";
import { useWallet } from "@/hooks/use-wallet";
import { toUiError } from "@/lib/errors";
import {
  describeDeadline,
  formatDate,
  formatDateShort,
  formatGen,
  formatGenUnit,
  percent,
  plural,
  shortAddress,
} from "@/lib/format";
import { isUnknownResourceError } from "@/lib/types";
import type { Proposal, Round } from "@/lib/types";
import { cn } from "cn";

function TreasuryCell({
  label,
  value,
  hint,
}: {
  label: string;
  value: string;
  hint?: string;
}) {
  return (
    <div className="bg-card px-4 py-4 sm:px-5">
      <p className="label">{label}</p>
      <p className="mt-1.5 font-mono text-[17px] tabular text-ink">{value}</p>
      {hint && (
        <p className="mt-0.5 font-mono text-[9px] uppercase tracking-[0.1em] text-muted-foreground">
          {hint}
        </p>
      )}
    </div>
  );
}

function ProposalRow({ proposal }: { proposal: Proposal }) {
  return (
    <Link
      href={`/proposals/${proposal.id}`}
      className="group grid grid-cols-[1fr_auto] items-center gap-4 border-b border-border/70 px-4 py-4 transition-colors last:border-b-0 hover:bg-secondary/30 sm:px-5"
    >
      <div className="min-w-0">
        <div className="flex flex-wrap items-center gap-2">
          <span className="font-mono text-[9px] uppercase tracking-[0.14em] text-muted-foreground">
            {proposal.id}
          </span>
          <StatusChip status={proposal.status} />
        </div>
        <p className="mt-1.5 truncate text-[15px] text-ink transition-colors group-hover:text-forest">
          {proposal.title}
        </p>
        <p className="mt-1 flex flex-wrap items-center gap-x-2 gap-y-1 font-mono text-[9px] uppercase tracking-[0.1em] text-muted-foreground">
          <span>{shortAddress(proposal.applicant)}</span>
          <span className="text-border">/</span>
          <span>{formatGenUnit(proposal.requestedAtto, 2)}</span>
          <span className="text-border">/</span>
          <span>{formatDateShort(new Date(proposal.createdAt * 1000).toISOString())}</span>
        </p>
      </div>

      <div className="flex items-center gap-4">
        <div className="text-right">
          <p
            className={cn(
              "display tabular text-[28px] leading-none",
              proposal.status === "submitted"
                ? "text-muted-foreground/40"
                : proposal.decision === "approve"
                  ? "text-forest"
                  : "text-rust",
            )}
          >
            {proposal.status === "submitted" ? "—" : proposal.score}
          </p>
          <p className="mt-1 font-mono text-[8px] uppercase tracking-[0.12em] text-muted-foreground">
            {proposal.status === "submitted" ? "not scored" : "of 100"}
          </p>
        </div>
        <ArrowUpRight className="size-4 text-muted-foreground transition-colors group-hover:text-forest" />
      </div>
    </Link>
  );
}

function DetailSkeleton() {
  return (
    <div className="shell py-12 sm:py-16">
      <Skeleton className="h-3 w-24" />
      <Skeleton className="mt-6 h-10 w-2/3" />
      <Skeleton className="mt-4 h-4 w-full max-w-2xl" />
      <Skeleton className="mt-3 h-4 w-1/2" />
      <div className="mt-10 grid grid-cols-2 gap-px overflow-hidden rounded-lg border border-border bg-border/70 sm:grid-cols-4">
        {Array.from({ length: 4 }).map((_, index) => (
          <div key={index} className="bg-card p-5">
            <Skeleton className="h-2.5 w-16" />
            <Skeleton className="mt-3 h-5 w-24" />
          </div>
        ))}
      </div>
      <div className="mt-10 grid gap-8 lg:grid-cols-[1.35fr_0.65fr]">
        <div className="space-y-3">
          {Array.from({ length: 3 }).map((_, index) => (
            <Skeleton key={index} className="h-20 w-full" />
          ))}
        </div>
        <Skeleton className="h-80 w-full" />
      </div>
    </div>
  );
}

function RoundNotFound() {
  return (
    <div className="shell py-24">
      <div className="mx-auto max-w-lg text-center">
        <p className="label">404 · round</p>
        <h1 className="display mt-4 text-5xl text-ink">Round not found.</h1>
        <p className="mt-4 text-sm leading-relaxed text-muted-foreground">
          This round id does not exist in the contract. The link may be wrong, or the
          round was created on a different contract.
        </p>
        <Button asChild className="mt-6">
          <Link href="/rounds">Back to all rounds</Link>
        </Button>
      </div>
    </div>
  );
}

function RoundBody({ round }: { round: Round }) {
  const proposals = useRoundProposals(round.id);
  const stats = useStats();
  const { address } = useWallet();
  const [fundOpen, setFundOpen] = React.useState(false);

  const deadline = describeDeadline(round.deadlineIso, round.status);
  const closed = round.status === "closed";
  const accepting = !closed && !deadline.expired;
  const paused = Boolean(stats.data?.paused);
  const isOwner =
    Boolean(address) &&
    Boolean(stats.data?.owner) &&
    address?.toLowerCase() === stats.data?.owner.toLowerCase();

  const list = [...(proposals.data ?? [])].sort((a, b) => b.createdAt - a.createdAt);
  const approvedCount = list.filter(
    (p) => p.status === "approved" || p.status === "payout_pending" || p.status === "paid",
  ).length;

  return (
    <div className="shell py-12 sm:py-16">
      <PageHeader
        back={{ href: "/rounds", label: "All rounds" }}
        eyebrow={
          <span className="flex flex-wrap items-center gap-2">
            <span>{round.id}</span>
            <span className="text-border">/</span>
            <span>created by {shortAddress(round.createdBy)}</span>
          </span>
        }
        title={round.title}
        description={round.description || "This round has not added a description yet."}
        actions={
          <>
            {accepting ? (
              <Button asChild size="lg">
                <Link href={`/rounds/${round.id}/submit`}>
                  <FilePlus2 className="size-3.5" />
                  Submit proposal
                </Link>
              </Button>
            ) : (
              <Button size="lg" disabled title="This round is not accepting new proposals">
                <FilePlus2 className="size-3.5" />
                Proposals closed
              </Button>
            )}
            <Button
              size="lg"
              variant="outline"
              onClick={() => setFundOpen(true)}
              disabled={closed || paused}
            >
              <Coins className="size-3.5" />
              Fund round
            </Button>
            <RoundControls round={round} isOwner={isOwner} />
          </>
        }
      />

      {paused && (
        <div className="mt-6 flex items-start gap-2.5 rounded-lg border border-brass/30 bg-brass/[0.05] px-4 py-3">
          <AlertTriangle className="mt-0.5 size-4 shrink-0 text-brass" />
          <p className="text-xs leading-relaxed text-brass">
            The contract is paused by the owner. New proposals, funding, and evaluations
            cannot run until the contract is unpaused.
          </p>
        </div>
      )}

      {deadline.expired && !closed && (
        <div className="mt-6 flex items-start gap-2.5 rounded-lg border border-brass/30 bg-brass/[0.05] px-4 py-3">
          <CalendarDays className="mt-0.5 size-4 shrink-0 text-brass" />
          <p className="text-xs leading-relaxed text-brass">
            The submission deadline has passed. New proposals cannot come in, but funding
            and evaluation of existing proposals continue.
          </p>
        </div>
      )}

      <div className="mt-10">
        <div className="flex flex-wrap items-end justify-between gap-3">
          <div>
            <p className="label">Round treasury</p>
            <p className="mt-1 text-sm text-muted-foreground">
              Funds flowing in and out of this round.
            </p>
          </div>
          <div className="flex items-center gap-2">
            <StatusChip status={round.status} />
            <span className="font-mono text-[9px] uppercase tracking-[0.12em] text-muted-foreground">
              {closed ? "Closed" : deadline.expired ? "deadline passed" : deadline.label}
            </span>
          </div>
        </div>

        <div className="mt-4 grid grid-cols-2 gap-px overflow-hidden rounded-lg border border-border bg-border/70 sm:grid-cols-4">
          <TreasuryCell
            label="Budget"
            value={formatGenUnit(round.budgetAtto, 2)}
            hint="planned"
          />
          <TreasuryCell
            label="Funded"
            value={formatGenUnit(round.fundedAtto, 2)}
            hint={`${percent(round.fundedAtto, round.budgetAtto)}% of budget`}
          />
          <TreasuryCell
            label="Available"
            value={formatGenUnit(round.availableAtto, 2)}
            hint="not yet allocated"
          />
          <TreasuryCell
            label="Paid out"
            value={formatGenUnit(round.paidAtto, 2)}
            hint={`${plural(approvedCount, "proposal")} passed`}
          />
        </div>

        <div className="mt-3 rounded-lg border border-border bg-card px-4 py-3">
          <div className="flex flex-wrap items-center justify-between gap-2">
            <span className="font-mono text-[9px] uppercase tracking-[0.12em] text-muted-foreground">
              funding progress
            </span>
            <span className="font-mono text-[10px] tabular text-foreground/70">
              {formatGen(round.fundedAtto, 2)} / {formatGen(round.budgetAtto, 2)} GEN
            </span>
          </div>
          <ProgressLine
            className="mt-2"
            value={round.fundedAtto}
            max={round.budgetAtto}
            height={5}
          />
          <p className="mt-2 font-mono text-[9px] uppercase tracking-[0.1em] text-muted-foreground">
            reserved {formatGenUnit(round.reservedAtto, 2)} for approved proposals
            that have not been paid out yet
            {round.refundedAtto > 0n
              ? ` · ${formatGenUnit(round.refundedAtto, 2)} already refunded to funders`
              : ""}
          </p>
        </div>

        <RefundClaim round={round} />
      </div>

      <div className="mt-12 grid items-start gap-10 lg:grid-cols-[1.35fr_0.65fr]">
        <section>
          <div className="flex flex-wrap items-end justify-between gap-3 border-b border-border pb-4">
            <div>
              <p className="label">Proposal</p>
              <h2 className="mt-1 text-[26px] text-ink">
                {proposals.isPending
                  ? "Loading submissions…"
                  : list.length > 0
                    ? plural(list.length, "submission")
                    : "No submissions yet"}
              </h2>
            </div>
            <span className="inline-flex items-center gap-1.5 font-mono text-[9px] uppercase tracking-[0.12em] text-muted-foreground">
              <Users className="size-3" />
              {round.proposalCount} recorded on-chain
            </span>
          </div>

          {proposals.error ? (
            <div className="mt-4">
              <ErrorPanel
                error={toUiError(proposals.error, "Proposals could not be loaded")}
                onRetry={() => void proposals.refetch()}
              />
            </div>
          ) : proposals.isPending ? (
            <div className="mt-4 space-y-2">
              {Array.from({ length: 3 }).map((_, index) => (
                <Skeleton key={index} className="h-[78px] w-full" />
              ))}
            </div>
          ) : list.length === 0 ? (
            <div className="mt-4">
              <EmptyState
                icon={<Inbox className="size-5" />}
                title="No proposals yet"
                description={
                  accepting
                    ? "Be the first. Read the rubric and gates beside this list, prepare public evidence, then submit a proposal."
                    : "This round no longer accepts new proposals."
                }
                action={
                  accepting ? (
                    <Button asChild variant="outline">
                      <Link href={`/rounds/${round.id}/submit`}>
                        <FilePlus2 className="size-3.5" />
                        Submit proposal
                      </Link>
                    </Button>
                  ) : undefined
                }
              />
            </div>
          ) : (
            <div className="mt-4 overflow-hidden rounded-lg border border-border bg-card">
              {list.map((proposal) => (
                <ProposalRow key={proposal.id} proposal={proposal} />
              ))}
              <div className="flex items-center justify-between border-t border-border bg-secondary/20 px-4 py-2.5">
                <span className="font-mono text-[8px] uppercase tracking-[0.14em] text-muted-foreground">
                  click a proposal to see its evaluation
                </span>
                <ArrowRight className="size-3 text-muted-foreground" />
              </div>
            </div>
          )}
        </section>

        <aside className="space-y-5 lg:sticky lg:top-24">
          <div className="paper-card p-5">
            <div className="flex items-center justify-between gap-2 border-b border-border pb-3">
              <div className="flex items-center gap-2">
                <Scale className="size-3.5 text-forest" />
                <p className="label">Public rubric</p>
              </div>
              <span className="font-mono text-[9px] uppercase tracking-[0.12em] text-muted-foreground">
                threshold {round.minScore}
              </span>
            </div>
            <div className="pt-4">
              <RubricView rubric={round.rubric} variant="compact" />
            </div>
          </div>

          <div className="rounded-lg border border-border bg-card">
            <div className="border-b border-border px-4 py-3">
              <p className="label">Round facts</p>
            </div>
            <dl className="divide-y divide-border/70">
              {[
                {
                  icon: CalendarDays,
                  label: "Deadline",
                  value: closed ? "Closed" : deadline.expired ? "Passed" : deadline.label,
                  sub: formatDate(round.deadlineIso),
                },
                {
                  icon: Coins,
                  label: "Cap per proposal",
                  value: formatGenUnit(round.maxGrantAtto, 2),
                },
                {
                  icon: Landmark,
                  label: "Available now",
                  value: formatGenUnit(round.availableAtto, 2),
                  sub: "maximum payout right now",
                },
                {
                  icon: Wallet,
                  label: "Wallet requirement",
                  value: "1 proposal / round",
                  sub: "one address cannot submit twice",
                },
              ].map((item) => (
                <div key={item.label} className="flex items-start gap-3 px-4 py-3">
                  <item.icon className="mt-0.5 size-3.5 shrink-0 text-muted-foreground" />
                  <div className="min-w-0 flex-1">
                    <dt className="font-mono text-[8px] uppercase tracking-[0.12em] text-muted-foreground">
                      {item.label}
                    </dt>
                    <dd className="mt-0.5 text-[13px] text-ink">{item.value}</dd>
                    {item.sub && (
                      <dd className="mt-0.5 text-[10px] leading-relaxed text-muted-foreground">
                        {item.sub}
                      </dd>
                    )}
                  </div>
                </div>
              ))}
            </dl>
            <div className="border-t border-border px-4 py-3">
              <p className="label mb-1.5">Contract owner</p>
              <Address value={stats.data?.owner ?? round.createdBy} chars={4} />
            </div>
          </div>

          <div className="rounded-lg border border-forest/20 bg-forest/[0.04] p-4">
            <p className="font-mono text-[9px] uppercase tracking-[0.14em] text-forest">
              Before you submit
            </p>
            <ul className="mt-2 space-y-1.5 text-[11px] leading-relaxed text-muted-foreground">
              <li>· All evidence must be https and publicly accessible.</li>
              <li>· The score comes from criteria weights, not proposal length.</li>
              <li>· One failed gate means the proposal is rejected.</li>
              <li>· AI evaluation can take 1–3 minutes.</li>
            </ul>
          </div>
        </aside>
      </div>

      <FundRoundDialog round={round} open={fundOpen} onOpenChange={setFundOpen} />
    </div>
  );
}

export function RoundDetail({ roundId }: { roundId: string }) {
  const round = useRound(roundId);

  if (round.isPending) return <DetailSkeleton />;

  if (round.error && !round.data) {
    if (isUnknownResourceError(round.error)) return <RoundNotFound />;
    return (
      <div className="shell py-16">
        <PageHeader
          back={{ href: "/rounds", label: "All rounds" }}
          eyebrow="Round"
          title="Round could not be loaded"
          description="The ledger did not return data. Try again without sending any transaction."
        />
        <div className="mt-6">
          <ErrorPanel
            error={toUiError(round.error, "Round could not be loaded")}
            onRetry={() => void round.refetch()}
          />
        </div>
      </div>
    );
  }

  if (!round.data) return <RoundNotFound />;

  return <RoundBody round={round.data} />;
}
