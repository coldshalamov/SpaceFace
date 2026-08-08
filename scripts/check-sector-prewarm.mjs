#!/usr/bin/env node
// Prove sector entry is prepare-then-swap, not swap-then-demand-load.
//
// The ordering IS the contract. If the rotate lands before the incoming sector's archetypes are
// resident, the player is already flying in a sector whose assets are still decoding, uploading and
// compiling shaders — each arriving in a frame least able to absorb it. A check that only asserted
// "everything ended up resident" would pass either way, so this asserts the *order*, by driving the
// real `prepareSectorEntry` through its injection seams and reading the journal it produces.

import { readFileSync } from 'node:fs';
import { createAssetResidencyRegistry } from '../src/render/assetResidency.js';
import { prepareSectorEntry } from '../src/render/assetLoader.js';
import { authoredPrewarmRequestsForEntities } from '../src/render/partsLibrary.js';

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
    releaseOwner(owner, reason) {
      journal.push(`release:${owner && owner.sectorId}:${reason}`);
      return residency.releaseOwner(owner, reason);
    },
  };
}

const REQUESTS = [
  { url: 'shared.glb', slot: 'hull' },
  { url: 'shared.glb', slot: 'place' },
  { url: 'c.glb', slot: 'engine' },
  { url: 'shared.glb', slot: 'hull' }, // exact duplicate is removed; another slot is not
];

async function completeEntry() {
  const journal = [];
  const seen = [];
  const owner = Object.freeze({ type: 'asset-incoming-sector', sectorId: 'helios', generation: 7 });
  let inFlight = 0;
  let maxInFlight = 0;
  const prepared = await prepareSectorEntry(null, 'helios', REQUESTS, {
    owner,
    residency: journalledResidency(journal),
    loadPart: async (url, options) => {
      inFlight++;
      maxInFlight = Math.max(maxInFlight, inFlight);
      journal.push(`retain:${url}`);
      seen.push(options);
      await new Promise((resolve) => setTimeout(resolve, 1));
      inFlight--;
      return { url, primitives: [], markers: [] };
    },
    warmShaders: async () => { journal.push('warm'); },
  });

  check('every URL + slot archetype becomes resident', prepared.resident === 3,
    `resident ${prepared.resident} of 3`);
  check('prewarm admission stays serial', maxInFlight === 1, `max in flight ${maxInFlight}`);
  check('slot identity reaches the real loader cache seam',
    seen.map((entry) => entry.slot).join(',') === 'hull,place,engine',
    seen.map((entry) => String(entry.slot)).join(','));
  check('archetypes are scoped to the incoming sector',
    seen.every((o) => o.sectorId === 'helios' && o.residencyRole === 'sector-prewarm'
      && o.residencyOwner === owner));

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
    await prepareSectorEntry(null, 'ceres', REQUESTS, {
      residency: journalledResidency(journal),
      // c.glb never becomes resident. Entering anyway would demand-load it mid-flight.
      loadPart: async (url) => (url === 'c.glb' ? null : { url }),
    });
  } catch (error) {
    threw = error;
  }
  check('an incomplete archetype set aborts entry', !!threw, 'prepareSectorEntry resolved instead');
  check('the swap never happens on an incomplete set',
    !journal.some((entry) => entry.startsWith('rotate:')), `journal ${journal.join(' → ')}`);
  check('the failure names the missing archetype',
    !!threw && /c\.glb/.test(String(threw.message || threw)), String(threw && threw.message));
  check('an incomplete prewarm releases its bounded owner',
    journal.some((entry) => entry.endsWith(':sector-prewarm-incomplete')), `journal ${journal.join(' → ')}`);
}

async function staleEntry() {
  const journal = [];
  let active = true;
  const prepared = await prepareSectorEntry(null, 'tethys', REQUESTS, {
    residency: journalledResidency(journal),
    isEntryActive: () => active,
    loadPart: async (url) => {
      active = false;
      return { url };
    },
  });
  check('a stale transition cancels quietly', prepared.cancelled === true);
  check('a stale transition never rotates',
    !journal.some((entry) => entry.startsWith('rotate:')), `journal ${journal.join(' → ')}`);
}

async function thrownLoadEntry() {
  const journal = [];
  let threw = null;
  try {
    await prepareSectorEntry(null, 'loading-failure', REQUESTS, {
      residency: journalledResidency(journal),
      loadPart: async () => { throw new Error('decode exploded'); },
    });
  } catch (error) {
    threw = error;
  }
  check('a thrown authored load aborts entry', /decode exploded/.test(String(threw && threw.message)));
  check('a thrown authored load never rotates',
    !journal.some((entry) => entry.startsWith('rotate:')), `journal ${journal.join(' → ')}`);
  check('a thrown authored load releases its bounded owner',
    journal.some((entry) => entry.endsWith(':sector-prewarm-load-failed')), `journal ${journal.join(' → ')}`);
}

async function rejectedWarmEntry() {
  const journal = [];
  let threw = null;
  try {
    await prepareSectorEntry(null, 'warm-failure', REQUESTS, {
      residency: journalledResidency(journal),
      loadPart: async (url) => ({ url }),
      warmShaders: async () => { throw new Error('shader warm exploded'); },
    });
  } catch (error) {
    threw = error;
  }
  check('a rejected shader warm aborts entry', /shader warm exploded/.test(String(threw && threw.message)));
  check('a rejected shader warm never rotates',
    !journal.some((entry) => entry.startsWith('rotate:')), `journal ${journal.join(' → ')}`);
  check('a rejected shader warm releases its bounded owner',
    journal.some((entry) => entry.endsWith(':sector-prewarm-shader-warm-failed')), `journal ${journal.join(' → ')}`);
}

function manifestDerivedRequests() {
  const requests = authoredPrewarmRequestsForEntities([
    {
      id: 'ashline-dart', type: 'ship', alive: true, homeSectorId: 'sector_ceres_belt',
      data: { defId: 'ship_wasp', lootTableId: 'wasp_swarmer' },
    },
    {
      id: 'ceres-station', type: 'station', alive: true, homeSectorId: 'sector_ceres_belt',
      data: { placeId: 'place_station_trade_hub' },
    },
    {
      id: 'physical-capsule', type: 'payload', alive: true, homeSectorId: 'sector_ceres_belt',
      data: { authoredPayloadAssetId: 'pod_cargo_container' },
    },
    {
      id: 'wrong-sector', type: 'station', alive: true, homeSectorId: 'sector_helios_prime',
      data: { placeId: 'place_station_military' },
    },
    {
      id: 'player', type: 'ship', alive: true, isPlayer: true, homeSectorId: 'sector_ceres_belt',
      data: { defId: 'ship_kestrel' },
    },
  ], {
    releaseMode: true,
    sectorId: 'sector_ceres_belt',
    playerId: 'player',
  });

  check('sector archetypes derive from real entity selectors', JSON.stringify(requests) === JSON.stringify([
    { url: 'assets/ships/release/parts/places/place_station_trade_hub.glb', slot: 'place' },
    { url: 'assets/ships/release/parts/pods/pod_cargo_container.glb', slot: 'pod' },
    { url: 'assets/ships/release/parts/wholeships/ashline_dart.glb', slot: 'hull' },
  ]), JSON.stringify(requests));
}

function productionWiring() {
  const source = readFileSync(new URL('../src/render/renderer.js', import.meta.url), 'utf8');
  check('jump charge opens the production preparation runway',
    /bus\.on\('jump:chargeStart',[\s\S]*beginIncomingSectorPrewarm\(targetSectorId\)/.test(source));
  check('sector entry refreshes the live target set and calls the real prepare-then-swap helper',
    /appendSectorPrewarmRequests\(prewarm, sectorPrewarmRequests\(exactSectorId\)\)[\s\S]*prepareSectorEntry\(renderer, exactSectorId/.test(source));
  check('arrival-time spawns extend the same preparation generation',
    /bus\.on\('jump:arrive',[\s\S]*appendSectorPrewarmRequests\(pending, sectorPrewarmRequests\(exactSectorId\)\)/.test(source));
  check('target authored upgrades wait for the matching preparation generation',
    /_authoredSectorPrewarmPending === prewarm[\s\S]*requestAuthoredUpgrade/.test(source));
}

await completeEntry();
await incompleteEntry();
await staleEntry();
await thrownLoadEntry();
await rejectedWarmEntry();
manifestDerivedRequests();
productionWiring();

console.log(`\n${failures === 0 ? 'sector prewarm: prepare-then-swap holds' : `${failures} assertion(s) failed`}`);
if (failures > 0) process.exit(1);
