// Authored, hull-specific yard coatings for the Shipworks paint booth. These are included with hull
// ownership: Ships remains the sole appearance writer and normalization authority. Decals are kept
// out of this table until their baked-at-dock render path is real.
import { defaultShipAppearance, normalizeShipAppearance } from '../core/shipAppearance.js';

function paint(id, label, hullColor, accentColor, finish, wear, story) {
  return Object.freeze({
    id,
    label,
    story,
    appearance: Object.freeze({ hullColor, accentColor, finish, wear }),
  });
}

function original(label = 'Original Coating') {
  return paint('original', label, null, null, null, null, 'The hull as its yard delivered it.');
}

export const SHIP_PAINT_SCHEMES = Object.freeze({
  ship_kestrel: Object.freeze([
    original('Borrowed Time'),
    paint('dockyard_bone', 'Dockyard Bone', '#efe5c8', '#182b31', 'worn', 0.62, 'Bone enamel over cold yard primer.'),
    paint('signal_ember', 'Signal Ember', '#6b2b1c', '#e7b85c', 'satin', 0.36, 'A warm rescue stripe carried across the spine.'),
  ]),
  ship_pelican: Object.freeze([
    original(),
    paint('claim_orange', 'Claim Orange', '#a65322', '#f1c46b', 'worn', 0.56, 'Working orange that keeps a dusty claim readable.'),
    paint('cold_survey', 'Cold Survey', '#44545a', '#8fc8cf', 'satin', 0.28, 'Survey blue-grey with a clean instrument edge.'),
  ]),
  ship_wasp: Object.freeze([
    original(),
    paint('courier_red', 'Courier Red', '#751f2c', '#f0bd77', 'satin', 0.34, 'A fast red body with one warm route stripe.'),
    paint('void_mint', 'Void Mint', '#20383b', '#80ddd0', 'polished', 0.18, 'Dark teal panels under a bright recognition flash.'),
  ]),
  ship_mule: Object.freeze([
    original(),
    paint('meridian_workcoat', 'Meridian Workcoat', '#80693d', '#d8c077', 'worn', 0.48, 'Old freight gold kept honest by loading wear.'),
    paint('apron_yellow', 'Apron Yellow', '#9c7a20', '#2f3230', 'worn', 0.62, 'High-vis yard paint over a scarred grey frame.'),
  ]),
  ship_drifter: Object.freeze([
    original(),
    paint('orcus_moss', 'Orcus Moss', '#293e35', '#95c97a', 'worn', 0.58, 'Moss-dark plate with a field-green seam.'),
    paint('deep_violet', 'Deep Violet', '#34284a', '#b9a3d8', 'satin', 0.30, 'A quiet violet coat for long dark crossings.'),
  ]),
  ship_hornet: Object.freeze([
    original(),
    paint('interceptor_blue', 'Interceptor Blue', '#264e68', '#b6e3ec', 'satin', 0.26, 'Cold patrol blue with a sharp canopy-side flash.'),
    paint('ashfall_mark', 'Ashfall Mark', '#622f27', '#e68b5d', 'worn', 0.44, 'Heat-red panels and an ember recognition edge.'),
  ]),
  ship_ironback: Object.freeze([
    original(),
    paint('foundry_oxide', 'Foundry Oxide', '#5a3f31', '#d58b3f', 'worn', 0.68, 'Oxide brown and furnace orange around the work face.'),
    paint('hard_vacuum', 'Hard Vacuum', '#343b40', '#d2d8d9', 'satin', 0.36, 'Bare-work grey with a pale service stripe.'),
  ]),
  ship_bastion: Object.freeze([
    original(),
    paint('concord_line', 'Concord Line', '#3f5665', '#dbeaf2', 'satin', 0.24, 'Ordered blue-grey plate with a lawful white edge.'),
    paint('freewatch', 'Freewatch', '#303d39', '#d2b86f', 'worn', 0.40, 'Dark watch coat with one independent gold rail.'),
  ]),
  ship_atlas: Object.freeze([
    original(),
    paint('haulage_green', 'Haulage Green', '#354b3c', '#d1aa51', 'worn', 0.55, 'Deep freight green with load-zone gold.'),
    paint('meridian_reserve', 'Meridian Reserve', '#6d5b35', '#efe0a3', 'polished', 0.20, 'Reserved corporate gold for a kept heavy hauler.'),
  ]),
  ship_ranger: Object.freeze([
    original(),
    paint('chart_blue', 'Chart Blue', '#31475b', '#8edce2', 'satin', 0.35, 'Instrument blue with a live-chart cyan pin.'),
    paint('frontier_chalk', 'Frontier Chalk', '#6a6252', '#dfb873', 'worn', 0.60, 'Dusty plate and a hand-kept frontier stripe.'),
  ]),
  ship_warden: Object.freeze([
    original(),
    paint('patrol_white', 'Patrol White', '#9ca5a6', '#31556d', 'satin', 0.25, 'Lawful pale plate over a disciplined blue frame.'),
    paint('blackline', 'Blackline', '#24282c', '#d2653b', 'worn', 0.45, 'Dark interdiction paint with a hot warning rail.'),
  ]),
  ship_colossus: Object.freeze([
    original(),
    paint('fleet_iron', 'Fleet Iron', '#454b52', '#c7d3d8', 'satin', 0.32, 'Fleet iron with a cold command edge.'),
    paint('siege_ember', 'Siege Ember', '#4c2d2a', '#e06b39', 'worn', 0.54, 'Soot-red armor with an ember battery stripe.'),
  ]),
  ship_leviathan: Object.freeze([
    original(),
    paint('command_pearl', 'Command Pearl', '#8f969e', '#d5b45a', 'polished', 0.20, 'Pale command plate with a restrained gold keel.'),
    paint('deep_standard', 'Deep Standard', '#222d38', '#8da9bf', 'satin', 0.38, 'A midnight fleet coat for a hull seen from sectors away.'),
  ]),
});

export function paintSchemesForShip(defId) {
  return SHIP_PAINT_SCHEMES[defId] || Object.freeze([original()]);
}

export function shipPaintAppearance(defId, schemeId, currentAppearance = null) {
  const schemes = paintSchemesForShip(defId);
  const scheme = schemes.find((candidate) => candidate.id === schemeId) || schemes[0];
  if (scheme.id === 'original') return normalizeShipAppearance(defaultShipAppearance(defId), defId);
  const current = normalizeShipAppearance(currentAppearance, defId);
  return normalizeShipAppearance({
    ...current,
    ...scheme.appearance,
    decalId: current.decalId,
  }, defId);
}

export function selectedPaintSchemeId(defId, appearance) {
  const normalized = normalizeShipAppearance(appearance, defId);
  for (const scheme of paintSchemesForShip(defId)) {
    const candidate = shipPaintAppearance(defId, scheme.id, normalized);
    if (candidate.hullColor === normalized.hullColor
        && candidate.accentColor === normalized.accentColor
        && candidate.finish === normalized.finish
        && Math.abs(candidate.wear - normalized.wear) < 0.0001) return scheme.id;
  }
  return 'custom';
}
