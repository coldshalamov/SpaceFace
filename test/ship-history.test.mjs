// PQ-142.01 — ship history: scars from real impacts, repairs that leave patches, and a hull a
// stranger can name.
//
// Every assertion below serves one sentence of `design/VISION.md` Part II:
//   "The ship accumulates history — scars, repairs, odd fittings, a reputation by hull — until it
//    is my fucking ship."
import assert from 'node:assert/strict';
import test from 'node:test';

import { createBus } from '../src/core/eventBus.js';
import { createGameState } from '../src/core/gameState.js';
import { save } from '../src/save/saveSystem.js';
import {
  LIVING_HULL_HISTORY_VERSION,
  LIVING_HULL_RENOWN_MAX,
  LIVING_HULL_SCAR_FACINGS,
  LIVING_HULL_SCAR_MAX,
  defaultLivingHull,
  livingHullNotoriety,
  livingHullOpenScars,
  livingHullPatchedScars,
  livingHullRenown,
  livingHullScars,
  livingHullWithPatchedScars,
  livingHullWithRenown,
  livingHullWithScar,
  normalizeLivingHull,
  sameLivingHull,
} from '../src/core/livingHull.js';
import {
  SCAR_ADMIT_COOLDOWN_TICKS,
  SCAR_CONTACT_FLOOR_SPEED,
  scarBandForClosingSpeed,
  scarFacingFromDirection,
  scarFromPlayerContact,
  scarFromPlayerDamage,
  shouldAdmitScar,
} from '../src/combat/hullScars.js';
import { activeHullIdentity, hullNameForOwnedShip } from '../src/data/hullIdentity.js';
import { ships } from '../src/systems/ships.js';
import { barkDirector } from '../src/systems/barkDirector.js';
import { buildShipLedger } from '../src/systems/shipLedger.js';
import { createSimulation } from '../src/core/sim.js';
import { voiceArbiter } from '../src/ui/voiceArbiter.js';
import { NEW_GAME } from '../src/data/newGameDefaults.js';

const SEED = 47;

function playerEntity(overrides = {}) {
  return {
    id: 1,
    type: 'ship',
    alive: true,
    team: 0,
    factionId: 'faction_free',
    radius: 12,
    mass: 60,
    rot: 0,
    pos: { x: 0, y: 0, z: 0 },
    vel: { x: 0, y: 0, z: 0 },
    hull: 60,
    hullMax: 100,
    armorHp: 20,
    armorMax: 50,
    data: { defId: 'ship_kestrel', fittings: [] },
    ...overrides,
  };
}

function witnessEntity(id = 4) {
  return {
    id,
    type: 'ship',
    alive: true,
    team: 1,
    factionId: 'faction_reach',
    radius: 10,
    mass: 40,
    rot: 0,
    pos: { x: 120, y: 0, z: 0 },
    vel: { x: 0, y: 0, z: 0 },
    hull: 40,
    hullMax: 40,
    data: { defId: 'ship_wasp', ai: { fsm: 'patrol' } },
  };
}

/** A minimal live world: the player's hull, one NPC close enough to watch, one shared bus. */
function runtime({ witness = true } = {}) {
  const bus = createBus();
  const player = playerEntity();
  const entities = [player];
  if (witness) entities.push(witnessEntity());
  const state = {
    mode: 'flight',
    tick: 0,
    simTime: 0,
    playerId: player.id,
    meta: { seed: SEED },
    entities: new Map(entities.map((entity) => [entity.id, entity])),
    entityList: entities,
    world: { currentSectorId: 'sector_helios_prime' },
    ui: { dockedStationId: 'station_helios' },
    player: {
      credits: 5000,
      activeShipIndex: 0,
      ownedShips: [{
        defId: 'ship_kestrel',
        fittings: [],
        livingHull: defaultLivingHull(0),
      }],
    },
  };
  const spoken = [];
  const helpers = { voice: { say: (payload) => { spoken.push(payload); return true; } } };
  const shipSystem = Object.create(ships);
  shipSystem.init({ state, bus, helpers });
  const barks = Object.create(barkDirector);
  barks.init({ state, bus, helpers });
  return { bus, state, player, shipSystem, barks, spoken };
}

function activeHull(state) {
  return state.player.ownedShips[state.player.activeShipIndex].livingHull;
}

function weaponHit({ hullDamage = 14, armorDamage = 0, x = 20, z = 0 } = {}) {
  return {
    isPlayer: true,
    targetId: 1,
    hullDamage,
    armorDamage,
    before: { hull: 60, hullMax: 100, armor: 20, armorMax: 50 },
    pos: { x, z },
  };
}

function contact({ closingSpeed = 40, normal = { x: 0, z: 1 }, otherId = 4 } = {}) {
  return {
    consequenceKernelVersion: 1,
    playerInvolved: true,
    aId: 1,
    bId: otherId,
    dp: 2000,
    normal,
    pos: { x: 0, z: 12 },
    preSolveClosingSpeed: closingSpeed,
  };
}

// ── The record ────────────────────────────────────────────────────────────────────────────────

test('a hull that has never been hit carries no history keys at all', () => {
  // "The ship ACCUMULATES history" — a clean hull has not accumulated any, and must not claim it
  // has. The living-hull record lives inside state.player, which src/core/simSnapshot.js hashes,
  // so a confident empty array on every hull would be a lie in the replay hash as well as in the
  // fiction.
  const clean = defaultLivingHull(0);
  assert.equal(Object.hasOwn(clean, 'scars'), false);
  assert.equal(Object.hasOwn(clean, 'renown'), false);
  assert.equal(Object.hasOwn(clean, 'historyVersion'), false);
  assert.deepEqual(Object.keys(normalizeLivingHull(clean, 0)), Object.keys(clean));
  assert.equal(JSON.stringify(normalizeLivingHull({ ...clean, scars: [], renown: [] }, 0)),
    JSON.stringify(clean));
});

test('a scar names the surface, the severity band, and the side of the hull it landed on', () => {
  const hit = scarFromPlayerDamage(weaponHit({ hullDamage: 20, armorDamage: 0 }), playerEntity(), 90);
  assert.equal(hit.cause, 'weapon');
  assert.equal(hit.surface, 'weapon');
  assert.equal(hit.facing, 'bow', 'a hit ahead of the nose is a bow mark');
  assert.equal(hit.band, 'heavy', '20 of 150 protection is 13%: heavy, not yet crushing');

  const rock = scarFromPlayerContact(
    contact({ closingSpeed: 64, otherId: 7 }),
    playerEntity(),
    { id: 7, type: 'asteroid' },
    150,
  );
  assert.equal(rock.cause, 'slam');
  assert.equal(rock.surface, 'terrain', 'a rock is terrain, never "other"');
  assert.equal(rock.band, 'crushing');
  assert.ok(LIVING_HULL_SCAR_FACINGS.includes(rock.facing));
});

test('shields and armour absorbing a shot leave the hull unmarked', () => {
  assert.equal(scarFromPlayerDamage({ isPlayer: true, hullDamage: 0, armorDamage: 9 }, playerEntity(), 10), null);
  assert.equal(scarFromPlayerDamage({ isPlayer: false, hullDamage: 40 }, playerEntity(), 10), null);
});

test('an ordinary docking nudge leaves nothing; a real slam leaves a mark', () => {
  const gentle = scarFromPlayerContact(
    contact({ closingSpeed: SCAR_CONTACT_FLOOR_SPEED - 0.5 }),
    playerEntity(),
    { id: 4, type: 'station' },
    30,
  );
  assert.equal(gentle, null, 'below the speed at which a contact costs anything, no scar');
  const real = scarFromPlayerContact(
    contact({ closingSpeed: SCAR_CONTACT_FLOOR_SPEED + 0.5 }),
    playerEntity(),
    { id: 4, type: 'station' },
    30,
  );
  assert.equal(real.surface, 'structure');
  assert.equal(real.band, 'graze');
});

test('the facing is read in the HULL frame, so the same world hit moves with the ship', () => {
  const ahead = scarFacingFromDirection(0, 1, 0);
  assert.equal(ahead, 'bow');
  // Turn the ship a quarter turn and the same world direction is now off the beam, not the bow.
  const turned = scarFacingFromDirection(Math.PI / 2, 1, 0);
  assert.notEqual(turned, 'bow');
  assert.ok(LIVING_HULL_SCAR_FACINGS.includes(turned));
  assert.equal(scarFacingFromDirection(0, 0, 0), 'bow', 'a zero direction cannot invent a side');
  assert.equal(scarBandForClosingSpeed(0), 'graze');
});

test('a firefight leaves a history, not a log: the record is bounded and the worst hit always lands', () => {
  const early = { cause: 'weapon', band: 'graze', tick: 100 };
  assert.equal(shouldAdmitScar(null, early), true);
  assert.equal(shouldAdmitScar(early, { cause: 'weapon', band: 'graze', tick: 110 }), false);
  assert.equal(shouldAdmitScar(early, { cause: 'weapon', band: 'crushing', tick: 110 }), true,
    'a worse mark is never swallowed by the cooldown');
  assert.equal(
    shouldAdmitScar(early, { cause: 'weapon', band: 'graze', tick: 100 + SCAR_ADMIT_COOLDOWN_TICKS }),
    true,
  );

  let hull = defaultLivingHull(0);
  for (let index = 0; index < LIVING_HULL_SCAR_MAX + 12; index++) {
    hull = livingHullWithScar(hull, {
      cause: 'slam',
      surface: 'terrain',
      band: 'hard',
      facing: LIVING_HULL_SCAR_FACINGS[index % LIVING_HULL_SCAR_FACINGS.length],
      tick: index * 60,
      atT: index,
    }, index);
  }
  assert.equal(livingHullScars(hull).length, LIVING_HULL_SCAR_MAX);

  let renowned = defaultLivingHull(0);
  for (let index = 0; index < LIVING_HULL_RENOWN_MAX + 5; index++) {
    renowned = livingHullWithRenown(renowned, { act: 'kill', tick: index * 60 }, index);
  }
  assert.equal(livingHullNotoriety(renowned), LIVING_HULL_RENOWN_MAX);
});

// ── Repairs leave patches ─────────────────────────────────────────────────────────────────────

test('a yard repair covers every open mark and the patch stays on the record', () => {
  // "scars, REPAIRS, odd fittings" — a repaired hull is not a new hull. The patch is the second
  // consequence the scar has to produce.
  const { bus, state } = runtime();
  state.tick = 120;
  bus.emit('combat:damage', weaponHit({ hullDamage: 18 }));
  state.tick = 400;
  bus.emit('physics:impact', contact({ closingSpeed: 45 }));
  assert.equal(livingHullOpenScars(activeHull(state)).length, 2);
  assert.equal(livingHullPatchedScars(activeHull(state)).length, 0);

  state.simTime = 900;
  bus.emit('service:completed', {
    type: 'repair',
    restoredHull: 40,
    restoredArmor: 30,
    hullMax: 100,
    armorMax: 50,
    beforeProtection: 0.53,
    atT: 900,
  });
  const patched = livingHullPatchedScars(activeHull(state));
  assert.equal(livingHullOpenScars(activeHull(state)).length, 0, 'the yard closed both marks');
  assert.equal(patched.length, 2, 'and neither mark was deleted');
  for (const scar of patched) assert.equal(scar.patchedAtT, 900);

  // A second repair with nothing open is not a new event.
  const before = activeHull(state);
  bus.emit('service:completed', { type: 'repair', restoredHull: 0, restoredArmor: 0, atT: 950 });
  assert.equal(sameLivingHull(before, activeHull(state)), true);
});

test('patching is a transition, not a delete: livingHullWithPatchedScars is idempotent', () => {
  const scarred = livingHullWithScar(defaultLivingHull(0), {
    cause: 'slam', surface: 'terrain', band: 'heavy', facing: 'stern', tick: 60, atT: 1,
  }, 1);
  const once = livingHullWithPatchedScars(scarred, 10);
  const twice = livingHullWithPatchedScars(once, 20);
  assert.equal(sameLivingHull(once, twice), true,
    'nothing open means the record comes back unchanged — a second visit cannot re-date a patch');
  assert.equal(twice.updatedAtT, 10, 'and it does not bump the record clock either');
  assert.equal(livingHullScars(once)[0].patchedAtT, 10);
  assert.equal(once.historyVersion, LIVING_HULL_HISTORY_VERSION);
});

// ── The save round-trip ───────────────────────────────────────────────────────────────────────

test('scars and renown survive a save round-trip byte for byte', () => {
  // The done-when for this leaf. A history that does not survive Continue is not history.
  const state = createGameState(SEED);
  state.mode = 'flight';
  state.playerId = 1;
  state.meta.createdAt = 'ship-history-fixture';
  const player = playerEntity();
  state.entities.set(player.id, player);
  state.entityList.push(player);
  state.player.activeShipIndex = 0;

  let hull = defaultLivingHull(0);
  hull = livingHullWithScar(hull, {
    cause: 'slam', surface: 'terrain', band: 'crushing', facing: 'port bow', tick: 18000, atT: 300,
  }, 300);
  hull = livingHullWithScar(hull, {
    cause: 'weapon', surface: 'weapon', band: 'hard', facing: 'stern', tick: 186000, atT: 3100,
  }, 3100);
  hull = livingHullWithPatchedScars(hull, 3200);
  hull = livingHullWithScar(hull, {
    cause: 'weapon', surface: 'weapon', band: 'heavy', facing: 'starboard beam', tick: 190000, atT: 3300,
  }, 3300);
  hull = livingHullWithRenown(hull, {
    id: 'kill:loss_a', act: 'kill', factionId: 'faction_reach', sectorId: 'sector_helios_prime',
    atT: 620, tick: 37200,
  }, 620);
  state.player.ownedShips = [{ defId: 'ship_kestrel', fittings: [], livingHull: hull }];

  save.init({
    state,
    bus: { emit() {}, on() { return () => {}; } },
    helpers: {},
    registry: { get() { return null; } },
  });
  const data = JSON.parse(JSON.stringify(save.serializeData()));
  const restored = normalizeLivingHull(data.player.ownedShips[0].livingHull, 0);

  assert.equal(sameLivingHull(hull, restored), true, 'the restored hull is the same hull');
  assert.deepEqual(restored.scars.map((scar) => scar.id), hull.scars.map((scar) => scar.id));
  assert.deepEqual(restored.scars, hull.scars);
  assert.deepEqual(restored.renown, hull.renown);
  assert.equal(livingHullOpenScars(restored).length, 1);
  assert.equal(livingHullPatchedScars(restored).length, 2);
  assert.equal(livingHullNotoriety(restored), 1);
  assert.equal(restored.historyVersion, LIVING_HULL_HISTORY_VERSION);

  // The write half is only half the round trip. Continue goes back through the save system's own
  // restore, and then through the hull owner's `save:loaded` reconcile — the two places a record
  // gets silently rebuilt from named fields instead of carried. Drive both.
  const reloaded = createGameState(SEED);
  reloaded.mode = 'flight';
  reloaded.playerId = 1;
  const reloadedPlayer = playerEntity();
  reloaded.entities.set(reloadedPlayer.id, reloadedPlayer);
  reloaded.entityList.push(reloadedPlayer);
  const reloadBus = createBus();
  const reloadShips = Object.create(ships);
  reloadShips.init({ state: reloaded, bus: reloadBus, helpers: {} });
  const loader = Object.create(save);
  loader.init({
    state: reloaded,
    bus: reloadBus,
    helpers: {},
    registry: { get() { return null; } },
  });
  loader._restorePlayer(data.player);
  reloadBus.emit('save:loaded', { slot: 'ship-history-fixture' });

  const continued = reloaded.player.ownedShips[reloaded.player.activeShipIndex].livingHull;
  assert.equal(sameLivingHull(hull, continued), true,
    'Continue brings back the same hull, not a fresh one');
  assert.equal(livingHullScars(continued).length, 3, 'three marks came back');
  assert.equal(livingHullOpenScars(continued).length, 1);
  assert.equal(livingHullPatchedScars(continued).length, 2);
  assert.equal(livingHullNotoriety(continued), 1);
  assert.equal(reloadedPlayer.data.livingHull, continued,
    'and the live hull entity is holding the restored record, not a stale one');
});

// ── Recognition by hull ───────────────────────────────────────────────────────────────────────

test('the starting hull is the Tessera, and a later berth gets its own deterministic name', () => {
  const starter = { defId: 'ship_kestrel', fittings: [] };
  assert.equal(hullNameForOwnedShip(starter, 0, SEED), 'Tessera');
  const second = { defId: 'ship_mule', fittings: [] };
  const name = hullNameForOwnedShip(second, 1, SEED);
  assert.equal(typeof name, 'string');
  assert.ok(name.length > 0);
  assert.equal(hullNameForOwnedShip(second, 1, SEED), name, 'the same seed always says the same word');
  assert.notEqual(name, 'Tessera');
});

test('a witness who saw the act says the SHIP by name', () => {
  // "a reputation by hull" — the payoff is somebody saying the ship's name instead of
  // "unidentified vessel", after that hull was seen doing something.
  const { bus, state, spoken } = runtime();
  state.tick = 3600;
  state.simTime = 60;
  bus.emit('lossLedger:recorded', {
    kind: 'ship',
    killedByPlayer: true,
    lossId: 'loss_reach_01',
    factionId: 'faction_reach',
    sectorId: 'sector_helios_prime',
    t: 60,
  });

  assert.equal(livingHullNotoriety(activeHull(state)), 1, 'the act attached to the hull');
  const recognition = spoken.filter((line) => line.kind === 'hullRecognition');
  assert.equal(recognition.length, 1, 'exactly one witness spoke');
  assert.match(recognition[0].text, /Tessera/, 'and they used the hull name');
  assert.equal(recognition[0].channel, 'bark');
  assert.equal(recognition[0].factionId, 'faction_reach');

  // The gap holds: a second kill inside the window does not restate the name.
  state.tick = 3660;
  state.simTime = 61;
  bus.emit('lossLedger:recorded', {
    kind: 'ship', killedByPlayer: true, lossId: 'loss_reach_02',
    factionId: 'faction_reach', sectorId: 'sector_helios_prime', t: 61,
  });
  assert.equal(livingHullNotoriety(activeHull(state)), 2, 'the hull still remembers both acts');
  assert.equal(spoken.filter((line) => line.kind === 'hullRecognition').length, 1);
});

test('with nobody close enough to watch, nobody learns the name', () => {
  const { bus, state, spoken } = runtime({ witness: false });
  state.tick = 3600;
  state.simTime = 60;
  bus.emit('lossLedger:recorded', {
    kind: 'ship', killedByPlayer: true, lossId: 'loss_alone',
    factionId: 'faction_reach', sectorId: 'sector_helios_prime', t: 60,
  });
  assert.equal(livingHullNotoriety(activeHull(state)), 1, 'the hull still carries the act');
  assert.equal(spoken.filter((line) => line.kind === 'hullRecognition').length, 0);
});

test('the arbiter actually puts the ship’s name on the floor, through the shipped systems', () => {
  // The done-when is a bark the player HEARS, not a call that returned true. This run uses the
  // real sim, the real single writer (systems/ships.js), the real observer and the real
  // voiceArbiter floor, and starts the hull exactly the way src/main.js starts a new game:
  // `[{ defId: NEW_GAME.shipId, fittings: [] }]`, with no living-hull record yet.
  const sim = createSimulation({ seed: SEED, systems: [ships, barkDirector, voiceArbiter] });
  const { state, bus } = sim;
  state.mode = 'flight';
  state.world.currentSectorId = 'sector_helios_prime';
  const player = sim.spawn({
    type: 'ship', team: 0, pos: { x: 0, z: 0 }, hull: 220, hullMax: 220, radius: 10,
    data: { defId: NEW_GAME.shipId },
  });
  state.playerId = player.id;
  state.player.ownedShips = [{ defId: NEW_GAME.shipId, fittings: [] }];
  state.player.activeShipIndex = 0;
  sim.spawn({
    type: 'ship', team: 1, factionId: 'faction_reach', pos: { x: 180, z: 0 },
    hull: 90, hullMax: 90, radius: 8,
    data: {
      ai: { fsm: 'pursue', archetype: 'pirate_raider', hostileTeams: [0] },
      combat: { targetId: player.id },
      intent: { fire: false },
    },
  });

  const toasts = [];
  bus.on('toast', (payload) => toasts.push(payload));
  bus.emit('lossLedger:recorded', {
    kind: 'ship', killedByPlayer: true, lossId: 'loss_live_01',
    factionId: 'faction_reach', sectorId: 'sector_helios_prime', t: 0,
  });
  for (let step = 0; step < 6; step++) sim.step();

  const owned = state.player.ownedShips[0];
  assert.equal(livingHullNotoriety(owned.livingHull), 1, 'the kill attached to the hull');
  assert.ok(
    toasts.some((toast) => typeof toast.text === 'string' && toast.text.includes('Tessera')),
    'the ship’s name reached the floor the player reads',
  );
});

// ── The surface on the default route ──────────────────────────────────────────────────────────

test('the Ship’s Ledger reads the hull’s own history back in words', () => {
  const { bus, state } = runtime();
  state.tick = 600;
  state.simTime = 10;
  bus.emit('combat:damage', weaponHit({ hullDamage: 22 }));
  state.tick = 1200;
  state.simTime = 20;
  bus.emit('physics:impact', contact({ closingSpeed: 55 }));
  state.tick = 2400;
  state.simTime = 40;
  bus.emit('lossLedger:recorded', {
    kind: 'ship', killedByPlayer: true, lossId: 'loss_reach_03',
    factionId: 'faction_reach', sectorId: 'sector_helios_prime', t: 40,
  });
  state.simTime = 60;
  bus.emit('service:completed', {
    type: 'repair', restoredHull: 40, restoredArmor: 20,
    hullMax: 100, armorMax: 50, beforeProtection: 0.5, atT: 60,
  });

  const page = buildShipLedger(state);
  const types = new Set(page.entries.map((entry) => entry.type));
  assert.equal(types.has('patch'), true, 'the covered marks are on the page');
  assert.equal(types.has('renown'), true, 'so is the act the hull is known for');
  const patch = page.entries.find((entry) => entry.type === 'patch');
  assert.equal(patch.text.includes('{'), false, 'every token resolves');
  assert.ok(patch.text.length > 18);
  const renown = page.entries.find((entry) => entry.type === 'renown');
  assert.match(renown.text, /Tessera/);
  assert.equal(activeHullIdentity(state).name, 'Tessera');
});

// ── The deterministic scenario ────────────────────────────────────────────────────────────────

test('scenario ship_history_10s @ seed 47: ten seconds of real receipts, counted', () => {
  // A seconds-scale run on a fixed seed and a fixed tape: no randomness, no wall clock. It drives
  // the SAME events the live route publishes through the SAME owning systems, then prints the bar.
  const { bus, state, spoken } = runtime();
  const TAPE = [
    { tick: 60, kind: 'weapon', hullDamage: 6 },
    { tick: 72, kind: 'weapon', hullDamage: 5 },   // inside the cooldown, same band: swallowed
    { tick: 96, kind: 'weapon', hullDamage: 26 },  // worse band: lands anyway
    { tick: 200, kind: 'slam', closingSpeed: 12 },
    { tick: 262, kind: 'slam', closingSpeed: 48 },
    { tick: 300, kind: 'slam', closingSpeed: 3 },  // a nudge: leaves nothing
    { tick: 360, kind: 'kill' },
    { tick: 480, kind: 'repair' },
    { tick: 540, kind: 'weapon', hullDamage: 11 },
  ];
  let cursor = 0;
  for (let tick = 0; tick <= 600; tick++) {
    state.tick = tick;
    state.simTime = tick / 60;
    while (cursor < TAPE.length && TAPE[cursor].tick === tick) {
      const step = TAPE[cursor++];
      if (step.kind === 'weapon') bus.emit('combat:damage', weaponHit({ hullDamage: step.hullDamage }));
      else if (step.kind === 'slam') bus.emit('physics:impact', contact({ closingSpeed: step.closingSpeed }));
      else if (step.kind === 'kill') {
        bus.emit('lossLedger:recorded', {
          kind: 'ship', killedByPlayer: true, lossId: `loss_${tick}`,
          factionId: 'faction_reach', sectorId: 'sector_helios_prime', t: state.simTime,
        });
      } else if (step.kind === 'repair') {
        bus.emit('service:completed', {
          type: 'repair', restoredHull: 40, restoredArmor: 20,
          hullMax: 100, armorMax: 50, beforeProtection: 0.5, atT: state.simTime,
        });
      }
    }
  }

  const hull = activeHull(state);
  const counts = {
    scars: livingHullScars(hull).length,
    open: livingHullOpenScars(hull).length,
    patches: livingHullPatchedScars(hull).length,
    renown: livingHullNotoriety(hull),
    barks: spoken.filter((line) => line.kind === 'hullRecognition').length,
  };
  console.log(
    `PQ-142.01 scenario ship_history_10s seed=${SEED} ticks=600 `
    + `scars=${counts.scars} open=${counts.open} patches=${counts.patches} `
    + `renown=${counts.renown} barks=${counts.barks}`,
  );

  assert.equal(counts.scars, 5, 'nine receipts, five marks: the gate held');
  assert.equal(counts.patches, 4, 'everything open when the yard closed was covered');
  assert.equal(counts.open, 1, 'the mark taken after the repair is still open');
  assert.equal(counts.renown, 1);
  assert.equal(counts.barks, 1);
  assert.equal(livingHullScars(hull).some((scar) => scar.band === 'crushing'), true,
    'the worst hit was never swallowed by the admission gate');
});
