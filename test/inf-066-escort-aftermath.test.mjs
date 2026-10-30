// INF-066 — a failed escort becomes a playable aftermath. The escortee-loss stamp routes the
// salvage successor to the true wreck (not the old destination), the marker covers the
// recovery leg, real salvage work moves progress, and docking short settles once at a
// proportional price. Success, partial, and abandonment each settle exactly once: the
// successor carries no faction hook and no collateral, so the original failure's penalty is
// never re-applied.
import test from 'node:test';
import assert from 'node:assert/strict';

import { hash32, mulberry32 } from '../src/core/rng.js';
import { MISSION_TUNING } from '../src/data/missions.js';
import {
  escortLossSite,
  missions,
  mutationWreckRouting,
  mutationPartialSettlement,
  isMutationRecovery,
} from '../src/systems/missions.js';

test('the loss site stamps sector and wreck pos, and rejects garbage', () => {
  assert.deepEqual(
    escortLossSite({ x: 120, z: -40 }, 'sector_vesta'),
    { sectorId: 'sector_vesta', wreckPos: { x: 120, z: -40 } },
    'destroy payload pos plus current sector is the stamp',
  );
  assert.equal(escortLossSite(null, 'sector_vesta'), null, 'no pos means no stamp');
  assert.equal(escortLossSite({ x: 1, z: 2 }, null), null, 'no sector means no stamp');
});

test('routing prefers the stamp, then the successor params, then legacy fallbacks', () => {
  const stamped = {
    destSectorId: 'sector_old_dest',
    _escorteeSectorId: 'sector_true_loss',
    _escorteeWreckPos: { x: 1, z: 2 },
  };
  assert.deepEqual(
    mutationWreckRouting(stamped, 'sector_now'),
    { sectorId: 'sector_true_loss', wreckPos: { x: 1, z: 2 } },
    'the stamp beats the old destination',
  );
  const successor = {
    destSectorId: 'sector_true_loss',
    params: { lostSectorId: 'sector_true_loss', lostWreckPos: { x: 1, z: 2 } },
  };
  assert.deepEqual(
    mutationWreckRouting(successor, 'sector_now'),
    { sectorId: 'sector_true_loss', wreckPos: { x: 1, z: 2 } },
    'the successor reads its carried params — both sides agree on the wreck',
  );
  assert.deepEqual(
    mutationWreckRouting({ destSectorId: 'sector_d' }, 'sector_now'),
    { sectorId: 'sector_d', wreckPos: null },
    'legacy fallback chain survives when nothing was stamped',
  );
});

test('partial settlement pays proportionally on the successor stake, and never on empty', () => {
  assert.deepEqual(
    mutationPartialSettlement(3, 4, 1000),
    { deliverQty: 3, partial: true, payCr: 750 },
    'short delivery settles once at a proportional price',
  );
  const full = mutationPartialSettlement(4, 4, 1000);
  assert.equal(full.partial, false, 'full delivery is not partial');
  assert.equal(full.payCr, 1000, 'full delivery keeps the whole stake');
  assert.equal(mutationPartialSettlement(0, 4, 1000), null, 'empty hold keeps the legacy path');
  assert.equal(isMutationRecovery({ mutationTag: 'salvage' }), true, 'salvage tag has a recovery leg');
  assert.equal(isMutationRecovery({ mutationTag: 'recovery' }), true, 'recovery tag has a recovery leg');
  assert.equal(isMutationRecovery({ mutationTag: 'cooked' }), true, 'cooked tag has a recovery leg');
  assert.equal(isMutationRecovery({}), false, 'ordinary missions have no recovery leg');
});

// The live seams, driven through the ordinary route: accept an escort on the board, lose the
// lead hull on the bus, then fly the salvage successor — marker, real salvage work, short dock.
class Bus {
  constructor() { this.handlers = new Map(); this.log = []; }
  on(name, fn) {
    const rows = this.handlers.get(name) || [];
    rows.push(fn);
    this.handlers.set(name, rows);
    return () => this.off(name, fn);
  }
  off(name, fn) {
    this.handlers.set(name, (this.handlers.get(name) || []).filter((entry) => entry !== fn));
  }
  emit(name, payload) {
    this.log.push({ name, payload });
    for (const fn of [...(this.handlers.get(name) || [])]) fn(payload);
  }
}

const LOSS_SECTOR = 'sector_helios_prime';
const OLD_DEST_SECTOR = 'sector_vesta_forge';
const LOSS_POS = { x: 60, z: 10 };

function bootEscort() {
  const offer = {
    id: 'offer_escort_inf066', type: 'escort', stationId: 'station_helios', factionId: 'faction_mts',
    params: { targetStrength: 1, convoySize: 1 }, reward_cr: 900, collateral_cr: 0, riskTier: 2,
    destStationId: 'station_forge', destSectorId: OLD_DEST_SECTOR, distance: 2400,
    title: 'Escort the relief convoy', summary: 'Keep the convoy intact to Forge Foundry.',
    source: 'careerContract',
  };
  const state = {
    meta: { seed: 66, playtimeS: 0 }, seed: 66, tick: 0, simTime: 20, mode: 'flight', playerId: 1,
    player: {
      credits: 5000, researchPoints: 0,
      cargo: { items: {}, capVolume: 40, capMass: 40, usedVolume: 0, usedMass: 0 }, stats: {},
    },
    missions: {
      boards: { station_helios: { refreshEpoch: 0, slots: [offer] } },
      active: [], completedLog: [], receipts: [], nextId: 1,
      config: JSON.parse(JSON.stringify(MISSION_TUNING)),
    },
    story: { beatIndex: 0, branch: null, flags: {}, chainProgress: 0 },
    factions: { faction_mts: { rep: 500 } },
    world: { currentSectorId: LOSS_SECTOR, activeSector: { stations: [] } },
    combat: { entities: {}, beams: [] },
    entities: new Map(), entityList: [],
    ui: { docked: false, dockedStationId: null, trackedMissionId: null },
    nav: {}, settings: { gameplay: { tutorialHints: false } },
  };
  const bus = new Bus();
  const missionSystem = { ...missions };
  missionSystem.init({ state, bus, helpers: { hash32, mulberry32, voice: { say: () => true } }, registry: { get: () => null } });
  bus.emit('ui:acceptMission', { missionId: offer.id });
  const escort = state.missions.active[0];
  assert.ok(escort && escort.type === 'escort', 'the escort is accepted off the board');
  escort._escorteeId = 555;
  bus.emit('entity:destroyed', { id: 555, type: 'ship', pos: { ...LOSS_POS } });
  const successor = state.missions.active.find((x) => x && x.mutatedFromMissionId === escort.id);
  return { state, bus, missionSystem, escort, successor };
}

test('losing the lead stamps the loss site before the failure, and the successor routes to it', () => {
  const { escort, successor } = bootEscort();
  assert.equal(escort.status, 'failed', 'the escort fails on the lead loss');
  assert.equal(escort._escorteeSectorId, LOSS_SECTOR, 'the failing row carries the stamped sector');
  assert.deepEqual(escort._escorteeWreckPos, LOSS_POS, 'the failing row carries the wreck pos');
  assert.ok(successor, 'the loss mints the salvage successor');
  assert.equal(successor.type, 'salvage_retrieval');
  assert.equal(isMutationRecovery(successor), true, 'the successor has a recovery leg');
  assert.equal(successor.destSectorId, LOSS_SECTOR, 'the stamp beats the old destination sector');
  assert.notEqual(successor.destSectorId, OLD_DEST_SECTOR);
  assert.deepEqual(
    mutationWreckRouting(successor, LOSS_SECTOR),
    { sectorId: LOSS_SECTOR, wreckPos: LOSS_POS },
    'the successor and the failed escort agree on the wreck',
  );
});

test('the recovery leg marks the wreck with both legs in words', () => {
  const { missionSystem, successor } = bootEscort();
  const wp = missionSystem._missionWaypoint(successor);
  assert.ok(wp, 'the successor has a marker');
  assert.deepEqual(wp.pos, LOSS_POS, 'the marker sits on the loss site');
  assert.equal(wp.sectorId, LOSS_SECTOR);
  assert.match(wp.reason, /^Recover the convoy wreck, then deliver to /);
});

test('real salvage work moves successor progress, and a short dock settles once as a partial recovery', () => {
  const { state, bus, missionSystem, successor } = bootEscort();
  const cmdtyId = successor.params.cmdtyId;
  const need = Math.max(1, successor.params.qty || 1);
  assert.ok(cmdtyId && need >= 2, 'the successor names a commodity and a multi-unit qty');
  const wreck = { id: 777, type: 'wreck', alive: true, pos: { ...LOSS_POS }, vel: { x: 0, z: 0 }, data: {} };
  state.entities.set(wreck.id, wreck); state.entityList.push(wreck);

  bus.emit('salvage:completed', { wreckId: wreck.id, loot: { [cmdtyId]: 1 } });
  assert.equal(successor.objectiveProgress, 1, 'one unit pulled from the loss-sector wreck counts');
  const update = bus.log.find((e) => e.name === 'mission:updated' && e.payload.missionId === successor.id
    && e.payload.salvageRecovered === true);
  assert.ok(update, 'the progress is announced as salvage recovered');

  // One unit aboard (short of `need`), dock at home: proportional pay, completed once.
  state.player.cargo.items[cmdtyId] = 1;
  const stake = successor.reward_cr;
  const expected = mutationPartialSettlement(1, need, stake);
  missionSystem._onDockedObjectives(successor.destStationId);
  assert.equal(successor.status, 'completed', 'the short dock completes the successor');
  assert.equal(successor.params.completionMethod, 'partial_recovery');
  assert.equal(successor.reward_cr, expected.payCr, 'pay is proportional on the successor stake');
  assert.equal(state.missions.active.includes(successor), false, 'it settles exactly once');
  missionSystem._onDockedObjectives(successor.destStationId);
  assert.equal(
    bus.log.filter((e) => e.name === 'mission:completed' && e.payload.missionId === successor.id).length,
    1,
    'a second dock does not settle again',
  );
});
