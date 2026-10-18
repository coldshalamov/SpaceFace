// RW-02 first slice — the towed lure as a glass signature.
//
// A hot towed payload must read on the glass as a signature (a scannable tell with a
// plain-words warning), not an invisible aggro switch. The authored seeker weights on
// the data row are the threshold contract the seeker owners will steer by.
import test from 'node:test';
import assert from 'node:assert/strict';

import { createSimulation, SIM_DT } from '../src/core/sim.js';
import { scanner } from '../src/systems/scanner.js';
import {
  ambushSignatures,
  activeAmbushSignatureTells,
} from '../src/systems/ambushSignatures.js';
import { ambushSignatureForShape } from '../src/data/ambushSignatures.js';
import { createBus } from '../src/core/eventBus.js';
import { weapons } from '../src/systems/weapons.js';
import { EIGHTH_BELL_RUNTIME } from '../src/systems/eighthBellRuntime.js';

const SECTOR_ID = 'sector_pallas_drift';
const ZONE_ID = 'zone_pallas_ambush';

function pendingLure(encounterId, center, radius = 420) {
  return {
    encounterId,
    shapeId: 'towed_lure',
    kind: 'towed_lure',
    script: 'ambush',
    sectorId: SECTOR_ID,
    zoneId: ZONE_ID,
    zoneName: 'Sker-Run Ambush',
    zoneCenter: center,
    zoneRadius: radius,
    dueAt: 1e9,
  };
}

function boot(seed = 4242) {
  const sim = createSimulation({ seed, systems: [scanner, ambushSignatures] });
  const { state, bus } = sim;
  state.mode = 'flight';
  state.input.actions = state.input.actions || {};
  state.world.currentSectorId = SECTOR_ID;
  state.world.activeSector = { id: SECTOR_ID, pois: [] };
  const player = sim.spawn({
    type: 'ship', team: 0, pos: { x: 0, z: 0 }, radius: 10,
    hull: 100, hullMax: 100, data: {},
  });
  state.playerId = player.id;
  state.encounterDirector = { pending: [pendingLure('lure-RW02', { x: 0, z: 0 })] };
  const log = { comms: [], scans: [], results: [] };
  bus.on('comms:log', (p) => log.comms.push(p));
  bus.on('ambushSignature:scanned', (p) => log.scans.push(p));
  bus.on('signal:scanResults', (p) => log.results.push(p));
  return { sim, state, bus, log, player, ambSys: sim.registry.get('ambushSignatures') };
}

function pulse(t) {
  t.state.input.actions.scanPulse = true;
  t.sim.runTicks(2);
}

function assertPlainWords(text, what) {
  assert.ok(text && text.length > 0, `${what} must speak`);
  assert.equal(/towed_lure/.test(text), false, `${what} must not leak the shape id`);
  assert.equal(/[a-z]+_[a-z]+/.test(text), false, `${what} must not leak snake_case ids: ${text}`);
  assert.equal(/[a-z][A-Z]/.test(text), false, `${what} must not leak camelCase: ${text}`);
}

test('RW-02: the towed lure is an authored glass signature with seeker weights', () => {
  const entry = ambushSignatureForShape('towed_lure');
  assert.ok(entry, 'towed lure signature must be authored in ambushSignatures data');
  assertPlainWords(entry.label, 'lure label');
  assertPlainWords(entry.hint, 'lure hint');
  assert.match(entry.hint, /towed bell lure/i, 'the hint names the lure in plain words');
  const weights = entry.targeting || {};
  assert.ok(Number.isFinite(weights.threshold), 'lure seeker threshold must be an authored number');
  assert.ok(weights.lure > weights.hull, 'a hot lure must outweigh the cold hull');
  assert.equal(entry.severable, true, 'the lure must be severable');
  assert.equal(entry.consumable, true, 'the lure must be consumable');

  const a = boot();
  a.ambSys.update(0.1, a.state);
  const tell = activeAmbushSignatureTells(a.state)[0];
  assert.ok(tell, 'a pending towed lure plants a passive tell');
  assert.equal(tell.label, entry.label, 'the tell reads as the signature, not a marker');

  const b = boot();
  b.ambSys.update(0.1, b.state);
  const again = activeAmbushSignatureTells(b.state)[0];
  assert.deepEqual(again.pos, tell.pos, 'seed 4242 plants the tell in the same water');
});

test('RW-02: a scan pulse resolves the lure note; a distant lure stays quiet', () => {
  const t = boot();
  t.ambSys.update(0.1, t.state);
  const tell = activeAmbushSignatureTells(t.state)[0];
  assert.ok(tell, 'a pending towed lure plants a passive tell');
  t.player.pos.x = tell.pos.x + 10;
  t.player.pos.z = tell.pos.z;

  pulse(t);
  assert.equal(t.log.scans.length, 1, 'one scan resolves the lure once');
  const warn = t.log.comms.find((c) => /towed bell lure/i.test(c.text));
  assert.ok(warn, 'the lure counterplay reaches the comms feed in plain words');
  assertPlainWords(warn.text, 'lure warning');
  const row = t.log.results[0].signals.find((r) => r.id === `signal:${tell.id}`);
  assert.ok(row, 'the lure keeps its row in the scan results');
  assert.equal(row.classification, tell.label.toUpperCase(), 'the resolved row names the signature');

  t.log.comms.length = 0;
  t.log.results.length = 0;
  t.state.encounterDirector.pending.push(
    pendingLure('lure-RW02-far', { x: 1600, z: 0 }, 100),
  );
  t.ambSys.update(0.1, t.state);
  t.state.input.actions.scanPulse = false;
  t.sim.runTicks(Math.ceil(8.1 / SIM_DT));
  pulse(t);
  const far = activeAmbushSignatureTells(t.state).find((r) => r.encounterId === 'lure-RW02-far');
  assert.ok(far, 'a second towed lure places its own tell');
  assert.equal(far.scanned, false, 'the out-of-range lure is not resolved by a distant pulse');
  assert.equal(t.log.comms.filter((c) => /towed bell lure/i.test(c.text)).length, 0,
    'no lure warning is spoken for a tell that was never scanned');
});

// RW-02 retry — the steering half. A hot payload towed on the player's Massline must
// re-acquire a homing seeker once its lure signature crosses the authored threshold,
// while the cold hull is ignored; a cold lure, a severed line, or a consumed payload
// returns acquisition to the hull. Uses the REAL weapons._steerHoming, not fakes.
const STEER_DT = 1 / 60;

function steerScene({ lureSignature = 1.0, tether = 'live', missileTarget = 'player' } = {}) {
  const player = {
    id: 1, type: 'ship', alive: true, team: 0, radius: 10,
    pos: { x: 0, z: 0 }, vel: { x: 0, z: 0 }, rot: 0,
    data: {},
  };
  // A towable hot body carrying its heat/noise signature in its own data — the honest
  // source the packet names. The bell's own runtime stamps this field when she tolls.
  const lure = {
    id: 7, type: 'beacon', alive: true, team: 2, radius: 12,
    pos: { x: 300, z: 200 }, vel: { x: 0, z: 0 }, rot: 0,
    data: { masslineTetherable: true, lureSignature },
  };
  // The seeker starts aimed at the hull's flank so one steering tick visibly turns it.
  const missile = {
    id: 20, type: 'projectile', alive: true, team: 1, ownerId: 2,
    pos: { x: 400, z: -100 }, vel: { x: -80, z: 0 }, rot: Math.PI,
    data: {
      kind: 'missile', ownerId: 2,
      targetId: missileTarget === 'player' ? player.id : lure.id,
      turnRate: 3.5, projSpeed: 80,
    },
  };
  const state = {
    mode: 'flight', playerId: player.id, tick: 120, simTime: 2, rng: () => 0.5,
    runtime: { features: {} },
    player: tether === 'live'
      ? { tether: { active: true, targetId: lure.id, phase: 'loaded' } }
      : { tether: { active: false, targetId: null, phase: 'slack' } },
    input: {},
    entities: new Map([[player.id, player], [lure.id, lure], [missile.id, missile]]),
    entityList: [player, lure, missile],
  };
  const bus = createBus();
  const host = Object.create(weapons);
  host.helpers = { getEntity: (id) => state.entities.get(id) };
  host.bus = bus;
  return { state, player, lure, missile, host };
}

function steerOnce(s) {
  s.host._steerHoming(STEER_DT, s.state);
}

function steerTicks(s, n) {
  for (let i = 0; i < n; i += 1) steerOnce(s);
}

function headingOf(missile) {
  return Math.atan2(missile.vel.z, missile.vel.x);
}

function bearingOf(missile, point) {
  return Math.atan2(point.z - missile.pos.z, point.x - missile.pos.x);
}

test('RW-02: a hot towed lure re-acquires a homing seeker off the cold hull', () => {
  const s = steerScene({ lureSignature: 1.0 });
  const before = headingOf(s.missile);
  steerOnce(s);
  assert.equal(s.missile.data.diverted, true, 'the hot lure must divert the seeker');
  assert.ok(s.missile.data.divertPos, 'the divert must name the lure water');
  assert.ok(Math.abs(s.missile.data.divertPos.x - s.lure.pos.x) < 1e-9, 'divert x rides the lure');
  assert.ok(Math.abs(s.missile.data.divertPos.z - s.lure.pos.z) < 1e-9, 'divert z rides the lure');
  // One tick only bends the heading by turnRate*dt; steer on so the separation is decisive.
  steerTicks(s, 30);
  const after = headingOf(s.missile);
  const wantLure = bearingOf(s.missile, s.lure.pos);
  const wantHull = bearingOf(s.missile, s.player.pos);
  const errLure = Math.abs(wantLure - after);
  const errHull = Math.abs(wantHull - after);
  const errLureBefore = Math.abs(wantLure - before);
  assert.ok(errLure < errLureBefore, 'steering must close on the lure bearing');
  assert.ok(errLure < errHull, 'the seeker must end nearer the lure than the hull');
});

test('RW-02: a cold lure holds no seeker — the hull keeps the missile', () => {
  const s = steerScene({ lureSignature: 0.2 });
  steerOnce(s);
  assert.equal(s.missile.data.diverted ?? false, false, 'below threshold the lure must not divert');
  assert.equal(s.missile.data.lureDiverted ?? false, false, 'no lure claim below threshold');
});

test('RW-02: severing the line returns acquisition to the hull', () => {
  const s = steerScene({ lureSignature: 1.0 });
  steerOnce(s);
  assert.equal(s.missile.data.diverted, true, 'hot lure diverts first');
  // The cut: tetherGameplay mirrors active:false and drops the target.
  s.state.player.tether = { active: false, targetId: null, phase: 'slack' };
  steerOnce(s);
  assert.equal(s.missile.data.diverted ?? false, false, 'a severed line releases the seeker');
  const after = Math.atan2(s.missile.vel.z, s.missile.vel.x);
  const wantHull = Math.atan2(s.player.pos.z - s.missile.pos.z, s.player.pos.x - s.missile.pos.x);
  assert.ok(Math.abs(wantHull - after) < Math.abs(wantHull - Math.PI),
    'the released seeker turns back onto the hull');
});

test('RW-02: a consumed payload returns acquisition to the hull', () => {
  const s = steerScene({ lureSignature: 1.0 });
  steerOnce(s);
  assert.equal(s.missile.data.diverted, true, 'hot lure diverts first');
  s.lure.alive = false;
  steerOnce(s);
  assert.equal(s.missile.data.diverted ?? false, false, 'a destroyed lure releases the seeker');
});

test('RW-02: no lure towed — seeker steering is unchanged', () => {
  const plain = steerScene({ tether: 'none' });
  steerOnce(plain);
  assert.equal(plain.missile.data.diverted ?? false, false, 'no tether means no divert');
  assert.equal(plain.missile.data.lureDiverted ?? false, false, 'no tether means no lure claim');
  const cold = steerScene({ lureSignature: 0.0 });
  steerOnce(cold);
  assert.deepEqual(
    { x: cold.missile.vel.x, z: cold.missile.vel.z },
    { x: plain.missile.vel.x, z: plain.missile.vel.z },
    'a cold towed body steers exactly like no tow at all',
  );
});

// RW-02 retry — the honest source. The bell's own runtime stamps the lure signature on
// the towed body's data: cold at launch, hot on every peal, cooling below the authored
// threshold when she goes quiet. Minimal fake lane harness driving the REAL runtime.
function bellHarness() {
  let now = 100;
  let nextId = 101;
  const entities = new Map();
  const state = {
    mode: 'flight', playerId: 1, tick: 6000, simTime: now,
    story: { flags: {} },
    entities,
    world: {
      activeSector: {
        stations: [{ id: 'station_depot3', name: 'Depot', pos: { x: 700, z: 900 } }],
        pois: [{ poiId: 'poi_vesta_resonant_cathedral', type: 'anomaly', pos: { x: -330, z: 1060 } }],
      },
    },
  };
  const mk = (spec) => {
    const e = {
      id: nextId++, alive: true,
      type: spec.type || 'ship', team: spec.team ?? 2,
      pos: { ...(spec.pos || { x: 0, z: 0 }) }, vel: { x: 0, z: 0 }, rot: 0,
      radius: spec.radius || 8, mass: spec.mass || 60,
      hull: 100, hullMax: 100,
      data: { ...(spec.data || {}) },
    };
    entities.set(e.id, e);
    return e;
  };
  const live = {
    id: 'bell-rw02', shapeId: 'the_eighth_bell', sectorId: 'sector_vesta_forge',
    anchor: { x: 0, z: 0 }, plan: {}, vars: {}, ids: [], roles: {}, phase: 'offer',
    shape: { primaryLine: 'line', choices: [], timeoutChoice: 'pass' },
  };
  const d = {
    now: () => now,
    setNow: (t) => { now = t; state.simTime = t; },
    abort: (l, reason) => { l.phase = 'aborted'; l.vars.abortReason = reason; },
    say: () => {},
    emit: () => {},
    offerChoices: () => {},
    spawnShips: (l, plans) => plans.map((p) => {
      const e = mk({ ...(p.entitySpec || {}), team: p.team ?? 2, pos: p.pos || { x: 0, z: 0 } });
      l.ids.push(e.id);
      l.roles[e.id] = p.role || 'ship';
      return e;
    }),
    entsOf: (l, role) => l.ids.map((id) => entities.get(id))
      .filter((e) => e && (!role || l.roles[e.id] === role)),
    spawnProp: (l, spec) => {
      const e = mk({ ...spec, data: {} });
      l.ids.push(e.id);
      return e;
    },
    dangerImpulse: () => {},
    grant: () => {},
    rep: () => {},
    charge: () => {},
    resolve: (l, outcome, detail) => { l.phase = 'done'; l.vars.outcome = outcome; Object.assign(l.vars, detail && detail.vars); },
  };
  return { d, state, live, entities };
}

test('RW-02: a chaff steal survives the lure release — the lure never fights it', () => {
  const s = steerScene({ lureSignature: 1.0 });
  steerOnce(s);
  assert.equal(s.missile.data.diverted, true, 'hot lure diverts first');
  assert.equal(s.missile.data.lureDiverted, true, 'the claim is marked as the lure’s own');
  // Countermeasures answers with chaff: targetId is rewritten to the cloud, divert repointed.
  s.missile.data.targetId = 'cm_decoy_1_2000';
  s.missile.data.divertPos = { x: -50, z: -50 };
  // The line is cut while chaff holds the round.
  s.state.player.tether = { active: false, targetId: null, phase: 'slack' };
  steerOnce(s);
  assert.equal(s.missile.data.lureDiverted, false, 'the lure drops its claim');
  assert.equal(s.missile.data.diverted, true, 'chaff’s divert survives the lure release');
  assert.deepEqual(s.missile.data.divertPos, { x: -50, z: -50 }, 'the cloud fix is untouched');
});

test('RW-02: the bell launches cold, rings hot, and cools below threshold when quiet', () => {
  const { d, state, live } = bellHarness();
  EIGHTH_BELL_RUNTIME.fire(d, live, state);
  assert.equal(live.phase, 'offer', 'the bell must still launch');
  const bell = live.ids.map((id) => state.entities.get(id))
    .find((e) => e && live.roles[e.id] === 'bell');
  assert.ok(bell, 'the bell body must exist');
  assert.equal(bell.data.lureSignature, 0, 'she launches cold — no free decoy');
  assert.equal(bell.data.masslineTetherable, true, 'the signature rides the towable body');

  // Tow her fast: above toll speed she peals, and the peal makes her hot.
  live.phase = 'towing';
  live.vars.towingSince = d.now();
  live.deadlineAt = 0;
  bell.vel.x = 90;
  EIGHTH_BELL_RUNTIME.tick(d, live, state, d.now());
  assert.equal(live.vars.tolls, 1, 'a fast tow tolls');
  assert.equal(bell.data.lureSignature, 1.0, 'the peal makes her hot');
  assert.ok(bell.data.lureSignature >= 0.6, 'hot clears the authored seeker threshold');

  // Quiet for longer than the hot window: the signature cools below threshold.
  const tolledAt = live.vars.lastTollAt;
  bell.vel.x = 0;
  bell.pos.x = 0; bell.pos.z = 0;
  d.setNow(tolledAt + 13);
  EIGHTH_BELL_RUNTIME.tick(d, live, state, d.now());
  assert.equal(bell.data.lureSignature, 0, 'a quiet tow cools below threshold');
});
