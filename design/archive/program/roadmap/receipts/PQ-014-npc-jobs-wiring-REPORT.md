# PQ-014 — Natural NPC miner/hauler/patrol jobs: RUNTIME WIRING — REPORT

Packet: PQ-014 / SF-15 / canonical W06. Worktree: C:\Users\93rob\sf-w2-npcjobs
Branch: w2/pq014-npcjobs-20260721  Base: 556b910f  (everything UNCOMMITTED for lead review)

## Outcome (delivered)

The EXISTING deterministic kernel (src/systems/npcJobs.js — 48/48, UNTOUCHED) now drives real
miner/hauler/patrol NPCs: a new thin adapter advances materialized jobs and steers their hulls;
jobs arise NATURALLY from ambient traffic; they survive sector exit -> time away -> re-entry with
the away time advanced virtually; they survive save/Continue; and offscreen == onscreen is proven
at the runtime boundary. Node-level verification is COMPLETE and green. Browser route-evidence is
gated on the PQ-012 GPU-mutex flag (see "Browser evidence" below).

## Architecture rulings I made

1. NEW thin adapter `src/systems/npcJobsRuntime.js` is the SOLE writer of `state.npcJobs = { byId }`.
   Registered in registry SYSTEMS + UPDATE_ORDER immediately after sectorSim (world-adjacent block).
   Each bag entry WRAPS the kernel record with runtime-only sidecar meta the kernel does not carry:
   `{ job, kind, sectorId, worldRecordId, entityId, lastAdvanceSimT }`. This is load-bearing —
   restoreJob() reconstructs ONLY kernel fields, and `job.simTime` is the kernel's internal clock,
   NOT global sim time. The adapter persists `lastAdvanceSimT` (global state.simTime of last advance)
   itself, so on re-entry `elapsed = state.simTime - lastAdvanceSimT` is correct even after a save.

2. Natural producer = the EXISTING ambient-traffic spawner. traffic roles miner/hauler/patrol map
   1:1 to the three job kinds. At spawn, traffic._maybeAssignJob builds a route from the same
   in-sector stations/asteroids its ad-hoc steppers already use and calls `helpers.npcJobs.assign`.
   No new spawn fountain; no encounterDirector combat spawnBudget consumed. Job id = 'job:'+worldRecordId.

3. Double-drive resolved (exactly one intent writer per job hull per tick): traffic.update does
   `if (e.data.jobId) continue;` at the TOP of its per-entity loop (before role dispatch). The job
   owns steering; traffic yields entirely. Passive team-2 civilian hulls are already off the tactical
   roster (aiPorts.js:303 skips ai.passive), so tacticalAI never co-writes them either.

4. Movement route = TRAFFIC-STYLE setIntent (data.intent), NOT ai.activity. Rationale: it is the
   proven civilian path traffic already uses; it keeps job hulls off the combat/squad roster entirely;
   it needs ZERO edits to aiPorts.js / doctrine.js / tacticalAI.js and cannot be perturbed by
   ATTACK_RUN combat overrides or SG-06 formation. The only cost is point-and-thrust vs FORMATION
   fidelity, which is right for readable civilian behavior. (The brief permitted either; this is the
   lower-risk one.)

5. Continuity by worldRecordId + the existing sector bus. `_stampTrafficDurableIdentity` stamps
   `entity.data.worldRecordId` AT SPAWN (traffic.js:435), and world capture/rematerialize PRESERVES
   it (worldRecords.js:288,300). So npcJobsRuntime subscribes to the existing sector:exit/sector:enter
   bus events: on exit it virtualizes the sector's jobs (record survives in the bag, link drops); on
   re-entry it advances each virtual job by the elapsed away time (resuming across the kernel truncation
   cap) and re-links to the rematerialized hull by matching worldRecordId. A hauler that COMPLETEs, or
   a hull destroyed without a demote, ends its job with the entity.

6. Save: `state.npcJobs` default in gameState.js; save plan key `npcJobs` in BOTH saveSystem tables
   (_saveCapturePlan + serializeData) via `_callSerialize('npcJobsRuntime')`; load via
   `_callDeserialize('npcJobsRuntime', data.npcJobs)`; saveVersion 11 -> 12 + migration v11->v12
   (absent -> empty bag, fail closed). SAVE_SCHEMA.md regenerated (version 12, 262 paths, `$.npcJobs`).

### Deliberate deviation from the survey write-set (justified)

I did NOT edit sectorSim.js, world.js, worldRecords.js, doctrine.js, aiPorts.js, tacticalAI.js, or
encounterDirector.js. Subscribing the adapter to the EXISTING sector:enter/exit bus events and keying
jobs on the ALREADY-stamped worldRecordId achieves the brief's binding outcomes (relink-by-worldRecordId,
virtual-advance-with-elapsed-dt) with far less blast radius and a clean single-writer. Correction to my
own early notes: this is a SINGLE-WRITER / BLAST-RADIUS win, NOT a golden-safety win — world is in
NEITHER sf-sim variant and aiPorts only in the (unused-by-this-check) --tactical-ai variant. If the lead
intended rulings 4/5 literally (advance-in-sectorSim, relink-in-world), the seam is trivially movable;
the outcomes are identical.

### Scoped-out (known limitation, by design)

Cross-CLOSED-GAME-gap offscreen advance (sectorSim.runOfflineCatchup's wall-clock window) is NOT
modeled: a job left virtual across a Continue advances only by the bounded in-session elapsed (clamped
to MAX_CATCHUP_S = 3600s), never by wall-clock time the game was closed. This was explicitly out of the
verification matrix. Jobs still SURVIVE save/Continue coherently (phase/progress/loopCount preserved).

## Command matrix (command -> result)

| Command | Before changes | After changes | Note |
|---|---|---|---|
| `node --test test/npc-jobs-kernel.test.mjs` | 48/48 pass | 48/48 pass | kernel UNTOUCHED |
| `npm run check:npc-jobs` (NEW) | n/a | 61/61 pass (48 kernel + 11 wiring + 1 census + 1 convergence) | exit 0 |
| `node scripts/check-sg06-live-registry.mjs` | PASS | PASS (boots the REAL registry with my SYSTEMS+UPDATE_ORDER insertion) | registry-boot proof |
| `node scripts/check-auto-target-registry.mjs` | PASS | PASS (boots the real registry) | registry-boot proof |
| `node scripts/check-input-modalities.mjs` | PASS | PASS (input index-0 pin intact) | |
| `node scripts/check-m4-regional-ecology.mjs` | RED (main.js pin :305) | RED (identical) | PRE-EXISTING — src/main.js unchanged from base + has no regionalEcology ref; my registry adjacency pin :299 PASSES |
| `npm run check:sim:compare` | ok:true hashEqual:true (sha 3d7499d7; envelope 7f4ecb2d already stale) | ok:true hashEqual:true (sha 271605e7) | see GOLDEN below |
| `npm run check:save-schema` | (was v11) | GREEN — "SAVE_SCHEMA.md OK (version 12, 262 paths)" | regenerated with --write |
| `node scripts/check-encounter-director.mjs` | RED "got 2" at :171 | RED "got 2" at :171 | PRE-EXISTING, UNCHANGED — not mine, not worsened |
| `npm run check:massline` | (adjacency) | PASS — 23 child checks green | |
| `npm run check:mass-seed` | (adjacency) | 49/49 pass | |
| `node --check` on all 8 edited/new src files | n/a | all OK | |

### GOLDEN (check:sim:compare) — measured before AND after, honestly

check:sim:compare is `ok:true, hashEqual:true` (reload determinism holds). The authoritative sha256
did shift: base (my edits reverted) = `3d7499d7...`, with my edits = `271605e7...`. I isolated the
cause by backing up the 4 sf-sim-reachable files, reverting my additions, re-measuring, then bisecting:

- The gameState `state.npcJobs` default is INERT (snapshotSimState uses a top-level ALLOWLIST that
  does not include npcJobs — confirmed: with the default present but save files reverted, sha stayed
  `3d7499d7`). saveSystem/migrations are inert in a plain run (no serialize).
- The ENTIRE shift `3d7499d7 -> 271605e7` is `state.meta.version` going 11 -> 12: createGameState sets
  `meta.version = CURRENT_VERSION`, and snapshotSimState's snapshotMeta (simSnapshot.js:101) puts
  `version` in the hash. Confirmed: restoring ONLY saveVersion (=12) reproduces `271605e7`, and
  `inspect` shows `meta.version: 12`. This is the schema-version INTEGER, not any behavioral change —
  every save-schema bump in this repo shifts the 47a hash by exactly this, and the brief granted the bump.
- The committed expected envelope (`7f4ecb2d...`) was ALREADY stale at my base: the base hash is
  `3d7499d7` (!= 7f4ecb2d) and the compare diffs include `presentation:*` / `camera:shake` trace-count
  drifts that have NO causal path from NPC jobs. Pre-existing drift, not mine.

Per ruling 8 I did NOT edit any golden/expected file. DECISION FOR THE LEAD: when this lands, the 47a
authoritative-hash re-pin (7f4ecb2d -> 271605e7, or whatever master produces at v12) is a golden edit
that is the lead's to make. The harness currently tolerates the stale envelope (ok:true).

## New tests (files)

- `test/npc-jobs-runtime-wiring.test.mjs` (11 tests): natural assign+link; materialized advance+intent;
  save/restore round trip (kernel record + sidecar meta) + relink; sector exit->away->re-entry
  continuity (miner loopCount survives + advances virtually, never reset); truncation-resume across the
  kernel cap; one-writer (traffic yields for jobId hulls); hauler COMPLETE unlink; flee interrupt/resume;
  REAL Continue path (saveSystem.serialize with the runtime REGISTERED persists the live job ->
  loadEnvelope restores it virtual); v11->v12 migration on a real old envelope (no npcJobs -> empty bag).
- `test/npc-jobs-natural-census.test.mjs` (1 test): held-out seeds, ambient traffic produces advancing
  miner/hauler/patrol jobs WITHOUT any createJob in the fixture body.
- `test/npc-jobs-runtime-convergence.test.mjs` (1 test): runtime materialized stepping == runtime virtual
  catch-up (state) AND surfaces the exact kernel intent stream.

## Census (natural occurrence) — seeds + results

HELD-OUT seeds: 90218, 90219, 90223 (documented as not colliding with kernel 1-123 / sf-sim 47 /
encounter-director 31 / mass-seed suites). Harness boots [npcJobsRuntime, traffic] in a high-security
industrial pocket (security 0.9 forces a patrol via ensurePocketRoleMix; mining+refinery industries
boost miner/hauler weights) with 3 stations + a 10-rock asteroid field, runs 2 sim-days (1200 s) per
seed, aggregated. Result: all three kinds ARISE NATURALLY (assignedUnion covers miner+hauler+patrol) and
ADVANCE — miner emits work/cycle, hauler reaches COMPLETE, patrol emits hold/cycle. The fixture never
calls createJob or assign; traffic does. PASS.

## Convergence digest

Path A (runtime materialized, stepped at exact dt 0.5 for 12 s) and path B (same seed+id job virtualized,
whole interval elapsed offscreen, single aggregated catch-up + materialize) reach byte-identical snapped
job state; and path A's surfaced bus intents equal the kernel-direct reference stream for advance(12).
Exact-divisor dt per the kernel float policy. PASS.

## Continuity / save design (proven)

Join key = worldRecordId (stamped at spawn, preserved through demote/rematerialize). On sector:exit the
sector's jobs virtualize (survive in state.npcJobs); on re-entry each advances by the away-time (clamped
to MAX_CATCHUP_S, truncation-resumed) and re-links to its rematerialized hull. Save serializes the bag
(kernel record via serializeJob + sidecar meta incl. lastAdvanceSimT); load restores every job VIRTUAL
(hulls cleared on load) to relink on the next enter. saveVersion 11->12 + migration v11->v12.

## Files changed

Modified: src/core/gameState.js, src/core/registry.js, src/systems/traffic.js, src/save/saveSystem.js,
src/data/saveVersion.js, src/save/migrations.js, package.json (check:npc-jobs), SAVE_SCHEMA.md.
New (git add -N): src/systems/npcJobsRuntime.js, test/npc-jobs-runtime-wiring.test.mjs,
test/npc-jobs-natural-census.test.mjs, test/npc-jobs-runtime-convergence.test.mjs,
scripts/capture-pq014-npc-jobs.mjs (player-route capture harness, flag-gated), REPORT.md.
npcJobs.js kernel: ZERO edits. No physics/render/vfx/styles/input/golden/other-worktree files touched.

## Known failures / limitations (honest)

- check:encounter-director: PRE-EXISTING RED "two-day soak should produce encounters (got 2)" at
  check-encounter-director.mjs:171. Measured got 2 BEFORE and got 2 AFTER my changes. Not my packet to
  fix; not worsened (my wiring touches no encounterDirector/spawnBudget code).
- check:sim:compare authoritative hash shifted 3d7499d7 -> 271605e7 = the meta.version 11->12 schema
  integer only (not behavior). Expected envelope was already stale at base. Golden re-pin is the lead's.
- check-m4-regional-ecology: RED at line 305 (`assert.match(mainSource=src/main.js, /['world','regionalEcology','factions'/)`).
  PRE-EXISTING and not mine: src/main.js is byte-identical to base 556b910f and contains NO regionalEcology
  reference at all; my registry adjacency pin (:299 `world, regionalEcology, encounterDirector`) PASSES,
  and the real registry boots green (check-sg06-live-registry, check-auto-target-registry).
- Cross-closed-game-gap offscreen job advance is intentionally NOT modeled (scoped out; documented above).
- Browser route-evidence: PENDING the PQ-012 GPU-mutex flag (see below).

## Browser evidence

STATUS: harness READY; run PENDING the PQ-012 GPU-mutex flag. Per the mutex rule I did ALL node-level
work first and must wait for `<scratchpad>/browser-free-pq012.flag` before any browser/Electron work.
A ready-to-run capture harness is delivered: `scripts/capture-pq014-npc-jobs.mjs` (npm
`capture:pq014-npc-jobs`), built on the repo's proven Playwright probe-server pattern
(acquireVisualProbeServer + loadPlaywright + window.SF). It boots the canonical New Game full-game
route, waits for ambient traffic to naturally produce miner/hauler/patrol jobs, captures the populated
sector + a numbered job-bag route log to `.devshots/pq014-npc-jobs/`, then does save -> Continue and
asserts the jobs persist + resume (second capture). It runs the instant the flag frees.

The census + convergence + continuity node tests already PROVE the outcome (natural occurrence in a
populated sector, offscreen==onscreen, exit/reentry + save/Continue survival) deterministically, and
the real registry boots green (sg06-live-registry, auto-target-registry); the browser pass is
confirmatory visual evidence. If the flag frees this session the captures + final sentinel land here;
if not, the node proof stands and the harness is delivered for the lead/successor to run.

## Receipt-ready YAML

```yaml
packet: PQ-014
alias: SF-15
canonical: W06
subslice: runtime_wiring
branch: w2/pq014-npcjobs-20260721
base_commit: 556b910f
state_reached: RUNTIME_WIRED_NODE_GREEN
kernel_edited: false            # src/systems/npcJobs.js untouched (48/48 still bind)
runtime_wired: true
route_accepted: false           # browser player-route evidence pending PQ-012 GPU-mutex flag
paths_changed:
  new:
    - src/systems/npcJobsRuntime.js
    - test/npc-jobs-runtime-wiring.test.mjs
    - test/npc-jobs-natural-census.test.mjs
    - test/npc-jobs-runtime-convergence.test.mjs
    - scripts/capture-pq014-npc-jobs.mjs   # player-route capture harness (flag-gated; npm capture:pq014-npc-jobs)
    - REPORT.md
  modified:
    - src/core/gameState.js         # state.npcJobs default (sibling of sectorSim)
    - src/core/registry.js          # register npcJobsRuntime after sectorSim (SYSTEMS + UPDATE_ORDER)
    - src/systems/traffic.js        # natural assign at spawn + yield stepper for jobId hulls
    - src/save/saveSystem.js        # npcJobs key in _saveCapturePlan + serializeData + load
    - src/data/saveVersion.js       # CURRENT_VERSION 11 -> 12
    - src/save/migrations.js        # v11 -> v12 (absent -> empty bag)
    - package.json                  # check:npc-jobs script
    - SAVE_SCHEMA.md                # regenerated (v12, 262 paths, $.npcJobs)
mutex_ownership:
  registry: PQ-014 (this wave)      # save/gameState/saveVersion grants confirmed uncontested (PQ-015 touched none)
proof:
  - command: node --test test/npc-jobs-kernel.test.mjs
    result: "48/48 pass (kernel unchanged)"
  - command: npm run check:npc-jobs
    result: "61/61 pass (kernel 48 + wiring 11 + census 1 + convergence 1)"
  - command: node scripts/check-sg06-live-registry.mjs
    result: "PASS — boots the REAL registry with my SYSTEMS + UPDATE_ORDER insertion"
  - command: node scripts/check-auto-target-registry.mjs
    result: "PASS — boots the real registry"
  - command: node scripts/check-input-modalities.mjs
    result: "PASS — input index-0 pin intact"
  - command: node scripts/check-m4-regional-ecology.mjs
    result: "RED — PRE-EXISTING (src/main.js pin :305; main.js byte-identical to base and has no regionalEcology ref); my registry adjacency pin :299 passes"
  - command: npm run check:sim:compare
    result: "ok:true, hashEqual:true; sha 271605e7 (= base 3d7499d7 shifted only by meta.version 11->12); expected envelope 7f4ecb2d already stale at base"
  - command: npm run check:save-schema
    result: "GREEN — version 12, 262 paths, $.npcJobs present"
  - command: node scripts/check-encounter-director.mjs
    result: "RED got 2 at :171 — PRE-EXISTING, identical before and after; not this packet"
  - command: npm run check:massline
    result: "PASS — 23 child checks green"
  - command: npm run check:mass-seed
    result: "49/49 pass"
census_seeds: [90218, 90219, 90223]
lead_decisions_needed:
  - "Re-pin 47a authoritative hash for the v12 meta.version bump (golden edit; not made here per ruling 8)."
  - "Confirm rulings 4/5 seam intent: adapter-subscribes-to-bus + worldRecordId (as built) vs literal sectorSim/world edits."
known_failures:
  - "check:encounter-director got-2 (pre-existing, unchanged)."
  - "check-m4-regional-ecology :305 (pre-existing; src/main.js pin, main.js unchanged from base; my registry adjacency pin :299 passes)."
  - "Cross-closed-game-gap offscreen advance not modeled (scoped out)."
  - "Browser player-route evidence pending PQ-012 flag."
registry_boot_verified: "check-sg06-live-registry + check-auto-target-registry PASS (real registry boots with the new SYSTEMS + UPDATE_ORDER slot)"
continue_path_verified: "saveSystem.serialize (runtime REGISTERED) persists the live job; loadEnvelope restores it virtual; v11->v12 migration on an old envelope -> empty bag (all in test/npc-jobs-runtime-wiring.test.mjs)"
```

## Verification pending before final PQ014_IMPL_DONE

- [ ] Browser route-evidence (miner working / hauler terminal run / patrol beat; save -> Continue resume)
      captured to .devshots/pq014-npc-jobs/ once `browser-free-pq012.flag` appears; then create
      `browser-free-pq014.flag` and stamp the final sentinel.

PQ014_IMPL_NODE_COMPLETE_BROWSER_PENDING
