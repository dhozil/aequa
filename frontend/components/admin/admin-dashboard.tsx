"use client";

import Link from "next/link";
import {
  AlertTriangle,
  ArrowUpRight,
  Landmark,
  Lock,
  ShieldAlert,
  Wallet,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { Skeleton } from "@/components/ui/skeleton";
import { PageHeader } from "@/components/page-header";
import { ErrorPanel } from "@/components/shared/error-panel";
import { Address, CopyButton } from "@/components/shared/address";
import { WalletButton } from "@/components/wallet/wallet-button";
import { PauseControl } from "./pause-control";
import { CreateRoundForm } from "./create-round-form";
import { RoundTable } from "./round-table";
import { useStats } from "@/hooks/use-contract";
import { useWallet } from "@/hooks/use-wallet";
import { toUiError } from "@/lib/errors";
import { CONTRACT_ADDRESS, EXPLORER_URL } from "@/lib/config";
import { formatGen, formatGenUnit, shortAddress } from "@/lib/format";
import { cn } from "cn";

function StatCell({
  label,
  value,
  hint,
  loading,
}: {
  label: string;
  value: string;
  hint?: string;
  loading?: boolean;
}) {
  return (
    <div className="bg-card px-4 py-4">
      <p className="label">{label}</p>
      {loading ? (
        <Skeleton className="mt-2 h-5 w-20" />
      ) : (
        <p className="mt-1.5 font-mono text-[15px] tabular text-ink">{value}</p>
      )}
      {hint && (
        <p className="mt-0.5 font-mono text-[8px] uppercase tracking-[0.1em] text-muted-foreground">
          {hint}
        </p>
      )}
    </div>
  );
}

function ConnectCard() {
  return (
    <div className="paper-card overflow-hidden">
      <div className="grid gap-6 p-6 sm:grid-cols-[1fr_auto] sm:items-center sm:p-8">
        <div>
          <span className="grid size-10 place-items-center rounded-full border border-border bg-secondary/40 text-forest">
            <Wallet className="size-4" />
          </span>
          <p className="label mt-5">Owner access</p>
          <h2 className="mt-1.5 text-[26px] text-ink">Connect the owner wallet.</h2>
          <p className="mt-2 max-w-xl text-[13px] leading-relaxed text-muted-foreground">
            This panel is used to publish rounds and pause the contract. Leftover funds are
            never withdrawn by the owner: each funder claims its own pro-rata share after the
            round closes. An applicant wallet cannot run owner actions, but contract data can
            still be read without a wallet.
          </p>
        </div>
        <div className="flex flex-col gap-2 sm:w-56">
          <WalletButton fullWidth />
          <Button asChild variant="outline" size="lg" className="w-full">
            <Link href="/rounds">View public rounds</Link>
          </Button>
        </div>
      </div>
      <div className="flex flex-wrap items-center justify-between gap-2 border-t border-border bg-secondary/25 px-6 py-3">
        <span className="font-mono text-[9px] uppercase tracking-[0.12em] text-muted-foreground">
          contract {shortAddress(CONTRACT_ADDRESS, 5)}
        </span>
        <Link
          href={`${EXPLORER_URL}/address/${CONTRACT_ADDRESS}`}
          target="_blank"
          rel="noreferrer"
          className="inline-flex items-center gap-1 font-mono text-[9px] uppercase tracking-[0.12em] text-forest hover:underline"
        >
          explorer <ArrowUpRight className="size-3" />
        </Link>
      </div>
    </div>
  );
}

function NotOwnerCard({ owner }: { owner: string }) {
  return (
    <div className="rounded-lg border border-brass/30 bg-brass/[0.04] p-5 sm:p-6">
      <div className="flex items-start gap-3">
        <span className="mt-0.5 grid size-8 shrink-0 place-items-center rounded-full border border-brass/30 bg-brass/10 text-brass">
          <ShieldAlert className="size-4" />
        </span>
        <div className="min-w-0">
          <p className="text-sm font-medium text-ink">This wallet is not the contract owner</p>
          <p className="mt-1 max-w-2xl text-[12px] leading-relaxed text-muted-foreground">
            Admin actions are only available to the owner. You can still view
            statistics, open rounds, and monitor proposals.
          </p>
          <div className="mt-2 flex flex-wrap items-center gap-3">
            <span className="font-mono text-[9px] uppercase tracking-[0.12em] text-muted-foreground">
              owner
            </span>
            <Address value={owner} chars={5} />
            <CopyButton value={owner} label="Copy" />
          </div>
        </div>
      </div>
    </div>
  );
}

export function AdminDashboard() {
  const stats = useStats();
  const { address, hasProvider, ready } = useWallet();

  const isOwner =
    Boolean(address) &&
    Boolean(stats.data?.owner) &&
    address?.toLowerCase() === stats.data?.owner?.toLowerCase();

  const paused = Boolean(stats.data?.paused);

  return (
    <div className="shell py-12 sm:py-16">
      <PageHeader
        eyebrow="Owner console"
        title={
          <span className="inline-flex flex-wrap items-center gap-3">
            Owner panel
            <span className="font-mono text-[10px] uppercase tracking-[0.2em] text-muted-foreground">
              {paused ? "paused" : "active"}
            </span>
          </span>
        }
        description="Publish rounds with a public rubric, set budget limits, and manage leftover funds. Every action here is an on-chain transaction."
        actions={
          <Button asChild variant="outline">
            <Link href="/rounds">
              <Landmark className="size-3.5" />
              Public rounds
            </Link>
          </Button>
        }
      />

      {stats.error && (
        <div className="mt-6">
          <ErrorPanel
            error={toUiError(stats.error, "Contract statistics could not be loaded")}
            onRetry={() => void stats.refetch()}
            compact
          />
        </div>
      )}

      <div className="mt-8 grid grid-cols-2 gap-px overflow-hidden rounded-lg border border-border bg-border/70 sm:grid-cols-3 lg:grid-cols-6">
        <StatCell
          label="Contract balance"
          value={stats.error ? "—" : formatGenUnit(stats.data?.balanceAtto ?? 0n, 2)}
          loading={stats.isPending}
        />
        <StatCell
          label="Total funded"
          value={stats.error ? "—" : formatGenUnit(stats.data?.totalFundedAtto ?? 0n, 2)}
          loading={stats.isPending}
        />
        <StatCell
          label="Reserved"
          value={stats.error ? "—" : formatGenUnit(stats.data?.totalReservedAtto ?? 0n, 2)}
          loading={stats.isPending}
        />
        <StatCell
          label="Paid"
          value={stats.error ? "—" : formatGenUnit(stats.data?.totalPaidAtto ?? 0n, 2)}
          loading={stats.isPending}
        />
        <StatCell
          label="Round"
          value={stats.error ? "—" : String(stats.data?.roundCount ?? 0)}
          hint="total"
          loading={stats.isPending}
        />
        <StatCell
          label="Proposal"
          value={stats.error ? "—" : String(stats.data?.proposalCount ?? 0)}
          hint="total"
          loading={stats.isPending}
        />
      </div>

      {paused && isOwner && (
        <div className="mt-5 flex items-start gap-2.5 rounded-lg border border-brass/30 bg-brass/[0.05] px-4 py-3">
          <AlertTriangle className="mt-0.5 size-4 shrink-0 text-brass" />
          <div>
            <p className="text-xs font-medium text-brass">Contract is paused</p>
            <p className="mt-0.5 text-[11px] leading-relaxed text-muted-foreground">
              All writes are rejected. Re-enable it from the controls below to accept
              proposals, funding, or evaluation.
            </p>
          </div>
        </div>
      )}

      {!ready ? (
        <div className="mt-6 space-y-4">
          <Skeleton className="h-28 w-full" />
          <Skeleton className="h-10 w-40" />
        </div>
      ) : !hasProvider || !address ? (
        <div className="mt-6">
          <ConnectCard />
        </div>
      ) : stats.isPending ? (
        <div className="mt-6 rounded-lg border border-border bg-card p-6">
          <Skeleton className="h-4 w-40" />
          <Skeleton className="mt-3 h-3 w-64" />
        </div>
      ) : !isOwner ? (
        <div className="mt-6">
          <NotOwnerCard owner={stats.data?.owner ?? ""} />
        </div>
      ) : (
        <div className="mt-6 space-y-8">
          <PauseControl paused={paused} />

          <div className="grid gap-4 sm:grid-cols-3">
            {[
              {
                label: "Public rubric",
                value: "Total weight 100",
                hint: "criteria & gates shown on the round page",
              },
              {
                label: "One proposal",
                value: "per wallet / round",
                hint: "enforced by the contract",
              },
              {
                label: "Treasury",
                value: formatGen(stats.data?.balanceAtto ?? 0n, 2) + " GEN",
                hint: "payouts and funder-claimed refunds are the only outflows",
              },
            ].map((item) => (
              <div
                key={item.label}
                className={cn(
                  "rounded-lg border border-border bg-card px-4 py-3.5",
                )}
              >
                <p className="label">{item.label}</p>
                <p className="mt-1 text-[14px] text-ink">{item.value}</p>
                <p className="mt-0.5 text-[10px] leading-relaxed text-muted-foreground">
                  {item.hint}
                </p>
              </div>
            ))}
          </div>

          <CreateRoundForm paused={paused} />
        </div>
      )}

      <div className="mt-10">
        <RoundTable isOwner={isOwner} />
      </div>

      <div className="mt-10 flex flex-wrap items-center justify-between gap-2 border-t border-border pt-5">
        <p className="inline-flex items-center gap-1.5 font-mono text-[9px] uppercase tracking-[0.12em] text-muted-foreground">
          <Lock className="size-3" />
          admin actions signed by the owner wallet
        </p>
        <div className="flex items-center gap-2 font-mono text-[9px] uppercase tracking-[0.12em] text-muted-foreground">
          <span>contract {shortAddress(CONTRACT_ADDRESS, 5)}</span>
          <CopyButton value={CONTRACT_ADDRESS} label="Copy" />
        </div>
      </div>
    </div>
  );
}
