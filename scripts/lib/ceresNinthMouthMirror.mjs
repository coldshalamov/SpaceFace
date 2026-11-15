// Bounded lamp presentation only. No native body, installation authority or rescue receipt.
const ROLES = ['lamp:0', 'lamp:1', 'lamp:2'];
export const NINTH_MOUTH_LIGHT_VITAL_KEYS = Object.freeze([
  'ninthMouthLightLife', 'ninthMouthLightIdentity', 'ninthMouthLightOn',
]);
export function ninthMouthLightLife(entity, life = entity?.occupantGeneration) {
  const data = entity?.data;
  if (entity?.type !== 'payload' || !Number.isSafeInteger(life) || life < 1
    || !ROLES.includes(data?.ninthMouthRole)
    || data.ninthMouthIdentity !== `lw_ceres_ninth_mouth:${data.ninthMouthRole}`
    || data.worldRecordId !== data.ninthMouthIdentity || typeof data.ninthMouthLight !== 'boolean') return null;
  return life;
}
export function ninthMouthLightVitalValue(entity, key, life) {
  if (key === 'ninthMouthLightLife') return life;
  if (key === 'ninthMouthLightIdentity') return entity.data.ninthMouthIdentity;
  return entity.data.ninthMouthLight;
}
export function foldNinthMouthLightVitals(row, fields, life = row.occupantGeneration) {
  if (ninthMouthLightLife(row, life) == null || fields.ninthMouthLightLife !== life
    || fields.ninthMouthLightIdentity !== row.data.ninthMouthIdentity
    || typeof fields.ninthMouthLightOn !== 'boolean') return;
  row.data.ninthMouthLight = fields.ninthMouthLightOn;
}
