// P4 — what a fitted part should look like on the hull, and where it goes.
//
// THE PROBLEM. Fitting a part changes only one thing on the 3D hull: the hull's `visuals.tiers[]`
// row, chosen by the SUM of fitted module tiers (`src/data/ships.js`). Two completely different
// Mk II fits therefore produce the same silhouette, and a gun that cost 40 000 credits is
// invisible. The owner's words for it: "fits barely show on the hull".
//
// WHAT THIS IS. A pure table plus a resolver. It draws nothing and owns no render state: it answers
// "for this hull and these fittings, which part mounts on which socket, how big, in what colour".
// The render lane mounts the meshes; Lane 6 authors them through the Forge route. Splitting it this
// way is deliberate — `src/render/partsLibrary.js` is being rewritten by the performance work in
// flight (see `design/program/NOW.md`), so this campaign must not edit it.
//
// The socket positions are not invented here: they are the hull GLB's own empties, read through
// `data/modelTruth.js` (`modelTruthMountFractions`, `modelTruthWeaponSocketName`). If a hull has no
// socket, the mount returns `socket: null` and the render lane falls back to the tier silhouette.

import { SHIPS } from '../../data/ships.js';
import { MODULES } from '../../data/modules.js';
import { WEAPONS } from '../../data/weapons.js';
import {
  modelTruthMountFractions,
  modelTruthPlumeSocketName,
  modelTruthTrailSocketName,
  modelTruthWeaponSocketName,
} from '../../data/modelTruth.js';

const SHIP_BY_ID = new Map(SHIPS.map((shipDef) => [shipDef.id, shipDef]));
const MODULE_BY_ID = new Map(MODULES.map((moduleDef) => [moduleDef.id, moduleDef]));
const WEAPON_BY_ID = new Map(WEAPONS.map((weaponDef) => [weaponDef.id, weaponDef]));

function finite(value, fallback = 0) {
  const number = Number(value);
  return Number.isFinite(number) ? number : fallback;
}

/** The mount families the render lane understands. One word each, never a mesh name. */
export const PART_MOUNTS = Object.freeze({
  GUN: 'gun',
  TOOL: 'tool',
  POD: 'pod',
  PLATE: 'plate',
  HOOK: 'hook',
  MAST: 'mast',
  BAY: 'bay',
  PLUME: 'plume',
  SHEEN: 'sheen',
});

/**
 * Which mount family a part belongs to. Read from the part's own modifiers, so a newly authored
 * module gets a sensible mount without touching this file for the common cases.
 */
export function mountKindForPart(id) {
  const weapon = WEAPON_BY_ID.get(id);
  if (weapon) {
    if (finite(weapon.dmg, 0) <= 0 || weapon.emergentPrimitive) return PART_MOUNTS.TOOL;
    return PART_MOUNTS.GUN;
  }
  const def = MODULE_BY_ID.get(id);
  if (!def) return null;
  const mods = def.mods || {};
  const head = String(mods.masslineHeadId || '');
  if (head || mods.swingDrive) return PART_MOUNTS.HOOK;
  if (finite(mods.magnetRange, 0) > 0 || finite(mods.droneBay, 0) > 0) return PART_MOUNTS.BAY;
  if (mods.countermeasure) return PART_MOUNTS.POD;
  if (finite(mods.damageReductionPct, 0) > 0) return PART_MOUNTS.PLATE;
  if (finite(mods.radarRangePct, 0) > 0 || finite(mods.scannerCloak, 0) > 0) return PART_MOUNTS.MAST;
  switch (def.slotType) {
    case 'engine': return PART_MOUNTS.PLUME;
    case 'thruster': return PART_MOUNTS.POD;
    case 'shield': return PART_MOUNTS.SHEEN;
    case 'cargo': return PART_MOUNTS.POD;
    case 'mining': return PART_MOUNTS.TOOL;
    case 'weapon': return PART_MOUNTS.GUN;
    default: return PART_MOUNTS.POD;
  }
}

/** A stable colour per part family, so the same kind of part reads the same on every hull. */
const MOUNT_TINT = Object.freeze({
  [PART_MOUNTS.GUN]: '#c8ccd4',
  [PART_MOUNTS.TOOL]: '#d8a018',
  [PART_MOUNTS.POD]: '#8aa0b8',
  [PART_MOUNTS.PLATE]: '#6e747c',
  [PART_MOUNTS.HOOK]: '#e06428',
  [PART_MOUNTS.MAST]: '#8fcbff',
  [PART_MOUNTS.BAY]: '#98c838',
  [PART_MOUNTS.PLUME]: '#9fe8ff',
  [PART_MOUNTS.SHEEN]: '#b9d7ee',
});

/** How much of a hull the mount should occupy, by part size. Bigger is not always right. */
const SIZE_SCALE = Object.freeze({ S: 0.55, M: 0.8, L: 1.1 });

function socketsFor(shipId) {
  const weapons = [];
  try {
    let index = 0;
    for (;;) {
      const name = modelTruthWeaponSocketName(shipId, index);
      if (!name) break;
      weapons.push(name);
      index += 1;
      if (index > 7) break;
    }
  } catch (_) { /* a hull with no model truth mounts nothing */ }
  if (!weapons.length) {
    try {
      const rows = modelTruthMountFractions(shipId, 'SOCKET_Weapon_') || [];
      for (const row of rows) if (row && row.name) weapons.push(row.name);
    } catch (_) { /* same */ }
  }
  let plume = null;
  try { plume = modelTruthPlumeSocketName(shipId) || null; } catch (_) { plume = null; }
  let trail = null;
  try { trail = modelTruthTrailSocketName(shipId) || null; } catch (_) { trail = null; }
  return { weapons, plume, trail };
}

/**
 * What to mount on one hull for one fit.
 *
 * @param {{shipId: string, fittings?: Array}} input
 * @returns {Readonly<{shipId, mounts: Array, sheen: null|string}>|null}
 *   each mount: `{ id, kind, socket, socketIndex, scale, tint, glow }`
 */
export function partVisualsForFittings({ shipId, fittings = [] } = {}) {
  const shipDef = SHIP_BY_ID.get(shipId);
  if (!shipDef) return null;
  const slots = [];
  const byType = shipDef.slots || {};
  // buildSlotList order is the fittings array's order; mirrors it without importing the sim.
  for (const type of ['weapon', 'shield', 'engine', 'cargo', 'mining', 'utility', 'thruster']) {
    for (const _ of byType[type] || []) slots.push(type);
  }
  const sockets = socketsFor(shipDef.id);
  const mounts = [];
  let sheen = null;
  let gunIndex = 0;
  let podIndex = 0;
  for (let i = 0; i < (fittings || []).length; i += 1) {
    const id = fittings[i];
    if (!id) continue;
    const kind = mountKindForPart(id);
    if (!kind) continue;
    if (kind === PART_MOUNTS.SHEEN) { sheen = MOUNT_TINT[kind]; continue; }
    const def = MODULE_BY_ID.get(id) || WEAPON_BY_ID.get(id) || {};
    const size = String(def.size || 'S').toUpperCase();
    let socket = null;
    let socketIndex = -1;
    if (kind === PART_MOUNTS.GUN || kind === PART_MOUNTS.TOOL) {
      socket = sockets.weapons[Math.min(gunIndex, Math.max(0, sockets.weapons.length - 1))] || null;
      socketIndex = gunIndex;
      gunIndex += 1;
    } else if (kind === PART_MOUNTS.PLUME) {
      socket = sockets.plume || sockets.trail || null;
      socketIndex = 0;
    } else {
      // pods, plates, hooks, masts and bays ride the hull's own hardpoint list after the guns
      socket = sockets.weapons[Math.min(gunIndex, Math.max(0, sockets.weapons.length - 1))] || null;
      socketIndex = podIndex === 0 && sockets.weapons.length ? 0 : -1;
      podIndex += 1;
    }
    mounts.push(Object.freeze({
      id,
      kind,
      socket,
      socketIndex,
      scale: SIZE_SCALE[size] || SIZE_SCALE.S,
      tint: MOUNT_TINT[kind] || MOUNT_TINT[PART_MOUNTS.POD],
      glow: kind === PART_MOUNTS.PLUME ? 1 : 0,
    }));
  }
  return Object.freeze({
    shipId: shipDef.id,
    mounts: Object.freeze(mounts),
    sheen,
    // The tier silhouette stays as it is: mounts add, they never replace the hull's own look.
    tierSilhouette: true,
  });
}

/** The mount table for one part, for a surface that wants to describe it ("gun · hardpoint"). */
export function partMountFor(id) {
  const kind = mountKindForPart(id);
  if (!kind) return null;
  return Object.freeze({ id, kind, tint: MOUNT_TINT[kind] || MOUNT_TINT[PART_MOUNTS.POD] });
}
