// Lacquer & Starlight: paint identities for the existing Helios fleet. Only neutral paint
// texels receive pigment; authored coloured panels, markings, optics and machinery stay legible.
// These are material uniforms, not shader variants or new texture sets.
export const ILLUSTRATED_LIVERIES = Object.freeze({
  hitch: Object.freeze({ hull: '#356b87', accent: '#53aaa3' }),
  courier: Object.freeze({ hull: '#289796', accent: '#d9b276' }),
  industrial: Object.freeze({ hull: '#c18a36', accent: '#589ba4' }),
  freight: Object.freeze({ hull: '#718b99', accent: '#c79258' }),
  convoy: Object.freeze({ hull: '#365d73', accent: '#b37b44', hullStrength: 0.97 }),
  service: Object.freeze({ hull: '#ae5739', accent: '#73b5ac' }),
  yard: Object.freeze({ hull: '#874c36', accent: '#73b5ac', hullStrength: 0.96 }),
  rescue: Object.freeze({ hull: '#c7c1a4', accent: '#dc815b' }),
  authority: Object.freeze({ hull: '#728baa', accent: '#d8b576' }),
  heavyPatrol: Object.freeze({ hull: '#526d89', accent: '#d8b576', hullStrength: 0.96 }),
  warden: Object.freeze({ hull: '#29445f', accent: '#b6a17d', hullStrength: 0.98 }),
  raider: Object.freeze({ hull: '#703e31', accent: '#be8c48', hullStrength: 0.97 }),
  foundry: Object.freeze({ hull: '#926726', accent: '#548e98', hullStrength: 0.97 }),
  meridian: Object.freeze({ hull: '#37626b', accent: '#c09b65', hullStrength: 0.97 }),
  concord: Object.freeze({ hull: '#355577', accent: '#c4b08a', hullStrength: 0.97 }),
  militia: Object.freeze({ hull: '#596c3e', accent: '#c18345', hullStrength: 0.95 }),
  salvage: Object.freeze({ hull: '#927062', accent: '#cda257' }),
  wreck: Object.freeze({ hull: '#594638', accent: '#778581', hullStrength: 0.98 }),
  habitat: Object.freeze({ hull: '#b6b6a3', accent: '#568e9c' }),
});

export function illustratedLiveryForAsset(assetId = '') {
  const id = String(assetId).toLowerCase();
  if (/helios_span_dmc/.test(id)) return ILLUSTRATED_LIVERIES.foundry;
  if (/helios_span_mts|wasp_mts/.test(id)) return ILLUSTRATED_LIVERIES.meridian;
  if (/helios_span_reach/.test(id)) return ILLUSTRATED_LIVERIES.raider;
  if (/wasp_scn/.test(id)) return ILLUSTRATED_LIVERIES.concord;
  if (/wasp_free/.test(id)) return ILLUSTRATED_LIVERIES.militia;
  if (/kestrel|borrowed_time/.test(id)) return ILLUSTRATED_LIVERIES.hitch;
  if (/helios_lark|apron_shuttle|arclight|express_liner/.test(id)) return ILLUSTRATED_LIVERIES.courier;
  if (/helios_cradle|ore_barge|prospector|mining_drone/.test(id)) return ILLUSTRATED_LIVERIES.industrial;
  if (/mule|atlas/.test(id)) return ILLUSTRATED_LIVERIES.convoy;
  if (/helios_span|volatiles_tanker|pelican/.test(id)) return ILLUSTRATED_LIVERIES.freight;
  if (/yard_tug|hawser/.test(id)) return ILLUSTRATED_LIVERIES.yard;
  if (/repair_tender|survey_pin/.test(id)) return ILLUSTRATED_LIVERIES.service;
  if (/rescue|capsule/.test(id)) return ILLUSTRATED_LIVERIES.rescue;
  if (/warden/.test(id)) return ILLUSTRATED_LIVERIES.warden;
  if (/bastion/.test(id)) return ILLUSTRATED_LIVERIES.heavyPatrol;
  if (/aftermath|dead_hulk|debris_chunk/.test(id)) return ILLUSTRATED_LIVERIES.wreck;
  if (/inspection|wasp|hornet|military|warden/.test(id)) return ILLUSTRATED_LIVERIES.authority;
  if (/ashline/.test(id)) return ILLUSTRATED_LIVERIES.raider;
  if (/ashline|salvage|scrap|aftermath|dead_hulk|debris|drifter/.test(id)) return ILLUSTRATED_LIVERIES.salvage;
  if (/station|gate|lane_|support_gantry|tally|claim_mark|cold_locker|ash_pin|whistle|memorial|pod_/.test(id)) return ILLUSTRATED_LIVERIES.habitat;
  if (/ironback/.test(id)) return ILLUSTRATED_LIVERIES.industrial;
  if (/ranger/.test(id)) return ILLUSTRATED_LIVERIES.service;
  if (/colossus/.test(id)) return ILLUSTRATED_LIVERIES.heavyPatrol;
  if (/leviathan/.test(id)) return ILLUSTRATED_LIVERIES.warden;
  return null;
}

export function illustratedPigmentForMaterial(assetId, role, name = '') {
  const palette = illustratedLiveryForAsset(assetId);
  if (!palette || /decal|stencil|marking|armor.?dark|armour.?dark/i.test(name)) return null;
  if (role === 'hull') return { color: palette.hull, strength: palette.hullStrength || 0.86 };
  if (role === 'accent' || role === 'service') return { color: palette.accent, strength: 0.76 };
  return null;
}
