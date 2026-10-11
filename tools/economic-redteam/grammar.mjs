// Player-action grammar. Each verb calls a public writer or the bus event the
// station UI already emits. Missing verbs are labeled unavailable. Nothing here
// assigns state.player.credits.

import { addCargo } from '../../src/systems/cargo.js';
import {
  HOME_FACTION,
  HOME_STATION,
  bayQty,
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
  'sell_ship',
  'loot_drop',
  'step',
  'offline_catchup',
  'save_roundtrip',
  'freight_delivery',
  'bad_qty',
  'raise_standing',
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

export function saveRoundtrip(sim) {
  const econ = econOf(sim);
  const before = sim.state.player.credits;
  const snap = econ.serialize();
  econ.deserialize(snap);
  sim.bus.emit('save:loaded');
  return result('save_roundtrip', {
    ok: sim.state.player.credits === before,
    reason: sim.state.player.credits === before ? null : 'credits_changed',
    creditsDelta: sim.state.player.credits - before,
    detail: { before, after: sim.state.player.credits },
  });
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

export function plantSealedDelivery(sim, { missionId, commodityId, qty, rewardCr, destStationId }) {
  const mission = {
    id: missionId,
    status: 'active',
    type: 'cargo_delivery',
    title: 'Red-team sealed haul',
    destStationId,
    stationId: destStationId,
    factionId: HOME_FACTION,
    reward_cr: rewardCr,
    collateral_cr: 0,
    preloadedCargo: true,
    params: {
      cmdtyId: commodityId,
      qty,
      sealedRemaining: qty,
      sealedDelivered: 0,
      sealAccounted: true,
    },
    objectiveProgress: 0,
    objectiveTarget: 1,
  };
  sim.state.missions.active.push(mission);
  const loaded = addCargo(sim.state, commodityId, qty);
  return { mission, loaded };
}

export function firstBoardOffer(sim, stationId = HOME_STATION) {
  const board = sim.state.missions.boards && sim.state.missions.boards[stationId];
  const slots = board && Array.isArray(board.slots) ? board.slots : [];
  return slots.find((offer) => offer && offer.id && Number(offer.reward_cr) > 0 && !offer.storyDisposition) || null;
}
