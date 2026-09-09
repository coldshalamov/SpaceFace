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
