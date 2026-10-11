// M16 Build your own escape: a watched dead-drop cache, one loose slag hulk that is the only
// anchor out there, and a broker at the rendezvous. Prepare, take, escape. Seed 4242.
import assert from 'node:assert/strict';
import test from 'node:test';

import { createSimulation } from '../src/core/sim.js';
import { spawnBudget } from '../src/systems/spawnBudget.js';
import { encounterDirector } from '../src/systems/encounterDirector.js';
import { ENCOUNTERS } from '../src/data/encounters.js';
import { isAttachable } from '../src/systems/tetherGameplay.js';
import { ensurePhysicsBodySpec, isDynamicPhysicsBodyEntity } from '../src/core/physicsAuthority.js';
import { MASS_ANCHOR_RATIO, couplingBodyMass, resolveMassInterpretation } from '../src/ui/masslineHud.js';
import { getDerivedStats } from '../src/systems/ships.js';
import { towClassMassFor, underwayTowSpeed } from '../src/systems/shipCapabilities.js';
import { isHostileForAI } from '../src/ai/engagementAuthority.js';
import { physics } from '../src/core/physics.js';
import { combat } from '../src/systems/combat.js';
import { queuePhysicsImpulse } from '../src/core/physicsAuthority.js';
import { PRODUCTION_FEATURES } from '../src/runtime/runtimeProfiles.js';
import { SIM_DT } from '../src/core/sim.js';

const SEED = 4242;
const SECTOR = 'sector_tethys_junction';
const ANCHOR = Object.freeze({ x: 6000, z: 6000 });
const SHAPE = 'build_your_own_escape';
const COMMODITY = 'cmdty_stolen_goods';

function makeHarness(seed = SEED) {
  const sim = createSimulation({ seed, systems: [spawnBudget, encounterDirector] });
  const { state, bus } = sim;
  state.mode = 'flight';
  state.world.currentSectorId = SECTOR;
  const player = sim.spawn({
    type: 'ship', team: 0, pos: { x: ANCHOR.x + 200, z: ANCHOR.z + 100 }, vel: { x: 0, z: 0 },
    hull: 400, hullMax: 400, radius: 6, mass: 35,
  });
  state.playerId = player.id;
  state.player = state.player || {};
  state.player.cargo = { items: {}, usedVolume: 0, usedMass: 0, capVolume: 100, capMass: 100 };
  const events = [];
  bus.on('encounter:resolved', (p) => events.push({ name: 'resolved', payload: p }));
  bus.on('economy:grantCredits', (p) => events.push({ name: 'grant', payload: p }));
  bus.on('faction:repDelta', (p) => events.push({ name: 'repDelta', payload: p }));
  bus.on('encounter:voice', (p) => events.push({ name: 'voice', payload: p }));
  return { sim, state, bus, player, events };
}

function fire(h) {
  const res = h.sim.registry.get('encounterDirector').requestAuthoredEncounter({
    shapeId: SHAPE, encounterId: 'test_m16', sectorId: SECTOR, anchor: { ...ANCHOR },
    zoneType: 'outlaw_zone', zoneRadius: 600, force: true,
  });
  assert.equal(res.ok, true, `fire must succeed: ${JSON.stringify(res)}`);
  const live = Object.values(h.state.encounterDirector.live).find((l) => l.shapeId === SHAPE);
  assert.ok(live, 'the encounter is live');
  return live;
}

const escOf = (live) => live.data.escape;
const ent = (h, id) => h.state.entities.get(id);
const grants = (h) => h.events.filter((e) => e.name === 'grant').map((e) => e.payload.amount);
const resolved = (h) => h.events.filter((e) => e.name === 'resolved').map((e) => e.payload.outcome);
const said = (h) => h.events.filter((e) => e.name === 'voice').map((e) => e.payload.text);
const reps = (h) => h.events.filter((e) => e.name === 'repDelta').map((e) => [e.payload.factionId, e.payload.delta]);
const raidersOf = (h, live) => live.ids.map((id) => ent(h, id)).filter((e) => e && e.data?.ai?.encounterRole === 'raider');
const brokerOf = (h, live) => live.ids.map((id) => ent(h, id)).find((e) => e && e.data?.ai?.encounterRole === 'broker');

function takeCache(h, live) {
  const e = escOf(live);
  const cache = ent(h, e.cacheId);
  cache.alive = false;
  h.state.player.cargo.items[COMMODITY] = (h.state.player.cargo.items[COMMODITY] || 0) + 6;
  h.sim.runTicks(8);
}

function moveHulk(h, live, wu) {
  const e = escOf(live);
  const hulk = ent(h, e.hulkId);
  hulk.pos.x = e.hulkSpawn.x + wu;
  hulk.pos.z = e.hulkSpawn.z;
}

test('build_your_own_escape is a registered outlaw-zone combat minor with the settled trigger', () => {
  const enc = ENCOUNTERS[SHAPE];
  assert.ok(enc, 'the shape is in the shipped catalog');
  assert.deepEqual(
    { tier: enc.tier, deck: enc.deck, weight: enc.weight, zones: [...enc.zoneTypes], script: enc.script,
      cost: enc.pressureCost, cooldown: enc.cooldownS, proximity: enc.proximity, verbs: [...enc.verbs] },
    { tier: 'minor', deck: 'combat', weight: 1.1, zones: ['outlaw_zone'], script: 'selfRegistered', cost: 22,
      cooldown: 1200, proximity: true, verbs: ['latch', 'tow', 'sling', 'escape'] });
});

test('fire casts the watched cache, the loose hulk and the broker with their labels, and no pursuers yet', () => {
  const h = makeHarness();
  const live = fire(h);
  const e = escOf(live);
  const cache = ent(h, e.cacheId);
  const hulk = ent(h, e.hulkId);
  const broker = brokerOf(h, live);
  assert.equal(cache.data.scanLabel, 'DEAD-DROP CACHE — WATCHED');
  assert.equal(cache.data.commodityId, COMMODITY);
  assert.equal(cache.data.amount, 6);
  assert.equal(hulk.data.scanLabel, 'LOOSE SLAG HULK — THE ONLY ANCHOR OUT HERE');
  assert.equal(broker.data.scanLabel, 'BROKER — RENDEZVOUS');
  assert.equal(broker.data.ai.passive, true);
  assert.equal(raidersOf(h, live).length, 0, 'no pursuers until the cache moves');
  const dBroker = Math.hypot(broker.pos.x - cache.pos.x, broker.pos.z - cache.pos.z);
  assert.ok(Math.abs(dBroker - 1600) < 5, `broker ${dBroker.toFixed(0)} WU from the cache`);
  const line = { x: (broker.pos.x - cache.pos.x) / dBroker, z: (broker.pos.z - cache.pos.z) / dBroker };
  const rel = { x: hulk.pos.x - cache.pos.x, z: hulk.pos.z - cache.pos.z };
  const off = Math.abs(rel.x * -line.z + rel.z * line.x);
  assert.ok(off > 350 && off < 450, `the hulk sits ${off.toFixed(0)} WU off the escape line`);
  assert.ok(said(h)[0].includes('Your call where it sits.'), 'the broker names the cache, the Reach watch and the anchor');
  assert.match(said(h)[0], /Reach crew is watching/);
});

test('the hulk is dynamic, latchable, an ANCHOR for the starter hull and still towable with effort', () => {
  const h = makeHarness();
  const live = fire(h);
  const hulk = ent(h, escOf(live).hulkId);
  const body = ensurePhysicsBodySpec(hulk);
  assert.equal(body.dynamic, true);
  assert.equal(body.mass, 180);
  assert.equal(isDynamicPhysicsBodyEntity(hulk), true);
  assert.equal(isAttachable(hulk, h.state.playerId, h.state), true, 'the Massline offers it');
  const player = h.state.player;
  const owned = { defId: 'ship_kestrel', fittings: ['wpn_pulse_laser_s', 'mod_shield_booster_s', 'mod_engine_ion_m', null, 'mod_mining_laser_s', 'mod_drill_amp', null] };
  const derived = getDerivedStats(owned.defId, owned.fittings, player);
  const hullMass = derived.operationalMass || derived.mass;
  const read = resolveMassInterpretation(hullMass, couplingBodyMass(hulk));
  assert.equal(read.short, 'ANCHOR', 'the latch pill reads ANCHOR for a starter hull');
  assert.ok(couplingBodyMass(hulk) >= hullMass * MASS_ANCHOR_RATIO * 1.5, 'well above the 3x read');
  assert.ok(couplingBodyMass(hulk) < 1e5, 'never the immovable 1e6');
  const underway = underwayTowSpeed(derived, couplingBodyMass(hulk));
  assert.ok(underway > 15, `it can be put under way (${underway.toFixed(1)} WU/s)`);
  assert.ok(underway < underwayTowSpeed(derived, towClassMassFor(derived)), 'and it takes more effort than a tow-class load');
});

test('taking the cache spawns three raiders exactly once, far from the rendezvous and hostile to the player', () => {
  const h = makeHarness();
  const live = fire(h);
  takeCache(h, live);
  const raiders = raidersOf(h, live);
  assert.equal(raiders.length, 3);
  assert.ok(said(h).some((t) => t.includes('REACH: That cache is ours. Burn him.')));
  const broker = brokerOf(h, live);
  for (const r of raiders) {
    const range = Math.hypot(r.pos.x - h.player.pos.x, r.pos.z - h.player.pos.z);
    assert.ok(range > 850 && range < 1250, `raider ${range.toFixed(0)} WU out`);
    assert.ok(Math.hypot(r.pos.x - broker.pos.x, r.pos.z - broker.pos.z) > Math.hypot(h.player.pos.x - broker.pos.x, h.player.pos.z - broker.pos.z),
      'on the far side from the rendezvous');
    assert.equal(isHostileForAI(h.state, r, h.player), true);
  }
  h.sim.runTicks(120);
  assert.equal(raidersOf(h, live).length, 3, 'never a second wave');
});

test('a budget-denied pursuit retries and then arrives', () => {
  const h = makeHarness();
  const live = fire(h);
  const budget = h.sim.registry.get('encounterDirector').helpers.spawnBudget;
  const realRequest = budget.request.bind(budget);
  let deny = true;
  budget.request = (...args) => (deny ? 0 : realRequest(...args));
  takeCache(h, live);
  assert.equal(raidersOf(h, live).length, 0, 'denied');
  deny = false;
  h.sim.runTicks(180);
  assert.equal(raidersOf(h, live).length, 3, 'the retry brought them');
});

test('delivered with preparation pays 600; without it 450; each exactly once', () => {
  const prepared = makeHarness();
  const liveA = fire(prepared);
  moveHulk(prepared, liveA, 300);
  takeCache(prepared, liveA);
  const brokerA = brokerOf(prepared, liveA);
  prepared.player.pos.x = brokerA.pos.x + 60;
  prepared.player.pos.z = brokerA.pos.z;
  prepared.sim.runTicks(60);
  prepared.sim.runTicks(60);
  assert.deepEqual(grants(prepared), [600]);
  assert.deepEqual(resolved(prepared), ['delivered']);
  assert.ok(reps(prepared).some(([f, d]) => f === 'faction_quiet' && d === 4));
  assert.equal(prepared.state.player.cargo.items[COMMODITY], undefined, 'the cache changes hands');

  const bare = makeHarness();
  const liveB = fire(bare);
  moveHulk(bare, liveB, 100);
  takeCache(bare, liveB);
  const brokerB = brokerOf(bare, liveB);
  bare.player.pos.x = brokerB.pos.x + 60;
  bare.player.pos.z = brokerB.pos.z;
  bare.sim.runTicks(120);
  assert.deepEqual(grants(bare), [450]);
});

test('a lost anchor is not replaced: a hulk destroyed in setup leaves the base pay available', () => {
  const h = makeHarness();
  const live = fire(h);
  const hulk = ent(h, escOf(live).hulkId);
  hulk.alive = false;
  h.sim.runTicks(30);
  assert.equal(live.data.escape.settled, false);
  takeCache(h, live);
  assert.equal(live.data.escape.prepMoved, false);
  const broker = brokerOf(h, live);
  h.player.pos.x = broker.pos.x + 50;
  h.player.pos.z = broker.pos.z;
  h.sim.runTicks(120);
  assert.deepEqual(grants(h), [450]);
});

test('bait: dumping the cache pays nothing, costs standing and ends the pursuit pressure', () => {
  const h = makeHarness();
  const live = fire(h);
  takeCache(h, live);
  assert.equal(raidersOf(h, live).length, 3);
  delete h.state.player.cargo.items[COMMODITY];
  h.sim.runTicks(120);
  assert.deepEqual(resolved(h), ['bait']);
  assert.deepEqual(grants(h), []);
  assert.ok(reps(h).some(([f, d]) => f === 'faction_quiet' && d === -2));
  for (const r of raidersOf(h, live)) assert.ok(Number.isFinite(r.data.despawnAt), 'the raiders are leaving');
});

test('lapsed: the deadline passes before the pickup and nothing is paid', () => {
  const h = makeHarness();
  const live = fire(h);
  h.state.simTime += 301;
  h.sim.runTicks(60);
  assert.deepEqual(resolved(h), ['lapsed']);
  assert.deepEqual(grants(h), []);
});

test('lost: the player dying, or the cache destroyed, pays nothing', () => {
  const dead = makeHarness();
  const liveA = fire(dead);
  takeCache(dead, liveA);
  dead.player.alive = false;
  dead.sim.runTicks(60);
  assert.deepEqual(resolved(dead), ['lost']);
  assert.deepEqual(grants(dead), []);

  const smashed = makeHarness();
  const liveB = fire(smashed);
  ent(smashed, escOf(liveB).cacheId).alive = false;
  smashed.sim.runTicks(240);
  assert.deepEqual(resolved(smashed), ['lost']);
  assert.deepEqual(grants(smashed), []);
});

test('raiders still flying after a delivery stay ordinary hostiles', () => {
  const h = makeHarness();
  const live = fire(h);
  takeCache(h, live);
  const broker = brokerOf(h, live);
  h.player.pos.x = broker.pos.x + 40;
  h.player.pos.z = broker.pos.z;
  h.sim.runTicks(120);
  assert.deepEqual(resolved(h), ['delivered']);
  for (const r of raidersOf(h, live)) assert.equal(r.data.despawnAt, undefined);
});

test('same seed twice gives the same layout and the same outcome', () => {
  const run = () => {
    const h = makeHarness();
    const live = fire(h);
    const e = escOf(live);
    const sig = [e.cachePos, e.hulkSpawn, e.brokerPos];
    moveHulk(h, live, 260);
    takeCache(h, live);
    const broker = brokerOf(h, live);
    h.player.pos.x = broker.pos.x + 40;
    h.player.pos.z = broker.pos.z;
    h.sim.runTicks(120);
    return JSON.stringify({ sig, grants: grants(h), resolved: resolved(h) });
  };
  assert.equal(run(), run());
});

test('the native rapier body honors the hulk authored mass (an impulse moves it like 180 t, not 1e6)', async () => {
  const sim = createSimulation({
    seed: SEED, systems: [spawnBudget, encounterDirector, physics, combat], updateOrder: [spawnBudget, encounterDirector, physics, combat],
    runtimeConfig: { profileId: 'production', features: PRODUCTION_FEATURES },
  });
  const { state } = sim;
  state.mode = 'flight';
  state.world.currentSectorId = SECTOR;
  state.settings.gameplay.physicsBackend = 'rapier-dynamic';
  const physicsSystem = sim.registry.get('physics');
  try {
    assert.equal(await physicsSystem.prepareBackend(state), true);
    const player = sim.spawn({ type: 'ship', team: 0, pos: { x: ANCHOR.x + 200, z: ANCHOR.z + 100 }, hull: 400, hullMax: 400, radius: 6, mass: 35 });
    state.playerId = player.id;
    const res = sim.registry.get('encounterDirector').requestAuthoredEncounter({
      shapeId: SHAPE, encounterId: 'test_m16_native', sectorId: SECTOR, anchor: { ...ANCHOR },
      zoneType: 'outlaw_zone', zoneRadius: 600, force: true,
    });
    assert.equal(res.ok, true);
    const live = Object.values(state.encounterDirector.live).find((l) => l.shapeId === SHAPE);
    const hulk = state.entities.get(live.data.escape.hulkId);
    for (let i = 0; i < 4; i++) sim.step(SIM_DT);
    const before = hulk.vel.x;
    queuePhysicsImpulse(hulk, { x: 1800, y: 0, z: 0 }, { provenance: 'probe', tick: state.tick, kind: 'probe' });
    for (let i = 0; i < 4; i++) sim.step(SIM_DT);
    const dv = hulk.vel.x - before;
    assert.ok(dv > 8 && dv < 12, `1800 N-s on a 180 t body is ~10 WU/s, not ~0.002 (dv ${dv.toFixed(4)})`);
  } finally {
    if (typeof physicsSystem._disableSg02DynamicAuthority === 'function') physicsSystem._disableSg02DynamicAuthority();
    sim.dispose();
  }
});
