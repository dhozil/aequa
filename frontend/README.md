# Aequa Grants — frontend

Next.js 16 (App Router, Turbopack) + Tailwind v4 + shadcn/ui. All data is read directly from the
GenLayer contract on Studionet; there is no backend.

## Running

```bash
npm install
copy .env.example .env.local
npm run dev      # http://localhost:3000
npm run lint
npm run build
```

`.env.local` holds three variables:

| Variable | Content |
| --- | --- |
| `NEXT_PUBLIC_AEQUA_ADDRESS` | address of the `AequaGrants` contract |
| `NEXT_PUBLIC_RPC_URL` | `https://studio.genlayer.com/api` |
| `NEXT_PUBLIC_EXPLORER_URL` | `https://genlayer-explorer.vercel.app` |

## Pages

| Route | Content |
| --- | --- |
| `/` | Landing: live ledger hero + a short explanation of the project |
| `/how-it-works` | The four process steps + governance principles |
| `/rubric` | Active rubric, criterion weights, and gates |
| `/consensus` | Evidence of AI validator consensus on real proposals |
| `/rounds` | Round list + funding progress |
| `/rounds/[id]` | Rubric, treasury, owner actions, proposal list |
| `/rounds/[id]/submit` | Proposal form (validation, 1–3 evidence URLs, double-submit protection) |
| `/proposals/[id]` | Per-criterion scores, gates, evidence quotes, consensus reasoning |
| `/admin` | Owner panel: stats, create/close rounds, rubric builder, contract pause |

## Structure

```
app/                    # routes + layout shell (header, footer, loading, error, not-found)
components/ui/          # hero-financial (hero + live ledger) + hero-financial-utils (timeline, drawer, glow)
components/home/        # sections (flow, principles, rubric, consensus, CTA)
components/rounds/      # round list, detail, fund dialog, owner controls
components/proposals/   # submit form, detail, evaluate/disburse actions
components/admin/       # dashboard, rubric builder, round table
components/shared/      # status chip, score ring, error panel, tx feedback, consensus result
hooks/                  # wallet, tx state, contract queries, timers
lib/                    # config, types + normalizers, formatting, error mapping, RPC client
```

## Technical notes

- `genlayer-js` sends requests straight to the RPC from the browser. The wallet uses
  `window.ethereum`; write transactions cost no gas on Studionet but still need a signature.
- **A write is reported successful only after `FINALIZED`.** `ACCEPTED` means the leader proposed
  the transaction; consensus and execution are not settled yet. `hooks/use-tx.ts` also rejects a
  finalized transaction whose execution result is not `FINISHED_WITH_RETURN`, and callers pass a
  `verify` readback so a transaction that finalized without the expected state change is reported
  as a failure instead of a success.
- **Payouts are two-phase.** `disburse` moves a proposal to `payout_pending`; the UI shows
  "Confirm delivery" and "Transfer failed?" actions, and only `confirm_payout` (balance proves the
  funds left) marks it paid. `paid_atto`/`total_paid_atto` therefore lag until reconciliation.
- Studionet limits **500 `gen_call` per hour**. `hooks/use-contract.ts` uses a 60 second
  auto-refresh (20 seconds for `submitted` proposals), retries transport failures once, and React
  Query stops polling automatically while the tab is inactive. 429 responses carry no CORS
  headers, so they surface as `Failed to fetch`; `lib/errors.ts` maps them to an RPC limit message.
- **Scores, gate results, quotes, and source fingerprints are leader output**, not consensus
  output. Only the approve/reject decision is consensus-bound; the UI labels the rest accordingly.
  Quotes are blanked when they do not appear in the fetched evidence (`quote_verified: false`).
- Dynamic routes use `params.then(...)` inside `<Suspense>` (Next 16 Cache Components), so the
  shell can render before the URL is read.
- All UI copy is in English; product terms (round, proposal, gate, treasury) stay as they are.
