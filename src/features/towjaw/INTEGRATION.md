# TOWJAW — source candidate and integration contract

## Identity and disposition

- Repository: `coldshalamov/SpaceFace`, exact master base
  `45a97fdbda62611cc13001bd16790f8afa844753`.
- Result branch: `codex/pro-five-towjaw-20261022`.
- Context mode: remote-plus-upload. No unpushed local state was available.
- Verified upload SHA-256:
  `af7c8aa1f48ba55d1c855f9ce4ef540d05513fff9c6dbad113cf246ac0082724`.
  `HANDOFF_CONTEXT.json` identifies the same repository, branch and base.
- Disposition: implemented source candidate with focused executable owner tests.
  Codex owns shared integration, review, Adventure player-truth, acceptance and
  any merge to master. No PR or master update is part of this handoff.

All candidate code is inside `src/features/towjaw/`, plus the allowed encounter
module and `test/pro-five-towjaw.test.mjs`. Shared owners, generated indexes,
global status documents, bindings and balance are unchanged. The ZIP manifest
provides the exact included files and hashes; `candidate.patch` applies to the
stated base. The ZIP is a scoped source handoff, not a standalone game build.

## What the player encounters

TOWJAW is an optional Vesta derelict-field predator. The existing director offers
**Confront TOWJAW** or **Leave the wreck field**. Declining, allowing the 60-second
offer to expire, or failing safe admission spawns no fight. The route never
targets the starter sector. Admission requires a live undocked player, a named
Vesta anchor at least 180 world units away, and clearance from stations, gates
and non-hostile ships. Seeded candidate anchors are relative to the authored
field; no absolute arena coordinates are used.

After acceptance, the adapter creates 13 owned physical bodies: the Forge-authored
Hawser yard tug, three wreck mechanisms, seven salvage wrecks and two real cargo
pickups. It does not commandeer unrelated wrecks, civilians, mission bodies or
save-owned world entities. The field's nine pieces are the only feedstock. The
controller selects and reels three to six of them into an asymmetric cage using
bounded springs and equal/opposite hull reaction. Bodies keep their IDs, mass,
solver velocity and normal rendered models.

The loop is approach → scavenge → pursue into reach → commit → attack → exposed
→ recover. The public phases remain `approach`, `scavenge`, `commit`, `attack`,
`exposed`, `recover`, `retreat` and `done`; pursuit happens inside scavenging
once a usable cage exists. All attacks have frozen world geometry and a full
warning.

| Attack | Mechanism | Warning | Actual behavior and response |
| --- | --- | --- | --- |
| Grapple sweep | Jaw hinge | 1.65 s | A shared annular sweep reaches 112 units from the observed jaw. Its inner 15-unit hole and lateral exits remain safe. A hit applies one damage receipt and bounded pull impulse; there is no persistent grab. |
| Scrap shotgun | Feed winch | 1.85 s | Up to three original cage pieces launch at 100 units/s along separately warned 250-unit corridors. Physical lateral ordering prevents muzzle self-collisions. Its active warning covers their 2.5-second flight. |
| Overcommitted ram | Drive clutch | 2.25 s | The real heavy hull accelerates down a fixed 230-unit lane. Damage requires actual swept hull contact inside that lane. Stopping-distance control brakes before its end, with a maximum 4.5-second active commitment. The lane stays visible while a spent/cancelled ram is braking. |

Shots never gain tracking after a warning. Pulling a feeding shotgun piece more
than 12 units off its warned launch origin cancels the unfired cast. Once scrap
is already flying, disabling the winch cannot erase those physical bodies; their
original danger display remains until the existing flight expires.

Normal grapple and ram completion release one relevant plate and request a
bounded lateral impulse with equal/opposite recoil. The plate remains a real
directional obstacle until observed motion opens the gap. Player-held or pinned
pieces receive no vent kick. Recovery therefore exposes a physical opening.

### Strategies with real effects

| Player action | State/mechanical consequence |
| --- | --- |
| Remove or collect feedstock | Fewer pieces are eligible. Repeated starvation produces a bounded retreat without requiring a weapon. |
| Pull or tow armor away | Displacement breaks TOWJAW's spring after a short strain window. The original piece stays alive and the player's Massline remains intact. Removing geometric cover cancels the corresponding interruptible attack. |
| Pin a jaw | Both the real `status_pinned` owner and a live attachment to the player's locked Mass Seed are observed. Existing number-3 Pin deployment plus an existing Twin Bridle line interrupts the jaw. An unconnected nearby anchor does nothing. |
| Sling loose/stolen scrap into the exposed winch | Swept body crossing and relative speed produce one attributed strike through the combat kernel. That special impact receipt cannot replay after load. |
| Shoot mechanisms or flank the cage | Ordinary projectile sweeps admit the owned wrecks/pickups. Damage redirects only when a live physical piece intersects its approach. Gaps and exposed mechanisms remain damageable. |

Retreat, defeat, disengagement, sector departure and director resolution release
ownership and retire combat hardware. Surviving original scrap stays persistent
and collectible. The authored pools contain at most 20 ordinary scrap units
before destruction/collection: seven two-unit wreck pools and two three-unit
cargo pickups. Existing mining/cargo owners extract and collect them.

The feature itself creates no second reward burst and writes no credits,
reputation, heat or bounty. Normal ship-kill aftermath remains owned by the
existing game: the verified full-owner player-kill case creates one finite
durable hulk and one small companion wreck, in addition to surviving original
scrap. The observed pools were three scrap plus one electronics on the hulk and
one scrap on its companion, with no credit grant or loot-drop command. These
normal residue bodies are not new TOWJAW feedstock. The existing combat owner
can also produce one capacitor cell for an eligible collision/whip stunt kill.
Initial authored bodies are 13; normal aftermath plus that bounded existing
stunt payoff can briefly raise related bodies to 16 before hardware cleanup.
The persisted issue/outcome prevents a boss reroll or repeated feature reward.
No unrelated owner was changed to suppress its ordinary residue or stunt payoff.

## Public modules and APIs

Import gameplay from `src/features/towjaw/index.js`. The shared damage owner
should import the tiny bridge directly to avoid loading runtime modules there.

| Module | Responsibility |
| --- | --- |
| `catalog.js` | Local bounded tuning, mechanisms, armor slots and attacks. |
| `geometry.js` | Seeded field layout, transformed mounts, directional interception and shared warning/hit geometry; reuses capital-boss shape predicates. |
| `controller.js` | Pure seeded state machine, commands/events, scalar snapshots and reconciliation. |
| `runtime.js` | Production entity, combat, physics, attachment, lifecycle and save adapter; fixed-clock factory. |
| `damageBridge.js` | One state-local incoming-damage route; identity for unrelated hits; idempotent unregister. |
| `encounter.js` | Real selfRegistered director `fire/choose/tick` contract. |
| `presentation.js` | Actual-body projection, captions, overlay, existing audio/FX recipes, accessibility and teardown. |
| Feature-local `*.test.mjs` files | Focused contracts imported by the one top-level focused test entry. |

### Runtime

```js
const runtime = createTowjawRuntime({ state, bus, helpers, registry });
const admitted = runtime.start({ encounterId, sectorId, origin, heading, seed });
// In production the fixed system owns this call, never the renderer/director:
runtime.step(dt);
const view = runtime.getView();
const saved = runtime.snapshot();
runtime.dispose(reason, { preserveSalvage: true });
```

Construction is inert. `start()` returns `{ok, ...}` and refuses unsafe,
duplicate, wrong-sector, unavailable-player or disposed-runtime admission.
Dispose unused rejected adapters; the director already does. `restore(saved)`
never spawns. `routeDamage(input)` is a focused adapter entry through the same
bridge and production kernel as the required central hook. Ordinary weapons
still need that hook.

`getActiveTowjawRuntime(state)` returns the adapter or null.
`createTowjawSystem()` returns a fresh system named `towjaw` with `init`,
`update`, `serialize`, `deserialize`, `newGame` and `destroy`.
`isTowjawClockInstalled(state)` prevents admission without the fixed clock.

### Controller

`createTowjawController({seed, encounterId, sectorId, origin, heading, bossId,
mechanismIds, eligibleIds})` exposes `step(dt, world)`, `getView()`, `snapshot()`,
`restore(saved, world)` and `stop(reason)`.

`world` supplies absolute `simTime`, current `sectorId`, observed `boss`/`player`,
`mechanisms` keyed by jaw/winch/drive, bounded `debris`, and one-step physical hit
receipts. Observations contain plain `pos`, `vel`, `rot`, `angVel`, `mass`,
`inertiaY`, `radius`, `hull`, `hullMax`, `alive`, `pinned` and `playerHeld` values.
Eligibility comes only from verified owned bindings. Observation is never mutated.

`force` and canonical yaw `torque` are force units, converted to impulses with
bounded `dt` by the adapter. `impulse` is already momentum.
`launchScrap.velocity` becomes a delta impulse on the same body. `damage` routes
through the combat kernel. `release` removes only TOWJAW's spring and never
cuts a player attachment.

Use actual `resolvePhysicsBodySpec(entity).inertiaY`. Radius/mass estimation
caused native oscillation because the authored Hawser's flight inertia differs
substantially. Runtime now observes the true owner value; both native seed cases
assemble and retain armor.

## Exact minimal shared hooks for Codex

Locations are anchored to the verified base; line numbers are navigation hints
for the local integrator, not permission to overwrite newer local work.

### 1. Registry and fixed simulation clock

In `src/core/registry.js`, import from `../features/towjaw/index.js` and add
`['towjaw', createTowjawSystem()]` inside `buildRegistrySystemLookup`, beside
authored fight owners (capital boss entry around line 649). Construct a fresh
system for each registry; its lifecycle state is closure-local. Add the matching
fresh entry inside `getNodeSystemFactoryTable` in
`src/runtime/nodeSystemFactoryTable.js` for the same Node production owner.

In `src/runtime/authoritativeSystemManifest.js`:

- Add `towjaw` to `PRODUCTION_INIT_ORDER` after combat helpers initialize.
- Add it to `PRODUCTION_UPDATE_ORDER` after actions/fields and before physics;
  between `ruud` and `physics` around line 108 is suitable.
- Add it to `TABLE_CLOCK_IDS`. Do not add it to `CALENDAR_CLOCK_IDS`.

Default capability resolution already gives gameplay IDs `nodeSafe: true` and
`phase: 'sim'`; no presentation-only override is needed. SelfRegistered director
scripts tick at **1 Hz**, so they cannot own springs or attack motion. Same-tick/
simTime duplicate calls produce no extra effects, and menus do not advance it.

### 2. Encounter discovery

`src/data/encounters/8101-pro-five-towjaw.js` conforms to `defineEncounter`,
exports `encounterOrder`, `trigger`, `runtime` and its default shape, and uses
only real director ports: `fire(d, live, state)`,
`choose(d, live, state, choiceId)` and `tick(d, live, state, now)`.

Regenerate the shared index locally:

```sh
node scripts/build-encounter-index.mjs
```

That writes `src/data/encounters/index.generated.js`; it was not mutated here.
No shop entry, new power binding or forced startup spawn is needed. The optional
Vesta derelict-field offer is the public entry.

### 3. Incoming damage

At the top of `src/combat/damage.js`:

```js
import { interceptTowjawDamage } from '../features/towjaw/damageBridge.js';
```

At the beginning of the nested `routeDamage(input)` (around line 114), before
attacker/target/packet resolution:

```js
input = interceptTowjawDamage(state, input);
```

This is the only shared combat hook. First ray/body intersection selects a
plate or exposed mechanism; the existing router retains all HP, armor, status,
friendly-fire and kill authority. The adapter authorizes its own wreck/pickup
targets and returns the original input for unrelated bodies. Do not add a
parallel damage listener, HP refund or second writer.

Projectile admission is already authored on **new owned specs** using
`Masks.PROJECTILE`; the production sweep in `src/core/physics.js` admits either
direction of `canCollide`. No shared/default mask change is needed. Native
solidity remains with SG-02/Rapier.

### 4. Save capture and delayed rebind

In `src/save/saveSystem.js`, add the slice at all three existing paths:

```js
// _saveCapturePlan, beside capitalBoss around line 917:
['towjaw', () => this._callSerialize('towjaw')],

// _serializeDataSteps, beside data.capitalBoss around line 1071:
data.towjaw = this._callSerialize('towjaw');
yield 'serialize:towjaw';

// After world/entities/combat/missions restoration, beside
// yield* this._restoreCapitalBossFightsChunked(data.capitalBoss), near line 6990:
this._callDeserialize('towjaw', data.towjaw);
```

The native entity serializer already retains flags and all of `data`, including
`data.towjaw`; no new entity serializer field is needed. `deserialize` parks a
plain snapshot and retires the old runtime without removing freshly restored
bodies. Rebinding waits for the first fixed flight tick after native restore.

Bindings validate encounter ID, stable slot key, role, entity type, sector and
occupant generation. Normal saved numeric-ID remapping uses unique verified durable keys.
Missing/dead pieces become `id: null` tombstones and cannot be adopted if stale
bodies reappear. Duplicate slots and malformed references fail closed. Missing
required mechanisms without prior disabled receipts end safely; disappearance
does not grant defeat.

Reload cancels old attack authority, then recovery precedes a fresh full warning.
Already launched scrap gets no fresh scripted hit allowance. A moving ram keeps
only a sanitized braking corridor and bounded braking force, never a replayed
attack. Existing story issue/outcome flags prevent repeat spawns. Multiple
restore/dispose passes, remapped IDs and stale tombstones are tested.

A matching production `entity:killed` receipt also persists terminal defeat if
save capture falls after combat but before the next TOWJAW fixed update. Terminal
restore retires only verified combat hardware, preserves original salvage and
cannot adopt the normal aftermath hulk as a live boss or replay its kill/reward.

### 5. Existing HUD/render host

No new body renderer or model is required. Existing source routing resolves:

- `ship_hawser` → `wholeships/yard_tug.glb`, scaled by the normal ship kit.
- Wreck plates/mechanisms → authored aftermath engine/cockpit/cargo/turret/spar/
  tank pieces, fitted to the actual entity radius.
- Scrap cargo → existing Forge-baked salvage pickup body.

In `src/ui/uiRoot.js`, beside capital boss overlay drawing in `frame` near line
1917, reconcile runtime identity and draw from that existing pass:

```js
const runtime = getActiveTowjawRuntime(st);
if (runtime !== this._towjawRuntime) {
  this.towjawOverlay?.destroy();
  this._towjawRuntime = runtime;
  this.towjawOverlay = runtime ? mountTowjawPresentation({
    root: document.getElementById('ui-root'),
    state: st, bus: this.bus, helpers: this.helpers, runtime,
  }) : null;
  if (this.towjawOverlay) runtime.setPresentation(this.towjawOverlay);
}
this.towjawOverlay?.draw();
```

Import these functions from the feature index. Near existing teardown around
line 1970, destroy the mount and clear both fields. This handles admission,
outcome, new game and save-rebind without another clock or invented event.
Runtime and host can both destroy the adapter safely.

Verified `helpers.worldToScreen(v, out)` accepts global XZ and returns reused
`{x, y, onScreen, behind}` in window CSS pixels. The mount reads the current
helper/root bounds, rejects mirrored behind-camera points and avoids false
filled contours. It creates only overlay/caption DOM, never body substitutes.
The default runtime already emits existing audio/structural FX cues; the mount
replaces that adapter cleanly.

Reduced-motion/flash settings suppress optional animation/bursts while retaining
the same danger geometry, countdowns, text, dashed/solid phase differences,
mechanism glyphs and audio. The mount provides screen-reader captions.

## Bounds, single owners and lifecycle

- One active runtime per state; 13 initial authored bodies; maximum six armor
  slots. Normal boss-kill aftermath can add two existing-owner residue bodies;
  an eligible collision/whip kill can add one existing-owner capacitor cell.
- Maximum 24 observed debris rows, 32 tracked IDs, 48 commands and 24 events per
  step. `dt` caps at 0.1 seconds; encounter duration caps at 240 simulation seconds.
  Attachment observation visits at most 128 existing registry rows.
- Force caps at 30,000, impulse at 20,000, yaw rate at 0.6 rad/s. Springs,
  mounts, recoil and braking all use authority commands. No live velocity,
  position or mass write fakes a latch/launch/stop.
- Two audio cues and three structural effects per update; at most 128 transient
  dedupe entries. No per-body meshes, new RAF, timers, wall clock, random source,
  dependency or engine replacement.
- Director aborts actually emit `encounter:resolved` with an aborted outcome.
  Matching-ID disposal is immediate. `encounterMayScheduleDespawn` protects
  persistent/mission-pinned survivors, avoiding a hidden 4/45-second salvage TTL.
- Disposal unregisters damage/lifecycle/presentation listeners and retires only
  matching occupants. Spawn rollback uses the core remover; its normal lifetime
  sweep performs final removal. Foreign/recycled bodies are never touched.

## Verification and honest boundaries

In a complete checkout on a recent Node:

```sh
node --test --test-isolation=none test/pro-five-towjaw.test.mjs
```

The one entry imports feature-local tests. Exact named assertions, counts,
Node version and commands are in `evidence/focused-tests.txt` in the ZIP. This
VM's isolated runner sometimes returned only a file wrapper; no-isolation was
used to execute and display the real assertions.

The focused suite covers seeds **4242 and 7331**, native cage assembly and
damaging shotgun/ram attacks, physical ram dodge, stopping inside the warned
lane, directional armor, removal and cancellation, status Pin, real deployed
number-3 Pin plus native Twin Bridle, ordinary projectile/field/Pull/Rig
eligibility, mechanism shooting, swept scrap strikes, real cargo/mining,
vent/recoil, restore braking, malformed save bounds, ID remapping, tombstones,
foreign occupants, rollback, fixed-clock rebind, director admission,
accessibility, cue quotas and listener/DOM cleanup. Assertions prove effects
and transitions, not only catalog shape. No broad unrelated audit was run.
The complete combat/aftermath/mining/cargo fixture also proves finite ordinary
kill residue and no repeat body, marker, credit or loot-drop production across
three restores of a save captured between combat and the next feature tick.

The uploaded context omits media and large generated dependencies. Three
**unchanged exact-base** files were fetched into an external cache and supplied
by a temporary Node import loader to execute actual owners. They are not stubs,
candidate edits or new dependencies:

| Omitted exact-base file | SHA-256 |
| --- | --- |
| `src/data/modelTruthCensus.generated.js` | `f704a3afb9de11243c007a3c4d1f1e51bb7747bcfa982c2d40116c6b0fbfdf13` |
| `src/localization/catalogs/en-US.generated.js` | `304140bde901d9d78f8d7ffdad6bcfe50d884e51c49597481f15aa26a8986f30` |
| `vendor/rapier3d-compat/rapier.mjs` | `bce2c762b440101ebf8cbff038a71fe1884488becd0a53b9a7c0a7e3daf13a2b` |

VM invocation adds `--import ../towjaw-context-cache/register-exact-context.mjs`
before the test flags. Cache and loader are absent from the candidate. Omitted
renderer source was inspected read-only at exact blob
`28161b98b93613b4696528a62074ed9eafab3092` to confirm projection semantics.

**Remaining local qualification:** apply these five shared hooks on the actual
current tree; run the focused suite without the loader; exercise cold Continue
through the full save envelope; qualify the optional Adventure route with real
assets, input and rendering. Check the industrial silhouette, gaps and labels
at gameplay zoom, audio mix, dodge windows, salvage/aftermath ownership and
body/cue budgets. Browser and Electron retain the existing shared route.
Headless assertions and native solver proofs do not claim GPU acceptance,
complete save-envelope integration or Adventure player-truth completion.
