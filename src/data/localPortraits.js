// Station-local portrait pool — the faces of the people at a station bar who are not authored recurring cast.
//
// portraits.js owns the recurring cast and refuses any role-to-photo mapping: one role photo must never
// impersonate dozens of named people. This pool keeps that rule. It is NOT a role mask: each role owns a pool of
// distinct individuals (a specific face, life and capture device, authored one by one under
// assets/portraits/locals/), and a local gets exactly one of them from its station and bar slot, so two people
// at the same station never share a face while the pool allows and the same person always has the same face.
// A role whose pool is not yet authored (count 0 / absent) returns null and the bar keeps its canvas fallback.
//
// Provenance for every face: assets/portraits/locals/manifest.json.
import { PORTRAIT_ASSET_ROOT } from './portraits.js';
import { SECTORS } from './sectors.js';

export const LOCAL_PORTRAIT_ROOT = `${PORTRAIT_ASSET_ROOT}locals/`;

/** role -> number of authored faces (files `<role>_01.jpg` … `<role>_NN.jpg`). Raise a count only with its files. */
export const LOCAL_PORTRAIT_POOL = Object.freeze({
  barkeep: 16,
  merchant: 8,
  pilot: 8,
  smuggler: 8,
  engineer: 8,
  bounty_hunter: 8,
  miner: 8,
});

// ── W-FACES (row 543): culture pools ─────────────────────────────────────────────
// 03 §2 gives the Reach's peoples a look; 05 §6 asks for eight culture pools of eight faces each
// so local contacts look like they belong to their station. A culture is a PEOPLE, not a faction
// — a Quiet smuggler born in the drift is still Beltborn. The pool therefore keys off the station's
// people (a station at a cultured station draws from its culture pool for ANY role), falling back
// to the role pool where the station's people have no culture of their own.
export const CULTURE_PORTRAIT_ROOT = `${PORTRAIT_ASSET_ROOT}cultures/`;

/**
 * The culture face files (assets/portraits/cultures/<culture>_NN.jpg) are authored by
 * tools/art/culture_portrait_briefs.py and are NOT on disk yet. While this is false the selector
 * serves the role pool (whose 64 files exist) at every station, so no contact draws a 404 and a
 * placeholder. Flip it to true in the same commit that adds the 64 face files;
 * test/culture-portraits.test.mjs fails if the flag and the files disagree.
 */
export const CULTURE_FACES_SHIPPED = false;

/** culture -> number of authored faces (files `<culture>_01.jpg` … `<culture>_NN.jpg` under cultures/). */
export const CULTURE_PORTRAIT_POOL = Object.freeze({
  coreborn: 8,
  beltborn: 8,
  released: 8,
  pitborn: 8,
  vael: 8,
  homesteader: 8,
  choir: 8,
  understory: 8,
});

/** station -> people (03 §2). Stations not listed keep the role pool: cosmopolitan hubs, the
 *  Quiet's fences, the Archive's cache and the Helix post stay mixed crews. */
export const STATION_CULTURE = Object.freeze({
  // Core-born — Helios and Dione citizens: clerks, inspectors, the licensed.
  station_helios: 'coreborn',
  station_coalition: 'coreborn',
  station_customs: 'coreborn',
  station_dione: 'coreborn',
  station_dione_customs: 'coreborn',
  // Beltborn — Drift miners and their families: hi-vis, burn scars, missing fingers, tool belts.
  station_ceres: 'beltborn',
  station_beltout: 'beltborn',
  station_forge: 'beltborn',
  station_vesta_outlying_yard: 'beltborn',
  station_drift: 'beltborn',
  station_expanse: 'beltborn',
  station_hyperion_cut: 'beltborn',
  station_hyperion_claim: 'beltborn',
  station_rhea_cinder: 'beltborn',
  station_nereid_claim: 'beltborn',
  // The Released — first-generation Pit survivors: chalk-pale, flinch at bright rooms, prison
  // tattoos as intake numbers. The Pit's ruined cache is where the survivors stayed.
  station_ashcache: 'released',
  // Pitborn — the second generation: rust and gold, string lights, junk-jewellery, loud. The Cull
  // crowds drink at the gate-camp towns (02 §13: yards at Ashfall and Sker Haven; the gate camps
  // themselves are farms, so the faces gather in the bazaars that serve them).
  station_sker: 'pitborn',
  station_kepler_scar: 'pitborn',
  // Vael contract-folk — nacre fabrics, gloves always on, script-etched cuffs.
  station_veil: 'vael',
  station_phoebe_echo: 'vael',
  // Homesteaders — Free Frontier families: patched work clothes, homemade insignia.
  station_reach: 'homesteader',
  station_haumea_rift: 'homesteader',
  station_nereid: 'homesteader',
  station_triton: 'homesteader',
  station_bolus_rib: 'homesteader',
  // Choir faithful — bronze ornaments, bell charms, shaved temples.
  station_depot3: 'choir',
  // Understory — the gardeners: moss-dyed wraps, masks grown not made, spores in the hair.
  station_eunomia: 'understory',
});

// Bar slots step by 3 through the pool, and stations by 5: both are coprime to a pool size of 8 or 16, so slots 0..7 at
// one station all land on different faces and consecutive stations spread across the pool instead of colliding.
const SLOT_STRIDE = 3;
const STATION_STRIDE = 5;

// Stations in data order: the ordinal spreads faces EVENLY over the stations (a hash alone left two different stations
// with the same barkeep by luck). A station not in the data falls back to a hash of its id.
const STATION_ORDINAL = new Map();
// Row 543: the role pool now serves only the uncultured stations, so it ranks those stations among
// themselves — a global ordinal would scatter a handful of role-pool stations across the pool by
// luck and leave authored faces unused.
const ROLE_STATION_ORDINAL = new Map();
for (const sector of SECTORS) {
  for (const station of sector.stations || []) {
    STATION_ORDINAL.set(station.id, STATION_ORDINAL.size);
    if (!STATION_CULTURE[station.id]) ROLE_STATION_ORDINAL.set(station.id, ROLE_STATION_ORDINAL.size);
  }
}

function fnvHash(text) {
  let h = 2166136261 >>> 0;
  for (let i = 0; i < text.length; i++) {
    h ^= text.charCodeAt(i);
    h = Math.imul(h, 16777619) >>> 0;
  }
  return h;
}

/**
 * The pool file for a procedural station contact, or null when the contact is authored cast (it has a
 * canonicalKey and owns an identity portrait elsewhere), has no role pool yet, or is unknown.
 * A contact at a station whose people have a culture pool draws from that pool for ANY role — the
 * culture pool is the station's people — falling back to the role pool elsewhere.
 * @param {{ id?: string, name?: string, role?: string, canonicalKey?: string, cultureId?: string, stationId?: string } | null | undefined} contact
 */
export function localPortraitForContact(contact) {
  if (!contact || contact.canonicalKey) return null;
  const id = String(contact.id || contact.name || '');
  // Procedural contacts are `contact_<stationId>_<slot>`; anything else hashes whole at slot 0.
  const match = /^contact_(.+)_(\d+)$/.exec(id);
  const stationKey = (match && match[1]) || contact.stationId || id;
  const slot = match ? Number(match[2]) : 0;
  const ordinal = STATION_ORDINAL.has(stationKey) ? STATION_ORDINAL.get(stationKey) : fnvHash(stationKey);
  // Culture pool first: the people of a cultured station — an explicit cultureId wins, then the
  // station's people. Culture faces are not role-keyed, so no role salt; the slot stride alone
  // keeps a station's patrons on different faces.
  const culture = contact.cultureId || STATION_CULTURE[stationKey] || null;
  const cultureCount = CULTURE_FACES_SHIPPED ? ((culture && CULTURE_PORTRAIT_POOL[culture]) | 0) : 0;
  if (cultureCount > 0) {
    const index = (ordinal * STATION_STRIDE + slot * SLOT_STRIDE) % cultureCount;
    return `${CULTURE_PORTRAIT_ROOT}${culture}_${String(index + 1).padStart(2, '0')}.jpg`;
  }
  const count = LOCAL_PORTRAIT_POOL[contact.role] | 0;
  if (count <= 0) return null;
  const roleOrdinal = ROLE_STATION_ORDINAL.has(stationKey) ? ROLE_STATION_ORDINAL.get(stationKey) : ordinal;
  // The role salt keeps two roles from stepping through their pools in lockstep.
  const index = (roleOrdinal * STATION_STRIDE + (fnvHash(contact.role) % count) + slot * SLOT_STRIDE) % count;
  return `${LOCAL_PORTRAIT_ROOT}${contact.role}_${String(index + 1).padStart(2, '0')}.jpg`;
}
