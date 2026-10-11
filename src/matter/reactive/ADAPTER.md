# Reactive matter — unapplied sim adapter

This file is the last-mile wiring into the authoritative 60 Hz runtime. It is **not applied**. Do not copy it into `src/systems/`, `src/core/`, `src/render/`, or the save schema while the field, flight, and performance lanes are in this checkout. The module under `src/matter/reactive/` already returns the impulses, retargets, cues, and save blob. A later integration commit applies the steps below and nothing else.

The witness in `harness.js` is an acceptance stand-in for Rapier contacts, massline winch tension, and `prepareExternalPhysicsImpulse`. It is not registered and must not be imported by `src/core/registry.js`.

## What already owns the neighboring effects

| Concern | Owner | This alphabet does |
|---|---|---|
| Contact solve and integration | `src/core/physicsAuthority.js` `queuePhysicsImpulse` (line 183) and Rapier | Returns impulses. Does not write `vel`. |
| `physics:impact` payload | `src/core/physics.js` `emitPhysicsImpact` lines 2086–2121. The payload object is pooled and reused. | Copy `aId`, `bId`, `normal`, `preSolveClosingSpeed`, `tick`, `pos` in the subscriber. Never keep the payload reference. |
| Asteroid / wreck cook-off | `src/systems/environmentMaterials.js` | Ignore bodies that have no `data.reactiveMatter` stamp. |
| Explosive commodity pods | `src/systems/volatileExposure.js` and loot shard slams | If `data.volatileExposure` is present, skip the volatile law. Do not call `spawnJettisonedCargoPod`. |
| Combat magnetic dipoles | `src/combat/emergentPrimitives.js` `dipoleImpulse` | Not used. Machine wells are a different coupling. |
| Massline winch | `src/core/constraints/masslineController.js` `stepMassline` | Do not run the witness hitch. Read `attachment.targetId` (tetherGameplay.js around lines 897 and 1001). |
| Player knockback budget | `prepareExternalPhysicsImpulse` in `physicsAuthority.js` lines 25–44, constants in `physicalResponse.js` line 5 | Pass `externalEffect: true` on player impulses. Do not set `externalProtected` on those impulses or the budget is skipped. |
| Credits and cargo | economy / cargo writers | `claimReactiveSalvage` returns credits 0 and no intent. Do not emit `economy:grantCredits`. |

## Clock slot

Insert one new id, nowhere else in the order:

`src/runtime/authoritativeSystemManifest.js` `PRODUCTION_UPDATE_ORDER`, the line that currently ends the physics group (line 96):

```text
'survivalArena', 'fields', 'gyreSnare', 'planetRuntime', 'morrow', 'vesper', 'bracket', 'ravel', 'solstice', 'rubric', 'ruckus', 'ruud', 'physics', 'reactiveMatter', 'latchNine', 'combat',
```

`reactiveMatter` sits immediately after `physics` so this tick's impact buffer is drained in the same fixed step, and before `combat`. Add the same id to `PRODUCTION_INIT_ORDER` and to `TABLE_CLOCK_IDS` (full 60 Hz; the reaction budget is per tick and must not slip to the calendar clock). Register the factory in `src/runtime/nodeSystemFactoryTable.js` next to the other system imports. `system.name` must be `reactiveMatter`.

Do not edit `src/systems/fields.js`, `src/core/fields/**`, `src/systems/flightV3.js`, or `src/core/physics.js`.

## System shape (proposed, unapplied)

```javascript
// src/systems/reactiveMatter.js — DO NOT CREATE until this adapter is applied on purpose.
import { loadReactiveWorld, saveReactiveWorld, stepReactiveMatter } from '../matter/reactive/index.js';
import { queuePhysicsImpulse } from '../core/physicsAuthority.js';

export const reactiveMatter = {
  name: 'reactiveMatter',
  init(ctx) {
    this.state = ctx.state;
    this.bus = ctx.bus;
    this.pending = [];
    this._off = ctx.bus?.on('physics:impact', (payload) => {
      if (!payload) return;
      this.pending.push({
        aId: payload.aId,
        bId: payload.bId,
        nx: payload.normal ? payload.normal.x : 0,
        nz: payload.normal ? payload.normal.z : 0,
        closingSpeed: Number.isFinite(payload.preSolveClosingSpeed) ? payload.preSolveClosingSpeed : 0,
        tick: payload.tick,
      });
      if (this.pending.length > 128) this.pending.shift();
    });
  },
  update(dt, state) {
    const world = state.reactiveMatterWorld;
    if (!world) return;
    const contacts = this.pending.splice(0, this.pending.length);
    const result = stepReactiveMatter(world, { dt, contacts });
    for (const impulse of result.impulses) {
      const entity = state.entities.get(impulse.bodyId);
      if (!entity || entity.data?.volatileExposure) continue;
      const evidence = impulse.externalEffect
        ? { externalEffect: true, tick: state.tick, dt, continuous: impulse.continuous === true, source: 'reactiveMatter' }
        : { source: 'reactiveMatter', externalProtected: true };
      queuePhysicsImpulse(entity, { x: impulse.jx, y: 0, z: impulse.jz }, evidence);
    }
    for (const retarget of result.retargets) {
      // Write attachment.targetId only on attachments whose id matches retarget.hitchId
      // and whose target still carries data.reactiveMatter. Emit 'reactiveMatter:retarget'.
      // Do not edit tetherGameplay.js from this system beyond that one field.
    }
    if (result.cues.length) this.bus?.emit('reactiveMatter:cues', result.cues);
  },
  destroy() { this._off?.(); },
};
```

`loadReactiveWorld` / `saveReactiveWorld` own a bounded blob (`schema`, at most 64 bodies, terminal ids, salvage claims, rng continuation). Park it on `state.reactiveMatterSave` only when the save owner adds an optional key. Until that edit exists, do not touch `src/save/**`. The blob is already round-tripped by `test/reactive-matter-safety.test.mjs`.

Stamp authored bodies with `entity.data.reactiveMatter = { modelId, family }` at the content spawn site that already creates those props. Do not stamp asteroids, and do not stamp pods that already have `volatileExposure`.

## Render (also unapplied)

Cues carry `tint`, `signature`, `worldRadius`, and `y: 0`. A future `src/render/reactiveMatter/` pass would instance the silhouettes in `assets/reactive-matter/silhouettes.json` under the gameplay camera. No file in `src/render/**` was added. Impact cues are sim records, not particles in `src/render/vfx.js`.

## Worker parity

`stepReactiveMatter` is pure with respect to process globals: seed, continuation rng, and the world object. The sim worker should import the same module. It must not construct a witness. Main and worker parity is the replay test in `test/reactive-matter-safety.test.mjs`.
