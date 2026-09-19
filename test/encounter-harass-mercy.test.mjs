// Harassment mercy — the unresolvable-pin release valve. A regen-stabilized or hopeless harasser
// pinning the player gets a deterministic break-off; real fights, authored duels, and law-owned
// pins are untouched. Compressed clock + real director methods, damage and the 1 Hz mercy
// evaluation interleaved in time order.

import assert from 'node:assert/strict';
import test from 'node:test';

import { encounterDirector } from '../src/systems/encounterDirector.js';

const PLAYER_ID = 1;
const HARASSER_ID = 7;

function makeHarness() {
  const entities = new Map();
  const player = {
    id: PLAYER_ID, type: 'ship', alive: true,
    hull: 400, hullMax: 400, shield: 200, shieldMax: 200,
    pos: { x: 0, z: 0 }, vel: { x: 0, z: 0 }, flags: {},
  };
  entities.set(PLAYER_ID, player);
  const state = {
    playerId: PLAYER_ID,
    entities,
    simTime: 0,
    tick: 0,
    player: { flags: {}, credits: 0, cargo: { items: {} } },
    onboarding: { active: false, finished: true },
    ui: {},
    world: { currentSectorId: 'sector_mercy_test' },
    meta: { seed: 4242 },
  };
  const events = [];
  const dir = Object.create(encounterDirector);
  dir.state = state;
  dir.helpers = {};
  dir.bus = {
    emit(name, payload) { events.push({ name, payload }); },
    on() {},
  };
  // Ensure the transient director bag exists exactly as production would (first damage event).
  dir._watchHarassDamage({ attackerId: 0, targetId: PLAYER_ID, amount: 0 });
  delete state.encounterDirector.harassWatch[0];

  function makeHarasser(overrides = {}) {
    const ent = {
      id: HARASSER_ID, type: 'ship', alive: true,
      pos: { x: 40, z: 0 }, vel: { x: 0, z: 0 },
      data: { ai: { archetype: 'pirate' }, combat: { targetId: PLAYER_ID } },
      ...overrides,
    };
    entities.set(HARASSER_ID, ent);
    return ent;
  }

  // Unified clock: from the current time to t1, land pecks every `every` seconds and run the
  // mercy evaluation at the production 1 Hz cadence, in strict time order. `every: 0` = silence.
  let clock = 0;
  function landHit(amount, regenParity) {
    dir._watchHarassDamage({ attackerId: HARASSER_ID, targetId: PLAYER_ID, amount });
    let dmg = amount;
    const absorbed = Math.min(player.shield, dmg);
    player.shield -= absorbed;
    dmg -= absorbed;
    player.hull = Math.max(0, player.hull - dmg);
    if (regenParity) { player.hull = player.hullMax; player.shield = player.shieldMax; }
  }
  function advance(t1, { every = 0, amount = 0, regenParity = false } = {}) {
    const step = every > 0 ? Math.min(every, 0.25) : 0.25;
    while (clock < t1) {
      clock = Math.round((clock + step) * 1000) / 1000;
      state.simTime = clock; // damage events stamp this.now() = simTime
      if (every > 0 && Math.round(clock * 1000) % Math.round(every * 1000) === 0) {
        landHit(amount, regenParity);
      }
      if (Number.isInteger(clock)) dir._tickHarassMercy(state.encounterDirector, state, clock);
    }
  }
  const disengagements = () => events.filter((e) => e.name === 'harasser:disengaged');
  return { state, player, entities, events, dir, makeHarasser, advance, disengagements };
}

const PECK_FLAT = { every: 0.5, amount: 6, regenParity: true };

test('a regen-stabilized pin is broken off once the stall read holds', () => {
  const h = makeHarness();
  const harasser = h.makeHarasser();
  h.advance(120, PECK_FLAT);
  assert.equal(h.disengagements().length, 0, 'mercy must not fire inside MIN_ENGAGE');
  h.advance(245, PECK_FLAT);
  const ev = h.disengagements()[0];
  assert.ok(ev, 'mercy fires on a stalled pin');
  assert.equal(ev.payload.attackerId, HARASSER_ID);
  assert.equal(ev.payload.targetId, PLAYER_ID);
  assert.equal(ev.payload.strikes, 1);
  const ai = harasser.data.ai;
  assert.equal(ai.passive, true, 'attacker stands down');
  assert.equal(harasser.data.combat.targetId, null, 'target lock cleared');
  assert.equal(ai.mercyDisengageUntil, ev.payload.t + 600, 'stand-down cooldown stamped');
  assert.ok(h.events.some((e) => e.name === 'toast'), 'a readout reaches the player');
  // The mercied attacker stops shooting (it is passive); the watch row decays via FORGET_S and
  // no further mercy fires while it holds off.
  h.advance(ev.payload.t + 601);
  assert.equal(h.disengagements().length, 1, 'a standing-down attacker draws no second mercy');
  // Stand-down expiry restores the attacker's own passivity.
  h.advance(ev.payload.t + 601);
  assert.equal(ai.passive, false, 'mercy re-arms at expiry');
  assert.equal(ai.mercyDisengageUntil, undefined, 'mercy stamp cleared');
});

test('a fight the attacker is winning gets no mercy', () => {
  const h = makeHarness();
  h.player.hull = 2000; h.player.hullMax = 2000;
  h.player.shield = 1000; h.player.shieldMax = 1000;
  h.makeHarasser();
  // 2 dmg every 0.25 s (8 dps): the pool drains steadily and would die ~375 s — resolving.
  h.advance(300, { every: 0.25, amount: 2 });
  assert.equal(h.disengagements().length, 0, 'a resolving fight must not be mercied');
});

test('authored duels and law-owned pins are skipped', () => {
  // Named ace: never mercied.
  const h1 = makeHarness();
  h1.makeHarasser({ data: { ai: { archetype: 'pirate', namedAceId: 'ace_one' }, combat: { targetId: PLAYER_ID } } });
  h1.advance(300, PECK_FLAT);
  assert.equal(h1.disengagements().length, 0, 'named ace duel owns its resolution');

  // Lawful attacker vs a wanted player: the law lane owns the pin.
  const h2 = makeHarness();
  h2.makeHarasser({ data: { ai: { archetype: 'patrol', lawful: true }, combat: { targetId: PLAYER_ID } } });
  h2.state.player.heat = 0.5; // wanted
  h2.advance(300, PECK_FLAT);
  assert.equal(h2.disengagements().length, 0, 'law-owned pursuit is not mercy jurisdiction');
});

test('an encounter-owned pinning squad resolves escaped through its own script machinery', () => {
  const h = makeHarness();
  const harasser = h.makeHarasser();
  const dirState = h.state.encounterDirector;
  dirState.live.enc_1 = {
    id: 'enc_1', shapeId: 'ambush_snare', script: 'ambush', tier: 'minor', deck: 'combat',
    phase: 'conflict', ids: [HARASSER_ID], roles: {}, anchor: { x: 0, z: 0 }, zoneRadius: 400,
    sectorId: 'sector_mercy_test', zoneId: 'zone_test', zoneName: 'Test Zone',
    squadId: 'enc_1', factionId: 'faction_reach', vars: {}, data: {},
    causality: { fingerprint: 'fp_test', varietyKey: 'vk_test', motiveId: 'motive_test' },
    shape: { id: 'ambush_snare', cooldownS: 300, pressureCost: 10 },
  };
  h.advance(245, PECK_FLAT);
  const ev = h.disengagements()[0];
  assert.ok(ev, 'mercy fires for an encounter-owned pin');
  assert.equal(ev.payload.encounterId, 'enc_1');
  assert.ok(!dirState.live.enc_1, 'the stalemate encounter resolved');
  const resolved = h.events.find((e) => e.name === 'encounter:resolved');
  assert.ok(resolved && resolved.payload.outcome === 'escaped', 'outcome is escaped');
  assert.equal(harasser.data.despawnAt != null, true, 'squad stragglers depart');
});

test('the watch stays bounded and repeat offenders re-qualify fast', () => {
  const h = makeHarness();
  // Overfill the watch: eviction keeps it bounded.
  for (let id = 100; id < 130; id++) {
    h.entities.set(id, { id, type: 'ship', alive: true, pos: { x: 0, z: 0 }, vel: { x: 0, z: 0 }, data: { ai: {} } });
    h.state.simTime = id - 100;
    h.dir._watchHarassDamage({ attackerId: id, targetId: PLAYER_ID, amount: 3 });
  }
  assert.ok(Object.keys(h.state.encounterDirector.harassWatch).length <= 16, 'watch bounded at 16');
  // Repeat offender: after a first mercy, a fresh pin qualifies at 90 s instead of 240 s.
  const harasser = h.makeHarasser();
  h.advance(245, PECK_FLAT);
  const first = h.disengagements()[0];
  assert.ok(first, 'first mercy fired');
  // Re-pin after the stand-down expires (strikes persist on the attacker).
  h.advance(first.payload.t + 601);
  assert.equal(harasser.data.ai.passive, false, 'attacker re-armed');
  harasser.data.combat.targetId = PLAYER_ID;
  h.advance(first.payload.t + 620 + 100, PECK_FLAT);
  const second = h.disengagements()[1];
  assert.ok(second, 'repeat offender re-qualifies inside 240 s');
  assert.equal(second.payload.strikes, 2, 'strike count tracked across pins');
});
