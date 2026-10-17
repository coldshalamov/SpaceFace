# Task BM16/BM17 — ADMIT-SFQ-B family lanes: SFQ-P12 (people/law) and SFQ-P17 (research/regional change)

Read first: `_constraints-codex.md`, build_map.md §M row 285 (the admission law: parallel lanes
per program family; prereqs whose outcome already exists in code close without waiting), and
`design/finish-expansion-2026-09/catalog/README.md`.

## Your job (two bounded family lanes, disposition + land)

Lane 1 — **SFQ-P12** (people/law, 10 candidates): `SFQ-B` ids with `program_id == SFQ-P12` in
`design/finish-expansion-2026-09/catalog/build_candidates.csv`; briefs at
`design/finish-expansion-2026-09/builds/<id>.md`.
Lane 2 — **SFQ-P17** (research/regional change, 9 candidates), same pattern.

For each candidate, outcome-map it against the current tree:
- If the live code already delivers the outcome, close it **already-true** and name the exact
  file/test evidence (one line each).
- If there is a real gap inside a single writer's existing API, **mint + land it** in this job:
  minimal implementation + focused seed-4242 test, minted as build_map row 357+ (the lane band
  348–361; rows 348–356 are taken by the mission lane — use 357 upward in mint order), and delete
  the row is NOT your job (orchestrator closes rows on landing verification).
- If the gap belongs to a system another worker is landing right now (economy truth, law memory,
  mission lane rows 348–356, ORRERY typography, D198/D203 perf), mark it **LANDS-WITH** that row
  instead of implementing a second copy.

## Done when

- A disposition table for both families: every candidate → already-true (evidence) | LANDED (row
  #, test) | LANDS-WITH (row #) | PARKED (why, one sentence).
- Landed units each have their focused test green.
- No second queue, no new engine, no invented systems.
