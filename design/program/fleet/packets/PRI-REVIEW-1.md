# PRI-REVIEW-1 — Senior review of the PR-intake commits of 2026-11-14 (no code edits)

**Senior agent (Codex).** You change no file except your report:
`design/program/fleet/reviews/2026-11-14-pr-intake.md` (create it; do not commit it — the lead does).

On 2026-11-14 the lead landed the open pull requests onto `master`: some merged as they were, most
re-landed or rebuilt by headless workers (Devin SWE-2 Max) from packets in
`design/program/fleet/packets/PRI-*.md`, with the rules in `design/program/fleet/PR-INTAKE.md`. The lead
read some diffs and caught two real bugs (a simulation module importing station-screen code; a lane
forward-set regeneration that dropped events). Find what the lead missed.

## What to review
`git log --oneline 8ef4225cd0fb..HEAD --grep="fleet(PRI-" --grep="lands PR" --grep="port of PR" --grep="fix(save)" --grep="PRI-0.* review"`
Read each commit's diff (`git show <hash> -- src scripts`). Priority order — spend your effort here first:
1. `852e630de5` — `src/save/saveSystem.js` (#980): stale-request fencing, `_emitRestoreStarted`, import
   `requireCommit`, deferred run transitions. Any path where a load can now be dropped silently, double-commit,
   leave `_restoring` latched, or end/keep a run wrongly.
2. `cef2ab0e8c`, `4227d9e81f` — outposts: `src/systems/automation.js`, `economy.js`, `outpostOperations.js`,
   `src/ui/screens/automationPanel.js`: money or cargo created or destroyed, double payment across save →
   Continue or offline catch-up, orders that do not cross the worker lane.
3. `ae71f8a297`, `2a3a9666fe`, `f05c1ec283` — residents on the radio: `src/systems/scanner.js`,
   `src/data/stationContactPresence.js`, `src/systems/missionBoardOps.js` (`contactOfferReadiness`),
   `src/core/mainToSimEventSurface.js`: a contract accepted over radio that should not be; stale channel replay.
4. `e3ab24bcbf..28dada57dc`, `f5dd833925` — Frontier households (`src/systems/faction_frontier.js`,
   `src/missions/frontierReceivingTags.js`): per-tick cost, duplicate crate/marker on Continue, tag leaks.
5. `f9503b8b25`, `05879ec1b4`, `a18d147ed7` — course-victory gate (`src/data/survivalCourse.js`) and the
   wave-20 plate fight (`src/systems/foundryPlateTheft.js`, `survivalArena.js`, `survivalRewards.js`): a
   genuine Swarm round-30 win that no longer counts; a bonus paid twice; a leaked attachment.
6. `91ac977809` — survivor rescue repricing (`survivorPod.js`, `missionObjectiveOps.js`).
7. `9e3f95c4ae`, `4889e7cb81` — Ceres winching (`src/systems/ceresAnchorWinching.js`, `ceresPlayerWinching.js`,
   `npcJobsRuntime.js`, `src/combat/persistence.js`): save/restore of a mid-swing line; cost with no job live.
8. The six `fleet(PRI-07*)` work-loop slices and `fleet(PRI-10a)`.
9. The by-hand UI ports are out of scope except `src/systems/survivalDraft.js` in `7dca6e4ced`.

## What counts as a finding
A concrete failure: file:line, the input or sequence that triggers it, what the player or the save loses.
Classes to hunt: second writer to state another system owns; `Math.random`/`Date.now` in simulation;
per-tick allocation or whole-entity-list scan in an `update` path; a new saved field with no tolerance for
old saves; a main-thread emit a simulation listener needs that is not in the forward set (or a forward that
double-fires); a test that passes while the feature is dead (payload shape the game never sends); an event
subscribed but never unsubscribed across New Game; text longer than the design's limits is NOT a finding here.
Rank HIGH / MED / LOW. For each HIGH and MED write the smallest fix in one or two sentences. Do not list
style opinions. If a commit is clean, say "clean" and move on.

## Rules
Read-only: `git` read commands, file reads, and at most ten focused `node --test test/<file>` runs to confirm
a suspicion (the machine is loaded; four-minute cap per file). No game, no browser, no edits outside the report.
End the report with a table: commit · verdict (clean / findings n) · the one sentence a non-coder needs.
