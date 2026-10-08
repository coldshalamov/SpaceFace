// RACE-01 launch. A fresh flight may enter the circuit's sector. A live campaign save may
// not: enterSector always charts, and the Veil is charted:false. In-sector arming only
// posts the offer and relocates onto the grid.

import { activeRaceMission } from '../systems/racingSteer.js';
import { raceLevelById, racingOfferFor, racingSeedFor, startLineFor } from '../data/raceLevels.js';

let pending = null;

export function stageRacingLaunch(contractId) {
  if (!racingOfferFor(contractId)) { pending = null; return null; }
  pending = {
    contractId,
    seed: racingSeedFor(contractId),
  };
  return pending;
}

/** Drop a staged circuit if this new game is not the one the board just asked for. */
export function noteRacingNewGame(opts) {
  if (!pending) return;
  const seed = Number(opts && opts.seed);
  if (opts?.racingSession !== true || !Number.isFinite(seed) || (seed >>> 0) !== pending.seed) pending = null;
}

export function takeRacingLaunch() {
  const row = pending;
  pending = null;
  return row;
}

export function armRacingContract(ctx, contractId, options = {}) {
  const allowEnterSector = options.allowEnterSector === true;
  const offer = racingOfferFor(contractId);
  const level = offer && raceLevelById(offer.params && offer.params.levelId);
  const bus = ctx && ctx.bus;
  const toast = (text, kind = 'warn') => {
    if (bus && typeof bus.emit === 'function') bus.emit('toast', { text, kind, ttl: 4 });
  };
  if (!offer || !level) {
    toast('That circuit is not on the board.');
    return { ok: false, reason: 'unknown' };
  }
  const registry = ctx && ctx.registry;
  const missions = registry && registry.get && registry.get('missions');
  const world = registry && registry.get && registry.get('world');
  const state = ctx && ctx.state;
  if (!missions || typeof missions.postAndAcceptAuthoredOffer !== 'function') {
    toast('Contracts are not ready.');
    return { ok: false, reason: 'no_missions' };
  }
  const player = state?.entities?.get?.(state.playerId);
  if (state?.mode !== 'flight' || state?.ui?.docked || !player?.pos || player.alive === false) {
    toast('Launch from a live, undocked ship.');
    return { ok: false, reason: 'not_flying' };
  }
  if (activeRaceMission(state)) {
    toast('Finish or leave the current circuit before starting another.');
    return { ok: false, reason: 'race_active' };
  }
  if (!world || typeof world.relocatePlayerInSector !== 'function') {
    toast('The starting grid is not ready.');
    return { ok: false, reason: 'no_relocation' };
  }
  const jump = state.jump?.state;
  if (jump && jump !== 'idle') {
    toast('Finish the jump before joining a circuit.');
    return { ok: false, reason: 'jump_active' };
  }
  const maxActive = state.missions?.config?.maxActive || 8;
  if ((state.missions?.active?.length || 0) >= maxActive) {
    toast('Free a mission slot before joining a circuit.');
    return { ok: false, reason: 'mission_capacity' };
  }
  const here = state && state.world && state.world.currentSectorId;
  if (here !== level.sectorId) {
    if (!allowEnterSector) {
      toast(`Fly to ${level.name} first. A live save is not jumped.`);
      return { ok: false, reason: 'wrong_sector' };
    }
    if (!world || typeof world.enterSector !== 'function') {
      toast('The sector chart is not ready.');
      return { ok: false, reason: 'no_world' };
    }
  }
  const now = state && Number.isFinite(state.simTime) ? state.simTime : 0;
  if (Number(offer.params.gridHoldS) > 0 && !Number.isFinite(offer.params.gridUntilSimS)) {
    offer.params.gridUntilSimS = now + Number(offer.params.gridHoldS);
  }
  const result = missions.postAndAcceptAuthoredOffer(offer);
  if (!result || result.ok !== true || result.reused) {
    toast(result && result.reused
      ? 'That circuit is already on the book.'
      : 'The circuit did not take.');
    return result && result.ok === false ? result : { ok: false, reason: 'accept_failed', result };
  }
  try {
    if (here !== level.sectorId) world.enterSector(level.sectorId);
    const start = startLineFor(offer.params);
    if (!start || world.relocatePlayerInSector(start, { reason: 'race_grid' }) === false) {
      throw new Error('Grid relocation refused');
    }
  } catch (error) {
    // Acceptance is rolled back via the mission owner, never by splicing its list from UI.
    bus?.emit?.('mission:abandon', { missionId: result.missionId });
    toast('The circuit could not open its starting grid. No active race was left behind.');
    return { ok: false, reason: 'grid_failed' };
  }
  bus?.emit?.('race:armed', { missionId: result.missionId, contractId });
  toast(offer.summary || offer.title, 'info');
  return result;
}
