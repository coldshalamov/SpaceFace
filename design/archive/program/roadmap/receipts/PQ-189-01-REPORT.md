<!-- LIFETIME: RECEIPT -->
# PQ-189.01 — Acceptance polarity and stale orders, corrected in place

```text
DONE  PQ-189.01 — the instructions agents read no longer contradict each other on the things the 2026-09-05 audit could prove: the reviewer list can no longer reject a unit for being reachable, the feel scoreboard says what actually landed, the perf operator no longer orders a scheduler that shipped, and the README no longer says Space fires.
WHAT I FOUND     The map's reviewer checklist said "reject on any yes" and then asked two questions whose yes is the good answer; eight rows of the feel audit still read OPEN for work that landed this week; the perf operator told the next agent to build something another document records as shipped; the README's control table named a key that does something else.
WHAT I CHANGED   Split the checklist into blockers and required proofs; exempted controls and instruments from the two-consequences law; made the critic's count a coverage score with a hard blocker for a stand-in and let a cycle keep a declared tradeoff; scoped the quiet-window metric to combat; wrote what landed into feel rows A6–A13 and gave B8 admissible stroke geometry; pointed the perf operator at the production baseline instead of the shipped scheduler; fixed the README.
WHAT YOU WILL FEEL   Nothing in play. Agents given a unit will stop re-doing fixed work and stop rejecting reachable work.
THE NUMBERS      contradictions from audit Part 02 §2.2 resolved in the file they live in | 0 | 9 (rows 1, 4, 5, 6, 7, 9, 10, 11, 12, 13) | all confirmed rows
THE FRAMES       none — documentation truth, not a player-facing change
NEXT             PQ-189.00 the control contract, generated from the bindings
```

Files: `CANONICAL_BUILD_MAP.md` (§1.3 law 3, §1.6, §1.2, §1.7, §15.9b), `design/program/FUN_CONVERGENCE_LOOP.md` (§3.2, §3.3, §3.6), `design/FEEL_CONTRACT.md` (§A A6–A13, §B B8), `design/program/PERF_WHAT_MATTERS.md`, `README.md`. Verified: `node scripts/check-program-docs.mjs` green; `node --test test/program-control-tools.test.mjs` green. The audit itself is stored under `docs/handoffs/STUDIO_RECOVERY_AUDIT_2026-09-05/` (HISTORICAL) and its reference modules under `tools/reference/studio-recovery-audit-2026-09-05/` (33/33 tests locally).
