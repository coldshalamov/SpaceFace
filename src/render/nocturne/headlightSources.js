import { Vector3 } from 'three';
import { LOOK_HEADLIGHT } from '../../data/lookMoods.js';

const MAX_SHIPS = 24;
const DEFAULT_OPTIONS = Object.freeze({});
const DARK_POWER_STATES = new Set(['off', 'offline', 'failed', 'destroyed', 'unpowered']);
const VALID_SOCKET_NAMES = ['HOOK_HEADLIGHT', 'HOOK_HEADLIGHT_MAIN', 'SOCKET_HEADLIGHT'];
function powered(entity, playerId) {
  const d = entity?.data;
  return entity?.type === 'ship' && entity.alive !== false && entity.pos
    && (entity.id === playerId || entity.docked !== true)
    && !entity.flags?.docked && !entity.derelict && !d?.derelict
    && !d?.disabled && d?.powered !== false && !DARK_POWER_STATES.has(d?.powerState);
}

function socketVisibleUnderRoot(socket, root) {
  if (!socket || !root) return false;
  for (let node = socket; node; node = node.parent) {
    if (node === root) return node.visible !== false;
    if (node.visible === false && (node !== socket || node.isMesh)) return false;
  }
  return false;
}

function findVisibleSocket(root) {
  let found = null;
  if (root?.traverse) {
    root.traverse((node) => {
      if (!found && VALID_SOCKET_NAMES.includes(node.name) && socketVisibleUnderRoot(node, root)) found = node;
    });
  } else if (root?.getObjectByName) {
    for (const name of VALID_SOCKET_NAMES) {
      const candidate = root.getObjectByName(name);
      if (socketVisibleUnderRoot(candidate, root)) { found = candidate; break; }
    }
  }
  return found;
}

/** Headlights declare sources; NOCTURNE owns their GPU residency. */
export class NocturneHeadlightSources {
  constructor(registry, { capacity = MAX_SHIPS, look = LOOK_HEADLIGHT } = {}) {
    capacity = Math.max(1, Math.min(64, Math.floor(Number.isFinite(capacity) ? capacity : MAX_SHIPS)));
    this.registry = registry;
    this.look = look;
    this.rows = Array.from({ length: capacity }, (_, i) => ({
      entity: null, root: null, socket: null, distance: Infinity,
      source: registry.register(`headlight:${i}`, { type: 'spot', intensity: look.intensity,
        color: look.colorHex, range: look.range, decay: look.decay,
        angle: look.angle, penumbra: look.penumbra, enabled: false, priority: 2,
        shadow: true }),
    }));
    this._clock = Infinity;
    this._playerId = null;
    this._local = { x: 0, z: 0 };
    this._forward = new Vector3();
    this._position = new Vector3();
    this._chosen = new Array(capacity).fill(null);
    this._distances = new Float64Array(capacity);
  }

  update(state, dt, membrane, { meshes, playerLamp = true } = DEFAULT_OPTIONS) {
    if (!state?.entities || !membrane?.toLocal) return;
    if (this._playerId !== state.playerId) { this._playerId = state.playerId; this._clock = Infinity; }
    this._clock += Math.max(0, Number.isFinite(dt) ? dt : 0);
    const player = state.entities.get(state.playerId);
    if (this._clock >= 0.25) {
      this._clock = 0;
      this._chosen.fill(null); this._distances.fill(Infinity);
      if (powered(player, state.playerId)) { this._chosen[0] = player; this._distances[0] = -1; }
      const list = state.entityList || state.entities.values();
      for (const e of list) {
        if (this.rows.length < 2) break;
        if (!player?.pos || !powered(e, state.playerId) || e === player
          || state.entities.get(e.id) !== e) continue;
        const d = (e.pos.x - player.pos.x) ** 2 + (e.pos.z - player.pos.z) ** 2;
        if (!Number.isFinite(d) || d > this.look.npcReach ** 2) continue;
        let worst = 1;
        for (let i = 2; i < this.rows.length; i++) if (this._distances[i] > this._distances[worst]) worst = i;
        if (d < this._distances[worst]) { this._chosen[worst] = e; this._distances[worst] = d; }
      }
      // Stable source identity per retained owner, even when distances reorder.
      for (const row of this.rows) {
        if (row.entity && !this._chosen.includes(row.entity)) { row.entity = null; row.root = null; row.socket = null; }
      }
      for (const e of this._chosen) {
        if (!e || this.rows.some(row => row.entity === e)) continue;
        const row = this.rows.find(row => !row.entity);
        if (row) row.entity = e;
      }
    }
    const look = this.look;
    for (const row of this.rows) {
      const e = row.entity, source = row.source;
      if (!source) continue;
      const isPlayer = e?.id === state.playerId;
      source.enabled = !!(e && powered(e, state.playerId) && state.entities.get(e.id) === e
        && (!isPlayer || playerLamp));
      if (!source.enabled) continue;
      const root = meshes?.get(e.id) || e.view?.root || null;
      if (root !== row.root || (row.socket && !socketVisibleUnderRoot(row.socket, root))) {
        row.root = root; row.socket = null;
        row.socket = findVisibleSocket(root);
      }
      source.critical = isPlayer;
      source.priority = isPlayer ? 4 : 2;
      source.intensity = look.intensity * (isPlayer ? 1 : look.npcIntensity);
      source.power = Number.isFinite(e.data?.powerLevel) ? Math.max(0, Math.min(1, e.data.powerLevel)) : 1;
      const hullFraction = Number.isFinite(e.hull) && e.hullMax > 0 ? e.hull / e.hullMax : 1;
      source.damage = Math.max(0, Math.min(0.8, (1 - hullFraction) * 0.65));
      if (root && (root.visible === false || !root.parent)) { source.enabled = false; continue; }
      let fx, fz;
      if (root?.parent) {
        this._local.x = root.position.x; this._local.z = root.position.z;
        this._forward.set(1, 0, 0).applyQuaternion(root.quaternion);
        const n = Math.hypot(this._forward.x, this._forward.z) || 1;
        fx = this._forward.x / n; fz = this._forward.z / n;
      } else {
        membrane.toLocal(e.pos, this._local);
        fx = Math.cos(e.rot || 0); fz = Math.sin(e.rot || 0);
      }
      if (row.socket) {
        row.socket.updateWorldMatrix(true, false);
        source.position.setFromMatrixPosition(row.socket.matrixWorld);
        this._forward.set(1, 0, 0).transformDirection(row.socket.matrixWorld);
        source.target.copy(this._forward).multiplyScalar(look.aimDistance).add(source.position);
      } else {
        const nose = (e.radius > 0 ? e.radius : 8) * look.noseFactor;
        source.position.set(this._local.x + fx * nose, look.height, this._local.z + fz * nose);
        source.target.set(source.position.x + fx * look.aimDistance, look.aimHeight,
          source.position.z + fz * look.aimDistance);
      }
    }
  }

  clear() {
    for (const row of this.rows) { row.entity = null; row.root = null; row.socket = null; if (row.source) row.source.enabled = false; }
    this._chosen.fill(null);
    this._distances.fill(Infinity);
    this._playerId = null;
    this._clock = Infinity;
  }
  dispose() {
    this.clear();
    for (const row of this.rows) if (row.source && this.registry.get(row.source.id) === row.source) this.registry.unregister(row.source.id);
    this.rows.length = 0;
    this._chosen.length = 0;
    this.registry = null;
  }
}
