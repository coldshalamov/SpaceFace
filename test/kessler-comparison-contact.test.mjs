import { save } from '../src/save/saveSystem.js';
import test from 'node:test';
import assert from 'node:assert/strict';
import { createKesslerScale } from '../src/systems/kesslerScale.js';
import { kesslerPadPosition } from '../src/systems/kesslerScaleWorksite.js';
import { KESSLER_SCALE } from '../src/data/kessler.js';
import { makeEntity } from '../src/core/entity.js';

// The real owner (kesslerScale.update) does the work: real pods rest on the real ring and
// the system reads them. The story-line voice is the voice arbiter's `say` contract —
// a spy stands in for the arbiter itself, exactly the payload the game hands it.
function fixture(over = {}) {
  const listeners = new Map(), events = [], said = [];
  const bus = {
    on(name, fn) { const set = listeners.get(name) || new Set(); set.add(fn); listeners.set(name, set); return () => set.delete(fn); },
    emit(name, payload) { events.push([name, payload]); for (const fn of listeners.get(name) || []) fn(payload); },
  };
  const state = {
    world: { currentSectorId: KESSLER_SCALE.sectorId }, story: { flags: {} },
    run: { kind: 'adventure' }, entityList: [], entities: new Map(), nextEntityId: 1,
    mode: 'flight', simTime: 0, ...over,
  };
  const helpers = {
    spawnEntity(spec) { const entity = makeEntity({ ...spec, id: state.nextEntityId++ }); state.entityList.push(entity); state.entities.set(entity.id, entity); return entity; },
    removeEntity(id) { const entity = state.entities.get(id); if (entity) entity.alive = false; },
    voice: { say: (msg) => { said.push(msg); return true; } },
  };
  const system = createKesslerScale();
  system.init({ state, bus, helpers });
  const pod = (spec = {}) => helpers.spawnEntity({
    type: 'payload', mass: 40, pos: kesslerPadPosition(), vel: { x: 0, z: 0 },
    data: { payloadType: 'jettisoned_cargo', commodityId: 'cmdty_ore_iron', amount: 17, salvagePool: { cmdty_ore_iron: 17 }, scanLabel: 'Iron freight' },
    ...spec,
  });
  const beacon = () => state.entityList.find((e) => e.alive && e.data?.kesslerScale === true);
  const ticks = () => system.update(0.5, state);
  const reads = () => events.filter(([name]) => name === 'kesslerPod:weighed');
  const popups = (id) => events.filter(([name, p]) => name === 'comms:popup' && String(p.id).startsWith(id));
  return { state, bus, events, helpers, system, pod, beacon, ticks, reads, popups, said };
}

const watchOf = (f) => f.state.story.flags[KESSLER_SCALE.comparisonFlag];
const kesslerLines = (f) => f.said.filter((m) => m.text === KESSLER_SCALE.comparisonLine);
const comparisonPopups = (f) => f.events.filter(([name, p]) => name === 'comms:popup'
  && (String(p.id).includes('comparison') || String(p.text || p.body || '').includes(KESSLER_SCALE.comparisonLine)));

test('a second, differently-stamped load flips the board to both readings; Kessler says the one line, once', () => {
  const f = fixture();
  const first = f.pod();
  f.ticks();
  assert.equal(f.reads().length, 1);
  assert.deepEqual(watchOf(f), { version: 1, first: { plate: 37.6, stamp: 40, count: 1 }, second: null });
  assert.match(f.beacon().data.scanLabel, /plate 37\.6t \/ stamp 40\.0t/, 'first read keeps the ordinary receipt board');
  assert.equal(kesslerLines(f).length, 0);

  const second = f.pod({ mass: 60 });
  f.ticks();
  assert.equal(f.reads().length, 2);
  assert.deepEqual(watchOf(f).second, { plate: 56.4, stamp: 60, count: 2 });
  assert.equal(f.beacon().data.scanLabel, 'PLATE 56.4 t · STAMP 60.0 t', 'the board shows both disagreeing readings side by side');
  assert.equal(kesslerLines(f).length, 1, 'Kessler speaks once');
  assert.equal(kesslerLines(f)[0].channel, 'story', 'the line rides the story channel');
  assert.equal(kesslerLines(f)[0].kind, 'story');
  assert.equal(f.state.story.flags[KESSLER_SCALE.comparisonSpokenFlag], true);
  assert.equal(comparisonPopups(f).length, 0, 'no comms popup carries the beat');

  // A third different load cannot re-arm the line; the record stays the pair it earned.
  f.pod({ mass: 80 });
  f.ticks(); f.ticks();
  assert.equal(kesslerLines(f).length, 1, 'still once');
  assert.equal(watchOf(f).second.count, 2);
  assert.equal(first.alive, true); assert.equal(second.alive, true);
  assert.equal(first.data.kesslerReceipt.trueRead, 40);
  assert.match(first.data.scanLabel, /Iron freight · WEIGHED 37\.6 t · STAMP 40\.0 t · 17 u/);
  assert.match(second.data.scanLabel, /Iron freight · WEIGHED 56\.4 t · STAMP 60\.0 t · 17 u/);

  // Re-init (the real system lifecycle on sector re-entry) does not replay the line.
  f.system.init({ state: f.state, bus: f.bus, helpers: f.helpers });
  f.ticks();
  assert.equal(kesslerLines(f).length, 1);
});

test('an equal displayed stamp cannot corroborate; a different displayed tenth can', () => {
  const f = fixture();
  f.pod({ mass: 40 });
  f.ticks();
  f.pod({ mass: 40 });
  f.ticks();
  assert.equal(f.reads().length, 2);
  assert.equal(watchOf(f).second, null, 'same stamped load is not the promised different load');
  assert.equal(kesslerLines(f).length, 0);
  assert.match(f.beacon().data.scanLabel, /plate 37\.6t \/ stamp 40\.0t/);

  // Below one displayed tenth is still the same number on the board.
  f.pod({ mass: 40.04 });
  f.ticks();
  assert.equal(f.reads().length, 3);
  assert.equal(watchOf(f).second, null, 'equality follows the displayed tenth, not a hidden threshold');

  f.pod({ mass: 45 });
  f.ticks();
  assert.equal(watchOf(f).second.stamp, 45);
  assert.equal(watchOf(f).second.count, 4);
  assert.equal(f.beacon().data.scanLabel, 'PLATE 42.3 t · STAMP 45.0 t');
  assert.equal(kesslerLines(f).length, 1);
});

test('a pod whose plate rounds to its stamp is not a comparison sample; count stays monotonic', () => {
  const f = fixture();
  f.pod({ mass: 0.5 }); // plate 0.5 == stamp 0.5 — no disagreement, not a sample
  f.ticks();
  assert.equal(f.reads().length, 1);
  assert.equal(watchOf(f), undefined);
  assert.equal(f.state.story.flags[KESSLER_SCALE.countFlag], 1, 'the weigh still counts');
  f.pod({ mass: 50 });
  f.ticks();
  assert.deepEqual(watchOf(f).first, { plate: 47, stamp: 50, count: 2 }, 'the next real sample starts the pair at its own count');
  assert.equal(kesslerLines(f).length, 0);
});

test('saved story flags restore the pair without replaying the line; nothing is minted on Continue', () => {
  const f = fixture();
  f.pod();
  f.ticks();
  f.pod({ mass: 60 });
  f.ticks();
  assert.equal(kesslerLines(f).length, 1);
  const serialized = save._serializeMissions.call({ state: f.state });
  const flags = JSON.parse(JSON.stringify(serialized.story.flags));
  assert.equal(flags[KESSLER_SCALE.comparisonSpokenFlag], true);
  assert.equal(flags[KESSLER_SCALE.comparisonFlag].second.stamp, 60);

  const g = fixture({ story: { flags } });
  g.ticks(); g.ticks();
  assert.equal(kesslerLines(g).length, 0, 'the delivered line never replays on Continue');
  assert.equal(g.said.length, 0, 'no other voice line is owed');
  assert.equal(g.events.some(([n]) => n === 'economy:grantCredits' || n === 'faction:repDelta'), false);
  // A fresh different load still reads — but the earned pair is already full.
  g.pod({ mass: 25 });
  g.ticks();
  assert.equal(g.reads().length, 1);
  assert.equal(watchOf(g).second.stamp, 60);
  assert.equal(kesslerLines(g).length, 0);
});

test('old saves with no comparison record show nothing and replay nothing on Continue', () => {
  const flags = { kessler_variance_seen: true, kessler_reads_counted: 3, kessler_scale_announced: true };
  const g = fixture({ story: { flags: JSON.parse(JSON.stringify(flags)) } });
  g.ticks(); g.ticks();
  assert.equal(watchOf(g), undefined);
  assert.equal(kesslerLines(g).length, 0);
  assert.equal(g.events.filter(([n]) => n === 'comms:popup').length, 0, 'no popups were owed');
  // The record begins only when the next real pod is weighed after the upgrade.
  g.pod({ mass: 30 });
  g.ticks();
  assert.deepEqual(watchOf(g), { version: 1, first: { plate: 28.2, stamp: 30, count: 4 }, second: null });
});

test('when the story-line voice cannot take the line the toast fallback carries it once', () => {
  const f = fixture();
  f.helpers.voice.say = () => false;
  f.pod();
  f.ticks();
  f.pod({ mass: 60 });
  f.ticks();
  const toasts = f.events.filter(([n, p]) => n === 'toast' && p.text === KESSLER_SCALE.comparisonLine);
  assert.equal(toasts.length, 1);
  assert.equal(toasts[0][1].kind, 'story');
  assert.equal(f.state.story.flags[KESSLER_SCALE.comparisonSpokenFlag], true);
  f.ticks();
  assert.equal(f.events.filter(([n, p]) => n === 'toast' && p.text === KESSLER_SCALE.comparisonLine).length, 1);
});

test('the record is a bounded fact — a malformed or replayed one is re-earned, never honored', () => {
  const f = fixture({ story: { flags: { [KESSLER_SCALE.comparisonFlag]: { version: 1, first: { plate: 'x' }, second: null }, [KESSLER_SCALE.comparisonSpokenFlag]: true } } });
  f.pod({ mass: 40 });
  f.ticks();
  // A corrupt first cannot gate anything: the fresh pod re-earns the pair honestly.
  assert.deepEqual(watchOf(f).first, { plate: 37.6, stamp: 40, count: 1 });
  f.pod({ mass: 60 });
  f.ticks();
  assert.equal(watchOf(f).second.stamp, 60);
  // The stale spoken latch still suppresses the line — nothing replays, even for a re-earned pair.
  assert.equal(kesslerLines(f).length, 0);
});
