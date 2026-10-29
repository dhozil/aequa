"use client";

import * as React from "react";
import Link from "next/link";
import {
  ArrowUpRight,
  CalendarDays,
  Inbox,
  Landmark,
  Search,
  SlidersHorizontal,
} from "lucide-react";
import { cn } from "cn";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { PageHeader } from "@/components/page-header";
import { ErrorPanel } from "@/components/shared/error-panel";
import { EmptyState } from "@/components/shared/empty-state";
import { StatusChip } from "@/components/shared/status-chip";
import { Skeleton } from "@/components/ui/skeleton";
import { useRounds, useStats } from "@/hooks/use-contract";
import { toUiError } from "@/lib/errors";
import {
  describeDeadline,
  formatGen,
  formatGenUnit,
  percent,
  plural,
  truncate,
} from "@/lib/format";
import type { Round } from "@/lib/types";

type Filter = "all" | "open" | "closed";

function RoundCard({ round }: { round: Round }) {
  const deadline = describeDeadline(round.deadlineIso, round.status);
  const fundedRatio = percent(round.fundedAtto, round.budgetAtto);

  return (
    <Link
      href={`/rounds/${round.id}`}
      className="paper-card group relative flex flex-col overflow-hidden transition-all duration-300 hover:-translate-y-0.5 hover:shadow-[0_30px_60px_-45px_rgba(21,21,15,0.6)]"
    >
      <div className="flex items-center justify-between gap-3 border-b border-border/70 px-5 py-3">
        <div className="flex items-center gap-2">
          <StatusChip status={round.status} />
          <span className="font-mono text-[9px] uppercase tracking-[0.16em] text-muted-foreground">
            {round.id}
          </span>
        </div>
        <span
          className={cn(
            "inline-flex items-center gap-1.5 font-mono text-[9px] uppercase tracking-[0.12em]",
            round.status === "closed" || deadline.expired
              ? "text-rust"
              : deadline.urgent
                ? "text-brass"
                : "text-muted-foreground",
          )}
        >
          <CalendarDays className="size-3" />
          {round.status === "closed"
            ? "Closed"
            : deadline.expired
              ? "deadline passed"
              : deadline.label}
        </span>
      </div>

      <div className="flex flex-1 flex-col p-5 sm:p-6">
        <h2 className="font-serif text-[26px] leading-[1.12] tracking-[-0.015em] text-ink transition-colors group-hover:text-forest">
          {round.title}
        </h2>
        <p className="mt-2.5 line-clamp-2 text-[13px] leading-relaxed text-muted-foreground">
          {truncate(round.description, 190)}
        </p>

        <div className="mt-5">
          <div className="flex items-baseline justify-between">
            <span className="label">Funded</span>
            <span className="font-mono text-[10px] tabular text-foreground/70">
              {formatGen(round.fundedAtto, 2)} / {formatGen(round.budgetAtto, 2)} GEN
            </span>
          </div>
          <div className="mt-2 h-[3px] w-full overflow-hidden rounded-full bg-border">
            <div
              className="h-full rounded-full bg-forest"
              style={{ width: `${fundedRatio}%` }}
            />
          </div>
        </div>

        <dl className="mt-5 grid grid-cols-3 gap-px overflow-hidden rounded-md border border-border/70 bg-border/60">
          <div className="bg-background px-3 py-2.5">
            <dt className="font-mono text-[8px] uppercase tracking-[0.12em] text-muted-foreground">
              Available
            </dt>
            <dd className="mt-0.5 font-mono text-[11px] tabular text-ink">
              {formatGen(round.availableAtto, 2)}
            </dd>
          </div>
          <div className="bg-background px-3 py-2.5">
            <dt className="font-mono text-[8px] uppercase tracking-[0.12em] text-muted-foreground">
              Cap
            </dt>
            <dd className="mt-0.5 font-mono text-[11px] tabular text-ink">
              {formatGen(round.maxGrantAtto, 2)}
            </dd>
          </div>
          <div className="bg-background px-3 py-2.5">
            <dt className="font-mono text-[8px] uppercase tracking-[0.12em] text-muted-foreground">
              Threshold
            </dt>
            <dd className="mt-0.5 font-mono text-[11px] tabular text-ink">
              {round.minScore}/100
            </dd>
          </div>
        </dl>

        <div className="mt-auto flex items-center justify-between pt-5">
          <span className="font-mono text-[9px] uppercase tracking-[0.14em] text-muted-foreground">
            {round.proposalCount} proposal
          </span>
          <span className="inline-flex items-center gap-1 font-mono text-[9px] uppercase tracking-[0.14em] text-forest">
            View round
            <ArrowUpRight className="size-3 transition-transform group-hover:translate-x-0.5 group-hover:-translate-y-0.5" />
          </span>
        </div>
      </div>
    </Link>
  );
}

function RoundSkeleton() {
  return (
    <div className="paper-card overflow-hidden">
      <div className="flex items-center justify-between border-b border-border/70 px-5 py-3">
        <Skeleton className="h-4 w-24" />
        <Skeleton className="h-3 w-16" />
      </div>
      <div className="space-y-3 p-6">
        <Skeleton className="h-7 w-3/4" />
        <Skeleton className="h-3 w-full" />
        <Skeleton className="h-3 w-5/6" />
        <div className="pt-4">
          <Skeleton className="h-[3px] w-full" />
        </div>
        <div className="grid grid-cols-3 gap-2 pt-2">
          <Skeleton className="h-12" />
          <Skeleton className="h-12" />
          <Skeleton className="h-12" />
        </div>
      </div>
    </div>
  );
}

export function RoundsList() {
  const { data, isPending, error, refetch, isFetching } = useRounds();
  const stats = useStats();
  const [filter, setFilter] = React.useState<Filter>("all");
  const [query, setQuery] = React.useState("");

  const rounds = React.useMemo(() => {
    const list = [...(data ?? [])].reverse();
    const needle = query.trim().toLowerCase();
    return list.filter((round) => {
      if (filter !== "all" && round.status !== filter) return false;
      if (!needle) return true;
      return (
        round.title.toLowerCase().includes(needle) ||
        round.id.toLowerCase().includes(needle) ||
        round.description.toLowerCase().includes(needle)
      );
    });
  }, [data, filter, query]);

  const counts = React.useMemo(() => {
    const list = data ?? [];
    return {
      all: list.length,
      open: list.filter((round) => round.status === "open").length,
      closed: list.filter((round) => round.status === "closed").length,
    };
  }, [data]);

  const filters: Array<{ key: Filter; label: string; count: number }> = [
    { key: "all", label: "All", count: counts.all },
    { key: "open", label: "Open", count: counts.open },
    { key: "closed", label: "Closed", count: counts.closed },
  ];

  return (
    <div className="shell py-12 sm:py-16">
      <PageHeader
        eyebrow="Round archive"
        title={
          <>
            Find the rounds that are
            <br className="hidden sm:block" /> currently running.
          </>
        }
        description="Every round has its own public rubric, on-chain budget, and deadline. Read the criteria before submitting a proposal — scoring looks at evidence, not intent."
        actions={
          <Button asChild variant="outline">
            <Link href="/admin">
              <Landmark className="size-3.5" />
              Owner panel
            </Link>
          </Button>
        }
      />

      <div className="mt-8 grid grid-cols-2 gap-px overflow-hidden rounded-lg border border-border bg-border/70 sm:grid-cols-4">
        {[
          { label: "Total rounds", value: String(counts.all) },
          { label: "Open rounds", value: String(counts.open) },
          {
            label: "Total funded",
            value: formatGenUnit(stats.data?.totalFundedAtto ?? 0n, 2),
          },
          {
            label: "Total paid out",
            value: formatGenUnit(stats.data?.totalPaidAtto ?? 0n, 2),
          },
        ].map((item) => (
          <div key={item.label} className="bg-card px-4 py-3.5">
            <p className="label">{item.label}</p>
            <p className="mt-1.5 font-mono text-[15px] tabular text-ink">{item.value}</p>
          </div>
        ))}
      </div>

      <div className="mt-8 flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
        <div className="flex flex-wrap items-center gap-1.5">
          <SlidersHorizontal className="mr-1 size-3.5 text-muted-foreground" />
          {filters.map((item) => (
            <button
              key={item.key}
              type="button"
              onClick={() => setFilter(item.key)}
              className={cn(
                "inline-flex items-center gap-1.5 rounded-full border px-3 py-1.5 font-mono text-[10px] uppercase tracking-[0.12em] transition-colors",
                filter === item.key
                  ? "border-forest bg-forest text-paper"
                  : "border-border bg-card text-muted-foreground hover:border-forest/30 hover:text-ink",
              )}
            >
              {item.label}
              <span
                className={cn(
                  "tabular",
                  filter === item.key ? "text-paper/70" : "text-muted-foreground/70",
                )}
              >
                {item.count}
              </span>
            </button>
          ))}
        </div>

        <div className="relative w-full sm:w-72">
          <Search className="pointer-events-none absolute left-3 top-1/2 size-3.5 -translate-y-1/2 text-muted-foreground" />
          <Input
            value={query}
            onChange={(event) => setQuery(event.target.value)}
            placeholder="Search round title or id…"
            className="h-10 bg-card pl-9"
            aria-label="Search rounds"
          />
        </div>
      </div>

      <div className="mt-6 flex items-center justify-between">
        <p className="font-mono text-[9px] uppercase tracking-[0.14em] text-muted-foreground">
          {isPending
            ? "loading ledger…"
            : `${plural(rounds.length, "round")} shown${isFetching ? " · refreshing" : ""}`}
        </p>
        <p className="font-mono text-[9px] uppercase tracking-[0.14em] text-muted-foreground">
          newest first
        </p>
      </div>

      {error ? (
        <div className="mt-4">
          <ErrorPanel
            error={toUiError(error, "Rounds could not be loaded")}
            title="Round ledger could not be read"
            onRetry={() => void refetch()}
          />
        </div>
      ) : isPending ? (
        <div className="mt-4 grid gap-4 md:grid-cols-2">
          {Array.from({ length: 4 }).map((_, index) => (
            <RoundSkeleton key={index} />
          ))}
        </div>
      ) : rounds.length === 0 ? (
        <div className="mt-4">
          {data && data.length > 0 ? (
            <EmptyState
              icon={<Inbox className="size-5" />}
              title="No rounds match this filter"
              description="Try another filter or clear the search query."
              action={
                <Button
                  variant="outline"
                  onClick={() => {
                    setFilter("all");
                    setQuery("");
                  }}
                >
                  Reset filter
                </Button>
              }
            />
          ) : (
            <EmptyState
              icon={<Inbox className="size-5" />}
              title="No rounds opened yet"
              description="The first round has not been created. The contract owner can open a new round together with its public rubric from the admin panel."
              action={
                <Button asChild variant="outline">
                  <Link href="/admin">Open owner panel</Link>
                </Button>
              }
            />
          )}
        </div>
      ) : (
        <div className="mt-4 grid gap-4 md:grid-cols-2">
          {rounds.map((round) => (
            <RoundCard key={round.id} round={round} />
          ))}
        </div>
      )}
    </div>
  );
}
