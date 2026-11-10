import test from 'node:test';
import assert from 'node:assert/strict';
import { createSimulation } from '../src/core/sim.js';
import { createBus } from '../src/core/eventBus.js';
import { runSession } from '../src/systems/runSession.js';
import { archiveRedaction, ARCHIVE_FIELD } from '../src/systems/faction_archive.js';
import { vaelLiens } from '../src/systems/faction_vael.js';
import { frontierHomesteads } from '../src/systems/faction_frontier.js';
import { understoryGardens, spawnGarden } from '../src/systems/faction_understory.js';
import { vergeCourt, VERGE_PERMIT_TIERS } from '../src/systems/faction_verge.js';
import { ARCHIVE_INDEX_HEAD } from '../src/data/factions/archive.js';
import { VAEL_OVERRIDE_HEAD } from '../src/data/factions/vael.js';
import { FRONTIER_WELD_HEAD } from '../src/data/factions/free.js';
import { UNDERSTORY_SPORE_HEAD } from '../src/data/factions/understory.js';

const owners = [archiveRedaction, vaelLiens, frontierHomesteads, understoryGardens, vergeCourt];
const body = (sim, data = {}, x = 200, type = 'wreck') => sim.spawn({
  type, team: 0, pos: { x, z: 0 }, vel: { x: 0, z: 0 }, radius: 12, mass: 24,
  hull: 100, hullMax: 100, collides: true, data,
});
function boot(systems = owners, { kind = 'survival', updateOrder } = {}) {
  const bus = createBus();
  const sim = createSimulation({ seed: 1729, bus, systems: [runSession, ...systems], updateOrder });
  const { state } = sim;
  state.mode = 'flight';
  state.world.currentSectorId = 'arena_activity_test';
  const player = body(sim, {}, 0, 'ship');
  state.playerId = player.id;
  bus.emit('run:beginRequested', { kind, ruleset: kind === 'survival' ? 'swarm' : null, seed: 1729 });
  assert.equal(state.run.kind, kind);
  return { sim, state, bus, player, sys: (name) => sim.registry.get(name) };
}
function changeRun(f, kind) {
  f.bus.emit('game:exitToMenu', { source: 'arena_activity_test' });
  f.bus.emit('run:beginRequested', { kind, ruleset: kind === 'survival' ? 'swarm' : null, seed: 1729 });
  assert.equal(f.state.run.kind, kind);
}
const hear = (bus, name) => {
  const events = [];
  bus.on(name, (payload) => events.push(payload));
  return events;
};

test('dormant Swarm books stay dormant without changing RNG, entity state, or save ownership', () => {
  const f = boot();
  const quiet = boot(owners, { updateOrder: [] });
  try {
    for (let i = 0; i < 30; i++) { f.sim.step(); quiet.sim.step(); }
    assert.equal(f.state.archive.traffic.nextFieldAt, -1);
    assert.deepEqual(f.state.vael.visits, {});
    assert.deepEqual(f.state.frontier.sites, {});
    assert.equal(f.state.understory.nextWildDropAt, 0);
    assert.deepEqual(f.state.entityList, quiet.state.entityList);
    assert.equal(f.state.rng(), quiet.state.rng());
    for (const owner of owners) {
      const instance = f.sys(owner.name);
      const payload = instance.serialize();
      // Understory deliberately omits an unseen ecology section from the save.
      if (owner === understoryGardens) assert.equal(payload, undefined);
      else assert.ok(payload && typeof payload === 'object');
      if (payload?.book) payload.book.stains = 999;
      assert.notEqual(f.state.vael.book.stains, 999, 'serializer retains its detached ownership');
    }
  } finally { f.sim.dispose(); quiet.sim.dispose(); }
});

test('real run transitions resume Adventure field clocks and preserve pending casts in Survival', () => {
  const f = boot([archiveRedaction]);
  try {
    f.state.world.currentSectorId = ARCHIVE_FIELD.sectors[0];
    f.sim.step();
    assert.equal(f.state.archive.traffic.nextFieldAt, -1);
    changeRun(f, 'adventure');
    f.sim.step();
    const due = f.state.archive.traffic.nextFieldAt;
    assert.ok(due > f.state.simTime);
    changeRun(f, 'survival');
    f.state.simTime = due;
    f.sim.step();
    assert.ok(f.state.entityList.some((e) => e.data?.censorFrigate === true));
    assert.equal(f.state.archive.traffic.censorSent, 1);
    const censor = f.state.entityList.find((e) => e.data?.censorFrigate === true);
    censor.alive = false;
    f.bus.emit('entity:killed', { id: censor.id, type: 'ship', factionId: 'faction_archive', killerId: f.player.id });
    assert.ok(f.state.archive.marks.length > 0, 'registered kill ownership survives the dormant interval');
  } finally { f.sim.dispose(); }
});

test('Adventure homestead admission resumes after Survival without resetting campaign state', () => {
  const f = boot([frontierHomesteads]);
  try {
    f.state.world.currentSectorId = 'sector_io_reach';
    f.state.frontier.paid['retained:history'] = 17;
    f.sim.step();
    assert.equal(f.state.entityList.some((e) => e.data?.homesteadFrame), false);
    changeRun(f, 'adventure');
    f.sim.step();
    assert.ok(f.state.entityList.some((e) => e.data?.homesteadFrame));
    assert.equal(f.state.frontier.paid['retained:history'], 17);
  } finally { f.sim.dispose(); }
});

for (const [owner, head, event] of [
  [archiveRedaction, ARCHIVE_INDEX_HEAD, 'archive:indexRead'],
  [vaelLiens, VAEL_OVERRIDE_HEAD, 'vael:overrideThrust'],
  [frontierHomesteads, FRONTIER_WELD_HEAD, 'frontier:welded'],
  [understoryGardens, UNDERSTORY_SPORE_HEAD, 'understory:sporeSkin'],
]) test(`Survival retains equipped ${head.id} work and revokes a dead target`, () => {
  const f = boot([owner]);
  try {
    const target = body(f.sim);
    f.player.data.lineHeadId = head.id;
    f.player.tether = { active: true, targetId: target.id };
    const events = hear(f.bus, event);
    if (owner === archiveRedaction) f.player.data.indexScanT = head.scanTimeS;
    if (owner === frontierHomesteads) {
      const joint = body(f.sim, {}, 210);
      target.data.weldTargetId = joint.id;
      target.data.weldT = head.weldTimeS;
    }
    if (owner === understoryGardens) target.data.sporeSkinTicks = Math.ceil(head.growS * 60);
    f.sim.step();
    assert.equal(events.length, 1);
    if (owner === vaelLiens) assert.ok(target.vel.x > 0);
    target.alive = false;
    f.sim.step();
    assert.equal(events.length, 1, 'dead target cannot receive another head action');
  } finally { f.sim.dispose(); }
});

test('an existing weld rides its joint and releases a recycled occupant without an equipped head', () => {
  const f = boot([frontierHomesteads]);
  try {
    const joint = body(f.sim, {}, 300);
    const cargo = body(f.sim, { weldedTo: joint.id, weldedGen: joint.occupantGeneration,
      weldOffset: { dx: 30, dz: 10 } });
    f.sim.step();
    assert.equal(cargo.pos.x, joint.pos.x + 30);
    assert.equal(cargo.pos.z, joint.pos.z + 10);
    joint.occupantGeneration += 1;
    f.sim.step();
    assert.equal(cargo.data.weldedTo, null);
  } finally { f.sim.dispose(); }
});

test('Survival retains censor pulses, page-drone motion, and orphaned redaction healing', () => {
  const f = boot([archiveRedaction]);
  try {
    const censor = body(f.sim, { censorFrigate: true }, 20, 'ship');
    const drone = body(f.sim, { pageDrone: true }, 3000, 'drone');
    const before = drone.pos.x;
    f.sim.step();
    assert.equal(f.player.data.redacted, true);
    assert.ok(drone.pos.x < before);
    censor.alive = false;
    f.sim.step();
    assert.equal(f.player.data.redacted, false);
    f.state.archive.redaction = null;
    f.player.data.enginesDark = true;
    f.sim.step();
    assert.equal(f.player.data.enginesDark, false);
  } finally { f.sim.dispose(); }
});

test('Survival heals a disappeared lien even on an otherwise untagged host', () => {
  const f = boot([vaelLiens]);
  try {
    f.player.data.lienMass = 5;
    f.player.mass += 5;
    f.sim.step();
    assert.equal(f.player.mass, 24);
    assert.equal(f.player.data.lienMass, 0);
    assert.ok(f.state.vael.invoices.some((r) => r.cause === 'anchor_lost'));
  } finally { f.sim.dispose(); }
});

test('Survival retains bodyless mark, invoice, lead and drop deadlines', () => {
  const f = boot();
  try {
    f.state.archive.marks.push({ id: 'retained-mark', kind: 'censor', at: 0, forgiveAt: 0 });
    f.state.vael.invoices.push({ id: 'retained-invoice', state: 'open', amount: 100,
      issuedAt: 0, dueAt: 0, nextWritAt: 1000 });
    f.state.frontier.leads.push({ id: 'retained-lead', kind: 'hungry', state: 'open',
      postedAt: 0, expiresAt: 0, steadId: 999, steadName: 'Absent stead' });
    f.state.understory.drops.push({ id: 'drop:1', kind: 'stash', state: 'open',
      postedAt: 0, expiresAt: 10, entityId: 999 });
    const before = f.state.vael.invoices[0].stage || 0;
    f.sim.step();
    assert.equal(f.state.archive.marks[0].forgiven, true);
    assert.ok(f.state.vael.invoices[0].stage > before);
    assert.equal(f.state.frontier.leads[0].state, 'soured');
    assert.equal(f.state.understory.drops[0].state, 'lost');
  } finally { f.sim.dispose(); }
});

test('Survival still retires expired field casts and orphaned raiders with no book rows', () => {
  const f = boot([archiveRedaction, frontierHomesteads]);
  try {
    const cast = body(f.sim, { archiveFieldCast: true, fieldUntil: -1 });
    const raider = body(f.sim, { frontierRaider: true, raidSteadId: 999 });
    raider.vel.x = 10;
    f.sim.step();
    assert.ok(!f.state.entities.has(cast.id) || cast.alive === false);
    assert.equal(raider.vel.x, 9.8);
    assert.ok(Number.isFinite(raider.data.orphanedAt));
  } finally { f.sim.dispose(); }
});

test('Survival retains actual reefs, orphan-cache cleanup, and quiet notice decay', () => {
  const f = boot([understoryGardens]);
  try {
    const garden = spawnGarden(f.state, f.sim.helpers, { x: 5000, z: 0, gardenId: 'retained-reef' });
    const orphan = body(f.sim, { understoryCacheId: 'missing-cache' });
    f.state.understory.notice = 0.1;
    f.sim.step();
    assert.ok(f.state.understory.gardens[garden.data.gardenId]);
    assert.equal(orphan.data.understoryResolved, true);
    assert.ok(f.state.understory.notice < 0.1);
  } finally { f.sim.dispose(); }
});

test('Survival retains either machine contract and bodyless permit expiry', () => {
  for (const data of [{ machineKind: 'measure' }, { machine: { kind: 'measure' } }]) {
    const f = boot([vergeCourt]);
    try {
      const machine = body(f.sim, data, 20, 'machine');
      f.sim.step();
      assert.equal(f.player.data.weighedBy, machine.id);
    } finally { f.sim.dispose(); }
  }
  const f = boot([vergeCourt]);
  try {
    const owner = f.sys('vergeCourt');
    const saved = owner.serialize();
    const tier = VERGE_PERMIT_TIERS.find((row) => row.tier === 1);
    saved.permit = { tier: tier.tier, tierId: tier.id, issuedAt: 0, expiresAt: 0,
      receiptId: 'retained-permit' };
    owner.deserialize(saved);
    f.bus.emit('save:loaded', {});
    const expired = hear(f.bus, 'verge:permitLapsed');
    f.sim.step();
    assert.equal(f.state.verge.permit, null, 'restored pending authority still expires without a machine');
    assert.equal(expired.length, 1);
    f.sim.step();
    assert.equal(expired.length, 1, 'the original expiry receipt remains once-only');
  } finally { f.sim.dispose(); }
});
