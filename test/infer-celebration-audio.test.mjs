// Celebration & identity audio — the four biggest beats each speak with their own voice.
//
// Contract (deterministic, headless, no WebAudio):
//   1. achievement:unlocked plays sfx_achievement_fanfare and ducks the music bed;
//   2. career:ladder:completed plays sfx_promotion_chord;
//   3. tech:researched and ship:purchased play their OWN recipes — neither reuses
//      sfx_mission_complete (the mission resolve keeps that voice exclusively);
//   4. every recipe the handlers name exists in the RECIPES table.
import test from 'node:test';
import assert from 'node:assert/strict';

import { audio } from '../src/audio/audioSystem.js';
import { RECIPES } from '../src/data/audioRecipes.js';

const RECIPE_BY_ID = new Map(RECIPES.map((r) => [r.id, r]));

function busHarness() {
  const listeners = new Map();
  return {
    on(name, fn) { (listeners.get(name) || listeners.set(name, []).get(name)).push(fn); },
    emit(name, payload) { for (const fn of listeners.get(name) || []) fn(payload); },
  };
}

function boot() {
  const played = [];
  let ducked = 0;
  const sys = Object.create(audio);
  sys.play = (id, opts) => { played.push({ id, gain: opts && opts.gain }); return null; };
  sys._duckMusic = () => { ducked += 1; };
  sys.init({
    state: { audioRuntime: {}, playerId: 'player', entities: new Map() },
    bus: busHarness(),
    helpers: {},
  });
  return { sys, played, get ducked() { return ducked; } };
}

test('an unlocked achievement gets its own fanfare and ducks the bed', () => {
  const t = boot();
  t.sys.bus.emit('achievement:unlocked', { id: 'ach_first_kill' });
  const rows = t.played.filter((r) => r.id === 'sfx_achievement_fanfare');
  assert.equal(rows.length, 1, `expected one fanfare, got ${JSON.stringify(t.played)}`);
  assert.ok(rows[0].gain > 0.6, 'the fanfare should land above the bed');
  assert.equal(t.ducked, 1, 'an achievement is a big moment — the bed ducks under it');
});

test('a completed career ladder gets the promotion chord, no duck', () => {
  const t = boot();
  t.sys.bus.emit('career:ladder:completed', { ladderId: 'hauler' });
  assert.deepEqual(
    t.played.map((r) => r.id),
    ['sfx_promotion_chord'],
    'rank-up speaks once, with the chord',
  );
  assert.equal(t.ducked, 0, 'a rank-up acknowledges without stopping the world');
});

test('tech and ship purchases stopped borrowing the mission jingle', () => {
  const t = boot();
  t.sys.bus.emit('tech:researched', { nodeId: 'tech_bulk_logistics' });
  t.sys.bus.emit('ship:purchased', { shipId: 'ship_mule' });
  assert.deepEqual(
    t.played.map((r) => r.id),
    ['sfx_tech_researched', 'sfx_ship_purchased'],
    'each big sink has its own voice now',
  );
  assert.ok(!t.played.some((r) => r.id === 'sfx_mission_complete'),
    'the mission resolve keeps its voice to itself');
  assert.equal(t.ducked, 1, 'a ship arriving ducks the bed');
});

test('every named celebration recipe exists in the recipe table', () => {
  for (const id of [
    'sfx_achievement_fanfare',
    'sfx_promotion_chord',
    'sfx_tech_researched',
    'sfx_ship_purchased',
  ]) {
    const def = RECIPE_BY_ID.get(id);
    assert.ok(def, `${id} must exist in RECIPES — playback resolves through the table`);
    assert.equal(def.category, 'ui');
  }
});
