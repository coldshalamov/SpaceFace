// Player-action grammar. Each verb calls a public writer or the bus event the
// station UI already emits. Missing verbs are labeled unavailable. Nothing here
// assigns state.player.credits.

import { COMMODITIES } from '../../src/data/commodities.js';
import { killRewardRecipeFor } from '../../src/data/killRewards.js';
import { combat } from '../../src/systems/combat.js';
import { lootShards } from '../../src/systems/lootShards.js';
import { makeShipEntitySpec } from '../../src/systems/ships.js';
import {
  HOME_FACTION,
  HOME_STATION,
  bayQty,
  bootRedTeam,
  captureLedger,
  custodyUnits,
  dockAt,
  econOf,
  holdQty,
  listenCredits,
  playerPos,
  repOf,
  stationRecord,
  stockQty,
  undock,
} from './runtime.mjs';

const LEGALITY = new Map(COMMODITIES.map((row) => [row.id, row.legality || 'legal']));

export const ACTION_IDS = Object.freeze([
  'buy',
  'sell',
  'dock',
  'undock',
  'accept_mission',
  'abandon_mission',
  'service',
  'bribe',
  'craft',
  'set_active_ship',
  'buy_ship',
  'buy_module',
  'fit_module',
  'sell_ship',
  'loot_drop',
  'step',
  'offline_catchup',
  'save_continue',
  'freight_delivery',
  'bad_qty',
  'raise_standing',
  'tow',
  'source_fit',
  'ship_loss',
]);

function result(action, extra = {}) {
  return {
    action,
    ok: extra.ok === true,
    unavailable: extra.unavailable === true,
    reason: extra.reason || null,
    creditsDelta: Number(extra.creditsDelta) || 0,
    detail: extra.detail || null,
  };
}

function withCredits(sim, fn) {
  const ear = listenCredits(sim.bus);
  const before = sim.state.player.credits;
  let body;
  try {
    body = fn() || {};
  } finally {
    ear.stop();
  }
  const creditsDelta = sim.state.player.credits - before;
  return {
    creditsDelta,
    reasons: ear.rows.map((row) => row.reason),
    creditRows: ear.rows,
    ...body,
  };
}

export function buy(sim, commodityId, qty) {
  return trade(sim, 'buy', commodityId, qty);
}

export function sell(sim, commodityId, qty) {
  return trade(sim, 'sell', commodityId, qty);
}

function trade(sim, side, commodityId, qty) {
  const stationId = sim.state.ui && sim.state.ui.docked === true
    ? sim.state.ui.dockedStationId
    : null;
  if (!stationId) {
    return result(side, { ok: false, reason: 'not_docked', detail: { commodityId, qty } });
  }
  let receipt = null;
  const onOk = (payload) => { receipt = { ok: true, ...(payload || {}) }; };
  const onFail = (payload) => { receipt = { ok: false, ...(payload || {}) }; };
  sim.bus.on('economy:tradeCompleted', onOk);
  sim.bus.on('economy:tradeFailed', onFail);
  const watched = withCredits(sim, () => {
    sim.bus.emit(side === 'buy' ? 'ui:buy' : 'ui:sell', { commodityId, qty });
  });
  sim.bus.off('economy:tradeCompleted', onOk);
  sim.bus.off('economy:tradeFailed', onFail);
  return result(side, {
    ok: !!(receipt && receipt.ok),
    reason: receipt && receipt.ok ? null : (receipt && receipt.reason) || 'no_receipt',
    creditsDelta: watched.creditsDelta,
    detail: {
      commodityId,
      qty,
      stationId,
      receipt,
      reasons: watched.reasons,
      hold: holdQty(sim.state, commodityId),
      stock: stockQty(sim.state, stationId, commodityId),
    },
  });
}

export function dock(sim, stationId) {
  const info = stationRecord(stationId);
  if (!info) return result('dock', { ok: false, reason: 'unknown_station', detail: { stationId } });
  const watched = withCredits(sim, () => { dockAt(sim, stationId); });
  return result('dock', {
    ok: true,
    creditsDelta: watched.creditsDelta,
    detail: { stationId, reasons: watched.reasons, services: info.services },
  });
}

export function leaveDock(sim) {
  const watched = withCredits(sim, () => { undock(sim); });
  return result('undock', { ok: true, creditsDelta: watched.creditsDelta, detail: { reasons: watched.reasons } });
}

export function acceptMission(sim, missionId) {
  if (!missionId) return result('accept_mission', { ok: false, reason: 'no_offer' });
  const before = (sim.state.missions.active || []).length;
  const watched = withCredits(sim, () => {
    sim.bus.emit('ui:acceptMission', { missionId });
  });
  const active = sim.state.missions.active || [];
  const accepted = active.length > before;
  return result('accept_mission', {
    ok: accepted,
    reason: accepted ? null : 'refused',
    creditsDelta: watched.creditsDelta,
    detail: {
      missionId,
      activeId: accepted ? active[active.length - 1].id : null,
      reasons: watched.reasons,
    },
  });
}

export function abandonMission(sim, missionId) {
  if (!missionId) return result('abandon_mission', { ok: false, reason: 'no_mission' });
  const watched = withCredits(sim, () => {
    sim.bus.emit('ui:abandonMission', { missionId });
  });
  const still = (sim.state.missions.active || []).some((mission) => mission && mission.id === missionId && mission.status === 'active');
  return result('abandon_mission', {
    ok: !still,
    reason: still ? 'still_active' : null,
    creditsDelta: watched.creditsDelta,
    detail: { missionId, reasons: watched.reasons },
  });
}

export function service(sim, type, amount = null) {
  const payload = amount == null ? { type } : { type, amount };
  const watched = withCredits(sim, () => {
    sim.bus.emit('ui:service', payload);
  });
  return result('service', {
    ok: watched.reasons.length > 0,
    reason: watched.reasons.length ? null : 'no_credit_move',
    creditsDelta: watched.creditsDelta,
    detail: {
      type,
      amount,
      debt: Number(sim.state.player.debt) || 0,
      reasons: watched.reasons,
    },
  });
}

export function bribe(sim, fine) {
  const watched = withCredits(sim, () => {
    const econ = econOf(sim);
    return { response: econ.payBribe({ fine }) };
  });
  return result('bribe', {
    ok: true,
    creditsDelta: watched.creditsDelta,
    detail: { fine, reasons: watched.reasons },
  });
}

export function craft(sim, bpId, stationId = HOME_STATION) {
  const watched = withCredits(sim, () => {
    const sys = sim.registry.get('crafting');
    return { built: sys.build(bpId, stationId) };
  });
  return result('craft', {
    ok: watched.built === true,
    reason: watched.built === true ? null : 'refused',
    creditsDelta: watched.creditsDelta,
    detail: { bpId, built: watched.built, reasons: watched.reasons, hold: { ...sim.state.player.cargo.items } },
  });
}

export function setActiveShip(sim, index) {
  const before = custodyUnits(sim.state);
  const watched = withCredits(sim, () => {
    sim.bus.emit('ui:setActiveShip', { index });
  });
  return result('set_active_ship', {
    ok: sim.state.player.activeShipIndex === index,
    reason: sim.state.player.activeShipIndex === index ? null : 'refused',
    creditsDelta: watched.creditsDelta,
    detail: {
      index,
      active: sim.state.player.activeShipIndex,
      before,
      after: custodyUnits(sim.state),
      reasons: watched.reasons,
    },
  });
}

export function buyShip(sim, defId) {
  const before = (sim.state.player.ownedShips || []).length;
  const watched = withCredits(sim, () => {
    sim.bus.emit('ui:buyShip', { defId });
  });
  const after = (sim.state.player.ownedShips || []).length;
  return result('buy_ship', {
    ok: after > before,
    reason: after > before ? null : 'refused',
    creditsDelta: watched.creditsDelta,
    detail: { defId, before, after, reasons: watched.reasons },
  });
}

/** The shipworks comment names ui:sellShip. No listener is registered. */
export function sellShipEvent(sim, index) {
  const before = (sim.state.player.ownedShips || []).length;
  const watched = withCredits(sim, () => {
    sim.bus.emit('ui:sellShip', { index, confirmedCargoUnits: 0 });
  });
  const after = (sim.state.player.ownedShips || []).length;
  const moved = after !== before || watched.creditsDelta !== 0;
  return result('sell_ship', {
    ok: false,
    unavailable: !moved,
    reason: moved ? 'unexpected_effect' : 'unwired_ui_sellShip',
    creditsDelta: watched.creditsDelta,
    detail: { index, before, after, reasons: watched.reasons },
  });
}

export function lootDrop(sim, { commodityId, qty, source = 'kill_burst' }) {
  const pos = playerPos(sim.state);
  const beforeIds = new Set(sim.state.entities.keys());
  sim.bus.emit('loot:drop', {
    source,
    pos,
    items: [{ commodityId, qty }],
  });
  const spawned = [];
  for (const [id, entity] of sim.state.entities) {
    if (!beforeIds.has(id) && entity && entity.type === 'pickup') spawned.push(id);
  }
  return result('loot_drop', {
    ok: spawned.length > 0,
    reason: spawned.length ? null : 'no_pickup',
    detail: { commodityId, qty, source, spawned },
  });
}

export function stepTicks(sim, ticks) {
  const n = Math.max(0, Math.floor(Number(ticks) || 0));
  const dt = 1 / 60;
  const core = sim.registry.get('core');
  for (let i = 0; i < n; i += 1) {
    // The focused host does not put core on the update list. Advance the same
    // fixed clock core would, then step the registered writers.
    if (core && typeof core.update === 'function') core.update(dt, sim.state);
    else {
      sim.state.simTime += dt;
      sim.state.tick = (sim.state.tick | 0) + 1;
    }
    sim.step(dt);
  }
  return result('step', {
    ok: true,
    detail: { ticks: n, simTime: sim.state.simTime, bay: bayQty(sim.state) },
  });
}

export function offlineCatchup(sim, elapsedSec) {
  const sys = sim.registry.get('automation');
  if (!sys || typeof sys.runOfflineCatchup !== 'function') {
    return result('offline_catchup', { unavailable: true, reason: 'automation_unwired' });
  }
  const watched = withCredits(sim, () => {
    return { receipt: sys.runOfflineCatchup({ offlineElapsedSec: elapsedSec, nowMs: 50_000_000 }) };
  });
  const receipt = watched.receipt;
  return result('offline_catchup', {
    ok: true,
    creditsDelta: watched.creditsDelta,
    detail: {
      elapsedSec,
      skipReason: receipt && (receipt.skipReason || receipt.failClosed) || null,
      credited: receipt && receipt.credited || 0,
      reasons: watched.reasons,
    },
  });
}

/** Save through the save writer, then Continue into a rebooted sim. */
export function saveContinue(sim, slot = 'ert-redteam') {
  const save = sim.registry.get('save');
  if (!save || typeof save.save !== 'function' || typeof save.load !== 'function') {
    return {
      sim,
      result: result('save_continue', { unavailable: true, reason: 'save_system_missing' }),
    };
  }
  const before = captureLedger(sim);
  const saved = save.save(slot, { reason: 'manual' });
  if (saved !== true) {
    return {
      sim,
      result: result('save_continue', {
        ok: false,
        reason: 'save_refused',
        detail: { before },
      }),
    };
  }
  const next = bootRedTeam(sim.state.meta.seed);
  const loaded = next.registry.get('save').load(slot);
  const after = captureLedger(loaded === true ? next : sim);
  return {
    sim: loaded === true ? next : sim,
    result: result('save_continue', {
      ok: loaded === true,
      reason: loaded === true ? null : 'continue_refused',
      creditsDelta: after.credits - before.credits,
      detail: { before, after, slot, loaded: loaded === true },
    }),
  };
}

export function freightDelivery(sim, payload) {
  const stationId = payload.stationId;
  const commodityId = payload.commodityId;
  const before = stockQty(sim.state, stationId, commodityId);
  const econ = econOf(sim);
  const first = econ.applyFreightDelivery(payload);
  const mid = stockQty(sim.state, stationId, commodityId);
  const second = econ.applyFreightDelivery(payload);
  const after = stockQty(sim.state, stationId, commodityId);
  return result('freight_delivery', {
    ok: first && first.ok === true,
    creditsDelta: 0,
    detail: { before, mid, after, first, second },
  });
}

export function badQty(sim, commodityId, qty) {
  const econ = econOf(sim);
  const stationId = (sim.state.ui && sim.state.ui.dockedStationId) || HOME_STATION;
  const response = econ.execute(stationId, commodityId, 'buy', qty);
  return result('bad_qty', {
    ok: response && response.ok === false,
    reason: response && response.reason || null,
    detail: { qty, response, stock: stockQty(sim.state, stationId, commodityId) },
  });
}

/**
 * Accept live board offers for one faction and settle them through the missions
 * writer. Standing moves because mission:completed asks factions to apply rep.
 * This does not emit faction:repDelta.
 */
export function completeFactionMissions(sim, factionId = HOME_FACTION, limit = 24) {
  const missions = sim.registry.get('missions');
  const stationId = (sim.state.ui && sim.state.ui.dockedStationId) || HOME_STATION;
  const before = repOf(sim.state, factionId);
  const offerIds = [];
  if (!missions || typeof missions._completeMission !== 'function') {
    return { completed: 0, repBefore: before, repAfter: before, offerIds, reason: 'missions_unwired' };
  }
  let completed = 0;
  while (completed < limit) {
    const board = sim.state.missions.boards && sim.state.missions.boards[stationId];
    const slots = board && Array.isArray(board.slots) ? board.slots : [];
    const offer = slots.find((row) => row && row.id && row.factionId === factionId && !offerIds.includes(row.id));
    if (!offer) break;
    const accepted = acceptMission(sim, offer.id);
    if (!accepted.ok) break;
    const mission = (sim.state.missions.active || []).find((row) => row && row.id === accepted.detail.activeId);
    if (!mission || mission.factionId !== factionId) break;
    missions._completeMission(mission, sim.state.missions.active.indexOf(mission));
    offerIds.push(offer.id);
    completed += 1;
  }
  return {
    completed,
    repBefore: before,
    repAfter: repOf(sim.state, factionId),
    offerIds,
    reason: completed ? null : 'no_faction_offer',
  };
}

/**
 * Kill one hostile through combat. Loot is whatever the kill-reward recipe rolls.
 * The caller does not choose the commodity.
 */
export function runKillRecipe(seed) {
  const sim = bootRedTeam(seed, [combat, lootShards]);
  const creditsBefore = sim.state.player.credits;
  leaveDock(sim);
  const player = sim.state.entities.get(sim.state.playerId);
  const foe = sim.spawn(makeShipEntitySpec('ship_drifter', {
    team: 1,
    factionId: 'faction_reach',
    pos: { x: (player.pos?.x || 0) + 40, z: player.pos?.z || 0 },
    ai: { hostileTeams: [0], huntPlayer: true },
  }));
  foe.data.shipClass = foe.data.shipClass || 'gunship';
  foe.data.ai = { ...(foe.data.ai || {}), hostileTeams: [0], huntPlayer: true };
  const recipe = killRewardRecipeFor(foe);
  const combatSys = sim.registry.get('combat');
  if (!combatSys || typeof combatSys.onHit !== 'function') {
    return {
      ok: false,
      reason: 'combat_unwired',
      recipeId: recipe.id,
      commodities: [],
      bay: {},
      illicit: [],
      creditsBefore,
      sim,
    };
  }
  const hit = combatSys.onHit({
    targetId: foe.id,
    ownerId: player.id,
    damage: 100000,
    damageType: 'kinetic',
    pos: { x: foe.pos.x, z: foe.pos.z },
  });
  stepTicks(sim, 48);
  const bay = {};
  const items = sim.state.player.salvageBay && sim.state.player.salvageBay.items;
  if (items) {
    for (const id of Object.keys(items)) bay[id] = Math.floor(Number(items[id]) || 0);
  }
  const illicit = Object.keys(bay).filter((id) => bay[id] > 0 && LEGALITY.get(id) === 'contraband');
  return {
    ok: hit && hit.ok === true && foe.alive === false,
    reason: foe.alive === false ? null : 'target_survived',
    recipeId: recipe.id,
    commodities: (recipe.materials || []).map((row) => row.commodityId),
    bay,
    illicit,
    killed: foe.alive === false,
    creditsBefore,
    sim,
  };
}

/** Standing moves only through the faction writer's public event. */
export function raiseStanding(sim, factionId, delta) {
  const before = repOf(sim.state, factionId);
  sim.bus.emit('faction:repDelta', { factionId, delta, reason: 'ert:standing_setup' });
  const after = repOf(sim.state, factionId);
  return result('raise_standing', {
    ok: after !== before,
    reason: after !== before ? null : 'no_rep_change',
    detail: { factionId, delta, before, after },
  });
}

/** A sealed lot exists only when a live board offer preloads it. */
export function acceptSealedOffer(sim) {
  const boards = sim.state.missions && sim.state.missions.boards;
  if (!boards) return result('accept_mission', { unavailable: true, reason: 'no_sealed_offer' });
  for (const board of Object.values(boards)) {
    const slots = board && Array.isArray(board.slots) ? board.slots : [];
    for (const offer of slots) {
      if (offer && offer.preloadedCargo === true && offer.id) {
        return acceptMission(sim, offer.id);
      }
    }
  }
  return result('accept_mission', { unavailable: true, reason: 'no_sealed_offer' });
}

export function buyModule(sim, defId) {
  const before = Array.isArray(sim.state.player.moduleInventory) ? sim.state.player.moduleInventory.length : 0;
  const capBefore = sim.state.player.cargo.capVolume;
  const watched = withCredits(sim, () => {
    sim.bus.emit('ui:buyModule', { defId });
  });
  const after = Array.isArray(sim.state.player.moduleInventory) ? sim.state.player.moduleInventory.length : 0;
  return result('buy_module', {
    ok: after > before,
    reason: after > before ? null : 'refused',
    creditsDelta: watched.creditsDelta,
    detail: { defId, before, after, capBefore, capAfter: sim.state.player.cargo.capVolume, reasons: watched.reasons },
  });
}

export function fitModule(sim, defId) {
  const capBefore = sim.state.player.cargo.capVolume;
  const unitsBefore = custodyUnits(sim.state);
  const inventory = sim.state.player.moduleInventory || [];
  const item = [...inventory].reverse().find((row) => row && row.defId === defId);
  const watched = withCredits(sim, () => {
    sim.bus.emit('ui:fitModule', item
      ? { instanceId: item.instanceId, defId }
      : { defId });
  });
  return result('fit_module', {
    ok: sim.state.player.cargo.capVolume !== capBefore,
    reason: sim.state.player.cargo.capVolume !== capBefore ? null : 'cap_unchanged',
    creditsDelta: watched.creditsDelta,
    detail: {
      defId,
      capBefore,
      capAfter: sim.state.player.cargo.capVolume,
      unitsBefore,
      unitsAfter: custodyUnits(sim.state),
      reasons: watched.reasons,
    },
  });
}

export function tow() {
  return result('tow', { unavailable: true, reason: 'no_player_tow_verb' });
}

export function sourceFit() {
  return result('source_fit', { unavailable: true, reason: 'no_player_source_fit_verb' });
}

export function shipLoss() {
  return result('ship_loss', { unavailable: true, reason: 'no_player_ship_loss_verb' });
}

export function firstBoardOffer(sim, stationId = HOME_STATION) {
  const board = sim.state.missions.boards && sim.state.missions.boards[stationId];
  const slots = board && Array.isArray(board.slots) ? board.slots : [];
  return slots.find((offer) => offer && offer.id && Number(offer.reward_cr) > 0 && !offer.storyDisposition) || null;
}
