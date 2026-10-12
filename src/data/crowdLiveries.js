// src/data/crowdLiveries.js — C12 crowd liveries (ID-V): per-faction texture sets worn by
// existing crowd hulls. A livery is a material treatment on the stock hull — hullColor,
// accentColor, finish, wear — so every Concord patrol ship reads as Concord without the
// whole crowd rendering as one clone. Derived from FACTION_PALETTES so a livery can never
// fight its faction's authored identity; resolved per-entity in
// paletteWithShipAppearance (src/core/shipAppearance.js) with the player's explicit
// appearance always winning.
//
// Anti-patterns (design/depth-program/P3-faction-visual-identity.md): never key a livery
// by palette-class, never override a faction palette — extend it.

import { hash32 } from '../core/rng.js';
import { FACTION_PALETTES } from './palettes.js';

const HEX_RE = /^#[0-9a-fA-F]{6}$/;

// Four registers per faction: the line paint every hull gets by default, a worn veteran
// finish, a polished parade/inspection coat, and a muted utility scheme for tenders and
// runners. Entries without a register fall back to 'line'.
export const CROWD_LIVERY_SETS = Object.freeze({
  // Concord — blue lawful navy: clean parade coats on patrol hulls, service-worn utility.
  faction_scn: Object.freeze([
    Object.freeze({ id: 'scn_line', hullColor: '#345FAE', accentColor: '#A0C4FF', finish: 'satin', wear: 0.2 }),
    Object.freeze({ id: 'scn_veteran', hullColor: '#2A4A8F', accentColor: '#7AA8E8', finish: 'worn', wear: 0.55 }),
    Object.freeze({ id: 'scn_parade', hullColor: '#3A78FF', accentColor: '#C8DDFF', finish: 'polished', wear: 0.05 }),
    Object.freeze({ id: 'scn_utility', hullColor: '#1A3A8F', accentColor: '#3A78FF', finish: 'worn', wear: 0.7 }),
  ]),
  // Meridian — gold corporate: showroom polish on liners, yard grime on tugs.
  faction_mts: Object.freeze([
    Object.freeze({ id: 'mts_line', hullColor: '#A97420', accentColor: '#FFE09A', finish: 'satin', wear: 0.25 }),
    Object.freeze({ id: 'mts_showroom', hullColor: '#F2B233', accentColor: '#FFF0C0', finish: 'polished', wear: 0.08 }),
    Object.freeze({ id: 'mts_freight', hullColor: '#8B6020', accentColor: '#D8A850', finish: 'worn', wear: 0.6 }),
    Object.freeze({ id: 'mts_ledger', hullColor: '#6A4A18', accentColor: '#F2B233', finish: 'satin', wear: 0.4 }),
  ]),
  // Drift Metals Combine — orange blue-collar: everything wears the belt.
  faction_dmc: Object.freeze([
    Object.freeze({ id: 'dmc_line', hullColor: '#9B5424', accentColor: '#E8A060', finish: 'worn', wear: 0.55 }),
    Object.freeze({ id: 'dmc_beltworn', hullColor: '#7A4010', accentColor: '#C9772E', finish: 'worn', wear: 0.8 }),
    Object.freeze({ id: 'dmc_union', hullColor: '#C9772E', accentColor: '#FFD0A0', finish: 'satin', wear: 0.3 }),
    Object.freeze({ id: 'dmc_scorched', hullColor: '#5A2E12', accentColor: '#B06020', finish: 'worn', wear: 0.9 }),
  ]),
  // Reach — red predatory: worn blades, kill-crew crimson, the odd stolen parade coat.
  faction_reach: Object.freeze([
    Object.freeze({ id: 'reach_line', hullColor: '#A52F48', accentColor: '#FF6680', finish: 'worn', wear: 0.6 }),
    Object.freeze({ id: 'reach_hunter', hullColor: '#7A1020', accentColor: '#D8334A', finish: 'worn', wear: 0.75 }),
    Object.freeze({ id: 'reach_prize', hullColor: '#B84050', accentColor: '#FFB0C0', finish: 'satin', wear: 0.35 }),
    Object.freeze({ id: 'reach_scarred', hullColor: '#5A1828', accentColor: '#D8334A', finish: 'worn', wear: 0.9 }),
  ]),
  // Quiet — violet smuggler: matte, low-signature finishes that drink the light.
  faction_quiet: Object.freeze([
    Object.freeze({ id: 'quiet_line', hullColor: '#604080', accentColor: '#B090E8', finish: 'worn', wear: 0.45 }),
    Object.freeze({ id: 'quiet_dusk', hullColor: '#3A2060', accentColor: '#7A5FB0', finish: 'worn', wear: 0.65 }),
    Object.freeze({ id: 'quiet_signal', hullColor: '#503070', accentColor: '#C0A8F0', finish: 'satin', wear: 0.25 }),
    Object.freeze({ id: 'quiet_ghost', hullColor: '#2A1848', accentColor: '#604080', finish: 'worn', wear: 0.8 }),
  ]),
  // Vael — green contract clauses: clean engineered coats, deep-void hunter scheme.
  faction_vael: Object.freeze([
    Object.freeze({ id: 'vael_line', hullColor: '#176C58', accentColor: '#80EED0', finish: 'satin', wear: 0.2 }),
    Object.freeze({ id: 'vael_hunter', hullColor: '#0A5040', accentColor: '#2FCFA0', finish: 'satin', wear: 0.4 }),
    Object.freeze({ id: 'vael_bloom', hullColor: '#1E8070', accentColor: '#40FFB8', finish: 'polished', wear: 0.1 }),
    Object.freeze({ id: 'vael_deep', hullColor: '#0E3E33', accentColor: '#176C58', finish: 'worn', wear: 0.6 }),
  ]),
  // Free — cyan independent: patched frontier coats on whatever hulls were cheap.
  faction_free: Object.freeze([
    Object.freeze({ id: 'free_line', hullColor: '#235F72', accentColor: '#A0EEF8', finish: 'worn', wear: 0.5 }),
    Object.freeze({ id: 'free_patchwork', hullColor: '#2E7080', accentColor: '#60D8EE', finish: 'worn', wear: 0.7 }),
    Object.freeze({ id: 'free_fresh', hullColor: '#4ECBE0', accentColor: '#D0F4FA', finish: 'polished', wear: 0.15 }),
    Object.freeze({ id: 'free_drift', hullColor: '#1A4A5A', accentColor: '#4ECBE0', finish: 'worn', wear: 0.8 }),
  ]),
  // Choir — magenta zealot: liturgical polish for vessels, burnished deep-tone for acolytes.
  faction_choir: Object.freeze([
    Object.freeze({ id: 'choir_line', hullColor: '#81366F', accentColor: '#F8A0E8', finish: 'satin', wear: 0.3 }),
    Object.freeze({ id: 'choir_vesper', hullColor: '#E85FD0', accentColor: '#FFD0F0', finish: 'polished', wear: 0.08 }),
    Object.freeze({ id: 'choir_acolyte', hullColor: '#702060', accentColor: '#C050B8', finish: 'worn', wear: 0.55 }),
    Object.freeze({ id: 'choir_relic', hullColor: '#5A1848', accentColor: '#E85FD0', finish: 'worn', wear: 0.75 }),
  ]),
  // Helix — clinical automaton grey-blue: uniform service coats, no grime to speak of.
  faction_helix: Object.freeze([
    Object.freeze({ id: 'helix_line', hullColor: '#47638B', accentColor: '#C5CEDD', finish: 'satin', wear: 0.15 }),
    Object.freeze({ id: 'helix_field', hullColor: '#465066', accentColor: '#8B9CB8', finish: 'worn', wear: 0.45 }),
    Object.freeze({ id: 'helix_prime', hullColor: '#8B9CB8', accentColor: '#E0E8F2', finish: 'polished', wear: 0.05 }),
    Object.freeze({ id: 'helix_routine', hullColor: '#3A4E70', accentColor: '#A8B7D0', finish: 'satin', wear: 0.3 }),
  ]),
  // Understory — moss-green saprophyte: everything grows over; nothing is new.
  faction_understory: Object.freeze([
    Object.freeze({ id: 'understory_line', hullColor: '#59731F', accentColor: '#D0E060', finish: 'worn', wear: 0.6 }),
    Object.freeze({ id: 'understory_growth', hullColor: '#3A2A10', accentColor: '#8FA82E', finish: 'worn', wear: 0.8 }),
    Object.freeze({ id: 'understory_canopy', hullColor: '#6A8A2A', accentColor: '#C7D98A', finish: 'satin', wear: 0.4 }),
    Object.freeze({ id: 'understory_root', hullColor: '#2E4A18', accentColor: '#59731F', finish: 'worn', wear: 0.9 }),
  ]),
  // Fulfillment — white clinical logistics: parcel-fleet white with cyan service marks.
  faction_fulfillment: Object.freeze([
    Object.freeze({ id: 'fulfillment_line', hullColor: '#D8D8D0', accentColor: '#40B8E0', finish: 'satin', wear: 0.2 }),
    Object.freeze({ id: 'fulfillment_express', hullColor: '#F0F0E8', accentColor: '#A0E0F0', finish: 'polished', wear: 0.08 }),
    Object.freeze({ id: 'fulfillment_depot', hullColor: '#C0C8C8', accentColor: '#40B8E0', finish: 'worn', wear: 0.5 }),
    Object.freeze({ id: 'fulfillment_returns', hullColor: '#A8B0B0', accentColor: '#60C8E8', finish: 'worn', wear: 0.65 }),
  ]),
  // Archive — deep-violet archivist: gold-trimmed reliquary coats on courier hulls.
  faction_archive: Object.freeze([
    Object.freeze({ id: 'archive_line', hullColor: '#38245F', accentColor: '#B88830', finish: 'satin', wear: 0.3 }),
    Object.freeze({ id: 'archive_reliquary', hullColor: '#3A2A5A', accentColor: '#D8A840', finish: 'polished', wear: 0.1 }),
    Object.freeze({ id: 'archive_stacks', hullColor: '#1A0A2A', accentColor: '#8060C0', finish: 'worn', wear: 0.6 }),
    Object.freeze({ id: 'archive_courier', hullColor: '#4A3070', accentColor: '#B88830', finish: 'satin', wear: 0.4 }),
  ]),
  // Pitborn — rust-orange patchwork: welded plates, scorched seams, arena wear.
  faction_pitborn: Object.freeze([
    Object.freeze({ id: 'pitborn_line', hullColor: '#80371E', accentColor: '#E8B43A', finish: 'worn', wear: 0.7 }),
    Object.freeze({ id: 'pitborn_arena', hullColor: '#C8501C', accentColor: '#FFD060', finish: 'satin', wear: 0.4 }),
    Object.freeze({ id: 'pitborn_slag', hullColor: '#4A3028', accentColor: '#B06020', finish: 'worn', wear: 0.85 }),
    Object.freeze({ id: 'pitborn_weld', hullColor: '#6A2818', accentColor: '#D87838', finish: 'worn', wear: 0.9 }),
  ]),
  // Verge Layers — layered greys: sediment coats that read as stacked paint.
  faction_verge_layers: Object.freeze([
    Object.freeze({ id: 'verge_line', hullColor: '#B0A8B8', accentColor: '#C0B8D8', finish: 'satin', wear: 0.35 }),
    Object.freeze({ id: 'verge_strata', hullColor: '#6A6080', accentColor: '#B0A8B8', finish: 'worn', wear: 0.55 }),
    Object.freeze({ id: 'verge_surface', hullColor: '#C8C0D0', accentColor: '#E0D8E8', finish: 'polished', wear: 0.15 }),
    Object.freeze({ id: 'verge_deep', hullColor: '#4A4460', accentColor: '#6A6080', finish: 'worn', wear: 0.75 }),
  ]),
});

export const CROWD_LIVERY_FACTIONS = Object.freeze(Object.keys(CROWD_LIVERY_SETS));

/**
 * Deterministic livery pick for a faction at integer `index` (wraps). Returns null when the
 * faction has no authored set — the palette fallback continues to cover them.
 */
export function crowdLiveryFor(factionId, index) {
  const set = CROWD_LIVERY_SETS[factionId];
  if (!set || !set.length) return null;
  const i = ((Math.floor(Number(index) || 0) % set.length) + set.length) % set.length;
  return set[i];
}

/**
 * The texture set a crowd entity wears: keyed by entity id so the same hull keeps its coat
 * every materialization, and a stable variant across the whole crowd. Returns null when the
 * entity is not a livery-eligible crowd hull (no faction set, not a ship/drone, or the
 * player's own team — the player's appearance and the free palette already own that lane).
 */
export function crowdLiveryForEntity(entity) {
  if (!entity || !entity.factionId) return null;
  const type = entity.type;
  if (type !== 'ship' && type !== 'drone') return null;
  if (entity.team === 0) return null;
  const set = CROWD_LIVERY_SETS[entity.factionId];
  if (!set) return null;
  const index = hash32(1, 'crowdLivery', String(entity.id));
  return set[index % set.length];
}
