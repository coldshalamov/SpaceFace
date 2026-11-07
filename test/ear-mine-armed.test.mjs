// weapons:mineArmed drew an arming flash and made no sound. The click is the
// mine's own recipe, once per mine, quieter than the detonation. Seed 4242.
import assert from 'node:assert/strict';
import test from 'node:test';
import { readFileSync } from 'node:fs';
import { createBus } from '../src/core/eventBus.js';
import { audio } from '../src/audio/audioSystem.js';
import { mines } from '../src/systems/mines.js';
import { projectBridgeEvent } from '../scripts/lib/simEventBridge.mjs';

import {
  MINE_ARMED_ADMIT_TICKS,
  MINE_ARMED_RECIPE,
  MINE_DETONATION_RECIPE,
  mineArmedCue,
  playAdmittedEarCue,
} from '../src/audio/combatFeedbackEar.js';

const SEED = 4242;

test('seed 4242: arming a mine clicks once and is not the blast', () => {
  assert.equal(SEED, 4242);
  const recipes = readFileSync(new URL('../src/data/audioRecipes.js', import.meta.url), 'utf8');
  assert.match(recipes, new RegExp(`id:\\s*'${MINE_ARMED_RECIPE}'`));
  assert.notEqual(MINE_ARMED_RECIPE, MINE_DETONATION_RECIPE);
  assert.equal(mineArmedCue({ ownerId: 1 }), null);

  const cue = mineArmedCue({ mineId: 12, ownerId: 1, pos: { x: 8, z: 3 } });
  assert.equal(cue.recipeId, MINE_ARMED_RECIPE);
  assert.ok(cue.gain < 0.5);
  assert.equal(cue.position.z, 3);

  const played = [];
  const host = { play(id, opts) { played.push({ id, opts }); return { id }; } };
  assert.ok(playAdmittedEarCue(host, cue, 4));
  assert.equal(playAdmittedEarCue(host, cue, 4 + MINE_ARMED_ADMIT_TICKS - 1), null);
  assert.equal(played.length, 1);

  const src = readFileSync(new URL('../src/audio/audioSystem.js', import.meta.url), 'utf8');
  assert.match(src, /bus\.on\('weapons:mineArmed'/);
});

test('canonical mine arming survives delayed worker delivery and is heard once at its emitted position', (t) => {
  const player = { id: 1, type: 'ship', alive: true, team: 0,
    pos: { x: 0, z: 0 }, vel: { x: 0, z: 0 }, radius: 12 };
  const state = { mode: 'flight', tick: 60, simTime: 1, playerId: 1,
    settings: { audio: { muted: false }, accessibility: { captions: false }, video: {} },
    entities: new Map([[1, player]]), entityList: [player],
    world: { currentSectorId: 'sector_helios', sectors: {} } };
  const bus = createBus(); const presentationBus = createBus(); let nextId = 20;
  const receipts = [];
  bus.on('mines:armed', (payload) => receipts.push(projectBridgeEvent('mines:armed', payload)));
  const helpers = { spawnEntity(spec) {
    const mine = { ...spec, id: nextId++, alive: true };
    state.entities.set(mine.id, mine); state.entityList.push(mine); return mine;
  } };
  const mineOwner = Object.create(mines); mineOwner.init({ state, bus, helpers });
  const audioOwner = Object.create(audio);
  audioOwner.init({ state, bus: presentationBus, helpers: {} });
  t.after(() => audioOwner.destroy());
  const played = [];
  audioOwner.play = (recipeId, opts) => { played.push({ recipeId, opts }); return { recipeId }; };
  const mine = mineOwner.placeMine({ ownerId: 7, team: 1, pos: { x: 800, z: 42 }, armDelayS: 1 });
  state.simTime = mine.data.armedAt; mineOwner.update(1 / 60, state);
  assert.equal(mine.data.armed, true); assert.equal(receipts.length, 1);
  assert.equal(receipts[0].dropped, false);
  // The worker can arm and destroy a mine before main replays the tick's events.
  state.entities.delete(mine.id); mine.pos.x = 999;
  presentationBus.emit('mines:armed', structuredClone(receipts[0].flat));
  assert.equal(played.length, 1);
  assert.equal(played[0].recipeId, MINE_ARMED_RECIPE);
  assert.deepEqual(played[0].opts.position, { x: 800, z: 42 });
  presentationBus.emit('weapons:mineArmed', { mineId: mine.id, ownerId: 7, pos: mine.pos });
  presentationBus.emit('mines:armed', { mineId: mine.id, ownerId: 7 });
  assert.equal(played.length, 1, 'legacy and canonical receipts share the per-mine admission key');
});
