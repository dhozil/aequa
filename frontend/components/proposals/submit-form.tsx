"use client";

import * as React from "react";
import Link from "next/link";
import {
  AlertTriangle,
  ArrowRight,
  Check,
  CheckCircle2,
  FilePlus2,
  Link2,
  Loader2,
  Plus,
  Send,
  ShieldCheck,
  Trash2,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Skeleton } from "@/components/ui/skeleton";
import { PageHeader } from "@/components/page-header";
import { ErrorPanel } from "@/components/shared/error-panel";
import { TxFeedback } from "@/components/shared/tx-feedback";
import { Hash } from "@/components/shared/address";
import { WalletButton } from "@/components/wallet/wallet-button";
import { useRound, useRoundProposals, useStats, queryKeys } from "@/hooks/use-contract";
import { useTx } from "@/hooks/use-tx";
import { useWallet } from "@/hooks/use-wallet";
import { CONTRACT_ADDRESS } from "@/lib/config";
import { toUiError } from "@/lib/errors";
import {
  describeDeadline,
  formatDate,
  formatGenUnit,
  genInputValue,
  parseGen,
  plural,
} from "@/lib/format";
import { isUnknownResourceError, type Round } from "@/lib/types";
import { cn } from "cn";

const MAX_URLS = 3;
const MAX_TITLE = 160;
const MAX_SUMMARY = 2000;

type UrlField = { key: number; value: string };

function urlProblem(value: string): string | null {
  const raw = value.trim();
  if (!raw) return "An evidence URL is required.";
  let url: URL;
  try {
    url = new URL(raw);
  } catch {
    return "Invalid URL. Include https:// at the front.";
  }
  if (url.protocol !== "https:") return "Evidence must use https://.";
  if (url.username || url.password) return "The URL must not contain credentials.";
  const host = url.hostname.toLowerCase();
  if (host === "localhost" || host.endsWith(".local") || host.endsWith(".internal")) {
    return "Private hosts cannot be opened by validators.";
  }
  if (/^\d+\.\d+\.\d+\.\d+$/.test(host)) {
    return "Direct IP addresses are not accepted. Use a public domain.";
  }
  return null;
}

function ChecklistRow({
  ok,
  children,
}: {
  ok: boolean;
  children: React.ReactNode;
}) {
  return (
    <li className="flex items-start gap-2">
      <span
        className={cn(
          "mt-0.5 grid size-4 shrink-0 place-items-center rounded-full border",
          ok
            ? "border-forest bg-forest text-paper"
            : "border-border bg-background text-muted-foreground",
        )}
      >
        {ok ? <Check className="size-2.5" /> : <span className="size-1 rounded-full bg-current" />}
      </span>
      <div
        className={cn(
          "min-w-0 text-[11px] leading-relaxed",
          ok ? "text-foreground/75" : "text-muted-foreground",
        )}
      >
        {children}
      </div>
    </li>
  );
}
function SubmitSkeleton() {
  return (
    <div className="shell py-12 sm:py-16">
      <Skeleton className="h-3 w-28" />
      <Skeleton className="mt-6 h-10 w-2/3" />
      <Skeleton className="mt-4 h-4 w-full max-w-2xl" />
      <div className="mt-10 grid gap-8 lg:grid-cols-[1.3fr_0.7fr]">
        <Skeleton className="h-[560px] w-full" />
        <Skeleton className="h-[420px] w-full" />
      </div>
    </div>
  );
}

function SuccessScreen({
  round,
  proposalId,
  hash,
  refreshing,
  onRefresh,
}: {
  round: Round;
  proposalId?: string;
  hash?: string;
  refreshing: boolean;
  onRefresh: () => void;
}) {
  return (
    <div className="shell py-16 sm:py-24">
      <div className="mx-auto max-w-[720px] paper-card overflow-hidden">
        <div className="border-b border-border bg-forest px-6 py-8 text-paper sm:px-8">
          <span className="grid size-11 place-items-center rounded-full border border-paper/25 bg-paper/10">
            <CheckCircle2 className="size-5" />
          </span>
          <p className="mt-5 font-mono text-[9px] uppercase tracking-[0.2em] text-paper/60">
            Proposal recorded
          </p>
          <h1 className="mt-2 font-serif text-[38px] leading-[1.05] text-paper sm:text-[44px]">
            Your proposal is in.
          </h1>
          <p className="mt-3 max-w-lg text-sm leading-relaxed text-paper/70">
            The data is stored on-chain and awaiting evaluation. Validators will score
            the evidence independently; the result appears on the proposal page.
          </p>
        </div>

        <div className="space-y-5 p-6 sm:p-8">
          <div className="grid gap-3 sm:grid-cols-2">
            <div className="rounded-md border border-border bg-secondary/30 px-4 py-3">
              <p className="label">Round</p>
              <p className="mt-1 text-sm text-ink">{round.title}</p>
              <p className="mt-0.5 font-mono text-[9px] uppercase tracking-[0.12em] text-muted-foreground">
                {round.id}
              </p>
            </div>
            <div className="rounded-md border border-border bg-secondary/30 px-4 py-3">
              <p className="label">Status</p>
              <p className="mt-1 text-sm text-ink">Awaiting evaluation</p>
              <p className="mt-0.5 font-mono text-[9px] uppercase tracking-[0.12em] text-muted-foreground">
                no funds allocated yet
              </p>
            </div>
          </div>

          {proposalId ? (
            <Button asChild size="lg" className="w-full">
              <Link href={`/proposals/${proposalId}`}>
                View proposal &amp; evaluation status
                <ArrowRight className="size-4" />
              </Link>
            </Button>
          ) : (
            <div className="flex items-center justify-between gap-3 rounded-md border border-brass/30 bg-brass/[0.05] px-4 py-3">
              <p className="text-[11px] leading-relaxed text-brass">
                {refreshing
                  ? "Looking for the proposal in the ledger…"
                  : "The proposal is recorded. Its id has not appeared in the cache yet."}
              </p>
              <Button variant="outline" size="sm" onClick={onRefresh} disabled={refreshing}>
                {refreshing && <Loader2 className="size-3 animate-spin" />}
                Reload
              </Button>
            </div>
          )}

          {hash && (
            <div className="rounded-md border border-border bg-card px-3 py-2">
              <p className="label mb-1">Transaction hash</p>
              <Hash value={hash} />
            </div>
          )}

          <div className="flex flex-col gap-2 sm:flex-row">
            <Button asChild variant="outline" className="flex-1">
              <Link href={`/rounds/${round.id}`}>Back to round</Link>
            </Button>
            <Button asChild variant="outline" className="flex-1">
              <Link href="/rounds">All rounds</Link>
            </Button>
          </div>

          <ul className="space-y-2 border-t border-border pt-4">
            {[
              "Track the status on the proposal page — evaluation can take 1–3 minutes.",
              "Each wallet can submit only one proposal per round.",
              "If it is rejected, no funds are taken from the treasury.",
            ].map((line) => (
              <li key={line} className="flex items-start gap-2 text-[11px] leading-relaxed text-muted-foreground">
                <span className="mt-1 size-1 shrink-0 rounded-full bg-brass" />
                {line}
              </li>
            ))}
          </ul>
        </div>
      </div>
    </div>
  );
}

function AlreadySubmitted({
  round,
  proposalId,
}: {
  round: Round;
  proposalId: string;
}) {
  return (
    <div className="shell py-16 sm:py-24">
      <div className="mx-auto max-w-[720px] paper-card p-6 sm:p-8">
        <span className="grid size-10 place-items-center rounded-full border border-brass/30 bg-brass/10 text-brass">
          <FilePlus2 className="size-4" />
        </span>
        <p className="label mt-5">One proposal per wallet</p>
        <h1 className="mt-2 font-serif text-[36px] leading-tight text-ink">
          This wallet has already submitted a proposal.
        </h1>
        <p className="mt-3 text-sm leading-relaxed text-muted-foreground">
          The contract limits one proposal per address in each round. You can still
          track the evaluation or submit a proposal in another round.
        </p>
        <div className="mt-6 flex flex-col gap-2 sm:flex-row">
          <Button asChild size="lg">
            <Link href={`/proposals/${proposalId}`}>
              View my proposal <ArrowRight className="size-4" />
            </Link>
          </Button>
          <Button asChild size="lg" variant="outline">
            <Link href={`/rounds/${round.id}`}>Back to round</Link>
          </Button>
        </div>
      </div>
    </div>
  );
}

function SubmitBody({ round }: { round: Round }) {
  const { address } = useWallet();
  const proposals = useRoundProposals(round.id);
  const stats = useStats();
  const paused = Boolean(stats.data?.paused);
  const tx = useTx();

  const [title, setTitle] = React.useState("");
  const [titleTouched, setTitleTouched] = React.useState(false);
  const [summary, setSummary] = React.useState("");
  const [amount, setAmount] = React.useState("");
  const [urls, setUrls] = React.useState<UrlField[]>([{ key: 1, value: "" }]);
  const [agreed, setAgreed] = React.useState(false);
  const nextKey = React.useRef(2);

  const deadline = describeDeadline(round.deadlineIso, round.status);
  const accepting = round.status === "open" && !deadline.expired;
  const cap = round.maxGrantAtto < round.budgetAtto ? round.maxGrantAtto : round.budgetAtto;
  const requested = parseGen(amount);

  const myProposal = React.useMemo(() => {
    if (!address) return undefined;
    return (proposals.data ?? []).find(
      (proposal) => proposal.applicant.toLowerCase() === address.toLowerCase(),
    );
  }, [proposals.data, address]);

  const urlProblems = urls.map((field) => urlProblem(field.value));
  const duplicateUrls = React.useMemo(() => {
    const seen = new Set<string>();
    const duplicates = new Set<string>();
    for (const field of urls) {
      const value = field.value.trim();
      if (!value) continue;
      if (seen.has(value)) duplicates.add(value);
      seen.add(value);
    }
    return duplicates;
  }, [urls]);

  const checks = {
    title: title.trim().length > 0 && title.length <= MAX_TITLE,
    summary: summary.trim().length > 0 && summary.length <= MAX_SUMMARY,
    amount: requested !== null && requested > 0n && requested <= cap,
    urls:
      urls.length >= 1 &&
      urls.length <= MAX_URLS &&
      urlProblems.every((problem) => problem === null) &&
      duplicateUrls.size === 0,
    agreed,
    wallet: Boolean(address),
    historyLoaded: !proposals.isPending,
    // `submit_proposal` is rejected while the contract is paused, so the button
    // stays disabled instead of sending a transaction that must fail.
    notPaused: !paused,
  };

  const canSubmit =
    Object.values(checks).every(Boolean) && !tx.isBusy && !myProposal;

  const addUrl = () => {
    if (urls.length >= MAX_URLS) return;
    setUrls((current) => [...current, { key: nextKey.current++, value: "" }]);
  };

  const removeUrl = (key: number) => {
    setUrls((current) =>
      current.length === 1 ? current : current.filter((field) => field.key !== key),
    );
  };

  const updateUrl = (key: number, value: string) => {
    setUrls((current) =>
      current.map((field) => (field.key === key ? { ...field, value } : field)),
    );
  };

  const handleSubmit = async (event: React.FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    if (!canSubmit || tx.isBusy) return;
    const value = requested as bigint;
    await tx.run({
      label: "Submitting the proposal",
      send: (client) =>
        client.writeContract({
          address: CONTRACT_ADDRESS,
          functionName: "submit_proposal",
          args: [
            round.id,
            title.trim(),
            summary.trim(),
            urls.map((field) => field.value.trim()),
            value,
          ],
          value: 0n,
        }),
      invalidate: [
        queryKeys.stats,
        queryKeys.rounds,
        queryKeys.round(round.id),
        queryKeys.roundProposals(round.id),
        queryKeys.proposals,
      ],
      successTitle: "Proposal submitted",
      successDescription: "The proposal is recorded on-chain and awaiting validator evaluation.",
    });
  };

  if (!accepting) {
    return (
      <div className="shell py-16 sm:py-24">
        <div className="mx-auto max-w-[720px] paper-card p-6 sm:p-8">
          <span className="grid size-10 place-items-center rounded-full border border-brass/30 bg-brass/10 text-brass">
            <AlertTriangle className="size-4" />
          </span>
          <p className="label mt-5">Round is not accepting proposals</p>
          <h1 className="mt-2 font-serif text-[36px] leading-tight text-ink">
            {round.status === "closed" ? "The round is closed." : "The deadline has passed."}
          </h1>
          <p className="mt-3 text-sm leading-relaxed text-muted-foreground">
            {round.status === "closed"
              ? "The owner closed this round for new submissions. Proposals already submitted can still be evaluated."
              : `The submission deadline for this round was ${formatDate(round.deadlineIso)}. You can still view existing proposals.`}
          </p>
          <Button asChild size="lg" className="mt-6">
            <Link href={`/rounds/${round.id}`}>Back to round</Link>
          </Button>
        </div>
      </div>
    );
  }

  if (tx.isSuccess) {
    return (
      <SuccessScreen
        round={round}
        proposalId={myProposal?.id}
        hash={tx.state.hash}
        refreshing={proposals.isFetching}
        onRefresh={() => void proposals.refetch()}
      />
    );
  }

  if (myProposal) {
    return <AlreadySubmitted round={round} proposalId={myProposal.id} />;
  }

  return (
    <div className="shell py-12 sm:py-16">
      <PageHeader
        back={{ href: `/rounds/${round.id}`, label: "Back to round" }}
        eyebrow={
          <span className="flex flex-wrap items-center gap-2">
            <span>New proposal</span>
            <span className="text-border">/</span>
            <span>{round.id}</span>
          </span>
        }
        title="Submit proposal"
        description="Be concise, attach public evidence, and request a reasonable amount. Validators score the evidence, not the length of the submission."
      />

      <form
        onSubmit={(event) => void handleSubmit(event)}
        className="mt-8 grid items-start gap-8 lg:grid-cols-[1.3fr_0.7fr]"
      >
        <div className="space-y-5">
          <section className="paper-card p-5 sm:p-6">
            <div className="flex items-baseline justify-between gap-3 border-b border-border pb-4">
              <div className="flex items-center gap-2">
                <span className="font-mono text-[10px] text-brass">01</span>
                <h2 className="text-[20px] text-ink">Proposal summary</h2>
              </div>
              <span className="font-mono text-[9px] uppercase tracking-[0.12em] text-muted-foreground">
                public &amp; on-chain
              </span>
            </div>

            <div className="mt-5 space-y-5">
              <div>
                <div className="flex items-center justify-between">
                  <Label htmlFor="title">Title</Label>
                  <span
                    className={cn(
                      "font-mono text-[9px] tabular",
                      title.length > MAX_TITLE ? "text-rust" : "text-muted-foreground",
                    )}
                  >
                    {title.length}/{MAX_TITLE}
                  </span>
                </div>
                <Input
                  id="title"
                  value={title}
                  maxLength={MAX_TITLE + 20}
                  onChange={(event) => setTitle(event.target.value)}
                  onBlur={() => setTitleTouched(true)}
                  placeholder="Example: Open research on local AI governance"
                  className="mt-1.5 h-11 bg-background"
                  disabled={tx.isBusy}
                  aria-invalid={titleTouched && !checks.title}
                />
                <p className="mt-1.5 text-[11px] leading-relaxed text-muted-foreground">
                  One sentence describing the outcome you want funded.
                </p>
              </div>

              <div>
                <div className="flex items-center justify-between">
                  <Label htmlFor="summary">Summary</Label>
                  <span
                    className={cn(
                      "font-mono text-[9px] tabular",
                      summary.length > MAX_SUMMARY ? "text-rust" : "text-muted-foreground",
                    )}
                  >
                    {summary.length}/{MAX_SUMMARY}
                  </span>
                </div>
                <Textarea
                  id="summary"
                  value={summary}
                  onChange={(event) => setSummary(event.target.value)}
                  placeholder="Describe the problem, the work plan, milestones, and how the impact can be proven. Use concrete numbers or outcomes — validators only score evidence."
                  className="mt-1.5 min-h-[190px] resize-y bg-background text-[13px] leading-relaxed"
                  disabled={tx.isBusy}
                />
                <div className="mt-1.5 flex items-center justify-between gap-3">
                  <p className="text-[11px] leading-relaxed text-muted-foreground">
                    We recommend at least 120 characters so there is enough context.
                  </p>
                  <span
                    className={cn(
                      "shrink-0 font-mono text-[9px] uppercase tracking-[0.12em]",
                      summary.trim().length >= 120 ? "text-forest" : "text-brass",
                    )}
                  >
                    {summary.trim().length >= 120 ? "enough" : "brief"}
                  </span>
                </div>
              </div>
            </div>
          </section>

          <section className="paper-card p-5 sm:p-6">
            <div className="flex items-baseline justify-between gap-3 border-b border-border pb-4">
              <div className="flex items-center gap-2">
                <span className="font-mono text-[10px] text-brass">02</span>
                <h2 className="text-[20px] text-ink">Amount &amp; evidence</h2>
              </div>
              <span className="font-mono text-[9px] uppercase tracking-[0.12em] text-muted-foreground">
                1–{MAX_URLS} sources
              </span>
            </div>

            <div className="mt-5 space-y-6">
              <div>
                <div className="flex items-center justify-between gap-3">
                  <Label htmlFor="amount">Requested amount</Label>
                  <button
                    type="button"
                    onClick={() => setAmount(genInputValue(cap))}
                    className="font-mono text-[9px] uppercase tracking-[0.12em] text-forest hover:underline"
                  >
                    fill cap {formatGenUnit(cap, 2)}
                  </button>
                </div>
                <div className="relative mt-1.5">
                  <Input
                    id="amount"
                    inputMode="decimal"
                    value={amount}
                    onChange={(event) => setAmount(event.target.value)}
                    placeholder="2"
                    className={cn(
                      "h-11 bg-background pr-14 font-mono text-[15px] tabular",
                      amount && !checks.amount && "border-rust/50",
                    )}
                    disabled={tx.isBusy}
                  />
                  <span className="pointer-events-none absolute right-3 top-1/2 -translate-y-1/2 font-mono text-[10px] uppercase tracking-[0.12em] text-muted-foreground">
                    GEN
                  </span>
                </div>
                <div className="mt-1.5 flex flex-wrap items-center gap-x-3 gap-y-1">
                  <p className="text-[11px] text-muted-foreground">
                    Round cap {formatGenUnit(round.maxGrantAtto, 2)} · available{" "}
                    {formatGenUnit(round.availableAtto, 2)}
                  </p>
                  {requested !== null && requested > round.availableAtto && (
                    <p className="text-[11px] font-medium text-brass">
                      Exceeds the funds available right now — risks being rejected with
                      budget_exhausted.
                    </p>
                  )}
                </div>
              </div>

              <div>
                <div className="flex items-center justify-between">
                  <Label>Public evidence URLs</Label>
                  <span className="font-mono text-[9px] uppercase tracking-[0.12em] text-muted-foreground">
                    {urls.length}/{MAX_URLS}
                  </span>
                </div>
                <p className="mt-1 text-[11px] leading-relaxed text-muted-foreground">
                  Public pages containing your work, reports, or proof of impact. No login,
                  no PDFs that require downloading.
                </p>

                <div className="mt-3 space-y-2.5">
                  {urls.map((field, index) => {
                    const problem = urlProblems[index];
                    const duplicate = duplicateUrls.has(field.value.trim());
                    return (
                      <div key={field.key}>
                        <div className="flex items-center gap-2">
                          <div className="relative flex-1">
                            <Link2 className="pointer-events-none absolute left-3 top-1/2 size-3.5 -translate-y-1/2 text-muted-foreground" />
                            <Input
                              value={field.value}
                              onChange={(event) => updateUrl(field.key, event.target.value)}
                              placeholder="https://…"
                              className={cn(
                                "h-11 bg-background pl-9 font-mono text-[12px]",
                                (problem || duplicate) && field.value && "border-rust/50",
                              )}
                              disabled={tx.isBusy}
                              aria-label={`Evidence URL ${index + 1}`}
                            />
                          </div>
                          <Button
                            type="button"
                            variant="ghost"
                            size="icon"
                            onClick={() => removeUrl(field.key)}
                            disabled={urls.length === 1 || tx.isBusy}
                            aria-label="Remove URL"
                          >
                            <Trash2 className="size-3.5" />
                          </Button>
                        </div>
                        {field.value && (problem || duplicate) && (
                          <p className="mt-1 pl-1 text-[11px] text-rust">
                            {duplicate ? "This URL is duplicated." : problem}
                          </p>
                        )}
                      </div>
                    );
                  })}
                </div>

                {urls.length < MAX_URLS && (
                  <Button
                    type="button"
                    variant="outline"
                    size="sm"
                    className="mt-3"
                    onClick={addUrl}
                    disabled={tx.isBusy}
                  >
                    <Plus className="size-3.5" />
                    Add URL
                  </Button>
                )}
              </div>
            </div>
          </section>

          <section className="paper-card p-5 sm:p-6">
            <div className="flex items-center gap-2 border-b border-border pb-4">
              <span className="font-mono text-[10px] text-brass">03</span>
              <h2 className="text-[20px] text-ink">Confirmation</h2>
            </div>
            <label className="mt-5 flex cursor-pointer items-start gap-3">
              <input
                type="checkbox"
                checked={agreed}
                onChange={(event) => setAgreed(event.target.checked)}
                disabled={tx.isBusy}
                className="mt-0.5 size-4 shrink-0 accent-[#3b82f6]"
              />
              <span className="text-[12px] leading-relaxed text-muted-foreground">
                I understand this proposal is scored automatically by AI validators
                against the public rubric, that the decision follows the contract, and
                that one wallet may submit only one proposal in this round.
              </span>
            </label>
          </section>
        </div>

        <aside className="space-y-4 lg:sticky lg:top-24">
          <div className="paper-card overflow-hidden">
            <div className="border-b border-border bg-card px-5 py-4">
              <p className="label">Target round</p>
              <p className="mt-1 line-clamp-2 text-[15px] leading-snug text-ink">
                {round.title}
              </p>
              <p className="mt-1 font-mono text-[9px] uppercase tracking-[0.12em] text-muted-foreground">
                {round.id} · {round.status === "closed" ? "closed" : deadline.expired ? "past deadline" : deadline.label}
              </p>
            </div>

            <dl className="divide-y divide-border/70">
              {[
                { label: "Round budget", value: formatGenUnit(round.budgetAtto, 2) },
                { label: "Available", value: formatGenUnit(round.availableAtto, 2) },
                { label: "Cap per proposal", value: formatGenUnit(round.maxGrantAtto, 2) },
                { label: "Score threshold", value: `${round.minScore}/100` },
                {
                  label: "Rubric",
                  value: plural(round.rubric.criteria.length, "criterion", "criteria"),
                },
                {
                  label: "Gates",
                  value: plural(round.rubric.gates.length, "hard requirement"),
                },
              ].map((row) => (
                <div
                  key={row.label}
                  className="flex items-center justify-between gap-3 px-5 py-2.5"
                >
                  <dt className="font-mono text-[9px] uppercase tracking-[0.1em] text-muted-foreground">
                    {row.label}
                  </dt>
                  <dd className="font-mono text-[11px] tabular text-ink">{row.value}</dd>
                </div>
              ))}
            </dl>
          </div>

          <div className="rounded-lg border border-border bg-card p-5">
            <div className="flex items-center justify-between">
              <p className="label">Before submitting</p>
              {proposals.isPending && (
                <Loader2 className="size-3 animate-spin text-muted-foreground" />
              )}
            </div>
            <ul className="mt-3 space-y-2">
              <ChecklistRow ok={checks.title}>Title filled in (max {MAX_TITLE})</ChecklistRow>
              <ChecklistRow ok={checks.summary}>Summary filled in</ChecklistRow>
              <ChecklistRow ok={checks.amount}>
                Amount is valid and does not exceed the cap
              </ChecklistRow>
              <ChecklistRow ok={checks.urls}>
                {plural(urls.length, "public https URL")}
              </ChecklistRow>
              <ChecklistRow ok={checks.agreed}>Confirmation checked</ChecklistRow>
              <ChecklistRow ok={checks.wallet}>
                Wallet connected
                {!address && (
                  <span className="mt-2 block">
                    <WalletButton fullWidth />
                  </span>
                )}
              </ChecklistRow>
              <ChecklistRow ok={checks.historyLoaded}>
                Wallet proposal history checked
              </ChecklistRow>
              <ChecklistRow ok={checks.notPaused}>
                {paused
                  ? "The contract is paused; submissions resume when the owner unpauses it."
                  : "Contract is accepting transactions"}
              </ChecklistRow>
            </ul>

            <Button
              type="submit"
              size="xl"
              className="mt-5 w-full"
              disabled={!canSubmit}
            >
              {tx.isBusy ? (
                <>
                  <Loader2 className="size-4 animate-spin" />
                  Sending…
                </>
              ) : (
                <>
                  <Send className="size-4" />
                  Submit proposal
                </>
              )}
            </Button>

            <p className="mt-2.5 flex items-start gap-1.5 text-[10px] leading-relaxed text-muted-foreground">
              <ShieldCheck className="mt-0.5 size-3 shrink-0 text-forest" />
              Once submitted, the proposal content cannot be edited. Evaluation can only
              run after the transaction is recorded.
            </p>
          </div>

          {tx.state.phase !== "idle" && (
            <TxFeedback
              state={tx.state}
              onReset={tx.reset}
              successTitle="Proposal submitted"
              successDescription="The proposal is recorded on-chain. Awaiting validator evaluation."
              pendingHint="Sending the proposal to the contract. Usually 15–60 seconds."
            />
          )}
        </aside>
      </form>
    </div>
  );
}

export function SubmitProposal({ roundId }: { roundId: string }) {
  const round = useRound(roundId);

  if (round.isPending) return <SubmitSkeleton />;

  if (round.error && !round.data) {
    return (
      <div className="shell py-16">
        <PageHeader
          back={{ href: "/rounds", label: "All rounds" }}
          eyebrow="New proposal"
          title={isUnknownResourceError(round.error) ? "Round not found" : "Round could not be loaded"}
          description="No transaction was sent. Check the link or try reloading."
        />
        <div className="mt-6 max-w-2xl">
          {isUnknownResourceError(round.error) ? (
            <Button asChild className="mt-2">
              <Link href="/rounds">Back to all rounds</Link>
            </Button>
          ) : (
            <ErrorPanel
              error={toUiError(round.error, "Round could not be loaded")}
              onRetry={() => void round.refetch()}
            />
          )}
        </div>
      </div>
    );
  }

  if (!round.data) {
    return (
      <div className="shell py-16">
        <PageHeader
          eyebrow="New proposal"
          title="Round not found"
          description="The round id does not exist in the contract."
        />
      </div>
    );
  }

  return <SubmitBody round={round.data} />;
}
