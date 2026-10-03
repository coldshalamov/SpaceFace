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

export const LOCAL_PORTRAIT_ROOT = `${PORTRAIT_ASSET_ROOT}locals/`;

/** role -> number of authored faces (files `<role>_01.jpg` … `<role>_NN.jpg`). Raise a count only with its files. */
export const LOCAL_PORTRAIT_POOL = Object.freeze({
  barkeep: 8,
});

// Bar slots step by 3 through the pool: 3 is coprime to every pool size of 8, so slots 0..7 at one station all
// land on different faces.
const SLOT_STRIDE = 3;

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
 * @param {{ id?: string, name?: string, role?: string, canonicalKey?: string } | null | undefined} contact
 */
export function localPortraitForContact(contact) {
  if (!contact || contact.canonicalKey) return null;
  const count = LOCAL_PORTRAIT_POOL[contact.role] | 0;
  if (count <= 0) return null;
  const id = String(contact.id || contact.name || '');
  // Procedural contacts are `contact_<stationId>_<slot>`; anything else hashes whole at slot 0.
  const match = /^contact_(.+)_(\d+)$/.exec(id);
  const stationKey = match ? match[1] : id;
  const slot = match ? Number(match[2]) : 0;
  const index = (fnvHash(`${contact.role}:${stationKey}`) + slot * SLOT_STRIDE) % count;
  return `${LOCAL_PORTRAIT_ROOT}${contact.role}_${String(index + 1).padStart(2, '0')}.jpg`;
}
