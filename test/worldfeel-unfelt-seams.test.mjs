// Worldfeel inference — mining:beamLocked, flight:sweptHull, cargo:volatileExposed.
// Seed 4242. No AudioContext. The swept-hull payload is a retained object.
import assert from 'node:assert/strict';
import test from 'node:test';

import { RECIPES } from '../src/data/audioRecipes.js';
import { verbCueCoverage, verbCueDispatchIds } from '../src/audio/combatVerbCues.js';
import {
  WORLD_FEEL_SEAM_IDS,
  admitWorldFeelSeam,
  copySweptHullFeel,
  installWorldFeelSeams,
  playWorldFeelSeam,
  worldFeelCue,
  worldFeelHaptic,
  worldFeelVoice,
} from '../src/audio/worldFeelSeams.js';
import {
  ADDITIONAL_ACTION_VFX_RECIPES,
  resolveAdditionalActionVfxReceipt,
} from '../src/render/vfx/actionEventRecipes.js';

const SEED = 4242;
const RECIPE_IDS = new Set(RECIPES.map((row) => row.id));
const SEVERITIES = new Set(['danger', 'warn', 'info', 'dock']);

function mulberry32(seed) {
  let a = seed >>> 0;
  return () => {
    a |= 0;
    a = (a + 0x6d2b79f5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

test('seed 4242 is the worldfeel pin', () => {
  const rand = mulberry32(SEED);
  assert.equal(SEED, 4242);
  assert.ok(rand() > 0 && rand() < 1);
});

test('the three unfelt seams admit on sim tick and refuse a non-finite tick', () => {
  const book = Object.create(null);
  const beam = { asteroidId: 7, siteId: 's' };
  assert.equal(admitWorldFeelSeam(book, 'mining:beamLocked', beam, NaN), false);
  assert.equal(admitWorldFeelSeam(book, 'mining:beamLocked', beam, 10), true);
  assert.equal(admitWorldFeelSeam(book, 'mining:beamLocked', beam, 99), false);
  assert.equal(admitWorldFeelSeam(book, 'mining:beamLocked', beam, 100), true);

  const far = { shipId: 1, active: true, sliding: false, contactId: 3, timeToContactS: 4 };
  assert.equal(admitWorldFeelSeam(book, 'flight:sweptHull', far, 10), false);
  const graze = { shipId: 1, active: true, sliding: true, contactId: 3, timeToContactS: 0.4 };
  assert.equal(admitWorldFeelSeam(book, 'flight:sweptHull', graze, 10), true);
  const otherFace = { ...graze, contactId: 8 };
  assert.equal(admitWorldFeelSeam(book, 'flight:sweptHull', otherFace, 12), true);

  assert.equal(admitWorldFeelSeam(book, 'cargo:volatileExposed', { podId: 4, stage: 'stable' }, 10), false);
  assert.equal(admitWorldFeelSeam(book, 'cargo:volatileExposed', { podId: 4, stage: 'warming' }, 10), true);
  assert.equal(admitWorldFeelSeam(book, 'cargo:volatileExposed', { podId: 4, stage: 'critical' }, 11), true);
});

test('each seam plays an existing recipe, a caption, and a legal alert severity', () => {
  const book = Object.create(null);
  const plays = [];
  const captions = [];
  const entities = new Map([
    [7, { id: 7, alive: true, pos: { x: 12, z: 18 } }],
    [4, { id: 4, alive: true, pos: { x: 3, z: -2 } }],
  ]);
  const host = {
    state: { tick: 0, entities },
    play(id, opts) {
      plays.push({ id, opts });
      return { id };
    },
    _emitPresentationCaption(text, opts) { captions.push({ text, opts }); },
  };
  const played = playWorldFeelSeam(host, book, 'mining:beamLocked', { asteroidId: 7 });
  assert.equal(played.id, 'sfx_mining_cutter_lock');
  assert.equal(plays[0].opts.id, 'sfx_mining_cutter_lock');
  assert.deepEqual(plays[0].opts.position, { x: 12, z: 18 });
  assert.equal(captions[0].text.includes('Developed rock'), true);
  assert.equal(RECIPE_IDS.has(plays[0].id), true);

  host.state.tick = 5;
  const sweep = copySweptHullFeel({
    shipId: 1, active: true, sliding: true, contactId: 9, timeToContactS: 0.2,
    contactPoint: { x: 3, z: 4 },
  });
  sweep.contactPoint.x = 99;
  playWorldFeelSeam(host, book, 'flight:sweptHull', {
    shipId: 1, active: true, sliding: true, contactId: 9, timeToContactS: 0.2,
    contactPoint: { x: 3, z: 4 },
  });
  assert.equal(plays[1].opts.id, 'sfx_hull_scrape');
  assert.deepEqual(plays[1].opts.position, { x: 3, z: 4 });

  for (const stage of ['warming', 'critical', 'venting']) {
    host.state.tick += 20;
    playWorldFeelSeam(host, book, 'cargo:volatileExposed', { podId: 4, stage });
  }
  const volatileIds = plays.slice(2).map((row) => row.id);
  assert.deepEqual(volatileIds, [
    'sfx_mining_fracture_warning',
    'sfx_mining_fracture_break',
    'sfx_explosion_small',
  ]);
  assert.equal(new Set(volatileIds).size, 3);
  for (const id of volatileIds) assert.equal(RECIPE_IDS.has(id), true);

  const voices = [
    worldFeelVoice('mining:beamLocked', { asteroidId: 7 }),
    worldFeelVoice('flight:sweptHull', sweep),
    worldFeelVoice('cargo:volatileExposed', { stage: 'warming' }),
    worldFeelVoice('cargo:volatileExposed', { stage: 'critical' }),
    worldFeelVoice('cargo:volatileExposed', { stage: 'venting' }),
  ];
  for (const voice of voices) assert.equal(SEVERITIES.has(voice.sev), true, voice.text);
  assert.equal(worldFeelVoice('cargo:volatileExposed', { stage: 'stable' }), null);
  assert.notEqual(worldFeelHaptic('cargo:volatileExposed', { stage: 'warming' }).strong,
    worldFeelHaptic('cargo:volatileExposed', { stage: 'venting' }).strong);
});

test('a retained swept-hull payload is copied before the next emit', () => {
  const busHandlers = [];
  const bus = {
    on(_name, fn) { busHandlers.push(fn); },
  };
  const plays = [];
  const host = {
    state: { tick: 0, entities: new Map() },
    play(id, opts) { plays.push({ id, opts }); return { id }; },
    _emitPresentationCaption() {},
  };
  installWorldFeelSeams(host, bus);
  const payload = {
    shipId: 2, active: true, sliding: false, contactId: 5, timeToContactS: 0.4,
    contactPoint: { x: 8, z: 1 },
  };
  const sweep = busHandlers.find((fn) => {
    plays.length = 0;
    host.state.tick = 0;
    fn(payload);
    return plays.length === 1 && plays[0].id === 'sfx_hull_scrape';
  });
  assert.ok(sweep);
  payload.contactPoint.x = 0;
  payload.timeToContactS = 9;
  payload.sliding = false;
  assert.deepEqual(plays[0].opts.position, { x: 8, z: 1 });
});

test('beam lock is owned by worldFeelSeams and is not table-dispatched', () => {
  const row = verbCueCoverage().find((entry) => entry.id === 'mining:beamLocked');
  assert.equal(row.dispatcher, 'owner');
  assert.equal(row.owner, 'worldFeelSeams');
  assert.equal(row.recipe, 'sfx_mining_cutter_lock');
  assert.equal(verbCueDispatchIds().includes('mining:beamLocked'), false);
  assert.equal(worldFeelCue('mining:beamLocked').recipeId, 'sfx_mining_cutter_lock');
  assert.notEqual(worldFeelCue('mining:beamLocked').recipeId, 'sfx_mining_beam');
});

test('worldfeel pictures are one-shot receipts on the body that owns the event', () => {
  for (const id of WORLD_FEEL_SEAM_IDS) {
    assert.equal(ADDITIONAL_ACTION_VFX_RECIPES[id].continuous, false, id);
  }
  const entities = new Map([
    [7, { id: 7, alive: true, pos: { x: 10, z: 20 } }],
    [4, { id: 4, alive: true, pos: { x: 1, z: 2 } }],
    [1, { id: 1, alive: true, pos: { x: 0, z: 0 } }],
  ]);
  const state = { playerId: 1, entities };
  const locked = resolveAdditionalActionVfxReceipt('mining:beamLocked', { asteroidId: 7 }, state);
  assert.deepEqual(locked.pos, { x: 10, z: 20 });
  assert.equal(resolveAdditionalActionVfxReceipt('mining:beamLocked', { asteroidId: 99 }, state), null);
  const graze = resolveAdditionalActionVfxReceipt('flight:sweptHull', {
    shipId: 1, active: true, sliding: true, contactId: 3, contactPoint: { x: 6, z: 7 },
  }, state);
  assert.deepEqual(graze.pos, { x: 6, z: 7 });
  assert.equal(resolveAdditionalActionVfxReceipt('flight:sweptHull', {
    shipId: 1, active: true, sliding: false, timeToContactS: 8, contactPoint: { x: 6, z: 7 },
  }, state), null);
  const vent = resolveAdditionalActionVfxReceipt('cargo:volatileExposed', {
    podId: 4, stage: 'venting',
  }, state);
  assert.equal(vent.kind, 'venting');
  assert.deepEqual(vent.pos, { x: 1, z: 2 });
  assert.equal(resolveAdditionalActionVfxReceipt('cargo:volatileExposed', {
    podId: 4, stage: 'stable',
  }, state), null);
});
