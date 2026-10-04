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
