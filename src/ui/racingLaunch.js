// RACE-01 launch. A fresh flight may enter the circuit's sector. A live campaign save may
// not: enterSector always charts, and the Veil is charted:false. In-sector arming only
// posts the offer and relocates onto the grid.

import { raceLevelById, racingOfferFor, racingSeedFor, startLineFor } from '../data/raceLevels.js';

let pending = null;

export function stageRacingLaunch(contractId) {
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
  if (!Number.isFinite(seed) || (seed >>> 0) !== pending.seed) pending = null;
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
    world.enterSector(level.sectorId);
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
  const start = startLineFor(offer.params);
  if (start && world && typeof world.relocatePlayerInSector === 'function') {
    world.relocatePlayerInSector(
      { x: start.x, z: start.z, heading: start.heading },
      { reason: 'race_grid' },
    );
  }
  toast(offer.summary || offer.title, 'info');
  return result;
}
