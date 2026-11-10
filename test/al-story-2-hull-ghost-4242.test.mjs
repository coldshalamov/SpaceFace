// AL-STORY-2 (build-map row 424) — the Hull Ghost feels present aboard the player's ship.
//
// DONE WHEN: on seed 4242 a deterministic 30-minute first-route fixture delivers at least eight
// distinct Captain Maera Vols lines with real event evidence, covering sector, story, stunt and
// near-miss; ordinary commentary never repeats (including after danger preemption and a same-session
// load), never competes with combat pressure or onboarding, lets genuine warnings through, starts
// audio only when the matching caption wins the real voice floor, and mutates nothing.
//
// Every assertion drives the REAL sound owner (audio.init on a real bus, play() stubbed) and the REAL
// voice arbiter. Nothing here sleeps or reads a wall clock: state.tick / state.simTime at 1/60 only.
//
// Scope note: this verifies the existing directed SYNTHETIC bark routing (bark_dmc body through the
// radio recipe with key-click/squelch punctuation). It does not prove intelligible actor speech,
// recorded performance, or listening quality — no recorded actor exists for this contact.
import assert from 'node:assert/strict';
import test from 'node:test';

import { createGameState } from '../src/core/gameState.js';
import { createBus } from '../src/core/eventBus.js';
import { DANGER_PRIORITY, voiceArbiter } from '../src/ui/voiceArbiter.js';
import { MAERA_FLIGHT_LINES } from '../src/data/barks.js';
import {
  CONTACT_MAERA_ID,
  MAERA_VOICE_REGISTER,
  resolveBarkVoice,
  resolveVoiceRegister,
} from '../src/audio/barkVoice.js';
import { BARK_PUNCT, audio } from '../src/audio/audioSystem.js';
import {
  PRODUCTION_INIT_ORDER,
  PRODUCTION_UPDATE_ORDER,
} from '../src/runtime/authoritativeSystemManifest.js';

const SEED = 4242;
const TICK = 1 / 60;
const FLOOR_PREFIX = 'maera:';
const LINE_BY_ID = new Map(MAERA_FLIGHT_LINES.map((line) => [line.id, line]));
const LINE_BY_TEXT = new Map(MAERA_FLIGHT_LINES.map((line) => [line.text, line]));

// ── harness ─────────────────────────────────────────────────────────────────────────────────────

function boot({
  onboarding = { active: false, finished: true, step: 'done' },
  mode = 'flight',
  docked = false,
  run = null,
  withAudio = false,
} = {}) {
  const state = createGameState(SEED);
  state.mode = mode;
  state.onboarding = { ...onboarding };
  state.ui.docked = docked;
  if (run) state.run = { ...state.run, ...run };
  const player = {
    id: 1, type: 'ship', alive: true, team: 0,
    pos: { x: 0, z: 0 }, vel: { x: 0, z: 0 },
  };
  state.playerId = 1;
  state.entities.set(1, player);
  state.entityList = [player];

  const bus = createBus();
  const helpers = {};
  const surfaces = [];
  const barks = [];
  const cleared = [];
  bus.on('voice:surface', (p) => surfaces.push({ ...p, tick: state.tick }));
  bus.on('voice:clear', (p) => cleared.push(p.id));
  bus.on('barkDirector:voice', (p) => barks.push({ ...p, tick: state.tick }));

  const played = [];
  let host = null;
  if (withAudio) {
    host = Object.create(audio);
    host.play = (recipeId, opts) => { played.push({ recipeId, opts, tick: state.tick }); return null; };
    host.init({ state, bus, helpers });
  }

  const arbiter = Object.create(voiceArbiter);
  arbiter.init({ bus, state, helpers });
  return { state, bus, helpers, surfaces, barks, cleared, played, host, arbiter };
}

/** Floors this session surfaced for Maera (the only lines this fixture can produce). */
function maeraFloors(env) {
  return env.surfaces.filter((s) => String(s.id || '').startsWith(FLOOR_PREFIX));
}

function maeraBarks(env) {
  return env.barks.filter((b) => b.factionId === CONTACT_MAERA_ID);
}

function step(env, ticks = 1) {
  const { state, arbiter } = env;
  for (let i = 0; i < ticks; i++) {
    state.tick += 1;
    state.simTime = state.tick / 60;
    arbiter.update(TICK, state);
  }
}

function advance(env, seconds) {
  step(env, Math.round(seconds * 60));
}

/**
 * Drive the fixed 30-minute route. Events fire at their exact tick, then the arbiter updates for
 * that tick — the same order the live loop runs (authority event, then systems).
 */
function runRoute(env, events, { seconds = 1800 } = {}) {
  const { state, bus, arbiter } = env;
  const byTick = new Map();
  for (const event of events) {
    const tick = Math.round(event.at * 60);
    if (!byTick.has(tick)) byTick.set(tick, []);
    byTick.get(tick).push(event);
  }
  state.tick = 0;
  state.simTime = 0;
  const fire = (tick) => {
    for (const event of byTick.get(tick) || []) {
      if (typeof event.mutate === 'function') event.mutate(state);
      if (event.event) bus.emit(event.event, event.payload);
    }
  };
  fire(0);
  arbiter.update(TICK, state);
  for (let i = 1; i <= seconds * 60; i++) {
    state.tick = i;
    state.simTime = i / 60;
    fire(i);
    arbiter.update(TICK, state);
  }
}

// Canonical live payload shapes (physics.js, attachments.js, tetherGameplay.js, economy.js,
// missions.js, world.js, stuntGrammar.js, damage.js).
const ROUTE = [
  { at: 0, event: 'sector:enter', payload: { sectorId: 'sector_helios_prime', firstVisit: true } },
  { at: 30, event: 'tether:attached', payload: { actorId: 1, targetId: 5, attachmentId: 'att-1', attachmentDefId: 'massline_standard' } },
  { at: 60, event: 'tether:released', payload: { targetId: 5 } },
  { at: 90, event: 'pickup:collected', payload: { pickupId: 12, collectorId: 1, kind: 'commodity', amount: 3, commodityId: 'ore_iron', pos: { x: 4, z: 6 } } },
  { at: 150, mutate: (s) => { s.onboarding = { active: false, finished: true, step: 'done' }; } },
  { at: 240, event: 'story:beatAdvanced', payload: { fromIndex: 0, toIndex: 1 } },
  { at: 360, mutate: (s) => { s.ui.docked = false; }, event: 'dock:undocked', payload: { committed: true, intent: 'explicit', source: 'sx-dock' } },
  { at: 600, event: 'sector:enter', payload: { sectorId: 'sector_ceres_belt', firstVisit: true } },
  { at: 780, mutate: (s) => { s.ui.docked = true; }, event: 'economy:tradeCompleted', payload: { stationId: 'station_ceres', commodityId: 'ore_iron', side: 'sell', qty: 4, unitAvg: 21, total: 84 } },
  { at: 810, mutate: (s) => { s.ui.docked = false; } },
  { at: 1050, event: 'stunt:trickDetected', payload: { trickId: 'needle_thread', actorId: 1, episodeId: 'ep-4242-1', rootId: 'ep-4242-1', tick: 63000 } },
  { at: 1078, event: 'combat:damage', payload: { targetId: 1, attackerId: 9, hullDamage: 4, isPlayer: true } },
  { at: 1080, event: 'projectile:nearMiss', payload: { projectileId: 77, ownerId: 9, targetId: 1, weaponId: 'wpn_rail', speed: 220, distance: 3.5 } },
];

function payableDifferences(before, after) {
  const paths = [
    ['credits', (s) => s.player.credits],
    ['cargo', (s) => JSON.stringify(s.player.cargo || {})],
    ['hull', (s) => (s.entities.get(s.playerId) || {}).hull],
    ['heat', (s) => JSON.stringify(s.heat || {})],
    ['factions', (s) => JSON.stringify(s.factions || {})],
    ['story', (s) => JSON.stringify(s.story || {})],
  ];
  const out = [];
  for (const [name, read] of paths) {
    const a = read(before);
    const b = read(after);
    if (JSON.stringify(a) !== JSON.stringify(b)) out.push(name);
  }
  return out;
}

// ── 1. Thirty-minute event-route fixture ────────────────────────────────────────────────────────

test('seed 4242: a 30-minute first route delivers at least eight distinct Hull Ghost lines across sector, story, stunt and near-miss', () => {
  const env = boot({ onboarding: { active: true, finished: false, startedAt: 0, step: 'thrust' } });
  runRoute(env, ROUTE, { seconds: 1800 });

  const floors = maeraFloors(env);
  const ids = floors.map((floor) => String(floor.id).slice(FLOOR_PREFIX.length));
  assert.ok(ids.length >= 8, `expected at least 8 distinct Maera lines by 1800 s, got ${ids.length}: ${ids.join(', ')}`);
  assert.equal(new Set(ids).size, ids.length, 'no floor ID may repeat inside one session');

  const categories = new Set(ids.map((id) => LINE_BY_ID.get(id).category));
  for (const required of ['sector', 'story', 'stunt', 'near_miss']) {
    assert.ok(categories.has(required), `the route must surface a ${required} line; got ${[...categories].join(', ')}`);
  }
  assert.ok(ids.includes('maera_helios') && ids.includes('maera_ceres'), 'both remembered sectors speak');
  assert.ok(ids.includes('maera_needle'), 'the specific needle-thread reaction outranks the generic stunt line');
  assert.ok(!ids.includes('maera_stunt'), 'one stunt event selects exactly one line');

  // Every surfaced line carries the evidence of the event that caused it, the authored text the
  // caption used, and the audio payload the radio owner received.
  const delivered = env.arbiter._maera.delivered;
  for (const id of ids) {
    const line = LINE_BY_ID.get(id);
    const record = delivered.get(id);
    assert.ok(record, `${id} must keep the scalar evidence record that produced it`);
    assert.equal(record.lineId, id);
    assert.equal(record.sourceEvent, line.event);
    assert.ok(Number.isFinite(record.observedAtS), `${id} must record when the moment happened`);
    assert.ok(record.expiresAtS > record.observedAtS, `${id} must record its freshness window`);

    const floor = floors.find((f) => f.id === `maera:${id}`);
    assert.equal(floor.text, `Captain Maera Vols: ${line.text}`, 'the caption names the speaker and quotes the authored line');

    const bark = env.barks.find((b) => b.text === line.text);
    assert.ok(bark, `${id} must reach the audio consumer with its authored line`);
    assert.equal(bark.factionId, CONTACT_MAERA_ID);
    assert.equal(bark.situation, line.warning ? 'warn' : 'patrol-greeting');
    assert.equal(bark.importance, line.warning ? 1 : 0.3);
  }

  // The route's non-combat lines are ordinary flavor and wait their turn; the warning is danger.
  const nearMiss = floors.find((f) => f.id === 'maera:maera_near_miss');
  assert.equal(nearMiss.channel, 'alert');
  assert.equal(nearMiss.priority, DANGER_PRIORITY);
  for (const id of ids.filter((x) => x !== 'maera_near_miss')) {
    const floor = floors.find((f) => f.id === `maera:${id}`);
    assert.equal(floor.channel, 'bark', `${id} must ride the ordinary bark channel`);
    assert.equal(floor.priority, 54, `${id} is flavor: above plain bark, below comms`);
  }

  // Ordinary lines respect the 45 s breathing room; the warning does not wait for it.
  const ordinaryTicks = floors
    .filter((f) => f.channel === 'bark')
    .map((f) => f.tick);
  for (let i = 1; i < ordinaryTicks.length; i++) {
    assert.ok(ordinaryTicks[i] - ordinaryTicks[i - 1] >= 45 * 60 - 1,
      'two ordinary Maera lines may not crowd the floor closer than 45 sim seconds');
  }

  // Then ten minutes of idle flight: nothing new is invented.
  const before = maeraFloors(env).length;
  advance(env, 600);
  assert.equal(maeraFloors(env).length, before, 'idle ticks must not manufacture commentary');
});

// ── 2. Deduplication and negative events ───────────────────────────────────────────────────────

test('duplicate, NPC, amended, malformed and unknown events never speak for Maera', () => {
  const env = boot();
  const { bus, state } = env;

  // A duplicate before delivery collapses into one pending line.
  bus.emit('sector:enter', { sectorId: 'sector_helios_prime' });
  bus.emit('sector:enter', { sectorId: 'sector_helios_prime' });
  assert.equal(env.arbiter._maera.pending.size, 1, 'a repeated event must not stack a second copy');
  step(env);
  assert.deepEqual(maeraFloors(env).map((f) => f.id), ['maera:maera_helios']);
  // ...and the same event after delivery is inert.
  bus.emit('sector:enter', { sectorId: 'sector_helios_prime' });
  advance(env, 60);
  assert.equal(maeraFloors(env).length, 1, 'a spent line is never spoken twice');

  // NPC and non-qualifying events.
  bus.emit('stunt:trickDetected', { trickId: 'needle_thread', actorId: 99, episodeId: 'npc-1' });
  bus.emit('stunt:trickDetected', { trickId: 'needle_thread', actorId: 1, episodeId: 'ep-2', amendment: true });
  bus.emit('stunt:trickDetected', { trickId: 'needle_thread', actorId: 1 });
  bus.emit('tether:attached', { actorId: 99, targetId: 42 });
  bus.emit('tether:released', { targetId: 42 });
  bus.emit('projectile:nearMiss', { projectileId: 2, targetId: 99, speed: 200, distance: 2 });
  bus.emit('pickup:collected', { collectorId: 99, amount: 4, commodityId: 'ore_iron' });
  bus.emit('pickup:collected', { collectorId: 1, amount: 0, commodityId: 'ore_iron' });
  bus.emit('economy:tradeCompleted', { side: 'sell', qty: 0, commodityId: 'ore_iron' });
  bus.emit('economy:tradeCompleted', { side: 'buy', qty: 5, commodityId: 'ore_iron' });
  bus.emit('story:beatAdvanced', { fromIndex: 3, toIndex: 1 }); // backward
  bus.emit('story:beatAdvanced', { fromIndex: 0 });             // malformed
  bus.emit('sector:enter', { sectorId: 'sector_nowhere' });     // unknown sector
  bus.emit('sector:enter', null);
  bus.emit('tether:released', null);
  bus.emit('projectile:nearMiss', { projectileId: 3, targetId: 1, speed: 0, distance: 2 });
  bus.emit('projectile:nearMiss', { targetId: 1, speed: 200, distance: 2 });
  assert.equal(env.arbiter._maera.pending.size, 0, `non-qualifying events must record nothing: ${[...env.arbiter._maera.pending.keys()].join(', ')}`);

  advance(env, 120);
  assert.equal(maeraFloors(env).length, 1, 'only the player sector entry spoke');

  // The player's own generic stunt still speaks once, and never twice.
  bus.emit('stunt:trickDetected', { trickId: 'barrel_roll', actorId: state.playerId, episodeId: 'ep-3' });
  advance(env, 60);
  bus.emit('stunt:trickDetected', { trickId: 'barrel_roll', actorId: state.playerId, episodeId: 'ep-4' });
  advance(env, 60);
  const ids = maeraFloors(env).map((f) => f.id);
  assert.deepEqual(ids, ['maera:maera_helios', 'maera:maera_stunt']);

  // No line ID or authored sentence repeats anywhere in the session.
  const texts = maeraFloors(env).map((f) => f.text);
  assert.equal(new Set(texts).size, texts.length, 'no surfaced text may repeat');
});

// ── 3. Combat and priority ────────────────────────────────────────────────────────────────────

test('a hostile pointed at the player inside 900 WU holds ordinary commentary; a warning still speaks', () => {
  const env = boot();
  const { state, bus } = env;
  const hostile = {
    id: 9, type: 'ship', alive: true, team: 1,
    pos: { x: 400, z: 0 }, data: { ai: { huntPlayer: true } },
  };
  state.entities.set(9, hostile);
  state.entityList.push(hostile);

  bus.emit('dock:undocked', { committed: true });
  advance(env, 1);
  assert.equal(maeraFloors(env).length, 0, 'a hostile inside 900 WU that is hunting the player keeps the room quiet');
  assert.equal(env.arbiter._maera.pending.size, 1, 'the moment is kept, not thrown away');

  advance(env, 10);
  assert.equal(maeraFloors(env).length, 0, 'pressure persists while the hostile holds its lock');

  // The genuine warning is danger-class and may speak over pressure.
  bus.emit('projectile:nearMiss', { projectileId: 55, targetId: state.playerId, speed: 240, distance: 3 });
  advance(env, 1);
  const warning = maeraFloors(env).at(-1);
  assert.equal(warning.id, 'maera:maera_near_miss');
  assert.equal(warning.channel, 'alert');
  assert.equal(warning.priority, DANGER_PRIORITY);
  assert.ok(warning.text.startsWith('Captain Maera Vols:'), 'the warning is still a named caption');

  // Pressure outlasts the lock by three sim seconds, then the queued ordinary line takes its turn.
  advance(env, 2.9);
  assert.equal(maeraFloors(env).length, 1, 'ordinary commentary waits out the three-second pressure window');
  hostile.alive = false; // the player broke contact
  advance(env, 3.2);
  assert.equal(maeraFloors(env).at(-1).id, 'maera:maera_undock');
});

test('player damage blocks ordinary commentary for three seconds after pressure clears', () => {
  const env = boot();
  const { bus, state } = env;
  bus.emit('dock:undocked', { committed: true });
  advance(env, 0.5);
  const deliveredAt = () => (maeraFloors(env).length ? env.arbiter._maera.lastNormalAtS : null);
  // The undock line speaks first (nothing is pressuring it)...
  assert.equal(maeraFloors(env).at(-1).id, 'maera:maera_undock');
  assert.ok(deliveredAt() != null);

  // ...then a second moment arrives, and a hit lands two seconds later.
  bus.emit('sector:enter', { sectorId: 'sector_ceres_belt' });
  advance(env, 2);
  bus.emit('combat:damage', { targetId: state.playerId, attackerId: 9, hullDamage: 3 });
  advance(env, 3);
  assert.equal(maeraFloors(env).length, 1, 'nothing speaks inside the three-second pressure window');

  // 45 s after the last ordinary line (and after pressure), the Ceres line finally speaks.
  advance(env, 40);
  assert.equal(maeraFloors(env).at(-1).id, 'maera:maera_ceres');
});

test('onboarding keeps the floor: tutorial still teaches and Maera waits', () => {
  const env = boot({ onboarding: { active: true, finished: false, startedAt: 0, step: 'thrust' } });
  const { bus } = env;
  bus.emit('dock:undocked', { committed: true });
  env.helpers.voice.say({ channel: 'tutorial', text: 'Thrust to the beacon.', ttl: 6, id: 'tutorial:beat' });
  advance(env, 1);
  assert.equal(maeraFloors(env).length, 0, 'ordinary commentary cannot take an onboarding floor');
  assert.equal(env.surfaces.at(-1).text, 'Thrust to the beacon.', 'the tutorial beat is untouched');
  assert.equal(env.arbiter.queue.active.channel, 'tutorial');
});

test('a danger interruption retires the interrupted ordinary line permanently', () => {
  const env = boot();
  const { bus, state } = env;
  // Another owner holds the floor, so Maera's line is queued but has not been spoken.
  env.helpers.voice.say({ channel: 'comms', text: 'Berth traffic, hold.', ttl: 60, id: 'comms:berth' });
  advance(env, 0.1);
  assert.equal(env.arbiter.queue.active.id, 'comms:berth');

  bus.emit('dock:undocked', { committed: true });
  advance(env, 0.1);
  assert.equal(maeraFloors(env).length, 0);
  assert.ok(env.arbiter._maera.pending.has('maera_undock'), 'the line is waiting behind the comms floor');

  bus.emit('combat:damage', { targetId: state.playerId, attackerId: 9, hullDamage: 2 });
  advance(env, 0.1);
  assert.equal(env.arbiter._maera.submittedId, null);
  assert.ok(env.arbiter._maera.usedLineIds.has('maera_undock'), 'the preempted moment is spent');
  assert.ok(!env.arbiter._maeraQueueHolds('maera_undock'), 'and it is gone from the queue');

  advance(env, 120); // floor clears, pressure ends, and plenty of 45 s gaps pass
  assert.equal(maeraFloors(env).length, 0, 'an interrupted ordinary line is never spoken later');
});

test('audio starts only when the commentary actually wins the floor', () => {
  const env = boot({ withAudio: true });
  const { state, bus } = env;
  const hostile = { id: 9, type: 'ship', alive: true, team: 1, pos: { x: 300, z: 0 }, data: { ai: { huntPlayer: true } } };
  state.entities.set(9, hostile);
  state.entityList.push(hostile);

  bus.emit('dock:undocked', { committed: true });
  advance(env, 5);
  assert.equal(env.played.filter((p) => p.recipeId === 'sfx_bark_radio').length, 0,
    'a line waiting behind pressure must not open the mic');

  hostile.alive = false;
  advance(env, 3.2);
  assert.equal(env.played.filter((p) => p.recipeId === 'sfx_bark_radio').length, 1,
    'the bark opens the mic exactly when its caption takes the floor');
});

// ── 4. Lifecycle ─────────────────────────────────────────────────────────────────────────────

test('save loading drops stale pending commentary but keeps the session\'s spent lines spent', () => {
  const env = boot();
  const { bus } = env;
  bus.emit('sector:enter', { sectorId: 'sector_helios_prime' });
  advance(env, 1);
  assert.equal(maeraFloors(env).at(-1).id, 'maera:maera_helios');

  // This line is captured while the 45 s gap holds it back.
  bus.emit('pickup:collected', { collectorId: 1, amount: 2, commodityId: 'ore_iron' });
  advance(env, 1);
  assert.ok(env.arbiter._maera.pending.has('maera_cargo'));

  bus.emit('save:loaded', { slot: 'auto' });
  assert.equal(env.arbiter._maera.pending.size, 0, 'a loaded save drops stale captured moments');
  advance(env, 60);
  assert.equal(maeraFloors(env).length, 1, 'the dropped moment does not surface afterwards');

  bus.emit('sector:enter', { sectorId: 'sector_helios_prime' });
  advance(env, 60);
  assert.equal(maeraFloors(env).length, 1, 'a line already spoken this session stays spent across a load');
});

test('newGame() starts a fresh commentary session', () => {
  const env = boot();
  const { bus } = env;
  bus.emit('sector:enter', { sectorId: 'sector_helios_prime' });
  advance(env, 1);
  assert.equal(maeraFloors(env).length, 1);

  env.arbiter.newGame();
  assert.equal(env.arbiter._maera.usedLineIds.size, 0, 'a new run forgets what the last one said');
  bus.emit('sector:enter', { sectorId: 'sector_helios_prime' });
  advance(env, 1);
  assert.equal(maeraFloors(env).length, 2, 'the same line may speak again in a new run');
});

test('sector exit discards old-context lines and attachment tracking', () => {
  const env = boot({ onboarding: { active: true, finished: false, startedAt: 0, step: 'thrust' } });
  const { bus } = env;
  bus.emit('sector:enter', { sectorId: 'sector_helios_prime' });
  bus.emit('tether:attached', { actorId: 1, targetId: 5 });
  assert.ok(env.arbiter._maera.pending.has('maera_helios'));
  assert.ok(env.arbiter._maera.pending.has('maera_latch'));
  assert.ok(env.arbiter._maera.attachedTargets.has('5'));

  bus.emit('sector:exit', { sectorId: 'sector_helios_prime' });
  assert.ok(!env.arbiter._maera.pending.has('maera_helios'), 'a line about a sector you left is stale');
  assert.equal(env.arbiter._maera.attachedTargets.size, 0, 'attachments belong to the place you left');
  bus.emit('tether:released', { targetId: 5 });
  assert.ok(!env.arbiter._maera.pending.has('maera_release'), 'a release for a line from the last sector is ignored');
});

test('reinitializing the same owner does not double-deliver', () => {
  const env = boot();
  const { bus, state, helpers } = env;
  env.arbiter.init({ bus, state, helpers }); // second init on the same owner
  bus.emit('sector:enter', { sectorId: 'sector_helios_prime' });
  advance(env, 1);
  assert.equal(maeraFloors(env).length, 1);
  assert.equal(maeraBarks(env).length, 1, 'one event must not produce two radio lines after re-init');
});

test('swarm and lab runs stay silent', () => {
  for (const kind of ['survival', 'lab']) {
    const env = boot({ run: { kind, phase: 'active' } });
    env.bus.emit('sector:enter', { sectorId: 'sector_helios_prime' });
    env.bus.emit('stunt:trickDetected', { trickId: 'needle_thread', actorId: 1, episodeId: 'ep-x' });
    advance(env, 5);
    assert.equal(env.arbiter._maera.pending.size, 0, `${kind} runs record no commentary`);
    assert.equal(maeraFloors(env).length, 0, `${kind} runs stay silent`);
  }
});

test('a stale NOW row cannot revive commentary while docked or in a menu', () => {
  for (const [mode, docked] of [['flight', true], ['paused', false], ['menu', false]]) {
    const env = boot({ mode, docked });
    env.bus.emit('sector:enter', { sectorId: 'sector_helios_prime' });
    advance(env, 5);
    assert.equal(maeraFloors(env).length, 0, `no hull line while mode=${mode} docked=${docked}`);
  }
});

// ── 5. The real audio consumer (no WebAudio) ─────────────────────────────────────────────────

test('each delivered line reaches the radio recipe once, with the Maera register and unchanged punctuation', () => {
  const env = boot({ withAudio: true });
  runRoute(env, ROUTE, { seconds: 1800 });

  const floors = maeraFloors(env);
  assert.ok(floors.length >= 8);
  const radio = env.played.filter((p) => p.recipeId === 'sfx_bark_radio');
  assert.equal(radio.length, floors.length, 'one bark body per surfaced caption, no more');

  const keyClicks = env.played.filter((p) => p.recipeId === 'sfx_comms_key_click');
  const tails = env.played.filter((p) => p.recipeId === 'sfx_comms_squelch_tail');
  assert.equal(keyClicks.length, floors.length, 'every line still keys the mic');
  assert.equal(tails.length, floors.length, 'every line still closes with the squelch tail');
  assert.ok(keyClicks.every((p) => p.opts.gain === BARK_PUNCT.keyGain), 'the key-click punctuation is unchanged');
  assert.ok(tails.every((p) => p.opts.gain === BARK_PUNCT.tailGain), 'the squelch punctuation is unchanged');

  for (const floor of floors) {
    const id = String(floor.id).slice(FLOOR_PREFIX.length);
    const line = LINE_BY_ID.get(id);
    const bark = radio.find((p) => p.tick >= floor.tick && p.opts.barkSampleId === 'bark_dmc'
      && p.opts.gain === 0.66);
    assert.ok(bark, `${id} must ride the manifest-backed bark_dmc body`);
    const resolved = resolveBarkVoice({
      factionId: CONTACT_MAERA_ID,
      situation: line.warning ? 'warn' : 'patrol-greeting',
      line: line.text,
    });
    assert.equal(bark.opts.rate, resolved.speech.rate, `${id} plays at the resolved cadence`);
    assert.equal(bark.opts.gain, 0.66, `${id} plays at the contact gain`);
    assert.equal(resolved.registerId, 'contact_maera_vols');
    assert.equal(resolved.sampleId, 'bark_dmc');
    assert.equal(resolved.caption, line.text, 'the audio caption is the authored sentence');
    assert.equal(resolved.factionId, null, 'a named contact never starts a faction theme sting');
  }

  // Register identity is stable and distinct from the faction beds it borrows its body from.
  assert.equal(resolveVoiceRegister(CONTACT_MAERA_ID), MAERA_VOICE_REGISTER);
  assert.equal(MAERA_VOICE_REGISTER.label, 'Captain Maera Vols');
  assert.equal(MAERA_VOICE_REGISTER.f0, 95);
  assert.equal(MAERA_VOICE_REGISTER.rate, 0.82);
});

test('muting the mix leaves the named floor caption observable', () => {
  const env = boot({ withAudio: true });
  env.state.settings.audio.muted = true;
  env.bus.emit('sector:enter', { sectorId: 'sector_helios_prime' });
  advance(env, 1);
  const floor = maeraFloors(env).at(-1);
  assert.ok(floor, 'the caption is presentation, not audio');
  assert.match(floor.text, /^Captain Maera Vols: Helios\./);
});

// ── 6. Determinism and save neutrality ──────────────────────────────────────────────────────

test('seed 4242 reproduces the same deliveries, texts and ticks', () => {
  const a = boot({ onboarding: { active: true, finished: false, startedAt: 0, step: 'thrust' } });
  const b = boot({ onboarding: { active: true, finished: false, startedAt: 0, step: 'thrust' } });
  runRoute(a, ROUTE, { seconds: 1800 });
  runRoute(b, ROUTE, { seconds: 1800 });
  const shape = (env) => maeraFloors(env).map((f) => `${f.id}|${f.text}|${f.tick}`);
  assert.deepEqual(shape(a), shape(b));
  assert.ok(shape(a).length >= 8);
});

test('commentary draws no sim randomness and writes no gameplay or save state', () => {
  const control = createGameState(SEED);
  const env = boot({ onboarding: { active: true, finished: false, startedAt: 0, step: 'thrust' } });
  const keysBefore = Object.keys(env.state).sort();
  const payableBefore = JSON.parse(JSON.stringify({
    credits: env.state.player.credits,
    cargo: env.state.player.cargo || {},
    hull: env.state.entities.get(env.state.playerId).hull,
    heat: env.state.heat || {},
    factions: env.state.factions || {},
    story: { beatIndex: env.state.story.beatIndex, branch: env.state.story.branch },
  }));

  runRoute(env, ROUTE, { seconds: 1800 });

  // The observer never touches state.rng: an untouched control at the same seed is in lockstep.
  for (let i = 0; i < 5; i++) assert.equal(env.state.rng(), control.rng());

  assert.deepEqual(Object.keys(env.state).sort(), keysBefore, 'the controller adds no persistent state field');
  const payableAfter = JSON.parse(JSON.stringify({
    credits: env.state.player.credits,
    cargo: env.state.player.cargo || {},
    hull: env.state.entities.get(env.state.playerId).hull,
    heat: env.state.heat || {},
    factions: env.state.factions || {},
    story: { beatIndex: env.state.story.beatIndex, branch: env.state.story.branch },
  }));
  assert.deepEqual(payableAfter, payableBefore, `commentary must change no economy, hull, heat, reputation or story field (${payableDifferences(control, env.state).join(', ')})`);
});

test('the production manifests still carry the voice arbiter', () => {
  assert.ok(PRODUCTION_INIT_ORDER.includes('voiceArbiter'));
  assert.ok(PRODUCTION_UPDATE_ORDER.includes('voiceArbiter'));
});

test('combat pressure retracts a surfaced ordinary line without repeating it or touching another owner', () => {
  for (const pressure of ['damage', 'hostile']) {
    const env = boot();
    env.bus.emit('dock:undocked', { committed: true });
    step(env);
    assert.equal(env.arbiter.queue.active.id, 'maera:maera_undock');
    if (pressure === 'damage') {
      env.bus.emit('combat:damage', { targetId: 1, attackerId: 9, hullDamage: 2 });
    } else {
      const hostile = { id: 9, type: 'ship', alive: true, team: 1,
        pos: { x: 100, z: 0 }, data: { combat: { targetId: 1 } } };
      env.state.entities.set(9, hostile);
      env.state.entityList.push(hostile);
    }
    step(env);
    assert.equal(env.arbiter.queue.active, null, `${pressure} must retract the caption`);
    assert.ok(env.cleared.includes('maera:maera_undock'));
    env.helpers.voice.say({ id: 'other:danger', channel: 'alert', priority: DANGER_PRIORITY,
      text: 'Incoming!', ttl: 3 });
    step(env);
    assert.equal(env.arbiter.queue.active.id, 'other:danger');
    if (pressure === 'hostile') env.state.entities.get(9).alive = false;
    advance(env, 60);
    env.bus.emit('dock:undocked', { committed: true });
    advance(env, 60);
    assert.equal(maeraFloors(env).length, 1);
    assert.equal(maeraBarks(env).length, 1);
  }
});

test('non-flight events are ignored rather than remembered for a later flight', () => {
  for (const [mode, docked] of [['flight', true], ['paused', false], ['menu', false]]) {
    const env = boot({ mode, docked });
    env.bus.emit('sector:enter', { sectorId: 'sector_helios_prime' });
    env.bus.emit('tether:attached', { actorId: 1, targetId: 5 });
    env.bus.emit('tether:released', { targetId: 5 });
    env.bus.emit('pickup:collected', { collectorId: 1, amount: 1, commodityId: 'cmdty_ore_iron' });
    env.bus.emit('story:beatAdvanced', { fromIndex: 0, toIndex: 1 });
    env.bus.emit('stunt:trickDetected', { actorId: 1, episodeId: 'menu', trickId: 'bank_job' });
    env.bus.emit('projectile:nearMiss', { targetId: 1, projectileId: 7, speed: 200, distance: 2 });
    assert.equal(env.arbiter._maera.pending.size, 0, `${mode}/${docked} records no flight moments`);
    assert.equal(env.arbiter._maera.attachedTargets.size, 0);
    env.state.mode = 'flight';
    env.state.ui.docked = false;
    advance(env, 120);
    assert.equal(maeraFloors(env).length, 0);
  }
});
