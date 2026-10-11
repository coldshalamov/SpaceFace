export const ENVIRONMENT_MATERIALS = Object.freeze({
  rock: { name: 'Common rock', conductivity: 0.08, reflectivity: 0 },
  metal: { name: 'Metal', conductivity: 1, reflectivity: 1 },
  crystal: { name: 'Crystal', conductivity: 0.2, reflectivity: 0, fractureHeat: 48 },
  volatile: { name: 'Volatile rock', conductivity: 0.25, reflectivity: 0, ignitionHeat: 36 },
  debris: { name: 'Conductive wreckage', conductivity: 0.9, reflectivity: 0 },
});

export function environmentMaterialOf(entity) {
  const data = entity?.data || {};
  if (ENVIRONMENT_MATERIALS[data.material || entity?.material]) return data.material || entity.material;
  const tag = [data.typeId, data.opticMaterial, data.asteroidType, data.resourceType, data.oreType, data.variant].join(' ').toLowerCase();
  if (/diamond|crystal/.test(tag)) return 'crystal';
  if (/metal|mirror/.test(tag)) return 'metal';
  if (/volatile/.test(tag)) return 'volatile';
  return entity?.type === 'wreck' ? 'debris' : entity?.type === 'asteroid' ? 'rock' : null;
}

export function stampEnvironmentMaterial(entity, material = environmentMaterialOf(entity)) {
  if (!material || !ENVIRONMENT_MATERIALS[material]) return null;
  const data = entity.data || (entity.data = {});
  data.material = material;
  data.materialName = ENVIRONMENT_MATERIALS[material].name;
  data.conductivity ??= ENVIRONMENT_MATERIALS[material].conductivity;
  data.reflectivity ??= ENVIRONMENT_MATERIALS[material].reflectivity;
  if (material === 'volatile') data.fuelVolatile ??= 0.8;
  if (material === 'debris') data.fuelVolatile ??= 0.55;
  data.materialCondition ||= { heat: Number(data.heat) || 0, reacted: false };
  return ENVIRONMENT_MATERIALS[material];
}

export const ENVIRONMENT_FAMILIES = Object.freeze(['rock', 'metal', 'crystal', 'volatile', 'debris']);
const TINTS = Object.freeze({ metal: 0xd5dee8, crystal: 0xe7fbff, volatile: 0xd98236, debris: 0x759fa4 });

/** Surface identity is independent of mining type, so material pockets do not change ore. */
export function environmentSurfaceData(material, data = {}) {
  const result = { ...data, material };
  if (TINTS[material] != null) result.tint = TINTS[material];
  if (material === 'metal') { result.opticMaterial = 'metal'; result.surfaceMaterial = 'mirror'; }
  if (material === 'crystal') { result.opticMaterial = 'diamond'; result.surfaceMaterial = 'optic_diamond'; }
  stampEnvironmentMaterial({ data: result }, material);
  return result;
}

/** Separate deterministic stream: never consume the mining/spawn random stream. */
export function adventureMaterialFor(typeId, seed, fieldId, slot) {
  if (typeId === 'ast_metallic') return 'metal';
  if (typeId === 'ast_crystalline') return 'crystal';
  if (typeId !== 'ast_common_rock' && typeId !== 'ast_icy') return 'rock';
  let hash = 2166136261;
  for (const ch of `${seed}:${fieldId}:${Math.floor(Number(slot) / 4)}`) hash = Math.imul(hash ^ ch.charCodeAt(0), 16777619) >>> 0;
  return ['rock', 'rock', 'rock', 'metal', 'crystal', 'volatile'][hash % 6];
}
