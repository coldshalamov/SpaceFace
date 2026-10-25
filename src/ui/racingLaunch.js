// RACE-01 launch. A fresh flight may enter the circuit's sector. A live campaign save may
// not: enterSector always charts, and the Veil is charted:false. In-sector arming only
// posts the offer; section missions approach the grid under their own power.

import { activeRaceMission } from '../systems/racingSteer.js';
import { raceLevelById, racingOfferFor, racingSeedFor, startLineFor } from '../data/raceLevels.js';
import { normalizeRaceOptions, stageRacingMeeting } from '../systems/racingCareer.js';
import { laneCommandSink, laneRpc } from '../core/simLaneCommands.js';
import { validateRacingCircuit } from '../data/raceCourses.js';
import { isRacingCorridorSession } from '../world/racingCorridor.js';
import { resolvePropulsionProfile } from '../core/flight/propulsionCatalog.js';
import { SECTORS } from '../data/sectors.js';
import { globalToSectorLocalForSector } from '../data/sectorCoordinates.js';
import { killMachinesForSector } from '../data/environmentalMachinery.js';

let pending = null;

const LAUNCH_SECTOR_BY_ID = new Map((SECTORS || []).map((sector) => [sector && sector.id, sector]));

/** A temporaryOnly level refuses everything but Time trial — before any side effect. */
function sectorModeRejection(level, options = {}) {
  if (level?.temporaryOnly !== true) return null;
  const mode = typeof options.raceMode === 'string' ? options.raceMode : 'time-trial';
  const modes = Array.isArray(level.raceModes) && level.raceModes.length ? level.raceModes : ['time-trial'];
  if (!modes.includes(mode) || Number.isInteger(options.raceCupId)) return 'time_trial_only';
  return null;
}

/**
 * Authored, immovable solids for the RF-02 envelope check at accept time: stations,
 * POI marks, and native machinery mouths — everything a course author can see from
 * data. Field rocks the corridor arranger owns are not authoring constraints.
 */
function authoredStaticSolids(level) {
  const sector = LAUNCH_SECTOR_BY_ID.get(level && level.sectorId);
  if (!sector) return [];
  const solids = [];
  for (const st of sector.stations || []) {
    if (!st?.pos || !Number.isFinite(st.pos.x)) continue;
    const r = st.size === 'L' ? 42 : st.size === 'S' ? 26 : 34;
    solids.push({ id: st.id || 'station', x: st.pos.x, z: st.pos.z, radius: r + 40 });
  }
  for (const poi of sector.pois || []) {
    if (!poi?.pos || !Number.isFinite(poi.pos.x)) continue;
    solids.push({ id: poi.id || 'poi', x: poi.pos.x, z: poi.pos.z,
      radius: Math.max(24, Number(poi.placeTargetRadius) || Number(poi.visualRadius) || 0) });
  }
  for (const machine of killMachinesForSector(sector.id) || []) {
    if (!machine?.globalPos || !machine?.mouth) continue;
    const local = globalToSectorLocalForSector(machine.globalPos, sector.id, { x: 0, z: 0 });
    solids.push({ id: machine.id, x: local.x, z: local.z, radius: Number(machine.mouth.radius) || 18 });
  }
  return solids;
}

export function stageRacingLaunch(contractId, options = {}) {
  const stagedOffer = racingOfferFor(contractId);
  if (!stagedOffer) { pending = null; return null; }
  const stagedLevel = raceLevelById(stagedOffer.params && stagedOffer.params.levelId);
  const rejected = sectorModeRejection(stagedLevel, options);
  if (rejected) { pending = null; return { ok: false, reason: rejected }; }
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
  const finish = (resolved) => {
    if (resolved?.ok === true && !resolved.reused) return resolved;
    // Exit while the save owner still quarantines this temporary state. Exit autosave must
    // never write a failed circuit's starter hull over a campaign. The following receipt
    // invalidates pending capture work, but only New Game/Continue may release quarantine.
    ctx?.bus?.emit?.('game:exitToMenu', { source: 'racing-launch-failed' });
    ctx?.bus?.emit?.('race:launchFailed', { contractId: row.contractId, reason: resolved?.reason || 'accept_failed' });
    ctx?.bus?.emit?.('toast', { text: 'Circuit launch failed. Returned to the menu; campaign saves are unchanged.', kind: 'warn', ttl: 5 });
    return resolved || { ok: false, reason: 'accept_failed' };
  };
  // Worker lane: the arm resolves on the rpc ack — the same failure tail runs there.
  if (result && typeof result.then === 'function') return result.then(finish);
  return finish(result);
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
  // AL-RACE-2: reject unsupported formats before params mutation, meeting
  // allocation, relocation or world change — never after.
  const modeRejected = sectorModeRejection(level, options);
  if (modeRejected) {
    toast('This circuit runs as a Time trial only.');
    return { ok: false, reason: modeRejected };
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
  // AL-RACE-2: the six sector circuits exist only inside their staged temporary
  // session. A live campaign flight may never arm one — no matter the sector.
  if (level.temporaryOnly === true && !isRacingCorridorSession(state)) {
    toast('This circuit only runs as a temporary flight from the board.');
    return { ok: false, reason: 'temporary_circuit_required' };
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
  // AL-RACE-2: RF-02 — the sector circuit's structure and the fitted hull's
  // propulsion envelope are proven before the offer is accepted or the meeting
  // ticket is spent.
  if (level.temporaryOnly === true) {
    const verdict = validateRacingCircuit(level.course, {
      hullRadiusWU: Number(player?.physicsBody?.radius ?? player?.radius) || 32,
      profile: resolvePropulsionProfile(player, state),
      referenceSpeedsWU: { turn: 60, straight: 120 },
      solids: authoredStaticSolids(level),
      boostGateIndex: offer.params.boostGateIndex,
    });
    if (!verdict.ok) {
      toast('This circuit failed its course check.');
      return { ok: false, reason: 'invalid_course', diagnostics: verdict.errors };
    }
  }
  const relocate = !offer.params.sectionMission || allowEnterSector;
  if (relocate && (!world || typeof world.relocatePlayerInSector !== 'function')) {
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
  if (!offer.params.sectionMission && Number(offer.params.gridHoldS) > 0 && !Number.isFinite(offer.params.gridUntilSimS)) {
    offer.params.gridUntilSimS = now + Number(offer.params.gridHoldS);
  }
  if (allowEnterSector && ['race','cup'].includes(offer.params.raceMode)) {
    let storage=null;try{storage=globalThis.localStorage;}catch{}
    const receipt=stageRacingMeeting(storage);
    if(receipt)Object.assign(offer.params,receipt);
  }
  const start = startLineFor(offer.params);
  if (start && relocate && offer.params.sectionMission) {
    start.x -= Math.cos(start.heading) * 220;
    start.z -= Math.sin(start.heading) * 220;
  }
  if (typeof laneCommandSink === 'function' && laneCommandSink()) {
    // Worker lane: the whole arm — post+accept, the sector hop, and the grid
    // relocation — is one sim-side rpc, so a mid-chain refusal can't split
    // across ticks (and its rollback emits on the sim bus).
    return laneRpc('racingArm', { offer, sectorId: level.sectorId, start, relocate, allowEnterSector })
      .then((ack) => finishArmReply(ack && ack.result, offer, contractId, bus, toast));
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
    if (relocate) {
      if (!start || world.relocatePlayerInSector(start, { reason: 'race_grid' }) === false) {
        throw new Error('Grid relocation refused');
      }
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

/** Map a racingArm rpc reply onto the main path's result/emit contract. */
function finishArmReply(arm, offer, contractId, bus, toast) {
  const post = arm && arm.result;
  if (!arm || arm.ok !== true || (post && post.reused === true)) {
    if (arm && arm.reason === 'grid_failed') {
      // the rpc already rolled the post back sim-side via mission:abandon
      toast('The circuit could not open its starting grid. No active race was left behind.');
      return { ok: false, reason: 'grid_failed' };
    }
    toast(post && post.reused === true
      ? 'That circuit is already on the book.'
      : 'The circuit did not take.');
    return post && post.ok === false ? post : { ok: false, reason: 'accept_failed', result: post ?? arm };
  }
  bus?.emit?.('race:armed', { missionId: arm.missionId, contractId });
  toast(offer.summary || offer.title, 'info');
  return post || { ok: true, missionId: arm.missionId };
}
