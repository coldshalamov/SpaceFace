# PB-SLICE-F — SF-296 + SF-297: dignified low-resource recovery + combat pressure clears into audible breathing room

Board row 81 (`build_map.md` §1C). Packets:
`design/planbank/SpaceFace_Planbank_300/plans/20-slices/SF-296-a-low-resource-ship-has-a-dignified-recovery-loop.md`,
`.../SF-297-combat-pressure-clears-into-audible-breathing-room.md` + `domains/20-slices.md` + `EXECUTION_CONTRACT.md`.

**Status: implemented / route-unproven.** Production and direct checks are complete; the ordinary
player route was exercised through the real simulation harnesses (full `createSimulation` boot,
real `combat.kill`, real serialize/deserialize) but no headed/listened playthrough was performed in
this environment. Per the owner capture decision (root `AGENTS.md` §13), GPU/Chromium absence never
blocks `implemented`; the audio release and the salvage beam trip are assertable from the live
system code paths cited below.

**Provenance note:** this row's mechanism was found in the working tree as an interrupted prior
sitting of this same lane (untracked focused test + the two implementation diffs below, no
receipt). It was adopted per the stale-adoptable rule (`AGENTS.md` §3), verified end to end,
re-run, and closed here. No parallel implementation was started.

## The gap, in player terms (CHECK-first, reproduced before building)

- **SF-296:** when a low-resource pilot dies, the recovery dock already scours a share of the hold
  (`buildRecoveryPlan.cargoLosses` → `removeCargo` at recovery) — and that share used to *evaporate*.
  Your own wreck kept the generic debris pool (`DEFAULT_POOL` = 3 scrap + 1 electronics), so the
  hold — a broke pilot's only working capital — was a total loss with nothing physical left in the
  world to fly back for. Reproduced on clean HEAD `a64c6676b` in a scratch worktree
  (`test/pb-slice-f-sf296-only.test.mjs`, 3/3 fail: `manifestResidue` `undefined`, pool generic,
  no scoured units named anywhere; probe exit 1).
- **SF-297:** the music mix decayed to the calm band while a committed hunter was still standing
  off — the camera framed a combat pair (`cameraDirector.js:539` reads `combat.targetId /
  lockTarget === player.id`) but the ear said nothing, and there was no release moment at all when
  the last hunter died. Reproduced on clean HEAD: the focused suite cannot even link there
  (`audioSystem.js` has no `audioCommittedHostileCount` export; worktree run exit 1).

## Mechanism (through existing owners; no second subsystem)

**SF-296 — `src/systems/aftermathWrecks.js` (+25):** `makePlayerWreckMarker` now reads the defeat
receipt's exact scoured list (`payload.recovery.cargoLosses`, emitted by `combat.js:786`
`player:death` → subscribed `aftermathWrecks.js:930`) and runs it through the *same*
destruction-residue law every manifest hull already keeps — `wreckCargoResidueFor`
(`aftermathWrecks.js:427`, floor(30%) per line, cap 4, pure/deterministic, no rng) — into
`marker.manifestResidue`; `initialPoolForMarker` (`:444`) merges it + 1 hull scrap into the
drained-once `salvagePool`. The wreck entity spawned from the marker carries that pool
(`_specForMarker` `:1865` `salvagePool: poolForMarker(marker)`), scan-labels **"Your Hull"**
(`:1869`), binds as a salvage point (`salvage.js` `_bindPlayerWreckPoint`), and drains through the
player's existing salvage beam (`mining.js:1517` `_drainWreck` → cargo owner). The loss line now
speaks the job in the same breath as the loss (`newsLine` `aftermathWrecks.js:512`): *"Your hull
still drifts in <zone> — 3 u of your cargo scoured aboard."* Not a free bailout: you win back a
strict minority (e.g. 3 of 10 scoured of 20 carried); empty holds keep the old pool byte-identical;
repeated defeats replace the memorial under one stable id (no farm); the pool survives the real
save roundtrip. Single writers intact: cargo owns the hold, aftermath owns the wreck residue.

**SF-297 — `src/audio/audioSystem.js` (+61 net of the foreign hunk, see below):**
`audioCommittedHostileCount` (`:444`) counts live hostile hulls *committed* to the player — the
same two fields the camera's threat framing reads — out to 2400 wu; `resolveAudioThreatContext`
(`:468`) folds them into `engaged` and holds a 0.45 tension floor, so the mix can no longer decay
into calm under a live hunt. In `_recomputeMusic` (`:5530` block), a commitment ledger armed only
by an *observed* commitment fires one authored settle (`sfx_travel_settle`, the pre-existing
descending oscillator recipe — no new sample, no banner, gain 0.5) the tick the last commitment
dies while the pilot flies free, and lands the calmer music state immediately instead of after the
1.5 s hysteresis. Defeat and docking clear the ledger silently (recovery never inherits a stale
exhale); fresh loads and quiet sectors never exhale; incoming-fire alarms keep their own lanes;
no enemy is healed or removed to manufacture calm. Presentation reads live entity state, not wall
time, for the release decision.

**Foreign hunks left untouched (disjoint, preserved):** `audioSystem.js` also carries another
lane's `DETONATOR_RUN` doctrine-audio hunk; `cargo.js` (jettison-lot focus), `missions.js`,
`traffic.js` carry other lanes' dirty work. None touched by this row.

## Counterexample tests

`test/pb-slice-f-recovery-breath.test.mjs` (new, untracked — committer lands it): 11 focused
counterexamples — SF-296 residue law, byte-identical empty-hold pool, one-wreck no-farm, save
roundtrip; SF-297 standoff floor, lock-only vs friendly/uncommitted, floor release on death,
single exhale + immediate landing, no exhale under a committed survivor or on defeat, quiet-sector
arm-guard, finite authored release voice. **Before/after: 3 of the SF-296 tests fail on clean HEAD
(probe above); the SF-297 half fails to load on HEAD (missing export). All 11 pass on the working
tree.**

## Checks actually run (commands and real exit codes)

| Command | Exit | Result |
|---|---|---|
| `node --test test/pb-slice-f-recovery-breath.test.mjs` (working tree) | 0 | 11/11 pass (re-run at current HEAD `b7b499263` after a parallel physics commit landed mid-session — still 11/11) |
| `node --test test/save-growth-dock-trade-flat.test.mjs test/pq048-disabled-hauler-recovery.test.mjs test/economy-honesty.test.mjs` (SF-296 packet trio) | 1 | 17 tests, 16 pass; sole failure = PQ-048.05 tender repair — **pre-existing at HEAD** (see below) |
| `node --test test/pq-149-00-session-rhythm.test.mjs test/pq-149-02-ordinary-life.test.mjs test/pq-154-02-player-wreck.test.mjs test/inf-wreck-cargo-pool.test.mjs test/aftermath-scavenger-work-loop.test.mjs test/immediate-aftermath-wreck-identity.test.mjs test/audio-mix-direction.test.mjs test/audio-lifecycle.test.mjs test/f15-wrecks-still-there-tomorrow.test.mjs` (SF-297 named pair + adjacent seam suites) | 1 | 56 tests, 54 pass; 2 failures — **both pre-existing at HEAD** (see below). All suites covering this row's seams (pq-154-02 player wreck, inf-wreck-cargo-pool, aftermath-scavenger-work-loop, immediate-aftermath-wreck-identity, audio-mix-direction, audio-lifecycle, pq-149-00) passed |
| scratch worktree @ `a64c6676b`: `node --test test/pb-slice-f-recovery-breath.test.mjs` | 1 | link error: no `audioCommittedHostileCount` — SF-297 boundary present at HEAD |
| scratch worktree @ `a64c6676b`: `node --test test/pb-slice-f-sf296-only.test.mjs` | 1 | 3/3 fail (`manifestResidue` undefined, generic pool, no named scoured units) — SF-296 boundary present at HEAD |
| scratch worktree @ `a64c6676b`: `node --test test/pq048-disabled-hauler-recovery.test.mjs` | 1 | 5/6 — same PQ-048.05 failure as the working tree → pre-existing, not caused by any working-tree hunk. Instrumented copy showed `{"reason":"responder_control_refused"}` from `traffic.js:9431` → `_claimCeresDisabledHaulerControl` (`traffic.js:9106`) → `npcJobs.claimControl` refusing the tender's custody claim |
| scratch worktree @ `a64c6676b`: `node --test test/f15-wrecks-still-there-tomorrow.test.mjs` | 1 | same failure as working tree ("two kills respawn as wrecks near their death positions after save and load") → pre-existing |
| scratch worktree @ `a64c6676b`: `node --test test/pq-149-02-ordinary-life.test.mjs` (piped; ✖ lines in output are the evidence) | (pipeline 0) | seed 14920 "quiet window already shows ≥ 4 routine behaviours" fails identically → pre-existing (~4 min suite; true node exit not separately captured) |

Note: an earlier `… | tail -8` of the SF-296 trio showed a false exit 0 (the pipe's code); it was
re-run redirected to a file with `echo EXIT=$?` — real exit 1. The save-growth soak alone runs
~13.5 min; `save-growth-dock-trade-flat` is named by both packets and passed inside the trio run
against this exact candidate state.

**Pre-existing failures handed to their owning seams (not this row's write-set; traffic/npcJobs
custody is claimed by board rows 73/87–91):** PQ-048.05 `responder_control_refused`
(`src/systems/traffic.js:9431`), f15 two-kill wreck respawn after save/load, pq-149-02 seed 14920
quiet-window behaviour census. All three reproduce on clean HEAD `a64c6676b`, so none were
introduced or masked by this row or by concurrent working-tree hunks.

## Files

- `src/systems/aftermathWrecks.js` — SF-296 residue law + spoken loss line (edited; adopted prior sitting)
- `src/audio/audioSystem.js` — SF-297 committed-threat floor + release (edited; adopted prior sitting; foreign `DETONATOR_RUN` hunk preserved untouched)
- `test/pb-slice-f-recovery-breath.test.mjs` — new focused counterexample suite (untracked; for the committer)
- `design/program/roadmap/receipts/PB-SLICE-F-RECOVERY-BREATH.md` — this receipt

Not committed (per lane contract; the committer lands files by exact path). Scratch worktree and
junction removed after triage.
