// SWARM-07 B2 follow-up — every family that authors a telegraph now SPEAKS it at its real
// attack-language beat, once per instance, never per tick.
//
// The subscriber landed first (swarm-brood-voice.test.mjs: survivalAnnounce rate-limits each
// family's authored line onto the alert lane), but only the burrower lineage, the brood
// mother and the splitter ever emitted. This file pins the emit side: the spitter's glob
// windup, the charger's committed pass, the leecher's latch, the prime families' armed
// fuse (lantern cyst / remora / ash wisp), the bellows' swell, and the hazard grip
// (spore drift / undertow) each carry their authored {bark,line,cue} verbatim.
// Families with no real transition stay silent — the mite's dive is the flock itself, the
// glassback/keelback shells are standing armor, and the wake eel's authored wrap has no
// live state behind it — and a family whose def carries no authored line emits nothing.

import test from 'node:test';
import assert from 'node:assert/strict';

import { createBus } from '../src/core/eventBus.js';
import { createGameState } from '../src/core/gameState.js';
import { createRunState } from '../src/core/runState.js';
import { survivalAnnounce } from '../src/systems/survivalAnnounce.js';
import {
  createBroodEngine,
  BROOD_ATTACK_ARRIVAL_S,
  BROOD_PHASE_WINDUP,
  BROOD_PHASE_LATCHED,
} from '../src/systems/swarmBrood.js';
import {
  BROOD_SPITTER_COOLDOWN_S,
  SWARM_BROOD_FAMILIES,
  SWARM_BROOD_MAX,
  swarmBroodFamily,
} from '../src/data/swarmBrood.js';
import {
  SWARM_BROOD_LATE_FAMILIES,
  swarmBroodLateFamily,
} from '../src/data/swarmBroodLate.js';

const SEED = 4242;
const DT = 1 / 60;
const ALL_DEFS = SWARM_BROOD_FAMILIES.concat(SWARM_BROOD_LATE_FAMILIES);

function boot({ wave = 12, rock = true } = {}) {
  const state = createGameState(SEED);
  const raw = createBus();
  const emitted = [];
  const bus = {
    on: raw.on.bind(raw),
    off: raw.off.bind(raw),
    once: raw.once.bind(raw),
    emit(event, payload) { emitted.push({ event, payload }); raw.emit(event, payload); },
  };
  const player = {
    id: state.nextEntityId++, alive: true, type: 'ship', pos: { x: 0, z: 0 },
    vel: { x: 0, z: 0 }, radius: 6, mass: 400, hull: 200, hullMax: 200,
  };
  state.entities.set(player.id, player);
  state.entityList.push(player);
  state.playerId = player.id;
  const rocks = [];
  if (rock) {
    const r = {
      id: state.nextEntityId++, alive: true, type: 'asteroid', collides: true,
      pos: { x: 500, z: 0 }, vel: { x: 0, z: 0 }, radius: 18, mass: 99999,
    };
    state.entities.set(r.id, r);
    state.entityList.push(r);
    rocks.push(r);
  }
  state.entityIndex = {
    __spacefaceEntityIndexV1: true, ready: true,
    shipLike: [player], asteroids: rocks,
  };
  state.run = createRunState({ kind: 'survival', ruleset: 'swarm', seed: SEED });
  state.run.phase = 'active';
  state.run.wave = wave;
  state.mode = 'flight';
  state.player = state.player || { tether: null };
  return { state, bus, emitted, player, rock: rocks[0] || null };
}

function makeEngine(h) {
  return createBroodEngine({
    bus: h.bus,
    getState: () => h.state,
    fieldList: () => null,
    routeDamage: () => ({ ok: true }),
  });
}

function stepTicks(engine, state, n) {
  for (let t = 0; t < n; t++) {
    state.simTime += DT;
    state.tick = (state.tick || 0) + 1;
    engine.step(state);
  }
}

/** The first live cell of the named family (works for base and late families). */
function familySlot(engine, familyId) {
  const idx = engine._bodies.liveFamilyId.indexOf(familyId);
  if (idx < 0) return -1;
  for (let i = 0; i < SWARM_BROOD_MAX; i++) {
    if (engine._bodies.alive[i] && engine._bodies.family[i] === idx) return i;
  }
  return -1;
}

function telegraphs(h, familyId) {
  return h.emitted.filter((e) => e.event === 'swarm:broodTelegraph'
    && (!familyId || e.payload.familyId === familyId));
}

function authored(familyId) {
  const fam = swarmBroodLateFamily(familyId) || swarmBroodFamily(familyId);
  return fam.telegraph;
}

function assertVerbatim(tell, familyId) {
  const tele = authored(familyId);
  assert.equal(tell.bark, tele.bark, `${familyId} bark verbatim`);
  assert.equal(tell.line, tele.line, `${familyId} line verbatim`);
  assert.equal(tell.cue, tele.cue, `${familyId} cue verbatim`);
  assert.ok(tell.pos && Number.isFinite(tell.pos.x) && Number.isFinite(tell.pos.z),
    `${familyId} tell carries the cell position`);
}

/** Spawn a wave, return { engine, i } — the first live cell of familyId. */
function fielded(h, familyId, wave) {
  const engine = makeEngine(h);
  engine.prepareWave(h.state.run, wave);
  engine.spawnWave(h.state);
  const i = familySlot(engine, familyId);
  assert.ok(i >= 0, `wave ${wave} fields ${familyId}`);
  return { engine, i };
}

test('spitter: the glob windup speaks once, then each fresh windup speaks again', () => {
  const h = boot({ wave: 3 });
  const { engine, i } = fielded(h, 'spitter', 3);
  for (let k = 0; k < SWARM_BROOD_MAX; k++) {
    if (engine._bodies.alive[k] && k !== i) engine._killDirectForTest(k, 'terrain');
  }
  h.state.simTime += BROOD_ATTACK_ARRIVAL_S;
  engine._bodies.px[i] = 80;
  engine._bodies.pz[i] = 0;
  stepTicks(engine, h.state, 1);
  assert.equal(engine._bodies.phase[i], BROOD_PHASE_WINDUP, 'the windup armed');
  assert.equal(telegraphs(h, 'spitter').length, 1, 'one tell per windup');
  assertVerbatim(telegraphs(h, 'spitter')[0].payload, 'spitter');
  // The whole windup plus the lob is still the same instance — no per-tick chorus.
  stepTicks(engine, h.state, 60);
  assert.equal(telegraphs(h, 'spitter').length, 1, 'the windup is one tell, not a stream');
  // Cooldown spent, still in range: the NEXT windup is a new instance and speaks again.
  // The cell is pinned inside lob range so the sim's own drift cannot end the probe early.
  for (let t = 0; t < Math.ceil((BROOD_SPITTER_COOLDOWN_S + 1) / DT); t++) {
    engine._bodies.px[i] = 200;
    engine._bodies.pz[i] = 0;
    h.state.simTime += DT;
    h.state.tick = (h.state.tick || 0) + 1;
    engine.step(h.state);
    if (!engine._bodies.alive[i]) break;
  }
  assert.ok(engine._bodies.alive[i], 'the spitter survives its own probe');
  assert.equal(telegraphs(h, 'spitter').length, 2, 'each windup instance gets its own tell');
});

test('charger: the committed pass is announced at the line, once', () => {
  const h = boot({ wave: 7 });
  const { engine, i } = fielded(h, 'charger', 7);
  for (let k = 0; k < SWARM_BROOD_MAX; k++) {
    if (engine._bodies.alive[k] && k !== i) engine._killDirectForTest(k, 'terrain');
  }
  h.state.simTime += BROOD_ATTACK_ARRIVAL_S;
  engine._bodies.px[i] = 250;
  engine._bodies.pz[i] = 0;
  stepTicks(engine, h.state, 1);
  assert.equal(engine._bodies.phase[i], BROOD_PHASE_WINDUP, 'the line drew');
  assert.equal(telegraphs(h, 'charger').length, 1, 'one tell at the commit');
  assertVerbatim(telegraphs(h, 'charger')[0].payload, 'charger');
  // Windup, dash, recover — one instance, one tell.
  stepTicks(engine, h.state, 90);
  assert.equal(telegraphs(h, 'charger').length, 1, 'the pass never repeats its tell');
});

test('leecher: the latch speaks the drag the pilot now owns, once', () => {
  const h = boot({ wave: 11 });
  const { engine, i } = fielded(h, 'leecher', 11);
  for (let k = 0; k < SWARM_BROOD_MAX; k++) {
    if (engine._bodies.alive[k] && k !== i) engine._killDirectForTest(k, 'terrain');
  }
  engine._bodies.px[i] = 8;
  engine._bodies.pz[i] = 0;
  h.player.vel.x = 40;
  stepTicks(engine, h.state, 1);
  assert.equal(engine._bodies.phase[i], BROOD_PHASE_LATCHED, 'the latch landed');
  assert.equal(telegraphs(h, 'leecher').length, 1, 'one tell at the latch');
  assertVerbatim(telegraphs(h, 'leecher')[0].payload, 'leecher');
  stepTicks(engine, h.state, 30);
  assert.equal(telegraphs(h, 'leecher').length, 1, 'riding the hull adds no chorus');
});

test('lantern cyst: the armed prime speaks once per approach, and a fresh approach re-arms it', () => {
  const h = boot({ wave: 9 });
  const { engine, i } = fielded(h, 'lantern_cyst', 9);
  engine._bodies.px[i] = 50;
  engine._bodies.pz[i] = 0;
  stepTicks(engine, h.state, 2);
  assert.equal(telegraphs(h, 'lantern_cyst').length, 1, 'the glow speaks as the fuse arms');
  assertVerbatim(telegraphs(h, 'lantern_cyst')[0].payload, 'lantern_cyst');
  stepTicks(engine, h.state, 15);
  assert.equal(telegraphs(h, 'lantern_cyst').length, 1, 'a held prime is one tell');
  // Out of range the fuse drops; closing again is a NEW telegraph instance.
  engine._bodies.px[i] = 400;
  stepTicks(engine, h.state, 2);
  engine._bodies.px[i] = 50;
  stepTicks(engine, h.state, 2);
  assert.equal(telegraphs(h, 'lantern_cyst').length, 2, 'a fresh approach speaks again');
});

test('bellows: the first strike speaks the swell, the detonation adds nothing', () => {
  const h = boot({ wave: 17 });
  const { engine, i } = fielded(h, 'bellows', 17);
  engine._killDirectForTest(i, 'direct');
  assert.equal(telegraphs(h, 'bellows').length, 1, 'the swell is the tell');
  assertVerbatim(telegraphs(h, 'bellows')[0].payload, 'bellows');
  engine._killDirectForTest(i, 'direct');
  assert.equal(telegraphs(h, 'bellows').length, 1, 'the burst itself stays silent');
});

test('prime band: remora and ash wisp speak their armed fuses', () => {
  const h = boot({ wave: 43 });
  const { engine, i: remora } = fielded(h, 'remora', 43);
  engine._bodies.px[remora] = 40;
  engine._bodies.pz[remora] = 0;
  stepTicks(engine, h.state, 2);
  assert.equal(telegraphs(h, 'remora').length, 1, 'the remora winding up astern speaks');
  assertVerbatim(telegraphs(h, 'remora')[0].payload, 'remora');

  const wisp = familySlot(engine, 'ashwisp');
  assert.ok(wisp >= 0, 'wave 43 fields the ash wisp');
  engine._bodies.px[wisp] = 50;
  engine._bodies.pz[wisp] = 0;
  stepTicks(engine, h.state, 2);
  assert.equal(telegraphs(h, 'ashwisp').length, 1, 'the lit wisp speaks');
  assertVerbatim(telegraphs(h, 'ashwisp')[0].payload, 'ashwisp');
});

test('hazard grip: the drift clings once per hold, and only while the drag bites', () => {
  const h = boot({ wave: 5 });
  const { engine, i } = fielded(h, 'spore_drift', 5);
  // Parked inside the cloud: no drag, no tell.
  engine._bodies.px[i] = 10;
  engine._bodies.pz[i] = 0;
  stepTicks(engine, h.state, 5);
  assert.equal(telegraphs(h, 'spore_drift').length, 0, 'a still hull inside the haze is not a grip');
  // Moving: the brake bites and the cling speaks — once, however long the hold runs.
  h.player.vel.x = 40;
  stepTicks(engine, h.state, 3);
  assert.equal(telegraphs(h, 'spore_drift').length, 1, 'the bite speaks once');
  assertVerbatim(telegraphs(h, 'spore_drift')[0].payload, 'spore_drift');
  stepTicks(engine, h.state, 30);
  assert.equal(telegraphs(h, 'spore_drift').length, 1, 'a held grip is still one tell');
  // Clear the radius, then a fresh grip is a new instance.
  engine._bodies.px[i] = 400;
  h.player.vel.x = 40;
  stepTicks(engine, h.state, 2);
  engine._bodies.px[i] = 10;
  stepTicks(engine, h.state, 3);
  assert.equal(telegraphs(h, 'spore_drift').length, 2, 'a fresh hold speaks again');
});

test('undertow: the wake-drag speaks at the bite, once per hold', () => {
  const h = boot({ wave: 55 });
  const { engine, i } = fielded(h, 'undertow', 55);
  engine._bodies.px[i] = 40;
  engine._bodies.pz[i] = 0;
  h.player.vel.x = 40;
  stepTicks(engine, h.state, 3);
  assert.equal(telegraphs(h, 'undertow').length, 1, 'the drag speaks as it lands');
  assertVerbatim(telegraphs(h, 'undertow')[0].payload, 'undertow');
  stepTicks(engine, h.state, 20);
  assert.equal(telegraphs(h, 'undertow').length, 1, 'the hold is one tell');
});

test('a burrowing sweller does not speak twice: the gloomcap swell stays silent', () => {
  const h = boot({ wave: 37 });
  const { engine, i } = fielded(h, 'gloomcap', 37);
  // Beside the rock it sleeps in: the eruption is its authored tell — spoken once per
  // cell (the subscriber, not the engine, owns the chorus).
  h.player.pos.x = h.rock.pos.x;
  h.player.pos.z = h.rock.pos.z + 20;
  stepTicks(engine, h.state, 3);
  const erupted = telegraphs(h, 'gloomcap').length;
  assert.ok(erupted >= 1, 'the crack-out speaks');
  engine._killDirectForTest(i, 'direct');
  assert.equal(telegraphs(h, 'gloomcap').length, erupted,
    'the fuse re-arms silently — its line names the eruption, not the swell');
});

test('a family whose def carries no authored line emits nothing', () => {
  const h = boot({ wave: 3 });
  const engine = makeEngine(h);
  // Same mirror, one family's tell stripped — the windup still arms but cannot speak.
  engine._setFamilyMirrorForTest(ALL_DEFS.map((d) => (
    d.id === 'spitter' ? { ...d, telegraph: null } : d
  )));
  engine.prepareWave(h.state.run, 3);
  engine.spawnWave(h.state);
  const i = familySlot(engine, 'spitter');
  assert.ok(i >= 0);
  for (let k = 0; k < SWARM_BROOD_MAX; k++) {
    if (engine._bodies.alive[k] && k !== i) engine._killDirectForTest(k, 'terrain');
  }
  h.state.simTime += BROOD_ATTACK_ARRIVAL_S;
  engine._bodies.px[i] = 80;
  engine._bodies.pz[i] = 0;
  stepTicks(engine, h.state, 5);
  assert.equal(engine._bodies.phase[i], BROOD_PHASE_WINDUP, 'the windup still armed');
  assert.equal(telegraphs(h).length, 0, 'no authored line, no tell');
});

test('families with no real transition never speak: mite, glassback, wake_eel, keelback', () => {
  const h = boot({ wave: 55 });
  const { engine } = fielded(h, 'mite', 55);
  for (const id of ['mite', 'glassback', 'wake_eel', 'keelback']) {
    const i = familySlot(engine, id);
    assert.ok(i >= 0, `wave 55 fields ${id}`);
    engine._bodies.px[i] = 12;
    engine._bodies.pz[i] = 0;
  }
  h.player.vel.x = 30;
  stepTicks(engine, h.state, 60);
  for (const id of ['mite', 'glassback', 'wake_eel', 'keelback']) {
    assert.equal(telegraphs(h, id).length, 0, `${id} has no attack-language beat — silent`);
  }
});

test('end to end: a spitter windup surfaces exactly one alert through the real subscriber', () => {
  const h = boot({ wave: 3 });
  survivalAnnounce.init({ state: h.state, bus: h.bus, helpers: {} });
  const engine = makeEngine(h);
  engine.prepareWave(h.state.run, 3);
  engine.spawnWave(h.state);
  h.state.simTime += BROOD_ATTACK_ARRIVAL_S;
  const i = familySlot(engine, 'spitter');
  assert.ok(i >= 0);
  engine._bodies.px[i] = 100;
  engine._bodies.pz[i] = 0;
  stepTicks(engine, h.state, 12);
  assert.ok(telegraphs(h, 'spitter').length >= 1, 'the engine really emitted the tell');
  const alerts = h.emitted.filter((e) => e.event === 'alert'
    && e.payload.key === 'brood-telegraph:spitter');
  assert.equal(alerts.length, 1, 'a room of winding spitters is one spoken line');
  assert.equal(alerts[0].payload.text, authored('spitter').line,
    'the floor carries the authored windup line verbatim');
  assert.equal(alerts[0].payload.sev, 'warn');
  survivalAnnounce.destroy();
});
