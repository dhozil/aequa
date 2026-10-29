"use client";

import Link from "next/link";
import {
  ArrowRight,
  ArrowUpRight,
  CircleDot,
  Files,
  Gavel,
  Landmark,
  Scale,
  Sparkles,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { Reveal } from "@/components/reveal";
import { ConsensusResult } from "@/components/shared/consensus-result";
import { RubricView } from "@/components/shared/rubric-view";
import { StatusChip } from "@/components/shared/status-chip";
import { formatGenUnit, shortHash } from "@/lib/format";
import type { Proposal, Round, Rubric } from "@/lib/types";

export const SAMPLE_RUBRIC: Rubric = {
  criteria: [
    {
      id: "impact",
      weight: 30,
      question:
        "How large is the demonstrable impact on the community, backed by numbers or clear outcomes?",
    },
    {
      id: "evidence",
      weight: 25,
      question:
        "Is the public evidence strong, relevant, and verifiable without extra assumptions?",
    },
    {
      id: "feasibility",
      weight: 25,
      question:
        "Is the work plan realistic, clearly phased, and matched to the team's capacity?",
    },
    {
      id: "cost",
      weight: 20,
      question:
        "Is the requested budget reasonable compared to the promised outcomes?",
    },
  ],
  gates: [
    {
      id: "original_work",
      question: "This work is original, not a resubmission from a previous round.",
    },
    {
      id: "public_evidence",
      question: "Every evidence link is publicly accessible without login.",
    },
  ],
};

const principles = [
  {
    icon: Scale,
    title: "Published rubric",
    body: "Criteria weights and gates are set before proposals arrive. Everything is scored by the same rules.",
  },
  {
    id: "consensus",
    icon: Gavel,
    title: "Validators re-evaluate",
    body: "Every validator runs its own evaluation. Decisions must match before state changes.",
  },
  {
    icon: Landmark,
    title: "Deterministic treasury",
    body: "Payout is not guesswork. Only approved proposals can be drawn, once.",
  },
];

const steps = [
  {
    tag: "01 · Community",
    title: "Round opens and gets funded",
    body: "The owner opens a round with a budget, a per-proposal cap, a score threshold, and a deadline. Anyone can add funds; the balance and its history are readable straight from the contract.",
  },
  {
    tag: "02 · Rubric",
    title: "Criteria and gates locked in",
    body: "The rubric carries 1–8 weighted criteria totaling 100 plus 1–8 gates. All gates must pass; the total score decides the rest. Nothing changes behind the scenes once proposals arrive.",
  },
  {
    tag: "03 · Evaluation",
    title: "AI scores evidence, not stories",
    body: "Validators open the public evidence URLs, score 0–5 per criterion, and check the gates. Each validator re-evaluates from scratch, and results are compared at the decision level.",
  },
  {
    tag: "04 · Payout",
    title: "Funds move only when valid",
    body: "Approved proposals reserve funds. Withdrawal is a separate step that moves GEN to the applicant. Rejected proposals never touch the treasury.",
  },
];

export function Principles() {
  return (
    <section className="border-y border-border bg-card/40">
      <div className="shell">
        <div className="grid gap-px bg-border/70 sm:grid-cols-3">
          {principles.map((item, index) => (
            <Reveal key={item.title} delay={index * 70} className="bg-background px-1 py-8 sm:px-7">
              <item.icon className="size-4 text-forest" />
              <h3 className="mt-4 text-[19px] text-ink">{item.title}</h3>
              <p className="mt-2 max-w-xs text-[13px] leading-relaxed text-muted-foreground">
                {item.body}
              </p>
            </Reveal>
          ))}
        </div>
      </div>
    </section>
  );
}

export function HowItWorks() {
  return (
    <section id="how-it-works" className="scroll-mt-24 border-b border-border">
      <div className="shell py-20 sm:py-28">
        <div className="grid gap-12 lg:grid-cols-[0.85fr_1.15fr] lg:gap-20">
          <div className="lg:sticky lg:top-28 lg:self-start">
            <p className="label">How it works</p>
            <h2 className="display mt-5 text-[clamp(36px,4.8vw,56px)] text-ink">
              Four steps,
              <br />
              one set of rules.
            </h2>
            <p className="mt-5 max-w-md text-[15px] leading-relaxed text-muted-foreground">
              No closed pitches or admin discretion. Only the evidence changes; the
              scoring process stays the same and is open for anyone to inspect.
            </p>
            <div className="mt-7 inline-flex items-center gap-2 rounded-full border border-border bg-card px-3 py-1.5">
              <CircleDot className="size-3 text-forest" />
              <span className="font-mono text-[9px] uppercase tracking-[0.14em] text-muted-foreground">
                open contract · public source
              </span>
            </div>
          </div>

          <ol className="relative border-l border-border pl-6 sm:pl-8">
            {steps.map((step, index) => (
              <Reveal
                key={step.tag}
                delay={index * 60}
                className={index === steps.length - 1 ? undefined : "pb-10"}
              >
                <li className="relative">
                  <span className="absolute -left-[33px] top-1.5 grid size-3.5 place-items-center rounded-full border border-border bg-background sm:-left-[41px]">
                    <span className="size-1.5 rounded-full bg-forest" />
                  </span>
                  <p className="font-mono text-[9px] uppercase tracking-[0.18em] text-brass">
                    {step.tag}
                  </p>
                  <h3 className="mt-2 text-[24px] leading-tight text-ink sm:text-[28px]">
                    {step.title}
                  </h3>
                  <p className="mt-2.5 max-w-xl text-[14px] leading-relaxed text-muted-foreground">
                    {step.body}
                  </p>
                </li>
              </Reveal>
            ))}
          </ol>
        </div>
      </div>
    </section>
  );
}

export function RubricSection({ round }: { round?: Round }) {
  const rubric = round?.rubric.criteria.length ? round.rubric : SAMPLE_RUBRIC;

  return (
    <section id="rubric" className="scroll-mt-24 border-b border-border bg-secondary/35">
      <div className="shell py-20 sm:py-24">
        <div className="grid items-start gap-12 lg:grid-cols-[0.9fr_1.1fr] lg:gap-16">
          <div>
            <p className="label">Rubric &amp; gates</p>
            <h2 className="display mt-5 text-[clamp(36px,4.8vw,56px)] text-ink">
              The same criteria,
              <br />
              for every proposal.
            </h2>
            <p className="mt-5 max-w-md text-[15px] leading-relaxed text-muted-foreground">
              Criteria are weighted and summed into a 0–100 score. Gates are absolute
              requirements: one failed gate rejects the proposal outright, whatever its
              score. Because weights and questions are public, applicants know exactly
              what will be evaluated.
            </p>

            <dl className="mt-8 grid grid-cols-2 gap-px overflow-hidden rounded-lg border border-border bg-border/70">
              <div className="bg-card px-4 py-3.5">
                <dt className="label">Total weight</dt>
                <dd className="mt-1 font-mono text-xl tabular text-ink">100</dd>
              </div>
              <div className="bg-card px-4 py-3.5">
                <dt className="label">Criterion score</dt>
                <dd className="mt-1 font-mono text-xl tabular text-ink">0–5</dd>
              </div>
              <div className="bg-card px-4 py-3.5">
                <dt className="label">Gate</dt>
                <dd className="mt-1 font-mono text-xl tabular text-ink">1–8</dd>
              </div>
              <div className="bg-card px-4 py-3.5">
                <dt className="label">Threshold</dt>
                <dd className="mt-1 font-mono text-xl tabular text-ink">0–100</dd>
              </div>
            </dl>

            <div className="mt-7 flex flex-wrap gap-2">
              <Button asChild variant="outline">
                <Link href={round ? `/rounds/${round.id}` : "/rounds"}>
                  View active rubric
                  <ArrowUpRight className="size-3.5" />
                </Link>
              </Button>
              {round && (
                <span className="inline-flex items-center gap-2 rounded-md border border-border bg-card px-3 py-2 font-mono text-[10px] uppercase tracking-[0.12em] text-muted-foreground">
                  {round.id} · threshold {round.minScore}
                </span>
              )}
            </div>
          </div>

          <Reveal>
            <div className="paper-card p-5 sm:p-7">
              <div className="mb-5 flex items-center justify-between gap-3 border-b border-border pb-4">
                <div>
                  <p className="label">Active rubric</p>
                  <p className="mt-1 line-clamp-1 text-[15px] text-ink">
                    {round?.title ?? "Sample community rubric"}
                  </p>
                </div>
                {round ? (
                  <StatusChip status={round.status} />
                ) : (
                  <span className="font-mono text-[9px] uppercase tracking-[0.14em] text-muted-foreground">
                    sample
                  </span>
                )}
              </div>
              <RubricView rubric={rubric} />
            </div>
          </Reveal>
        </div>
      </div>
    </section>
  );
}

export function ConsensusSection({
  proposal,
  rubric,
  threshold,
}: {
  proposal?: Proposal;
  rubric?: Rubric;
  threshold?: number;
}) {
  return (
    <section id="consensus" className="scroll-mt-24 border-b border-border">
      <div className="shell py-20 sm:py-24">
        <div className="relative overflow-hidden rounded-2xl bg-forest px-5 py-10 text-paper sm:px-10 sm:py-12">
          <div
            className="pointer-events-none absolute inset-0 opacity-[0.16]"
            style={{
              backgroundImage:
                "radial-gradient(circle at 1px 1px, rgba(246,243,236,0.55) 1px, transparent 0)",
              backgroundSize: "22px 22px",
            }}
            aria-hidden="true"
          />
          <div className="relative grid items-start gap-10 lg:grid-cols-[0.85fr_1.15fr] lg:gap-14">
            <div>
              <p className="font-mono text-[10px] uppercase tracking-[0.22em] text-paper/55">
                Consensus
              </p>
              <h2 className="mt-5 font-serif text-[clamp(36px,4.8vw,56px)] leading-[1.02] tracking-tight text-paper">
                Not a
                <br />
                black box.
              </h2>
              <p className="mt-5 max-w-md text-[15px] leading-relaxed text-paper/70">
                A single validator can be wrong; that&apos;s why every validator runs its
                own evaluation from the same evidence. The contract compares final
                decisions — approve or reject — and only writes state when they all
                agree.
              </p>

              <ul className="mt-8 space-y-4">
                {[
                  {
                    icon: Sparkles,
                    title: "Independent scoring",
                    body: "No lead score is taken at face value; validators re-evaluate the entire rubric.",
                  },
                  {
                    icon: Files,
                    title: "Evidence you can inspect",
                    body: "Evidence URLs are stored on-chain, including quotes and reasoning per criterion.",
                  },
                  {
                    icon: Gavel,
                    title: "Consensus failure = no payout",
                    body: "A disagreeing transaction stays undetermined. The treasury doesn't move.",
                  },
                ].map((item) => (
                  <li key={item.title} className="flex gap-3">
                    <span className="mt-0.5 grid size-7 shrink-0 place-items-center rounded-full border border-paper/20 bg-paper/[0.06] text-paper/80">
                      <item.icon className="size-3.5" />
                    </span>
                    <div>
                      <p className="text-sm font-medium text-paper">{item.title}</p>
                      <p className="mt-0.5 text-[12px] leading-relaxed text-paper/60">
                        {item.body}
                      </p>
                    </div>
                  </li>
                ))}
              </ul>
            </div>

            <Reveal>
              <div className="paper-card overflow-hidden text-ink">
                <div className="flex flex-wrap items-center justify-between gap-2 border-b border-border bg-card px-5 py-3.5">
                  <div className="flex items-center gap-2">
                    <span className="label">Consensus evidence</span>
                    {proposal && (
                      <span className="font-mono text-[9px] uppercase tracking-[0.12em] text-muted-foreground">
                        {proposal.id}
                      </span>
                    )}
                  </div>
                  {proposal ? (
                    <Link
                      href={`/proposals/${proposal.id}`}
                      className="inline-flex items-center gap-1 font-mono text-[9px] uppercase tracking-[0.12em] text-forest transition-opacity hover:opacity-70"
                    >
                      open detail <ArrowUpRight className="size-3" />
                    </Link>
                  ) : (
                    <span className="font-mono text-[9px] uppercase tracking-[0.12em] text-muted-foreground">
                      no evaluations yet
                    </span>
                  )}
                </div>

                {proposal ? (
                  <div className="p-5 sm:p-6">
                    <div className="mb-4 border-b border-border pb-4">
                      <p className="text-[16px] leading-snug text-ink">{proposal.title}</p>
                      <p className="mt-1 font-mono text-[9px] uppercase tracking-[0.14em] text-muted-foreground">
                        asks {formatGenUnit(proposal.requestedAtto, 2)} · round{" "}
                        {proposal.roundId}
                      </p>
                    </div>
                    <ConsensusResult
                      proposal={proposal}
                      rubric={rubric}
                      threshold={threshold}
                      compact
                    />
                  </div>
                ) : (
                  <div className="space-y-3 p-5 sm:p-6">
                    <p className="text-sm leading-relaxed text-muted-foreground">
                      No proposals have finished evaluation yet. Once the first
                      evaluation completes, the consensus summary — scores, gates,
                      evidence quotes, and decision reasoning — will appear here.
                    </p>
                    <div className="grid gap-2">
                      {[
                        "Pull evidence from public URLs",
                        "Score 0–5 per weighted criterion",
                        "Check all gates and the score threshold",
                        "Compare decisions across validators",
                      ].map((line, index) => (
                        <div
                          key={line}
                          className="flex items-center gap-3 rounded-md border border-border/70 bg-background/50 px-3 py-2.5"
                        >
                          <span className="font-mono text-[9px] text-brass">
                            {String(index + 1).padStart(2, "0")}
                          </span>
                          <span className="text-xs text-muted-foreground">{line}</span>
                        </div>
                      ))}
                    </div>
                  </div>
                )}

                {proposal?.rationale && (
                  <p className="border-t border-border bg-secondary/30 px-5 py-3 font-mono text-[9px] uppercase leading-relaxed tracking-[0.1em] text-muted-foreground">
                    {shortHash(proposal.id)} · evaluation stored on-chain
                  </p>
                )}
              </div>
            </Reveal>
          </div>
        </div>
      </div>
    </section>
  );
}

export function ExploreCards() {
  const items = [
    {
      href: "/how-it-works",
      icon: CircleDot,
      label: "How it works",
      body: "Four steps from community funding to a legitimate payout.",
    },
    {
      href: "/rubric",
      icon: Files,
      label: "Rubric & gates",
      body: "Weighted criteria and mandatory gates applied to every proposal.",
    },
    {
      href: "/consensus",
      icon: Gavel,
      label: "Consensus",
      body: "How AI validators reach a shared decision before any funds move.",
    },
  ];

  return (
    <section className="border-b border-border">
      <div className="shell py-16 sm:py-20">
        <p className="label">Explore the docs</p>
        <h2 className="display mt-4 text-[clamp(30px,3.8vw,44px)] text-ink">
          Every rule, open for anyone to read.
        </h2>
        <div className="mt-8 grid gap-4 sm:grid-cols-3">
          {items.map((item, index) => (
            <Reveal key={item.href} delay={index * 70}>
              <Link
                href={item.href}
                className="group flex h-full flex-col rounded-lg border border-border bg-card p-5 transition hover:border-forest/40 hover:shadow-sm"
              >
                <item.icon className="size-4 text-forest" />
                <p className="mt-4 text-[16px] text-ink transition-colors group-hover:text-forest">
                  {item.label}
                </p>
                <p className="mt-1.5 text-[13px] leading-relaxed text-muted-foreground">
                  {item.body}
                </p>
                <span className="mt-auto pt-4 inline-flex items-center gap-1 font-mono text-[9px] uppercase tracking-[0.14em] text-muted-foreground transition-colors group-hover:text-forest">
                  page <ArrowUpRight className="size-3" />
                </span>
              </Link>
            </Reveal>
          ))}
        </div>
      </div>
    </section>
  );
}

export function CallToAction() {
  return (
    <section className="border-b border-border">
      <div className="shell py-20 sm:py-24">
        <Reveal>
          <div className="grid items-center gap-8 rounded-2xl border border-border bg-card p-6 sm:p-10 lg:grid-cols-[1.2fr_0.8fr]">
            <div>
              <p className="label">Start here</p>
              <h2 className="display mt-4 text-[clamp(34px,4.4vw,52px)] text-ink">
                Open a round, or submit
                <br />
                your first proposal.
              </h2>
              <p className="mt-4 max-w-lg text-[14px] leading-relaxed text-muted-foreground">
                Applicants need a wallet and public evidence. The contract owner can
                create new rounds, set the rubric, and disburse approved proposals.
              </p>
            </div>
            <div className="flex flex-col gap-2.5 lg:items-end">
              <Button asChild size="xl" className="w-full lg:w-auto">
                <Link href="/rounds">
                  View all rounds <ArrowRight className="size-4" />
                </Link>
              </Button>
              <Button asChild size="xl" variant="outline" className="w-full lg:w-auto">
                <Link href="/admin">
                  <Landmark className="size-4" />
                  Owner panel
                </Link>
              </Button>
              <p className="mt-1 font-mono text-[8px] uppercase tracking-[0.16em] text-muted-foreground lg:text-right">
                GenLayer Studio · chain 61999
              </p>
            </div>
          </div>
        </Reveal>
      </div>
    </section>
  );
}
