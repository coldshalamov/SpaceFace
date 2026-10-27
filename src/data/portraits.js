// NPC portrait asset registry — station bar / contact view-panels.
// Every authored recurring contact owns a stable image. Procedural station locals deliberately use
// their deterministic canvas identity until they receive an authored station roster; one role photo
// must never impersonate dozens of differently named people.
// Assets live under assets/portraits/ (bundled with release). Procedural canvas avatars remain the
// runtime fallback when a file is absent, missing, or still loading.

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

/**
 * Canon portraits whose art has NOT shipped yet (W-FACES, row 543: 18 faces). They are deliberately
 * kept OUT of CANONICAL_PORTRAITS: a key that points at a missing file draws a 404 and a placeholder
 * where the role-pool face used to be. When a file lands under assets/portraits/, move its key into
 * CANONICAL_PORTRAITS — test/portrait-registry.test.mjs fails the moment a pending file exists.
 */
export const PENDING_CANONICAL_PORTRAITS = Object.freeze({
  // W-FACES (row 543): the rest of the canon cast. The Witness stays terminal-register only,
  // Elroy is memory only, and Vale is never shown (05 §6) — no portrait keys exist for them.
  sula_dree: 'portrait_sula_dree.jpg',
  callum: 'portrait_callum.jpg',
  wex: 'portrait_wex.jpg',
  sump: 'portrait_sump.jpg',
  // Row 543: the eleven new faces of 03 §4.2, given stations in barContacts CANONICAL_CONTACTS.
  ma_sprocket: 'portrait_ma_sprocket.jpg',
  clatter: 'portrait_clatter.jpg',
  moss_keeps_moss: 'portrait_moss_keeps_moss.jpg',
  brother_index: 'portrait_brother_index.jpg',
  addendum_seroy: 'portrait_addendum_seroy.jpg',
  cantor_lise: 'portrait_cantor_lise.jpg',
  mael_ost: 'portrait_mael_ost.jpg',
  petra_lusk: 'portrait_petra_lusk.jpg',
  nine_finger_abe: 'portrait_nine_finger_abe.jpg',
  tamsin: 'portrait_tamsin.jpg',
  clerk_0003: 'portrait_clerk_0003.jpg',
  // Row 543: authored recurring contacts that already held canonical keys but owned no face.
  // Kurtz is deliberately absent — he is the Witness, shown only in the terminal register.
  sallow: 'portrait_sallow.jpg',
  ferrow: 'portrait_ferrow.jpg',
  next_run_courier: 'portrait_next_run_courier.jpg',
});

/** @type {Readonly<Record<string, string>>} */
export const NAMED_CONTACT_PORTRAITS = Object.freeze({
  contact_yune: 'portrait_yune.jpg',
  contact_coldburn_rey: 'portrait_coldburn_rey.jpg',
  contact_iren_suhl: 'portrait_iren_suhl.jpg',
  contact_orrin: 'portrait_orrin.jpg',
  contact_sker_vane: 'portrait_sker_vane.jpg',
  contact_dustwife_senna: 'portrait_dustwife_senna.jpg',
  contact_latch_child: 'portrait_latch_child.jpg',
  contact_question: 'portrait_question.jpg',
  contact_filecleaver_dorin: 'portrait_filecleaver_dorin.jpg',
  contact_lira_vonn: 'portrait_lira_vonn.jpg',
  contact_tinker_zell: 'portrait_tinker_zell.jpg',
  contact_mara_children: 'portrait_mara_children.jpg',
  contact_wraith_kell: 'portrait_wraith_kell.jpg',
  contact_halev_doss: 'portrait_halev_doss.jpg',
  contact_maera_vols: 'portrait_maera_vols.jpg',
});

/**
 * Resolve the portrait image URL for a bar/contact record.
 * @param {{ canonicalKey?: string } | null | undefined} contact
 * @returns {string | null}
 */
export function portraitAssetForContact(contact) {
  if (!contact) return null;
  const portrait = contact.canonicalKey && (
    CANONICAL_PORTRAITS[contact.canonicalKey]
    || NAMED_CONTACT_PORTRAITS[contact.canonicalKey]
  );
  if (portrait) return PORTRAIT_ASSET_ROOT + portrait;
  return null;
}
