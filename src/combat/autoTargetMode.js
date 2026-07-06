// Pure auto-target combat mode helpers — single owner of aim/refresh/reticle semantics.
import { wrapAngle } from '../core/rng.js';
import { solveLeadAngle } from '../systems/weapons.js';

export const AUTO_TARGET_REFRESH_S = 0.12;
const HELM_SOFT_ANGLE = 0.55;
const HELM_DEADBAND = 0.012;
const RETICLE_EDGE_MARGIN = 28;

export function createAutoTargetRuntime() {
  return { refreshT: 0 };
}

export function toggleAutoTarget(state, bus, runtime = createAutoTargetRuntime()) {
  const inp = state && state.input;
  if (!inp) return false;
  inp.autoFire = !inp.autoFire;
  if (inp.autoFire) {
    runtime.refreshT = AUTO_TARGET_REFRESH_S;
    if (bus) bus.emit('ui:targetNearestHostileToPlayer');
  } else {
    runtime.refreshT = 0;
  }
  if (bus) {
    bus.emit('toast', {
      text: 'Auto-target ' + (inp.autoFire ? 'ON' : 'OFF'),
      kind: 'info',
      ttl: 2,
    });
  }
  return inp.autoFire;
}

export function lockedHostileEntity(state) {
  const id = state && state.player && state.player.targetId;
  if (id == null || !state.entities || !state.entities.get) return null;
  const e = state.entities.get(id);
  if (!e || e.alive === false || !e.pos) return null;
  if (e.type !== 'ship' && e.type !== 'drone') return null;
  return e;
}

function playerLeadSpeed(state) {
  const player = state && state.entities && state.entities.get ? state.entities.get(state.playerId) : null;
  if (!player) return 360;
  const ws = player.data && player.data.weapons;
  if (ws && ws.length) {
    for (const w of ws) {
      const sp = w.projSpeed != null ? w.projSpeed : 0;
      if (sp > 0) return sp;
    }
  }
  return 360;
}

export function computeLockedLeadPoint(state) {
  const lockEnt = lockedHostileEntity(state);
  if (!lockEnt) return null;
  const player = state && state.entities && state.entities.get ? state.entities.get(state.playerId) : null;
  if (!player || !player.pos || !lockEnt.pos) return lockEnt.pos || null;
  const speed = playerLeadSpeed(state);
  // Ensure vel fields exist for the pure solver (some test fixtures / edge entities may omit).
  const sForLead = { pos: player.pos, vel: player.vel || { x: 0, z: 0 } };
  const tForLead = { pos: lockEnt.pos, vel: lockEnt.vel || { x: 0, z: 0 } };
  const ang = solveLeadAngle(sForLead, tForLead, speed);
  const dist = Math.hypot(lockEnt.pos.x - player.pos.x, lockEnt.pos.z - player.pos.z) || 180;
  return {
    x: player.pos.x + Math.cos(ang) * dist,
    z: player.pos.z + Math.sin(ang) * dist,
  };
}

export function tickAutoTarget(state, dt, bus, runtime = createAutoTargetRuntime()) {
  const inp = state && state.input;
  if (!inp || !inp.autoFire) {
    runtime.refreshT = 0;
    return;
  }
  const player = state.entities && state.entities.get(state.playerId);
  if (!player || !player.pos) return;

  const cursorWx = inp.aimWorld.x;
  const cursorWz = inp.aimWorld.z;
  const cursorAngle = Math.atan2(cursorWz - player.pos.z, cursorWx - player.pos.x);

  const lockEnt = lockedHostileEntity(state);
  if (lockEnt) {
    const leadPt = computeLockedLeadPoint(state) || lockEnt.pos;
    inp.aimAngle = Math.atan2(leadPt.z - player.pos.z, leadPt.x - player.pos.x);
    inp.aimWorld.x = leadPt.x;
    inp.aimWorld.z = leadPt.z;
  }

  const pointer = inp.pointerScreen;
  if (pointer && pointer.active) {
    const err = wrapAngle(cursorAngle - player.rot);
    inp.turnIntent = Math.abs(err) < HELM_DEADBAND
      ? 0
      : Math.max(-1, Math.min(1, err / HELM_SOFT_ANGLE));
  }

  runtime.refreshT = Math.max(0, (runtime.refreshT || 0) - dt);
  if (runtime.refreshT <= 0) {
    runtime.refreshT = AUTO_TARGET_REFRESH_S;
    if (bus) bus.emit('ui:targetNearestHostileToPlayer', { quiet: true });
  }
}

export function projectLockedReticle(state, w2s, viewport = {}) {
  if (!state || !state.input || !state.input.autoFire) return null;
  const leadPt = computeLockedLeadPoint(state);
  const lockEnt = lockedHostileEntity(state);
  const use = leadPt || (lockEnt && lockEnt.pos) || null;
  if (!use || !w2s) return null;

  const width = Number.isFinite(viewport.width) ? viewport.width : 0;
  const height = Number.isFinite(viewport.height) ? viewport.height : 0;
  const cx = width * 0.5;
  const cy = height * 0.5;

  const proj = w2s({ x: use.x, y: 0, z: use.z });
  if (!proj || !Number.isFinite(proj.x) || !Number.isFinite(proj.y)) return null;
  if (proj.onScreen) return { x: proj.x, y: proj.y };

  const margin = RETICLE_EDGE_MARGIN;
  const dx = proj.x - cx;
  const dy = proj.y - cy;
  if (Math.abs(dx) < 1e-6 && Math.abs(dy) < 1e-6) return { x: cx, y: cy };

  const ts = [];
  if (Math.abs(dx) > 1e-6) {
    if (dx > 0) ts.push((width - margin - cx) / dx);
    else ts.push((margin - cx) / dx);
  }
  if (Math.abs(dy) > 1e-6) {
    if (dy > 0) ts.push((height - margin - cy) / dy);
    else ts.push((margin - cy) / dy);
  }
  const positives = ts.filter((v) => v > 0 && Number.isFinite(v));
  if (positives.length) {
    const t = Math.min(...positives);
    return { x: cx + dx * t, y: cy + dy * t };
  }
  const len = Math.hypot(dx, dy) || 1;
  return { x: cx + (dx / len) * (width * 0.5 - margin), y: cy + (dy / len) * (height * 0.5 - margin) };
}