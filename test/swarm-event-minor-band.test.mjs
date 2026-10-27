// CRUCIBLE minor event band — the off-beats between the every-5th majors.
//
// Waves ≡2 and ≡8 of each ten-wave block (2, 8, 12, 18…) deal from the minor-tagged
// subset — supply pods, mine drifts, the smallest install-free surge — so the five-wave
// cadence never leaves four identical rounds. The wager seam is unchanged: the card
// still telegraphs accept/refuse, but the bounty rides at SWARM_MINOR_WAGER_SCALE of
// the card's authored bet, and the voice drops to 'info'. Major rounds and boss rounds
// are untouched; the band can never double-book a wave.
//
// Deterministic: seeded picks, simTime windows, no wall clock.
import test from 'node:test';
import assert from 'node:assert/strict';

import {
  SWARM_EVENT_BY_ID,
  SWARM_EVENT_TABLES,
  SWARM_MINOR_WAGER_SCALE,
  isSwarmEventWave,
  isSwarmMinorEventWave,
  swarmEventFor,
  swarmMinorEventFor,
  swarmMinorEventPool,
  validateSwarmEvents,
} from '../src/data/swarmEvents.js';
import {
  createSwarmEventDirector,
  swarmEventFrame,
  SWARM_EVENT_BOUNTY_REASON,
} from '../src/systems/swarmEvents.js';
import { isSwarmBossWave } from '../src/data/swarmMode.js';

const SEED = 4242;

/** A live director on a mock bus — same harness as the wager test. */
function armedDirector({ arenaId, wave, seed = SEED, phase = 'active' }) {
  const emitted = [];
  const subs = [];
  const bus = {
    on(event, handler) { subs.push([event, handler]); return () => {}; },
    emit(event, payload) {
      emitted.push({ event, payload });
      for (const [type, handler] of subs) if (type === event) handler(payload);
    },
  };
  const writes = [];
  const registered = [];
  const spawned = [];
  const fields = {
    updateExternal(id, patch) { writes.push({ id, ...patch }); return { id }; },
    unregisterExternal() { return true; },
    registerEnvironmental(spec) { registered.push(spec); return spec; },
  };
  const state = {
    simTime: 0,
    playerId: 1,
    entities: new Map([[1, { id: 1, team: 1, pos: { x: 40, z: -15 } }]]),
    run: { kind: 'survival', ruleset: 'swarm', phase, arenaId, wave, seed },
  };
  const director = createSwarmEventDirector({
    state,
    bus,
    helpers: { spawnEntity(spec) { spawned.push(spec); return { id: 'pod-1' }; } },
    registry: { get: (name) => (name === 'fields' ? fields : null) },
  });
  director.init();
  director.setFrame(swarmEventFrame({ at: { x: 0, z: 0 }, laneGate: 'front', seed, wave }));
  director.setInstalledFields([{ id: 'room_field', strength: 40 }]);
  return { director, bus, state, emitted, writes, registered, spawned };
}

const named = (h, event) => h.emitted.filter((entry) => entry.event === event);
const telegraphed = (h) => named(h, 'swarm:eventTelegraphed').map((entry) => entry.payload);
const eventVerbs = (h) => named(h, 'swarm:event').map((entry) => entry.payload && entry.payload.verb);
const bounties = (h) => named(h, 'run:awardRequested')
  .filter((entry) => entry.payload && entry.payload.reason === SWARM_EVENT_BOUNTY_REASON)
  .map((entry) => entry.payload);

function startWave(h, wave) {
  h.bus.emit('run:waveStarted', { wave });
}

test('the cadence law: minors on ≡2,8 mod 10 — never major, never boss, never doubled', () => {
  assert.deepEqual(validateSwarmEvents(), []);
  for (let w = 1; w <= 100; w++) {
    const minor = isSwarmMinorEventWave(w);
    const major = isSwarmEventWave(w);
    assert.ok(!(minor && major), `wave ${w} cannot book both bands`);
    const expected = w % 10 === 2 || w % 10 === 8;
    assert.equal(minor, expected, `wave ${w} minor flag`);
    if (isSwarmBossWave(w)) {
      assert.equal(minor, false, `boss wave ${w} never carries a minor`);
      assert.equal(swarmMinorEventFor({ arenaId: 'the_hive', wave: w, seed: SEED }), null);
    }
  }
  // The band starts at wave 2 — rounds 1, 3 and 4 stay clean.
  for (const w of [1, 3, 4]) {
    assert.equal(isSwarmMinorEventWave(w), false);
    assert.equal(swarmMinorEventFor({ arenaId: 'helios_core', wave: w, seed: SEED }), null);
    assert.equal(swarmEventFor({ arenaId: 'helios_core', wave: w, seed: SEED }), null,
      `wave ${w} is no event wave at all`);
  }
  // Major waves are untouched — the every-5th law and the authored wager stand.
  for (const w of [5, 15, 25, 35]) {
    assert.equal(isSwarmEventWave(w), true);
    assert.equal(isSwarmMinorEventWave(w), false);
    assert.equal(swarmMinorEventFor({ arenaId: 'helios_core', wave: w, seed: SEED }), null);
    const major = swarmEventFor({ arenaId: 'helios_core', wave: w, seed: SEED });
    assert.ok(major, `wave ${w} still deals its major card`);
    assert.equal(major.band, undefined, 'a major card wears no band stamp');
    assert.equal(major.wager.score, SWARM_EVENT_BY_ID[major.id].wager.score,
      'the major bounty is the card\'s authored wager — not scaled');
  }
});

test('minor-band waves deal only minor-tagged cards at the scaled bounty', () => {
  let draws = 0;
  for (const arenaId of Object.keys(SWARM_EVENT_TABLES)) {
    for (let w = 2; w <= 98; w++) {
      if (!isSwarmMinorEventWave(w)) continue;
      for (const seed of [SEED, 7, 991]) {
        const draw = swarmMinorEventFor({ arenaId, wave: w, seed });
        assert.ok(draw, `${arenaId} w${w} s${seed} deals a minor card`);
        const authored = SWARM_EVENT_BY_ID[draw.id];
        assert.ok(authored, `${draw.id} resolves to a real card`);
        assert.equal(authored.minor, true, `${draw.id} must be minor-tagged`);
        assert.equal(draw.band, 'minor');
        assert.equal(draw.wager.score,
          Math.max(1, Math.round(authored.wager.score * SWARM_MINOR_WAGER_SCALE)),
          `${draw.id} pays the scaled bounty`);
        assert.ok(draw.wager.score < authored.wager.score,
          `${draw.id} bets smaller than its own major-band price`);
        draws++;
      }
    }
  }
  assert.ok(draws > 100, `the sweep actually drew (${draws})`);
});

test('the minor pool is the tagged subset — shared quiet cards in every room', () => {
  assert.deepEqual(swarmMinorEventPool('the_hive').slice().sort(),
    ['egg_drift', 'lantern_drift', 'mine_drift', 'supply_drop']);
  assert.deepEqual(swarmMinorEventPool('lagrange_crucible').slice().sort(),
    ['mine_drift', 'sling_gust', 'supply_drop']);
  assert.deepEqual(swarmMinorEventPool('asteroid_mill'), ['mine_drift', 'supply_drop'],
    'a room with no minor signature deals the shared quiet cards');
  assert.deepEqual(swarmMinorEventPool('no_such_arena'), ['mine_drift', 'supply_drop']);
  // A minor card that carried install would silently never place — the law is pinned.
  for (const def of Object.values(SWARM_EVENT_BY_ID)) {
    if (def.minor) assert.equal(def.install, undefined, `${def.id}: minor carries no install`);
  }
});

test('supply and mines out-deal the one small surge in the band', () => {
  // lagrange_crucible is the only room whose minor pool holds a surge — weights 1:2:2.
  let gust = 0;
  let quiet = 0;
  for (let w = 2; w <= 198; w++) {
    if (!isSwarmMinorEventWave(w)) continue;
    for (const seed of [SEED, 13, 77, 555]) {
      const draw = swarmMinorEventFor({ arenaId: 'lagrange_crucible', wave: w, seed });
      if (draw.id === 'sling_gust') gust++; else quiet++;
    }
  }
  assert.ok(gust > 0, 'the small surge does deal sometimes');
  assert.ok(gust < quiet, `the surge stays the rarity (${gust} vs ${quiet})`);
});

test('a minor wager telegraphs scaled terms quietly, and accept fires + pays', () => {
  const wave = 2;
  const card = swarmMinorEventFor({ arenaId: 'helios_core', wave, seed: SEED });
  assert.ok(card && card.band === 'minor', 'wave 2 deals a minor card');
  const authored = SWARM_EVENT_BY_ID[card.id];
  const h = armedDirector({ arenaId: 'helios_core', wave });
  startWave(h, wave);

  const offers = telegraphed(h);
  assert.equal(offers.length, 1);
  const offer = offers[0];
  assert.equal(offer.eventId, card.id);
  assert.equal(offer.band, 'minor');
  assert.deepEqual(offer.wager, { score: card.wager.score, timeout: 'accept' });
  assert.equal(offer.wager.score, Math.round(authored.wager.score * SWARM_MINOR_WAGER_SCALE));
  // The quiet band speaks quieter — info, not warn.
  const alert = named(h, 'alert').map((entry) => entry.payload)
    .find((entry) => entry.text === card.telegraph);
  assert.equal(alert.sev, 'info');

  h.bus.emit('swarm:eventVerdict', { wave, eventId: card.id, accept: true, source: 'test' });
  h.state.simTime = card.windupS + 0.5;
  h.director.update(0.016, h.state);
  assert.ok(eventVerbs(h).includes('spend'), 'the accepted minor event fires');
  assert.deepEqual(bounties(h), [
    { score: card.wager.score, reason: SWARM_EVENT_BOUNTY_REASON, wave },
  ], 'one bounty receipt at the scaled score');
  // The card's own spend is unscaled — a pod keeps its authored credit stamp.
  if (card.kind === 'supply') {
    assert.equal(h.spawned[0].data.amount, authored.credits);
  }
  h.director.destroy();
});

test('a minor wager refused stands the room down — nothing fires, nothing pays', () => {
  const wave = 8;
  const card = swarmMinorEventFor({ arenaId: 'the_hive', wave, seed: SEED });
  assert.ok(card);
  const h = armedDirector({ arenaId: 'the_hive', wave });
  startWave(h, wave);
  h.bus.emit('swarm:eventVerdict', { wave, eventId: card.id, accept: false, source: 'test' });

  assert.deepEqual(eventVerbs(h), ['declined']);
  h.state.simTime = card.windupS + 2;
  h.director.update(0.016, h.state);
  assert.equal(bounties(h).length, 0);
  assert.equal(h.spawned.length, 0);
  assert.equal(h.writes.length, 0);
  assert.equal(named(h, 'mines:placeRequest').length, 0);
  h.director.destroy();
});

test('same seed deals the same minor card — ghosts agree; seeds still vary it', () => {
  for (const arenaId of ['helios_core', 'the_hive', 'lagrange_crucible', 'asteroid_mill']) {
    for (const w of [2, 8, 12, 18, 22, 28]) {
      const a = swarmMinorEventFor({ arenaId, wave: w, seed: SEED });
      const b = swarmMinorEventFor({ arenaId, wave: w, seed: SEED });
      assert.deepEqual(a, b, `${arenaId} w${w} is deterministic`);
    }
  }
  const ids = new Set();
  for (let seed = 1; seed <= 40; seed++) {
    const draw = swarmMinorEventFor({ arenaId: 'the_hive', wave: 2, seed });
    if (draw) ids.add(draw.id);
  }
  assert.ok(ids.size >= 2, 'the minor draw is seeded, not constant');
});

test('boss and ordinary waves arm nothing — the director consult holds the cap', () => {
  for (const wave of [1, 6, 10, 20, 30]) {
    const h = armedDirector({ arenaId: 'asteroid_mill', wave });
    startWave(h, wave);
    assert.equal(telegraphed(h).length, 0, `wave ${wave} offers nothing`);
    h.state.simTime = 30;
    h.director.update(0.016, h.state);
    assert.equal(bounties(h).length, 0);
    h.director.destroy();
  }
});

test('a major round is untouched — authored wager, warn voice, no band stamp', () => {
  const wave = 15;
  const major = swarmEventFor({ arenaId: 'asteroid_mill', wave, seed: SEED });
  assert.ok(major);
  const h = armedDirector({ arenaId: 'asteroid_mill', wave });
  startWave(h, wave);
  const offers = telegraphed(h);
  assert.equal(offers.length, 1, 'one offer — the minor band did not double-book');
  assert.equal(offers[0].eventId, major.id);
  assert.equal(offers[0].band, 'major');
  assert.equal(offers[0].wager.score, SWARM_EVENT_BY_ID[major.id].wager.score,
    'the major pays full freight');
  const alert = named(h, 'alert').map((entry) => entry.payload)
    .find((entry) => entry.text === major.telegraph);
  assert.equal(alert.sev, 'warn');
  h.director.destroy();
});
