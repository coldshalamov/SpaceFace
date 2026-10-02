# S1 Phase-B — STAGE 9: event-command-surface census + boundary closure

You are implementing stage-9 of the whole-sim-in-worker campaign on `devin/s1-sim-worker-spike`
(repo `coldshalamov/SpaceFace`). Stage-8 landed the browser flip (`?simLane=worker`, head
`9187b482e`); the independent reviewer (`s1-stage8-REVIEW`, verdict NOT-SHIP, transport verified
solid) found the boundary coverage gap: **the bus event command surface was never censused** —
only synchronous reads were. Your job: close the boundary so the worker lane is a real client,
then re-verify everything.

## Environment (Windows + Git Bash)

- node: `/c/hostedtoolcache/node/24.0.1/x64/node` (absolute path always — goldens differ across runtimes)
- npm: `node /c/hostedtoolcache/node/24.0.1/x64/node_modules/npm/bin/npm-cli.js` (bare npm hangs)
- Spike worktree may exist at `C:/Users/Administrator/repos/SpaceFace-s1`; else clone+checkout
  `devin/s1-sim-worker-spike` and `npm ci` + symlink/Prereqs per the repo README.
- Golden sim harness on the spike: `node scripts/sf-sim-worker-spike.mjs --ticks 720 --sim-lane <main|worker> [--sab] [--json]` (installs realm fs).
- Real-browser probes run on this box: `node scripts/check-game-playable.mjs` with `?simLane=worker` flag env per the script's convention (read its head comment).
- `find` = `/usr/bin/find`; CRLF landmine — `git add` explicit pathspecs only, never `-A`.

## Scope — the stage-8 review's findings ARE the contract

The reviewer proved the gap empirically on a live `?simLane=worker` boot: `SF.bus.emit('ui:setCourse', ...)`
never reached the worker (waypoint stale, autopilot idle); `settings:changed` likewise. Root cause:
`MAIN_TO_SIM_BUS_EVENTS` in `simLaneMain.js` `installBusForward` forwards only **9** event types;
~90 event types are emitted main-side with sim-side subscribers and no forward path.

### 9.1 — Census + forward the main→sim event surface (SEV-1, BLOCKER)

Enumerate every event type with sim-side subscribers (`bus.on(` inside sim-side systems — use the
same boundary method stage-5 used: sim-side = the set of modules the worker imports; a type is
main-emitted when an `emit`/`emitEnvelope` call site lives in `src/ui/**`, `src/render/**`,
`src/main.js`, audio/presentation layers). Known dead set from the review (verify, don't trust):
trading `ui:buy/ui:sell/ui:service/economy:payBounty/economy:marketOpened`; missions
`ui:acceptMission/ui:trackMission/ui:abandonMission`; nav `ui:setCourse/world:requestJump/
world:requestRoute/world:requestSectorScan/world:abortJumpCharge`; shipworks `ui:buyShip/
ui:buyModule/ui:fitModule/ui:unfitModule/ui:fitPayload/ui:unfitPayload/ui:setActiveShip/
ui:setShipAppearance/ui:unlockTech/ui:saveLoadoutPreset/ui:applyLoadoutPreset/ui:deleteLoadoutPreset`;
bomb rack `ui:buyPayload/ui:sellPayload/ui:restockBombRack/ui:upgradeBombRack/ui:prepareBombRack/
ui:previewBombRackPreparation`; fleet `ui:fleetOrder` + wingmen; `ui:endgame*`; dialog `*:choose`/
`contactHail:choice`/`pirateParley:choose`/`moralTrap:choose`/`lawfulInspection:choose`/`customs:submit`/
`contraband:bribe`/`faction:bribe`/`career:ladder:choose`/`career:origin:accept/decline`/`encounter:choose`/
`vestaOreCache:choose`/`pallasHiddenCache:choose`/`survivorPod:choose`/`wreckMission:choose`/
`law:impoundPay`/`scenario:scavengerResponse`/`player:recoveryRequested`; run mode `run:awardRequested/
run:beginRequested/run:draftPickRequested/run:draftRerollRequested/run:loadoutReady/
run:openingPrepareRequested/run:refitCloseRequested/run:refitFitRequested/run:refitStripRequested`;
misc `ui:kurtzInteract/ui:factionPresenceService/ui:purchaseFrontierRumor/ui:purchaseSurveyData/
ui:firstRunSplash:done/drill:approachRequested/settings:changed/hud:layoutChanged/debug:invulnerable/
debug:refillPlayer/voice:surface/range:opened/save:loadSpeculationTarget/save:error/
input:worldGestureCancelled` + `dock:docked`/`dock:undocked`/`dock:launder` (SEV-2: state fold ships
but sim reactions die).

Design constraint: **payloads must be wire-safe** — payloads carrying live entity refs/functions must
flatten through per-type adapters (`entity:kill`/`entity:spawnRequest` already do this). The census
output (a file like `design/perf/S1-EVENT-SURFACE.md` or a generated table) must list: type,
main-side emitters, sim-side subscribers, adapter required (yes/no + shape), and any type
*deliberately* left main-only with the reason — every forwarded type must justify or carry an
adapter. Add a diagnostic counter for un-forwarded emit types so the next gap is loud, not silent.
Prefer an explicit census-driven forward set (or a denylist of provably main-only types with the
list itself generated from the census) over another hand-maintained allowlist.

### 9.2 — Settings lane parity (SEV-3)

`settings` excluded from mirrors AND the settings screen writes `ctx.state.settings` main-side.
Route the settings screen's `_set` through `laneWriteSetting`/`LANE_SETTINGS_WRITERS` (extend the
writer table for the full gameplay./control./accessibility surface, not just the existing
timeScale/difficulty/video trio). Fix the asymmetric `_restoreSettings` (worker-side settings write
the main copy never sees → applyAccessibility/audio/UI stale post-load).

### 9.3 — `sector:enter` full payload (SEV-4)

Adapter ships `{id,name,seed}` lite shell; `renderer.js:12062` needs the full sector
(`resolveSectorVisualProfile`, palette transition, hazards, `_pendingPostOpeningSector`). Resolve
the full sector main-side inside the adapter (world mirror holds it) or fall back to
`state.world.sectors[sectorId]` in the handler.

### 9.4 — Save facade gaps (SEV-5)

`deleteSlot` (worker shim's index zombie), `peekSlot`, `importFile`, `exportSlot`,
`listSlotsIndexCards` — extend the lane save facade; fall back correctly when a facade op is
absent.

### 9.5 — LOW cluster (bounded, same pass)

`sabArena:null` hardcoded (wire `?simSab=1` properly or make the flag loudly fail);
`registry.keepalive` early-returns under lane (yard repair stalls docked+paused);
`computeRoute` facade/rpc for galaxyMap preview; `cancelWorldObjectGesture` input facade;
`storageOps` shipped on `tickDone` only (non-tickDone replies drop writes; `stageLaneStorage`
wholesale wipe can drop an unflushed relay); `installBusForward` never unwraps on `close()`
(second attach double-forwards); dead code (`stallDetected` in probe, `boundaryErrorCount`);
`onmessageerror` note.

### 9.6 — Correct the stage-8 doc row (D)

`design/perf/STRUCTURAL-HORIZON.md` stage-8 row's gap list must honestly enumerate this surface
(fixed = strike through; left = state why) and the "zero visible degradation" claim revised.

## Hard rules

- Bit-identical golden on ALL three modes: `--sim-lane main`, `worker`, `--sab`
  (`f589bdd53360693b76d89ea54db2dd5816f45feb00c5f203d882a9637d729cdb`, 720 ticks, reload-600).
- No wall-clock/rAF/setTimeout inside sim paths. No DOM reads worker-side. Deterministic ordering.
- Main lane behavior byte-identical (all new machinery gated on `laneCommandSink()`/worker lane).
- Payload adapters must not snapshot live mutable objects without flattening (the entity-ref rule).
- The flag stays opt-in; do NOT flip the default.
- Extend `check-game-playable` coverage or add a focused probe that EXERCISES the forwarded surface
  in worker lane (e.g. emit `ui:setCourse` + verify worker-side `nav.waypoint` + `settings:changed`
  + one trade op + a `dock:docked` reaction) — the reviewer's green-battery caveat stands: a green
  that never touches the surface is no proof.

## Report

End with: forwarded-type table summary (count + categories), per-finding disposition
(fixed/deferred+reason), golden results ×3 modes, focused probe results, any remaining known gaps.
Commit to `devin/s1-sim-worker-spike` with `perf(s1-stage9)` prefix. Report via your final message;
do not open a PR.
