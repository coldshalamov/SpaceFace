// FIGHT-06 — an enemy type's counter hint is spoken once in adventure on its first sighting.
// combat.js stamps the authored `counterHint` onto every spawned hostile's data bag, but the only
// consumer was the Crucible announcer — the open world never taught it. barkDirector now speaks
// one tutorial line per enemy type, remembered on player.hints across saves. The Crucible keeps
// its own announcer (adventureStunts gate), and unmapped authored tokens never leak raw
// identifiers at the player.
import test from 'node:test';
import assert from 'node:assert/strict';

import { barkDirector } from '../src/systems/barkDirector.js';
import { hintTextFor } from '../src/systems/survivalAnnounce.js';
import { ENEMY_TYPES } from '../src/data/enemies.js';

function makeBus() {
  const handlers = new Map();
  return {
    on(event, fn) {
      if (!handlers.has(event)) handlers.set(event, []);
      handlers.get(event).push(fn);
      return () => {
        const list = handlers.get(event) || [];
        const i = list.indexOf(fn);
        if (i >= 0) list.splice(i, 1);
      };
    },
    off(event, fn) {
      const list = handlers.get(event) || [];
      const i = list.indexOf(fn);
      if (i >= 0) list.splice(i, 1);
    },
    emit(event, payload) {
      for (const fn of (handlers.get(event) || []).slice()) fn(payload);
    },
    handlerCount(event) { return (handlers.get(event) || []).length; },
  };
}

function makeState() {
  return {
    mode: 'flight',
    tick: 1,
    simTime: 1,
    playerId: 1,
    player: { hints: {} },
    entities: new Map(),
    settings: { gameplay: {}, audio: {}, accessibility: {} },
  };
}

function brawler(id) {
  return {
    id, type: 'ship', alive: true, team: 1,
    data: {
      lootTableId: 'bruiser_brawler',
      counterHint: 'low_mass_shove_tether_or_kill_at_range_blast_hits_everyone',
    },
  };
}

function boot(state = makeState()) {
  const bus = makeBus();
  const says = [];
  bus.on('voice:say', (p) => says.push(p));
  const bd = Object.create(barkDirector);
  bd.init({ state, bus, helpers: {}, registry: { get() { return null; } } });
  return { bd, bus, says, state };
}

test('the first spawned bruiser_brawler in adventure speaks one hint line', () => {
  const { bus, says } = boot();
  bus.emit('entity:spawned', { id: 9, type: 'ship', entity: brawler(9) });
  assert.equal(says.length, 1);
  assert.equal(says[0].channel, 'tutorial');
  assert.equal(says[0].id, 'barkDirector:counterHint:bruiser_brawler');
  assert.match(says[0].text, /^Bruiser Brawler: /);
  assert.equal(says[0].text.includes('_'), false, 'no raw token leaks at the player');
});

test('the second spawn of the same type says nothing — once per profile', () => {
  const { bus, says, state } = boot();
  bus.emit('entity:spawned', { id: 9, type: 'ship', entity: brawler(9) });
  bus.emit('entity:spawned', { id: 10, type: 'ship', entity: brawler(10) });
  bus.emit('entity:spawned', { id: 11, type: 'ship', entity: brawler(11) });
  assert.equal(says.length, 1, 'three brawlers, one lesson');
  assert.equal(state.player.hints.counterHint_bruiser_brawler, true,
    'the flag persists on player.hints like every other one-time lesson');
});

test('a different enemy type still teaches its own line', () => {
  const { bus, says } = boot();
  bus.emit('entity:spawned', { id: 9, type: 'ship', entity: brawler(9) });
  bus.emit('entity:spawned', {
    id: 12, type: 'ship', entity: {
      id: 12, type: 'ship', alive: true, team: 1,
      data: { lootTableId: 'mine_layer_jackal', counterHint: 'cut_tether_or_clear_wake' },
    },
  });
  assert.equal(says.length, 2);
});

test('non-hostile, dead, unhinted, off-flight, and Crucible spawns stay silent', () => {
  const friendly = boot();
  friendly.bus.emit('entity:spawned', {
    id: 9, type: 'ship', entity: { ...brawler(9), team: 2 },
  });
  assert.equal(friendly.says.length, 0, 'civilian hulls do not teach');

  const dead = boot();
  dead.bus.emit('entity:spawned', { id: 9, type: 'ship', entity: { ...brawler(9), alive: false } });
  assert.equal(dead.says.length, 0, 'a corpse teaches nothing');

  const nohint = boot();
  nohint.bus.emit('entity:spawned', {
    id: 9, type: 'ship',
    entity: { id: 9, type: 'ship', alive: true, team: 1, data: {} },
  });
  assert.equal(nohint.says.length, 0, 'no authored id, no line');

  const docked = boot();
  docked.state.mode = 'dock';
  docked.bus.emit('entity:spawned', { id: 9, type: 'ship', entity: brawler(9) });
  assert.equal(docked.says.length, 0, 'dock-mode spawns stay quiet');

  const crucible = boot();
  crucible.state.run = { kind: 'survival', phase: 'wave_intro', wave: 1 };
  crucible.bus.emit('entity:spawned', { id: 9, type: 'ship', entity: brawler(9) });
  assert.equal(crucible.says.length, 0, 'the Crucible keeps its own announcer');
});

test('every authored snake_case counterHint token resolves to prose — no dead tokens', () => {
  const unresolved = [];
  for (const def of ENEMY_TYPES) {
    if (typeof def.counterHint !== 'string' || !def.counterHint.length) continue;
    const text = hintTextFor(def.id);
    if (!text || text.includes('_')) unresolved.push(`${def.id}:${def.counterHint}`);
  }
  assert.deepEqual(unresolved, [], 'every authored hint speaks real words');
});

test('destroy releases the listener — no teaching after teardown', () => {
  const { bd, bus, says } = boot();
  bd.destroy();
  bus.emit('entity:spawned', { id: 9, type: 'ship', entity: brawler(9) });
  assert.equal(says.length, 0);
});
