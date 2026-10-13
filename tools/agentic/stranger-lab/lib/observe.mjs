// Observable game state for personas. No success flags, no hidden writers, no DOM.

import { round6 } from './quant.js';

export function observeState(state, ctx = {}) {
  const player = state.entities && state.playerId != null
    ? state.entities.get(state.playerId)
    : null;
  const pos = player && player.pos ? player.pos : { x: 0, z: 0 };
  const vel = player && player.vel ? player.vel : { x: 0, z: 0 };
  const speed = Math.hypot(vel.x || 0, vel.z || 0);
  const nearest = nearestContact(state, player);
  const tether = state.player && state.player.tether ? state.player.tether : null;
  const ui = state.ui || {};
  const run = state.run && typeof state.run === 'object' ? state.run : null;
  const active = state.missions && Array.isArray(state.missions.active)
    ? state.missions.active[0]
    : null;
  const offer = firstOffer(state);
  const dock = state.dockingCorridor || null;
  const jump = state.jump || null;
  return {
    tick: ctx.tick | 0,
    simTime: round6(state.simTime || 0),
    mode: state.mode || null,
    sectorId: state.world && state.world.currentSectorId || null,
    alive: !!(player && player.alive !== false),
    hull: player && Number.isFinite(player.hull) ? round6(player.hull) : null,
    shield: player && Number.isFinite(player.shield) ? round6(player.shield) : null,
    x: round6(pos.x || 0),
    z: round6(pos.z || 0),
    vx: round6(vel.x || 0),
    vz: round6(vel.z || 0),
    speed: round6(speed),
    rot: player && Number.isFinite(player.rot) ? round6(player.rot) : 0,
    angVel: player && Number.isFinite(player.angVel) ? round6(player.angVel) : 0,
    credits: state.player && Number.isFinite(state.player.credits) ? round6(state.player.credits) : null,
    cargoUsed: state.player && state.player.cargo ? round6(state.player.cargo.usedVolume || 0) : null,
    docked: ui.docked === true,
    dockPhase: dock && dock.phase ? dock.phase : null,
    dockDist: dock && Number.isFinite(dock.distCenter) ? round6(dock.distCenter) : null,
    dockDistToBerth: dock && Number.isFinite(dock.distToBerth) ? round6(dock.distToBerth) : null,
    dockBerth: dock?.berth ? { x: round6(dock.berth.x), z: round6(dock.berth.z) } : null,
    berthed: dock?.berthed === true,
    tetherActive: !!(tether && tether.active),
    tetherStrain: tether && Number.isFinite(tether.strain) ? round6(tether.strain) : 0,
    restLength: tether && Number.isFinite(tether.restLength) ? round6(tether.restLength) : null,
    nearest,
    jumpState: jump && jump.state ? jump.state : null,
    runPhase: run && run.phase ? run.phase : null,
    runWave: run && Number.isInteger(run.wave) ? run.wave : null,
    missionOfferId: offer && offer.id ? offer.id : null,
    missionActiveId: active && active.id ? active.id : null,
    missionStatus: active && active.status ? active.status : null,
    missionProgress: active && Number.isFinite(active.objectiveProgress) ? active.objectiveProgress : null,
    missionTarget: active && Number.isFinite(active.objectiveTarget) ? active.objectiveTarget : null,
    cue: ctx.cue || null,
    journeyId: ctx.journeyId || null,
  };
}

function nearestContact(state, player) {
  if (!player || !state.entities || !state.entities.values) return null;
  let best = null;
  let bestD = Infinity;
  for (const entity of state.entities.values()) {
    if (!entity || entity.id === player.id || entity.alive === false || !entity.pos) continue;
    const dx = entity.pos.x - player.pos.x;
    const dz = entity.pos.z - player.pos.z;
    const dist = Math.hypot(dx, dz);
    if (dist < bestD) {
      bestD = dist;
      const collisionRadius = entity.data && Number.isFinite(entity.data.collisionRadius)
        ? entity.data.collisionRadius
        : entity.radius;
      best = {
        id: entity.id,
        kind: entity.type || 'unknown',
        dist: round6(dist),
        x: round6(entity.pos.x),
        z: round6(entity.pos.z),
        radius: Number.isFinite(collisionRadius) ? round6(collisionRadius) : null,
        mass: Number.isFinite(entity.mass) ? round6(entity.mass) : null,
      };
    }
  }
  return best;
}

function firstOffer(state) {
  const boards = state.missions && state.missions.boards;
  if (!boards) return null;
  for (const board of Object.values(boards)) {
    const slots = board && board.slots;
    if (!Array.isArray(slots)) continue;
    for (const offer of slots) {
      if (offer && offer.id) return offer;
    }
  }
  return null;
}

export function simDigest(samples) {
  const rows = [];
  for (const sample of samples) {
    rows.push([
      sample.tick,
      sample.simTime,
      sample.mode,
      sample.sectorId,
      sample.alive,
      sample.hull,
      sample.x,
      sample.z,
      sample.speed,
      sample.credits,
      sample.docked,
      sample.tetherActive,
      sample.missionStatus,
      sample.runPhase,
      sample.runWave,
    ]);
  }
  return rows;
}
