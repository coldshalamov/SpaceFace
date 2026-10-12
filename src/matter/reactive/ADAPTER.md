# Reactive matter adapter

The system module `src/systems/reactiveMatter.js` exists and is callable (`reactiveMatter.init` / `reactiveMatter.update`). It queues impulses, spawns debris entities, revises collider mass and radius, and writes `attachment.targetId`. Registration into the manifest and the two occupied owners below is not applied in this checkout.

## Occupied files (do not edit in this campaign)

- `src/runtime/authoritativeSystemManifest.js` — clock slot
- `src/runtime/nodeSystemFactoryTable.js` — factory lookup
- `src/core/registry.js` — system object lookup
- `src/core/physics.js` — owns the SG-02 instance; must publish it
- `src/systems/fields.js` — owns the field kernel; must publish it
- `src/core/simWorker.js` — worker host, same module import

## Manifest patch

In `PRODUCTION_UPDATE_ORDER`, on the physics line (`authoritativeSystemManifest.js` around line 96), insert `reactiveMatter` immediately after `physics`:

```text
'physics', 'reactiveMatter', 'latchNine', 'combat',
```

Add the same id to `PRODUCTION_INIT_ORDER` and to `TABLE_CLOCK_IDS` so the pass stays on the 60 Hz table clock. `system.name` is `reactiveMatter`.

## Factory patch

`src/runtime/nodeSystemFactoryTable.js` and `src/core/registry.js`:

```javascript
import { reactiveMatter } from '../systems/reactiveMatter.js';
// registry lookup entry:
['reactiveMatter', reactiveMatter],
```

## Physics owner patch

`src/core/physics.js`, where `createSg02DynamicBodyOwner` resolves (around line 671), after the owner is stored:

```javascript
state.physicsOwner = owner;
```

`reactiveMatter.update` then calls the public methods `drainContactImpacts`, `syncFromEntities`, `createAttachment`, `setAttachmentReel`, and `cutAttachment`. Impulses go through `queuePhysicsImpulse` / `prepareExternalPhysicsImpulse` (`src/core/physicsAuthority.js`). Spent shells call `syncDerivedPhysicsMass`. A fractured parent sets `entity.physicsBody = false` and `entity.radius = 0` so the next owner sync drops the collider. Debris and shards are `makeEntity` rows with `physicsBody: { shape: 'ball', mass, radius, dynamic: true }` and `data.reactiveMatter.modelId` of `reactive_debris` or `reactive_shard`.

## Field kernel patch

`src/systems/fields.js`, inside `init`, after the kernel is constructed:

```javascript
state.fieldsKernel = this._kernel;
```

`reactiveMatter` reads `kernel.list()` and uses records whose `thermal.kind === 'burn'` (`heatPerSecond`, `center`, `radius`). It does not register a second field system.

## Attachment retarget

Live hitches are `state.combat.attachments.byId[id]`, the record `tetherGameplay.js` reads (`attachment.targetId` near lines 897 and 1001). On a fracture retarget the system:

1. sets `attachment.targetId` to the shard id
2. calls `physicsOwner.cutAttachment({ attachmentId })`
3. calls `physicsOwner.createAttachment` with the shard as `targetId` and the surviving lug as `targetAnchorLocal`

A missed lug sets `attachment.state = 'broken'` and cuts the joint. No credits are granted.

## Worker

`src/core/simWorker.js` should import `stepReactiveMatter` from `src/matter/reactive/step.js` for the same law step. The main thread remains the side that calls `queuePhysicsImpulse`. Do not construct a second integrator in the worker.

## Render

`src/render/reactiveMatter/pass.js` `createReactiveMarkerPass()` instances XZ silhouettes in a `THREE.Group`. The host adds `pass.group` to the gameplay scene and calls `pass.update(state)` after the chase camera. Drawn radius is `max(entity.radius, marker.minWorldRadius)`. Debris `minWorldRadius` is 2.5, the legibility floor. At chase zoom 144 that radius is on the order of 30 px (`markerPixels`).

## What this system does not own

Massline winch tension stays on the SG-02 attachment created with `spring: { mode: 'legacy_rope' }` and `defId: 'attachment_massline_s'`. Thermal heat stays on the field kernel. Traffic is ordinary dynamic entities. Player thrust and brake are `queuePhysicsImpulse` with `motionIntent: 'player_maneuver'`.
