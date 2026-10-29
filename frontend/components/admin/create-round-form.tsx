"use client";

import * as React from "react";
import Link from "next/link";
import {
  AlertTriangle,
  ArrowRight,
  CalendarDays,
  Check,
  ChevronDown,
  CircleDollarSign,
  FileJson,
  Gavel,
  Loader2,
  Plus,
  Scale,
  Send,
  Trash2,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { TxFeedback } from "@/components/shared/tx-feedback";
import { queryKeys, useRounds } from "@/hooks/use-contract";
import { useTx } from "@/hooks/use-tx";
import { CONTRACT_ADDRESS } from "@/lib/config";
import {
  formatGenUnit,
  fromDatetimeLocal,
  genInputValue,
  isFutureIso,
  parseGen,
  toDatetimeLocal,
} from "@/lib/format";
import { cn } from "cn";

type CriterionDraft = {
  key: number;
  id: string;
  weight: string;
  question: string;
};

type GateDraft = {
  key: number;
  id: string;
  question: string;
};

const ID_PATTERN = /^[a-z][a-z0-9_]{0,31}$/;

let draftKey = 100;

function defaultCriteria(): CriterionDraft[] {
  return [
    {
      key: draftKey++,
      id: "impact",
      weight: "30",
      question:
        "How large is the provable impact for the community, with clear numbers or outcomes?",
    },
    {
      key: draftKey++,
      id: "evidence",
      weight: "25",
      question:
        "Is the public evidence strong enough, relevant, and verifiable without extra assumptions?",
    },
    {
      key: draftKey++,
      id: "feasibility",
      weight: "25",
      question:
        "Is the work plan realistic, clearly phased, and within the team's capacity?",
    },
    {
      key: draftKey++,
      id: "cost",
      weight: "20",
      question:
        "Is the requested budget reasonable for the promised outcomes?",
    },
  ];
}

function defaultGates(): GateDraft[] {
  return [
    {
      key: draftKey++,
      id: "original_work",
      question:
        "This work is original and not a resubmission from a previous round.",
    },
    {
      key: draftKey++,
      id: "public_evidence",
      question: "All evidence links are publicly accessible without a login.",
    },
  ];
}

function idProblem(value: string): string | null {
  if (!value.trim()) return "id is required.";
  if (!ID_PATTERN.test(value.trim())) {
    return "Use lowercase letters, numbers, and _ (starting with a letter).";
  }
  return null;
}

function RowError({ children }: { children?: React.ReactNode }) {
  if (!children) return null;
  return <p className="mt-1 text-[10px] leading-relaxed text-rust">{children}</p>;
}

export function CreateRoundForm({ paused = false }: { paused?: boolean }) {
  const rounds = useRounds();
  const tx = useTx();

  const [title, setTitle] = React.useState("");
  const [description, setDescription] = React.useState("");
  const [budget, setBudget] = React.useState("20");
  const [maxGrant, setMaxGrant] = React.useState("5");
  const [minScore, setMinScore] = React.useState("60");
  const [deadline, setDeadline] = React.useState(() =>
    toDatetimeLocal(new Date(Date.now() + 14 * 24 * 60 * 60 * 1000)),
  );
  const [criteria, setCriteria] = React.useState<CriterionDraft[]>(defaultCriteria);
  const [gates, setGates] = React.useState<GateDraft[]>(defaultGates);
  const [showJson, setShowJson] = React.useState(false);
  const [created, setCreated] = React.useState<{ count: number; title: string }>({
    count: 0,
    title: "",
  });

  const budgetAtto = parseGen(budget);
  const maxGrantAtto = parseGen(maxGrant);
  const minScoreNumber = Number(minScore);
  const deadlineIso = fromDatetimeLocal(deadline);

  const totalWeight = criteria.reduce((sum, item) => {
    const weight = Number(item.weight);
    return sum + (Number.isFinite(weight) ? weight : 0);
  }, 0);

  const criterionIds = criteria.map((item) => item.id.trim());
  const gateIds = gates.map((item) => item.id.trim());

  const criteriaErrors = criteria.map((item) => ({
    id:
      idProblem(item.id) ??
      (criterionIds.filter((id) => id === item.id.trim()).length > 1
        ? "duplicate id."
        : null),
    weight:
      !Number.isInteger(Number(item.weight)) || Number(item.weight) <= 0
        ? "Weight must be an integer > 0."
        : null,
    question: item.question.trim() ? null : "Question is required.",
  }));

  const gateErrors = gates.map((item) => ({
    id:
      idProblem(item.id) ??
      (gateIds.filter((id) => id === item.id.trim()).length > 1
        ? "duplicate id."
        : null),
    question: item.question.trim() ? null : "Question is required.",
  }));

  const issues: string[] = [];
  if (paused) {
    issues.push("The contract is paused, so create_round is rejected until it is unpaused.");
  }
  if (!title.trim()) issues.push("Round title is missing.");
  else if (title.length > 160) issues.push("Title must be at most 160 characters.");
  if (description.length > 2000) issues.push("Description must be at most 2000 characters.");
  if (budgetAtto === null || budgetAtto <= 0n) {
    issues.push("Budget must be greater than 0 GEN.");
  }
  if (maxGrantAtto === null || maxGrantAtto <= 0n) {
    issues.push("Cap per proposal must be greater than 0 GEN.");
  } else if (budgetAtto !== null && maxGrantAtto > budgetAtto) {
    issues.push("Cap per proposal cannot exceed the round budget.");
  }
  if (
    !Number.isInteger(minScoreNumber) ||
    minScoreNumber < 0 ||
    minScoreNumber > 100
  ) {
    issues.push("Score threshold must be an integer 0–100.");
  }
  if (!deadlineIso) issues.push("Deadline is missing.");
  else if (!isFutureIso(deadlineIso)) {
    issues.push("Deadline must be in the future.");
  }
  if (criteria.length < 1 || criteria.length > 8) {
    issues.push("The rubric needs 1–8 criteria.");
  }
  if (criteriaErrors.some((item) => item.id || item.weight || item.question)) {
    issues.push("Some criteria are not valid yet.");
  }
  if (totalWeight !== 100) {
    issues.push(`Total criterion weight must be 100 (currently ${totalWeight}).`);
  }
  if (gates.length < 1 || gates.length > 8) {
    issues.push("The rubric needs 1–8 gates.");
  }
  if (gateErrors.some((item) => item.id || item.question)) {
    issues.push("Some gates are not valid yet.");
  }

  const canSubmit = issues.length === 0 && !tx.isBusy && !paused;

  const updateCriterion = (
    key: number,
    field: keyof Omit<CriterionDraft, "key">,
    value: string,
  ) => {
    setCriteria((current) =>
      current.map((item) => (item.key === key ? { ...item, [field]: value } : item)),
    );
  };

  const updateGate = (key: number, field: keyof Omit<GateDraft, "key">, value: string) => {
    setGates((current) =>
      current.map((item) => (item.key === key ? { ...item, [field]: value } : item)),
    );
  };

  const rubricPayload = React.useMemo(
    () => ({
      criteria: criteria.map((item) => ({
        id: item.id.trim(),
        weight: Number(item.weight),
        question: item.question.trim(),
      })),
      gates: gates.map((item) => ({
        id: item.id.trim(),
        question: item.question.trim(),
      })),
    }),
    [criteria, gates],
  );

  const handleCreate = async () => {
    if (!canSubmit || tx.isBusy) return;
    if (budgetAtto === null || maxGrantAtto === null || !deadlineIso) return;

    setCreated({ count: rounds.data?.length ?? 0, title: title.trim() });

    await tx.run({
      label: "Creating round",
      send: (client) =>
        client.writeContract({
          address: CONTRACT_ADDRESS,
          functionName: "create_round",
          args: [
            title.trim(),
            description.trim(),
            JSON.stringify(rubricPayload),
            budgetAtto,
            maxGrantAtto,
            BigInt(minScoreNumber),
            deadlineIso,
          ],
          value: 0n,
        }),
      invalidate: [queryKeys.stats, queryKeys.rounds],
      successTitle: "Round created",
      successDescription: "The new round is recorded on-chain with its public rubric.",
      onSuccess: () => {
        setTitle("");
        setDescription("");
        setBudget("20");
        setMaxGrant("5");
        setMinScore("60");
        setDeadline(
          toDatetimeLocal(new Date(Date.now() + 14 * 24 * 60 * 60 * 1000)),
        );
        setCriteria(defaultCriteria());
        setGates(defaultGates());
      },
    });
  };

  const createdRound = tx.isSuccess
    ? rounds.data?.find(
        (round, index) =>
          index === created.count && round.title === created.title,
      )
    : undefined;

  return (
    <section>
      <div className="flex items-end justify-between gap-3 border-b border-border pb-4">
        <div>
          <p className="label">Create round</p>
          <h2 className="mt-1 text-[26px] text-ink">Publish a new round</h2>
        </div>
        <span className="font-mono text-[9px] uppercase tracking-[0.12em] text-muted-foreground">
          owner only
        </span>
      </div>

      {tx.isSuccess && (
        <div className="mt-5 overflow-hidden rounded-lg border border-forest/25 bg-forest/[0.04]">
          <div className="flex items-start gap-3 p-4">
            <span className="mt-0.5 grid size-5 shrink-0 place-items-center rounded-full bg-forest text-paper">
              <Check className="size-3" />
            </span>
            <div className="min-w-0 flex-1">
              <p className="text-sm font-medium text-ink">Round created successfully</p>
              <p className="mt-1 text-[12px] leading-relaxed text-muted-foreground">
                “{created.title}” is recorded. No funds are added yet; use the
                Fund round button on the round page to fill the treasury.
              </p>
              <div className="mt-3 flex flex-wrap gap-2">
                {createdRound ? (
                  <Button asChild size="sm">
                    <Link href={`/rounds/${createdRound.id}`}>
                      Open {createdRound.id} <ArrowRight className="size-3.5" />
                    </Link>
                  </Button>
                ) : (
                  <Button asChild size="sm" variant="outline">
                    <Link href="/rounds">View round list</Link>
                  </Button>
                )}
                <Button size="sm" variant="ghost" onClick={tx.reset}>
                  Close
                </Button>
              </div>
            </div>
          </div>
        </div>
      )}

      <div className="mt-6 grid items-start gap-8 lg:grid-cols-[1.35fr_0.65fr]">
        <div className="space-y-5">
          <div className="paper-card p-5 sm:p-6">
          <div className="flex items-center gap-2 border-b border-border pb-3.5">
            <span className="font-mono text-[10px] text-brass">01</span>
            <h3 className="text-[19px] text-ink">Round information</h3>
          </div>
          <div className="mt-4 space-y-4">
            <div>
              <div className="flex items-center justify-between">
                <Label htmlFor="round-title">Title</Label>
                <span
                  className={cn(
                    "font-mono text-[9px] tabular",
                    title.length > 160 ? "text-rust" : "text-muted-foreground",
                  )}
                >
                  {title.length}/160
                </span>
              </div>
              <Input
                id="round-title"
                value={title}
                onChange={(event) => setTitle(event.target.value)}
                placeholder="Example: Open Grants AI Governance — Batch 01"
                className="mt-1.5 h-11 bg-background"
                disabled={tx.isBusy}
              />
            </div>
            <div>
              <div className="flex items-center justify-between">
                <Label htmlFor="round-description">Description</Label>
                <span className="font-mono text-[9px] tabular text-muted-foreground">
                  {description.length}/2000
                </span>
              </div>
              <Textarea
                id="round-description"
                value={description}
                onChange={(event) => setDescription(event.target.value)}
                placeholder="The round's purpose, what kinds of work are funded, and what is not funded. Visible publicly."
                className="mt-1.5 min-h-[110px] bg-background text-[13px] leading-relaxed"
                disabled={tx.isBusy}
              />
            </div>
          </div>
        </div>

        <div className="paper-card p-5 sm:p-6">
          <div className="flex items-center gap-2 border-b border-border pb-3.5">
            <span className="font-mono text-[10px] text-brass">02</span>
            <h3 className="text-[19px] text-ink">Budget &amp; limits</h3>
          </div>
          <div className="mt-4 grid gap-4 sm:grid-cols-2">
            <div>
              <Label htmlFor="round-budget">Round budget</Label>
              <div className="relative mt-1.5">
                <Input
                  id="round-budget"
                  inputMode="decimal"
                  value={budget}
                  onChange={(event) => setBudget(event.target.value)}
                  className="h-11 bg-background pr-14 font-mono tabular"
                  disabled={tx.isBusy}
                />
                <span className="pointer-events-none absolute right-3 top-1/2 -translate-y-1/2 font-mono text-[10px] uppercase tracking-[0.12em] text-muted-foreground">
                  GEN
                </span>
              </div>
              <p className="mt-1.5 text-[10px] leading-relaxed text-muted-foreground">
                Allocation limit, not funds sent now.
              </p>
            </div>
            <div>
              <Label htmlFor="round-cap">Cap per proposal</Label>
              <div className="relative mt-1.5">
                <Input
                  id="round-cap"
                  inputMode="decimal"
                  value={maxGrant}
                  onChange={(event) => setMaxGrant(event.target.value)}
                  className="h-11 bg-background pr-14 font-mono tabular"
                  disabled={tx.isBusy}
                />
                <span className="pointer-events-none absolute right-3 top-1/2 -translate-y-1/2 font-mono text-[10px] uppercase tracking-[0.12em] text-muted-foreground">
                  GEN
                </span>
                <button
                  type="button"
                  onClick={() => setMaxGrant(genInputValue(budgetAtto as bigint))}
                  disabled={budgetAtto === null || budgetAtto <= 0n || tx.isBusy}
                  className="absolute -top-6 right-0 font-mono text-[9px] uppercase tracking-[0.12em] text-forest hover:underline disabled:text-muted-foreground disabled:no-underline"
                >
                  match the budget
                </button>
              </div>
              <p className="mt-1.5 text-[10px] leading-relaxed text-muted-foreground">
                Maximum amount a single proposal may request.
              </p>
            </div>
            <div>
              <Label htmlFor="round-min-score">Score threshold</Label>
              <div className="relative mt-1.5">
                <Input
                  id="round-min-score"
                  inputMode="numeric"
                  value={minScore}
                  onChange={(event) => setMinScore(event.target.value)}
                  className="h-11 bg-background pr-14 font-mono tabular"
                  disabled={tx.isBusy}
                />
                <span className="pointer-events-none absolute right-3 top-1/2 -translate-y-1/2 font-mono text-[10px] uppercase tracking-[0.12em] text-muted-foreground">
                  /100
                </span>
              </div>
              <p className="mt-1.5 text-[10px] leading-relaxed text-muted-foreground">
                Minimum score once every gate passes.
              </p>
            </div>
            <div>
              <Label htmlFor="round-deadline">Submission deadline</Label>
              <Input
                id="round-deadline"
                type="datetime-local"
                value={deadline}
                onChange={(event) => setDeadline(event.target.value)}
                className="mt-1.5 h-11 bg-background font-mono text-[12px]"
                disabled={tx.isBusy}
              />
              <p className="mt-1.5 text-[10px] leading-relaxed text-muted-foreground">
                After it passes, new proposals are rejected by the contract.
              </p>
            </div>
          </div>
        </div>

        <div className="paper-card p-5 sm:p-6">
          <div className="flex flex-wrap items-center justify-between gap-2 border-b border-border pb-3.5">
            <div className="flex items-center gap-2">
              <span className="font-mono text-[10px] text-brass">03</span>
              <h3 className="text-[19px] text-ink">Scoring criteria</h3>
            </div>
            <div className="flex items-center gap-2">
              <span
                className={cn(
                  "rounded-full border px-2.5 py-1 font-mono text-[9px] uppercase tracking-[0.12em]",
                  totalWeight === 100
                    ? "border-forest/25 bg-forest/10 text-forest"
                    : "border-rust/30 bg-rust/10 text-rust",
                )}
              >
                total {totalWeight}/100
              </span>
              <span className="font-mono text-[9px] text-muted-foreground">
                {criteria.length}/8
              </span>
            </div>
          </div>

          <div className="mt-4 space-y-4">
            {criteria.map((item, index) => {
              const errors = criteriaErrors[index];
              return (
                <div
                  key={item.key}
                  className="rounded-lg border border-border/80 bg-background/60 p-3.5"
                >
                  <div className="flex items-center justify-between gap-2">
                    <span className="font-mono text-[9px] uppercase tracking-[0.12em] text-muted-foreground">
                      Criterion {String(index + 1).padStart(2, "0")}
                    </span>
                    <Button
                      type="button"
                      variant="ghost"
                      size="icon-xs"
                      onClick={() =>
                        setCriteria((current) =>
                          current.length === 1
                            ? current
                            : current.filter((entry) => entry.key !== item.key),
                        )
                      }
                      disabled={criteria.length === 1 || tx.isBusy}
                      aria-label="Delete criterion"
                    >
                      <Trash2 className="size-3" />
                    </Button>
                  </div>
                  <div className="mt-2 grid gap-2 sm:grid-cols-[1fr_96px]">
                    <div>
                      <Input
                        value={item.id}
                        onChange={(event) =>
                          updateCriterion(item.key, "id", event.target.value)
                        }
                        placeholder="impact"
                        className={cn(
                          "h-9 bg-background font-mono text-[11px]",
                          errors.id && "border-rust/50",
                        )}
                        disabled={tx.isBusy}
                        aria-label={`Criterion id ${index + 1}`}
                      />
                      <RowError>{errors.id}</RowError>
                    </div>
                    <div>
                      <div className="relative">
                        <Input
                          value={item.weight}
                          onChange={(event) =>
                            updateCriterion(item.key, "weight", event.target.value)
                          }
                          inputMode="numeric"
                          className={cn(
                            "h-9 bg-background pr-8 font-mono text-[11px] tabular",
                            errors.weight && "border-rust/50",
                          )}
                          disabled={tx.isBusy}
                          aria-label={`Criterion weight ${index + 1}`}
                        />
                        <span className="pointer-events-none absolute right-2.5 top-1/2 -translate-y-1/2 font-mono text-[9px] text-muted-foreground">
                          %
                        </span>
                      </div>
                      <RowError>{errors.weight}</RowError>
                    </div>
                  </div>
                  <Textarea
                    value={item.question}
                    onChange={(event) =>
                      updateCriterion(item.key, "question", event.target.value)
                    }
                    placeholder="The question the validator must answer from the evidence."
                    className={cn(
                      "mt-2 min-h-[62px] bg-background text-[12px] leading-relaxed",
                      errors.question && "border-rust/50",
                    )}
                    disabled={tx.isBusy}
                    aria-label={`Criterion question ${index + 1}`}
                  />
                  <RowError>{errors.question}</RowError>
                </div>
              );
            })}
          </div>

          <div className="mt-3 flex flex-wrap items-center gap-2">
            <Button
              type="button"
              variant="outline"
              size="sm"
              onClick={() =>
                setCriteria((current) =>
                  current.length >= 8
                    ? current
                    : [
                        ...current,
                        {
                          key: draftKey++,
                          id: `criterion_${current.length + 1}`,
                          weight: "10",
                          question: "",
                        },
                      ],
                )
              }
              disabled={criteria.length >= 8 || tx.isBusy}
            >
              <Plus className="size-3.5" />
              Add criterion
            </Button>
            {totalWeight !== 100 && (
              <span className="font-mono text-[9px] uppercase tracking-[0.1em] text-rust">
                adjust weights until 100
              </span>
            )}
          </div>
        </div>

        <div className="paper-card p-5 sm:p-6">
          <div className="flex flex-wrap items-center justify-between gap-2 border-b border-border pb-3.5">
            <div className="flex items-center gap-2">
              <span className="font-mono text-[10px] text-brass">04</span>
              <h3 className="text-[19px] text-ink">Gate</h3>
            </div>
            <span className="font-mono text-[9px] uppercase tracking-[0.12em] text-muted-foreground">
              {gates.length}/8 · all must pass
            </span>
          </div>

          <div className="mt-4 space-y-3">
            {gates.map((item, index) => {
              const errors = gateErrors[index];
              return (
                <div
                  key={item.key}
                  className="rounded-lg border border-border/80 bg-background/60 p-3.5"
                >
                  <div className="flex items-center justify-between gap-2">
                    <span className="font-mono text-[9px] uppercase tracking-[0.12em] text-muted-foreground">
                      Gate {String(index + 1).padStart(2, "0")}
                    </span>
                    <Button
                      type="button"
                      variant="ghost"
                      size="icon-xs"
                      onClick={() =>
                        setGates((current) =>
                          current.length === 1
                            ? current
                            : current.filter((entry) => entry.key !== item.key),
                        )
                      }
                      disabled={gates.length === 1 || tx.isBusy}
                      aria-label="Delete gate"
                    >
                      <Trash2 className="size-3" />
                    </Button>
                  </div>
                  <Input
                    value={item.id}
                    onChange={(event) => updateGate(item.key, "id", event.target.value)}
                    placeholder="original_work"
                    className={cn(
                      "mt-2 h-9 bg-background font-mono text-[11px]",
                      errors.id && "border-rust/50",
                    )}
                    disabled={tx.isBusy}
                    aria-label={`Gate id ${index + 1}`}
                  />
                  <RowError>{errors.id}</RowError>
                  <Textarea
                    value={item.question}
                    onChange={(event) =>
                      updateGate(item.key, "question", event.target.value)
                    }
                    placeholder="An absolute condition that must be clearly proven."
                    className={cn(
                      "mt-2 min-h-[54px] bg-background text-[12px] leading-relaxed",
                      errors.question && "border-rust/50",
                    )}
                    disabled={tx.isBusy}
                    aria-label={`Gate question ${index + 1}`}
                  />
                  <RowError>{errors.question}</RowError>
                </div>
              );
            })}
          </div>

          <Button
            type="button"
            variant="outline"
            size="sm"
            className="mt-3"
            onClick={() =>
              setGates((current) =>
                current.length >= 8
                  ? current
                  : [
                      ...current,
                      {
                        key: draftKey++,
                        id: `gate_${current.length + 1}`,
                        question: "",
                      },
                    ],
              )
            }
            disabled={gates.length >= 8 || tx.isBusy}
          >
            <Plus className="size-3.5" />
            Add gate
          </Button>
        </div>

        <div className="paper-card overflow-hidden">
          <button
            type="button"
            onClick={() => setShowJson((current) => !current)}
            className="flex w-full items-center justify-between gap-3 px-5 py-4 text-left"
          >
            <span className="flex items-center gap-2">
              <FileJson className="size-3.5 text-muted-foreground" />
              <span className="label">Rubric JSON preview</span>
            </span>
            <ChevronDown
              className={cn(
                "size-4 text-muted-foreground transition-transform",
                showJson && "rotate-180",
              )}
            />
          </button>
          {showJson && (
            <pre className="max-h-72 overflow-auto border-t border-border bg-secondary/30 px-5 py-4 font-mono text-[10px] leading-relaxed text-foreground/70">
              {JSON.stringify(rubricPayload, null, 2)}
            </pre>
          )}
        </div>
        </div>

        <aside className="space-y-3 lg:sticky lg:top-24">
          <ReviewPanel
            issues={issues}
            budget={budgetAtto}
            cap={maxGrantAtto}
            minScore={minScoreNumber}
            deadline={deadlineIso}
            criteriaCount={criteria.length}
            gateCount={gates.length}
            totalWeight={totalWeight}
            busy={tx.isBusy}
            canSubmit={canSubmit}
            onCreate={handleCreate}
          />
          {tx.state.phase !== "idle" && (
            <TxFeedback
              state={tx.state}
              onReset={tx.reset}
              successTitle="Round created"
              successDescription="The new round is recorded on-chain."
            />
          )}
        </aside>
      </div>
    </section>
  );
}

function ReviewPanel({
  issues,
  budget,
  cap,
  minScore,
  deadline,
  criteriaCount,
  gateCount,
  totalWeight,
  busy,
  canSubmit,
  onCreate,
}: {
  issues: string[];
  budget: bigint | null;
  cap: bigint | null;
  minScore: number;
  deadline: string;
  criteriaCount: number;
  gateCount: number;
  totalWeight: number;
  busy: boolean;
  canSubmit: boolean;
  onCreate: () => Promise<void>;
}) {
  return (
    <div className="paper-card p-5">
      <div className="flex items-center gap-2 border-b border-border pb-3">
        <Scale className="size-3.5 text-forest" />
        <p className="label">Review</p>
      </div>
      <dl className="mt-3 space-y-2">
        {[
          {
            icon: CircleDollarSign,
            label: "Budget",
            value: budget !== null ? formatGenUnit(budget, 2) : "—",
          },
          {
            icon: CircleDollarSign,
            label: "Cap",
            value: cap !== null ? formatGenUnit(cap, 2) : "—",
          },
          {
            icon: Gavel,
            label: "Threshold",
            value: `${Number.isFinite(minScore) ? minScore : "—"}/100`,
          },
          {
            icon: CalendarDays,
            label: "Deadline",
            value: deadline
              ? new Date(deadline).toLocaleDateString("en-GB", {
                  dateStyle: "medium",
                })
              : "—",
          },
          {
            icon: Scale,
            label: "Rubric",
            value: `${criteriaCount} criteria · ${totalWeight}/100`,
          },
          {
            icon: Check,
            label: "Gate",
            value: `${gateCount} conditions`,
          },
        ].map((row) => (
          <div key={row.label} className="flex items-center justify-between gap-3">
            <dt className="inline-flex items-center gap-1.5 font-mono text-[9px] uppercase tracking-[0.1em] text-muted-foreground">
              <row.icon className="size-3" />
              {row.label}
            </dt>
            <dd className="font-mono text-[10px] tabular text-ink">{row.value}</dd>
          </div>
        ))}
      </dl>

      {issues.length > 0 ? (
        <div className="mt-4 rounded-md border border-brass/30 bg-brass/[0.05] p-3">
          <p className="flex items-center gap-1.5 font-mono text-[9px] uppercase tracking-[0.12em] text-brass">
            <AlertTriangle className="size-3" />
            {issues.length} items to fix
          </p>
          <ul className="mt-1.5 space-y-1">
            {issues.slice(0, 4).map((issue) => (
              <li
                key={issue}
                className="text-[10px] leading-relaxed text-muted-foreground"
              >
                · {issue}
              </li>
            ))}
            {issues.length > 4 && (
              <li className="text-[10px] text-muted-foreground">
                · and {issues.length - 4} more
              </li>
            )}
          </ul>
        </div>
      ) : (
        <p className="mt-4 flex items-center gap-1.5 rounded-md border border-forest/25 bg-forest/[0.05] px-3 py-2 text-[10px] leading-relaxed text-forest">
          <Check className="size-3" />
          All requirements are met.
        </p>
      )}

      <Button
        size="xl"
        className="mt-4 w-full"
        onClick={() => void onCreate()}
        disabled={!canSubmit || busy}
      >
        {busy ? (
          <>
            <Loader2 className="size-4 animate-spin" />
            Publishing…
          </>
        ) : (
          <>
            <Send className="size-4" />
            Publish round
          </>
        )}
      </Button>
      <p className="mt-2 text-[10px] leading-relaxed text-muted-foreground">
        The round opens as soon as the transaction is recorded. Funds are added
        separately via the Fund round button.
      </p>
    </div>
  );
}
