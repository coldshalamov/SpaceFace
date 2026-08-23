// Cryo Drift — arena law. The room FREEZES CONTROL, not velocity.
//
// Four thermal quadrants around an insulated island. Cold applies Cryo Lock (momentum copied,
// helm scaled to 0.35). Heat applies Burning. When both meet, Thermal Shock consumes the freeze,
// reduces the burn, and adds a bounded impulse — it never zeroes the body first.
//
// This is not Helios ricochet, not Lagrange pull, and not Cinder current. The two kernel slots
// are occupancy markers for the coolant tank and heat manifold (strength 0), so the freeze cannot
// be a damping well. Boss role is data; no hull.

import {
  CRYO_LOCK_STATUS_ID,
  applyCryoLock,
} from '../combat/cryoLock.js';
import {
  BURNING_STATUS_ID,
  resolveThermalShock,
  thermalShockEligible,
} from '../combat/thermalShock.js';
import { createLineage, DEFAULT_CONSTRAINTS } from '../combat/attackLineage.js';

export const CRYO_ARENA_ID = 'cryo_drift';

/** Wave-10 boss is a role over the existing dreadnought hull, not a new model. */
export const CRYO_BOSS_ROLE = Object.freeze({
  id: 'manifold_warden',
  hullId: 'dreadnought_boss',
  role: 'elite',
  law: CRYO_ARENA_ID,
  arms: 4,
});

export const CRYO_FIELD_RADIUS = 420;
export const CRYO_ISLAND_RADIUS = 48;
export const CRYO_ISLAND_BOSS_RADIUS = 96;
export const CRYO_PROP_RADIUS = 70;
export const CRYO_PROP_RANGE = 300;

function along(at, bearing, distance) {
  return { x: at.x + bearing.x * distance, z: at.z + bearing.z * distance };
}

function finite(value, fallback = 0) {
  return Number.isFinite(value) ? value : fallback;
}

function statusList(value) {
  if (Array.isArray(value)) return value.slice();
  if (value && typeof value === 'object') {
    return Object.keys(value).filter((key) => value[key]);
  }
  return [];
}

function occupancyField(kind, center, extra = {}) {
  return {
    kind,
    center,
    radius: CRYO_PROP_RADIUS,
    strength: 0,
    falloff: 1.2,
    ...extra,
  };
}

/**
 * PURE quadrant map. West is the cold half at rest; heat occupies the east.
 * Phases retune which quadrants are cold/hot. The island is always insulated.
 */
export function cryoThermalMap(phase, spin = 0) {
  const map = { nw: 'cold', ne: 'hot', sw: 'cold', se: 'hot' };
  switch (phase) {
    case 'furnace_active':
      map.nw = 'cold';
      map.ne = 'hot';
      map.sw = 'hot';
      map.se = 'hot';
      break;
    case 'shutter_alternating':
      map.nw = 'cold';
      map.ne = 'cold';
      map.sw = 'hot';
      map.se = 'hot';
      break;
    case 'boss': {
      const hotEast = Math.cos(spin) >= 0;
      map.nw = 'cold';
      map.sw = 'cold';
      map.ne = hotEast ? 'hot' : 'cold';
      map.se = hotEast ? 'hot' : 'cold';
      break;
    }
    default:
      break;
  }
  return map;
}

export function cryoQuadrantKey(at, pos) {
  const dx = finite(pos && pos.x) - finite(at && at.x);
  const dz = finite(pos && pos.z) - finite(at && at.z);
  if (dx >= 0 && dz >= 0) return 'ne';
  if (dx < 0 && dz >= 0) return 'nw';
  if (dx < 0 && dz < 0) return 'sw';
  return 'se';
}

function nearProp(pos, spots, radius) {
  const r2 = radius * radius;
  for (let i = 0; i < spots.length; i++) {
    const spot = spots[i];
    const dx = finite(pos.x) - finite(spot.x);
    const dz = finite(pos.z) - finite(spot.z);
    if (dx * dx + dz * dz <= r2) return true;
  }
  return false;
}

/**
 * Zone at a point: 'cold' | 'hot' | 'insulated' | 'outside'.
 * Props overlay the quadrant: a coolant tank is a portable cold pocket.
 */
export function cryoZoneAt(room, pos) {
  const at = room && room.at ? room.at : { x: 0, z: 0 };
  const dx = finite(pos && pos.x) - at.x;
  const dz = finite(pos && pos.z) - at.z;
  const fieldR = finite(room && room.fieldRadius, CRYO_FIELD_RADIUS);
  if (dx * dx + dz * dz > fieldR * fieldR) return 'outside';
  const islandR = finite(room && room.islandRadius, CRYO_ISLAND_RADIUS);
  if (dx * dx + dz * dz <= islandR * islandR) return 'insulated';
  const props = room && room.props ? room.props : { coolant: [], heat: [] };
  const onCoolant = nearProp(pos, props.coolant || [], CRYO_PROP_RADIUS);
  const onHeat = nearProp(pos, props.heat || [], CRYO_PROP_RADIUS);
  if (onCoolant && onHeat) return 'shock';
  if (onCoolant) return 'cold';
  if (onHeat) return 'hot';
  const map = room && room.thermal ? room.thermal : cryoThermalMap('idle');
  return map[cryoQuadrantKey(at, pos)] || 'outside';
}

export function createCryoRoomLineage(tick = 0) {
  const spec = {
    digest: 'cryo_drift_room',
    constraints: {
      lineageProcBudget: DEFAULT_CONSTRAINTS.lineageProcBudget,
      generationMax: DEFAULT_CONSTRAINTS.generationMax,
      childMax: DEFAULT_CONSTRAINTS.childMax,
      sameTargetCooldownTicks: DEFAULT_CONSTRAINTS.sameTargetCooldownTicks,
      activeFamilyCap: DEFAULT_CONSTRAINTS.activeFamilyCap,
      descendantsPerTickMax: DEFAULT_CONSTRAINTS.descendantsPerTickMax,
    },
    trajectory: {},
    propagation: {},
  };
  return createLineage({ spec, createdTick: Number.isInteger(tick) ? tick : 0, sourceEntityId: CRYO_ARENA_ID });
}

/**
 * PURE thermal step for one body. Cryo Lock copies velocity. Thermal Shock adds impulse.
 * Never writes the caller's object.
 */
export function applyCryoDrift(body, room, options = {}) {
  const vx = finite(body && body.vx);
  const vz = finite(body && body.vz);
  const statuses = statusList(body && body.statuses);
  const zone = cryoZoneAt(room, body && body.pos);
  if (zone === 'outside' || zone === 'insulated') {
    return {
      ok: true,
      zone,
      vx,
      vz,
      controlScale: 1,
      statuses,
      shock: null,
    };
  }

  let next = statuses.slice();
  const wantsCold = zone === 'cold' || zone === 'shock';
  const wantsHot = zone === 'hot' || zone === 'shock';
  if (wantsCold && !next.includes(CRYO_LOCK_STATUS_ID)) next.push(CRYO_LOCK_STATUS_ID);
  if (wantsHot && !next.includes(BURNING_STATUS_ID)) next.push(BURNING_STATUS_ID);

  let controlScale = 1;
  let outVx = vx;
  let outVz = vz;
  if (wantsCold) {
    const locked = applyCryoLock({ vx, vz }, 1);
    outVx = locked.vx;
    outVz = locked.vz;
    controlScale = locked.controlScale;
  }

  let shock = null;
  if (thermalShockEligible(next)) {
    shock = resolveThermalShock(
      { id: body && body.id, pos: body && body.pos, vx: outVx, vz: outVz, statuses: next },
      { lineage: options.lineage || null, sourcePos: room && room.at ? room.at : { x: 0, z: 0 } },
    );
    if (shock && shock.ok) {
      outVx = shock.vx;
      outVz = shock.vz;
      next = shock.statuses.slice();
      controlScale = shock.controlScale;
    }
  }

  return {
    ok: true,
    zone: zone === 'shock' ? 'cold' : zone,
    vx: outVx,
    vz: outVz,
    controlScale,
    statuses: next,
    shock,
  };
}

/**
 * PURE room for one Cryo wave. Always the thermal law; phase retunes which halves are cold.
 * Field slots are occupancy only (strength 0) so the freeze cannot drink momentum.
 */
export function planCryoInstall({
  arenaPhase,
  at = { x: 0, z: 0 },
  lane = { x: 1, z: 0 },
  across = { x: 0, z: 1 },
  spin = 0,
} = {}) {
  const phase = typeof arenaPhase === 'string' ? arenaPhase : 'idle';
  const thermal = cryoThermalMap(phase, spin);
  const islandRadius = phase === 'absorbent_screen' || phase === 'boss'
    ? CRYO_ISLAND_BOSS_RADIUS
    : CRYO_ISLAND_RADIUS;
  const coolant = [along(at, { x: -lane.x, z: -lane.z }, CRYO_PROP_RANGE)];
  const heat = [along(at, lane, CRYO_PROP_RANGE)];
  const out = {
    phase,
    note: '',
    fields: [],
    mines: [],
    cover: false,
    at: { x: at.x, z: at.z },
    thermal,
    islandRadius,
    fieldRadius: CRYO_FIELD_RADIUS,
    props: { coolant, heat },
  };

  switch (phase) {
    case 'idle':
    case 'shutter_slow':
      out.note = 'west is cold, east is hot; momentum keeps, the helm does not';
      break;
    case 'furnace_active':
      out.note = 'three quadrants vent heat; one cold pocket remains';
      break;
    case 'loose_plate':
      out.note = 'coolant tanks adrift; a tank is a portable cold pocket';
      out.cover = true;
      break;
    case 'shutter_alternating':
      out.note = 'the halves have rotated; north is cold, south is hot';
      break;
    case 'shutter_lane_close': {
      out.note = 'the transition lanes are mined; crossing still costs';
      const mouth = along(at, lane, 260);
      for (let i = 0; i < 4; i++) {
        const offset = (i - 1.5) * 62;
        out.mines.push({
          x: mouth.x + across.x * offset,
          z: mouth.z + across.z * offset,
        });
      }
      break;
    }
    case 'absorbent_screen':
      out.note = 'the insulated island grew; the halves still freeze and vent';
      break;
    case 'boss': {
      out.note = 'manifold warden: two quadrants locked cold, hot exhaust rotates';
      out.cover = true;
      heat[0] = along(at, { x: Math.cos(spin), z: Math.sin(spin) }, CRYO_PROP_RANGE);
      for (let i = 0; i < 4; i++) {
        const angle = spin + (i / 4) * Math.PI * 2;
        out.mines.push({
          x: at.x + Math.cos(angle) * 205,
          z: at.z + Math.sin(angle) * 205,
        });
      }
      break;
    }
    default:
      out.note = 'inert room';
      out.fields = [];
      out.thermal = { nw: 'insulated', ne: 'insulated', sw: 'insulated', se: 'insulated' };
      return out;
  }

  out.fields.push(
    occupancyField('well', coolant[0]),
    occupancyField('repulsor', heat[0]),
  );
  return out;
}
