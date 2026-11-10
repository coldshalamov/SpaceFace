# S2 systems A review: tallyho, pirateDisguise, bouncer, gateThreeWeir, gateThree

Scope: uncommitted working tree vs HEAD, 2026-10-27. Read-only. No repo file edited, staged or stashed. Probes ran inline via `node --input-type=module` stdin (nothing written).

## Headline
- All 11 relevant test files pass: 189 tests, 0 failures. No re-runs needed.
- D264 (pirateDisguise listeners recursing into themselves) does NOT reproduce in the current tree. The distinct-name fix is already present. The ledger row is stale for this tree.
- Two systems add persistent state that does not appear in the save code: tallyho (`state.tallyho`) and bouncer (`state.stationRecords.bouncer`). Code-read only, not runtime-verified.

## Verdicts
- src/systems/tallyho.js (+1138/-5): FIX, blocker for landing. Adds hunts, bounties, rival cooling, bets, sightings. Save gap, new in this expansion: `ensureTallyhoState` writes `state.tallyho` (tallyho.js:278), HEAD has no such key (count 0), and the save serializer (`_serializeDataSteps`, src/save/saveSystem.js:1080-1285) has no tallyho key; nothing under src/save mentions it. Consequence: a staked bet charges credits at posting (`_charge`, tallyho.js:635-637, emits economy:chargeCredits) but its bet row is not saved, so a reload keeps the charge and drops the bet. Fix: add `data.tallyho = this._callSerialize('tallyho') || clonePlain(state.tallyho || {})` to the serializer, add the restore side, and add a save round-trip test. Not verified at runtime.
- src/systems/pirateDisguise.js (+1195): LAND. D264 is not reproducible (section below). Cover book persists: it lives at `state.player[COVER_STATE_KEY]` (pirateDisguise.js:220-226), and `serializePlayerRecord` clones the whole player (saveSystem.js:9095-9099).
- src/systems/bouncer.js (+818/-20): LAND on persistence (code-read only). Offender ledger is bounded with live-paper-safe eviction (bouncer.js:869-897). Its record is mirrored into story flags under `bouncer_records` (`_persistRecords` / `_recordsFromMirror`, bouncer.js:384-408) and restored from that mirror on load, so it does not depend on `stationRecords` being saved. Not checked: that `_flags()` resolves to the saved story flags.
- src/systems/gateThreeWeir.js (+631/-43): LAND. Record lives at `state.story.gateThreeWeir`, and `story` is saved via `_serializeMissions` (saveSystem.js:1458, serializer line `data.missions`). Growth capped: logCap (:170), laneCap (:184-188, :484), REBATE_CAP 8 (:148).
- src/data/gateThree.js (+86/-0): LAND. Authored lines and comments only.

## Tests (`node --test`, serial, one run each)
| File | Result |
|---|---|
| test/tallyho-expansion.test.mjs | 35/35 |
| test/tallyho.test.mjs | 10/10 |
| test/pirate-disguise-expansion.test.mjs | 29/29 |
| test/bouncer-expansion.test.mjs | 32/32 |
| test/bouncer.test.mjs | 13/13 |
| test/gate-three-weir-expansion.test.mjs | 30/30 |
| test/gate-three-weir.test.mjs | 14/14 |
| test/authoritative-manifest.test.mjs | 16/16 |
| test/inf-paper-wash-4242.test.mjs | 2/2 |
| test/next-wave-law-06.test.mjs | 1/1 |
| test/pq-151-02-launder.test.mjs | 7/7 |

## D264: pirateDisguise shadowing (current tree)
- Wrappers at pirateDisguise.js:417-422 are named `_onDocked`, `_onUndocked`, `_onSaveLoaded`. Each calls a different method: `_handleDocked` (:877), `_handleUndocked` (:1305), `_handleSaveLoaded` (:1320). No method is named like a wrapper. The only other mentions are the off() calls at :1357, :1360, :1361.
- Probe 1: sim created with `createSimulation` and `systems: [pirateDisguise]`, then bus events emitted: dock:docked (helios and smuggler), dock:undocked, save:loaded, dock:launder. No throw, no console.error.
- Probe 2: `bus.on` wrapped to capture listeners, each captured listener called directly (bypasses the bus try/catch). All returned ok, including the three save:loaded listeners.
- Proposed minimal fix: none needed in this tree. If a method with a wrapper's name ever returns, rename the wrapper property (for example `_dockListener`) and update the matching off() line in the same edit.
- Ledger action: the row should leave DEMO_READINESS §6 on re-verification (it describes code this tree no longer has). Not struck through, not applied here.

### Why the 955-line test missed it
1. It never emits save:loaded (grep of test/pirate-disguise-expansion.test.mjs: zero hits). It does emit dock:docked (:566) and dock:undocked (:839), and both pass.
2. The bus swallows listener exceptions: src/core/eventBus.js:79-85 (`invokeBusListener`). A throw is recorded (console.error at :131, summary via `busFaultSummary`, :156), not raised to `emit`. A test that asserts only on downstream receipts passes while a listener throws. A regression check would need to assert on the bus fault summary or call the listener directly.
3. The bug is absent in this tree, so a green run is consistent with the code.

## Wiring
- Registered: src/core/registry.js lines 569 (pirateDisguise), 717 (gateThreeWeir), 719 (bouncer), 722 (tallyho).
- Ticked: all four appear in PRODUCTION_INIT_ORDER (manifest lines 30-95) and PRODUCTION_UPDATE_ORDER (lines 102-192). Not checked: manifest lines 350-418 also list them; I did not identify those lists.
- Persistence: pirateDisguise yes (player record). gateThreeWeir yes (story via missions). tallyho NO evidence (see FIX). bouncer NO evidence (see INCOMPLETE).
- Growing lists: capped in tallyho (MAX_SIGHTINGS 32, MAX_HUNT_ROWS 24, MAX_RIVAL_ROWS 16, MAX_BOUNTY_ROWS 12, LOG_CAP 20, PAID_STAMPS_CAP 96), gateThreeWeir, and bouncer. pirateDisguise witnesses/log/paid/offers caps not verified.

## Defect read
- Math.random, Date.now, performance.now, TODO, FIXME, console.log: none in new code. Only comment mentions (pirateDisguise.js:29, bouncer.js:78). Counts equal HEAD.
- Event names: 61 names emitted by these systems. About 40 appear nowhere else in src/ (each only at its emit line). Examples: tallyho:huntPosted, tallyho:bountyPosted, bouncer:ejected, bouncer:wanted, gateThree:inspection, pirateDisguise:revealed, pirateDisguise:tipPaid. Probably telemetry. Player-facing output seems to go through toast, comms:log and economy events, which are heard. Not verified that any HUD consumes them.

## Not checked
- Save/load round trip at runtime (all persistence findings are code-read).
- Full diff read: outlines only for tallyho, bouncer and gateThreeWeir, not every hunk.
- Caps on pirateDisguise witnesses, log, paid and offers arrays.
- Whether one dock emits both dock:docked and dock:launder (possible double wash).
- Default-route visibility of the new toasts and comms lines.
