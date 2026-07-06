// NPC portrait asset registry — station bar / contact view-panels.
// Canonical story contacts get unique art; procedural bar NPCs fall back to role archetypes.
// Assets live under assets/portraits/ (bundled with release). Procedural canvas avatars remain
// the runtime fallback when a file is missing or still loading.

export const PORTRAIT_ASSET_ROOT = 'assets/portraits/';

/** @type {Readonly<Record<string, string>>} */
export const CANONICAL_PORTRAITS = Object.freeze({
  kessler: 'portrait_kessler.jpg',
  rook: 'portrait_rook.jpg',
  voss: 'portrait_voss.jpg',
  hale: 'portrait_hale.jpg',
  mira: 'portrait_mira.jpg',
  slate: 'portrait_slate.jpg',
  drift: 'portrait_drift.jpg',
  quinn: 'portrait_quinn.jpg',
});

/** @type {Readonly<Record<string, string>>} */
export const ROLE_PORTRAITS = Object.freeze({
  barkeep: 'portrait_role_barkeep.jpg',
  merchant: 'portrait_role_merchant.jpg',
  pilot: 'portrait_role_pilot.jpg',
  smuggler: 'portrait_role_smuggler.jpg',
  engineer: 'portrait_role_engineer.jpg',
  bounty_hunter: 'portrait_role_bounty_hunter.jpg',
  miner: 'portrait_role_miner.jpg',
});

/**
 * Resolve the portrait image URL for a bar/contact record.
 * @param {{ canonicalKey?: string, role?: string } | null | undefined} contact
 * @returns {string | null}
 */
export function portraitAssetForContact(contact) {
  if (!contact) return null;
  const canonical = contact.canonicalKey && CANONICAL_PORTRAITS[contact.canonicalKey];
  if (canonical) return PORTRAIT_ASSET_ROOT + canonical;
  const role = contact.role && ROLE_PORTRAITS[contact.role];
  if (role) return PORTRAIT_ASSET_ROOT + role;
  return null;
}