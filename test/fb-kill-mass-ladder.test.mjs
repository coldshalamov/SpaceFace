// FB-078 — light, medium and heavy kills sound different by acoustic mass, the way slams
// already do. The non-capital kill voice keys on victim mass through the same
// acoustic-mass→rate law `resolveCollisionCue` uses: light kills lean on `sfx_kill_sine`,
// heavy on `sfx_kill_noise`, and the medium band blends (`sfx.killSmall` layers both).
// Player attribution stays an ADDED confirm layer, never a replacement, and the hush
// remains reserved for capital and structure kills — a light hull gets no room.
// Deterministic: seed 4242 is the fixture seed the ear plans name.
import assert from 'node:assert/strict';
import test from 'node:test';

import { RECIPES } from '../src/data/audioRecipes.js';
import {
  audio,
  KILL_ADMIT_MS,
  killVoiceAdmitted,
  resolveCollisionCue,
  resolveKillMassVoice,
} from '../src/audio/audioSystem.js';

const SEED = 4242;
const recipeById = new Map(RECIPES.map((r) => [r.id, r]));

function killedHost() {
  const played = [];
  const hushes = [];
  const host = Object.create(audio);
  host.rt = {};
  host.state = {
    playerId: 'player',
    simTime: 1,
    tick: 60,
    entities: new Map(),
  };
  host.play = (id, opts = {}) => { played.push({ id, ...opts }); return { id }; };
  host._applyPriorityCue = () => {};
  host._duckMusic = () => {};
  host._triggerHush = (input) => { hushes.push(input); };
  return { host, played, hushes };
}

test('the kill rate is monotonic in victim mass through the collision acoustic-mass law', () => {
  assert.equal(SEED, 4242);
  const masses = [12, 24, 48, 96, 159, 160, 200];
  const voices = masses.map((mass) => resolveKillMassVoice({ mass, type: 'ship' }));
  // At least three distinct rates spanning wasp -> bruiser.
  assert.ok(new Set(voices.map((v) => v.rate)).size >= 3, 'wasp and bruiser must not share one rate');
  for (let i = 1; i < voices.length; i += 1) {
    assert.ok(
      voices[i].rate < voices[i - 1].rate,
      `rate must fall as mass climbs (${masses[i - 1]} -> ${masses[i]}): `
        + `${voices[i - 1].rate} !> ${voices[i].rate}`,
    );
  }
  // The rate is the collision law's own answer for the same acoustic mass — not a parallel ladder.
  for (const mass of masses) {
    const voice = resolveKillMassVoice({ mass, type: 'ship' });
    const law = resolveCollisionCue({ massA: mass, typeA: 'ship', massB: 16, typeB: 'ship', dp: 800 });
    assert.equal(voice.rate, law.rate, `mass ${mass} must ride the acoustic-mass law's rate`);
  }
});

test('light leans sine, heavy leans noise, medium blends, and the confirm is an added layer', () => {
  const light = resolveKillMassVoice({ mass: 16, type: 'ship', killedByPlayer: true });
  const medium = resolveKillMassVoice({ mass: 64, type: 'ship', killedByPlayer: true });
  const heavy = resolveKillMassVoice({ mass: 240, type: 'ship', killedByPlayer: true });
  assert.equal(light.recipeId, 'sfx_kill_sine');
  assert.equal(light.band, 'light');
  assert.equal(medium.recipeId, 'sfx.killSmall');
  assert.equal(medium.band, 'medium');
  assert.equal(heavy.recipeId, 'sfx_kill_noise');
  assert.equal(heavy.band, 'heavy');
  // The medium band blends: sfx.killSmall is the layered recipe over both authored layers.
  const blend = recipeById.get('sfx.killSmall');
  assert.equal(blend.type, 'layered');
  assert.deepEqual(blend.layers, ['sfx_kill_sine', 'sfx_kill_noise']);
  // Player-kill attribution adds the confirm ON TOP of the body voice — never replaces it.
  for (const voice of [light, medium, heavy]) {
    assert.equal(voice.confirmRecipeId, 'sfx_kill_confirm');
    assert.notEqual(voice.confirmRecipeId, voice.recipeId);
  }
  // An NPC-vs-NPC kill keeps the physical voice and drops the reward layer.
  const npcKill = resolveKillMassVoice({ mass: 64, type: 'ship', killedByPlayer: false });
  assert.equal(npcKill.recipeId, 'sfx.killSmall');
  assert.equal(npcKill.confirmRecipeId, null);
  // The hush stays reserved: no non-capital band earns a room.
  for (const voice of [light, medium, heavy, npcKill]) assert.equal(voice.hush, null);
  const capital = resolveKillMassVoice({ victimClass: 'capital', type: 'ship', killedByPlayer: true });
  assert.equal(capital.hush, 'capital');
  assert.equal(capital.recipeId, 'sfx.killCapital');
});

test('the kill handler plays the mass-keyed body and adds the confirm on top', () => {
  const { host, played, hushes } = killedHost();
  host._onKilled({ id: 'wasp-1', killerId: 'player', mass: 16, type: 'ship', pos: { x: 0, z: 0 } });
  const ids = played.map((row) => row.id);
  assert.ok(ids.includes('sfx_kill_sine'), `a light hull must lean sine, got ${ids}`);
  assert.ok(ids.includes('sfx_kill_confirm'), `the player confirm is an added layer, got ${ids}`);
  assert.ok(!ids.includes('sfx.killCapital'), 'a wasp is not a capital beat');
  assert.equal(hushes.length, 0, 'a small kill never hushes the room');

  played.length = 0;
  host._onKilled({ id: 'bruiser-1', killerId: 'player', mass: 240, type: 'ship', pos: { x: 0, z: 0 } });
  const heavyIds = played.map((row) => row.id);
  assert.ok(heavyIds.includes('sfx_kill_noise'), `a heavy hull must lean noise, got ${heavyIds}`);
  assert.ok(heavyIds.includes('sfx_kill_confirm'));
  assert.equal(hushes.length, 0, 'a non-capital bruiser still does not hush');

  // A mid-mass kill blends — and an NPC brawl keeps the body while dropping the confirm.
  played.length = 0;
  host._onKilled({ id: 'npc-fight', killerId: 'other', mass: 64, type: 'ship', pos: { x: 0, z: 0 } });
  const npcIds = played.map((row) => row.id);
  assert.ok(npcIds.includes('sfx.killSmall'), `the medium band blends, got ${npcIds}`);
  assert.ok(!npcIds.includes('sfx_kill_confirm'), 'NPC-vs-NPC never earns the player reward layer');
});

test('a capital kill still gets its hush and composed beat', () => {
  const { host, played, hushes } = killedHost();
  host.rt.ctx = { currentTime: 2 };
  host._onKilled({
    id: 'cap-1', killerId: 'player', victimClass: 'capital', mass: 900,
    type: 'ship', pos: { x: 0, z: 0 },
  });
  const ids = played.map((row) => row.id);
  assert.deepEqual(hushes.map((h) => h.kind), ['capital']);
  assert.ok(ids.includes('sfx.killCapital'));
  assert.ok(ids.includes('sfx_kill_confirm'), 'the confirm layer survives the capital beat');
});

test('per-target admission holds the 40 ms law', () => {
  assert.equal(KILL_ADMIT_MS, 40);
  const book = Object.create(null);
  assert.equal(killVoiceAdmitted(book, 'hull-7', 1000), true);
  assert.equal(killVoiceAdmitted(book, 'hull-7', 1000 + KILL_ADMIT_MS - 1), false,
    'the same target cannot speak twice inside the admission window');
  assert.equal(killVoiceAdmitted(book, 'hull-8', 1000 + KILL_ADMIT_MS - 1), true,
    'a different hull is a different admission');
  assert.equal(killVoiceAdmitted(book, 'hull-7', 1000 + KILL_ADMIT_MS), true);
  // The handler honors the book: a same-tick re-kill of the same id is dropped.
  const { host, played } = killedHost();
  host._onKilled({ id: 'dupe', killerId: 'player', mass: 16, type: 'ship', pos: { x: 0, z: 0 } });
  const firstCount = played.filter((row) => row.id === 'sfx_kill_sine').length;
  host._onKilled({ id: 'dupe', killerId: 'player', mass: 16, type: 'ship', pos: { x: 0, z: 0 } });
  const secondCount = played.filter((row) => row.id === 'sfx_kill_sine').length;
  assert.equal(firstCount, 1);
  assert.equal(secondCount, 1, 'the duplicate kill inside the window adds no second voice');
});
