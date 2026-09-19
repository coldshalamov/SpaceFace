// Lacquer & Starlight: paint identities for the existing Helios fleet. Only neutral paint
// texels receive pigment; authored coloured panels, markings, optics and machinery stay legible.
// These are material uniforms, not shader variants or new texture sets.
export const ILLUSTRATED_LIVERIES = Object.freeze({
  hitch: Object.freeze({ hull: '#356b87', accent: '#53aaa3' }),
  courier: Object.freeze({ hull: '#289796', accent: '#d9b276' }),
  industrial: Object.freeze({ hull: '#c18a36', accent: '#589ba4' }),
  freight: Object.freeze({ hull: '#718b99', accent: '#c79258' }),
  service: Object.freeze({ hull: '#ae5739', accent: '#73b5ac' }),
  yard: Object.freeze({ hull: '#874c36', accent: '#73b5ac', hullStrength: 0.96 }),
  rescue: Object.freeze({ hull: '#c7c1a4', accent: '#dc815b' }),
  authority: Object.freeze({ hull: '#728baa', accent: '#d8b576' }),
  heavyPatrol: Object.freeze({ hull: '#526d89', accent: '#d8b576', hullStrength: 0.96 }),
  salvage: Object.freeze({ hull: '#927062', accent: '#cda257' }),
  wreck: Object.freeze({ hull: '#594638', accent: '#778581', hullStrength: 0.98 }),
  habitat: Object.freeze({ hull: '#b6b6a3', accent: '#568e9c' }),
});

export function illustratedLiveryForAsset(assetId = '') {
  const id = String(assetId).toLowerCase();
  if (/kestrel|borrowed_time/.test(id)) return ILLUSTRATED_LIVERIES.hitch;
  if (/helios_lark|apron_shuttle|arclight|express_liner/.test(id)) return ILLUSTRATED_LIVERIES.courier;
  if (/helios_cradle|ore_barge|prospector|mining_drone/.test(id)) return ILLUSTRATED_LIVERIES.industrial;
  if (/helios_span|volatiles_tanker|mule|pelican|atlas/.test(id)) return ILLUSTRATED_LIVERIES.freight;
  if (/yard_tug/.test(id)) return ILLUSTRATED_LIVERIES.yard;
  if (/repair_tender|survey_pin/.test(id)) return ILLUSTRATED_LIVERIES.service;
  if (/rescue|capsule/.test(id)) return ILLUSTRATED_LIVERIES.rescue;
  if (/bastion/.test(id)) return ILLUSTRATED_LIVERIES.heavyPatrol;
  if (/aftermath|dead_hulk|debris_chunk/.test(id)) return ILLUSTRATED_LIVERIES.wreck;
  if (/inspection|wasp|hornet|military|warden/.test(id)) return ILLUSTRATED_LIVERIES.authority;
  if (/ashline|salvage|scrap|aftermath|dead_hulk|debris|drifter/.test(id)) return ILLUSTRATED_LIVERIES.salvage;
  if (/station|gate|lane_|support_gantry|tally|claim_mark|cold_locker|ash_pin|whistle|memorial|pod_/.test(id)) return ILLUSTRATED_LIVERIES.habitat;
  return null;
}

export function illustratedPigmentForMaterial(assetId, role, name = '') {
  const palette = illustratedLiveryForAsset(assetId);
  if (!palette || /decal|stencil|marking|armor.?dark|armour.?dark/i.test(name)) return null;
  if (role === 'hull') return { color: palette.hull, strength: palette.hullStrength || 0.86 };
  if (role === 'accent' || role === 'service') return { color: palette.accent, strength: 0.76 };
  return null;
}
