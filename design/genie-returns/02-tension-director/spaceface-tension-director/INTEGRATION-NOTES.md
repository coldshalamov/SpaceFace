# Integration notes

## 1. Ownership and ordering

`createTensionDirectorSystem()` creates an isolated system instance. The exported `tensionDirector`
is the conventional browser-registry singleton. Use the factory for separate simultaneous
headless worlds; never initialize one singleton with two GameStates.

Only this system writes `state.tensionDirector`. It does not assign `state.encounterDirector`,
`state.difficulty`, player credits, ship protection, entities, or AI flags. The encounter owner
reads the validated policy and changes its own pressure/scheduling/session-rhythm fields.

The installer adds an import and lookup entry in `src/core/registry.js` and inserts the ID
immediately before `encounterDirector` in all three arrays in
`src/runtime/authoritativeSystemManifest.js`:

```js
// Preserve all other entries and their existing relative order.
// PRODUCTION_INIT_ORDER, PRODUCTION_UPDATE_ORDER, CALENDAR_CLOCK_IDS:
'…previous entry…', 'tensionDirector', 'encounterDirector', '…next entry…'
```

The arrays are the authority. Do not add a registry-only splice after resolving the manifest.
The supplied manifest architecture defaults this system to Node-safe simulation capability;
calendar dispatch is 2 Hz and the component throttles its own decisions to 1 Hz. The existing
campaign encounter owner also paces its pump at 1 Hz. If a host dispatches all systems at 60 Hz,
only the time/mode guard runs on the extra calls.

**Node-specific host check:** a headless host with its own system map must import the factory,
instantiate it once per world, and map the result under `tensionDirector`. The generic shape is:

```js
import { createTensionDirectorSystem } from './path/to/systems/tensionDirector.js';
const pacing = createTensionDirectorSystem();
// Add to YOUR existing per-world lookup BEFORE resolving the production manifest.
systemLookup.set('tensionDirector', pacing);
```

The example names a local variable, not a claimed existing API in an unseen file. Use the
actual host's existing lookup and lifecycle. Rerun browser/Node manifest parity checks; do not
exclude the new system to make a missing-lookup failure disappear. Keep legacy profile membership
unchanged unless that profile deliberately opts in.

## 2. Existing consumer changes

The supplied full consumer and small patch change exactly these seams:

* `_accrue`: multiplies existing combat and civilian pressure deltas by bounded factors.
* `_pump`: ranks already-due, already-authored items by due time plus a capped contextual bias;
  it still executes original pacing, eligibility, proximity, spawn-admission and fire paths.
* `advanceSessionRhythm`: the encounter owner adopts the leased requested phase in its own state.
  Without a valid lease, the existing eight-phase rhythm code runs unchanged.
* `encounterPacingBlockReason`: adds protected-window, major-reservation, and additional-spacing
  vetoes before the unchanged existing hard gates. It cannot grant permission past those gates. Every readiness veto also publishes a quiet
legacy rhythm so the existing tactical reader does not infer escalation permission from an
otherwise retained build/peak control phase.

The system does not mutate the current fight to fake a release. Existing law/security pressure,
authored content, pin-release logic and damage adaptation keep their owners. Recovery suppresses
new director-controlled combat only. It does not grant immunity or make pursuing police vanish.

## 3. Event intake: facts, not inferred successes

Every timestamp is read from `state.simTime`, never a caller-supplied event timestamp.

| Bus event | Required evidence | Recorded channel |
| --- | --- | --- |
| `combat:damage` | Positive finite `applied` (or `amount` only if `applied` absent), player target/attacker | Normalized incoming loss or combat activity |
| `entity:killed` | `id`/`entityId` matches player, or `killerId`/`ownerId` matches player | Defeat or player-attributed outcome |
| `mining:yield` | `minerId === state.playerId`, positive quantity | Mining activity |
| `tether:attached` | `ownerId === state.playerId` | Tether activity |
| `pickup:collected` | `collectorId`/`playerId` matches player | Salvage activity |
| `sector:enter` | Current sector ID, bounded semantic deduplication | Exploration |
| `poi:discovered` | Local player/sector if supplied, concrete POI ID | Exploration |
| `encounter:telegraph` | Current-sector receipt | Offer, NOT delivered spawn |
| `encounter:spawned` | Current-sector receipt and finite `count > 0` | Actual materialization, NOT player engagement |
| `encounter:resolved` | Current-sector receipt; combat flag comes from `deck` | Resolution; NOT invented kill credit |

Incoming damage is divided by maximum hull + shield + armor, not the remaining protection pool.
`applied: 0` is authoritative even when requested `amount` was large. Player-attributed events
exclude unrelated NPC combat and pickups. A receipt of materialization is still not a fight:
proximity/recent player damage exchange supplies engagement evidence separately.

Legacy pickup producers without collector identity are deliberately not counted. Do not change
this to “all pickups belong to the player.” Use a confirmed local ownership fact instead.

### Confirmed transactions and optional facts

The inspected playthrough service records trades after `economy.execute`; a public
`economy:traded` receipt was not established. This delivery does not subscribe to a fictional
trade event and does not mistake a credit increase for a sale. The actual successful owner can
use the optional port after committing its transaction:

```js
// INSIDE the actual transaction owner, after success and with a stable unique receipt ID:
ctx.helpers.tensionDirector?.observe({ kind: 'trade', token: actualTransactionId });
// Mission completion/acceptance must also be backed by the owner's successful transition:
ctx.helpers.tensionDirector?.observe({ kind: 'mission', token: actualMissionTransitionId });
```

The placeholders above represent your real receipt IDs, not fields the packet guarantees.
Other canonical kinds are `incoming`, `combat`, `mining`, `tether`, `exploration`, `salvage`,
`offered`, `delivered`, `resolved`, `defeat`, and `kill`. `amount` defaults to one; use a normalized
protection fraction for incoming damage. `combat: true` identifies a combat resolution;
`shape` identifies an offered/delivered shape; `token` deduplicates semantic receipts.

Only trade, mission and defeat facts may cross appropriate dock/non-flight boundaries through
this explicit port. Survival, tutorial, pause and disabled modes reject them. Combat cannot be
smuggled through the dockside helper. Do not emit both a bus fact and the helper equivalent
unless they share a deliberately deduplicated token.

## 4. Save/load: exact owner continuity is available, host wiring is explicit

The model is plain JSON and includes the rolling bins, phase clock, hysteresis, fatigue,
confidence, recent identities, filters, policy sequence and bounded trace. Persist it inside
YOUR normal versioned save envelope, without retaining entity references:

```js
// Serialize along with the SAME simulation-clock and world snapshot:
savePayload.tensionDirector = ctx.helpers.tensionDirector?.serialize() ?? null;
```

`savePayload` is illustrative; this package does not invent the unseen save envelope structure.
On restore, stop the normal simulation, restore its clock and world, and then either:

```js
// Direct port route; malformed snapshots throw before replacing the current owner.
ctx.helpers.tensionDirector.restore(loadedPayload.tensionDirector);
```

or use the existing restore boundary that the adapter already listens to:

```js
bus.emit('save:restoring');
// Restore the actual world and state.simTime here.
// Route A: include the owned snapshot in the loaded receipt:
bus.emit('save:loaded', { /* existing payload fields */, tensionDirector: loadedPayload.tensionDirector });
// Route B: assign the loaded root field as part of normal state restoration, then emit save:loaded.
```

Choose one route; do not restore twice or wipe the newly restored field after `save:loaded`.
Listeners reject an incoming snapshot ahead of the restored simulation clock. During a restore
boundary the old policy is invalidated and old-world events are ignored. On failure, the actual
save owner emits its existing `save:error` receipt to resume the outgoing history.

If an older save has no snapshot, or a snapshot is incompatible, the system emits a reset
reason and starts a new protected quiet opening. **That is a safe non-exact migration, not an
exact replay continuation.** Never carry outgoing history into a different save just because
its schema matches. The paired fixed-seed fixture verifies exact owner continuation when the
snapshot and clock do match; it does not certify the unseen game's entire save stack.

## 5. Lifecycle and feature control

`init(ctx)` installs listeners and the helper port. `newGame()` clears all owner history.
`destroy()` unsubscribes listeners, invalidates its policy, and removes only its own helper
reference. The adapter observes `game:new`, `save:restoring`, `save:loaded`, and `save:error`.
Calling initialization again on the same instance tears down the previous subscriptions first.

Set `state.settings.gameplay.tensionDirector = false` to disable the new policy; the existing
campaign rhythm and pressure rates remain available as the fallback. This is an integration flag,
not a new settings UI. Disabled mode preserves the old owner history in memory but stops its active
clock and fact intake. Re-enabling buys a 20-active-second admission grace. Use the reset port to
start a new arc instead of resuming that history. Survival, docking, tutorial, pause, non-flight,
and missing/dead player states suspend campaign pacing. A fractional-tick resume publishes a protective read lease immediately,
without advancing the active clock or emitting an extra scheduled decision.

## 6. Diagnostics and emitted events

```js
const readout = ctx.helpers.tensionDirector.inspect();
const smallReadout = ctx.helpers.tensionDirector.inspect({ includeTrace: false });
```

Both are detached from live state. The default trace is chronological and capped at 192 records.
Use `policy.requested` versus `policy.observed`, phase/reason, rolling offers/spawns/resolutions,
fatigue, pending supply and `scanTruncated` to understand behavior.

| Emission | Cadence / semantics |
| --- | --- |
| `tension:policy` | At most 1 Hz while eligible; detached, frozen read receipt |
| `tension:phaseChanged` | On real controller phase transition; previous/new phase and reason |
| `tension:chapterChanged` | Thirty-minute active-time boundary |
| `tension:decision` | On transitions/starvation or every 5 active seconds; optional via factory |
| `tension:starved` | Failed build-up diagnosis; at most one per 120 active seconds |
| `tension:reset` | Explicit lifecycle/migration/clock-rewind/invalid-snapshot reason |
| `tension:restored` | Successful validated owner-state restore |

`no_combat_supply` means the bounded pending roster contains no combat supply.
`combat_not_delivered` means supply exists but no engagement arrived. Neither causes a direct
spawn or automatic gate bypass. `secondsSinceSpawn` is since ANY materialization, not necessarily
combat; combine it with the reason and pending combat count. `scanTruncated` closes new combat
admission conservatively rather than assuming an unread roster is empty.

## 7. Required local acceptance

Before merging: verify the resolved browser/Node manifests include one correctly ordered system,
wire the real save envelope and optional transaction receipts, run the existing campaign/save/
survival/difficulty/encounter suites, and execute the actual hunter/prospector/improviser policies
with seeds 4242 and 8008. Compare session-shape metrics, failed spawns, law pressure, frame-time and
economic chains without weakening the current production acceptance criteria. See
`docs/ACCEPTANCE.md` and `TEST-REPORT.md` for the exact distinction between delivered evidence and
those remaining host-level measurements.

## 8. Existing tactical bridge caveat

The supplied `src/ai/director.js` publishes a module-global session rhythm as a legacy fallback.
This package preserves that bridge; it does not claim to make the entire old tactical runtime
instance-isolated. The new controller and adapter are per-world, and their own isolation is
tested. A host running multiple complete worlds in one JavaScript process must use the tactical
director's existing per-call authored/telemetry rhythm fields, or separately repair that legacy
bridge and test it. Do not confuse isolated controller tests with certification of every existing
module-global service.
