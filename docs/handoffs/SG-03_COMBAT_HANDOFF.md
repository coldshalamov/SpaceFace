# SG-03 handoff — action, combat, damage, subsystem, status, attachment, and trace framework

**Job:** SG-03
**Patch base inspected:** `master` on 2026-06-21
**Base file fingerprints:** `src/systems/combat.js` `0891e088…`; `src/core/registry.js` `050111e5…`; `package.json` `7da4fcbb…`; `src/core/rapierCollisionWorld.js` `25cbff9f…`
**Implementation status:** framework and headless acceptance suite complete; live-body integration intentionally gated on SG-02.

## Dependency gate

SG-01 is present: `src/core/sim.js` exposes the pure `{state,bus,helpers,registry}` simulation contract and fixed 60 Hz stepping.

SG-02 is not present on the inspected `master`. Rapier is still described as an optional collision observer, creates `kinematicPositionBased` bodies, and receives `setNextKinematicTranslation`. Therefore this patch does **not** invent a second body authority. Movement and attachment actions call an explicit `helpers.combatPhysics` port. Until SG-02 supplies that port, affected actions reject with a deterministic `physics_port_unavailable:<operation>` trace event.

This is a hard integration gate, not a soft warning. Merging movement/constraint behavior against the current kinematic observer would violate both SG-02 and SG-03.

## Delivered files

- `src/data/combatDefs.js` — canonical authored definitions and damage coefficients.
- `src/combat/actions.js` — source-neutral action queue, phase machine, cancel grammar, costs, cooldowns, targeting, and effects.
- `src/combat/damage.js` — the sole damage-routing entry point plus the temporary legacy hit adapter.
- `src/combat/subsystems.js` — spatial subsystem health, dependency propagation, next-tick disable/restore, modifiers, and repair.
- `src/combat/statuses.js` — next-tick status activation, stacking, immunities, interactions, expiry, and periodic packets.
- `src/combat/attachments.js` — socket compatibility, ownership, reel/cut/break semantics, and SG-02 constraint telemetry.
- `src/combat/geometry.js` — deterministic local-space volume and socket math.
- `src/combat/trace.js` — canonical append-only `CombatTrace` with sequence numbers and rolling FNV-1a digest.
- `src/combat/runtime.js` — catalog/index creation and serializable runtime state.
- `src/combat/validate.js` — semantic validation beyond JSON Schema.
- `src/combat/kernel.js` — shared kernel, mutation ownership, lifecycle, helpers, and inspection endpoint.
- `src/combat/index.js` — public exports.
- `src/systems/actions.js` — SG-01-compatible pre-physics `SimSystem`.
- `schemas/combat/*.schema.json` — seven Draft 2020-12 schemas.
- `scripts/check-combat-grammar.mjs` — golden trace, shared-controller, next-tick subsystem, convergence, invariant, and boundary checks.
- `scripts/bench-combat.mjs` — traced router microbenchmark.
- `third_party/reference-ledger-sg03.yml` — clean-room provenance.

## Interface specification

### Action request

Input and AI use the same call. `source` is trace metadata only and is never an execution branch.

```js
ctx.helpers.requestCombatAction({
  actorId: 17,
  actionId: 'action_burst',
  targetId: 42,
  source: { kind: 'player' }, // or { kind: 'ai', controllerId: 'wing-3' }
  notBeforeTick: state.tick,
  metadata: { commandId: 'optional-scalar-only-metadata' },
});
```

Attachment-targeted actions use `attachmentId`; point actions use `point: {x,z}`. Requests are assigned a deterministic sequence and processed in sequence order by the `actions` system.

### Damage route

Every producer calls exactly this shape:

```js
ctx.helpers.routeCombatDamage({
  attackerId: 17,
  targetId: 42,
  packet: {
    channels: { kinetic: 12, thermal: 0, ion: 4, plasma: 0, phase: 0 },
    penetration: 0.15,
    impulse: { magnitude: 8 },
    heat: 2,
    statuses: [{ id: 'status_ionized', stacks: 1 }],
    hit: { pos: { x: 81.2, z: -7.4 } },
  },
  origin: { kind: 'action', id: 'action_burst', instanceId: 'act_00000031' },
});
```

`src/systems/combat.js::onHit` becomes a compatibility adapter that constructs a `DamagePacket` and calls this function. Beam hits already pass through `onHit`, so they converge too. Status periodic damage and action damage call the same router directly.

### SG-02 physics port

SG-02 must install this object in `ctx.helpers` before the combat systems initialize:

```ts
interface CombatPhysicsPort {
  applyImpulse(input: {
    entityId: EntityId;
    impulse: { x: number; z: number };
    point: { x: number; z: number } | null;
    reason: string;
    actionInstanceId?: string;
    tick: number;
  }): boolean;

  createAttachment(input: {
    attachmentId: string;
    defId: string;
    ownerId: EntityId;
    targetId: EntityId;
    sourceSocketId: string;
    targetSocketId: string;
    sourceWorld: { x: number; z: number };
    targetWorld: { x: number; z: number };
    restLength: number;
    break: { maxTension: number; maxImpulse: number; graceTicks: number };
    tick: number;
  }): string | number | { id: string | number } | false;

  setAttachmentReel(input: {
    attachmentId: string;
    physicsHandle: unknown;
    restLength: number;
    previousRestLength: number;
    tick: number;
  }): boolean;

  cutAttachment(input: {
    attachmentId: string;
    physicsHandle: unknown;
    reason: string;
    tick: number;
  }): boolean;

  getAttachmentTelemetry?(input: {
    attachmentId: string;
    physicsHandle: unknown;
    tick: number;
  }): { tension: number; impulse: number } | null;
}
```

SG-02 may emit `physics:attachmentBroken {attachmentId,tension,impulse}`. SG-03 records and closes the semantic attachment without directly touching a body or constraint.

### Agent inspection endpoint

```js
ctx.helpers.inspectCombat({
  entityId: 42,       // optional
  sinceSeq: 900,      // optional
  kinds: ['damage.routed', 'subsystem.disabled'],
  limit: 200,
});
```

The result is canonical JSON-safe data containing tick, trace digest, vitals, subsystem/status state, capabilities, active action, cooldowns, attachments, and filtered trace events. It has no renderer object, DOM reference, function, wall-clock value, or Three.js type.

Additional helpers:

```js
ctx.helpers.repairCombatSubsystem({ entityId, subsystemId, amount, reason });
ctx.helpers.getCombatCapabilities(entityId);
```

## Simulation phase contract

Required registry order:

```text
core.preStep
input
ai
actions        // costs, cancels, next-tick transitions, action effects
flight
weapons
physics        // authoritative SG-02 body/constraint step
combat         // beam adapter, regen, attachment telemetry/post-physics clamp
...
core.lifetimeSweep
```

A player command and an AI command submitted before `actions.update` become indistinguishable to execution. Controller identity remains trace metadata.

## Action grammar

An `ActionDef` contains:

- integer startup, active, and recovery durations;
- half-open cancel windows `[fromTick,toTick)` scoped to one phase and allowed destination tags;
- cooldown and capacitor/heat costs;
- capability gates and target requirements;
- optional movement authored as a physics-port impulse;
- timed effects (`startupStart`, `activeStart`, `activeEachTick`, `recoveryStart`);
- cue IDs validated against the canonical cue registry.

The shipped mastery chain is:

```text
T0 dash startup
T1 dash active / forward impulse
T2 cancel recovery → attach startup
T3 attach active / constraint created
T4 cancel recovery → reel active
T5 reel active
T6 cancel active window → sling startup
T7 sling active / tangent impulse
T8 cancel recovery → cut active / constraint broken
T9 cancel recovery → burst startup
T10 burst active / DamagePacket routed
T11 recovery
T13 complete
```

The golden test asserts this exact sequence and the complete rolling trace digest across two independent runs.

## Damage model

Channels are processed in fixed order: `kinetic`, `thermal`, `ion`, `plasma`, `phase`.

1. Split each channel into penetrating and non-penetrating raw energy.
2. Apply channel-specific shield coefficients to the non-penetrating share. Convert depleted shield HP back to consumed raw energy, preserving partial spill-through.
3. Apply armor flat reduction once, proportionally across remaining channels.
4. Apply channel-specific armor coefficients and preserve partial spill-through.
5. Select a spatial subsystem from explicit targeting or the first deterministic volume match in target-local X/Z space.
6. Route the authored subsystem share to subsystem armor/health; route overflow and the hull share to hull coefficients.
7. Clamp all vitals; stage subsystem disablement for `damageTick + 1`.
8. Stage statuses for `damageTick + 1`.
9. Delegate impulse to SG-02.
10. Append `damage.routed`, emit the compatibility `combat:damage` event, then invoke the existing death/respawn owner.

Current coefficient table:

| Channel | Shield | Armor | Hull | Subsystem armor |
|---|---:|---:|---:|---:|
| kinetic | 0.82 | 0.92 | 1.00 | 0.95 |
| thermal | 1.00 | 0.78 | 1.00 | 0.85 |
| ion | 1.35 | 0.28 | 0.55 | 1.20 |
| plasma | 1.15 | 1.20 | 1.08 | 1.05 |
| phase | 0.35 | 0.55 | 1.00 | 1.00 |

The compatibility mapping is explicit: legacy `energy` becomes 72% thermal / 28% ion; `explosive` becomes 65% kinetic / 35% thermal. This adapter is temporary and appears in the deletion list.

## Subsystem runtime

Each combat profile instantiates authored subsystem definitions with local-space volumes, health, armor, dependencies, disabled behavior, and repair rates.

State transition rule:

```text
damage at tick T reduces subsystem health to zero
→ pendingTransition {destroyed:true, atTick:T+1}
→ actions pre-physics at T+1 commits destroyed
→ dependency closure recomputed
→ capabilities/multipliers/blocked tags take effect
→ trace emits subsystem.destroyed + subsystem.disabled
```

Dependency disablement is derived, not copied. Destroying `subsystem_power` disables dependent weapon, sensor, drive, and tether systems without overwriting their own health. Repairing power re-enables healthy dependents on the next tick.

Documented functional effects:

| Subsystem | Next-tick effect |
|---|---|
| drive | `drive=false`, movement multiplier `0.25`, blocks `dash` and `sling` |
| weapon | `weapon=false`, blocks `weapon` and `burst` |
| sensor | `sensor=false`, blocks sensor/lock actions; `action_burst` capability gate fails |
| tether spool | `tether=false`, blocks attach/reel/sling, breaks owned attachments |
| power | `power=false`, capacitor regeneration multiplier `0.20`; dependency closure disables dependents |

## Status runtime

Statuses activate on the tick after the packet that applied them. Runtime supports refresh/stack/replace/ignore modes, maximum stacks, immunity tags, interactions, expiry, blocked action tags, capability changes, and multiplicative modifiers.

Periodic status damage calls `routeDamage` with `origin.kind='status'`; there is no secondary DOT health writer.

Shipped definitions: ionized, burning, overheated, systems scrambled.

## Attachment runtime

An `AttachmentDef` declares source/target socket tags, owner policy, transferability, owner limits, break thresholds, and cues. Runtime attachment IDs and ownership are deterministic. Constraint handles are opaque and serialized only as a scalar or `{id}` reference; Rapier objects never enter simulation state.

The semantic state is owned by SG-03. The physical constraint is owned by SG-02. Neither side silently mutates the other.

## CombatTrace

Each event contains deterministic `seq`, `tick`, `kind`, canonical payload fields, and the digest after appending that event. Object keys are sorted, numbers are rounded to six decimal places, and the rolling hash has no clock or random input. The ring may drop old events for memory, but the rolling digest still commits to the full event history.

Trace is evidence and inspection, not gameplay input.

## Mutation ownership table

| State | Sole writer | Other systems |
|---|---|---|
| action queue/instances/cooldowns | `src/combat/actions.js` | input/AI submit requests only |
| shield/armor/hull damage | `src/combat/damage.js::routeDamage` | legacy combat adapter, actions, statuses call it |
| subsystem health/transitions/effects | `src/combat/subsystems.js`, only under combat kernel | presentation reads events/inspection |
| status instances | `src/combat/statuses.js` | damage schedules applications |
| semantic attachments/ownership | `src/combat/attachments.js` | SG-02 owns physical constraints |
| body impulses/constraints | SG-02 `combatPhysics` port | SG-03 issues commands only |
| combat heat | combat kernel/actions/damage | UI reads inspection/events only |
| shield/cap regeneration | transitional `src/systems/combat.js` | cap regen reads kernel multiplier |
| `CombatTrace` | `appendCombatTrace` | everyone else reads through inspection |
| death/respawn/loot | existing `src/systems/combat.js` | router invokes its kill callback |
| render/UI state | render/UI systems | must never write any row above |

## Acceptance evidence

Run:

```bash
node scripts/check-combat-grammar.mjs
node scripts/bench-combat.mjs 10000
```

Observed locally:

```text
ok   all authored combat definitions validate
ok   dash→attach→reel→sling→cut→burst has the exact golden tick trace
ok   player and AI invoke the same ActionDef path
ok   drive/weapon/sensor/tether-spool disablement becomes functional on tick + 1
ok   legacy, action, and status damage converge on damage.routed
ok   health, capacitor, heat, and cooldown invariants hold under generated inputs
ok   combat is renderer/UI independent and source-neutral

SG-03 combat grammar: 7 checks passed.
```

Microbenchmark on the build host, Node 22, with trace hashing enabled:

```json
{"benchmark":"SG-03 routeDamage","iterations":10000,"elapsedMs":334.7,"operationsPerSecond":29878,"traceDigest":"6a7049e3"}
```

This is a microbenchmark, not a frame-budget guarantee. Re-run on the project CI and target browsers.

Verification boundary: the focused SG-03 suite, syntax checks, JSON parsing, and patch-application check were run in the isolated handoff build. The repository-wide `npm run check` was not run there because the build host did not have a complete SpaceFace checkout; it remains a required integration gate after applying the patch to the real repository.

## Migration plan

1. **Land SG-02 on master.** Confirm authoritative dynamic bodies, tether constraints, break telemetry, stable body IDs, and no `setNextKinematicTranslation` gameplay authority.
2. **Implement `helpers.combatPhysics`.** Adapt SG-02 bodies/constraints to the port above. Do not pass Rapier objects into `state.combat`.
3. **Apply this patch.** Run `npm run check:combat`, then the complete `npm run check`.
4. **Wire player controls.** Translate dash/attach/reel/sling/cut/burst inputs into `requestCombatAction`. Do not mutate combat state from UI.
5. **Wire tactical AI.** Existing AI or SG-06 submits identical requests with `source.kind='ai'`. Do not add AI-only damage calls.
6. **Migrate weapons incrementally.** Author weapon fire actions and place full `DamagePacket` values on projectile/beam hit records. Keep the legacy adapter only until trace parity is demonstrated.
7. **Save migration.** Decide which subsystem damage/status/attachment state persists across save/respawn, add a save-version migration, and explicitly clear transient actions/cooldowns/trace if desired.
8. **Delete the flat path.** Remove the compatibility fields and adapters listed below after parity fixtures pass.
9. **Run the golden encounter under real SG-02.** The final SG-03 merge gate is the exact command/trace fixture using real dynamic bodies and constraints, not only the deterministic test port.

## Deletion list for the current flat-DPS path

Delete only after migrated producers have trace parity:

1. The old direct shield/armor/hull body of `src/systems/combat.js::onHit` — removed by this patch.
2. `legacyHitToDamagePacket` and the scalar `damage`/`damageType` `projectile:hit` adapter.
3. Scalar projectile fields `data.damage` and `data.damageType` in `src/systems/weapons.js`; replace with an authored action/packet reference or immutable packet snapshot.
4. Scalar `projectile:hit {damage,damageType}` emission in `src/core/physics.js`; emit the packet/reference plus deterministic hit metadata.
5. Beam `dpsThisTick` as authoritative damage grammar; emit authored packets at deterministic ticks. The beam ray may remain presentation/query data.
6. Flat weapon source fields `dmg`, `rof`, `dps`, `damageType`, and `armorPierce` in `src/data/weapons.js` after all weapons resolve through ActionDefs/DamagePackets.
7. `src/systems/flight.js::_triggerDash` direct velocity mutation and its independent dash cooldown/cost once player dash is bound to `action_dash` and SG-02 owns impulses.
8. Any future AI code that calls damage directly or writes vitals. AI may only request an action or submit a world command with the same public contract.

## Clean-room statement

No FreeSpace 2 or Endless Sky source code was fetched, read, translated, or copied for this implementation. Only the behavior-level semantics present in the repository’s master plan were used. Names, constants, layouts, algorithms, and code structure were authored independently for SpaceFace. See `third_party/reference-ledger-sg03.yml`.

## Known unresolved integration item

The framework is ready; the live mastery sequence is not honestly claimable on the inspected `master` because SG-02 is absent. The patch deliberately rejects movement/attachment operations without the SG-02 port. Once SG-02 lands, the remaining work is adapter wiring and running this same trace fixture against the real body/constraint implementation.
