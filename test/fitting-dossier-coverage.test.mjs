// Swarm armory dossier coverage: every selectable stock def must resolve a
// complete reading pane — detail, 'when it pays' tip, and a spec table — so a
// future def cannot ship to the shelf without copy.
import assert from 'node:assert/strict';
import { test } from 'node:test';

import { WEAPONS } from '../src/data/weapons.js';
import { MODULES } from '../src/data/modules.js';
import { isArmoryStock } from '../src/data/swarmCatalog.js';
import { dossierFor, FITTING_DOSSIER } from '../src/data/fittingDossier.js';

const STOCK = WEAPONS.concat(MODULES).filter(isArmoryStock);

test('every armory-stock def resolves a dossier with detail, tip and stats', () => {
  const missing = [];
  for (const def of STOCK) {
    const d = dossierFor(def.id);
    if (!d) { missing.push(`${def.id}: no dossier`); continue; }
    if (!d.detail || !d.detail.trim()) missing.push(`${def.id}: empty detail`);
    if (!d.tip || !d.tip.trim()) missing.push(`${def.id}: empty tip`);
    if (!Array.isArray(d.stats) || d.stats.length === 0) missing.push(`${def.id}: empty stats`);
    else if (d.stats.some((s) => !s || !s.label || s.value == null || s.value === '')) {
      missing.push(`${def.id}: malformed stat chip`);
    }
  }
  assert.deepEqual(missing, []);
});

test('authored tip and detail do not restate the blurb', () => {
  const restatements = [];
  for (const def of STOCK) {
    const authored = FITTING_DOSSIER[def.id];
    if (!authored || !def.sentence) continue;
    const blurb = def.sentence.trim();
    if (authored.tip && authored.tip.trim() === blurb) restatements.push(`${def.id}: tip === blurb`);
    if (authored.detail && authored.detail.trim() === blurb) restatements.push(`${def.id}: detail === blurb`);
  }
  assert.deepEqual(restatements, []);
});

test('every authored fitting dossier key resolves to a real def', () => {
  const orphans = Object.keys(FITTING_DOSSIER).filter((id) => !dossierFor(id));
  assert.deepEqual(orphans, []);
});
