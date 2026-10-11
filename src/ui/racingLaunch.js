// RACE-01 launch. A fresh flight may enter the circuit's sector. A live campaign save may
// not: enterSector always charts, and the Veil is charted:false. In-sector arming only
// posts the offer and relocates onto the grid.

import { activeRaceMission } from '../systems/racingSteer.js';
import { raceLevelById, racingOfferFor, racingSeedFor, startLineFor } from '../data/raceLevels.js';
import { normalizeRaceOptions, stageRacingMeeting } from '../systems/racingCareer.js';

let pending = null;

export function stageRacingLaunch(contractId, options = {}) {
  if (!racingOfferFor(contractId)) { pending = null; return null; }
  pending = {
    contractId,
    seed: racingSeedFor(contractId),
    options: { ...normalizeRaceOptions(options),
      ...(Number.isInteger(options.raceCupId) ? { raceCupId: options.raceCupId,
        raceCupHeat: options.raceCupHeat, raceCupTicket: options.raceCupTicket } : {}) },
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

/** Consume the fresh-run launch at game:started, after the normal run owners have reset. */
export function completeRacingLaunch(ctx) {
  const row = takeRacingLaunch();
  if (!row?.contractId) return null;
  let result;
  try { result = armRacingContract(ctx, row.contractId, { ...row.options, allowEnterSector: true }); }
  catch (error) { result = { ok: false, reason: 'arm_exception', error: String(error?.message || error) }; }
  if (result?.ok === true && !result.reused) return result;
  // Exit while the save owner still quarantines this temporary state. Exit autosave must
  // never write a failed circuit's starter hull over a campaign. The following receipt
  // invalidates pending capture work, but only New Game/Continue may release quarantine.
  ctx?.bus?.emit?.('game:exitToMenu', { source: 'racing-launch-failed' });
  ctx?.bus?.emit?.('race:launchFailed', { contractId: row.contractId, reason: result?.reason || 'accept_failed' });
  ctx?.bus?.emit?.('toast', { text: 'Circuit launch failed. Returned to the menu; campaign saves are unchanged.', kind: 'warn', ttl: 5 });
  return result || { ok: false, reason: 'accept_failed' };
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
  Object.assign(offer.params, normalizeRaceOptions(options));
  if (Number.isInteger(options.raceCupId)) Object.assign(offer.params, {
    raceCupId: options.raceCupId, raceCupHeat: options.raceCupHeat, raceCupTicket: options.raceCupTicket,
  });
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
  if (state.player?.tether?.active) {
    toast('Release the Massline before joining the starting grid.');
    return { ok: false, reason: 'tether_active' };
  }
  if (!world || typeof world.relocatePlayerInSector !== 'function') {
    toast('The starting grid is not ready.');
    return { ok: false, reason: 'no_relocation' };
  }
  const jump = state.jump?.state;
  if (jump && jump !== 'IDLE') {
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
  if (allowEnterSector && ['race','cup'].includes(offer.params.raceMode)) {
    let storage=null;try{storage=globalThis.localStorage;}catch{}
    const receipt=stageRacingMeeting(storage);
    if(receipt)Object.assign(offer.params,receipt);
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
