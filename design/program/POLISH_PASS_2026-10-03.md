<!-- LIFETIME: ACTIVE_PROGRAM -->
# Cross-area polish & review pass — opened 2026-10-03

Owner ask (2026-10-03): *a documented research and review/polish pass across all areas of the game,
systematically looking for small improvements, debugging, and polishing — every area just needs
more attention.* This file is the pass record: what was reviewed, what was found, what was fixed,
what was ledgered, and how the next session continues the pass. It is **not** a second defect
list — every defect-shaped finding ends in exactly one of: fixed (commit below), one row in
[`DEMO_READINESS_2026-09-20.md`](./DEMO_READINESS_2026-09-20.md) §6 (D166–D168 this pass), or a
note to the live lane that already owns the file.

## Method (repeat this on every pass session)

- The workflow runs through 2–3 parallel subagents per phase: **research** (read-only area
  reviewers, verified findings with file:line evidence) → **plan** (the session verifies each
  finding against the code and splits fixable vs protected) → **fix** (general-purpose agents land
  small fixes by exact pathspec, each with a focused test where the change is behavioral) →
  **review** (a fresh read-only agent judges every landed commit: finished? buggy? better?).
- Rules of engagement: the live `NOW.md` threads own their exact claimed paths — findings there are
  recorded and ledgered, never edited by the pass. Everything else is fair game. Each fix
  re-verifies `git status --short` immediately before editing.
- Severity policy (AGENTS.md §7 total-fix mode): small → fixed in the pass; medium on free files →
  fixed via a fix agent; medium on protected files or needing a consumer/design decision → one
  ledger row; big/unknown-cause → one ledger row.
- Fast gate: `npm run check:baseline` ran 25/26 green at pass start; the one red
  (`check:47a:civilian-priority`) was a contention timeout and passes standalone. Focused tests ran
  per landing.

## Area map (session 1 — every area reviewed)

| Area | Health summary (from the research phase) | Findings → disposition |
|---|---|---|
| Core / sim / runtime (`src/core`, `src/runtime`, `src/sim`, `src/main.js`) | Strong: determinism discipline holds everywhere swept; single-writer boundaries respected; hot paths show deliberate pooling. Only `Date.now()` hit is a documented opt-in offline-progress path in automation.js | No fixable defects; area clean |
| Systems — verbs/life (free `src/systems`) | Low defect density; the pattern that remains is receipt-style events emitted into the void, plus one dead player verb | Fixed: beacons re-init safety `e7e4e38e4`; fieldDepletion per-tick skip `ed754943c`; bountyHunt scratch hoist `f056f19e5`; dead `site:overlayChanged` emit removed `1714f9752`. Ledgered: D167 |
| Economy / world life | Wiring beliefs contradict the consumers (see D166) | Ledgered: D166 (`news:headline` void, 8 emitters) |
| AI / combat | One genuine combat bug (stations immune to beams); one dead code path with stale reward semantics; one unbounded map | Fixed: beams hit stations `b6f2d971a`; dead respawn path removed `2fb3b4d6f` + follow-up `20c94410c`; pending-slam map bounded `10360a9ff`. Ledgered: D168 (residual edge) |
| World / content / data | Data integrity cross-checks clean (ENEMY_TYPES→ships/weapons/loot, sector graph, travel lanes, ambush signatures); event wiring resolves | Dead emit removed (see `1714f9752`); area clean |
| Render / VFX (free paths) | Determinism clean (`Math.random` confined to cosmetic shipMicroMotion, `performance.now` to bench instrumentation); no player-reachable defect found on free paths | Nothing landed; area clean |
| UI / instrument (free paths) | Listener pairing in open/close paths, screen reachability, audio cue ids, and localization verified clean; one effect missing the reduced-motion guard all nine siblings have; one dead boot path | Fixed: commsTrace reduced-motion guard `412b09fec` + hold rebuild `fd825cd34`; boot-waveform dead path removed `0631dff7c` (−107 lines). Note: the `bulkHaulTag` emits are NOT dead — `scripts/check-mining-bulk-guidance.mjs` consumes them (research finding correctly rejected) |
| Periphery (audio, save, localization, story, characters, careers, nemesis, chronicler, physicalCargo, observability, presentation, balance) | Save migration chain v1→v14 complete; audio recipe ids all resolve; nemesis/physicalCargo read clean | One dead emit on a protected file (`story.js:2311` `story:continuationAccess`) — noted to the owning lane below, no player impact |
| Tests / checks hygiene | One orphaned suite that could not load; one test broken by the chunked-deserialize refactor; one stale regex pin | Fixed: tension-director suite rebuilt and green `0711e8f67` (59/59); field-regrowth-heartbeat context repaired `325906bce`. Stale pin noted below |

## Landed fixes (session 1 — 14 commits)

| Commit | What |
|---|---|
| `b6f2d971a` | **Beams damage stations** — `beamDamageCandidates` fast path early-returned combat-table rows (ship lane only), guaranteeing the stations-including fallback was dead; stations now append to the candidate scan. Focused test proven before-failing |
| `2fb3b4d6f` | Deleted dead `respawnPlayer`/`insuranceRefund`/`applyRespawnCargoLoss` (zero callers; stale 50%-cargo-loss semantics would double-track consequences if ever re-wired) |
| `20c94410c` | Review follow-up: deleted the transitively orphaned `respawnStationId` → `firstActiveStationId` → `firstLiveStation` chain |
| `18dcceef5` | **Base-screen teleport wired for real** — was a lying no-op (emitted `claim:teleportRequest` with zero listeners, toasted success); now resolves the linked station (same-sector only, honest refusal otherwise) and relocates via the established `world.relocatePlayerInSector` seam, velocity zeroed, heading kept |
| `10360a9ff` | hullFracture `pendingByVictimId` bounded: evict-oldest at cap 512 + insert-time age-out (deterministic, keyed off the note's own tick) |
| `ed754943c` | fieldDepletion: `opportunitiesOpen` count gate — the per-tick expiry scan no longer re-normalizes ~30-field records every tick when nothing is open (resolved records were the real per-tick waste) |
| `f056f19e5` | bountyHunt: per-tick `hunterByTarget`/`quarries` allocations hoisted to system scratch (behavior-identical) |
| `e7e4e38e4` | beacons: `destroy()` + init-first unsubscribe — a re-init no longer double-subscribes `beacon:deploy` (double charge) |
| `1714f9752` | Removed the dead `site:overlayChanged` emit (zero listeners; sibling `site:laneSpilled` kept) |
| `412b09fec` | commsTrace: reduced-motion guard (the only sibling effect without one) |
| `fd825cd34` | Review follow-up: the reduced-motion hold rebuilds when loudness moves materially (a quiet start no longer freezes as dots) |
| `0631dff7c` | Boot-waveform dead path removed: element never existed; lookups, worker machinery and dead plumbing deleted (−107 lines); `waveform.js` stays (live orrery/bar consumers) |
| `0711e8f67` | tests/tension-director rebuilt from its retained intake packet (SHA-256-verified against MANIFEST) with import-depth repairs; 59/59 green under `node --experimental-vm-modules --test tests/tension-director/*.test.mjs` |
| `325906bce` | field-regrowth-heartbeat deserialize context repaired (bare-`this` call left by the chunked-deserialize refactor) — 6/6 green |

## Ledger rows added by this pass

- **D166** — `news:headline` has no consumer; eight systems publish into the void (aceMemory,
  aftermathWrecks, custodyConsequences, e1EncounterRuntime, nemesisSignals, pirateRumor; missions.js
  and freightCausality both treat it as live). Player impact: faction/ace/pirate/aftermath headlines
  never reach the news surface.
- **D167** — `field:richSeamMissed` has no consumer; a missed rich seam is silent.
- **D168** — hullFracture pending-slam residual: a stale note can still suppress one aftermath
  shard via the raw peek in the protected aftermathWrecks consumer (partial fix landed `10360a9ff`).

## Notes to live lanes (no ledger row — no player impact, or owned work in flight)

- `src/systems/story.js:2311` emits `story:continuationAccess` with no production listener (only a
  test consumes it) — glm-infer-10b owns the file; remove the emit or add the intended listener.
- `test/startup-loading-presentation.test.mjs`: one regex pin no longer matches moved renderer code
  (beyond its 900-char window) — renderer.js carries in-flight work; adjudicate the pin at its HEAD.
- The tension-director suite still has no npm script (package.json is claimed); one row
  (`test:tension-director` with `--experimental-vm-modules`) would make it discoverable.
- `check:ui:budgets` baseline re-shoot: commsTrace/loadingPresenter/loadingTerminalArt edits add to
  the known per-commit digest drift (D90 convention) — the ORRERY lane's headed re-shoot covers it.
- Gate stations are now beam-damage candidates (consistent with projectiles, which already damage
  gates via physics colliders); flag only if gates should be beam-immune by design.
- The claims teleporter arrives at a plain in-flight berth (no undock-grace window); if arrival
  ganking shows up in play, `_invulnUntil` (like `UNDOCK_INVULN_S`) is the lever.

## Notes for the next pass session

1. This pass never ran a live playthrough — it is a static review + focused-test pass. The next
   session should pair one lane-style area play (per `FINISH_LANES.md` §3) with the same
   subagent method, starting from `program-dispatch --next` or the lanes.
2. The emit/listen cross-grep found its defects concentrated in "receipt into the void" events —
   the same sweep over `src/world/**` and the presentation tier has not been done end-to-end yet.
3. Protected-path findings (D166/D167/D168) become fixable the moment their owning lanes land —
   claim them, fix, and delete the rows in the same commit.
4. Pre-existing failures verified unrelated to this pass and left for their owners:
   `test/ceres-visible-job-actions.test.mjs` (10 failures, in-flight traffic lane),
   `check-market-chart` scrap-metal series (D162), escort-convoy raider stamp (D163),
   pq022 relay manifest gate (D164).

---

## Session 2 (2026-10-03 evening) — the reload-determinism arc + second sweep

Opening state: `check:baseline` 11/16 — sim, sim-compare, sim-v3, m1-tether-mass and massline
(2 children) red. Session 2 took the three sim reds; the m1/massline reds rode flight-lane edits
then in flight and went green as those lanes landed. Closing state: **16/16 green** — first full
green of the day.

### The arc (session 1's core sweep had called core/sim clean; the defect lived in the harness×save interplay)

1. `sim-v3` failed `reload-at 60` with a hash divergence that reproduced **identically at clean
   HEAD** — the dirty tree was innocent; the save→reload path genuinely did not reproduce the
   uninterrupted run.
2. Full-precision kinematics traces were bit-identical across all 720 ticks, yet the final hash
   differed and the tick-243 body dump diverged inside one physics step (entity 6's fling:
   reloaded av 27.7 vs 0.04). The injected difference was **not physics**: the envelope diff
   showed `settings.gameplay.aiBackend` flips `legacy` → `sg06-tactical` across the reload.
3. Root cause: `sanitizeRestoredSettings` (saveSystem.js) force-resets the three gameplay
   backends to shipped defaults on every load; the scenario contract boots 47-A on legacy AI;
   `reloadThroughSave` restored only `flightBackend` while its sibling `resumeLoadedEnvelope`
   restored all four fields. After tick 60 the sim ran a different AI controller.
4. Fix `327cf1c02`: `reloadThroughSave` restores the booted `physicsBackend`/`aiBackend`/
   `runtimeProfile` — the same contract `resumeLoadedEnvelope` already honored.
5. Pin flavor discovery (shared with a concurrently-landing lane): the never-saved "organic"
   Rapier world layout is **not reproducible across processes** (dimforge/rapier#910), while the
   save/restore path canonicalizes the world once. The envelope pin must record the canonical
   reload-run hash; the pin ping-ponged 0d85fa↔f4a621 across four commits in 15 minutes (two
   consumers measure different reload points) until the lane's `authoritativeHashByReloadAt`
   per-point map (`d5ea3fa16`, with save-time world re-adoption `b144f226e`) resolved it
   structurally. The v1 + v3 envelopes now both carry a note saying which flavor to pin from.
6. `ad55f562f`: SAVE_SCHEMA.md regenerated (stale since the gamepad glyphSet landing —
   `saveSystem.js` was clean at HEAD, so the regen was a free path).

### Landed fixes (session 2)

| Commit | What |
|---|---|
| `327cf1c02` | Reload keeps the booted AI/physics backends (`reloadThroughSave` restore block); v3 pin moves to the canonical reload hash |
| `ad55f562f` | v3 envelope pin-flavor note; SAVE_SCHEMA.md regenerated |
| `687c1ed58` | Six-fix sweep batch: lab `runScenario` in-place save/load restores booted physics/AI backends (same contract as the harness fix — closes the tool-scoped gap where SG-02 authority/aiPorts/massline gates silently flip after a mid-lab load); nine attachment/snare denial reasons get real copy instead of generic UNAVAILABLE; `commsRadial.destroy()` clears the held-open flag (velocity tape stayed suppressed after teardown); toast decay bar gains the `prefers-reduced-motion` twin; `--canonicalize-at` honored by run/compare/trace/profile instead of silently dropped; `compareExpectedEnvelope` resolves `authoritativeHashByReloadAt` like the assert side; v1 envelope documents the hash flavor (schema-cap-safe length) |

### Verified findings, documented not fixed

- `physics.js:1251` `_syncOptionalBackend` compares `=== 'rapier'` but only `'rapier-dynamic'`
  ships — the legacy-path optional collision world can never enable. Flipping it is a behavior
  decision on a compat path (§5), not a polish edit.
- `registry.js:954` `selectAISystem` conjunction can misreport in lab telemetry (settings claim
  sg06 while legacy AI runs on a non-rapier boot); no behavior gate reads settings.aiBackend
  post-selection today.
- `simSnapshot.js` latent collapses: `round6` folds non-finite to 0; the vec2 heuristic drops
  sibling keys of ≤4-key `{x,z}` objects. No verified victim field in snapshotted state.
- `settings.js` Gameplay tab force-writes the three backends as a render side effect (bypasses
  persist; no `legacy` choice reachable). ORRERY lane's surface — recorded, not edited.
- Verified benign: the encounterDirector / controls.touch save-presence asymmetries (lazy init
  and sanitize materialization, no behavior delta); `check:sim:profile`'s plain-run assert stays
  green (legacy controller hash is flavor-invariant at this horizon — verified by run).
- Dead micro-code: `validateTwinBridlePair`'s `same_endpoint` is unreachable; `.sf-toast--out`
  style can never render; drive-out toast uses `warn` on one path and `info` on the other.

### Notes for the next session

1. The harness×save backend-restore contract now exists in three places (47-A reload,
   `--load-envelope`, lab `runScenario` in-place). If a fourth save-consuming harness appears,
   it needs the same restore — consider a shared helper next time saveSystem changes.
2. Session 2 ran while multiple lanes landed (six foreign commits during the session). The
   envelope/pin files are contention hot spots; the pin-flavor notes in both envelopes are the
   durable guidance — keep them when re-pinning.
