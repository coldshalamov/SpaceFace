<!-- LIFETIME: HISTORICAL -->
# PQ-045.causal-chain — receipt

```yaml
unit: PQ-045.causal-chain
resultCommit: 112dac9a (master; candidate chain bdb52e51 -> aabaf3e7 -> b76832e4 on fable/pq045-causal-chain)
date: 2026-08-10
workers: grok-4.5 (implement, fix pass 1), codex (fix pass 2), opus (adversarial review + causal re-review), fable controller (rulings, verification, integration)
verdict: PASS (focused_green; route acceptance stays with PQ-045.five-minute-h1)
```

## What changed

- `src/systems/traffic.js`: six-link Ceres causal chain (`ev_rich_seam_strike` →
  `ev_miner_calls_hauler` → `ev_patrol_scans_suspect` → `ev_disabled_hauler_recovery` →
  `ev_tender_services_miner` → `ev_cutter_strips_wreck`), concurrency cap 2, timer/ledger
  choreography only, ledger transient and outside the save envelope.
- `test/ceres-causal-chain.test.mjs`: 16 focused deterministic tests, including three adversarial
  regressions that fail on the pre-repair code (interrupted-link continuation, terminal-destroy
  cycle completion, cargo-untouched-after-link-termination) and a `_cleanup()`-driven stamp-wipe
  test.
- Catalog notes corrected in `design/incubator/microevent_library/catalog/` (link 1, 2, 5 describe
  actual behavior).

## Review history (two-cycle adversarial loop)

1. Initial candidate `bdb52e51` REJECTED: interrupted link permanently killed the chain (B1);
   destroyed cast hull killed it across sessions (B2); false-positive death test (M3); second cargo
   writer minting ore into aiTrader (M4); zero visible consumer (M5); save-envelope stamp leak via
   persistent civilians (M6); continuous-exit fast-forward (M7). B1/B2/M4/M6 empirically probed.
2. Fix pass 1 `aabaf3e7` closed B1/B2/M3/M7 (re-review falsified the new tests against the old
   code: 5 fail pre-fix, 13/13 post) but reopened M4 through the restore path, left the M6 wipe
   ledger-scoped behind `_cleanup()`'s ordering, and pushed `redirectedSlots` before attempting a
   redirect.
3. Fix pass 2 `b76832e4` closed all three: redirect recorded only on success; restore reinstates
   the prior job id/entry directly (no path to `_assignManifest`); stamp wipe entity-scoped and
   reset ordered before the ledger empties.

## Controller rulings recorded

- Visibility rides existing owners only: the patrol redirect goes through the job-assignment seam
  with a proven assign/release/restore round trip; `ev_miner_calls_hauler` is stamp-only because
  the refinery hauler is a pinned real-target actor whose canonical routes must not be mutated;
  tender events are stamp-only because factionPresence owns tender jobs. Path A (in-place route
  mutation) was deleted as structurally incompatible with real-target actors.
- The render/VFX consumer of the `ceresCausal*` cue stamps belongs to Phase 3 leaves; the stamps
  are the seam, deliberately unconsumed today (catalog notes say so).

## What passed (worker-run and controller re-run)

- `node --test test/ceres-causal-chain.test.mjs` — 16/16 (re-run in primary at 112dac9a).
- `node --test test/ceres-active-pockets.test.mjs test/ceres-activity-traffic-cast.test.mjs
  test/ceres-visible-job-actions.test.mjs` — 71/71.
- `npm run check:baseline` — 11/11; sim/sim-v3/massline goldens unchanged (chain is gated on the
  Ceres sector id and consumes no RNG).

## What remains unproven / excluded

- Browser/Electron five-minute evidence and the human quiet-interval verdict remain with
  `PQ-045.five-minute-h1` (the sole holder of browser-gpu/validation-broker for this packet).
- No presentation consumer yet (Phase 3); the chain's ordinary-camera read currently comes from
  the real job motion of participants plus the patrol redirect.
- The rebase-on-re-entry path (`_rebaseCeresCausalPhaseEnds`) has no dedicated test (recorded gap,
  non-blocking).
