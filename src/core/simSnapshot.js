// Canonical headless snapshot helpers for replay/audit tooling.
//
// This is intentionally small: it snapshots the authoritative state surface that current Phase 0
// headless runs can prove, without pretending to be the full SG-01 rollback/snapshot contract.

const OMIT_KEYS = new Set([
  'entities',
  'entityList',
  'entityIndex',
  'spatialHash',
  'render',
  'vfx',
  'audioRuntime',
  'perfRuntime',
  'rng',
  'save',
]);

export function snapshotSimState(state) {
  const snapshot = {
    schema: 'spaceface.simSnapshot.v1',
    meta: snapshotMeta(state.meta),
    tick: state.tick | 0,
    simTime: round6(state.simTime || 0),
    mode: state.mode,
    playerId: state.playerId | 0,
    player: sanitize(state.player),
    input: sanitize(state.input),
    economy: sanitize(state.economy),
    missions: sanitize(state.missions),
    scenario: sanitize(state.scenario),
    story: sanitize(state.story),
    combat: {
      beams: Array.isArray(state.combat && state.combat.beams) ? state.combat.beams.length : 0,
    },
    entities: Array.from(state.entityList || [])
      .map(snapshotEntity)
      .sort((a, b) => a.id - b.id),
  };
  const physics = snapshotPhysicsRuntime(state);
  if (physics) snapshot.physics = physics;
  return snapshot;
}

export function canonicalStringify(value) {
  return JSON.stringify(sanitize(value));
}

function snapshotEntity(e) {
  return {
    id: e.id | 0,
    type: e.type,
    team: e.team | 0,
    factionId: e.factionId || null,
    alive: !!e.alive,
    pos: vec2(e.pos),
    vel: vec2(e.vel),
    rot: round6(e.rot || 0),
    radius: round6(e.radius || 0),
    hull: round6(e.hull || 0),
    armorHp: round6(e.armorHp || 0),
    shield: round6(e.shield || 0),
    cap: round6(e.cap || 0),
    ttl: Number.isFinite(e.ttl) ? round6(e.ttl) : 'Infinity',
    ownerId: e.ownerId == null ? null : e.ownerId,
    data: sanitize(e.data),
  };
}

function snapshotMeta(meta) {
  return {
    version: meta && typeof meta.version === 'number' ? meta.version : null,
    seed: meta && typeof meta.seed === 'number' ? meta.seed >>> 0 : 0,
  };
}

function snapshotPhysicsRuntime(state) {
  const gameplay = state && state.settings && state.settings.gameplay;
  if (!gameplay || gameplay.physicsBackend !== 'rapier-dynamic') return null;
  const runtime = state.physicsRuntime || {};
  const diag = runtime.diagnostics || {};
  return {
    schema: 'spaceface.physicsSnapshot.v1',
    backend: 'rapier-dynamic',
    ready: diag.sg02Ready === true,
    bodies: Array.isArray(runtime.sg02Snapshot)
      ? runtime.sg02Snapshot.map(snapshotSg02Body).sort((a, b) => a.id - b.id)
      : [],
  };
}

function snapshotSg02Body(body) {
  return {
    id: body.id | 0,
    x: round6(body.x),
    z: round6(body.z),
    yaw: round6(body.yaw),
    vx: round6(body.vx),
    vz: round6(body.vz),
    wy: round6(body.wy),
    revision: Math.max(0, Math.trunc(body.revision || 0)),
  };
}

function sanitize(value, depth = 0) {
  if (value == null) return value;
  if (depth > 8) return '[depth]';
  const t = typeof value;
  if (t === 'number') return round6(value);
  if (t === 'string' || t === 'boolean') return value;
  if (t === 'function' || t === 'symbol' || t === 'undefined') return undefined;
  if (Array.isArray(value)) return value.map((v) => sanitize(v, depth + 1)).filter((v) => v !== undefined);
  if (value instanceof Map) {
    return Array.from(value.entries())
      .map(([k, v]) => [String(k), sanitize(v, depth + 1)])
      .sort((a, b) => a[0].localeCompare(b[0]));
  }
  if (value instanceof Set) return Array.from(value.values()).map((v) => sanitize(v, depth + 1)).sort();
  if (t === 'object') {
    if (value.isVector3 || (typeof value.x === 'number' && typeof value.z === 'number' && Object.keys(value).length <= 4)) {
      return vec2(value);
    }
    const out = {};
    for (const key of Object.keys(value).sort()) {
      if (OMIT_KEYS.has(key) || key.startsWith('_')) continue;
      const v = sanitize(value[key], depth + 1);
      if (v !== undefined) out[key] = v;
    }
    return out;
  }
  return undefined;
}

function vec2(v) {
  return { x: round6(v && v.x), z: round6(v && v.z) };
}

function round6(value) {
  return Number.isFinite(value) ? Math.round(value * 1e6) / 1e6 : 0;
}
