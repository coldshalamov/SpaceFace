// PIC-31 — a damaged hull vents where it is hurt, so "that ship is in trouble"
// reads at chase distance. On seed 4242 a hull crossing into the damaged band emits
// one vent record attached to the hit side; it stops on repair above the band and on
// death. The bands themselves (damaged is hull/hullMax in [0.25, 0.55)) are owned by
// the integrity instrument and are never changed here.
import test from 'node:test';
import assert from 'node:assert/strict';
import { createBus } from '../src/core/eventBus.js';
import { createGameState } from '../src/core/gameState.js';
import {
  createDamageRouter,
  scalarHitToDamagePacket,
  HULL_VENT_BAND_HI,
  HULL_VENT_BAND_LO,
  resolveHullVentSide,
} from '../src/combat/damage.js';
import { createCombatCatalog } from '../src/combat/runtime.js';
import {
  collectHullVentRecords,
  planHullVentEmit,
  collectStatusAttachedVictims,
  planStatusAttachedEmit,
  matterKindForStatusId,
  STATUS_ATTACHED_VENT_ID,
  HULL_VENT_ENTRY_FRACTION,
} from '../src/render/statusAttachedVfx.js';

function ship(id, pos, team, extra = {}) {
  return {
    id,
    type: 'ship',
    alive: true,
    team,
    hull: 100,
    hullMax: 100,
    shield: 0,
    shieldMax: 0,
    armorHp: 0,
    armorMax: 0,
    radius: 8,
    collisionRadius: 12,
    pos: { x: pos.x, z: pos.z },
    vel: { x: 0, z: 0 },
    rot: 0,
    ...extra,
  };
}

function boot() {
  const state = createGameState(4242);
  const bus = createBus();
  const attacker = ship(2, { x: 0, z: 0 }, 1);
  const target = ship(7, { x: 100, z: 0 }, 2);
  for (const entity of [attacker, target]) {
    state.entities.set(entity.id, entity);
    state.entityList.push(entity);
  }
  const router = createDamageRouter({
    state,
    catalog: createCombatCatalog(),
    bus,
    helpers: {},
  }, { schedule() {} });
  return { state, router, attacker, target };
}

// Hit pos sits inside 0.9 * radius of the hull centre, so no subsystem split
// diverts hull damage, while still sitting clearly off-centre for the side law.
// subsystemShare 0 keeps the full packet on the hull even when the hit geometry
// crosses a subsystem volume, so the band arithmetic below is exact.
function fire(h, hitPos, damage) {
  return h.router({
    attackerId: h.attacker.id,
    targetId: h.target.id,
    packet: scalarHitToDamagePacket({ damage, damageType: 'kinetic', pos: hitPos, subsystemShare: 0 }),
    origin: { kind: 'weapon', id: 'wpn_pulse', weaponId: 'wpn_pulse' },
  });
}

function vents(h) {
  return collectHullVentRecords(h.state, []);
}

test('the mirrored band edge matches the integrity instrument bands', () => {
  assert.equal(HULL_VENT_BAND_HI, 0.55);
  assert.equal(HULL_VENT_BAND_LO, 0.25);
  assert.equal(HULL_VENT_ENTRY_FRACTION, HULL_VENT_BAND_HI);
});

test('band entry emits exactly one vent record attached to the hit side', () => {
  const h = boot();
  // Facing +X (rot 0): a hit at +z sits on the +1 side, verified by the pure law.
  assert.equal(resolveHullVentSide(h.target, { pos: { x: 100, z: 4 } }), 1);
  assert.equal(resolveHullVentSide(h.target, { pos: { x: 100, z: -4 } }), -1);

  let result = fire(h, { x: 100, z: 4 }, 20);
  assert.equal(result.ok, true);
  assert.equal(h.target.hull, 80);
  assert.equal(vents(h).length, 0, 'no vent above the damaged band');

  result = fire(h, { x: 100, z: 4 }, 20);
  assert.equal(result.ok, true);
  assert.equal(h.target.hull, 60);
  assert.equal(vents(h).length, 0, 'no vent above the damaged band');

  result = fire(h, { x: 100, z: 4 }, 20);
  assert.equal(result.ok, true);
  assert.equal(h.target.hull, 40);
  const records = vents(h);
  assert.equal(records.length, 1, 'exactly one vent record on band entry');
  const [vent] = records;
  assert.equal(vent.entityId, h.target.id);
  assert.equal(vent.kind, 'vent');
  assert.equal(vent.side, 1, 'vent is attached to the hit side');
  assert.equal(vent.hullFraction, 0.4);
  assert.equal(vent.startedTick, h.state.tick);

  // A further hit inside the band keeps the single record and the first side.
  result = fire(h, { x: 100, z: -4 }, 20);
  assert.equal(result.ok, true);
  assert.equal(h.target.hull, 20);
  const stayed = vents(h);
  assert.equal(stayed.length, 1, 'still exactly one record, never a second');
  assert.equal(stayed[0].side, 1, 'the entry side is kept while the hull stays hurt');

  // The emission plan follows the status-attached cadence contract.
  const quiet = planHullVentEmit(stayed[0], 0, {}, 0);
  assert.equal(quiet.emit, false, 'between cadence pulses there is no emission');
  const plan = planHullVentEmit(stayed[0], 0.14, {}, 0);
  assert.equal(plan.emit, true);
  assert.equal(plan.side, 1);
  assert.ok(plan.sprites.length >= 1);
  assert.ok(plan.sprites.every((sprite) => sprite.kind === 'puff'));
  assert.ok(plan.sprites.some((sprite) => sprite.vx !== 0 || sprite.vz !== 0),
    'full motion lets the vent travel with the hull');
  const held = planHullVentEmit(stayed[0], 0.14, { motionReduce: true }, 0);
  assert.equal(held.emit, true);
  assert.ok(held.sprites.every((sprite) => sprite.vx === 0 && sprite.vz === 0),
    'reduced motion holds a stable body mark');
});

test('repair above the band stops the vent; re-entry restarts it on the new hit side', () => {
  const h = boot();
  fire(h, { x: 100, z: 4 }, 20);
  fire(h, { x: 100, z: 4 }, 20);
  fire(h, { x: 100, z: 4 }, 20);
  assert.equal(vents(h).length, 1);

  // A repair system's write back above the entry edge stops the vent.
  h.target.hull = 80;
  assert.equal(vents(h).length, 0, 'no vent after repair above the band');

  // The next hit that crosses back in restarts exactly one record, on its own side.
  const result = fire(h, { x: 100, z: -4 }, 30);
  assert.equal(result.ok, true);
  assert.equal(h.target.hull, 50);
  const records = vents(h);
  assert.equal(records.length, 1);
  assert.equal(records[0].side, -1, 're-entry vents where the new hit landed');
});

test('death stops the vent and clears the latch', () => {
  const h = boot();
  fire(h, { x: 100, z: 4 }, 20);
  fire(h, { x: 100, z: 4 }, 20);
  fire(h, { x: 100, z: 4 }, 20);
  assert.equal(vents(h).length, 1);

  const result = fire(h, { x: 100, z: 4 }, 500);
  assert.equal(result.ok, true);
  assert.equal(h.target.hull, 0);
  assert.equal(h.target.alive, false);
  assert.equal(vents(h).length, 0, 'no vent on a dead hull');
  const runtime = h.state.combat.entities[String(h.target.id)];
  assert.equal(runtime.hullVent, null, 'death clears the latch');
});

test('the vent joins the loop victim flow so the vfx loop draws it', () => {
  const h = boot();
  assert.deepEqual(
    collectStatusAttachedVictims(h.state, []).filter((v) => v.statusId === STATUS_ATTACHED_VENT_ID),
    [],
    'no vent victim above the band',
  );
  fire(h, { x: 100, z: 4 }, 20);
  fire(h, { x: 100, z: 4 }, 20);
  fire(h, { x: 100, z: 4 }, 20);
  const victims = collectStatusAttachedVictims(h.state, [])
    .filter((v) => v.statusId === STATUS_ATTACHED_VENT_ID);
  assert.equal(victims.length, 1, 'exactly one vent victim reaches the loop');
  assert.equal(victims[0].kind, 'vent');
  assert.equal(victims[0].entityId, h.target.id);
  assert.equal(victims[0].side, 1, 'the loop victim keeps the hit side');

  // The shared planner answers the vent victim through the vent cadence.
  const quiet = planStatusAttachedEmit(victims[0], 0, {}, 0);
  assert.equal(quiet.emit, false, 'between cadence pulses there is no emission');
  const plan = planStatusAttachedEmit(victims[0], 0.14, {}, 0);
  assert.equal(plan.emit, true, 'at cadence the loop emits the vent');
  assert.ok(plan.sprites.length >= 1);
  assert.ok(plan.sprites.every((sprite) => sprite.kind === 'puff'));

  // Repair above the band drops the victim from the flow.
  h.target.hull = 80;
  assert.deepEqual(
    collectStatusAttachedVictims(h.state, []).filter((v) => v.statusId === STATUS_ATTACHED_VENT_ID),
    [],
    'no vent victim after repair',
  );
});

test('the matter-kind map names the vent and keeps the five existing kinds', () => {
  assert.equal(matterKindForStatusId(STATUS_ATTACHED_VENT_ID), 'vent');
  assert.equal(matterKindForStatusId('status_burning'), 'burn');
  assert.equal(matterKindForStatusId('status_goo'), 'goo');
  assert.equal(matterKindForStatusId('status_gravity_marked'), 'gravity');
  assert.equal(matterKindForStatusId('nope'), null);
});

test('a latch transition wakes the sleeping status-attached loop', () => {
  const h = boot();
  const combat = h.state.combat;
  // Production init (src/combat/statuses.js ensure) runs before any damage can
  // route; the bare harness mirrors it here.
  if (!Number.isInteger(combat.statusNextPendingSeq)) combat.statusNextPendingSeq = 1;
  assert.ok(Number.isInteger(combat.statusNextPendingSeq), 'seq initialized');
  const before = combat.statusNextPendingSeq;
  fire(h, { x: 100, z: 4 }, 20);
  fire(h, { x: 100, z: 4 }, 20);
  assert.equal(combat.statusNextPendingSeq, before, 'in-band hits above the edge do not bump');
  fire(h, { x: 100, z: 4 }, 20);
  assert.equal(combat.statusNextPendingSeq, before + 1, 'band entry bumps the wake seq once');
  assert.equal(vents(h).length, 1);
});
