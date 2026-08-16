// Plan 14 physical heavy-part contract.
//
// Pure layout/binding helpers live here; the registered runtime owns entity creation and lifecycle.
// Recipes remain immutable authority in data/heavyFamily.js. No renderer or ambient randomness is
// involved, so a given parent/recipe always produces the same physical child layout and bindings.

export const HEAVY_PART_ENTITY_TYPE = 'heavyPart';

const ROLE_HP = Object.freeze({
  weapon: 58,
  cutter: 68,
  rack: 66,
  bay: 84,
  drive: 92,
  prow: 150,
});

const OFFENSIVE_ROLES = Object.freeze(new Set(['weapon', 'cutter', 'rack', 'bay', 'prow']));

export function buildHeavyPartLayouts(parent, recipe) {
  if (!parent || !recipe || !Array.isArray(recipe.parts)) return [];
  const radius = Math.max(8, Number(parent.radius) || 8);
  const capitalScale = recipe.class === 'capital' ? 3 : 1;
  const roleOrdinals = new Map();
  const roleCounts = new Map();
  for (const part of recipe.parts) roleCounts.set(part.partRole, (roleCounts.get(part.partRole) || 0) + 1);

  return recipe.parts.map((part, recipeIndex) => {
    const ordinal = roleOrdinals.get(part.partRole) || 0;
    roleOrdinals.set(part.partRole, ordinal + 1);
    const count = roleCounts.get(part.partRole) || 1;
    const localOffset = localOffsetFor(part.partRole, ordinal, count, recipeIndex, radius);
    const partRadius = Math.max(2.4, radius * (part.partRole === 'prow' ? 0.22 : 0.14));
    return Object.freeze({
      recipeIndex,
      partId: part.id,
      partRole: part.partRole,
      subsystemId: part.subsystemId,
      binding: part.binding,
      localOffset: Object.freeze(localOffset),
      radius: partRadius,
      mass: Math.max(2, Math.min(24, (Number(parent.mass) || 60) * (part.partRole === 'prow' ? 0.055 : 0.035))),
      hp: Math.round((ROLE_HP[part.partRole] || 60) * capitalScale),
    });
  });
}

export function bindHeavyPartWeapons(parent, partRecords) {
  const weapons = parent && parent.data && Array.isArray(parent.data.weapons) ? parent.data.weapons : [];
  for (const weapon of weapons) {
    delete weapon.heavyPartId;
    delete weapon.heavyPartDestroyed;
  }
  for (const record of partRecords || []) {
    const binding = record && record.binding;
    if (!binding || binding.kind !== 'weapon') continue;
    const matches = weapons.filter((weapon) => weapon && weapon.defId === binding.weaponId);
    const weapon = matches[Math.max(0, Math.trunc(Number(binding.ordinal) || 0))];
    if (!weapon) continue;
    weapon.heavyPartId = record.partId;
    weapon.heavyPartDestroyed = !!record.destroyed;
    record.weaponSlotIndex = Number.isFinite(weapon.slotIndex) ? weapon.slotIndex : null;
  }
  return weapons;
}

export function heavyStripConditionMet(recipe, partRecords) {
  const records = Array.isArray(partRecords) ? partRecords : [];
  if (!recipe || !records.length) return false;
  if (recipe.class === 'capital' && Array.isArray(recipe.phases) && recipe.phases.length >= 2) {
    const required = recipe.phases.slice(0, 2).flatMap((phase) => phase.objectivePartIds || []);
    return required.length > 0 && required.every((id) => records.some((row) => row.partId === id && row.destroyed));
  }
  const drive = records.filter((row) => row.partRole === 'drive');
  const offensive = records.filter((row) => OFFENSIVE_ROLES.has(row.partRole));
  const driveStripped = drive.length > 0 && drive.every((row) => row.destroyed);
  const weaponsStripped = offensive.length > 0 && offensive.every((row) => row.destroyed);
  return driveStripped || weaponsStripped;
}

export function selectedMountedHeavyPart(state, helpers) {
  const selection = state && state.ui && state.ui.componentSelection;
  const parentTargetId = state && state.player && state.player.targetId;
  if (!selection || selection.kind !== 'heavyPart' || selection.targetId !== parentTargetId) return null;
  const parent = helpers && typeof helpers.getEntity === 'function'
    ? helpers.getEntity(parentTargetId)
    : state && state.entities && state.entities.get(parentTargetId);
  const runtime = parent && parent.data && parent.data.heavyPartsRuntime;
  const record = runtime && Array.isArray(runtime.parts)
    ? runtime.parts.find((row) => row.partId === selection.componentId && !row.destroyed)
    : null;
  if (!record) return null;
  const part = helpers && typeof helpers.getEntity === 'function'
    ? helpers.getEntity(record.entityId)
    : state.entities.get(record.entityId);
  return part && part.alive !== false && part.data && part.data.heavyPartState === 'mounted' ? part : null;
}

export function worldPointForHeavyPart(parent, localOffset) {
  const rot = Number(parent && parent.rot) || 0;
  const c = Math.cos(rot);
  const s = Math.sin(rot);
  const lx = Number(localOffset && localOffset.x) || 0;
  const lz = Number(localOffset && localOffset.z) || 0;
  return {
    x: (Number(parent && parent.pos && parent.pos.x) || 0) + lx * c - lz * s,
    z: (Number(parent && parent.pos && parent.pos.z) || 0) + lx * s + lz * c,
  };
}

function localOffsetFor(role, ordinal, count, recipeIndex, radius) {
  const spread = count <= 1 ? 0 : (ordinal / (count - 1)) * 2 - 1;
  switch (role) {
    case 'drive': return { x: -radius * 0.88, z: spread * radius * 0.48 };
    case 'prow': return { x: radius * 0.9, z: spread * radius * 0.35 };
    case 'bay': return { x: radius * 0.05, z: (ordinal % 2 === 0 ? 1 : -1) * radius * (0.78 - Math.floor(ordinal / 2) * 0.12) };
    default: {
      const side = recipeIndex % 2 === 0 ? 1 : -1;
      const row = Math.floor(recipeIndex / 2);
      return { x: radius * (0.48 - row * 0.18), z: side * radius * 0.78 };
    }
  }
}
