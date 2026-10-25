// Temporary physical race packs, owned by missions. No save authority or reward writer.
import { makeShipEntitySpec, fittingsFromDefaultModules } from '../systems/ships.js';
import { raceGateGlobals } from '../data/raceLevels.js';
import { advanceCircuit, circuitProgress } from '../systems/racingGeometry.js';
import { isRacingCorridorSession } from '../world/racingCorridor.js';
import { queryNearbyEntities } from '../core/spatialQuery.js';
import { occupantGenerationOf } from '../core/entity.js';
import { getCombatKernel } from '../combat/kernel.js';
import { racingSetPieceDefinitions } from '../data/racingSetPieces.js';
import { RACING_PERSONALITIES, createRacingDriver, racingDriverIntent,
  selectRacingAnchor, racingAnchorReleaseReason, beginRacingContactRecovery } from '../ai/racingDriver.js';
import { stepRacingDraft } from './racingDraft.js';

const compareId = (a, b) => String(a).localeCompare(String(b), 'en');
export const RACING_TAKEDOWN_LOSS_S = 2;
// Effective reach stays inside the standard tether's authored 390 WU envelope.
const ANCHOR_REACH_WU = 330;
const SHOVE_WINDOW_S = 2;
// A shove arms attribution only when the measured impulse is a real hit: impulse/rival
// mass is the contact's delta-V budget (bounded at 40 WU/s per step by the authority).
const SHOVE_IMPULSE_MIN_DELTA_V = 8;
const PIECE_IMPULSE_MIN_DELTA_V = 5;
const PIECE_KINDS = new Set(['crossing', 'shutter', 'wave']);
const takedownReceipts = [];
export function racingTakedownReceipts() { return takedownReceipts.slice(); }
export function clearRacingTakedownReceipts() { takedownReceipts.length = 0; }
function isShutter(body) {
  const piece = body?.data?.raceSetPiece;
  return piece?.kind === 'shutter' || piece?.id === 'tally_customs_shutter';
}
function bodiesTouch(a, b, pad) {
  if (!a?.pos || !b?.pos || a.alive === false || b.alive === false) return false;
  const reach = (Number(a.radius) || 18) + (Number(b.radius) || 18) + pad;
  return Math.hypot(a.pos.x - b.pos.x, a.pos.z - b.pos.z) <= reach;
}
export function racingOpponentGrid(params, index) {
  const gates = raceGateGlobals(params), a = gates[0], b = gates[1];
  if (!a || !b) return null;
  const length = Math.hypot(b.x - a.x, b.z - a.z) || 1;
  const nx = (b.x - a.x) / length, nz = (b.z - a.z) / length;
  const back = [165, 210, 65][index], lateral = [-52, 52, 0][index];
  return { x: a.x - nx * back - nz * lateral, z: a.z - nz * back + nx * lateral, heading: Math.atan2(nz, nx) };
}

export function rankRacingEntrants(rows) {
  return [...rows].sort((a, b) => {
    if (a.status === 'finished' || b.status === 'finished') {
      if (a.status !== b.status) return a.status === 'finished' ? -1 : 1;
      return a.elapsedS - b.elapsedS || compareId(a.id, b.id);
    }
    if (a.status === 'dnf' || b.status === 'dnf') {
      if (a.status !== b.status) return a.status === 'dnf' ? 1 : -1;
    }
    return b.progress - a.progress || compareId(a.id, b.id);
  }).map((row, index) => ({ ...row, position: index + 1 }));
}

export function createRacingOpponents({ state, bus, helpers }) {
  let heat = null;
  const nearby = [];
  const shutterScratch = [];
  const candidateScratch = [];
  function physicsPort() {
    const port = helpers && helpers.combatPhysics;
    return port && typeof port.createAttachment === 'function' ? port : null;
  }
  function kernelFor() {
    if (!physicsPort()) return null;
    try { return getCombatKernel({ state, bus, helpers }); } catch { return null; }
  }
  function noteShutterTakedown(row, entity, now) {
    // Legacy no-physics-port fallback (racing test harnesses). Rook only. A player shove
    // into the shutter costs race time. His own crash does not. The hold is a real pause
    // on his line, never a pace or catch-up change.
    if (row.id !== 'rook' || row.takedownToken || row.status !== 'racing') return;
    const player = state.entities?.get(state.playerId);
    if (player && bodiesTouch(player, entity, 10)) {
      const dx = entity.pos.x - player.pos.x, dz = entity.pos.z - player.pos.z;
      const gap = Math.hypot(dx, dz) || 1;
      const push = ((player.vel?.x || 0) * dx + (player.vel?.z || 0) * dz) / gap;
      if (push > 20) row.playerShoveAt = now;
    }
    const bodies = queryNearbyEntities(state, entity.pos, 80, shutterScratch);
    let shutter = null;
    for (const body of bodies) {
      if (!isShutter(body) || body === entity || body === player) continue;
      if (bodiesTouch(entity, body, 6)) { shutter = body; break; }
    }
    const shoved = Number.isFinite(row.playerShoveAt) && now - row.playerShoveAt <= 3;
    if (!shutter || !shoved) return;
    row.takedownToken = String(shutter.id ?? 'shutter');
    row.lostS = (row.lostS || 0) + RACING_TAKEDOWN_LOSS_S;
    row.resumeAt = now + RACING_TAKEDOWN_LOSS_S;
    const receipt = { rivalId: 'rook', name: row.name, lostS: RACING_TAKEDOWN_LOSS_S, cause: 'shutter',
      shutter: shutter.data?.name || 'Tally customs shutter', setPieceName: shutter.data?.name || 'Tally customs shutter',
      missionId: heat?.missionId, at: now };
    if (takedownReceipts.length >= 24) takedownReceipts.shift();
    takedownReceipts.push(receipt);
    bus?.emit?.('race:takedown', receipt);
  }
  const eligible = mission => mission?.type === 'race' && mission.status === 'active'
    && mission.params?.racingContractId && !mission.params.adventureSpeedId
    && ['race', 'cup'].includes(mission.params.raceMode) && isRacingCorridorSession(state);
  const entityFor = row => state.entities?.get(row.entityId);
  function rivalForImpact(entityId, generation) {
    const row = heat && heat.rivalByEntityId.get(entityId);
    if (!row) return null;
    const entity = entityFor(row);
    if (!entity || entity.alive === false) return null;
    // Generation pinning: a recycled id is a different body, never proof of contact.
    if (generation != null && occupantGenerationOf(entity) !== generation) return null;
    return row;
  }
  function pieceForImpact(entityId, generation, missionId) {
    const entity = state.entities?.get(entityId);
    const spec = entity && entity.data && entity.data.raceSetPiece;
    if (!spec || spec.missionId !== missionId || !PIECE_KINDS.has(spec.kind)) return null;
    if (generation != null && occupantGenerationOf(entity) !== generation) return null;
    return entity;
  }
  function setPieceNameFor(piece, mission) {
    // The authored cue record owns the name; match by body id, never by entity data alone.
    for (const cue of mission?.params?.raceSetPieces || []) {
      if (cue && Array.isArray(cue.entityIds) && cue.entityIds.includes(piece.id)) {
        if (typeof cue.name === 'string' && cue.name) return cue.name;
      }
    }
    const spec = piece?.data?.raceSetPiece;
    for (const cue of mission?.params?.raceSetPieces || []) {
      if (cue && cue.id === spec?.id && typeof cue.name === 'string' && cue.name) return cue.name;
    }
    return piece?.data?.name || spec?.id || 'set piece';
  }
  function onImpact(impact) {
    const h = heat;
    if (!h || !impact || typeof impact !== 'object') return;
    if (h.impactQueue.length >= 96) h.impactQueue.shift();
    // The wire payload is a reused scratch object — copy the fields the arbiter needs.
    h.impactQueue.push({
      aId: impact.aId, bId: impact.bId,
      aGeneration: impact.aGeneration ?? null, bGeneration: impact.bGeneration ?? null,
      causalActorId: impact.causalActorId ?? null,
      impulse: Number(impact.impulse) || 0,
      preSolveClosingSpeed: Number.isFinite(impact.preSolveClosingSpeed) ? impact.preSolveClosingSpeed : null,
      tick: Math.max(0, impact.tick | 0),
    });
  }
  function drainImpacts(mission, now) {
    const queue = heat.impactQueue;
    if (!queue.length) return;
    heat.impactQueue = [];
    // Pass 1: player-on-rival contact arms the bounded shove window first, so a same-tick
    // rival/set-piece contact attributes identically regardless of delivery order. The
    // physical budget is impulse/rival-mass — a scrape or a shared paint trade never arms.
    for (const impact of queue) {
      const aIsPlayer = impact.aId === state.playerId, bIsPlayer = impact.bId === state.playerId;
      if (!aIsPlayer && !bIsPlayer) continue;
      const row = rivalForImpact(aIsPlayer ? impact.bId : impact.aId,
        aIsPlayer ? impact.bGeneration : impact.aGeneration);
      if (!row || row.status !== 'racing') continue;
      const player = state.entities?.get(state.playerId);
      const playerGen = aIsPlayer ? impact.aGeneration : impact.bGeneration;
      if (!player || player.alive === false
        || (playerGen != null && occupantGenerationOf(player) !== playerGen)) continue;
      const entity = entityFor(row);
      const mass = Math.max(1, Number(entity && entity.mass) || 1);
      if (!(impact.impulse > 0) || impact.impulse / mass < SHOVE_IMPULSE_MIN_DELTA_V) continue;
      row.playerShove = { tick: impact.tick, atS: now, expiresAtSimS: now + SHOVE_WINDOW_S,
        rivalGeneration: occupantGenerationOf(entity) };
    }
    // Pass 2: rival-on-set-piece contact — real physical recovery every time; a receipt
    // only when the shove window and the impulse budget both hold. The ≥2-second cost is
    // the collision plus the flown rejoin — never a scripted hold or pace change.
    for (const impact of queue) {
      const aRival = rivalForImpact(impact.aId, impact.aGeneration);
      const bRival = aRival ? null : rivalForImpact(impact.bId, impact.bGeneration);
      const row = aRival || bRival;
      if (!row || row.status !== 'racing') continue;
      const piece = pieceForImpact(aRival ? impact.bId : impact.aId,
        aRival ? impact.bGeneration : impact.aGeneration, mission.id);
      if (!piece) continue;
      const entity = entityFor(row);
      const mass = Math.max(1, Number(entity && entity.mass) || 1);
      if (!(impact.impulse > 0) || impact.impulse / mass < PIECE_IMPULSE_MIN_DELTA_V) continue;
      const runKey = `${row.entityId}:${piece.id}`;
      if (!row.driver.contactRecovery) {
        row.recoverySeq = (row.recoverySeq | 0) + 1;
        row.recoveryKey = runKey;
        beginRacingContactRecovery(row.driver, {
          gateIndex: row.params.nextGate | 0, now, tick: impact.tick, cause: 'contact' });
        if (row.driver.anchor) finishRope(row, 'recovery');
      }
      const shove = row.playerShove;
      const shoved = !!(shove && now <= shove.expiresAtSimS
        && (shove.rivalGeneration == null || occupantGenerationOf(entity) === shove.rivalGeneration));
      if (!shoved) continue;
      // One receipt per {rival, set piece, recovery run}. The run id is the recovery
      // instance itself, so duplicate deliveries and repeated contacts cannot re-award.
      if (row.takedownRun === row.recoverySeq) continue;
      row.takedownRun = row.recoverySeq;
      row.playerShove = null; // consumed: one attribution per armed shove
      row.takedownToken = `${runKey}:${impact.tick}`;
      const spec = piece.data.raceSetPiece;
      const setPieceName = setPieceNameFor(piece, mission);
      const receipt = { missionId: mission.id, rivalId: row.id, rivalName: row.name, name: row.name,
        setPieceId: spec.id, setPieceName, shutter: setPieceName, cause: spec.kind,
        shoveTick: shove.tick, impactTick: impact.tick, at: now };
      if (takedownReceipts.length >= 24) takedownReceipts.shift();
      takedownReceipts.push(receipt);
      bus?.emit?.('race:takedown', receipt);
    }
  }
  function releaseReservation(row) {
    if (!heat) return;
    for (const [anchorId, rivalId] of heat.anchorReservations) {
      if (rivalId === row.id) heat.anchorReservations.delete(anchorId);
    }
  }
  function finishRope(row, reason) {
    const driver = row.driver, anchor = driver && driver.anchor;
    if (!anchor) return;
    const kernel = kernelFor();
    const attachment = kernel ? kernel.attachments.get(anchor.attachmentId) : null;
    if (attachment && attachment.state === 'active') {
      try { kernel.attachments.breakAttachment(attachment, reason, row.entityId); } catch {}
    }
    heat?.ownedAttachments.delete(anchor.attachmentId);
    const qualified = reason === 'complete' && (anchor.loadedTicks | 0) >= 12;
    row.driver.anchorUses.push({ anchorId: anchor.anchorId, lap: anchor.lapAtAttach | 0,
      qualified, attachedTick: anchor.attachedTick | 0, releasedTick: state.tick | 0,
      releasedAtS: Number(state.simTime) || 0, releaseReason: reason });
    if (qualified) bus?.emit?.('race:rivalAnchorUsed', { missionId: heat.missionId, rivalId: row.id,
      lap: anchor.lapAtAttach | 0, anchorId: anchor.anchorId, attachmentId: anchor.attachmentId });
    if (reason === 'timeout') {
      // A held-out anchor that never paid its gate is burned for this lap — without this the
      // rival re-selects the same apex on the same approach and loops the full hold window.
      const burned = driver.burnedAnchors || (driver.burnedAnchors = new Set());
      burned.add(`${anchor.anchorId}:${anchor.lapAtAttach | 0}`);
    }
    driver.anchor = null;
    releaseReservation(row);
  }
  function stepAnchorPhysics(row, entity, mission, now) {
    const driver = row.driver;
    const kernel = kernelFor();
    if (driver.anchor) {
      const attachment = kernel ? kernel.attachments.get(driver.anchor.attachmentId) : null;
      const alive = !!(attachment && attachment.state === 'active');
      if (alive && Number(attachment.lastTension) > 0) driver.anchor.loadedTicks = (driver.anchor.loadedTicks | 0) + 1;
      const reason = racingAnchorReleaseReason(driver, { entity, params: row.params, gates: heat.gates,
        now, attachmentAlive: alive });
      if (reason) finishRope(row, reason);
      row.anchorCandidate = null;
      return;
    }
    row.anchorCandidate = null;
    if (!kernel || driver.contactRecovery || row.status !== 'racing') { releaseReservation(row); return; }
    candidateScratch.length = 0;
    const prefs = heat.anchorPrefs[row.id];
    if (!prefs || !prefs.length) return;
    for (const anchorId of prefs) {
      const anchor = heat.anchorById.get(anchorId);
      if (!anchor || !anchor.pos) continue;
      const reserved = heat.anchorReservations.get(anchorId);
      if (reserved != null && reserved !== row.id) continue;
      if (driver.burnedAnchors && driver.burnedAnchors.has(`${anchorId}:${row.params.lap | 0}`)) continue;
      candidateScratch.push(anchor);
    }
    const selection = selectRacingAnchor(driver, { entity, params: row.params, gates: heat.gates,
      candidates: candidateScratch, rivalId: row.id, reachWU: ANCHOR_REACH_WU });
    if (!selection) { releaseReservation(row); return; }
    row.anchorCandidate = selection;
    heat.anchorReservations.set(selection.anchorId, row.id);
    if (!selection.inReach) return;
    const result = kernel.attachments.create({ defId: 'tether_standard',
      ownerId: entity.id, targetId: selection.targetId });
    if (!result || result.ok !== true) {
      if (selection.plane > -8) { row.anchorCandidate = null; releaseReservation(row); }
      return;
    }
    const attachment = result.attachment;
    heat.ownedAttachments.add(attachment.id);
    driver.anchor = { anchorId: selection.anchorId, name: selection.name, targetId: selection.targetId,
      gateIndex: selection.gateIndex, pos: selection.pos, turnSign: selection.turnSign || 0,
      line: selection.line || null, lapAtAttach: row.params.lap | 0,
      attachedAtS: now, attachedTick: state.tick | 0, attachmentId: attachment.id, loadedTicks: 0 };
    row.anchorCandidate = null;
  }
  function refreshAnchorRows(mission) {
    if (!heat.anchorById.size) return;
    for (const anchor of heat.anchorById.values()) { anchor.targetId = null; anchor.pos = null; }
    for (const cue of mission.params?.raceSetPieces || []) {
      if (!cue || cue.kind !== 'anchor' || !cue.entityIds || !cue.entityIds.length) continue;
      const anchor = heat.anchorById.get(cue.id);
      if (!anchor) continue;
      const body = state.entities?.get(cue.entityIds[0]);
      if (!body || body.alive === false || !body.pos) { anchor.targetId = null; anchor.pos = null; continue; }
      anchor.targetId = body.id;
      anchor.pos = body.pos;
    }
  }
  function snapshot(mission, playerElapsedS = null) {
    if (!heat || heat.missionId !== mission.id) return [];
    const player = state.entities?.get(state.playerId);
    const rows = heat.rivals.map(row => ({ id: row.id, name: row.name, entityId: row.entityId,
      hullId: row.hullId, style: row.style, status: row.status, elapsedS: row.elapsedS,
      lostS: row.lostS || 0,
      lap: row.params.lap | 0, nextGate: row.params.nextGate | 0, recoveries: row.driver.recoveries,
      progress: row.status === 'finished' ? 1 : circuitProgress(row.params, entityFor(row)?.pos, heat.gates).fraction }));
    rows.push({ id: 'player', name: 'You', entityId: state.playerId, player: true,
      status: playerElapsedS == null ? 'racing' : 'finished', elapsedS: playerElapsedS,
      lap: mission.params.lap | 0, nextGate: mission.params.nextGate | 0,
      progress: playerElapsedS == null ? circuitProgress(mission.params, player?.pos, heat.gates).fraction : 1 });
    const ranked = rankRacingEntrants(rows);
    mission.params.raceStandings = ranked;
    mission.params.raceEntrants = ranked.length;
    mission.params.racePosition = ranked.find(row => row.player).position;
    return ranked;
  }
  function cutAllRopes(reason) {
    const kernel = kernelFor();
    if (heat && kernel) {
      for (const id of heat.ownedAttachments) {
        const attachment = kernel.attachments.get(id);
        if (attachment && attachment.state === 'active') {
          try { kernel.attachments.breakAttachment(attachment, reason); } catch {}
        }
      }
    }
    if (heat) heat.ownedAttachments.clear();
  }
  function stop(reason = 'race_closed') {
    if (!heat) return false;
    cutAllRopes(reason);
    for (const row of heat.rivals) {
      const entity = entityFor(row);
      if (entity?.data?.raceOpponent?.missionId === heat.missionId) helpers.removeEntity?.(entity.id, { immediate: true, reason });
    }
    heat.offImpact?.();
    heat = null;
    return true;
  }
  function start(mission) {
    const p = mission.params, gates = raceGateGlobals(p);
    if (gates.length < 2 || !helpers.spawnEntity) return false;
    stop('race_replaced');
    const defs = racingSetPieceDefinitions(p.courseId);
    heat = { missionId: mission.id, sectorId: p.courseSectorId, gates, rivals: [], draftEntrants: [],
      nextStandingS: -Infinity, lastTime: Number(state.simTime) || 0,
      anchorPrefs: (defs && defs.rivalAnchors) || {}, anchorById: new Map(),
      anchorReservations: new Map(), ownedAttachments: new Set(),
      rivalByEntityId: new Map(), impactQueue: [], offImpact: null };
    for (const row of defs?.anchors || []) {
      heat.anchorById.set(row.id, { anchorId: row.id, name: row.name, gateIndex: row.gateIndex,
        line: row.rivalLine || null, targetId: null, pos: null });
    }
    if (physicsPort() && typeof bus?.on === 'function') heat.offImpact = bus.on('physics:impact', onImpact);
    const count = Math.max(1, Math.min(3, Math.round(Number(p.raceOpponents) || 2)));
    const rosterOffset = p.courseId === 'circuit_tethys_tally' ? 1 : p.courseId === 'circuit_veil_wash' ? 2 : 0;
    for (let i = 0; i < count; i++) {
      const personality = RACING_PERSONALITIES[(i + rosterOffset) % RACING_PERSONALITIES.length], pose = racingOpponentGrid(p, i);
      const spec = makeShipEntitySpec(personality.hullId, { team: 2,
        pos: { x: pose.x, z: pose.z }, rot: pose.heading,
        fittings: fittingsFromDefaultModules(personality.hullId, ['mod_engine_ion_m']),
        ai: { passive: true, roe: 'hold_fire' } });
      spec.flags = { ...spec.flags, missionPinned: true };
      Object.assign(spec.data, { name: personality.name, scanLabel: `${personality.name} · ${personality.style}`,
        raceOpponent: { missionId: mission.id, id: personality.id }, missionTag: mission.id, tetherable: false });
      const entity = helpers.spawnEntity(spec);
      if (!entity) continue;
      const row = { id: personality.id, entityId: entity.id, hullId: personality.hullId,
        name: personality.name, style: personality.style, status: 'racing', elapsedS: null,
        driver: createRacingDriver(personality, p.raceDifficulty),
        params: { nextGate: 0, lap: 0, laps: p.laps, closedCircuit: p.closedCircuit, gateRadiusWU: p.gateRadiusWU },
        previous: { ...entity.pos }, previousTime: heat.lastTime,
        anchorCandidate: null, playerShove: null, recoverySeq: 0, recoveryKey: null,
        takedownRun: -1 };
      heat.rivals.push(row);
      heat.rivalByEntityId.set(entity.id, row);
    }
    return true;
  }
  function update(mission) {
    if (!eligible(mission)) { if (heat?.missionId === mission?.id) stop('ineligible'); return []; }
    if (!heat || heat.missionId !== mission.id) if (!start(mission)) return [];
    const p = mission.params, now = Number(state.simTime) || 0;
    const dt = Math.max(0, Math.min(0.1, now - heat.lastTime));
    heat.lastTime = now;
    const startS = Number.isFinite(p.raceStartSimS) ? p.raceStartSimS : p.gridUntilSimS;
    const held = !Number.isFinite(startS) || now < startS;
    const anchorLive = !!physicsPort();
    refreshAnchorRows(mission);
    drainImpacts(mission, now);
    let terminalChanged = false;
    for (const row of heat.rivals) {
      const entity = entityFor(row);
      if (!entity || entity.alive === false) {
        if (row.status === 'racing') { row.status = 'dnf'; terminalChanged = true; }
        if (row.driver.anchor) finishRope(row, 'rival_lost');
        else releaseReservation(row);
        if (row.driver.contactRecovery) { row.driver.contactRecovery = null; }
        row.anchorCandidate = null;
        continue;
      }
      if (row.status === 'racing' && !held) {
        row.params.raceStartSimS = startS;
        const events = advanceCircuit(row.params, { prev: row.previous, pos: entity.pos, vel: entity.vel,
          gates: heat.gates, previousTime: row.previousTime, now });
        const finish = events.find(event => event.finished);
        // The brake already sits inside finish.elapsedS. lostS is the receipt, not a second penalty.
        if (finish) { row.status = 'finished'; row.elapsedS = finish.elapsedS; terminalChanged = true;
          bus?.emit?.('race:rivalFinished', { missionId: mission.id, rivalId: row.id, name: row.name, elapsedS: row.elapsedS }); }
        else if (now - startS > Math.max(240, (Number(p.courseLengthWU) || 5000) * Math.max(1, p.laps || 1) / 24)) {
          row.status = 'dnf'; terminalChanged = true;
        }
      }
      row.previous.x = entity.pos.x; row.previous.z = entity.pos.z; row.previousTime = now;
      // A finished recovery run stamps once; the receipt run boundary follows it.
      if (!row.driver.contactRecovery && row.driver.lastContactRecovery
        && row.driver.lastContactRecovery.recoveredAtS == null) {
        row.driver.lastContactRecovery.recoveredAtS = now;
      }
      if (row.status !== 'racing') {
        if (row.driver.anchor) finishRope(row, 'not_racing');
        else releaseReservation(row);
        if (row.driver.contactRecovery) { row.driver.lastContactRecovery = row.driver.contactRecovery; row.driver.contactRecovery = null; }
        row.anchorCandidate = null;
      } else if (anchorLive && !held) {
        stepAnchorPhysics(row, entity, mission, now);
      } else {
        row.anchorCandidate = null;
      }
      if (row.status === 'racing' && !anchorLive) noteShutterTakedown(row, entity, now);
      const takedownHeld = Number.isFinite(row.resumeAt) && now < row.resumeAt;
      entity.data.intent = racingDriverIntent(row.driver, { entity, params: row.params, gates: heat.gates,
        nearby: queryNearbyEntities(state, entity.pos, 350, nearby), dt,
        held: held || row.status !== 'racing' || takedownHeld,
        anchorContext: anchorLive ? { candidate: row.anchorCandidate } : undefined });
    }
    // Reuse the bounded entrant records; both player and opponents obey the same wake rule.
    const count = heat.rivals.length + 1;
    for (let i = 0; i < count; i++) {
      const entry = heat.draftEntrants[i] ||= {};
      entry.entity = i ? entityFor(heat.rivals[i - 1]) : state.entities.get(state.playerId);
      entry.status = i ? heat.rivals[i - 1].status : 'racing';
    }
    heat.draftEntrants.length = count;
    stepRacingDraft(state, mission, heat.draftEntrants, dt);
    // HUD standings need 10 Hz; gates, steering and physics still run at 60 Hz.
    if (terminalChanged || now >= heat.nextStandingS) {
      heat.nextStandingS = now + 0.1;
      return snapshot(mission);
    }
    return p.raceStandings || [];
  }
  return {
    update,
    finish(mission, playerElapsedS) { return snapshot(mission, Math.max(0, Number(playerElapsedS) || 0)); },
    stop,
    reconcile(active = state.missions?.active || []) {
      if (!heat) return;
      const mission = active.find(row => row.id === heat.missionId);
      const player = state.entities?.get(state.playerId);
      if (!eligible(mission) || !player || player.alive === false || state.mode === 'menu'
        || state.world?.currentSectorId !== heat.sectorId) stop('race_left_course');
    },
    inspect() { return heat ? { missionId: heat.missionId, rivals: heat.rivals.map(row => ({
      id: row.id, entityId: row.entityId, status: row.status, elapsedS: row.elapsedS,
      lostS: row.lostS || 0, resumeAt: Number.isFinite(row.resumeAt) ? row.resumeAt : null,
      pace: row.driver.personality?.pace ?? null, difficulty: row.driver.difficulty,
      nextGate: row.params.nextGate, lap: row.params.lap, recoveries: row.driver.recoveries,
      anchor: row.driver.anchor ? { anchorId: row.driver.anchor.anchorId,
        attachmentId: row.driver.anchor.attachmentId, loadedTicks: row.driver.anchor.loadedTicks | 0,
        gateIndex: row.driver.anchor.gateIndex } : null,
      anchorUses: row.driver.anchorUses.slice(),
      contactRecovery: row.driver.contactRecovery ? {
        enteredAtS: row.driver.contactRecovery.enteredAtS,
        recoveredAtS: row.driver.contactRecovery.recoveredAtS,
        alignedTicks: row.driver.contactRecovery.alignedTicks | 0 } : null,
      lastContactRecovery: row.driver.lastContactRecovery ? {
        enteredAtS: row.driver.lastContactRecovery.enteredAtS,
        recoveredAtS: row.driver.lastContactRecovery.recoveredAtS } : null })) } : null; },
  };
}
