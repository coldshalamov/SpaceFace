<!-- LIFETIME: VOLATILE -->
# Headed-acceptance recovery — exact work after H1

Reconciled 2026-07-30 after H1 integrated at `bf825b4e`. Every corridor packet's headless layer is
integrated, but H1 produced three PASS rows and five exact HARNESS failures. The former standing
PQ-034 leases are released; claim-ready work now lives as `dispatchUnits` in
`program-queue.json` and is listed by `node scripts/program-dispatch.mjs --ready`. Exact claims and
receipts live in the queue; this file remains sequencing and review context only.

## Ordering rationale

1. Functional headed runs first (contention-tolerant: broker cells, captures, parity).
2. One consolidated human-verdict session (all art/legibility/motion judgments batched).
3. Matched-performance captures LAST, each in a quiet-machine window — per the NOW contention
   facts, a perf sample taken while anything else runs is not a measurement.

## Phase H1 — completed results

| Row | What runs | Upgrades |
|---|---|---|
| `check:assets:live` | **PASS** on real D3D11 GPU | functional authored admission closed; no timing claim |
| PQ-021 route | **PASS** Browser broker + Electron parity | H2 legibility/controller is ready |
| PQ-019A presentation | **FAIL — HARNESS**; facilities/counts survive, moving capsule missed | dispatch `PQ-019.capsule-capture-repair` |
| PQ-019C route | **FAIL — HARNESS**; DOM abandon + lawful observe survive | dispatch `PQ-019.route-harness-repair` |
| PQ-020 route | **FAIL — HARNESS** after valid Helios→Ceres jump | dispatch `PQ-020.route-harness-repair` |
| PQ-023 cues | **FAIL — HARNESS**; combat/reduced/dense subset survives | dispatch `PQ-023.cues-harness-repair` |
| PQ-022 asset leaves | **PASS** for 11 exact identities and 13 stills | H2 relay + broader asset dispositions are ready |
| Electron end-to-end | **FAIL — HARNESS** at a false-negative menu predicate | dispatch `PQ-041.electron-smoke-harness-repair` |

PQ-024 was implemented after the original batch was written but never received a headed route row.
Dispatch `PQ-024.survey-route-harness` to build its missing broker cell.

## Phase H2 — human gates that are ready now

Ready without reruns:

- `PQ-021.h2-legibility-controller`;
- `PQ-022.relay-human-verdict`;
- `PQ-022.corridor-assets-human-disposition` — this was missing from the old six-decision index even
  though the milestone required explicit station/furniture/traffic verdicts.

PQ-019, PQ-020, PQ-023, PQ-024, and the Cathedral verdict remain blocked until their named
repair/capture units produce valid evidence.

## Phase H3 — matched performance (quiet machine, one lane at a time)

| Row | Contract |
|---|---|
| PQ-020 Cathedral-keyed matched route | p95/p99/hitches, admission/residency, close/default/far/motion/LOD, entity/collider/query/draw/program — the receipt's `requiresHeaded` block |
| PQ-019A representative performance | matched normal + traffic-loaded facility route |
| PQ-023 dense-scene target/floor | matched before/after per the leaf budget declarations |
| PQ-019C matched route | per packet Phase E |

Precondition for any PQ-025 native cell later: the five perf owner-facts
(`docs/handoffs/2026-07-28-pq025-perf-read-seams-REQUEST.md`) must exist first — H3 rows above use
the packet-local harnesses and do not depend on them.

## Phase H4 — promotions and bindings (integrator, after H1–H3)

1. Upgrade receipts: PQ-019A/PQ-019C (→ parent PQ-019 promotion incl. W03/W04/W05 alias
   replacement), PQ-020 (→ `integrated` + PQ-018 Phase-4 closure and PQ-018 checkoff decision),
   PQ-021 (→ `route_accepted`/`integrated`), relay-collar (→ `route_accepted`).
2. Bind blobs: relay-collar receipt → `PQ-024.evidenceDependencies`; then PQ-024 implementation
   dispatches. Cues milestone receipt (→ `milestone_accepted`) → PQ-025 row; corridor-assets
   milestone receipt likewise once its three verdict-pending leaves pass H1/H2.
3. PQ-025: freeze matrix/rubric/profiles/retention, then Phase 2 calibration.

Retire this file when H4 completes; its content collapses into receipts and the queue.
