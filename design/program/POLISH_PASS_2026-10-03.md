<!-- LIFETIME: ACTIVE_PROGRAM -->
# Cross-area polish & review pass — opened 2026-10-03

Owner ask (2026-10-03): *a documented research and review/polish pass across all areas of the game,
systematically looking for small improvements, debugging, and polishing — every area just needs
more attention.* This file is the pass record: what was reviewed, what was found, what was fixed,
what was ledgered, and how the next session continues the pass. It is **not** a second defect
list — every defect-shaped finding ends in exactly one of: fixed (commit below), one row in
[`DEMO_READINESS_2026-09-20.md`](./DEMO_READINESS_2026-09-20.md) §6, or a note to a live lane that
already owns the file.

## Method

- Workflow runs through 2–3 parallel subagents per phase: **research** (read-only area reviews) →
  **plan** (main session verifies findings against the code) → **fix** (small fixes landed by
  exact pathspec on free paths) → **review** (a fresh agent re-reads the landed diffs).
- Rules of engagement: the four/five live `NOW.md` threads (devin-sweep-oct2, grok-oct3,
  devin-oct3-40, glm-infer-oct3, antigravity-oct3) own their exact claimed paths — findings there
  are recorded and ledgered, never edited by this pass. Everything else is fair game for small
  fixes. Verification: `npm run check:baseline` plus focused tests per landing; `--only=` subset
  re-runs after fixes.
- Severity policy (AGENTS.md §7 total-fix mode): small → fixed in this pass; medium → subagent
  fix inside the pass when the files are free, else one ledger row; big/unknown-cause → one
  ledger row.

## Area map (every area, one row each)

| Area | Scope reviewed | Health summary | Findings | Disposition |
|---|---|---|---|---|
| Core / sim / runtime | `src/core/**`, `src/runtime/**`, `src/sim/**`, `src/main.js` | _(filling after research phase)_ | — | — |
| Systems — hand/flight/verbs | free paths under `src/systems/**` | — | — | — |
| Systems — economy/world/life | free paths under `src/systems/**`, `src/economy/**`, `src/law/**` | — | — | — |
| AI / combat | `src/ai/**`, `src/combat/**`, combat systems | — | — | — |
| World / content / data | `src/world/**`, `src/data/**` (free paths) | — | — | — |
| Render / VFX | `src/render/**` (free paths) | — | — | — |
| UI / instrument | `src/ui/**`, `styles/**` (free paths) | — | — | — |
| Periphery | `src/audio/**`, `src/save/**`, `src/localization/**`, `src/story/**`, `src/characters/**`, `src/careers/**`, `src/nemesis/**`, `src/chronicler/**`, `src/physicalCargo/**`, `src/observability/**`, `src/presentation/**`, `src/balance/**`, `src/missions/**` | — | — | — |
| Tests / checks hygiene | `test/**`, `scripts/**` (imports/wiring only) | — | — | — |

## Landed fixes (this pass)

_(filled at end of pass — commit + one-line what/why each)_

## Ledger rows added by this pass

_(filled at end of pass)_

## Notes for the next pass session

_(filled at end of pass)_
