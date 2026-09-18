import assert from 'node:assert/strict';
import test from 'node:test';

import { createSimulation } from '../src/core/sim.js';
import {
  AUTHORED_SET_PIECES,
  CAPITAL_BOSS,
  CAPITAL_BOSS_ALA,
  CAPITAL_BOSS_SOURCE,
  CAPITAL_BOSS_TOLLMAN,
  CAPITAL_BOSS_TYPE,
  MEGA_HEIST_SOURCE,
  MEGA_HEISTS,
  validateAuthoredSetPieceCatalog,
  validateCapitalBossCatalog,
  validateEndgamePullCatalog,
} from '../src/data/missions.js';
import { CAPITAL_BOSS_ENCOUNTERS } from '../src/data/encounters/capital-boss.js';
import { MEGA_HEIST_ENCOUNTERS } from '../src/data/encounters/mega-heist.js';
import { SECTORS } from '../src/data/sectors.js';
import { FACTION_META } from '../src/data/factions.js';
import { endgamePullsUnlocked } from '../src/data/postEndingReplayChains.js';
import { ENDGAME_PULL_LINES } from '../src/data/conflictReactions.js';
import { missions } from '../src/systems/missions.js';
import { claims as claimsBase } from '../src/systems/claims.js';
import { factions as factionsBase } from '../src/systems/factions.js';
import { combat } from '../src/systems/combat.js';
import { tumbleStates } from '../src/systems/tumbleStates.js';
import {
  applyFeatureConfigToMaps,
  restoreFeatureMaps,
  snapshotFeatureMaps,
} from '../src/data/featureFlags.js';
import { PRODUCTION_FEATURES } from '../src/runtime/runtimeProfiles.js';

const SEED = 17002;
const REPLAY_CHAIN = 'replay_auxiliary_watch';

function stationInfo(id) {
  for (const sector of SECTORS) {
    const station = (sector.stations || []).find((row) => row.id === id);
    if (station) return { ...station, sectorId: sector.id };
  }
  return null;
}

function unlockEndgame(state) {
  state.missions = state.missions || {};
  state.missions.postEndingReplay = { chainId: REPLAY_CHAIN, status: 'active' };
}

function trustBoards(state) {
  state.factions = state.factions || {};
  for (const id of ['faction_vael', 'faction_reach', 'faction_free', 'faction_scn', 'faction_choir']) {
    const rec = state.factions[id] || (state.factions[id] = { rep: 0 });
    rec.rep = 400;
  }
}

function bootMissions(seed = SEED) {
  const sim = createSimulation({ seed, systems: [missions, claimsBase], updateOrder: [] });
  const { state } = sim;
  state.mode = 'flight';
  state.player.credits = 250000;
  trustBoards(state);
  const player = sim.spawn({
    type: 'ship', team: 0, pos: { x: 0, z: 0 }, hull: 200, hullMax: 200, radius: 8,
  });
  state.playerId = player.id;
  return { sim, state, player, missionsSys: sim.registry.get('missions'), claimsSys: sim.registry.get('claims') };
}

function bootPhysics(seed = SEED) {
  const sim = createSimulation({
    seed,
    systems: [missions, claimsBase, combat, tumbleStates],
    updateOrder: [],
  });
  const { state } = sim;
  state.mode = 'flight';
  state.player.credits = 250000;
  trustBoards(state);
  const player = sim.spawn({
    type: 'ship', team: 0, pos: { x: 0, z: 0 }, hull: 200, hullMax: 200, radius: 8, mass: 24,
  });
  state.playerId = player.id;
  const completed = [];
  sim.bus.on('mission:completed', (p) => completed.push(p));
  return {
    sim, state, player, completed,
    missionsSys: sim.registry.get('missions'),
    claimsSys: sim.registry.get('claims'),
  };
}

function acceptOffer(h, stationId, match) {
  const dest = stationInfo(match.destStationId || stationId);
  const origin = stationInfo(stationId);
  assert.ok(dest && origin, 'stations must exist');
  h.state.world.currentSectorId = dest.sectorId;
  const board = h.missionsSys.ensureBoard(origin.id);
  const offer = (board.slots || []).find(match.find);
  assert.ok(offer, `offer must post on ${origin.id}`);
  offer.collateral_cr = 0;
  assert.equal(h.missionsSys.acceptMission(offer.id), true);
  const mission = h.state.missions.active.find(match.active);
  assert.ok(mission, 'mission must be active');
  h.missionsSys._ensureMissionTargets(mission);
  return mission;
}

function roleOf(entity) {
  return entity && entity.data && entity.data.physicalRole || null;
}

function targetsByRole(h, mission, role) {
  return (mission.targetEntityIds || []).map((id) => h.state.entities.get(id)).filter((e) => (
    e && roleOf(e) === role
  ));
}

function makeBus() {
  const handlers = new Map();
  const emitLog = [];
  return {
    emitLog,
    on(evt, fn) {
      if (!handlers.has(evt)) handlers.set(evt, []);
      handlers.get(evt).push(fn);
    },
    off() {},
    emit(evt, payload) {
      emitLog.push({ evt, payload });
      for (const fn of (handlers.get(evt) || []).slice()) fn(payload);
    },
  };
}

function bootClaims() {
  const state = {
    simTime: 4000,
    meta: { seed: SEED },
    playerId: 'player',
    mode: 'flight',
    player: { credits: 1, moduleInventory: [], cargo: { items: {} }, stats: {} },
    world: { currentSectorId: 'sector_helios_prime' },
    entities: new Map(),
    claims: { bodies: [] },
  };
  const bus = makeBus();
  const sys = { ...claimsBase };
  sys.init({ state, bus, helpers: {}, registry: { get: () => null } });
  return { state, bus, sys };
}

function factionsHarness() {
  const factions = {};
  for (const f of FACTION_META) {
    factions[f.id] = {
      rep: f.startingRep || 0, tier: 'Neutral', aggro: false, bribesPaid: 0,
      lastDelta: { value: 0, reason: 'init', t: 0 }, knownContrabandStrikes: 0, discoveredHostileBy: 0,
      power: 10, powerNonce: 0,
    };
  }
  const state = {
    playerId: 'player_ship', simTime: 5, meta: { seed: SEED },
    world: { currentSectorId: 'sector_helios_prime', sectors: {} },
    factions, conflicts: {}, entityList: [], entities: new Map(),
    claims: { bodies: [] },
  };
  const events = [];
  const handlers = new Map();
  const bus = {
    on(event, fn) { const list = handlers.get(event) || []; list.push(fn); handlers.set(event, list); },
    emit(event, payload) { events.push({ event, payload }); for (const fn of handlers.get(event) || []) fn(payload); },
  };
  const sys = { ...factionsBase };
  sys.init({ state, bus, helpers: { queryRadius: () => [] } });
  return { state, events, bus, sys };
}

test('PQ-170.02 catalog keeps ten authored pieces and adds two heists plus two post-ending heavies', () => {
  const authored = validateAuthoredSetPieceCatalog();
  const capital = validateCapitalBossCatalog();
  const endgame = validateEndgamePullCatalog();
  assert.equal(authored.ok, true, authored.errors.join('; '));
  assert.equal(capital.ok, true, capital.errors.join('; '));
  assert.equal(endgame.ok, true, endgame.errors.join('; '));
  assert.equal(AUTHORED_SET_PIECES.length, 10, 'AUTHORED_SET_PIECES must stay exactly 10');
  assert.equal(MEGA_HEISTS.length, 2);
  assert.ok(MEGA_HEISTS.every((row) => row.methods.length === 2 && MEGA_HEIST_ENCOUNTERS[row.id]));
  assert.ok(CAPITAL_BOSS_TOLLMAN.endgame && CAPITAL_BOSS_ALA.endgame);
  assert.equal(CAPITAL_BOSS.endgame, undefined);
  assert.ok(CAPITAL_BOSS_ENCOUNTERS[CAPITAL_BOSS_TOLLMAN.encounterId]);
  assert.ok(CAPITAL_BOSS_ENCOUNTERS[CAPITAL_BOSS_ALA.encounterId]);
  for (const id of MEGA_HEISTS.map((row) => row.id).concat([CAPITAL_BOSS_TOLLMAN.id, CAPITAL_BOSS_ALA.id])) {
    assert.ok(ENDGAME_PULL_LINES[id], `${id} has a news line`);
  }
});

test('PQ-170.02 seed 17002 posts endgame pulls only after a replay chain is live', () => {
  const locked = bootMissions();
  assert.equal(endgamePullsUnlocked(locked.state), false);
  const skerLocked = locked.missionsSys.ensureBoard('station_sker');
  assert.equal((skerLocked.slots || []).some((row) => row && row.params && row.params.capitalBossId === CAPITAL_BOSS_TOLLMAN.id), false);
  const veilLocked = locked.missionsSys.ensureBoard('station_veil');
  assert.equal((veilLocked.slots || []).some((row) => row && row.source === MEGA_HEIST_SOURCE), false);
  locked.sim.dispose();

  const live = bootMissions();
  unlockEndgame(live.state);
  assert.equal(endgamePullsUnlocked(live.state), true);
  const coalition = live.missionsSys.ensureBoard('station_coalition');
  assert.ok((coalition.slots || []).some((row) => row && row.params && row.params.capitalBossId === CAPITAL_BOSS.id));
  const sker = live.missionsSys.ensureBoard('station_sker');
  const tollman = (sker.slots || []).find((row) => row && row.params && row.params.capitalBossId === CAPITAL_BOSS_TOLLMAN.id);
  assert.ok(tollman, 'Sker posts the Tollman once the replay chain is live');
  assert.equal(tollman.type, CAPITAL_BOSS_TYPE);
  const ash = live.missionsSys.ensureBoard('station_ashcache');
  assert.ok((ash.slots || []).some((row) => row && row.params && row.params.megaHeistId === 'mega_heist_tessera_core'));
  assert.ok((ash.slots || []).some((row) => row && row.params && row.params.capitalBossId === CAPITAL_BOSS_ALA.id));
  const veil = live.missionsSys.ensureBoard('station_veil');
  const choir = (veil.slots || []).find((row) => row && row.params && row.params.megaHeistId === 'mega_heist_choir_reliquary');
  assert.ok(choir);
  assert.equal(choir.source, MEGA_HEIST_SOURCE);
  assert.equal(choir.factionId, 'faction_free');
  const helios = live.missionsSys.ensureBoard('station_helios');
  assert.equal((helios.slots || []).some((row) => row && (row.source === MEGA_HEIST_SOURCE || row.params && row.params.endgame)), false);
  live.sim.dispose();
});

test('PQ-170.02 seed 17002 yank and smash both close a mega-heist', () => {
  const yank = bootMissions();
  unlockEndgame(yank.state);
  const yanked = acceptOffer(yank, 'station_ashcache', {
    destStationId: 'station_ashcache',
    find: (row) => row && row.params && row.params.megaHeistId === 'mega_heist_tessera_core',
    active: (row) => row && row.params && row.params.megaHeistId === 'mega_heist_tessera_core',
  });
  const hatch = targetsByRole(yank, yanked, 'vault_hatch')[0];
  const slag = targetsByRole(yank, yanked, 'throw_mass')[0];
  assert.ok(hatch && slag, 'vault hatch and slag shot must spawn');
  yank.sim.bus.emit('tether:reel', { targetId: hatch.id, actorId: yank.state.playerId });
  assert.equal(yanked.status, 'completed');
  assert.equal(yanked.params.completionMethod, 'yank_the_hatch');
  const ledger = yank.claimsSys.endgamePulls();
  assert.ok(ledger.completed.mega_heist_tessera_core);
  yank.sim.dispose();

  const smash = bootMissions();
  unlockEndgame(smash.state);
  const smashed = acceptOffer(smash, 'station_veil', {
    destStationId: 'station_veil',
    find: (row) => row && row.params && row.params.megaHeistId === 'mega_heist_choir_reliquary',
    active: (row) => row && row.params && row.params.megaHeistId === 'mega_heist_choir_reliquary',
  });
  const reliquary = targetsByRole(smash, smashed, 'vault_hatch')[0];
  const iron = targetsByRole(smash, smashed, 'throw_mass')[0];
  smash.sim.bus.emit('massline:throw', { payloadId: iron.id, aimTargetId: reliquary.id, payloadSpeed: 70 });
  assert.equal(smashed.status, 'completed');
  assert.equal(smashed.params.completionMethod, 'smash_the_door');
  smash.sim.dispose();
});

test('PQ-170.02 seed 17002 Tollman is a distinct heavy with no immunity, killable by thrown mass', () => {
  const flags = snapshotFeatureMaps();
  applyFeatureConfigToMaps(PRODUCTION_FEATURES);
  try {
    const h = bootPhysics();
    unlockEndgame(h.state);
    const mission = acceptOffer(h, 'station_sker', {
      destStationId: 'station_sker',
      find: (row) => row && row.params && row.params.capitalBossId === CAPITAL_BOSS_TOLLMAN.id,
      active: (row) => row && row.type === CAPITAL_BOSS_TYPE && row.params && row.params.capitalBossId === CAPITAL_BOSS_TOLLMAN.id,
    });
    const capital = targetsByRole(h, mission, 'capital_hull')[0];
    const rock = targetsByRole(h, mission, 'throw_mass')[0];
    assert.ok(capital && rock);
    assert.equal(capital.flags && capital.flags.invuln, false);
    assert.equal(capital.data && capital.data.scanLabel, 'THE TOLLMAN');
    assert.ok((capital.mass || 0) >= 400);
    let throws = 0;
    while (capital.alive !== false && throws < 10) {
      h.sim.bus.emit('massline:throw', { payloadId: rock.id, aimTargetId: capital.id, payloadSpeed: 88 });
      h.sim.bus.emit('tether:whipImpact', {
        victimId: capital.id, targetId: rock.id, rating: 'solid', relSpeed: 88, mass: rock.mass || 180, momentum: 72000,
      });
      h.state.tick = (h.state.tick | 0) + 1;
      if (h.sim.registry.get('combat')?.kernel?.prePhysics) h.sim.registry.get('combat').kernel.prePhysics(1 / 60);
      if (h.sim.registry.get('tumbleStates')?.update) h.sim.registry.get('tumbleStates').update(1 / 60, h.state);
      throws += 1;
    }
    assert.equal(capital.alive, false, 'physics-only path must kill the Tollman');
    assert.ok(h.completed.some((row) => row.capitalBossId === CAPITAL_BOSS_TOLLMAN.id));
    assert.ok(h.claimsSys.endgamePulls().completed.capital_boss_tollman);
    const refreshed = h.missionsSys.ensureBoard('station_sker');
    assert.equal((refreshed.slots || []).some((row) => row && row.params && row.params.capitalBossId === CAPITAL_BOSS_TOLLMAN.id), false,
      'a finished endgame heavy does not re-post');
    h.sim.dispose();
  } finally {
    restoreFeatureMaps(flags);
  }
});

test('PQ-170.02 claims ledger, news, factions, and save round-trip a finished pull', () => {
  const h = bootClaims();
  h.bus.emit('mission:completed', {
    missionId: 'm1',
    type: 'authored_set_piece',
    factionId: 'faction_vael',
    causeTag: 'pq170-mega-heist',
    megaHeistId: 'mega_heist_tessera_core',
    victimFactionId: 'faction_scn',
    completionMethod: 'yank_the_hatch',
  });
  const rec = h.sys.endgamePulls().completed.mega_heist_tessera_core;
  assert.equal(rec.kind, 'mega_heist');
  assert.equal(rec.victimFactionId, 'faction_scn');
  const news = h.bus.emitLog.filter((e) => e.evt === 'news:publish');
  assert.equal(news.length, 1);
  assert.match(news[0].payload.text, /Tessera/);
  h.bus.emit('mission:completed', {
    missionId: 'm1b',
    type: 'authored_set_piece',
    factionId: 'faction_vael',
    causeTag: 'pq170-mega-heist',
    megaHeistId: 'mega_heist_tessera_core',
    victimFactionId: 'faction_scn',
  });
  assert.equal(h.sys.endgamePulls().completedOrder.length, 1, 'a pull files once');

  const snapshot = JSON.parse(JSON.stringify(h.sys.serialize()));
  const cold = bootClaims();
  cold.sys.deserialize(snapshot);
  assert.equal(cold.sys.endgamePulls().completed.mega_heist_tessera_core.kind, 'mega_heist');

  const f = factionsHarness();
  const scnBefore = f.state.factions.faction_scn.rep;
  f.bus.emit('endgame:pullCompleted', {
    pullId: 'mega_heist_tessera_core', factionId: 'faction_vael', victimFactionId: 'faction_scn', kind: 'mega_heist',
  });
  assert.ok(f.state.factions.faction_scn.rep < scnBefore, 'Concord standing falls for the stolen core');
  assert.ok(f.events.some((e) => e.event === 'faction:repChanged' && e.payload.reason === 'endgame_pull_victim'));
  f.state.claims.endgamePulls = {
    schema: 'endgame_pulls_v1',
    completed: { mega_heist_tessera_core: { id: 'mega_heist_tessera_core', victimFactionId: 'faction_scn' } },
    completedOrder: ['mega_heist_tessera_core'],
  };
  const scnPower = f.state.factions.faction_scn.power;
  f.sys._recomputeFactionPower(f.state);
  assert.ok(f.state.factions.faction_scn.power < scnPower, 'the stolen core leaves a Concord power hole');
});
