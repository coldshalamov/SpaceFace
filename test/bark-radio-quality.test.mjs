// test/bark-radio-quality.test.mjs — radio quality-pass pins.
//
// The correctness packet proved the corpus reaches the sim; this file pins how the channel
// *behaves*: a crippled hull calls for help live, a queued line never surfaces from a dead
// speaker, the sector hears one voice at a time, scans serialize like hails, a far patrol
// scans silently, the mic rotates between hulls, and a faction never repeats the same line
// back-to-back. On the audio side: chatter defers behind the open mic (bounded), the squelch
// tail/caption ride the heard duration, bearing pans the radio, the voice slider scales the
// body gain, and a dying hull gets the danger squelch instead of a tidy tail.

import test from 'node:test';
import assert from 'node:assert/strict';

import { createBus } from '../src/core/eventBus.js';
import { createSimulation } from '../src/core/sim.js';
import { BARKS, BARK_FACTIONS, barkFor } from '../src/data/barks.js';
import { barkDirector, classifyBarkSituation, SCAN_AMBIENT_GAP_S } from '../src/systems/barkDirector.js';
import { voiceArbiter } from '../src/ui/voiceArbiter.js';
import { audio, BARK_PUNCT, BARK_CHATTER, COMMS_DUCK } from '../src/audio/audioSystem.js';
import { BARK_RECIPE_ID, FACTION_VOICE_REGISTERS, resolveBarkVoice } from '../src/audio/barkVoice.js';
import { barkPlaybackRate } from '../src/audio/barkPcmCache.js';

const SEED = 9173;

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
      type: 'ship',
      team: spec.team ?? 1,
      alive: true,
      factionId: spec.factionId || 'faction_scn',
      pos: { x: spec.x ?? 0, z: spec.z ?? 0 },
      vel: { x: 0, z: 0 },
      hull: spec.hull,
      hullMax: spec.hullMax,
      data: spec.data || {},
      flags: spec.flags,
    };
    entities.set(entity.id, entity);
    state.entityList.push(entity);
    return entity;
  };
  add({ id: 1, type: 'ship', team: 0, x: 0, z: 0 });
  const says = [];
  const receipts = [];
  bus.on('barkDirector:voice', (p) => receipts.push(p));
  const voice = { say: (req) => { says.push(req); return true; } };
  barkDirector.init({ state, bus, helpers: { voice } });
  return { bus, state, add, says, receipts };
}

function audioHost(over = {}) {
  const plays = [];
  const captions = [];
  const host = Object.create(audio);
  host.play = (recipeId, opts) => { plays.push({ recipeId, opts }); return { recipeId }; };
  host.bus = { emit(ev, p) { captions.push({ ev, p }); } };
  // 'suspended' keeps the PCM-cache branch out of the mock — the scheduling contract is
  // what is pinned, not the buffer render (that is byte-pinned elsewhere).
  host.rt = { ctx: { currentTime: 5, state: 'suspended' } };
  host.state = over.state || {};
  if (over.rt) Object.assign(host.rt, over.rt);
  return { host, plays, captions };
}

test.afterEach(() => { barkDirector.destroy(); });

test('a crippled hull calls for help instead of barking its flee', () => {
  const h = makeHarness();
  const limper = h.add({ id: 10, team: 2, hull: 30, hullMax: 100, data: { ai: { fsm: 'flee' } } });
  assert.equal(classifyBarkSituation(limper, h.state), 'distress');
  limper.hull = 90;
  assert.equal(classifyBarkSituation(limper, h.state), 'flee');
  // A disabled crippled hull maydays even without a flee intent; a fighting cripple fights.
  const dead = h.add({ id: 11, team: 2, hull: 20, hullMax: 100, data: { ai: {} }, flags: { disabled: true } });
  assert.equal(classifyBarkSituation(dead, h.state), 'distress');
  const fighter = h.add({
    id: 12, team: 2, hull: 20, hullMax: 100,
    data: { ai: { fsm: 'attack' }, combat: { targetId: 1 }, intent: { fire: true } },
  });
  assert.equal(classifyBarkSituation(fighter, h.state), 'attack');
});

test('the live mayday airs from the victim\'s own register through the director', () => {
  const h = makeHarness();
  const limper = h.add({
    id: 20, team: 2, factionId: 'faction_quiet', hull: 25, hullMax: 100,
    data: { ai: { fsm: 'flee' } },
  });
  const situation = classifyBarkSituation(limper, h.state);
  assert.equal(barkDirector._speak(limper, situation, 'test'), true);
  assert.equal(h.receipts.length, 1);
  assert.equal(h.receipts[0].situation, 'distress');
  assert.ok(BARKS.faction_quiet.distress.includes(h.receipts[0].text),
    `expected a quiet mayday, got: ${h.receipts[0].text}`);
});

test('a queued bark never surfaces from a hull that dies waiting', () => {
  const sim = createSimulation({ seed: 77, systems: [barkDirector, voiceArbiter] });
  const { state, bus } = sim;
  state.mode = 'flight';
  const player = sim.spawn({ type: 'ship', team: 0, pos: { x: 0, z: 0 }, data: { defId: 'ship_kestrel' } });
  state.playerId = player.id;
  const dead = sim.spawn({
    type: 'ship', team: 2, factionId: 'faction_free', pos: { x: 60, z: 0 },
    data: { ai: { fsm: 'pursue', hostileTeams: [0] } },
  });
  const live = sim.spawn({
    type: 'ship', team: 2, factionId: 'faction_free', pos: { x: 80, z: 0 },
    data: { ai: { fsm: 'pursue', hostileTeams: [0] } },
  });
  const surfaced = [];
  bus.on('voice:surface', (p) => surfaced.push(p));
  bus.emit('ai:flee', { entityId: dead.id });
  bus.emit('ai:flee', { entityId: live.id });
  dead.alive = false;
  for (let i = 0; i < 240; i++) sim.step();
  assert.ok(surfaced.some((p) => String(p.id).includes(String(live.id))),
    'the living hull\'s flee should surface');
  assert.ok(!surfaced.some((p) => String(p.id).includes(String(dead.id))),
    'a hull that died while queued must not pill posthumously');
});

test('sector scans serialize: the second hull waits out the gap, then still speaks', () => {
  const h = makeHarness();
  const e1 = h.add({ id: 30, team: 2, data: { ai: { fsm: 'scan', lawful: true } }, x: 10 });
  const e2 = h.add({ id: 31, team: 2, data: { ai: { fsm: 'scan', lawful: true } }, x: 12 });
  assert.equal(barkDirector._speak(e1, 'scan', 'test'), true);
  assert.equal(barkDirector._speak(e2, 'scan', 'test'), false,
    'two lawful hulls must not key the mic on the same tick');
  h.state.simTime = SCAN_AMBIENT_GAP_S + 2;
  assert.equal(barkDirector._speak(e2, 'scan', 'test'), true,
    'serialization defers the scan — it must not burn the hull\'s one line');
});

test('a lawful patrol beyond hail range scans silently', () => {
  const h = makeHarness();
  const far = h.add({ id: 40, team: 2, data: { ai: { fsm: 'scan', lawful: true } }, x: 2000 });
  assert.notEqual(classifyBarkSituation(far, h.state), 'scan');
  const near = h.add({ id: 41, team: 2, data: { ai: { fsm: 'scan', lawful: true } }, x: 100 });
  assert.equal(classifyBarkSituation(near, h.state), 'scan');
});

test('the mic rotates: the last speaker waits out a double gap while another hull greets', () => {
  const h = makeHarness();
  const a = h.add({ id: 50, team: 2, data: { ai: { fsm: 'scan', lawful: true } }, x: 10 });
  const b = h.add({ id: 51, team: 2, data: { ai: { fsm: 'patrol', lawful: true } }, x: 12 });
  assert.equal(barkDirector._speak(a, 'scan', 'test'), true); // a owns the channel
  assert.equal(barkDirector._speak(a, 'patrol-greeting', 'test'), false,
    'the hull that just spoke rotates out of the greeting');
  assert.equal(barkDirector._speak(b, 'patrol-greeting', 'test'), true,
    'a different hull takes the open channel instead');
});

test('a faction never repeats the same line back-to-back on the air', () => {
  const h = makeHarness();
  const w1 = h.add({ id: 60, team: 2, factionId: 'faction_dmc', data: { ai: { fsm: 'attack' } } });
  const w2 = h.add({ id: 61, team: 2, factionId: 'faction_dmc', data: { ai: { fsm: 'attack' } } });
  assert.equal(barkDirector._speak(w1, 'warn', 'test'), true);
  assert.equal(barkDirector._speak(w2, 'warn', 'test'), true);
  assert.notEqual(h.says[0].text, h.says[1].text,
    'a colliding pick must re-pick — a verbatim rerun reads as a broken radio');
});

test('session notice-key ledgers stay bounded', () => {
  makeHarness();
  for (let i = 0; i < 80; i++) barkDirector._markNoticeKey('_testNoticeKeys', `k${i}`);
  assert.ok(barkDirector._testNoticeKeys.size <= 64, `ledger grew to ${barkDirector._testNoticeKeys.size}`);
  assert.equal(barkDirector._markNoticeKey('_testNoticeKeys', 'k79'), false, 'newest key still dedupes');
  assert.equal(barkDirector._markNoticeKey('_testNoticeKeys', 'k0'), true, 'evicted key may re-notice');
});

test('chatter defers behind the open mic, then drops past the cap', () => {
  const { host, plays } = audioHost({ rt: { _commsChatterUntilS: 6.5 } });
  host._onBarkVoice({ factionId: 'faction_quiet', situation: 'scan', text: 'Hold for inspection.' });
  const body = plays.find((p) => p.recipeId === BARK_RECIPE_ID);
  assert.ok(body, 'a deferred line still plays');
  assert.ok(body.opts.startTime >= 6.5 + BARK_PUNCT.keyLeadS - 1e-6,
    `body must wait for the open mic (got startTime ${body.opts.startTime})`);
  assert.ok(host.rt._commsChatterUntilS > 6.5, 'the mic stays marked busy after the deferred line');

  const drop = audioHost({ rt: { _commsChatterUntilS: 5 + BARK_CHATTER.deferCapS + 1 } });
  drop.host._onBarkVoice({ factionId: 'faction_quiet', situation: 'scan', text: 'Hold for inspection.' });
  assert.equal(drop.plays.length, 0, 'a line that would wait past the cap drops rather than arrive late');
});

test('the squelch tail and duck ride the heard duration, not the authored seconds', () => {
  const slowest = BARK_FACTIONS
    .map((id) => ({ id, rate: FACTION_VOICE_REGISTERS[id].rate }))
    .sort((a, b) => a.rate - b.rate)[0];
  const line = barkFor(slowest.id, 'taunt', 0);
  const resolved = resolveBarkVoice({ factionId: slowest.id, situation: 'taunt', line });
  const rate = barkPlaybackRate(resolved);
  const heard = resolved.speech.durationS / rate;
  assert.ok(rate < 1, 'the pin wants a slow register — re-pick the fixture if registers change');
  const { host, plays, captions } = audioHost();
  host._onBarkVoice({ factionId: slowest.id, situation: 'taunt', text: line });
  const tail = plays.find((p) => p.recipeId === 'sfx_comms_squelch_tail');
  assert.ok(tail, 'a normal squelch tail plays');
  const expectedTail = 5 + BARK_PUNCT.keyLeadS + heard + BARK_PUNCT.tailPadS;
  assert.ok(Math.abs(tail.opts.startTime - expectedTail) < 1e-6,
    `tail at ${tail.opts.startTime}, expected ${expectedTail} (heard duration ${heard}s)`);
  assert.ok(tail.opts.startTime > 5 + BARK_PUNCT.keyLeadS + resolved.speech.durationS + BARK_PUNCT.tailPadS,
    'a slow register must not have its tail chirp mid-word');
  const body = plays.find((p) => p.recipeId === BARK_RECIPE_ID);
  const expectedDuck = BARK_PUNCT.keyLeadS + heard + BARK_PUNCT.tailPadS + COMMS_DUCK.releasePadS;
  assert.ok(Math.abs(body.opts.duckSeconds - expectedDuck) < 1e-6);
  // The caption releases at the voice-body start, not at admission — drain the clock to it.
  host.rt.ctx.currentTime = 5 + BARK_PUNCT.keyLeadS + 0.01;
  host._drainBarkPlumbing(host.rt.ctx.currentTime, 0);
  const cap = captions.find((c) => c.ev === 'presentation:caption');
  const expectedMs = Math.ceil((BARK_PUNCT.keyLeadS + heard + BARK_PUNCT.tailPadS + 0.3) * 1000);
  assert.equal(cap.p.durationMs, expectedMs, 'the caption lives as long as the line is heard');
});

test('the radio pans to the speaker\'s bearing without distance culling', () => {
  const entities = new Map();
  entities.set('player', { id: 'player', pos: { x: 0, z: 0 } });
  entities.set('right', { id: 'right', pos: { x: 400, z: 0 } });
  entities.set('left', { id: 'left', pos: { x: -400, z: 0 } });
  const { host, plays } = audioHost({ state: { playerId: 'player', entities } });
  host._onBarkVoice({ factionId: 'faction_dmc', situation: 'taunt', text: 'Move.', entityId: 'right' });
  const rightPlay = plays.find((p) => p.recipeId === BARK_RECIPE_ID);
  assert.ok(rightPlay.opts.pan > 0, 'a speaker to starboard pans right');
  plays.length = 0;
  host._onBarkVoice({ factionId: 'faction_dmc', situation: 'taunt', text: 'Move.', entityId: 'left' });
  assert.ok(plays.find((p) => p.recipeId === BARK_RECIPE_ID).opts.pan < 0, 'a speaker to port pans left');
  plays.length = 0;
  host._onBarkVoice({ factionId: 'faction_dmc', situation: 'taunt', text: 'Move.' });
  assert.equal(plays.find((p) => p.recipeId === BARK_RECIPE_ID).opts.pan, 0, 'no bearing pans center');
});

test('the voice slider scales the bark body gain', () => {
  const resolved = resolveBarkVoice({ factionId: 'faction_choir', situation: 'taunt', line: 'Sing.' });
  const { host, plays } = audioHost({ rt: { _barkVoiceScale: 0.5 } });
  host._onBarkVoice({ factionId: 'faction_choir', situation: 'taunt', text: 'Sing.' });
  const body = plays.find((p) => p.recipeId === BARK_RECIPE_ID);
  assert.ok(Math.abs(body.opts.gain - resolved.gain * 0.5) < 1e-9,
    `voice slider must scale the heard body (got ${body.opts.gain})`);
});

test('a dying hull gets the danger squelch, not the tidy tail', () => {
  const { host, plays } = audioHost();
  host._onBarkVoice({ factionId: 'faction_free', situation: 'distress', text: 'Hull is open.' });
  assert.ok(plays.some((p) => p.recipeId === 'sfx_squelch_danger'), 'distress rides the danger squelch');
  assert.ok(!plays.some((p) => p.recipeId === 'sfx_comms_squelch_tail'), 'no tidy tail for a mayday');
});

test('corpus lines are broadcast-shaped: short, token-free, and unique across cells', () => {
  const seen = new Map();
  let total = 0;
  for (const [factionId, cell] of Object.entries(BARKS)) {
    for (const [situation, lines] of Object.entries(cell)) {
      if (!Array.isArray(lines)) continue;
      for (const line of lines) {
        total++;
        assert.ok(typeof line === 'string' && line.trim().length > 0, `${factionId}/${situation} empty line`);
        assert.ok(line.split(/\s+/).length <= 32,
          `${factionId}/${situation} line runs long for a bark: ${line}`);
        assert.ok(!/[{}]/.test(line), `${factionId}/${situation} unresolved token: ${line}`);
        assert.ok(!/[\x00-\x1f\x7f]/.test(line), `${factionId}/${situation} control char`);
        const prev = seen.get(line);
        assert.ok(!prev, `"${line}" is duplicated in ${prev} and ${factionId}/${situation}`);
        seen.set(line, `${factionId}/${situation}`);
      }
    }
  }
  assert.ok(total >= 1399, `corpus shrank to ${total}`);
});

test('the mechanic does not rerun a line he already said this session', () => {
  const { host, plays } = audioHost();
  host._syncEnvironmentMix = () => {};
  host._markMusicDirty = () => {};
  host._startStationHum = () => {};
  host.state = { player: { cargo: { dockSpill: { commodityId: 'cmdty_ore_iron', count: 2 } } } };
  host._onDocked({ stationId: 'station_test' });
  const firstCount = plays.filter((p) => p.recipeId === BARK_RECIPE_ID).length;
  assert.equal(firstCount, 1, 'the dock speaks the filed spill line');
  host._onDocked({ stationId: 'station_test' });
  assert.equal(plays.filter((p) => p.recipeId === BARK_RECIPE_ID).length, 1,
    'the second dock stays silent — a verbatim rerun reads as a broken radio');
});

test('an arbiter-bound bark holds its voice until the real floor surface', () => {
  const { host, plays } = audioHost();
  const voiceId = 'barkDirector:9:scan';
  host._onBarkVoice({ factionId: 'faction_dmc', situation: 'scan', text: 'Hold open.', voiceId });
  assert.equal(plays.filter((p) => p.recipeId === BARK_RECIPE_ID).length, 0,
    'a queued bark must not sound before its floor surfaces');
  host._onVoiceSurfaceForBarks({ id: 'unrelated:floor', kind: 'objective', text: 'other' });
  assert.equal(plays.filter((p) => p.recipeId === BARK_RECIPE_ID).length, 0,
    'a foreign surface does not release the queued bark');
  host._onVoiceSurfaceForBarks({ id: voiceId, kind: 'barkDirector', text: 'Hold open.' });
  assert.equal(plays.filter((p) => p.recipeId === BARK_RECIPE_ID).length, 1,
    'the bark keys the moment its own floor surfaces');
});

test('a bark the arbiter drops is never heard', () => {
  const { host, plays } = audioHost();
  host._onBarkVoice({ factionId: 'faction_dmc', situation: 'scan', text: 'Gone quiet.', voiceId: 'barkDirector:9:scan' });
  // The entry never surfaces (dead speaker, preempted, ttl): the sweep retires the pending spec.
  host._drainBarkPlumbing(6, Number.MAX_SAFE_INTEGER / 2);
  host._onVoiceSurfaceForBarks({ id: 'barkDirector:9:scan', kind: 'barkDirector', text: 'Gone quiet.' });
  assert.equal(plays.filter((p) => p.recipeId === BARK_RECIPE_ID).length, 0,
    'a swept pending voice must not resurrect on a late surface');
  assert.equal(plays.length, 0, 'nothing was scheduled for a dropped line');
});

test('a surface that lands before its receipt still releases the voice', () => {
  const { host, plays } = audioHost();
  const voiceId = 'barkDirector:4:warn';
  // The same-id in-place resurface inside say() can fire before barkDirector:voice lands.
  host._onVoiceSurfaceForBarks({ id: voiceId, kind: 'barkDirector', text: 'Close one.' });
  host._onBarkVoice({ factionId: 'faction_dmc', situation: 'warn', text: 'Close one.', voiceId });
  assert.equal(plays.filter((p) => p.recipeId === BARK_RECIPE_ID).length, 1,
    'the receipt finds the early surface marker and plays now, not never');
});

test('a held bark keeps its caption until the voice body actually starts', () => {
  const { host, plays, captions } = audioHost();
  const line = barkFor('faction_dmc', 'scan', 0);
  const resolved = resolveBarkVoice({ factionId: 'faction_dmc', situation: 'scan', line });
  const heard = resolved.speech.durationS / barkPlaybackRate(resolved);
  // The mic is already open: chatter holds this line's start well past admission.
  host.rt._commsChatterUntilS = 5 + heard + 2;
  host._onBarkVoice({ factionId: 'faction_dmc', situation: 'scan', text: line });
  assert.equal(captions.filter((c) => c.ev === 'presentation:caption').length, 0,
    'the caption must not run ahead of the deferred voice');
  const bodyStart = 5 + heard + 2 + BARK_PUNCT.keyLeadS;
  host.rt.ctx.currentTime = bodyStart + 0.01;
  host._drainBarkPlumbing(host.rt.ctx.currentTime, 0);
  assert.equal(captions.filter((c) => c.ev === 'presentation:caption').length, 1,
    'the caption lands when the voice body starts, not before');
  const cap = captions.find((c) => c.ev === 'presentation:caption');
  assert.equal(cap.p.shape, 'radio');
});
