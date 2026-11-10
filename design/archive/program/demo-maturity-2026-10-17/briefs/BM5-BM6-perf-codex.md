# Task BM5+BM6 — the two performance ledger legs, run on a QUIET machine

Read first: `_constraints-codex.md`, ledger rows D191 and D130 in
`design/program/DEMO_READINESS_2026-09-20.md` §6, and `build_map.md` §21.4 (the frame-solid
plan). The machine is quiet now — no other workers are running. Do BM5 first, then BM6, in this
one sitting. Report contention honestly if anything else loads the host.

## BM5 — D191 Ceres refinery pocket: name the causal owner, then own it

The row's law: "Next work needs a causal owner within the dominant solve/guard or AI phases;
repeating the same top-level census adds no material evidence." Current seed-14920 attribution
places physics 4.42 ms, tacticalAI 2.13 ms, FlightV3 1.19 ms/tick, with 3.07/4.11 ms inside the
native solve/guard step that does not isolate safely.

1. Use `node scripts/probe-frame-solid.mjs --cpu-profile` on the Ceres pocket route (seed 14920)
   to attribute the dominant phase below the top-level census line — which functions inside the
   solve/guard step or tacticalAI pay, on real bodies.
2. Fix the named owner without reducing authored population or quality (allocation, cadence,
   batching, culling, math — the usual levers). One leg, not a campaign.
3. Compare against `.devshots` baselines per §21.4 (`--compare=<earlier .json>`).

## BM6 — D130 Adventure sustained flight: the main-thread/GPU owner

The row: "identify the current Adventure main-thread/GPU owner, optimize it without reducing
authored quality, then directly compare." Earlier frozen comparison: early 36.5→34.3
submissions/s; settled 35.3→38.1/s, p99 65.0 ms.

1. Attribute with `probe-frame-solid --cpu-profile` on the ordinary Adventure flight route.
2. One optimization leg on the named owner. Directly compare, same instrument.
3. Do NOT claim a quiet-host certification beyond this box; report what was measured.

## Done when

- Per leg: named owner (function-level), the fix, before/after numbers from the same
  instrument, focused tests green. Update nothing in the ledger; report and the orchestrator
  closes/keeps rows.
- If a leg's attribution shows the residual is already clean at HEAD, that is a valid outcome —
  report the evidence.
