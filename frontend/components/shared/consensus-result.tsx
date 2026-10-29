import { Check, Clock3, Quote, ShieldCheck, X } from "lucide-react";
import { cn } from "cn";
import {
  decisionReasonLabel,
  titleFromId,
} from "@/lib/format";
import type { Proposal, Rubric } from "@/lib/types";
import { ScoreRing } from "./score-ring";

function GateGrid({
  rubric,
  gates,
}: {
  rubric?: Rubric;
  gates: Record<string, boolean>;
}) {
  const entries = rubric?.gates.length
    ? rubric.gates.map((gate) => ({
        id: gate.id,
        question: gate.question,
        ok: Boolean(gates[gate.id]),
      }))
    : Object.entries(gates).map(([id, ok]) => ({
        id,
        question: "",
        ok,
      }));

  return (
    <div className="grid gap-2 sm:grid-cols-2">
      {entries.map((gate) => (
        <div
          key={gate.id}
          className={cn(
            "flex items-start gap-2.5 rounded-md border px-3 py-2.5",
            gate.ok
              ? "border-forest/25 bg-forest/[0.04]"
              : "border-rust/25 bg-rust/[0.04]",
          )}
        >
          <span
            className={cn(
              "mt-0.5 grid size-4 shrink-0 place-items-center rounded-full",
              gate.ok ? "bg-forest text-paper" : "bg-rust text-paper",
            )}
          >
            {gate.ok ? <Check className="size-2.5" /> : <X className="size-2.5" />}
          </span>
          <div className="min-w-0">
            <p
              className={cn(
                "font-mono text-[10px] uppercase tracking-[0.14em]",
                gate.ok ? "text-forest" : "text-rust",
              )}
            >
              {titleFromId(gate.id)}
            </p>
            {gate.question && (
              <p className="mt-0.5 text-[11px] leading-relaxed text-muted-foreground">
                {gate.question}
              </p>
            )}
          </div>
        </div>
      ))}
    </div>
  );
}

function CriteriaTable({
  proposal,
  rubric,
  compact,
}: {
  proposal: Proposal;
  rubric?: Rubric;
  compact?: boolean;
}) {
  const weightOf = (id: string) =>
    rubric?.criteria.find((criterion) => criterion.id === id)?.weight ?? 0;

  return (
    <ul className="divide-y divide-border/70 border-y border-border/70">
      {proposal.criteria.map((criterion) => {
        const weight = weightOf(criterion.id);
        return (
          <li key={criterion.id} className={cn("py-3.5", compact && "py-3")}>
            <div className="flex items-start justify-between gap-4">
              <div className="min-w-0">
                <div className="flex flex-wrap items-baseline gap-2">
                  <p className="text-sm font-medium text-ink">
                    {titleFromId(criterion.id)}
                  </p>
                  {weight > 0 && (
                    <span className="font-mono text-[9px] uppercase tracking-[0.12em] text-muted-foreground">
                      weight {weight}
                    </span>
                  )}
                </div>
                {criterion.quote && (
                  <p className="mt-1.5 flex gap-1.5 text-xs italic leading-relaxed text-foreground/70">
                    <Quote className="mt-0.5 size-3 shrink-0 text-brass" />
                    <span className="min-w-0 [overflow-wrap:anywhere]">
                      {criterion.quote}
                      {!criterion.quoteVerified && (
                        <span className="ml-1.5 font-mono text-[9px] not-italic uppercase tracking-[0.1em] text-rust">
                          unverified
                        </span>
                      )}
                    </span>
                  </p>
                )}
                {!compact && criterion.reason && (
                  <p className="mt-1 text-[11px] leading-relaxed text-muted-foreground">
                    {criterion.reason}
                  </p>
                )}
              </div>
              <div className="shrink-0 text-right">
                <p className="font-mono text-sm tabular text-ink">
                  {criterion.score}
                  <span className="text-muted-foreground">/5</span>
                </p>
                <div className="mt-1.5 flex w-14 gap-[2px]">
                  {[1, 2, 3, 4, 5].map((step) => (
                    <span
                      key={step}
                      className={cn(
                        "h-[3px] flex-1 rounded-full",
                        step <= criterion.score ? "bg-forest" : "bg-border",
                      )}
                    />
                  ))}
                </div>
              </div>
            </div>
          </li>
        );
      })}
    </ul>
  );
}

export function ConsensusResult({
  proposal,
  rubric,
  threshold,
  compact = false,
  className,
}: {
  proposal: Proposal;
  rubric?: Rubric;
  threshold?: number;
  compact?: boolean;
  className?: string;
}) {
  if (proposal.status === "submitted") {
    return (
      <div
        className={cn(
          "rounded-lg border border-brass/30 bg-brass/[0.04] p-5",
          className,
        )}
      >
        <div className="flex items-start gap-3">
          <span className="mt-0.5 grid size-7 shrink-0 place-items-center rounded-full border border-brass/30 bg-brass/10 text-brass">
            <Clock3 className="size-3.5" />
          </span>
          <div className="min-w-0">
            <p className="text-sm font-medium text-ink">
              Waiting for validator evaluation
            </p>
            <p className="mt-1 text-sm leading-relaxed text-muted-foreground">
              This proposal has not been scored yet. When evaluation runs, every validator
              re-runs the rubric independently and must reach the same funding decision. The
              decision is consensus-bound; the per-criterion scores, gate results, and quotes
              are recorded from the leader run for transparency.
            </p>
            <ul className="mt-3 space-y-1.5 font-mono text-[10px] uppercase tracking-[0.12em] text-muted-foreground">
              <li>01 · Pull evidence from the public URLs</li>
              <li>02 · Score each criterion 0–5</li>
              <li>03 · Check gates, score threshold, and remaining budget</li>
              <li>04 · Compare decisions across validators</li>
            </ul>
          </div>
        </div>
      </div>
    );
  }

  const approved = proposal.decision === "approve";
  const tone = approved ? "forest" : "rust";

  return (
    <div className={cn("space-y-6", className)}>
      <div className="flex flex-col gap-5 sm:flex-row sm:items-center">
        <ScoreRing
          score={proposal.score}
          threshold={threshold}
          size={compact ? 112 : 132}
          tone={tone}
        />
        <div className="min-w-0 flex-1">
          <div className="flex flex-wrap items-center gap-2">
            <span
              className={cn(
                "inline-flex items-center gap-1.5 rounded-full border px-2.5 py-1 font-mono text-[10px] font-medium uppercase tracking-[0.16em]",
                approved
                  ? "border-forest/30 bg-forest/10 text-forest"
                  : "border-rust/30 bg-rust/10 text-rust",
              )}
            >
              {approved ? <Check className="size-3" /> : <X className="size-3" />}
              {approved ? "Approved" : "Rejected"}
            </span>
            <span className="inline-flex items-center gap-1.5 font-mono text-[10px] uppercase tracking-[0.14em] text-muted-foreground">
              <ShieldCheck className="size-3" />
              consensus decision
            </span>
          </div>
          <p className="mt-3 text-sm leading-relaxed text-ink/85">
            {decisionReasonLabel(proposal.decisionReason)}
          </p>
          {typeof threshold === "number" && (
            <p className="mt-1.5 font-mono text-[10px] uppercase tracking-[0.14em] text-muted-foreground">
              score {proposal.score}/100 · threshold {threshold}/100
            </p>
          )}
        </div>
      </div>

      <div>
        <p className="label mb-2.5">Gate</p>
        <GateGrid rubric={rubric} gates={proposal.gates} />
      </div>

      <div>
        <p className="label mb-2.5">Per-criterion scoring</p>
        <CriteriaTable proposal={proposal} rubric={rubric} compact={compact} />
      </div>

      {proposal.rationale && (
        <div className="rounded-md border border-border/80 bg-background/60 px-4 py-3">
          <p className="label mb-1.5">Scoring summary</p>
          <p className="text-sm leading-relaxed text-foreground/80">
            “{proposal.rationale}”
          </p>
        </div>
      )}

      <p className="font-mono text-[9px] uppercase leading-relaxed tracking-[0.12em] text-muted-foreground">
        Scores and quotes come from the leader run. Independent validators re-score the
        entire rubric and must reach the same decision before state changes.
      </p>
    </div>
  );
}
