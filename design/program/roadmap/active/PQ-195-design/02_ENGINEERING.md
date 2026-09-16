# BREAKAWAY — engineering and integration contract

**Baseline:** `3bd28815e924a85cf3b952284b7fa6934ef4c487`. This packet is an authored implementation seed, not a patch against an unknown future checkout. Reconcile each seam in the actual working tree before editing. Do not copy the reference lab into `src/`.

## 1. The minimal architecture

The addition needs one small capture-mechanics library, a parameterized variant of the existing physical facility/capsule owner, one authored mission variant, durable physical-load projection, and presentation bindings. The existing heist arbiter remains the terminal decision-maker. A mechanical phase such as `braking` is not a second mission state machine.

| Responsibility | Existing owner / seam | Required change |
|---|---|---|
| Integrate positions, velocity, angular velocity | `src/core/sg02DynamicBodyOwner.js`, through `src/core/physicsAuthority.js` | Consume bounded impulse commands; existing body remains authoritative |
| Spawn and operate the scheduled load and receiver | `src/systems/heistFacilities.js` | Add a configured BREAKAWAY variant and fresh-custody evidence |
| Select terminal outcome, deduplicate effects | `src/missions/heistArbiter.js` | Preserve arbitration and effect journal; narrowly add safe withdrawal of an uncommitted delivery if needed |
| Connect physical events to a mission | `src/missions/heistMissionRuntime.js`, owned by `missions.js` | Gate settlement on physical commit; map one new contract policy |
| Money, cargo, faction reputation, wanted heat | Existing economy/cargo/factions/heat/law owners | Consume their established intents/receipts; no direct writes here |
| NPC intentions | Existing encounter, tactical AI, AI ports, job-control leasing | Reuse convoy predation and bounded roles |
| Physical state across load | Current save owner and capture plan | Explicit new semantic load/receiver records, migrations and projection restoration |
| HUD, voice, model, sound | Existing UI, voice arbiter, render and audio owners | Consume state/events; never decide success |

`cargoCustody.js` is an operation-shipment sale helper, not a general receiver authority. Do not run the spindle through automation sales to obtain convenient exactly-once behavior. Likewise, do not add a parallel registry for the laboratory.

The pinned source still hardcodes `PQ019_CAPSULE.stableId`, facility identities and sector assumptions. Parameterizing those assumptions is real work. It is not solved by adding unrecognized keys to a JSON object. Preserve current Capsule Run defaults while admitting one explicit new variant.

## 2. Included code and promotion boundaries

Promote the dependency-free helpers into one dedicated directory such as `src/physicalCargo/breakaway/`, after checking that no newer implementation already owns the behavior. Keeping `.mjs` is valid for the ES-module runtime; adapt imports consistently if the repo requires `.js`.

`payloadMath.mjs` supplies bounded linear/angular braking, point velocity for a true compound-body split, and a capped quality quote. `captureKernel.mjs` supplies configuration validation, swept acquisition, stateful settling, current proof and serialization. `readModel.mjs` maps mechanical and owner-supplied legal state into display text. `settlementGate.mjs` is a fail-closed receipt guard, not a settlement system.

The source-independent adapter example is in `integration/capture-owner.example.mjs`. Its injected ports are an explicit adapter interface, **not claimed pre-existing `ctx.helpers` methods**. It calls only the supplied physics-command functions and publishes an observation. A production adapter must translate the observation into the existing owner’s candidate vocabulary.

The library assumes a fixed 60 Hz simulation. Do not call it from requestAnimationFrame, a DOM timer, or the renderer. Its state is tiny and bounded. Some local-coordinate helpers allocate small objects; the packet does **not** claim zero allocations or measured live-game performance. Reuse output objects, keep one active load, and optimize any measured hot path without altering the physical contract.

## 3. Transform and collision contract

World uses +Y up; gameplay lies in XZ. The spindle’s long axis is local +X. The receiver mouth origin is local `[0,0,0]`, with inward direction +X. Read `assets/models/manifest.json` for exact sockets, bounds and conservative radius.

The real source physics owner publishes physical Y angular velocity as `entity.angVel`. Do not substitute a display bank angle, a yaw-rate intent, or a smoothed renderer pose. For a point displaced by `(rx,rz)`, the right-handed cross product gives `vxPoint = vx + omegaY * rz` and `vzPoint = vz - omegaY * rx`.

For the later transport-clamp release, prefer two bodies and an existing constraint. Removing the constraint preserves both bodies’ current momentum: **do not also assign inherited velocity or add an exit impulse**. The point-velocity helper is for a genuine compound-body split only; that split additionally requires the physics owner to reconcile mass, inertia and angular momentum. A single helper is not a full conservative compound-splitting implementation.

Use actual post-physics world positions for the capture sample. Derive receiver geometry from the same scale/yaw/recentering transform used by the facility model and collision proxy. `heistFacilities` already has socket projection machinery; extend it rather than performing a second unrelated transform in the HUD.

The fork has three static colliders: two rails and a rear stop. The mouth is not a fourth solid wall. The supplied spindle is one dynamic body. Its conservative radius is 16 WU; if a later proxy is less conservative, derive clearance from a bounded support extent rather than using an art-only radius. Never use the detailed GLB triangles as dynamic collision geometry.

## 4. The fixed-tick mechanical pipeline

1. Physics applies last tick’s queued impulses and advances the actual body.
2. The facility owner samples the resulting body and its previous post-step position.
3. The capture kernel verifies identity, receiver permit and real forward crossing.
4. While acquired and wholly inside the fork, it computes dissipative impulse and torque. It never moves a body directly.
5. The owner queues those impulses through `queuePhysicsImpulse` / `queuePhysicsTorqueImpulse` for the next physical step.
6. After 21 consecutive stable samples, the owner records a **candidate**, not success.
7. Mission arbitration observes eligible candidates using its existing causal-tick rules.
8. Physical prepare and commit independently recheck current custody. Only a proven physical commit permits settlement.

Resolve actual registry order before wiring this sequence. A one-tick delayed force is intentional; accidentally consuming the same sample twice or applying an impulse twice is not. On pause there are no physics ticks. A gap resets dwell; it does not synthesize skipped stable samples. On sector unload the owner serializes or explicitly suspends the obligation before destroying its visual projection.

A slowly entering body is permitted to advance until its centre is one radius inside; braking too early would strand it outside the completion volume. Side entry, rear entry, an interior spawn and overspeed do not count as a catch. A receiver cannot attract a body from outside its physical bay. That is the distinction between a capture machine and a convenient teleport service.

## 5. A real settlement fault path found during this work

A fault-injection characterization imports the **actual pinned** `heistMissionRuntime.js` and actual arbiter, then makes the physical receiver refuse preparation or commit. In both cases the runtime still reaches `settle('complete')`. The call sequences and source hashes are retained in `qa/source-settlement-characterization.json` and `integration/source-baseline.json`.

This proves a fail-open call path under the injected refusals. It does **not** prove that an ordinary player has exploited it, or that the whole live economy is broken. It matters because BREAKAWAY deliberately permits a load to move or be destroyed while capture is pending.

Fix this path before layering a new receiver on top of it. Do not merely add a new unit test that calls a mocked “successful” receiver.

For delivery outcomes, the physical owner must return a matching committed handoff before mission completion, schedule release or payout. The included `receiverCommitGate` accepts a fresh committed reply, or a matching durable committed record on an idempotent replay. A bare `already_committed` string is not proof. Match receipt, stable payload and facility together.

An illustrative control flow is:

```js
// Inside the existing owner transaction. Names below are local variables, not new global APIs.
const prepared = facilities.prepareReceiverHandoff(expected);
const reply = prepared?.prepared
  ? facilities.commitReceiverHandoff(expected.receiptId)
  : prepared;
const gate = receiverCommitGate(expected, reply, durableCommittedHandoff);
if (!gate.maySettle) {
  // No reward, mission completion, launcher release, or success cue here.
  // Retain an explicit pending obligation or safely abort an uncommitted one.
  return { pending: true, reason: gate.reason };
}
// Existing effect journal and mission/economy owner now apply the terminal effects once.
```

Handle refusal without creating a permanently stuck prepared receipt. The current arbiter freezes prepared terminals and does not offer a general withdrawal API. The integrator must add a narrowly guarded withdrawal/abort transition for **uncommitted delivery candidates only** when current physical proof can no longer be earned. `canWithdrawUncommittedDelivery` supplies the conservative guard: no receiver consumption, mission settlement, reward or faction outcome may have happened. Preserve existing law incidents; never rewind a committed event. If anything irreversible happened, recover forward using the same durable receipt.

A candidate that has not yet been prepared may be withdrawn through an explicit owner/arbiter API when the load leaves. Do not mutate internal candidate arrays, retimestamp old observations, or invent a competing arbiter. Same-tick destruction must still win according to existing precedence.

## 6. Reentrancy and exactly-once effects

The bus is synchronous. Publishing `receiverPrepared` or `receiverCommitted` can re-enter gameplay through listeners. Fresh proof must be checked after preparation and immediately before consumption. Seal the owner’s transaction state before broadcasting a committed notification. Defer presentation notifications until authoritative state is coherent; do not call a free-form callback between “proof checked” and “body consumed.”

Persist a small durable handoff record before removing the body. It names stable payload, schedule, facility, receipt, committed tick and effect identity. Existing mission/economy effect keys then provide downstream idempotency. On restoration, a committed record without a body means “resume outstanding effects,” not “respawn free cargo.” A live body with no committed record remains a physical obligation, not a paid delivery.

Receiver-ready is not irreversible. Delivery-committed is. UI may say “verifying custody” between them; it must not show credits received until the economy owner reports the actual credited outcome.

## 7. Save and restoration: required, not already solved

The inspected heist restore path explicitly says the facilities state is outside its save capture plan and the launched capsule is transient. The old mission handles absence rather than recreating it. BREAKAWAY needs deliberate new save support. Do not advertise persistent loads merely because the capture kernel can serialize its own small state.

Persist a versioned semantic record with stable IDs, contract/variant ID, original owner and legal permit, body pose and true linear/angular velocity, condition, destination obligation, current mechanical state, pending or committed handoff, and consequence identity. Entity handles, Rapier pointers, Three objects, transient WeakMap commands and DOM nodes do not enter the save.

Restore order: validate/migrate the record; reconstruct the physical owner’s body once; rebind stable identity; restore physical state through the physics owner; restore pending receiver state; rebuild model/UI projections; resume downstream effects. If the receiver transform changed during a content update, invalidate mechanical dwell and require a new approach; do not change custody or grant a delivery from obsolete geometry.

The included Rapier snapshot test proves a lab fixture resumes identically using Rapier’s snapshot. It is **not** a recommendation to replace the game’s semantic save format with raw WASM-world snapshots. Production save tests must use the normal save system and exported/imported saves.

On leaving the sector, choose the existing system’s supported physical-obligation policy explicitly. First release may suspend this bounded encounter and its elapsed active simulation while absent, with a truthful journal explanation. It must neither simulate destructive offscreen outcomes inconsistently nor delete player-owned cargo. Do not add a galaxy-wide rigid-body simulation to solve one mission.

## 8. Legal identity and reward

Keep original owner, current physical possession, permitted receiver, and settled custody distinct. A tether latch is not automatically a theft, transfer, sale or legal permission. Determine incidents through the existing law owner at the authored action/evidence point, preserving the game’s witness policy. Do not infer legality from HUD color.

The included 15% quality quote is a candidate reward calculation. Feed it into the existing mission settlement policy; do not write credits or grant a second reward when the base mission already pays. Existing Capsule Run is a fenced-success contract with its own outcome matrix. “Lawful rescue also pays” is a **new variant policy**, not a reason to globally rewrite that matrix.

Bind the restored industrial activity to the committed delivery receipt. One local activity can restart once; neither docking repeatedly nor reloading can restock the same shipment or trigger a second restoration. Keep the first consequence small and visible before extending regional economics.

## 9. Resource and cleanup budget

First encounter budget: one load, one active receiving fork, up to four borrowed/extra NPCs, one 21-tick mechanical dwell record, and at most one recovery continuation. The two GLBs total 4,332 triangles across 12 material primitives before engine batching. These are file facts, not GPU frame-time measurements.

Use the existing spawn arbiter. If the necessary roles cannot be admitted, postpone the encounter coherently; never silently clear ambient populations or raise global caps. The station can already own the receiving geometry; instantiate only the load and relevant activity as needed.

Release attachments before body removal; return leased NPCs through their owner; unregister listeners exactly once; clear renderer references and pending presentation timers; preserve durable receipts until their retention policy expires. Do not release the launcher schedule merely because capture was attempted. Run repeated start/abort/restore cycles and confirm bodies, joints, listeners and pending commands return to their baseline.

No new network service, online dependency, runtime image generation, general-purpose orchestration layer, or external account is needed for this feature.
