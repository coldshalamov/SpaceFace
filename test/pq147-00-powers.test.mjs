// PQ-147.00 — five powers, five sentences, five drills, cone/ring/sheet volumes.
import assert from 'node:assert/strict';
import test from 'node:test';
import { readdirSync, readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

import { createSimulation, SIM_DT } from '../src/core/sim.js';
import { createBus } from '../src/core/eventBus.js';
import { fields } from '../src/systems/fields.js';
import { physics } from '../src/core/physics.js';
import {
  FIELD_DEFS,
  FIELD_FLAGS,
  FIELD_KINDS,
  FIELD_VOLUME_GRAMMAR,
  FIELD_VOLUME_IDS,
  FIELD_VOLUMES,
  POWER_ROSTER,
  fieldVolumeOf,
  fittingSentence,
} from '../src/data/fields.js';
import {
  createFieldKernel,
  fieldRawAcceleration,
  normalizeField,
} from '../src/core/fields/fieldKernel.js';
import { classifyCausalVfxFamily } from '../src/presentation/causalVfxGrammar.js';
import { readRailModel } from '../src/ui/powerRail.js';

const ROOT = dirname(fileURLToPath(import.meta.url));
const DRILL_DIR = join(ROOT, '../src/data/scenarios');
const DT = SIM_DT;
const ALLOWED_VOLUMES = new Set(FIELD_VOLUME_IDS);

function withFlag(on, fn) {
  const prev = FIELD_FLAGS.enabled;
  FIELD_FLAGS.enabled = on;
  let result;
  try {
    result = fn();
  } catch (err) {
    FIELD_FLAGS.enabled = prev;
    throw err;
  }
  if (result && typeof result.then === 'function') {
    return result.finally(() => { FIELD_FLAGS.enabled = prev; });
  }
  FIELD_FLAGS.enabled = prev;
  return result;
}

function boot(seed = 14700, { withPhysics = false } = {}) {
  const sim = createSimulation({
    seed,
    bus: createBus(),
    systems: withPhysics ? [fields, physics] : [fields],
  });
  const { state } = sim;
  state.mode = 'flight';
  state.input.actions = {};
  const player = sim.spawn({
    type: 'ship', team: 0, pos: { x: 0, z: 0 }, radius: 12, collides: true,
    vel: { x: 0, z: 0 }, rot: 0, angVel: 0,
    hull: 200, hullMax: 200,
    flightModel: { inertia: 88 }, flags: {},
    physicsBody: { schemaVersion: 1, radius: 12, mass: 28, inertiaY: 88, dynamic: true, ccd: true, material: 'ship', revision: 0 },
    data: { combatProfileId: 'combat_profile_standard_ship' },
  });
  state.playerId = player.id;
  return { sim, state, player, fieldsSys: sim.registry.get('fields'), physicsSys: sim.registry.get('physics') };
}

async function bootPhysics(seed = 14701) {
  const t = boot(seed, { withPhysics: true });
  t.state.settings.gameplay.physicsBackend = 'rapier-dynamic';
  const ready = await t.physicsSys.prepareBackend(t.state);
  assert.equal(ready, true, 'rapier-dynamic should initialize headless');
  t.cleanup = () => {
    if (typeof t.physicsSys._disableSg02DynamicAuthority === 'function') {
      t.physicsSys._disableSg02DynamicAuthority();
    }
  };
  return t;
}

function lightBody(sim, x, z, mass = 2) {
  return sim.spawn({
    type: 'wreck', team: 9, pos: { x, z }, vel: { x: 0, z: 0 }, rot: 0, angVel: 0, radius: 4, collides: true,
    hull: 40, hullMax: 40,
    physicsBody: { schemaVersion: 1, radius: 4, mass, inertiaY: 4, dynamic: true, ccd: false, material: 'debris', revision: 0 },
    data: { majorDebris: true },
  });
}

function press(t, action, aim) {
  if (aim) t.state.input.aimWorld = aim;
  t.state.input.actions[action] = true;
  t.sim.step();
}

function loadDrills() {
  return readdirSync(DRILL_DIR)
    .filter((name) => name.startsWith('pq147-') && name.endsWith('.scenario.json'))
    .map((name) => JSON.parse(readFileSync(join(DRILL_DIR, name), 'utf8')));
}

test('five powers have a fitting sentence, a drill, and a cone/ring/sheet volume', () => {
  assert.equal(POWER_ROSTER.length, 5);
  const drills = loadDrills();
  assert.equal(drills.length, 5, 'five Range drills live in src/data/scenarios/');
  for (const power of POWER_ROSTER) {
    assert.ok(power.sentence && power.sentence.includes(' '), `${power.id} needs a fitting-screen sentence`);
    assert.equal(fittingSentence(power.id), power.sentence);
    assert.equal(fittingSentence(power.action), power.sentence);
    assert.ok(ALLOWED_VOLUMES.has(power.volume), `${power.id} volume ${power.volume} must be cone/ring/sheet`);
    assert.notEqual(power.volume, 'sphere');
    assert.equal(fieldVolumeOf(FIELD_DEFS[power.defKey]), power.volume);
    const grammar = FIELD_VOLUME_GRAMMAR[power.id];
    assert.ok(grammar, `${power.id} needs a VFX volume grammar row`);
    assert.equal(grammar.volume, power.volume);
    assert.notEqual(grammar.silhouette, 'sphere');
    const drill = drills.find((row) => row.id === power.drillId);
    assert.ok(drill, `${power.drillId} missing`);
    assert.equal(drill.volume, power.volume);
    assert.equal(drill.sentence, power.sentence);
    assert.equal(drill.railSlot, power.railSlot);
    assert.equal(drill.schema, 'spaceface.rangeDrill.v1');
  }
});

test('published volumes never resolve to a sphere', () => {
  const well = normalizeField(FIELD_DEFS.well);
  const rep = normalizeField(FIELD_DEFS.repulsor);
  const cone = normalizeField(FIELD_DEFS.cone);
  const skim = normalizeField(FIELD_DEFS.skim);
  const seed = normalizeField(FIELD_DEFS.seed);
  assert.equal(well.volume, FIELD_VOLUMES.RING);
  assert.equal(rep.volume, FIELD_VOLUMES.RING);
  assert.equal(cone.volume, FIELD_VOLUMES.CONE);
  assert.equal(skim.kind, FIELD_KINDS.SHEET);
  assert.equal(skim.volume, FIELD_VOLUMES.SHEET);
  assert.equal(seed.volume, FIELD_VOLUMES.RING);
  for (const rec of [well, rep, cone, skim, seed]) {
    assert.ok(ALLOWED_VOLUMES.has(rec.volume));
    assert.notEqual(rec.volume, 'sphere');
  }
});

test('a scoop sheet collects sideways and ignores bodies beside the slab', () => {
  const sheet = normalizeField({
    id: 'sheet',
    kind: FIELD_KINDS.SHEET,
    center: { x: 0, z: 0 },
    dir: { x: 1, z: 0 },
    radius: 200,
    halfWidth: 40,
    strength: 200,
    falloff: 1,
  });
  const inSlab = fieldRawAcceleration(sheet, 80, 24, { ax: 0, az: 0 });
  assert.ok(inSlab.az < -1, `sheet must squeeze toward the centerline, got az=${inSlab.az}`);
  const beside = fieldRawAcceleration(sheet, 80, 80, { ax: 0, az: 0 });
  assert.equal(beside.ax, 0);
  assert.equal(beside.az, 0);
  const behind = fieldRawAcceleration(sheet, -40, 0, { ax: 0, az: 0 });
  assert.equal(behind.ax, 0);
});

test('Well still pulls as a ring, not a damage volume', async () => {
  await withFlag(true, async () => {
    const t = await bootPhysics();
    const body = lightBody(t.sim, 300, 90);
    press(t, 'deployWell', { x: 300, z: 0 });
    for (let i = 0; i < 40; i++) t.sim.step();
    const rec = (t.state.fields.active || []).find((row) => row.kind === FIELD_KINDS.WELL);
    assert.ok(rec, 'well published');
    assert.equal(rec.volume, FIELD_VOLUMES.RING);
    assert.ok(body.vel.z < -0.5, `well must pull, got vel.z=${body.vel.z}`);
    t.cleanup();
  });
});

test('Clearing Cone publishes a cone volume and Skim publishes a sheet', async () => {
  await withFlag(true, async () => {
    const t = await bootPhysics();
    press(t, 'toggleClearingCone');
    t.state.planet = { schemaVersion: 1, player: { collectorOn: true } };
    for (let i = 0; i < 8; i++) t.sim.step();
    const cone = (t.state.fields.active || []).find((row) => row.kind === FIELD_KINDS.CONE);
    const skim = (t.state.fields.active || []).find((row) => row.kind === FIELD_KINDS.SHEET);
    assert.ok(cone, 'cone published');
    assert.equal(cone.volume, FIELD_VOLUMES.CONE);
    assert.ok(skim, 'skim sheet published');
    assert.equal(skim.volume, FIELD_VOLUMES.SHEET);
    assert.equal(t.state.fields.skimActive, true);
    t.cleanup();
  });
});

test('Mass Seed publishes a lock-ring volume without adding gravity', () => {
  withFlag(true, () => {
    const t = boot();
    t.state.massSeed = {
      schemaVersion: 1,
      phase: 'active',
      seedId: null,
      lockPos: { x: 40, z: -12 },
    };
    t.fieldsSys._publish(t.state, t.state.fields, 0, 0, 0);
    const seed = (t.state.fields.active || []).find((row) => row.kind === 'seed');
    assert.ok(seed, 'seed ring published');
    assert.equal(seed.volume, FIELD_VOLUMES.RING);
    assert.equal(seed.strength, 0);
    const k = createFieldKernel();
    k.register({ id: 'seed-force', kind: FIELD_KINDS.WELL, ...FIELD_DEFS.seed, center: { x: 40, z: -12 } });
    const a = fieldRawAcceleration(k.list()[0], 50, -12, { ax: 0, az: 0 });
    assert.equal(a.ax, 0);
    assert.equal(a.az, 0);
  });
});

test('rail slots 4–8 already surface real field/seed/skim state', () => {
  withFlag(true, () => {
    const t = boot();
    t.state.player = { massSeed: { cooldownUntil: 12 } };
    t.state.fields.cooldowns = { well: 8, repulsor: 0 };
    t.state.fields.coneActive = true;
    t.state.planet = { schemaVersion: 1, player: { collectorOn: true } };
    t.fieldsSys._publish(t.state, t.state.fields, 0, 0, 0);
    const rail = readRailModel(t.state, 1);
    assert.equal(rail[4].state, 'cooling');
    assert.equal(rail[5].state, 'cooling');
    assert.equal(rail[6].state, 'ready');
    assert.equal(rail[7].state, 'armed');
    assert.equal(rail[8].state, 'armed');
  });
});

test('VFX grammar classifies the five power deploy cues as field, never a sphere', () => {
  for (const power of POWER_ROSTER) {
    const kind = power.id === 'skim' ? 'sheet' : power.id === 'seed' ? 'seed' : power.id;
    const family = classifyCausalVfxFamily('presentation:vfxCue', {
      id: `field.${kind}.deploy`,
      family: 'field',
      field: true,
      volume: power.volume,
    });
    assert.equal(family, 'field', `${power.id} deploy cue must be the field family`);
    assert.notEqual(power.volume, 'sphere');
  }
});
