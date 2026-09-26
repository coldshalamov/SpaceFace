import test from 'node:test';
import assert from 'node:assert/strict';

import { createBus } from '../src/core/eventBus.js';
import { hash32 } from '../src/core/rng.js';
import { BARKS, BARK_SITUATIONS, BARK_EVENT_SITUATIONS, barkFor } from '../src/data/barks.js';
import { barkDirector } from '../src/systems/barkDirector.js';
import { countBarkCorpus, resolveBarkVoice } from '../src/audio/barkVoice.js';

// INFERENCE-24 (WF-13): every faction carried four authored dying-transmission lines that could
// never fire — 'distress' was outside BARK_SITUATIONS and no death path existed. A dying hull now
// keys open once through entity:killed: the victim's register speaks its last transmission, then
// the channel dies with the hull.

const SEED = 13550;

function makeHarness() {
  const bus = createBus();
  const entities = new Map();
  const state = {
    mode: 'flight',
    tick: 0,
    simTime: 0,
    playerId: 1,
    entities,
    entityList: [],
    meta: { seed: SEED },
    world: {},
    story: { titles: { byId: {} } },
    settings: { audio: {}, accessibility: {} },
    heat: { wanted: false, level: 0, fines: 0 },
    law: { fines: 0, citations: [] },
  };
  const add = (spec) => {
    const entity = {
      id: spec.id,
      type: spec.type || 'ship',
      team: spec.team ?? 1,
      alive: true,
      factionId: spec.factionId || 'faction_scn',
      pos: { x: spec.x ?? 0, z: spec.z ?? 0 },
      vel: { x: 0, z: 0 },
      data: spec.data || {},
    };
    entities.set(entity.id, entity);
    state.entityList.push(entity);
    return entity;
  };
  add({ id: 1, type: 'ship', team: 0, x: 0, z: 0 });
  const says = [];
  const voiceReceipts = [];
  bus.on('barkDirector:voice', (p) => voiceReceipts.push(p));
  const voice = { say: (req) => { says.push(req); return true; } };
  barkDirector.init({ state, bus, helpers: { voice } });
  return { bus, state, add, says, voiceReceipts };
}

// Mirrors the combat.js kill emit: victim flagged dead but still resolvable, payload carrying
// id/killerId/type/pos/factionId/targetHostileToPlayer.
function kill(h, entity, over = {}) {
  if (entity) entity.alive = false;
  h.bus.emit('entity:killed', {
    id: entity ? entity.id : over.id,
    killerId: over.killerId ?? 99,
    type: (entity && entity.type) || over.type || 'ship',
    pos: entity ? { x: entity.pos.x, z: entity.pos.z } : (over.pos || { x: 0, z: 0 }),
    factionId: (entity && entity.factionId) || over.factionId || 'faction_scn',
    targetHostileToPlayer: over.targetHostileToPlayer ?? true,
    ...over,
  });
}

test.afterEach(() => { barkDirector.destroy(); });

test('a dying hull keys open once with its register\'s authored last line', () => {
  const h = makeHarness();
  const victim = h.add({ id: 40, type: 'ship', team: 2, factionId: 'faction_dmc', x: 30, z: 0 });
  kill(h, victim);
  assert.equal(h.says.length, 1);
  const say = h.says[0];
  assert.equal(say.channel, 'bark');
  assert.equal(say.kind, 'barkDirector');
  assert.equal(say.id, 'barkDirector:40:distress');
  const index = hash32(SEED, 'barkDirector', '40', 'distress');
  assert.equal(say.text, barkFor('faction_dmc', 'distress', index));
  assert.ok(BARKS.faction_dmc.distress.includes(say.text), 'the line is the DMC register, not a fallback');
  assert.equal(h.voiceReceipts.length, 1);
  assert.equal(h.voiceReceipts[0].situation, 'distress');
  assert.equal(h.voiceReceipts[0].entityId, 40);
});

test('a repeated kill emit for the same hull cannot re-cry the death', () => {
  const h = makeHarness();
  const victim = h.add({ id: 41, type: 'ship', team: 2, factionId: 'faction_scn', x: 10, z: 0 });
  kill(h, victim);
  h.bus.emit('entity:killed', { id: 41, killerId: 99, type: 'ship', pos: { x: 10, z: 0 }, factionId: 'faction_scn', targetHostileToPlayer: true });
  assert.equal(h.says.length, 1, 'said.distress latches — one transmission per hull');
});

test('a deep-faction victim speaks its own register, not a core-faction fallback', () => {
  const h = makeHarness();
  const victim = h.add({ id: 42, type: 'ship', team: 3, factionId: 'faction_verge_layers', x: 5, z: 5 });
  kill(h, victim);
  assert.equal(h.says.length, 1);
  assert.ok(BARKS.faction_verge_layers.distress.includes(h.says[0].text));
});

test('the player\'s own death stays silent', () => {
  const h = makeHarness();
  const player = h.state.entities.get(1);
  h.bus.emit('entity:killed', { id: 1, killerId: 99, type: 'ship', pos: { x: 0, z: 0 }, factionId: 'faction_scn', targetHostileToPlayer: false });
  assert.equal(h.says.length, 0);
  assert.equal(player.alive, true, 'harness only — no sim mutation expected here');
});

test('non-hull deaths and player-team hulls stay silent', () => {
  const h = makeHarness();
  const rock = h.add({ id: 50, type: 'asteroid', team: 1, x: 5, z: 0 });
  const ally = h.add({ id: 51, type: 'ship', team: 0, x: 5, z: 0 });
  kill(h, rock);
  kill(h, ally);
  assert.equal(h.says.length, 0);
});

test('far-side attrition stays silent; a hostile kill or a player-authored kill always lands', () => {
  const h = makeHarness();
  const farNeutral = h.add({ id: 60, type: 'ship', team: 2, factionId: 'faction_mts', x: 60000, z: 60000 });
  kill(h, farNeutral, { targetHostileToPlayer: false, killerId: 88 });
  assert.equal(h.says.length, 0, 'a far NPC-vs-NPC death queues no unheard spam');
  const farHostile = h.add({ id: 61, type: 'ship', team: 2, factionId: 'faction_mts', x: 60000, z: 60000 });
  kill(h, farHostile, { targetHostileToPlayer: true, killerId: 88 });
  assert.equal(h.says.length, 1, 'a dying hostile reports in wherever it is');
  const farAuthored = h.add({ id: 62, type: 'ship', team: 2, factionId: 'faction_reach', x: 60000, z: 60000 });
  kill(h, farAuthored, { targetHostileToPlayer: false, killerId: h.state.playerId });
  assert.equal(h.says.length, 2, 'the player hears the mayday they caused');
});

test('post-combat silence does not swallow the last transmission', () => {
  const h = makeHarness();
  const first = h.add({ id: 70, type: 'ship', team: 2, factionId: 'faction_quiet', x: 10, z: 0 });
  kill(h, first);
  assert.equal(h.says.length, 1);
  // FLAVOR_SITUATIONS (patrol-greeting, taunt) own the post-fight quiet; a dying hull is the
  // tail of the fight itself and must punch through the same window that mutes greetings.
  h.state.barkDirector.postCombatSilenceUntil = 1e9;
  const second = h.add({ id: 71, type: 'ship', team: 2, factionId: 'faction_quiet', x: 10, z: 0 });
  kill(h, second);
  assert.equal(h.says.length, 2, 'the dying say dying even inside post-combat silence');
});

test('the voice layer resolves distress without laundering it to scan', () => {
  const line = BARKS.faction_quiet.distress[0];
  const voice = resolveBarkVoice({ factionId: 'faction_quiet', situation: 'distress', line });
  assert.equal(voice.situation, 'distress');
  assert.equal(voice.assertive, false, 'a mayday is not an assertive hail');
  assert.equal(voice.caption, line);
  assert.ok(voice.line.length > 0);
});

test('the ordinary-contact corpus contract is untouched', () => {
  assert.equal(BARK_SITUATIONS.length, 8, 'BARK_SITUATIONS is the generated-WAV index — it must not grow');
  assert.deepEqual([...BARK_EVENT_SITUATIONS], ['distress']);
  assert.equal(countBarkCorpus(), 437, 'the shipped 437-line corpus index space is unchanged');
});
