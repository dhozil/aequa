'use client'
import React from 'react'
import Link from 'next/link'
import {
  ArrowRight,
  ArrowUpRight,
  BadgeCheck,
  Copy,
  Check,
  Loader2,
  Scale,
  ShieldCheck,
} from 'lucide-react'
import { Brand } from '@/components/brand'
import { ErrorPanel } from '@/components/shared/error-panel'
import { StatusChip } from '@/components/shared/status-chip'
import { WalletButton } from '@/components/wallet/wallet-button'
import { useRounds, useStats } from '@/hooks/use-contract'
import { CONTRACT_ADDRESS, EXPLORER_URL } from '@/lib/config'
import { formatGen, percent, shortAddress } from '@/lib/format'
import { toUiError } from '@/lib/errors'
import { TimelineAnimation } from '@/components/ui/hero-financial-utils/timeline-animation'
import { GlowBars } from '@/components/ui/hero-financial-utils/assets-index'
import { useMediaQuery } from '@/components/ui/hero-financial-utils/use-media-query'
import MotionDrawer, { useDrawerClose } from '@/components/ui/hero-financial-utils/motion-drawer'

const NAV_LINKS = [
  { href: '/rounds', label: 'Rounds' },
  { href: '/how-it-works', label: 'How it works' },
  { href: '/rubric', label: 'Rubric' },
  { href: '/consensus', label: 'Consensus' },
  { href: '/admin', label: 'Admin' },
]

function CopyButton({ value }: { value: string }) {
  const [copied, setCopied] = React.useState(false)
  return (
    <button
      type="button"
      onClick={async () => {
        try {
          await navigator.clipboard.writeText(value)
          setCopied(true)
          setTimeout(() => setCopied(false), 1500)
        } catch {}
      }}
      aria-label="Copy contract address"
      className="inline-flex items-center gap-1 font-mono text-[10px] text-neutral-400 transition hover:text-[#3b82f6]"
    >
      {copied ? <Check className="size-3" /> : <Copy className="size-3" />}
      Copy
    </button>
  )
}

function Stat({
  label,
  value,
  unit,
  loading,
}: {
  label: string
  value: string
  unit?: string
  loading?: boolean
}) {
  return (
    <div className="rounded-xl bg-white border border-blue-100 shadow-sm px-4 py-5">
      <p className="font-mono text-[10px] font-medium uppercase tracking-[0.18em] text-neutral-400">
        {label}
      </p>
      {loading ? (
        <div className="mt-3 h-8 w-24 animate-pulse rounded bg-blue-50" />
      ) : (
        <p className="mt-2 flex items-baseline gap-1.5">
          <span className="text-3xl font-semibold tracking-tight text-neutral-900 tabular-nums">
            {value}
          </span>
          {unit && (
            <span className="font-mono text-[10px] uppercase tracking-[0.12em] text-neutral-400">
              {unit}
            </span>
          )}
        </p>
      )}
    </div>
  )
}

function LedgerRow({
  title,
  status,
  id,
  funded,
  budget,
  loading,
}: {
  title: string
  status: 'open' | 'closed'
  id: string
  funded: bigint
  budget: bigint
  loading?: boolean
}) {
  return (
    <Link
      href={`/rounds/${id}`}
      className="group grid grid-cols-[1fr_auto] items-center gap-4 rounded-xl bg-white border border-neutral-100 shadow-sm px-4 py-4 transition hover:border-blue-200 hover:shadow-md sm:grid-cols-[minmax(0,1fr)_180px_auto] sm:px-5"
    >
      <div className="min-w-0">
        <div className="flex items-center gap-2">
          <StatusChip status={status} />
          <span className="font-mono text-[9px] uppercase tracking-[0.14em] text-neutral-400">
            {id}
          </span>
        </div>
        {loading ? (
          <div className="mt-2 h-4 w-52 animate-pulse rounded bg-blue-50" />
        ) : (
          <p className="mt-1.5 truncate text-[15px] font-medium text-neutral-900 transition-colors group-hover:text-[#3b82f6]">
            {title}
          </p>
        )}
      </div>

      <div className="hidden sm:block">
        <div className="flex items-center justify-between">
          <span className="font-mono text-[9px] uppercase tracking-[0.12em] text-neutral-400">
            funded
          </span>
          <span className="font-mono text-[10px] tabular-nums text-neutral-500">
            {percent(funded, budget)}%
          </span>
        </div>
        <div className="mt-1.5 h-2 w-full overflow-hidden rounded-full bg-blue-50">
          <div
            className="h-full rounded-full bg-linear-to-r from-blue-400 to-blue-200"
            style={{ width: `${percent(funded, budget)}%` }}
          />
        </div>
        <p className="mt-1.5 font-mono text-[9px] tabular-nums text-neutral-400">
          {formatGen(funded, 2)} / {formatGen(budget, 2)} GEN
        </p>
      </div>

      <ArrowUpRight className="size-4 text-neutral-300 transition-colors group-hover:text-[#3b82f6]" />
    </Link>
  )
}

export const HeroFinancial = () => {
  const timelineRef = React.useRef<HTMLDivElement>(null)
  const isMobile = useMediaQuery('(max-width: 768px)')
  const closeDrawer = useDrawerClose()

  const stats = useStats()
  const rounds = useRounds()
  const loading = stats.isPending || rounds.isPending
  const error = stats.error ?? rounds.error
  const latestRounds = (rounds.data ?? []).slice(-3).reverse()
  const openRounds = (rounds.data ?? []).filter((r) => r.status === 'open').length

  const drawerContent = (
    <nav className="p-5 space-y-4">
      <div className="flex items-center gap-2 text-neutral-900">
        <Brand />
      </div>
      <p className="font-mono text-[10px] uppercase tracking-[0.18em] text-neutral-400">
        Grants by open criteria
      </p>
      <div className="space-y-1 pt-2">
        {NAV_LINKS.map((link) => (
          <Link
            key={link.href}
            href={link.href}
            onClick={closeDrawer}
            className="block rounded-lg p-2 text-[15px] font-medium text-neutral-700 transition hover:bg-blue-50 hover:text-[#3b82f6]"
          >
            {link.label}
          </Link>
        ))}
      </div>
      <div className="pt-3">
        <WalletButton fullWidth />
      </div>
      <p className="pt-3 text-xs leading-relaxed text-neutral-400">
        AI Governance grants. Every grant decision is re-evaluated by
        independent validators on GenLayer.
      </p>
    </nav>
  )

  return (
    <section
      ref={timelineRef}
      className="min-h-screen bg-[#f7f9fc] text-[#1e293b] relative overflow-hidden flex flex-col items-center"
    >
      {/* Background image layer (template asset) */}
      <div className="absolute inset-0 z-0 bg-[url('https://cdn.21st.dev/assets/mirror/f2/f2f40d6a9618bd458d2e195ccde0198a210e9700f51eb0e97976fcd984259b26.jpg')] bg-cover bg-center opacity-50" />

      {/* Blue glow bars (template SVG, recolored to the blue finance palette) */}
      <GlowBars className="absolute top-0 z-1 left-0 pointer-events-none" />

      {/* Soft background gradient */}
      <TimelineAnimation
        timelineRef={timelineRef}
        animationNum={5}
        className="absolute top-0 left-0 w-full h-[600px] bg-linear-to-b from-blue-50 via-blue-100 to-transparent opacity-100 pointer-events-none"
      />

      {isMobile && (
        <div className="flex gap-4 justify-between items-center px-5 w-full pt-4 z-30">
          <MotionDrawer
            direction="left"
            width={300}
            backgroundColor={'#ffffff'}
            clsBtnClassName="bg-neutral-800 border-r border-neutral-900 text-white"
            contentClassName="bg-white border-r border-neutral-200 text-neutral-900"
            btnClassName="bg-white text-neutral-900 relative w-fit p-2 left-0 top-0 rounded-full shadow-xs border border-neutral-200"
          >
            {drawerContent}
          </MotionDrawer>
          <Link
            href="/rounds"
            className="bg-neutral-900 text-white px-3 py-3 relative z-2 flex gap-1 items-center rounded-xl font-bold text-sm hover:bg-black transition shadow-[inset_2px_2px_5px_0px_rgba(0,0,0,0.5),inset_-2px_-2px_6px_1px_rgba(80,78,78,0.5)]"
          >
            Get started <ArrowRight size={20} />
          </Link>
        </div>
      )}
      {/* Header — gutters match .shell (20px / 32px) so the brand sits at the
          same x position as the sticky header on every other route. */}
      {!isMobile && (
        <header className="relative z-10 w-full max-w-7xl mx-auto px-3 lg:px-6 py-2 mt-4">
          <TimelineAnimation
            animationNum={1}
            timelineRef={timelineRef}
            className="bg-white/80 backdrop-blur-xl p-2 rounded-xl border border-white shadow-sm flex items-center justify-between"
          >
            <div className="flex items-center gap-2">
              <Brand />
            </div>
            <nav className="hidden md:flex items-center gap-10 text-sm font-semibold text-neutral-500">
              {NAV_LINKS.map((link) => (
                <Link
                  key={link.href}
                  href={link.href}
                  className="hover:text-[#3b82f6] transition"
                >
                  {link.label}
                </Link>
              ))}
            </nav>
            <div className="flex items-center gap-2">
              <WalletButton />
              <Link
                href="/rounds"
                className="bg-neutral-900 text-white px-3 py-3 flex gap-1 items-center rounded-xl font-bold text-sm hover:bg-black transition shadow-[inset_2px_2px_5px_0px_rgba(0,0,0,0.5),inset_-2px_-2px_6px_1px_rgba(80,78,78,0.5)]"
              >
                Get started <ArrowRight size={20} />
              </Link>
            </div>
          </TimelineAnimation>
        </header>
      )}

      {/* Hero Content */}
      <div className="relative z-10 text-center pt-20 md:pt-24 pb-16 px-4 flex flex-col gap-6">
        <TimelineAnimation
          animationNum={1}
          timelineRef={timelineRef}
          className="bg-white w-fit mx-auto text-neutral-900 px-1.5 py-1 rounded-full inline-flex items-center gap-2 shadow-lg shadow-blue-500/20 border-2 border-white"
        >
          <span className="bg-linear-to-br from-blue-500 to-blue-200 text-white px-2 py-0.5 rounded-full text-xs font-medium uppercase tracking-widest">
            Live
          </span>
          <span className="text-sm font-medium font-mono">
            contract {shortAddress(CONTRACT_ADDRESS, 5)}
          </span>
          <Link
            href={`${EXPLORER_URL}/address/${CONTRACT_ADDRESS}`}
            target="_blank"
            rel="noreferrer"
            aria-label="Open contract in explorer"
            className="text-neutral-400 transition hover:text-[#3b82f6]"
          >
            <ArrowUpRight className="size-4" />
          </Link>
        </TimelineAnimation>

        <TimelineAnimation
          as="h1"
          animationNum={2}
          timelineRef={timelineRef}
          className="sm:text-6xl text-5xl md:text-7xl font-sans font-medium tracking-tight text-neutral-900 max-w-5xl text-balance"
        >
          Community funds, scored by open criteria.
        </TimelineAnimation>

        <TimelineAnimation
          as="p"
          animationNum={3}
          timelineRef={timelineRef}
          className="text-xl md:text-2xl text-neutral-500 font-medium max-w-3xl mx-auto leading-relaxed px-4"
        >
          Aequa Grants opens the rubric, not discretion. The community funds
          rounds, applicants submit public evidence, and GenLayer AI validators
          re-evaluate every proposal independently.
        </TimelineAnimation>

        <div className="flex gap-4 justify-center flex-wrap">
          <TimelineAnimation
            as="div"
            animationNum={4}
            timelineRef={timelineRef}
          >
            <Link
              href="/rounds"
              className="px-4 bg-linear-to-br from-blue-500 via-blue-400 to-blue-200 text-white text-xl rounded-lg shadow-sm transition py-2.5 border border-blue-300 inline-flex items-center gap-2 hover:brightness-105"
            >
              Browse rounds <ArrowRight size={20} />
            </Link>
          </TimelineAnimation>
          <TimelineAnimation
            as="div"
            animationNum={5}
            timelineRef={timelineRef}
          >
            <Link
              href="/how-it-works"
              className="px-4 bg-linear-to-br from-neutral-50 via-neutral-100 to-neutral-300 text-neutral-900 text-xl rounded-lg shadow-sm transition py-2.5 border border-neutral-300 inline-flex items-center gap-2 hover:brightness-95"
            >
              How it works
            </Link>
          </TimelineAnimation>
        </div>

        <TimelineAnimation
          as="ul"
          animationNum={5}
          timelineRef={timelineRef}
          className="flex flex-wrap items-center justify-center gap-x-6 gap-y-2 font-mono text-[10px] uppercase tracking-[0.14em] text-neutral-400 pt-2"
        >
          <li className="inline-flex items-center gap-1.5">
            <Scale className="size-3.5 text-[#3b82f6]" /> same rubric for everyone
          </li>
          <li className="inline-flex items-center gap-1.5">
            <ShieldCheck className="size-3.5 text-[#3b82f6]" /> validators re-evaluate
          </li>
          <li className="inline-flex items-center gap-1.5">
            <BadgeCheck className="size-3.5 text-[#3b82f6]" /> separate &amp; deterministic payout
          </li>
        </TimelineAnimation>
      </div>

      {/* Dashboard UI Frame — live on-chain treasury ledger */}
      <div className="w-full max-w-7xl mx-auto rounded-xl relative mt-10 px-5 lg:px-8 pb-16 z-10">
        <TimelineAnimation
          animationNum={6}
          timelineRef={timelineRef}
          className="rounded-2xl bg-white/50 backdrop-blur-lg p-4"
        >
          <TimelineAnimation
            animationNum={7}
            as="div"
            timelineRef={timelineRef}
            className="w-full relative z-4 rounded-2xl bg-white/60 border border-white shadow-sm overflow-hidden"
          >
            <div className="flex flex-wrap items-center justify-between gap-3 bg-white/70 px-4 py-3 sm:px-5 border-b border-blue-100/60">
              <div className="flex items-center gap-2.5">
                <span className="font-mono text-[10px] font-medium uppercase tracking-[0.18em] text-neutral-500">
                  Treasury ledger
                </span>
                <span className="inline-flex items-center gap-1.5 rounded-full bg-blue-500/10 border border-blue-200 px-2 py-0.5">
                  <span className="size-1 rounded-full bg-[#3b82f6]" />
                  <span className="font-mono text-[8px] uppercase tracking-[0.16em] text-[#3b82f6]">
                    on-chain
                  </span>
                </span>
              </div>
              <div className="flex items-center gap-2">
                {stats.isFetching && !stats.isPending && (
                  <Loader2 className="size-3 animate-spin text-neutral-400" />
                )}
                <code className="font-mono text-[10px] text-neutral-400">
                  {shortAddress(CONTRACT_ADDRESS, 6)}
                </code>
                <CopyButton value={CONTRACT_ADDRESS} />
              </div>
            </div>

            <div className="grid grid-cols-2 sm:grid-cols-4 gap-3 p-4 sm:p-5">
              <Stat
                label="Total funded"
                value={error ? '—' : formatGen(stats.data?.totalFundedAtto ?? 0n, 2)}
                unit={error ? undefined : 'GEN'}
                loading={stats.isPending}
              />
              <Stat
                label="Paid out"
                value={error ? '—' : formatGen(stats.data?.totalPaidAtto ?? 0n, 2)}
                unit={error ? undefined : 'GEN'}
                loading={stats.isPending}
              />
              <Stat
                label="Open rounds"
                value={error ? '—' : String(openRounds)}
                unit={error ? undefined : `of ${stats.data?.roundCount ?? 0}`}
                loading={loading}
              />
              <Stat
                label="Proposal"
                value={error ? '—' : String(stats.data?.proposalCount ?? 0)}
                unit={error ? undefined : 'recorded'}
                loading={stats.isPending}
              />
            </div>

            {error ? (
              <div className="px-4 pb-4 sm:px-5 sm:pb-5">
                <ErrorPanel
                  compact
                  error={toUiError(error, 'Ledger could not be loaded')}
                  title="On-chain data could not be loaded"
                  onRetry={() => {
                    void stats.refetch()
                    void rounds.refetch()
                  }}
                />
              </div>
            ) : latestRounds.length === 0 && !loading ? (
              <div className="px-5 py-9 text-center">
                <p className="text-sm font-medium text-neutral-900">
                  No rounds have been opened yet.
                </p>
                <p className="mt-1 text-sm text-neutral-400">
                  The contract owner can open the first round from the admin panel.
                </p>
                <Link
                  href="/admin"
                  className="mt-4 inline-flex items-center gap-1 rounded-lg border border-neutral-300 bg-linear-to-br from-white via-neutral-50 to-neutral-200 px-4 py-2 text-sm font-semibold text-neutral-900 transition hover:brightness-95"
                >
                  Open admin panel
                </Link>
              </div>
            ) : (
              <div className="flex flex-col gap-3 px-4 pb-2 sm:px-5">
                {latestRounds.map((round) => (
                  <LedgerRow
                    key={round.id}
                    id={round.id}
                    title={round.title}
                    status={round.status}
                    funded={round.fundedAtto}
                    budget={round.budgetAtto}
                  />
                ))}
                {loading &&
                  [0, 1].map((index) => (
                    <LedgerRow
                      key={`skeleton-${index}`}
                      id="—"
                      title=""
                      status="open"
                      funded={0n}
                      budget={1n}
                      loading
                    />
                  ))}
              </div>
            )}

            <div className="flex flex-wrap items-center justify-between gap-2 bg-white/70 px-4 py-2.5 sm:px-5 border-t border-blue-100/60">
              <p className="font-mono text-[8px] uppercase tracking-[0.16em] text-neutral-400">
                contract balance {formatGen(stats.data?.balanceAtto ?? 0n, 2)} GEN
              </p>
              <Link
                href="/rounds"
                className="inline-flex items-center gap-1 font-mono text-[9px] uppercase tracking-[0.14em] text-[#3b82f6] transition hover:text-blue-700"
              >
                all rounds <ArrowRight className="size-3" />
              </Link>
            </div>
          </TimelineAnimation>
        </TimelineAnimation>

        <p className="mt-4 text-center font-mono text-[8px] uppercase tracking-[0.2em] text-neutral-400/80">
          read directly from the contract · refreshed every 60 seconds
        </p>
      </div>
    </section>
  )
}

export default HeroFinancial
