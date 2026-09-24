<!-- LIFETIME: ACTIVE_PROGRAM -->
# Everything between here and a demo that works — compiled 2026-09-23

Owner ask: *"a comprehensive list of all the work we need to do to get this game working completely —
more than build-map tasks: the small bugs, the misconfigurations, the fact that it doesn't load and
run correctly, the models that don't load on time."*

This is a **survey, not a queue**. Every item maps to the packet, §22 row, or ledger row that already
owns it; nothing here is dispatched from this file. The one defect ledger stays
[`DEMO_READINESS_2026-09-20.md`](./DEMO_READINESS_2026-09-20.md) §6 — new defects found go there, not
here. Order below is the order a stranger meets the work: boot → first minute → the fight → the
world → the shell → the package.

## 0. Ground truth, measured today

- `check:baseline`: **16/16 green.** The suite is not the problem; the live route is.
- Runtime witness (`.devshots/runtime-witness/report.md`, today): verdict *presenting*, but the
  opening ledger reads **~25 s** before entering flight; `gpu-resources` alone waited **24.9 s**.
  In a 20 s flight window: **149 hitches** (bloom 43, externalScheduling 40, sim 22, **unknown 42**),
  41 main-thread blocks ≥ 50 ms (max **1388 ms**), JS heap ~**1.7 GB**.
- First-sector probe (`.devshots/first-sector-ships-latest.jsonl`, today): **first playable frame
  ~70 s**; `critical-hub:2` sat in `loading` → `compiling-pipelines` for 20+ s; stations at 1.3–1.4 kWU
  still `missing-mesh` at t=30 s; individual ship GLB admissions took **1.7–8.5 s each on one serial
  lane**.
- `check:asset-startup-readiness` passes but its own report shows **httpOk 0/35 tracked required
  URLs** — the readiness check cannot see whether the 92 required asset URLs actually fetched. A
  green there is not evidence the assets arrived.
- Console 404 on `/__spaceface_player_store` on the probe route (save-drawer endpoint).
- Working tree: **~448 dirty files**, including the uncommitted projectile-flight lane that defect
  D18 is waiting on.

## 1. Boot and first minute — "it doesn't load and run correctly"

| # | Work | Owner / evidence | Done when |
|---|---|---|---|
| L1 | Crucible launch → control still **47–108 s on a busy host** (81 s loaded reading; cook ledger: rock pools 13.6 s, Crucible warm 12.9 s, post-opening pipelines 14 s, first-frame census 15.3 s). Get a quiet reading, then attack the ~14 s of fixed bootstrap waits and the census. | `PQ-210.02`/`D5`, ZERO_TO_HERO Phase 5.4, §22 D7 | Crucible ≤ 15 s quiet (target 10); New Game ≤ 10 s; three quiet runs each |
| L2 | **One serial admission lane** starves the ships you are fighting behind ~50 jobs of station furniture — the F6 class of failure (10–17 hostiles orbiting four minutes without firing; opening paints only sky after the bridge). Ordering landed; throughput has not: ~8 bodies still compiling at 10–20 s post-bridge on a busy host. | ZERO_TO_HERO §5 item 12 / §7 row 2; F6 | Bodies the opening frame shows admit first; a busy-host run fires on time |
| L3 | Ships and stations reach the glass before the authored body exists: patrol Wasp a resolving marker at 100 WU; stations `missing-mesh` at 30 s. | **Ledger D20** | Public New Game → Launch probe at 15 s shows authored bodies, not markers |
| L4 | `critical-hub:2`-class jobs sit `loading`/`compiling-pipelines` for 20+ s while the world waits on them. | Opening cook / upgrade queue; probe `probe-first-sector-ships` | No single admission job outlives the opening window |
| L5 | `/__spaceface_player_store` 404 on routes that don't mount the save drawer — handled correctly (memoized localStorage fallback) but still a console 404 on a demo route. Serve a stub or skip the probe. | `server.js` / save wiring | 0 console 404s on a clean route |
| L6 | The readiness check is green while tracking 0 of 35 required asset fetches — extend it so "assets loaded" means assets loaded. | `scripts/check-asset-startup-readiness.mjs` | httpOk > 0 or an equivalent arrival counter is asserted |
| L7 | Commit the uncommitted lanes — **~448 dirty files**, several of them finished work (the projectile-flight lane that closes D18; the PQ-033.02 GL-trap instrument). A demo cut from an uncommitted tree is a demo of a tree that may not exist tomorrow. | Tree hygiene, `AGENTS.md` §3 pathspec commits | `git status` carries only live in-flight hunks |

## 1A. Code-audit findings — fixed in the 2026-09-23 pass

Static audit of producer↔listener wiring, asset refs, config, and UI actions. Each entry was
verified against helpers/dynamic emits/constants before classing as dead — the literal scan alone
has ~100 false positives (`_emit` helpers, table-driven names, DOM events, command seams).

| Fix | Files |
|---|---|
| Hauler origin `market_spread` could never complete: it listened to `economy:trade` (no producer) plus `ui:buy`/`ui:sell` request events that carry `expectedTotal`, not `unitPrice`/`total` — legs recorded zero prices and `evaluateMarketSpread` requires `unitPrice > 0` on both. Now consumes the executed receipt `economy:tradeCompleted` like every other system. | `src/careers/origins/haulerOriginSystem.js`, regression in `test/hauler-origin-chain.test.mjs` |
| Same file, second bug: `_onTrade` checked `own.marketLegs` after `recordMarketLeg()`, but `ensureHaulerOriginState` reattaches a migrated copy each call — the captured `own` was stale, so auto-completion could never fire even with correct prices. Now re-reads after recording. | same |
| Dead listeners removed (no producer exists; effects already covered by live events): `ui:click`/`ui:hover`/`ui:deny` in `audioSystem` (live convention is `audio:cue` ids), `mission:abandoned` in `hud.js` + `haulerOriginSystem` (abandonment travels as `mission:failed` `reason:'abandoned'`), `mining:overheated` in `presentationOrchestrator` (peg-lockout deliberately removed 2026-09-21 — the no-lockout test asserts it never fires), `sim:jumpGate` in `economy` (`jump:start` covers `runScan`). | `src/audio/audioSystem.js`, `src/ui/hud.js`, `src/systems/presentationOrchestrator.js`, `src/systems/economy.js` |

## 1B. Code-audit findings — unreachable feature seams (backend ready, no live producer)

Confirmed by checking every emit site (src + test). Each needs a producer wired to the right
surface — these are feature gaps a demo player can hit, not dead code to delete.

| Seam | Backend waits at | Gap |
|---|---|---|
| `ui:setShipAppearance` | `ships.js:1446` → `setShipAppearance` | Livery backend fully unsurfaced; no UI references appearance. Surface it in shipworks or mark the seam out-of-demo. |
| `ui:kurtzInteract` | `story.js:191` → `_onKurtzInteract` (takeLedger/openLedger/takeCoords/approach) | Kurtz evidence chain unreachable — no UI emits the intent (test-only). |
| `ui:heliosBay7Scan` | `story.js:192` → `_onHeliosBay7Scan` | Helios Bay 7 evidence gated behind a producer that doesn't exist. |
| `ui:endingArchiveOpen` | `story.js:161` → re-emits `endgame:archive` | Doubly dead: nothing emits the open intent *and* `endgame:archive` has no consumer — the archive viewer was never built. |
| `ui:factionPresenceService` | `factionPresence.js:407` → `_onServiceAction` | Six tests drive it; no live UI. Service rows unsurfaced. |
| `moralTrap:choose` | `moralTrap.js:97` | Trap reveals a choice into the void — no consumer for the reveal and no choice UI emits the answer. |
| `claim:defenseIgnore` | `claims.js:284` | Settle-as-ignored path unreachable. |
| `combat:baseDestroyed` | `economy.js:902` → `onBaseDestroyed` | No destructible base entities exist, so the economy consequence never fires. Either spawn a base or cut the listener at demo scope. |

**Verified intentional seams — do not "fix":** `entity:kill`, `entity:spawnRequest`,
`combat:requestAction`, `combat:repairSubsystem` (command surfaces used by missions/console/tests),
`save:dirty` (documented extension point for durable-record owners), `miningDrone:sellOre`
(test-backed anti-exploit seam — `economy-professional-anti-exploit.test.mjs` drives it),
`ui:undock`, `voice:dismiss` (external-call seams), `ui:talkContact` (emitted dynamically by
`barContacts.js`), `career:origin:*` intents (missionLog), `beacon:deploy` (input action),
`run:*` (via `_commitRun` helper), `nav:engageRoute`/`nav:abortRoute` (map controls).

**Audit-clean:** 727 manifest asset refs resolve on disk; all 111 audio samples exist; importmap
targets resolve; 620 package scripts have zero dead targets; all 14 ship defs resolve in
`partsLibrary.js`; CSS refs clean (`pause.css` mention is a removal note); all `data-action`/`verb`
attributes have handlers; Crucible tiles resolve through `kitUrl()`; admission retry
(`retryFailedAuthoredAdmission`) is driven by the renderer poll — the late-model problem is
throughput/priority (D20), not missing retry or missing files.

## 2. The open defect ledger — 7 rows a demo player can hit

These are the already-confirmed defects. Details and repros live in the ledger; claimable by any
sitting.

| Row | A stranger sees | Blocks |
|---|---|---|
| **D15** | Menus render differently before vs. after the first dock (`fh.css` injected at first dock) | Every screen |
| **D18** | Scripted opening mission 47-A lands **zero** shots — `range` cut + spatial `maxDistance` kill tape shots at 240 WU. **Fix is in-tree uncommitted** (`projectileFlight.js`, `weapons.js`, `physics.js` give rounds ≥16 s flight past range): tape lands 4/17 hits vs pinned 4/8. Row closes when that lane commits. | Adventure first fight |
| **D20** | NPC ship on screen as a resolving marker while its GLB loads | First contact |
| **D24** | Renderer leak **+411 MB per 52 min** across save/load/dock cycles (+2.1 geometries/cycle, +24 programs) — tab OOM around ~450 cycles. Renderer-side, not sim (headless 40-cycle probe holds 77 MB). D28's entity ratchet may have fed part of it — re-measure on the fixed tree. | Any long play session |
| **D26** | Rare total freeze of applied thrust: telemetry healthy (ticks, `moveZ` held, thrust 309) but speed stays exactly 0 — force lost between `writePhysicsControl` and the Rapier body, or velocity re-zeroed per tick. | First flight after Launch (rare) |
| **D33** | Shipworks hull preview never reports "settled" headless (stage holds the poster), so station checks go unmeasured; `SF_STABILITY_TAB=market` run stalled 10 min in hover sampling. | Station release checks |
| **D34** | New Game stop-scale clips difficulty words / hull names at a fixed 470 px in longer languages (repro under qps-ploc). | New Game |

## 3. The demo path itself (ZERO_TO_HERO §7 — what the first session left)

| # | Work | Owner |
|---|---|---|
| P1 | **Round zero teaches by doing** — first 45 s of run one hands the player a rock worth throwing, a hull worth shoving, a well worth dropping, before the pack arrives. Not started. | Phase 5.3 |
| P2 | **Live title** — deterministic Crucible replay behind the menu instead of a still. `PQ-160` ring buffer exists. Not started. | Phase 5.2 |
| P3 | **The honest death** — the stranger pass reached results through the run's-end API because the fight never killed the player in 4 min; re-walk after F6 and take the `PQ-210.08` scripted path end to end. | `PQ-210.08` (ready on the queue) |
| P4 | **`CAN` off the glass** — Massline latch state is still a bare word a stranger reads as a cargo can. | Phase 4.2 / §22 G1 |
| P5 | **Rocks and sky** — beige-clay rocks with pink crystals → industrial stone (`AQ-SURFACE`); one hero celestial per profile, sky below muzzle/engine luminance (§22 C6). Owner ruling: the sky stays rich — this is substances and effect weight, not a dimming pass. | Phase 2 |
| P6 | **Kill reads as bodies** — within 250 ms a kill leaves ≥ 2 lit wreck bodies keeping the victim's momentum at readable size; wrecks grabbable (§22 B3). | Phase 3 |
| P7 | **Body-scale bars hold** — hull ≥48 px calm / 36 px fight / 28 px top speed; plume never covers the hull; B3b still holds. First slice landed (12→175 px adventure); floors must hold across zoom/speed. | Phase 1, `probe:body-scale` |
| P8 | **HUD quiet** — 0 persistent sentence cards in flight; no truncated primary label at 720p or 1080p; results = replay + stunts + Again. | Phase 4 / ORRERY, §22 G3/G5/G7/G8/G13/G14 |
| P9 | **Demo build + end card** — `IS_DEMO` landed (`src/core/demoMode.js`, `?demo=1`, `build-bundle --demo`); end card landed on the plain kit, still needs the ORRERY move. Verify the demo flag's title order, hidden Load, and "Take it to the belt" on the real route. | Phase 5.1/5.5 |
| P10 | **The world on the way** — opening neighbourhood shows one working chain in two screen-depths; first raid already happening; one upgrade felt on undock. | Phase 6 / §22 A1–A6 |

## 4. Measured-gap rows that still matter to a demo player (§22)

§22 rows close on their fixtures; statuses are per-row, not tracked here — verify before claiming.
The demo-facing ones:

- **Wave A** (the slice): A1 raid already under attack ≤3 min · A2 kill→salvage→sale→job · A3 next
  rocks a few minutes out · A4 witnessed kill → responder+chaser in 10 s · A5 shots born in-frame
  living ≥0.7 s (**this is the D18 mechanism — confirm it survives the projectile-flight lane**) ·
  A6 the whole slice scenario · A7 muzzles move · A8 stunt names on results.
- **Wave B** (hour ten ≠ hour one): B1 income/encounters after hour 4 · B2 escaped pirate returns
  named · B3 swarm wreck grabbable next round · B4 specialist counterplay · B5 150 WU/s slam ≠ 8 WU/s
  nudge on every channel · B9 daily seed/ghost/share + 5 s kill replay · B11 physics lab on the front
  door.
- **Wave C** (presentation floor): C1–C4 station/map/pause/every screen on the one kit · C5 every
  combat verb has a sound · C6 six skies luminance-bounded · C7/C8 fleet/wreck art via `vm-drop`.
- **Wave D** (60 with the picture on): D1 glass-only 60 Hz · D2 no shader link on first draw ·
  D5 opening admission before first control · D6 save bytes bounded · D7 boot ≤10 s · D8 Crucible
  budget. *Deferred PQ-129 hitch leaves (.11–.17) live here.*
- **Wave E**: E1 pad six verbs · E2 reduced motion keeps facts · E4 five languages (closed
  2026-09-23) · E5 browser/Electron same save · E8 art-directed iGPU-60 preset — **the owner's
  machine is min-spec; this is the demo machine**.
- **Wave G** (little quality, grunt-shaped): G1–G15 — bracket states, denied-latch sound, no
  combat sentences on screen, edge markers, unclipped labels, thrust audio follows throttle,
  disjoint instruments, no text on the hull, bound-key prompts.

## 5. The shell and the package (Phase 7 + release lane)

| # | Work | Owner / state |
|---|---|---|
| S1 | Min-spec floors + soak on a quiet reference host — the current `--next` unit | `PQ-033.02` ready |
| S2 | Browser and Electron read/write the same save | §22 E5 |
| S3 | Electron demo package build (`npm run dist` path exercised end-to-end) | `PQ-033`, `PQ-041` (implemented) |
| S4 | Store page: five screenshots retaken in photo mode; achievements export check green | `PQ-033.03` done — verify assets are current |
| S5 | Sixty-second trailer cut from deterministic Crucible replays | NEW (Phase 7) |
| S6 | Opt-in demo funnel: boot → Crucible → round 3 → results → adventure → end card | NEW (Phase 7) |
| S7 | Fleet bodies: 21 player/traffic/hostile hulls `ready` under `PQ-050.02`–`.22`; remaining player hulls get the Drifter chase-camera pass via `vm-drop` (§22 C7); wreck textures + mining-barge wreck via `vm-drop` (C8) | `PQ-050` lane, C7/C8 |

## 6. Known-unpriced risks to the demo

- **Memory:** D24's +411 MB/52 min slope reaches tab OOM in a long kiosk/session — measure the slope
  on the post-D28 tree before the demo, even if the fix lands later.
- **Unattributed hitches:** 42 of 149 hitch frames have no named owner and the mean unexplained
  interval is 12.6 ms — the witness needs the attribution, not another guess at bloom.
- **Busy-host divergence:** every worst reading (81 s launch, non-firing hostiles, compile tail) is
  load-dependent. Quiet-machine greens do not cover them; demo on a busy machine or the F6 class
  comes back.
- **Check blind spots:** asset readiness can't see its own fetches (L6); D33 means station UI
  stability is currently unmeasured; D18's fix is uncommitted — the ledger row stays open until it
  lands.

## 7. The count

| Bucket | Open |
|---|---|
| Code-audit unreachable seams | 11 rows (§1B) |
| Code-audit dead wiring | 0 — all confirmed cases fixed 2026-09-23 (§1A) |
| Demo leaf | `PQ-210.08` (1) |
| Defect ledger | 7 rows (D15, D18, D20, D24, D26, D33, D34) |
| Queue | 58 ready + 9 planned + 20 deferred + 72 implemented awaiting route acceptance (of 537) |
| §22 waves | A1–A8, B1–B11, C1–C8, D1–D8, E1–E8 minus closed, F1–F15, G1–G15 (verify per-row before claiming) |
| ZERO_TO_HERO §7 | 6 named remainders (load, belt tail, rocks/sky, CAN, round zero+live title, honest death) |
| Residuals ledger | `PQ-205` bombs, `PQ-206` boss-kill question, `PQ-207`, `PQ-208` compass, `PQ-209` salvage→economy chain |
| Uncommitted work | ~448 dirty files incl. the D18 fix |
