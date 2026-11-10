// PB-SLICE-F — SF-296 + SF-297 focused counterexamples.
//
// SF-296 (low-resource dignified recovery): a defeat that scours cargo off the player's hold must
// leave that scoured share aboard the player's own wreck under the same destruction-residue law
// every manifest hull keeps (aftermathWrecks wreckCargoResidueFor — floor(30%) per line, capped),
// so flying back to your hull and salvaging it is a real recovery job. Old behavior: the defeat
// removed the cargo (buildRecoveryPlan.cargoLosses → removeCargo at recovery) and the material
// evaporated — the player wreck kept the generic debris pool (DEFAULT_POOL), so a low-resource
// pilot's hold, their only working capital, was a total loss with no physical remainder.
//
// SF-297 (combat pressure clears into audible breathing room): the audio threat law reads live
// hostile COMMITMENT (combat.targetId/lockTarget === player, the same fields the camera's threat
// framing reads). A committed hunter holds the tension floor — the mix may not decay into the
// calm band while it hunts — and when the last commitment dies while the pilot flies free, the
// ear gets one authored settle and the calmer music state lands that tick. Old behavior: threat
// decayed to the calm band with a committed attacker alive, and no release moment existed at all.
//
// Determinism: no Math.random, no wall clock in any asserted path; the release poller keys on
// live entity state, matching the sim-clock law for presentation-adjacent reads.
import test from 'node:test';
import assert from 'node:assert/strict';

import { createSimulation } from '../src/core/sim.js';
import { createBus } from '../src/core/eventBus.js';
import { combat } from '../src/systems/combat.js';
import { aftermathWrecks, playerWreckMarker } from '../src/systems/aftermathWrecks.js';
import { addCargo, removeCargo } from '../src/systems/cargo.js';
import {
  AUDIO_RECIPE_BY_ID,
  audio,
  audioCommittedHostileCount,
  resolveAudioThreatContext,
} from '../src/audio/audioSystem.js';

const SEED = 0x5f296;
const ORE = 'cmdty_ore_iron';
const ELECTRONICS = 'cmdty_salvage_electronics';
const SCRAP = 'cmdty_scrap_metal';

// -------------------------------------------------------------------------------------------
// SF-296 — the defeat → wreck chain through the real combat and aftermath owners.
// -------------------------------------------------------------------------------------------

function makePlayerEntity(state, { x = 500, z = -300 } = {}) {
  const player = {
    id: state.playerId,
    type: 'ship',
    team: 0,
    alive: true,
    flags: {},
    pos: { x, y: 0, z },
    prevPos: { x, y: 0, z },
    vel: { x: 12, y: 0, z: -4 },
    rot: 0,
    hull: 6,
    hullMax: 140,
    armorHp: 0,
    armorMax: 30,
    shield: 0,
    shieldMax: 55,
    cap: 20,
    capMax: 80,
    mass: 60,
    data: { defId: 'ship_kestrel' },
  };
  state.entities.set(player.id, player);
  if (!state.entityList.some((e) => e && e.id === player.id)) state.entityList.push(player);
  return player;
}

function bootRecoverySim(seed = SEED) {
  const spawnedSpecs = [];
  const bus = createBus();
  const sim = createSimulation({
    seed,
    bus,
    systems: [combat, aftermathWrecks],
    helpers: {
      // Wreck bodies materializing in the death sector: capture the spec, hand back a minimal
      // live entity (the marker binds through data.markerId, same as production specs).
      spawnEntity(spec) {
        const entity = {
          id: 100 + spawnedSpecs.length,
          type: spec.type,
          alive: true,
          pos: { x: spec.pos.x, y: 0, z: spec.pos.z },
          data: spec.data || {},
        };
        spawnedSpecs.push({ spec, entity });
        return entity;
      },
    },
  });
  const state = sim.state;
  state.mode = 'flight';
  state.onboarding = { active: false, finished: true };
  state.world.currentSectorId = 'sector_helios_prime';
  state.player.credits = 0; // low-resource: the hold IS the working capital
  state.player.ownedShips = [{ defId: 'ship_kestrel' }];
  state.player.activeShipIndex = 0;
  state.player.insurance = { rate: 0.6, deductibleCr: 500, insuredModules: false, lastStationId: 'station_helios' };
  const player = makePlayerEntity(state);
  return { sim, state, player, spawnedSpecs, bus };
}

function defeatPlayer(sim, player, killerId) {
  sim.registry.get('combat')._pendingPlayerRecovery = null;
  player.alive = true;
  delete player.flags.defeated;
  player.hull = 6;
  sim.registry.get('combat').kill(player, killerId, { context: 'combat' });
  return sim.state.combat.lastPlayerDefeat;
}

test('SF-296: a laden defeat leaves the scoured share aboard your own hull — the recovery job exists', () => {
  const { sim, state, player, bus } = bootRecoverySim();
  state.story.persistentCargo = [ELECTRONICS]; // protected wear: never scoured, never aboard the wreck
  assert.equal(addCargo(state, ORE, 20), 20, 'fixture: the hold carries 20 u of ore');
  assert.equal(addCargo(state, ELECTRONICS, 4), 4, 'fixture: 4 u of persistent salvage aboard');

  const published = [];
  bus.on('news:publish', (p) => published.push(p));

  const receipt = defeatPlayer(sim, player, 999);
  assert.ok(receipt, 'defeat produces the durable after-action receipt');
  const losses = receipt.recovery.cargoLosses;
  assert.deepEqual(losses, [{ commodityId: ORE, qty: 10 }],
    'the receipt scours exactly floor(50%) of the non-persistent hold');

  const marker = playerWreckMarker(state);
  assert.ok(marker, 'the defeat recorded the player hull as a wreck marker');
  assert.deepEqual(marker.manifestResidue, { [ORE]: 3 },
    'the scoured share keeps the manifest-hull residue law: floor(10 * 0.3) = 3 u aboard');
  assert.deepEqual(marker.salvagePool, { [ORE]: 3, [SCRAP]: 1 },
    'the wreck pool is the scoured share plus one unit of hull scrap');

  // Not a free bailout: the wreck returns a strict minority of what was carried.
  assert.equal(marker.salvagePool[ORE], 3);
  assert.ok(marker.salvagePool[ORE] < losses[0].qty && losses[0].qty < 20,
    '3 aboard < 10 scoured < 20 carried — a partial, earned recovery');

  // The recovery job is legible: the loss line names the cargo aboard, in the same breath.
  const playerLine = published.map((p) => String(p && p.text)).find((t) => t.includes('Your hull'));
  assert.ok(playerLine && playerLine.includes('3 u'), `loss line names the scoured units, got: ${playerLine}`);

  // The hold keeps its half; the wreck keeps the residue — a return trip pays the rest of the way.
  for (const loss of losses) removeCargo(state, loss.commodityId, loss.qty);
  assert.equal(state.player.cargo.items[ORE], 10, 'the recovery dock takes the receipt share only');
  assert.equal(playerWreckMarker(state).salvagePool[ORE], 3, 'the return trip still has real cargo to win back');
  assert.equal(state.player.cargo.items[ELECTRONICS], 4, 'persistent cargo survived both the hold and the wreck law');
});

test('SF-296: an empty hold keeps the generic pool byte-identical — no residue invented', () => {
  const { sim, state, player } = bootRecoverySim();
  defeatPlayer(sim, player, 999);
  const marker = playerWreckMarker(state);
  assert.ok(marker);
  assert.equal(marker.manifestResidue, null, 'nothing scoured, nothing fabricated');
  assert.deepEqual(marker.salvagePool, { [SCRAP]: 3, [ELECTRONICS]: 1 },
    'the bare-hull pool is the historical DEFAULT_POOL, unchanged');
});

test('SF-296: repeated defeats keep one wreck whose pool is the newest loss — no parallel farm', () => {
  const { sim, state, player } = bootRecoverySim();
  addCargo(state, ORE, 20);
  defeatPlayer(sim, player, 999);
  const first = playerWreckMarker(state);
  assert.equal(first.salvagePool[ORE], 3);

  // Come back from recovery, load a different hold, die again.
  state.player.cargo.items[ORE] = 0;
  assert.equal(addCargo(state, SCRAP, 8), 8);
  const second = defeatPlayer(sim, player, 777);
  assert.ok(second, 'second defeat produces its own receipt');
  assert.deepEqual(second.recovery.cargoLosses, [{ commodityId: SCRAP, qty: 4 }]);

  const latest = playerWreckMarker(state);
  // The player-wreck id is seeded per run (playerWreckMarkerId hashes the world seed), so the new
  // hull REPLACES the old memorial under the same stable identity — exactly one player wreck.
  const own = state.aftermathWrecks;
  const playerWrecks = Object.values(own.bySector)
    .flat()
    .filter((m) => m && (m.playerWreck === true || m.kind === 'player_wreck'));
  assert.equal(playerWrecks.length, 1, 'one hull, one memorial — no parallel farm of player wrecks');
  assert.deepEqual(latest.manifestResidue, { [SCRAP]: 1 }, 'floor(4 * 0.3) = 1 u of the newest loss aboard');
  assert.deepEqual(latest.salvagePool, { [SCRAP]: 2 }, 'residue 1 + the additive hull scrap unit');
  assert.equal(latest.salvagePool[ORE], undefined, 'the old loss does not linger in the new pool');
});

test('SF-296: the wreck pool and residue survive the real save roundtrip', () => {
  const { sim, state, player } = bootRecoverySim();
  addCargo(state, ORE, 20);
  defeatPlayer(sim, player, 999);
  const before = playerWreckMarker(state);
  const data = sim.registry.get('aftermathWrecks').serialize();
  sim.registry.get('aftermathWrecks').deserialize(JSON.parse(JSON.stringify(data)));
  const after = playerWreckMarker(state);
  assert.ok(after, 'the player wreck rematerializes from the save');
  assert.deepEqual(after.manifestResidue, before.manifestResidue);
  assert.deepEqual(after.salvagePool, before.salvagePool, 'the recovery job survives load — no pool respawn or loss');
});

// -------------------------------------------------------------------------------------------
// SF-297 — the audio threat law reads live hostile commitment.
// -------------------------------------------------------------------------------------------

function threatShip(id, team, x, { committed = null } = {}) {
  const ship = {
    id, type: 'ship', team, alive: true, pos: { x, y: 0, z: 0 },
    hull: 100, hullMax: 100, shield: 100, shieldMax: 100,
    flags: { docked: false },
    data: { driveId: 'drive_reaction_m', derived: { driveId: 'drive_reaction_m', mass: 60 }, ai: null },
  };
  if (committed === 'target' || committed === 'lock') {
    ship.data.combat = committed === 'target' ? { targetId: 'player' } : { lockTarget: 'player' };
  }
  return ship;
}

function threatWorld({ hostiles = [], docked = false } = {}) {
  const player = threatShip('player', 0, 0);
  const state = {
    playerId: 'player',
    simTime: 100,
    entities: new Map([[player.id, player]]),
    entityList: [player],
    ui: { docked },
    world: {
      currentSectorId: 'sector_helios_prime',
      sectors: {
        sector_helios_prime: { id: 'sector_helios_prime', tier: 0, security: 0.98, enemyDensity: 0 },
      },
      activeSector: { stations: [{ id: 10, stationId: 'station_helios', pos: { x: 0, z: 0 } }] },
    },
  };
  for (const h of hostiles) {
    state.entities.set(h.id, h);
    state.entityList.push(h);
  }
  const rt = {
    _lastDamageT: -1e9,
    _doctrineThreatUntil: -1e9,
    _activeCombatEncounters: new Set(),
    _musicThreatScratch: [],
    _musicCommitScratch: [],
  };
  return { state, player, rt };
}

test('SF-297: a committed sniper at standoff holds the mix out of the calm band', () => {
  // 1800 wu: beyond the 1200 near-scan, inside commitment range. Old behavior read threat 0
  // (calm zone + no latch) while the camera framed a combat pair — the picture said danger, the
  // mix said nothing.
  const { state, player, rt } = threatWorld({ hostiles: [threatShip('sniper', 1, 1800, { committed: 'target' })] });
  const context = resolveAudioThreatContext(state, player, rt);
  assert.equal(context.committedHostiles, 1, 'the commitment ledger sees the hunter');
  assert.equal(context.engaged, true, 'commitment is engagement');
  assert.ok(context.threat >= 0.45, `threat must hold the tension floor, got ${context.threat}`);
});

test('SF-297: lock-only commitment counts; friendly and uncommitted hulls never do', () => {
  const locked = threatWorld({ hostiles: [threatShip('sniper', 1, 2200, { committed: 'lock' })] });
  assert.equal(resolveAudioThreatContext(locked.state, locked.player, locked.rt).committedHostiles, 1,
    'a lock is a committed attack even before the first shot');

  const friendly = threatWorld({ hostiles: [threatShip('escort', 0, 400, { committed: 'target' })] });
  assert.equal(resolveAudioThreatContext(friendly.state, friendly.player, friendly.rt).committedHostiles, 0,
    'a same-team lock is an escort, not danger');

  const stray = threatWorld({ hostiles: [threatShip('drifter', 1, 200)] });
  const calm = resolveAudioThreatContext(stray.state, stray.player, stray.rt);
  assert.equal(calm.committedHostiles, 0);
  assert.equal(calm.engaged, false);
  assert.equal(calm.threat, 0, 'an uncommitted different-team contact in a calm zone stays calm — honest quiet');
});

test('SF-297: the ledger clears when the committed hull dies — the floor releases', () => {
  const sniper = threatShip('sniper', 1, 900, { committed: 'target' });
  const { state, player, rt } = threatWorld({ hostiles: [sniper] });
  const before = resolveAudioThreatContext(state, player, rt);
  assert.ok(before.threat >= 0.45);
  sniper.alive = false;
  const after = resolveAudioThreatContext(state, player, rt);
  assert.equal(after.committedHostiles, 0, 'a dead hull commits nothing');
  assert.equal(after.engaged, false);
  assert.ok(after.threat < 0.2, `danger receded, the mix may relax — got ${after.threat}`);
  assert.equal(audioCommittedHostileCount(state, player), 0, 'the standalone count agrees');
});

// -------------------------------------------------------------------------------------------
// SF-297 — the release: one authored settle, immediate landing, guarded against false exhales.
// -------------------------------------------------------------------------------------------

function audioHarness() {
  const harness = Object.create(audio);
  const played = [];
  harness.play = (recipeId, opts) => { played.push({ recipeId, opts }); return null; };
  harness._applySectorBed = () => {};
  harness._syncEnvironmentMix = () => {};
  harness.state = {
    playerId: 'player',
    simTime: 100,
    player: {},
    heat: {},
    ui: { docked: false },
    world: { currentSectorId: 'sector_helios_prime' },
    entities: new Map(),
    entityList: [],
  };
  harness.rt = {
    ctx: { currentTime: 0, state: 'running' },
    musicState: 'calm',
    stemGains: { A: null, B: null, C: null, D: null },
    _docked: false,
    _paused: false,
    _lastDamageT: -1e9,
    _doctrineThreatUntil: -1e9,
    _activeCombatEncounters: new Set(),
    _musicThreatScratch: [],
    _musicCommitScratch: [],
    _committedHostiles: 0,
    _committedArmed: false,
    alarms: {},
  };
  return { harness, played, rt: harness.rt };
}

function harnessPlayer(harness) {
  const player = threatShip('player', 0, 0);
  harness.state.entities.set('player', player);
  harness.state.entityList.push(player);
  return player;
}

test('SF-297: the last committed hull dying exhales once — settle cue plus an immediate calm landing', () => {
  const { harness, played, rt } = audioHarness();
  const player = harnessPlayer(harness);
  const a = threatShip('raider_a', 1, 300, { committed: 'target' });
  const b = threatShip('raider_b', 1, -400, { committed: 'lock' });
  for (const h of [a, b]) {
    harness.state.entities.set(h.id, h);
    harness.state.entityList.push(h);
  }
  // A real fight was felt: recent damage + shredded shields put the music in combat...
  harness.rt._lastDamageT = 100;
  player.shield = 0;
  harness._recomputeMusic(0);
  rt.musicState = 'combat'; // ...and the hold completed before the clear (hysteresis is wall-clock)
  assert.equal(played.length, 0, 'no exhale while the hunters live');

  // ...then the last commitments die while the pilot flies free.
  a.alive = false;
  b.alive = false;
  player.shield = player.shieldMax;
  harness.rt._lastDamageT = -1e9;
  harness._recomputeMusic(0.2);
  assert.deepEqual(played, [{ recipeId: 'sfx_travel_settle', opts: { gain: 0.5 } }],
    'exactly one soft authored settle marks the earned clear');
  assert.equal(rt._committedArmed, false, 'the ledger is spent');
  assert.equal(rt.musicState, 'travel', 'the clean-flight state lands this tick, not after the 1.5 s hold');
  assert.equal(rt._pendingState, null, 'nothing left pending');
});

test('SF-297: a committed survivor never fires the exhale; defeat clears the ledger silently', () => {
  const { harness, played, rt } = audioHarness();
  const player = harnessPlayer(harness);
  const sniper = threatShip('sniper', 1, 1800, { committed: 'target' });
  harness.state.entities.set('sniper', sniper);
  harness.state.entityList.push(sniper);

  harness._recomputeMusic(0);
  harness._recomputeMusic(0.1);
  assert.equal(rt._committedArmed, true, 'the poll observed the commitment');
  assert.equal(played.length, 0, 'a live commitment keeps the mix held — no relief, no misleading silence');

  // Defeat: commitments drop, but a dead pilot exhaled nothing and arms nothing for later.
  sniper.alive = false;
  player.alive = false;
  player.flags.defeated = true;
  harness._recomputeMusic(0.2);
  assert.equal(played.length, 0, 'defeat is the after-action screen, not breathing room');
  assert.equal(rt._committedArmed, false, 'the stale release never fires after recovery undocks you');
});

test('SF-297: quiet sectors never exhale — the ledger only arms on an observed commitment', () => {
  const { harness, played, rt } = audioHarness();
  harnessPlayer(harness);
  harness._recomputeMusic(0);
  assert.equal(rt._committedArmed, false);
  assert.equal(played.length, 0, 'a fresh load in a quiet sector is genuinely quiet, not a release');
});

test('SF-297: the release voice is a finite authored oscillator, not a new sample or a loop', () => {
  const recipe = AUDIO_RECIPE_BY_ID.sfx_travel_settle;
  assert.ok(recipe, 'the settle recipe exists in the authored book');
  assert.equal(recipe.type, 'oscillator');
  assert.ok(Number(recipe.gainEnvelope.release) <= 0.5, 'finite tail — an exhale, not a bed');
  assert.equal(recipe.freqSweep[0] > recipe.freqSweep[1], true, 'the pitch descends — pressure leaving');
});
