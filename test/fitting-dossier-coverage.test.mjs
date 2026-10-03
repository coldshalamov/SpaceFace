// Swarm armory dossier coverage: every selectable stock def must resolve a
// complete reading pane — detail, 'when it pays' tip, and a spec table — so a
// future def cannot ship to the shelf without copy. The hull row and the two
// counter services are offers on the same shelf, so they get the same gate:
// a hull that loses its HULL_DOSSIER entry would otherwise fall back to
// def.sentence + empty tip with no test noticing.
import assert from 'node:assert/strict';
import { test } from 'node:test';

import { WEAPONS } from '../src/data/weapons.js';
import { MODULES } from '../src/data/modules.js';
import { SHIPS } from '../src/data/ships.js';
import { isArmoryStock } from '../src/data/swarmCatalog.js';
import {
  dossierFor,
  serviceDossier,
  FITTING_DOSSIER,
  HULL_DOSSIER,
  SERVICE_DOSSIER,
} from '../src/data/fittingDossier.js';

const STOCK = WEAPONS.concat(MODULES).filter(isArmoryStock);

// Mirrors the two service rows survivalDraft._armoryExtras emits; keep in step
// if a third counter service is ever added there.
const SERVICE_OFFERS = [
  { id: 'svc_weld', kind: 'service', service: 'weld', price: 0, name: 'Hull weld' },
  { id: 'svc_ordnance', kind: 'service', service: 'ordnance', price: 0, name: 'Ordnance top-up' },
];

function checkResolvedDossier(defId, dossier, missing) {
  if (!dossier) { missing.push(`${defId}: no dossier`); return; }
  if (!dossier.detail || !dossier.detail.trim()) missing.push(`${defId}: empty detail`);
  if (!dossier.tip || !dossier.tip.trim()) missing.push(`${defId}: empty tip`);
  if (!Array.isArray(dossier.stats) || dossier.stats.length === 0) missing.push(`${defId}: empty stats`);
  else if (dossier.stats.some((s) => !s || !s.label || s.value == null || s.value === '')) {
    missing.push(`${defId}: malformed stat chip`);
  }
}

test('every armory-stock def resolves a dossier with detail, tip and stats', () => {
  const missing = [];
  for (const def of STOCK) {
    checkResolvedDossier(def.id, dossierFor(def.id), missing);
  }
  assert.deepEqual(missing, []);
});

test('every shelf hull resolves a dossier with detail, tip and stats', () => {
  const missing = [];
  for (const ship of SHIPS) {
    if (!ship || typeof ship.id !== 'string') continue;
    if (!HULL_DOSSIER[ship.id]) missing.push(`${ship.id}: missing HULL_DOSSIER entry`);
    checkResolvedDossier(ship.id, dossierFor(ship.id), missing);
  }
  assert.deepEqual(missing, []);
});

test('every counter service resolves a dossier with detail, tip and stats', () => {
  const missing = [];
  for (const offer of SERVICE_OFFERS) {
    checkResolvedDossier(offer.id, serviceDossier(offer), missing);
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

test('every authored dossier key resolves to a real def', () => {
  const fittingOrphans = Object.keys(FITTING_DOSSIER).filter((id) => !dossierFor(id));
  const hullOrphans = Object.keys(HULL_DOSSIER).filter((id) => !dossierFor(id));
  const serviceOrphans = Object.keys(SERVICE_DOSSIER).filter(
    (id) => !serviceDossier({ id, kind: 'service', service: id.replace(/^svc_/, ''), price: 0, name: id }),
  );
  assert.deepEqual(fittingOrphans, []);
  assert.deepEqual(hullOrphans, []);
  assert.deepEqual(serviceOrphans, []);
});
