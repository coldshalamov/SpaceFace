<!-- LIFETIME: CAMPAIGN -->
# special-500 debate protocol

Owner commission: 500 special in-game things (scripted encounters, one-off missions, easter eggs,
anomalies, comms events, visual set-pieces, world one-offs) built into SpaceFace on the default
adventure route. Round 1 produced 600 candidate proposals:

- `round1/sa1-encounters.md` — SP1-001…SP1-200 (encounters/missions lens)
- `round1/sa2-world.md` — SP2-001…SP2-200 (world/story/easter-egg/comms lens)
- `round1/sa3-spectacle.md` — SP3-001…SP3-200 (visual/VFX/audio spectacle lens)

Entry format in those files (7 fields):

```
### SP1-014 — The Wrecking Permit
- Kind: encounter | oneoff-mission | easter-egg | anomaly | comms-event | visual-setpiece | world-oneoff
- Where: <real sector id / 'any sector' / a rule>
- Trigger: <determinism-safe: simTime window / proximity / first-entry / persistent flag>
- The player sees(/hears): <what actually happens on screen>
- Payoff: <concrete>
- Build seam: <real file(s)>
- Effort: data | data+glue | bespoke
```

## Consensus target

Exactly **500 build entries + a ranked bench of 20 spares** (ranks 501–520), derived by the
mechanical rule below and ratified by all three debaters. The bench exists so an infeasible build
entry swaps out mechanically without reopening the debate.

## Round 2 — independent ballots (three debaters, parallel)

Each debater reads ALL THREE round-1 files in full (chunked Reads; ~1,860 lines each) and writes one
verdict file: `round2/debater-a-verdict.md` (Builder: feasibility/seams/perf/determinism),
`round2/debater-b-verdict.md` (Curator: player experience/variety/pacing/reward sanity),
`round2/debater-c-verdict.md` (Continuity: lore/faction/campaign coherence/persistence semantics).

Verdict file structure, in order:

1. `## Critique highlights` — the real problems: cross-lens duplicates (name both ids), clone
   families, seam lies, determinism violations, tone misses. Quote ids. Be specific and fair.
2. `## Hones` — one line per proposal you want KEPT but improved:
   `SP1-014 | HONE | <directive 1-2 sentences: what to change, what to add>` (optional section)
3. `## New proposals` — only replacements/fillers the pool needs; full 7-field entries, ids
   `SPX-A-01…` / `SPX-B-01…` / `SPX-C-01…` per debater. Same entry format as round 1. Mark each
   `replaces: <ids>` when it substitutes for killed entries.
4. `## Ballot` — machine-parseable, EVERY pool id (SP1-*, SP2-*, SP3-*) exactly once, one per line:
   `SP1-001 | KEEP | optional one-line reason`
   `SP1-002 | HONE | <hone directive>`   (counts as KEEP + registers the hone)
   `SP1-003 | MERGE->SP1-007 | reason`   (vote moves to target; target must be a KEEP for you)
   `SP1-004 | KILL | reason`
5. `## MY-500` — last section, one comma-separated line of EXACTLY 500 ids, best-first order
   (rank 1 = strongest), drawn from pool ids you voted KEEP/HONE/MERGE-target plus your own
   SPX-* proposals. Ordering is your editorial rank and breaks scoring ties.

Voting rules: vote your honest lens; you are ONE of three voices and the tally is mechanical.
You may vote KEEP on another lens's idea — cross-lens adoption is expected and good.

## Mechanical consensus (orchestrator applies after round 3)

- keeps(id) = KEEP + HONE votes + MERGE votes received; kills(id) = KILL votes.
- Survive iff keeps ≥ 2 AND keeps > kills.
- Score: sort survivors by keeps desc, then sum-of-debater-MY-500-ranks asc (lower = stronger).
- Fill 520 subject to hard constraints: each of the 7 kinds ≥ 25 entries and ≤ 120; bespoke
  ≤ 160 of 520; ≥ 45% of entries Effort data or data+glue; ≥ 10 distinct sectors represented;
  no two entries with near-identical cores (dedupe check by title/core).
- Ranks 1–500 = the build list; 501–520 = the bench (swap-in order).

## Round 3 — cross-examination (three debaters, parallel)

Each debater reads the other two round-2 verdict files (their critiques + ballots + new proposals)
and writes `round3/debater-<x>-final.md`:

1. Rebut: answer critiques of YOUR round-1 ideas you still defend (or concede); attack others'
   weak KEEP votes with named ids.
2. Adopt or reject the others' SPX-* proposals in your own MY-500.
3. `## FINAL-BALLOT` — same grammar, all 600 + all surviving SPX ids, exactly once each.
4. `## MY-500` — updated, exactly 500, best-first.

The orchestrator tallies FINAL ballots by the mechanical rule and writes
`CONSENSUS_500.md` (the full 520-ranked catalog with all fields) + `CONSENSUS_500.json`.

## Round 4 — ratification

Each debater reads the concrete consensus list and replies RATIFY, or names specific objections
(each with a concrete swap: remove id X, insert bench/rank-next id Y, reason). Uncontested swaps
apply; contested swaps go to a majority vote of the three; at most two ratification passes, then
the majority stands and the dissent is recorded in the file header. Ratification of the concrete
list by all three (or majority-after-two-passes, recorded) = consensus per the owner's instruction.

## Build-phase swap rule (pre-agreed, no debate reopening)

If the build proves an entry infeasible through its seam, swap in the highest bench rank that
matches the same Kind, note the swap in `BUILD_LOG.md`, and continue. The bench never reopens the
ballot. Infeasibility must be demonstrated (a failed wiring attempt or a seam that verifiably does
not exist), not felt.

## Ground rules for all debaters

- Read-only for the repo except your own verdict file. No commits. No NOW.md rows. No code edits.
- Honor repo law: determinism (simTime/rng/proximity/flags only), default-route reachability,
  no wall time, no dev-flag gating, payoffs plausible against a working-space economy.
- Tone: gritty lived-in working space, dry wit, physics-as-spectacle (design/GDD_2_0.md §1–§3).
- Quality bar beats volume: the owner rejects cheap stand-ins. A strong 500 needs honest kills.
