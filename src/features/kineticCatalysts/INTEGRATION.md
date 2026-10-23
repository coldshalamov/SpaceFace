# KINETIC CATALYSTS — source candidate for Codex integration

## Disposition and exact source context

This is an implemented source candidate, with a pure effect kernel, production runtime,
fitting validation, an optional self-registered encounter, and a renderer adapter. Codex
owns integration into the current local tree and Adventure player-truth acceptance.

- Repository: `coldshalamov/SpaceFace`.
- Exact base: `45a97fdbda62611cc13001bd16790f8afa844753`.
- Requested result branch: `codex/pro-five-kineticCatalysts-20261022`.
- Input ZIP SHA-256: `af7c8aa1f48ba55d1c855f9ce4ef540d05513fff9c6dbad113cf246ac0082724`.
- `HANDOFF_CONTEXT.json` repository, branch, base and all 7,987 included file hashes
  were verified. Unpushed local state was unavailable. Original source files remain
  unchanged. Only the commission's three permitted path scopes contain additions.

The candidate deliberately leaves shared registrations, module catalog, saves, renderer
and worker mirrors for Codex. The entry point is `src/features/kineticCatalysts/index.js`.
Import individual feature modules from shared owners to keep dependency edges narrow.
No new dependency, key binding, power verb, body model or replacement physics owner is required.

## What the three fittings do

All three are mutually exclusive small utility relics. They have real module identities,
ordinary hull mass (4/5/6), no static statistic bonus, and no passive duplicate energy tax.
Their actual work debits the existing ship capacitor when admitted.

| Existing power | Orbital Magazine | Aftershock Core | Load Bridge |
| --- | --- | --- | --- |
| Pull | Capture up to three eligible real debris bodies in the deployed well footprint. | Once per pending echo, pay 2 capacitor for another 0.35 s of gathering time; strength falls to 92%. | After anchoring one body, select another eligible body and create the link. |
| Shove | Relinquish held bodies along their measured tangential/outward relative momentum, with loss. | Pay 12 capacitor for one weaker delayed echo at the immutable cast point. | The actual accepted field impulse can share a bounded part with the other endpoint. |
| Pin | A body actually hitched to a seed leaves the magazine. | A seed lock inside the warning ring grounds it to 75% radius and 85% strength. | A genuine hitch supplies the primary anchor; loss of its Pin breaks the link. |
| Bomb | Release one loaded body as a moving screen when ordnance is thrown. | A nearby thrown dynamic sticky charge can take 15% of the stored pulse, costing 3 capacitor and weakening the echo. | A thrown dynamic sticky charge can replace the loose endpoint; the old endpoint is released. |
| Rig | Close intake and brake orbital motion; holding drain halves. | Starting Rig vents a pending echo early at 35% strength, with warning and no refund. | Brace the bridge: shorter rest length, higher sharing ceiling, greater running drain. |

The normal Bomb key defaults to a sticky charge when one is carried. Drift bombs use
their existing scripted motion (`physicsBody: false`); the adapter never turns them into
native bodies or changes their owner. Magazine screen release still observes either
Bomb throw. Aftershock payload transfer and Bridge endpoint replacement require the
dynamic sticky-charge branch. This is an explicit physical eligibility limit.

### Orbital Magazine

Each captured body's **base** mass must be at most 48, total base load at most 90, radius
at most 24, and acquisition distance at most 220 world units. Each costs 3 capacitor to
acquire and 1.6 capacitor/second to hold. Ordinary Pull applies `status_pinned` and changes
effective solver mass; that status alone does not make loose debris a real seed hitch
or disqualify a base-mass-eligible load. Effective solver mass still drives every impulse.

The controller solves all held loads and carrier recoil together. For desired relative
accelerations `a_i`, masses `m_i`, carrier mass `m_p` and step `dt`:

```text
S   = sum(m_i * a_i * dt) / (1 + sum(m_i) / m_p)
J_i = m_i * a_i * dt - (m_i / m_p) * S
J_p = -sum(J_i)
```

A common scale limits impulses and positive kinetic work. This avoids a heavy satellite's
recoil moving the carrier through another satellite's independently solved orbit. A
proved, already-accepted own-well acceleration can be compensated in relative control;
foreign or mixed fields remain disturbances. Momentum from the original field still
moves the carrier/load system's center of mass.

Release targets 88% of measured tangential and outward relative velocity; it does not
invent a launch speed. Inward motion can be dissipated, with matched carrier reaction.
Rig brakes toward zero spin. Empty capacitor, 24 s lifetime, destroyed/recycled bodies,
lost range, genuine hitching, fitting changes and lifecycle boundaries relinquish loads.

### Aftershock Core

The echo waits 1.15 s, has at most 125 world-unit radius, affects at most 16 bodies, and
has a 10 s cooldown. Its impulse starts at 168 per body before distance falloff, with an
18 velocity-change bound and 1,500 total impulse budget. Positive work is bounded by
the paid capacitor. Pull, Pin, Bomb and Rig all reduce or reshape the same stored pulse;
none creates a second echo. Payment is up front and is never refunded by swapping,
cancellation or leaving the scene. Cooldown survives transient cleanup.

The owner is exposed to its own fixed echo. Existing external-hit protection applies to
that exposure. It does not attenuate voluntary equal-and-opposite magazine/payload recoil,
which would otherwise create net momentum by damping only half of a physical pair.

### Load Bridge

A link costs 6 capacitor, lasts at most 18 s, and reaches at most 320 world units. It
drains 0.6 capacitor/second, or 1.4 while braced. Rig shortens rest length to 82% and
raises the transfer ceiling from 30% to 45%. Slack carries no tension; stretched links
apply equal-and-opposite bounded tension. Lost Pin, excessive separation, missing bodies
or exhausted capacitor break the relationship.

For incoming impulse `J`, the transfer is `T = alpha * J`. The source gives up `T` and the
partner receives `T`. `alpha` is limited by the sharing ceiling, 140 impulse, 14 velocity
change on either endpoint, both masses, and the pair's current velocity. The admission
calculation requires the redistribution's kinetic-work change to be nonpositive:

```text
T dot (v_partner - v_source_after_input)
  + 0.5 * |T|^2 * (1/m_source + 1/m_partner) <= 0
```

A faster partner cannot be gratuitously boosted. Each admitted transfer costs
`0.8 + |T| / 400` capacitor, with at most four transfers per tick. Pair/tick deduplication,
generation checks and origin/depth/chain guards stop reflection and recursive sharing.

The normal anchor recipe is **Pin, tow one body into its lock ring, select another body,
Pull**. A seed is not itself a pinned load. At seed lock, an already Well-pinned selected
body can also be nominated as a short-lived soft anchor; its link fails when that existing
status expires. Pin does not apply that combat status.

## Runtime and ownership contract

`createKineticCatalystsRuntime()` supplies `init`, `update`, `serialize`, `deserialize`,
`newGame`, `dispose`, registry-compatible `destroy`, `getSnapshot`, `getEvidence` and the
optional `routeImpulse` seam. Reinitialization disposes old listeners for the same state.
`kineticCatalystsFor(state)` finds the initialized runtime in the current process.

The production adapter consumes these existing successful owner receipts:

| Existing receipt/API | Meaning used by this feature |
| --- | --- |
| `fields:deployed` | `well` → Pull, `repulsor` → Shove. Player ownership resolves through the real emitter's `ownerId` / `data.ownerId`; planted and NPC fields are excluded. |
| `fields:hitchLatched` | Real body/field/source identity for Pin; membership is re-read from the fields owner. |
| `massSeed:locked` | Existing locked seed location; source phase is `data.massSeedState.phase`. |
| `charge:thrown`, `bombs:dropped` | Existing Bomb throw and real ordnance identity. |
| `fields:coneToggled`, `planet:collector` | Confirmed Rig changes. Explicit owner flags are also read when fitting/restoring with Rig already active. |
| `fields.readAcceptedFieldAcceleration(entity)` | Same-tick acceleration already accepted and queued by the field owner. Bridge submits only redistribution, never the original force again. |
| `fields.kernelList()` | Read-only source/geometry proof for own-Pull feed-forward. Records are neither stored nor mutated. |
| `physics:impact` | Post-solve physical impulse and normal, not material-scaled `dp`; normal points from A to B. Internal bridge-pair collisions are ignored. |

Only `physicsAuthority.queuePhysicsImpulse` authors new motion. The adapter writes no
positions, velocities, native bodies or joints. The ordinary capacitor is debited
synchronously. Ships owns grants and fitting transfers; existing damage/provenance,
credits, cargo, heat, law and reputation owners remain in charge of consequences.

The adapter tracks pending admitted impulses as velocity deltas for subsequent energy
checks. Pre-solve commands retire when consumed; post-impact commands survive into the
next solve. Public snapshots use measured entity velocity, not that prediction ledger.
Evidence returned to consumers is deeply copied.

### Optional direct point-impulse seam

Field forces and real collision receipts work without changing their owners. To extend
sharing to an existing direct impulse producer, replace its single queue call with:

```js
const catalyst = registry.get('kineticCatalysts');
if (catalyst) catalyst.routeImpulse(entity, impulse, evidence);
else queuePhysicsImpulse(entity, impulse, evidence);
```

Call this **instead of** the original queue call. Do not call both. Preserve the source's
existing delivery/protection admission and provide a unique `chainId` when available.
For a producer running after physics, including combat in the current production order:

```js
catalyst.routeImpulse(entity, impulse, evidence, { phase: 'afterPhysics' });
```

This explicit phase matters on quiet ticks: physics can solve without emitting an impact,
and optional telemetry is not a reliable simulation-clock receipt. The default is the
pre-physics phase. Generated catalyst provenance/depth is excluded from re-sharing.
Stale entity objects cannot redirect into a new occupant with the same pooled ID.

## Required shared hooks — Codex-owned changes

### 1. Module definitions and both fitting validation paths

In `src/data/modules.js`, import `CATALYST_MODULES` from
`../features/kineticCatalysts/catalog.js`, then spread it once into `SHIPPED_MODULES`,
alongside `BLACK_FLAG_MODULES`, before `mergeUserModules` / `attachAirSentences`.
The definitions are salvage-only and non-purchasable. No shop inventory or price writer
is needed for this trial. Canonical IDs are:

- `unique_kinetic_orbital_magazine`
- `unique_kinetic_aftershock_core`
- `unique_kinetic_load_bridge`

In `src/systems/ships.js`, import `findCatalystFitConflict` from feature `fitting.js`.
In `moduleFitBlocker`, after the existing Massline conflict check and before budget work:

```js
const conflict = findCatalystFitConflict(owned.fittings, slotIndex, def);
if (conflict) return {
  reason: 'catalyst_conflict',
  text: 'Unfit ' + conflict.name + ' before fitting another catalyst',
};
```

Also apply the same helper in the slot-validation loop of `dryRunLoadoutPresetApply`,
using `afterFittings`, and push this blocker if it returns a conflict:

```js
slotBlockers.push({
  reason: 'catalyst_conflict', defId, name: def.name, slotIndex,
  conflictDefId: conflict.id,
  text: 'Unfit ' + conflict.name + ' before fitting another catalyst',
});
```

Preset application commits arrays after its dry run, so the direct-fit check alone is
insufficient. Same-slot replacement is legal. Any second catalyst, including a duplicate
of the same relic, is refused. The runtime independently fails closed on ambiguous or
incompatible occupancy; inventory and parked hulls never activate a fitting.

The trial calls real `ships.grantModule({defId, reason, provenance})`, locates its minted
instance, then calls `ships.fitModule({shipIndex, slotIndex, instanceId})`. It probes
`moduleFitBlocker` for an empty compatible slot, never displaces existing equipment, and
never invokes the defId-only fit path that would mint a new identity.

### 2. Browser/worker registration and fixed-step order

Add a fresh `createKineticCatalystsRuntime()` to both:

- `src/core/registry.js` → `buildRegistrySystemLookup()`.
- `src/runtime/nodeSystemFactoryTable.js` → production lookup table.

In `src/runtime/authoritativeSystemManifest.js`, add `kineticCatalysts` to
`PRODUCTION_INIT_ORDER` after its existing ships/fields dependencies, to
`PRODUCTION_UPDATE_ORDER` **immediately before `physics`**, and to `TABLE_CLOCK_IDS`.
It must run after fields/planet and existing force producers, on the fixed simulation
clock. Default Node-safe gameplay capability is appropriate. Preserve legacy47A lists.
No new animation loop, calendar owner, or renderer-dependent simulation registration.

### 3. Save capture and deferred restoration

`src/save/saveSystem.js` has two capture paths. Preserve their identical insertion order.
Immediately after the existing fields entry, add:

```js
// _saveCapturePlan()
['kineticCatalysts', () => this._callSerialize('kineticCatalysts')],

// *_serializeDataSteps()
data.kineticCatalysts = this._callSerialize('kineticCatalysts');
yield 'serialize:kineticCatalysts';
```

In `_restoreChunks()`, after `yield 'fields-restored'` and before `save:loaded`:

```js
this._callDeserialize('kineticCatalysts', data.kineticCatalysts);
yield 'kinetic-catalysts-restored';
```

No central root-key allowlist extension is needed at this base: normalization preserves
additional sections. The feature stages its kernel during deserialize and resolves only
existing IDs/generations on `save:loaded`, after entities and hitches exist. Missing old-save
sections produce an empty feature state. Saves contain bounded plain data, no functions,
native objects or cloned bodies. Trial-issued identity and completion receipts persist;
physical proof history is transient. Restoring never spawns replacement test masses.

Sector exit, docking, death, save restoration, new game, fitting/ship changes and teardown
clear live relationships. Cooldown remains paid through ordinary cleanup. New game creates
a fresh kernel and receipt namespace. `destroy()` removes listeners and WeakMap ownership.

### 4. Encounter publication

The allowed encounter file exports the verified `selfRegistered` `fire/choose/tick`
contract and uses only existing director methods. After accepting it, run the existing
`node scripts/build-encounter-index.mjs` locally. The resulting generated catalog/registry
change belongs to Codex, not this candidate.

The entry is optional in **Vesta Forge → Dead Freighter Drift** (`sector_vesta_forge`,
`zone_vesta_derelict`), at local bench coordinates `(920, -1260)`. It neither relocates the
player nor ambushes the starter. An explicit choice issues exactly one retained relic;
an unavailable slot leaves that same identity in ordinary module inventory. A choice
receipt locks the selection even after loss, sale, abandonment or parking on another hull.

Four ordinary authored wrecks of mass 6/10/18/60 are spawned only after successful fitting.
They have no loot, authored salvage, salvage pool or deep-scan cache. Calibration requires
positive admitted physical evidence touching their exact generations, rather than a button
press. There is no second reward on completion and no re-spawn during rehydration.

### 5. Bounded worker presentation mirror

The presenting thread intentionally does not initialize Node-safe gameplay systems in
the worker lane. Add `kineticCatalystsPublic` to `DOMAIN_MIRROR_KEYS` and both `ownerSnapshot`
classifiers in `scripts/lib/simReadModel.mjs`. In `scripts/lib/simWorkerHost.mjs`, inside
`diffDomains()`, immediately before `host.domainDiffer.diff()`:

```js
state.kineticCatalystsPublic =
  host.registry?.get('kineticCatalysts')?.getSnapshot?.() ?? null;
```

Mirror only this small read view, not the save kernel, receipts or proof history. Both
owner-snapshot classifications matter so moving physical silhouettes do not fall into a
slower size-tier cadence. No new RPC is necessary.

### 6. Existing VFX surface renderer

In `src/render/vfx.js`, import the existing `SweptSurfaceBatch` from
`./forceLanguage/sweptSurfaceBatch.js`, the feature presentation adapter/limits, and
`kineticCatalystsFor` from feature `runtime.js`. Add this sibling to `_updateFieldGeometry`:

```js
_updateKineticCatalysts() {
  const snapshot = kineticCatalystsFor(this.state)?.getSnapshot()
    ?? this.state.kineticCatalystsPublic ?? null;
  if (!this._kineticCatalystsFx && snapshot?.catalystId && this._scene) {
    this._kineticCatalystsFx = createCatalystPresentationAdapter({
      surfaceBatch: new SweptSurfaceBatch(this._scene, {
        capacity: CATALYST_PRESENTATION_LIMITS.maxSurfaces,
        name: 'SF_KineticCatalysts', fieldVolume: true,
      }),
      toLocal: this._combatBeamLocalizer
        || ((x, z, out) => this._toLocalXZ(x, z, out)),
    });
  }
  const video = this.state.settings?.video;
  const a11y = this.state.settings?.accessibility;
  return this._kineticCatalystsFx?.update(snapshot, {
    simTime: this.state.simTime,
    reducedMotion: !!(video?.motionReduce || a11y?.reducedMotion || a11y?.motionReduce),
    reducedFlash: !!(video?.flashReduce || a11y?.flashReduce || a11y?.reducedFlash),
  });
},
```

Call it beside `_updateFieldGeometry` in the ordinary render pass, outside its field-only
relevance gate. Continue updating an initialized adapter with null snapshots to clear it.
In the existing VFX destroy path, use `invokeVfxDisposer(this._kineticCatalystsFx,
'kinetic catalyst surfaces')` and null the reference. The adapter owns batch disposal.
Clear it on existing save/sector/new-game visual boundaries, or defer that clear to the
next writable render pass. Its returned `status` is plain optional text for the existing
rail/help surface, not a new HUD system or binding.

The presentation uses at most 56 active and 24 retiring surfaces, with 0.38 s decorative
release. Force boundaries disappear immediately. Numbered capacity teeth, actual relative
velocity arrows, a fixed countdown ring and distinct anchored/free endpoint shapes remain
readable without color. Reduced motion/flash preserves these cues. Coordinates remain
double precision until the existing floating-origin projection. Body visuals continue to
use the game's authored wreck models; no replacement art is bundled.

## Bounds, focused evidence, and local acceptance

The kernel projects at most 96 bodies and emits at most 32 impulses per operation. The
adapter limits neighborhood candidates to 512 inspected entries, successful-power/impact
processing to 32 events per tick, history/evidence to 64 records, and fixed step to 0.05 s.
Every feature impulse is finite and bounded by 600 and a 60 velocity-change cap; Bridge's
stricter limits apply additionally. Positive injected kinetic work is at most 1,800 units
per paid capacitor. An unfitted ship performs no neighborhood scan in its update path.

Run the focused suite from the repository root:

```sh
node --test --test-isolation=none --test-reporter=spec test/pro-five-kineticCatalysts.test.mjs
```

The explicit isolation flag is necessary in the supplied VM's Node runner to execute and
report the individual assertions; the plain command only reported the file wrapper there.
The frozen candidate's transcript is `evidence/focused-tests.txt` in the transport ZIP.
At checkpoint: **59 tests passed, none failed/skipped**, with deterministic seeds **4242**
and **19373**. Tests cover all five interactions, actual physical commands, mass/work bounds,
three-load stability under the real field sampler, same-tick and post-solve bookkeeping,
body loss/recycling, fitting exclusivity/identity, active-Rig fitting, lifecycle, save/restore,
field-trial completion/no repeat rewards, floating origin, access settings and bus faults.

The exported adapters run against the existing event bus, game state, physics command
authority, field mathematics and provenance reader. Narrow ships/director fixtures are
explicitly identified in the tests. The supplied source subset omits
`src/data/modelTruthCensus.generated.js` (2.5 MB), preventing complete fields/ships owner
imports and a full production boot in this context. No substitute data was fabricated.

No Rapier/browser GPU run or Adventure player-truth acceptance is claimed. After the
shared hooks, Codex should qualify the real fitting/preset/save flows, both browser and
worker presentation routes, a returning-ship echo, three-body handling under player thrust,
and Bridge behavior with native contacts. Use the existing authored wrecks and normal
five power bindings. Keep Massline's ordinary near-unbreakable behavior unchanged.

The transport manifest records exact changed paths and SHA-256 hashes. Its patch contains
only the permitted additions against the verified base. The source candidate is suitable
for review/application; local integration, current-tree reconciliation and acceptance
remain with Codex.
