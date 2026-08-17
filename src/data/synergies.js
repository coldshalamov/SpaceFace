// synergies.js - BP-09.1 SYNERGY-TELLS pure data.
//
// These rows name module combinations that are already mechanically real. They do not add stats;
// checks prove each advertised drawback matches getDerivedStats() for the validation hull.

export const SYNERGY_TELLS = Object.freeze([
  synergy({
    id: 'rammer_truck',
    label: 'Rammer-Truck',
    moduleIds: ['mod_ram_plate', 'mod_cargo_pod_m'],
    buildIdentityId: 'rammer_truck',
    fantasy: 'Cargo mass plus a ram plate makes the hold part of the weapon.',
    benefit: '+ram damage from ram plate, +cargo capacity from cargo pod',
    drawback: { stat: 'turnRate', direction: 'down', label: '-turn rate from added mass' },
    validation: { shipId: 'ship_mule' },
  }),
  synergy({
    id: 'wrecking_ball',
    label: 'Wrecking Ball',
    moduleIds: ['mod_ram_plate', 'mod_anchor_plates_m'],
    buildIdentityId: 'rammer_truck',
    fantasy: 'A reinforced prow on a hull that refuses to be shoved turns every committed line into a wrecking pass.',
    benefit: '+ram damage and +coupling resistance',
    drawback: { stat: 'turnRate', direction: 'down', label: '-turn rate from plated mass' },
    validation: { shipId: 'ship_drifter' },
  }),
  synergy({
    id: 'control_tug',
    label: 'Control-Tug',
    moduleIds: ['mod_winch_hd', 'mod_charge_rack'],
    buildIdentityId: 'control_tug',
    fantasy: 'Winch authority plus impulse charges turns positioning into the fight.',
    benefit: '+tether reel authority and +impulse charge capacity',
    drawback: { stat: 'continuousDrain', direction: 'up', label: '+power drain from active hardware' },
    validation: { shipId: 'ship_drifter' },
  }),
  synergy({
    id: 'bulk_miner',
    label: 'Bulk Miner',
    moduleIds: ['mod_drill_amp', 'mod_cargo_pod_m'],
    buildIdentityId: 'bulk_miner',
    fantasy: 'A stronger drill plus hold space commits the hull to a long extraction run.',
    benefit: '+rich-core window and +cargo capacity',
    drawback: { stat: 'turnRate', direction: 'down', label: '-turn rate from mining/cargo mass' },
    validation: { shipId: 'ship_drifter' },
  }),
  synergy({
    id: 'survey_control',
    label: 'Survey Control',
    moduleIds: ['mod_survey_suite', 'mod_cargo_scanner_s'],
    buildIdentityId: 'control_scout',
    fantasy: 'Sensor suite plus cargo scanner makes information the build advantage.',
    benefit: '+scanner radius and +cargo reveal capability',
    drawback: { stat: 'continuousDrain', direction: 'up', label: '+power drain from sensor stack' },
    validation: { shipId: 'ship_drifter' },
  }),
]);

const SYNERGY_BY_ID = new Map(SYNERGY_TELLS.map((row) => [row.id, row]));

function synergy(row) {
  const moduleIds = Object.freeze(row.moduleIds.slice().sort());
  return Object.freeze({
    id: row.id,
    label: row.label,
    moduleIds,
    buildIdentityId: row.buildIdentityId,
    fantasy: row.fantasy,
    benefit: row.benefit,
    drawback: Object.freeze({ ...row.drawback }),
    validation: Object.freeze({ ...row.validation }),
  });
}

function idsFrom(input) {
  if (!input) return [];
  if (Array.isArray(input)) return input.filter((id) => typeof id === 'string' && id);
  if (input instanceof Set) return [...input].filter((id) => typeof id === 'string' && id);
  return [];
}

export function synergyById(id) {
  return SYNERGY_BY_ID.get(id) || null;
}

export function synergiesForFittings(fittings) {
  const ids = new Set(idsFrom(fittings));
  return SYNERGY_TELLS.filter((row) => row.moduleIds.every((id) => ids.has(id)));
}

export function compactSynergy(row) {
  if (!row) return null;
  return Object.freeze({
    id: row.id,
    label: row.label,
    benefit: row.benefit,
    drawback: row.drawback.label,
    drawbackStat: row.drawback.stat,
    modules: row.moduleIds.slice(),
  });
}

export default SYNERGY_TELLS;
