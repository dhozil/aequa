"use client";

import Link from "next/link";
import { ArrowUpRight, Inbox } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Skeleton } from "@/components/ui/skeleton";
import { StatusChip } from "@/components/shared/status-chip";
import { ErrorPanel } from "@/components/shared/error-panel";
import { EmptyState } from "@/components/shared/empty-state";
import { useRounds } from "@/hooks/use-contract";
import { toUiError } from "@/lib/errors";
import { formatDateShort, formatGenUnit, plural } from "@/lib/format";

export function RoundTable({ isOwner }: { isOwner: boolean }) {
  const rounds = useRounds();
  const list = [...(rounds.data ?? [])].reverse();

  return (
    <section>
      <div className="flex flex-wrap items-end justify-between gap-3 border-b border-border pb-4">
        <div>
          <p className="label">{isOwner ? "Manage rounds" : "Round list"}</p>
          <h2 className="mt-1 text-[26px] text-ink">Existing rounds</h2>
        </div>
        <span className="font-mono text-[9px] uppercase tracking-[0.12em] text-muted-foreground">
          {plural(list.length, "round")} · newest first
        </span>
      </div>

      {rounds.error ? (
        <div className="mt-4">
          <ErrorPanel
            error={toUiError(rounds.error, "Rounds could not be loaded")}
            onRetry={() => void rounds.refetch()}
          />
        </div>
      ) : rounds.isPending ? (
        <div className="mt-4 space-y-2">
          {Array.from({ length: 3 }).map((_, index) => (
            <Skeleton key={index} className="h-[74px] w-full" />
          ))}
        </div>
      ) : list.length === 0 ? (
        <div className="mt-4">
          <EmptyState
            icon={<Inbox className="size-5" />}
            title="No rounds yet"
            description="Rounds you publish will appear here. Open a round to close it and evaluate its proposals. Funders claim refunds themselves once the round is closed."
          />
        </div>
      ) : (
        <div className="mt-4 overflow-hidden rounded-lg border border-border bg-card">
          {list.map((round) => (
            <div
              key={round.id}
              className="flex flex-col gap-3 border-b border-border/70 px-4 py-4 last:border-b-0 sm:flex-row sm:items-center sm:justify-between sm:px-5"
            >
              <div className="min-w-0">
                <div className="flex flex-wrap items-center gap-2">
                  <StatusChip status={round.status} />
                  <span className="font-mono text-[9px] uppercase tracking-[0.14em] text-muted-foreground">
                    {round.id}
                  </span>
                  <span className="font-mono text-[9px] uppercase tracking-[0.1em] text-muted-foreground">
                    · {formatDateShort(round.deadlineIso)}
                  </span>
                </div>
                <Link
                  href={`/rounds/${round.id}`}
                  className="mt-1.5 inline-flex items-center gap-1.5 text-[15px] text-ink transition-colors hover:text-forest"
                >
                  <span className="line-clamp-1">{round.title}</span>
                  <ArrowUpRight className="size-3.5 shrink-0 text-muted-foreground" />
                </Link>
                <p className="mt-1 font-mono text-[9px] uppercase tracking-[0.1em] text-muted-foreground">
                  {plural(round.proposalCount, "proposal")} · available{" "}
                  {formatGenUnit(round.availableAtto, 2)} · funded{" "}
                  {formatGenUnit(round.fundedAtto, 2)}
                </p>
              </div>

              <div className="flex flex-wrap items-center gap-2">
                <Button asChild variant="ghost" size="sm">
                  <Link href={`/rounds/${round.id}`}>Open</Link>
                </Button>
                {isOwner && (
                  <Button asChild variant="outline" size="sm">
                    <Link href={`/rounds/${round.id}`}>Manage</Link>
                  </Button>
                )}
              </div>
            </div>
          ))}
        </div>
      )}
    </section>
  );
}
