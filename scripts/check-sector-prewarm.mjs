#!/usr/bin/env node
// Prove sector entry is prepare-then-swap, not swap-then-demand-load.
//
// The ordering IS the contract. If the rotate lands before the incoming sector's archetypes are
// resident, the player is already flying in a sector whose assets are still decoding, uploading and
// compiling shaders — each arriving in a frame least able to absorb it. A check that only asserted
// "everything ended up resident" would pass either way, so this asserts the *order*, by driving the
// real `prepareSectorEntry` through its injection seams and reading the journal it produces.

import { createAssetResidencyRegistry } from '../src/render/assetResidency.js';
import { prepareSectorEntry } from '../src/render/assetLoader.js';

let failures = 0;
function check(name, condition, detail = '') {
  if (condition) { console.log(`ok   ${name}`); return; }
  failures++;
  console.log(`FAIL ${name}${detail ? ` — ${detail}` : ''}`);
}

/** A real residency registry that records when the swap happens relative to the retains. */
function journalledResidency(journal) {
  const residency = createAssetResidencyRegistry();
  return {
    rotateSector(sectorId) {
      journal.push(`rotate:${sectorId}`);
      return residency.rotateSector(sectorId);
    },
  };
}

const URLS = ['a.glb', 'b.glb', 'c.glb'];

async function completeEntry() {
  const journal = [];
  const seen = [];
  const prepared = await prepareSectorEntry(null, 'helios', URLS, {
    residency: journalledResidency(journal),
    loadPart: async (url, options) => {
      journal.push(`retain:${url}`);
      seen.push(options);
      return { url, primitives: [], markers: [] };
    },
    warmShaders: async () => { journal.push('warm'); },
  });

  check('every archetype becomes resident', prepared.resident === URLS.length,
    `resident ${prepared.resident} of ${URLS.length}`);
  check('archetypes are scoped to the incoming sector',
    seen.every((o) => o.sectorId === 'helios' && o.residencyRole === 'sector-prewarm'
      && o.residencyOwner?.type === 'asset-incoming-sector'));

  const rotateAt = journal.indexOf('rotate:helios');
  const lastRetainAt = journal.reduce((last, item, i) => (item.startsWith('retain:') ? i : last), -1);
  const warmAt = journal.indexOf('warm');
  check('the swap happens after every retain', rotateAt > lastRetainAt && rotateAt >= 0,
    `journal ${journal.join(' → ')}`);
  check('shaders warm before the swap', warmAt >= 0 && warmAt < rotateAt,
    `journal ${journal.join(' → ')}`);
}

async function incompleteEntry() {
  const journal = [];
  let threw = null;
  try {
    await prepareSectorEntry(null, 'ceres', URLS, {
      residency: journalledResidency(journal),
      // b.glb never becomes resident. Entering anyway would demand-load it mid-flight.
      loadPart: async (url) => (url === 'b.glb' ? null : { url }),
    });
  } catch (error) {
    threw = error;
  }
  check('an incomplete archetype set aborts entry', !!threw, 'prepareSectorEntry resolved instead');
  check('the swap never happens on an incomplete set',
    !journal.some((entry) => entry.startsWith('rotate:')), `journal ${journal.join(' → ')}`);
  check('the failure names the missing archetype',
    !!threw && /b\.glb/.test(String(threw.message || threw)), String(threw && threw.message));
}

await completeEntry();
await incompleteEntry();

console.log(`\n${failures === 0 ? 'sector prewarm: prepare-then-swap holds' : `${failures} assertion(s) failed`}`);
if (failures > 0) process.exit(1);
