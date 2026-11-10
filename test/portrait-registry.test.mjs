import test from 'node:test';
import assert from 'node:assert/strict';
import { access } from 'node:fs/promises';

import * as portraitRegistry from '../src/data/portraits.js';

const CANONICAL = Object.freeze({
  kessler: 'portrait_kessler.jpg',
  rook: 'portrait_rook.jpg',
  voss: 'portrait_voss.jpg',
  hale: 'portrait_hale.jpg',
  mira: 'portrait_mira.jpg',
  slate: 'portrait_slate.jpg',
  drift: 'portrait_drift.jpg',
  quinn: 'portrait_quinn.jpg',
});

// Canon faces whose art has not shipped: they stay out of the live registry (a key with no file
// draws a 404 and a placeholder where a role face used to be) until the file lands.
const PENDING = Object.freeze({
  sula_dree: 'portrait_sula_dree.jpg',
  callum: 'portrait_callum.jpg',
  wex: 'portrait_wex.jpg',
  sump: 'portrait_sump.jpg',
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
  sallow: 'portrait_sallow.jpg',
  ferrow: 'portrait_ferrow.jpg',
  next_run_courier: 'portrait_next_run_courier.jpg',
});

const NAMED_CONTACTS = Object.freeze({
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

test('every authored recurring person owns one stable portrait identity', async () => {
  assert.deepEqual(portraitRegistry.CANONICAL_PORTRAITS, CANONICAL);
  assert.deepEqual(portraitRegistry.NAMED_CONTACT_PORTRAITS, NAMED_CONTACTS);
  assert.equal('ROLE_PORTRAITS' in portraitRegistry, false, 'role masks must not impersonate named people');

  const entries = [...Object.entries(CANONICAL), ...Object.entries(NAMED_CONTACTS)];
  assert.equal(new Set(entries.map(([, filename]) => filename)).size, entries.length);

  for (const [canonicalKey, filename] of entries) {
    assert.equal(
      portraitRegistry.portraitAssetForContact({ canonicalKey, role: 'smuggler', id: `fallback-${canonicalKey}` }),
      `assets/portraits/${filename}`,
      `${canonicalKey} must resolve by identity, never by role`,
    );
    await access(new URL(`../assets/portraits/${filename}`, import.meta.url));
  }
});

test('portraits whose art has not shipped stay out of the live registry until the file exists', async () => {
  assert.deepEqual(portraitRegistry.PENDING_CANONICAL_PORTRAITS, PENDING);
  for (const [canonicalKey, filename] of Object.entries(PENDING)) {
    assert.equal(portraitRegistry.CANONICAL_PORTRAITS[canonicalKey], undefined, `${canonicalKey} is pending — not live`);
    assert.equal(
      portraitRegistry.portraitAssetForContact({ canonicalKey, role: 'smuggler', id: `fallback-${canonicalKey}` }),
      null,
      `${canonicalKey} must not resolve to a file that is not on disk`,
    );
    const present = await access(new URL(`../assets/portraits/${filename}`, import.meta.url)).then(() => true, () => false);
    assert.equal(present, false, `${filename} now exists: move ${canonicalKey} from PENDING_CANONICAL_PORTRAITS into CANONICAL_PORTRAITS`);
  }
});

test('procedural station contacts do not borrow a stranger role portrait', () => {
  assert.equal(
    portraitRegistry.portraitAssetForContact({
      id: 'contact_station_ceres_0',
      name: 'Neve Tull',
      role: 'barkeep',
      factionId: 'faction_dmc',
    }),
    null,
  );
  assert.equal(
    portraitRegistry.portraitAssetForContact({
      canonicalKey: 'unregistered_contact',
      role: 'pilot',
    }),
    null,
  );
  assert.equal(portraitRegistry.portraitAssetForContact(null), null);
});
