# Wave-122 S1 spike-mining report — `devin/s1-sim-worker-spike`

Audited at branch tip `8f0f00f5a` (docs(s1): stage-9 re-review SHIP @ 38a52d901).
Host branch `devin/1791504143-perf-w120` @ `b16d2730a`. Merge-base vs master:
`26c4e0e6d` (spike last merged master at `f157e2fc3`, "280 commits", ~2026-10-03;
master has since moved ~5 days and 4504 file-touches).

This is the adoption checklist, not a re-litigation: the lane is SHIP-proven and
golden bit-identical on the spike itself (stage-8/9 evidence + gates below). The
three named gaps are real; one additional dead-feature gap was found in this
audit (`cargo:jettison`).

---

## 1. BRANCH INVENTORY

### Files the spike touches (vs merge-base 26c4e0e6d)

`git diff --stat 26c4e0e6d...spike` → **203 files, +23,886 / −2,130**.

New transport/lane files (the spine):

| file | lines | role |
|---|---|---|
| `src/core/simLaneMain.js` | 976 | main-side lane: flag resolution, runner facade, directive posting, reply drain, DOM→descriptor surface, fail-closed quarantine |
| `src/core/simLaneJournal.js` | 219 | transport journal — re-materializes wire packs into the `visitRange/discardThrough` reader surface; ack-driven retention both ends |
| `src/core/simLaneCommands.js` | 272 | lane-indirection for main→sim writes: input folds (11 paths), `laneSetMode`, `laneRpc`, settings deep-path writer, DOM/nav/keepalive descriptors |
| `src/core/mainToSimEventSurface.js` | 222 | census-generated `MAIN_TO_SIM_BUS_EVENTS` (120) + `KNOWN_UNFORWARDED_BUS_EVENTS` (67) + bespoke adapters (game:load/save) |
| `src/core/wholeSimBrowserWorker.js` | 60 | browser `Worker` adapter: promise-chain directive serialization, `sendNs` stamps, transfer list, identical reply envelopes to the node twin |
| `src/core/newGameBoot.js` | 305 | new-game boot extracted to a worker-runnable rpc (`newGameBoot`) |
| `src/core/authoritativeSimStep.js` | 78 | the step body shared by both realms |
| `scripts/lib/simWorkerHost.mjs` | 1706 | worker-side host: realm boot, tick handler, SAB arena bind, mirror differ, rpc table, storageOps relay, bridge capture |
| `scripts/lib/simReadModel.mjs` | 1300 | domain mirrors: 44 `DOMAIN_MIRROR_KEYS`, tiered leaf-path signing (cold 60t / warm 10t / enum 10t / sweep 60t), 256KB/key ship cap |
| `scripts/lib/simCommandChannel.mjs` | 307 | typed FIFO envelope kinds: `{input|bus|settings|rpc|nav|mode|spawn|remove|promote|dom|ui|viewport}` |
| `scripts/lib/simEventBridge.mjs` | 169 | worker→main event projection adapters (~1090 types bridged, canonicalClone + entityRef flatten, echo suppression) |
| `scripts/lib/simRealm.mjs` | 136 | realm helpers (`nowNs`, fs/localStorage shims for the worker realm) |
| `scripts/lib/simScenarioDriver.mjs` | 286 | shared applyInput/tape-command path both realms use |
| `scripts/lib/wholeSimWorker.mjs` | 59 | node `worker_threads` adapter (probe/spike harness) |
| `scripts/lib/eventSurfaceCensus.mjs` | 545 | the census generator — produces the forward set, the unforwarded table, and `S1-EVENT-SURFACE.md` |
| `scripts/sf-sim-worker-spike.mjs` | 1719 | gate harness: GATEs A–J (hash parity, transport, rings, cmd channel, event bridge, read model, domains, cmd surface, market parity, canary, flip sched) |
| `scripts/sync-modulepreload.mjs` | 229 | regenerates the index.html modulepreload registry (also wired into `check:contracts`) |
| `design/perf/S1-EVENT-SURFACE.md` | 1674 | the generated census doc — emitters/subscribers per type, per-lane |
| probes | ~900 | `probe-lane-fwd/-input/-load/-readiness`, `probe-journal-direct`, `probe-worker-midtick` |

The remaining ~140 touched files are call-site lane-indirection (a few lines
each: `laneInputWrite` for input/target writes, `laneRpc`/`laneDomEvent` for
synchronous seams, `markAuxRowDirty` plumbing, import churn) plus the unrelated
work that rode the branch (authored-admission upgrades in `partsLibrary.js`,
save-schema growth in `saveSystem.js`, character systems — see §3 conflict map:
much of the spike's diff is actually master history absorbed at `f157e2fc3`).

### Transport architecture

- **Two channels.** (a) `postMessage` envelopes for directives and replies;
  (b) an opt-in SAB journal arena (`?simSab=1`) for the per-tick presentation
  pack columns. In SAB mode the pack columns stay in shared memory; the
  `tickDone` *envelope* still travels postMessage — the wire hop exists on
  every tick regardless of `simSab`.
- **Directive shape.** Main computes `pendingSteps` locally with the *same*
  `advanceFixedTimestep` arithmetic (so `state.timeScale`/pause stay main-side
  inputs), then posts at most **one** in-flight `{kind:'tick', steps, commands,
  ackJournalEnd}` per frame — commands (bus forwards, input folds, dom events,
  rpc) are already folded into the tick envelope, never separate posts.
- **Journal layout.** Worker's presentation journal packs each tick's record
  range into typed columns (`scalars` stride 18, `kinds`, `typeIndex`); posted
  per tick either transferred (non-SAB) or via arena slot (SAB). Main-side
  `simLaneJournal` re-materializes segments so `PresentationPublisher` consumes
  the wire exactly like the in-process ring; `discardThrough` frees segments
  and piggybacks the acked end on the next directive (the worker frees its ring
  slots on that number).
- **Ring sizing.** SAB arena: 8 slots × 4096 records × 147 B/record ≈ 4.7 MB
  (`SAB_SLOT_BYTES_PER_RECORD = 18*8+1+2`, header 64 B, magic `0x53414a31`,
  busy bits at `SAB_SLOT_BUSY_BASE`). Completed-tick reply ring: capacity 8,
  fail-closed overflow. `LANE_STALL_MS = 5000` quarantine. Debug
  `__SF_LANE_APPLIED` ring: 96-cap, left on `window` (cleanup item).
- **Echo-prevention invariant.** Worker→main replay runs under per-type
  suppression; the bridged replay suppresses only the forwarded type, so
  worker-side cascades (`save:restoring`, `mode:changed`) still reach main.
  Known rare hole: a same-type emit inside the forwarded window can be
  swallowed (documented, non-blocking caveat c).
- **Read-model.** `state` on main becomes a mirror facade: entities Map +
  refilled `entityList`, 44 domain keys (whole-root + leaf-path) shipped as
  tiered leaf diffs; poses ride journal records.

### Feature flags / launch gates

- `?simLane=worker` — flips the runtime (`resolveSimLaneFlags`,
  simLaneMain.js:101-130). Anything else → main lane, `createSimLaneRuntime`
  returns null, zero behavior change.
- `?simSab=1|true` — SAB journal arena opt-in; warns + falls back to the
  transfer channel when `crossOriginIsolated`/`SharedArrayBuffer` absent.
- `check-game-playable.mjs --sim-lane worker` — the playable gate on the lane
  (16/16 both lanes at stage 9, incl. LANE-FWD block at :514-630).
- `sf-sim-worker-spike.mjs` flags: `--ticks --seed --inputs --reload-at`
  (golden), `--sab`, `--market-wire`, `--probe aux|domains|commands|
  market-parity`, `--canary`, `--expected-hash`.
- `window.SF.simLaneDiag()` — lane diagnostics incl. `unforwardedEmitCount/
  Types` (the LANE-FWD gate reads these).
- `laneSystemFacade` coverage (registry.get under the lane): `save`
  (save/load/delete/importFile/slots/currentSlot), `physics`
  (prepareBackend/backend), `input` (releaseHeldControls/getInput/
  cancelWorldObjectGesture), `economy` (quote→null), `world` (computeRoute via
  shared `routePlanner`). **Everything else sim-owned → `undefined`.**

---

## 2. GAP ENUMERATION — the 67 KNOWN_UNFORWARDED types

Mechanics: `installBusForward` counts emits absent from *both* `MAIN_TO_SIM_BUS_EVENTS`
and `KNOWN_UNFORWARDED_BUS_EVENTS`; LANE-FWD asserts `unforwardedEmitCount === 0`,
so a *new* unlisted type fails loudly (can't dead-end silently). The 67 named
types are allowed to stay main-side by contract. Source tables:
`mainToSimEventSurface.js:152+` and `S1-EVENT-SURFACE.md` ("Deliberately
main-only", emitters column).

Classification by consumer (all verified against the subscriber list):

### (a) Render/presentation-only — subscribers are all render/UI/audio — 52 types
`alert`, `ambient`, `audio:cue`, `camera:kill`, `camera:shake`, `camera:zoom`,
`combustion`, `contactHail:deck:open`, `customs:breakScan` (authoredMotion rigs
+ vfx recipes only), `dock:attempt`/`dock:denied` (dockDenyBanner only),
`drill:approachStarted`/`drill:approachCompleted` (sandboxSetup UI),
`dust`, `game:loadingProgress`, `game:over:dismissed` (uiRoot flag),
`game:startFailed`, `hud:recallObjective`, `hud:slotClaim`, `hud:slotRelease`,
`nav:waypoint` (authoredMotion render cue only — the sim-side waypoint intent
already crosses as a `nav` *command envelope*, not this emit),
`news:headline`, `news:render`, `presentation:audioCue`, `presentation:caption`,
`presentation:vfxCue`, `ship:deathFlash`, `ship:deathPop`, `ship:rcsPulse`,
`station:navigate` (stationApp), `toast`, `ui:bulkHaulTag`,
`ui:bulkHaulTagCleared`, `ui:closeCargo`, `ui:closeComms`, `ui:cycleComponent`,
`ui:globalFind`, `ui:popScreen`, `ui:pushScreen`, `ui:replaceScreen`,
`ui:screenTop`, `ui:ship:range`, `ui:toggleCargo`, `ui:toggleComms`,
`ui:toggleOverview`, `ui:wingmanRadial`, `uniqueWreck:rumorHeard`, `vent`,
`voice:clear`, `voice:dismiss`, `voice:say`, `watch:changed` — plus
`achievement:unlocked` (emitted by main-side `achievements`; also worker-bridged
when sim-side systems raise it) and `station:exitRequest` (stationApp handles
exit; the resulting undock/mode change crosses via forwarded types + mode lane).

Verdict per row: **acceptable stubs** — every consumer is on the emitting side
of the lane.

### (b) Input/UI intents resolved main-side — state effects already cross via folds — 8 types
`ui:cancel`, `ui:clearTarget`, `ui:confirm`, `ui:cycleTarget`,
`ui:closeAll` (screenManager), `station:exitRequest`, `sim:pause`, `sim:resume`.

The state writes these resolve to (`player.targetId`, `input.*`,
`ui.objectSelection`, …) are inside `LANE_INPUT_FOLD_WRITERS` or the `mode`
envelope. `sim:pause`/`sim:resume` are pure notifications (audio `_onPause`,
`clearHitStop`); the actual pause is `timeEffects` + `state.mode`/`ui.docked`,
and the *step count itself is computed main-side* — the worker only ever runs
`pendingSteps`, so pause works by main simply not shipping steps. Acceptable.

### (c) Dead subscriptions / dead emits — correct by construction — 5 types
`ui:endgameConfirm`, `ui:endingArchiveOpen`, `ui:heliosBay7Scan`,
`ui:restockBombRack` (sim-side subscriber exists, no emitters anywhere),
`ui:navigate` (emitted by `input.js` ×3, **zero** subscribers on either side).

### (d) Correctness blocker — 1 type
**`cargo:jettison`** (`src/ui/hud.js:3495` emit → `:3789` handler). The handler
is main-side and calls `registry.get('cargo').jettison(...)` synchronously.
`cargo` is in `authoritativeSystemManifest` → under `?simLane=worker`,
`registry.get('cargo')` → `laneSystemFacade('cargo')` → `default: undefined` →
the `cargoSys &&` guard degrades to a **silent no-op**: the cargo panel's
jettison button does nothing, no toast, no dump. Playable-check never exercises
it (not in the 16-step path), so it survives every existing gate.

Fix shape: `jettison` rpc on a `cargo` facade entry (`laneRpc('cargoJettison',
{commodityId, qty})` → worker cargo system → `cargo:jettisoned` already bridges
back for bark/vfx/audio), ~30 lines + one focused test. **Small but real —
blocks "zero visible degradation" on the exercised surface.**

### The FORWARD_EXCLUDE 5 (outside the 67, same gate class)
`game:started` (worker emits its own receipt post-boot — verified exactly-once
per lane in LANE-FWD) + the four dead subs above (already counted).

---

## 3. MERGE-CONFLICT MAP (spike vs master, real run today)

`git merge-tree --write-tree origin/master origin/devin/s1-sim-worker-spike`:
**172 files touched by both sides since merge-base; 22 content conflicts**
(the rest auto-merge). Ranked by expected rebase difficulty — hunk counts
measured from the conflicted tree `421f11761a`:

### Tier 1 — semantic, needs a human/agent who knows both mechanisms
| file | hunks | what's colliding |
|---|---|---|
| `src/render/partsLibrary.js` | 13 | authored-admission boundary: master's epoch-scoped residency/stalled-job rework vs spike's boundary-current/disposal reorder. Two comment-only hunks are free; the disposal-chain and stall-verdict hunks need real review |
| `src/save/saveSystem.js` | 3 | master added serializer rows (morrow/vesper/bracket/ravel/solstice/rubric/ruckus/ruud) inside lists the spike reordered; `game:save` handler — keep master's new rows *and* the spike's lane intercept |
| `src/main.js` | 5 | run-reset/newGame flow reworked both sides (master: entityList clear + `game:newGame` alias guard; spike: boot moved to `newGameBoot.js` + lane journal wiring) |
| `src/render/renderer.js` | 7 | 2 import-line hunks (mechanical); the rest: master's compile-admission try/catch vs spike's `urgent`/deadline-glass admission options |
| `src/systems/world.js` | 4 | imports + master's new foldAberrant/CACHE_PAYOFF/STUCK constants vs spike's `markAuxRowDirty` + structure moves |
| `src/world/asteroidField.js` | 4 | master's `noteFieldRockMotion`/`dirtyPoseIds` vs spike's `markAuxRowDirty` — semantic: decide whether auxRow subsumes motion notes or both ride |

### Tier 2 — mechanical replay (spike's lane-indirection re-applied onto master's edits)
`src/ui/uiRoot.js` (4), `src/systems/input.js` (2), `src/systems/lawSecurity.js`
(1), `src/systems/touch.js` (1), `src/ui/worldObjectInteraction.js` (2),
`src/ui/screens/pause.js` (1), `src/render/vfx.js` (1), `src/render/assetLoader.js`
(2), `src/systems/economy.js` (1), `src/world/farEncounterOutcomes.js` (1),
`src/core/presentationJournal.js` (2), `src/core/presentationRunner.js` (1),
`scripts/check-save-resume-confidence.mjs` (1), `scripts/sf-sim-cli.mjs` (1 —
spike replaced most of it with lane probes).

### Tier 3 — regenerate, don't resolve by hand
`index.html` (9 hunks — all inside the modulepreload registry; take union then
`node scripts/sync-modulepreload.mjs` to canonically regenerate),
`src/data/modelTruthCensus.json` (1 — regenerated artifact).

**Adoption-ordering note:** most Tier-2 conflicts exist only because the spike
sat 5 days behind master. A rebase that lands *soon* stays ~22 files; every
additional wave touching `partsLibrary/saveSystem/renderer/main` widens Tier 1.

---

## 4. THE p95 POSTMESSAGE PROBLEM (0.85 ms)

**What wireMs measures** (spike.mjs:990): `recvNs − frame.sendNs` — the
worker→main reply *delivery hop* — plus the symmetric directive hop as
`directiveWireMs`. `transportMs = pack + wire + consume`, gate = p95 **and**
mean < 0.5 ms. SAB mode already removes the pack cost (~0.03 ms); the residual
is the envelope hop itself.

**Decomposition measured on this box** (node worker_threads, 800 hops/size;
`scratch-lanebench.mjs`, since deleted — rerun instructions in §6 stage C):

| payload | RTT/2 mean | p50 | p95 | max |
|---|---|---|---|---|
| meta-only (~200 B) | 0.145 | 0.056 | **0.483** | 2.0 |
| 1 KB cloned | 0.174 | 0.076 | 0.502 | 1.9 |
| 64 KB cloned | 0.254 | 0.222 | 0.515 | 3.1 |
| 64 KB transferred | 0.235 | 0.130 | 0.523 | 11.1 |
| 1 MB cloned | 1.426 | 1.229 | 2.646 | 8.7 |
| 1 MB transferred | 0.884 | 0.777 | 1.852 | 4.3 |
| **SAB Atomics stamp→observe** | **0.048** | 0.026 | **0.099** | 2.6 |

**Verdict: wake/scheduling latency, not clone size, not GC.** A zero-payload
hop already costs ~0.5 ms p95 on Windows worker_threads; clone bytes only bend
the curve above ~64 KB (and the pack columns are already transferred/SAB). The
baseline-identical signature noted in the horizon doc is consistent with this —
it's the platform's cross-thread wake cost, unchanged by payload. In a real
browser the hop is renderer→Worker IPC (different code path, same class of
latency; hardware-unverified here — SwiftShader box).

**What brings it under the 0.5 ms gate:** move the two per-tick *envelopes*
(tick directive, tickDone reply) onto the SAB arena the same way the pack
columns already ride — an envelope cell pair in the header with `Atomics`
sequence numbers. The worker parks on `Atomics.wait` (legal on a dedicated
thread — it has no frame to miss); main observes the stamped reply inside its
existing once-per-frame journal consume (a poll, no wait needed — it already
drains `completedTickRing` there). Keep postMessage only for the rare kinds
(rpc, bus forwards… actually bus forwards already ride the tick envelope —
postMessage remains for rpc replies, storageOps, errors, boot). Predicted
transport p95: pack ~0.03 + observe ~0.10 ≈ **0.15 ms** (MECHANISM_VERIFIED
components; end-to-end on the browser lane: UNVERIFIED until built).

Not viable: batching (already 1 post/direction/tick), transferables (already
used; bench shows they don't fix wake latency), smaller envelopes (envelope is
already ~200 B).

**Framing note for the orchestrator:** the hop is *latency*, not frame cost —
replies drain asynchronously; a slow wire presents a ~1 ms staler frame, never
blocks the present. The gate exists because the campaign holds transport <0.5 ms
as a proxy for lane honesty; the flag staying opt-in until SAB envelopes land is
the conservative read, not a hard requirement for merging the (inactive-by-
default) code.

---

## 5. ELECTRON LANE

What `?simLane=worker` exercises today: `check-game-playable --sim-lane worker`
boots the game with the query string and runs the same 16-step playable
contract + the LANE-FWD block (forwarded-surface exercise, `unforwardedEmitCount
=== 0`, `game:started` exactly-once parity). That coverage is **browser-only**.

The Electron path (`electron/main.cjs`):
- `gameUrl = http://127.0.0.1:${port}/` — **no query string ever reaches the
  page**. There is no env/argv plumbing: `win.loadURL(gameUrl)` (:861) is the
  only route, so `?simLane` cannot be exercised at all today. (~10-line fix:
  append a `SF_SIM_LANE`-env-derived search to `gameUrl`, or a packaged
  `--sim-lane` launch flag.)
- webPreferences (:786): `contextIsolation: true, nodeIntegration: false,
  sandbox: true`. None of these block a module `Worker` (`new Worker(
  wholeSimBrowserWorker.js, {type:'module'})` is a Blink worker — sandbox-safe;
  the `rapier3d-compat` bare-specifier gap the spike already fixed applies
  identically here).
- **SAB is already unblocked**: `scripts/lib/gameServer.cjs:262-263` emits
  `Cross-Origin-Opener-Policy: same-origin` + `Cross-Origin-Embedder-Policy:
  credentialless` on every response → `crossOriginIsolated === true` in the
  Electron renderer → `SharedArrayBuffer` + unclamped `performance.now()` work.
  The header comment even names this purpose ("the built phase-14 sim-worker
  transport").
- `backgroundThrottling` is already managed for evidence launches; a worker
  lane makes occlusion-throttling regressions *more* dangerous (frozen main ⇒
  worker keeps ticking → journal overflow → fail-closed lane death). Verify the
  lane under a hidden/occluded window specifically.

Needed to cover the lane: (1) the URL provisioning hook above; (2) one
Electron run of the playable contract under `?simLane=worker&simSab=1`;
(3) `check-electron-*` lane parity added to whatever soak the orchestrator
trusts for release gating.

---

## 6. ADOPTION PLAN — staged sequence to production

**Stage A — merge the spike behind its flag (≈1 session).**
Rebase/merge master onto the spike resolving the 22 conflicts (§3), regenerate
`index.html` + `modelTruthCensus.json`. Verify: `node --check` touched files;
`event-bus-contract`, `authored-precompile-residency`, `encounter-pending-
decode-warm`, `sector-prewarm-boundary-generation` suites; golden
`--ticks 720 --seed 47 --inputs test/47a.inputs.json --reload-at 600` →
sha256 `0b33dde1…` on **both** `main` and `worker` lanes; `check-game-playable`
16/16 both lanes. Mergeable to master the moment it passes — the inactive-by-
default flag means zero production risk; the lane code is dormant without
`?simLane`.

**Stage B — dead-feature sweep (≈0.5–1 session, can parallel A).**
Fix `cargo:jettison` (§2d) and census-sweep the whole class: every
`registry.get('<sim-owned-id>')` call reachable from a main-side path must
resolve to a real facade or fail loudly — the stage-5 census verified
*degradation*, but jettison proves silent-degrade can mean *dead feature*.
New gate: LANE-FWD-style assertion that a facade miss on a sim-owned id logs a
named diagnostic (not silent undefined).

**Stage C — SAB envelopes, the GATE B unblocker (≈1–2 sessions).**
Envelope cells in the arena header per §4. Worker `Atomics.wait`; main polls in
the existing consume slot. Gate: `sf-sim-worker-spike --sab` transport p95 <
0.5 ms (predicted ~0.15 ms); browser A/B via `?simLane=worker&simSab=1` vs
off on the scripted-input probe. This is the only stage that touches the
adopted hot path.

**Stage D — Electron provisioning (≈0.5 session).**
`?simLane` URL hook (§5), one packaged + one dev run of the playable contract,
occluded-window check. Cheap because the headers already enable SAB.

**Stage E — opt-in → default (≈1 session + soak).**
After C+D: flip the default to worker-with-main-fallback (keep `?simLane=main`
as the escape hatch), run `check-release-soak-electron` + browser soak, then
make worker the default in a later wave once the soak ledger is clean. Keep the
journal/mirror/`?simLane=main` path forever — it is the rollback and the
golden-comparison lane.

Total: **≈4–5.5 sessions** of orchestrator-lane work; stages A–B could land in
one combined session if the conflicts resolve cleanly.

---

## 7. VERDICT

**proceed-with-changes.** The spike is adoption-ready as dormant code today
(merge behind the flag after the 22-conflict rebase); it is not ready to become
the default until (i) the `cargo:jettison` dead feature is fixed and the facade-
miss class is gated, and (ii) the wire envelope moves to SAB so GATE B holds.
The W121 adjudication's PURSUE call stands.

| claim | evidence |
|---|---|
| Lane is byte-identical dormant (`?simLane` absent → null, zero behavior change) | MECHANISM_VERIFIED (code path; 16/16 main-lane playable per stage-9) |
| Golden bit-identical both lanes, incl. reload-at-600 | PERFORMANCE_VERIFIED on the spike (gate A/I; node harness) — re-run after the A-stage rebase |
| Transport cost breakdown: pack ~0.03 (SAB), wire p95 ~0.85 | PERFORMANCE_VERIFIED for pack/consume on spike; wire p95 decomposed by this audit's micro-benchmark (platform wake latency, clone-size-independent <64 KB) |
| SAB-envelope path lands transport <0.5 ms | MECHANISM_VERIFIED components (Atomics hop p95 0.099 ms measured) / UNVERIFIED end-to-end until built |
| 67 unforwarded types: 66 acceptable, 1 dead feature | MECHANISM_VERIFIED (census tables + subscriber grep + facade trace for cargo) |
| Electron SAB unblocked today; `?simLane` unreachable today | MECHANISM_VERIFIED (gameServer.cjs headers; main.cjs gameUrl) |
| 22 real conflicts / 172 overlap; Tier-1 file difficulty ranking | MECHANISM_VERIFIED (`git merge-tree` on today's heads) |
| Frame-pacing benefit of the lane on real hardware | hardware-unverified (SwiftShader box cannot measure; needs a real-GPU A/B) |
| Browser DedicatedWorker hop ≈ node worker_threads hop | UNVERIFIED here — same class, different code path; the SAB fix sidesteps the question |
| `Echo-suppression same-type drop` (documented caveat) | UNVERIFIED rare-path; keep as known-risk on the rollout checklist |

---
*Audit-only lane — no game code written, no PR opened, no app run. One
throwaway micro-benchmark (`scratch-lanebench*.mjs`) ran on the host branch and
was deleted.*
