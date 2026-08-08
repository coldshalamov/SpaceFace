#!/usr/bin/env node
// Prove sector entry is prepare-then-publish, not publish-then-compose/upload.
//
// The ordering IS the contract. If the rotate lands before the incoming sector's archetypes are
// resident and its exact boundary is not composed, uploaded, and pool-prepared, the player is already
// flying in a sector whose first visible authored roots are still doing admission work. A check that
// only asserted "everything ended up resident" would pass either way, so this asserts the order by
// driving the real `prepareSectorEntry` and checking the production boundary-generation wiring.

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
  const partsSource = readFileSync(new URL('../src/render/partsLibrary.js', import.meta.url), 'utf8');
  const sourceSlice = (startToken, endToken) => {
    const start = source.indexOf(startToken);
    const end = start >= 0 ? source.indexOf(endToken, start + startToken.length) : -1;
    return start >= 0 && end >= 0 ? source.slice(start, end) : '';
  };
  const probeIsGuarded = (slice, disarmToken) => {
    const begin = slice.indexOf('beginAuthoredInstanceMeshDisposeRegistrationProbe(');
    const end = slice.indexOf('endAuthoredInstanceMeshDisposeRegistrationProbe(', begin);
    const guardedTry = begin >= 0 ? slice.lastIndexOf('try {', begin) : -1;
    const guardedFinally = end >= 0 ? slice.lastIndexOf('finally {', end) : -1;
    const disarm = end >= 0 ? slice.indexOf(disarmToken, end) : -1;
    return guardedTry >= 0 && guardedTry < begin
      && guardedFinally > begin && guardedFinally < end
      && disarm > end;
  };
  check('jump charge opens the production preparation runway',
    /bus\.on\('jump:chargeStart',[\s\S]*beginIncomingSectorPrewarm\(targetSectorId\)/.test(source));
  check('incoming exact entities reserve generation-owned hidden boundaries',
    /stageSectorPrewarmBoundaries[\s\S]*_sectorBoundaryPreparations\.reserve\(\{[\s\S]*generation: record\.generation[\s\S]*fingerprint: authoredCompositionFingerprintForEntity/.test(source));
  check('hidden boundary construction retains the ordinary two-build frame budget',
    /startBudgetPerTurn: RUNTIME_MESH_BUILD_BUDGET/.test(source)
      && /scheduleNextStartTurn: scheduleSectorBoundaryBuildTurn/.test(source));
  check('ordinary reconcile and residency drain exclude every reserved entity id',
    (source.match(/_sectorBoundaryPreparations\?\.has\(/g) || []).length >= 4,
    `${(source.match(/_sectorBoundaryPreparations\?\.has\(/g) || []).length} reservation guards`);
  check('hidden admission prepares exact package pools without publishing them',
    /requestAuthoredUpgrade\(record\.boundary, renderer, scene, \{[\s\S]*deferPackagePoolActivation: true,[\s\S]*deferBoundaryPublication: true/.test(source)
      && /Promise\.allSettled\(preparations\)/.test(partsSource));
  check('sector entry refreshes the live target set and calls the real prepare-then-publish helper',
    /appendSectorPrewarmRequests\(prewarm, sectorPrewarmRequests\(exactSectorId\)\)[\s\S]*prepareSectorEntry\(renderer, exactSectorId/.test(source));
  check('arrival-time spawns extend the same preparation generation',
    /bus\.on\('jump:arrive',[\s\S]*appendSectorPrewarmRequests\(pending, sectorPrewarmRequests\(exactSectorId\)\)/.test(source));
  check('exact boundary fixpoint settlement and publication finish inside the pre-rotation warm gate',
    /const settleSectorBoundaryPreparations = async \(record, options = \{\}\) => \{[\s\S]*settleSectorPrewarmPopulationFixpoint\(record, \{[\s\S]*refreshPopulation:[\s\S]*publishBoundaryRecords:[\s\S]*validatePopulation:/.test(source)
      && /warmShaders: async \(\) => \{[\s\S]*await pipelinePrecompile;[\s\S]*await settleSectorBoundaryPreparations\(prewarm, \{[\s\S]*includePrefetch: true,[\s\S]*publish: true,/.test(source));
  check('fixpoint tracks identity revisions and rescans after settle and publish',
    /boundaryRevision: 0/.test(source)
      && /const reviseSectorPrewarmPopulation = \(record, count = 1\)/.test(source)
      && /record\.boundaryRevision = \(Number\(record\.boundaryRevision\) \|\| 0\) \+ count;/.test(source)
      && /phase: 'after-settle'/.test(source)
      && /phase: 'after-publish'/.test(source)
      && /sectorPrewarmPopulationMatches\(record, snapshot\)/.test(source));
  check('rejecting fixpoint phases and stale renderer envelopes cannot rotate residency',
    /const awaitActivePhase = async \(phase\) => \{[\s\S]*catch \(error\) \{[\s\S]*if \(!isActive\(\)\) return false;[\s\S]*throw error;/.test(source)
      && (source.match(/await awaitActivePhase\(/g) || []).length >= 8
      && /error = promoteSectorPrewarmGenerationInvalidation\([\s\S]*prewarm,[\s\S]*currentSectorPrewarmEnvelope\(prewarm\),[\s\S]*error,[\s\S]*\);[\s\S]*if \(error\?\.preventSectorFallbackRotation !== true\) prewarm\.boundaryRecords\?\.clear\(\);/.test(source));
  check('final pre-rotation barrier requires an exact certified population and renderer envelope',
    /certifyPopulation: options\.publish === true[\s\S]*createSectorPrewarmCertification\([\s\S]*currentSectorPrewarmEnvelope\(currentRecord\)/.test(source)
      && /validateCurrentSectorPrewarmPopulation = \(record\) => \{[\s\S]*sectorPrewarmRequests\(record\.sectorId\)[\s\S]*record\.requestKeys\?\.has\(key\)/.test(source)
      && /isEntryActive: \(\) => prewarm\.active === true[\s\S]*sectorPrewarmGenerationEnvelopeMatches\([\s\S]*prewarm,[\s\S]*currentSectorPrewarmEnvelope\(prewarm\)[\s\S]*prewarm\.rotationCertificationRequired !== true[\s\S]*certifiedSectorPrewarmIsCurrent\(prewarm\)/.test(source)
      && /warmShaders: async \(\) => \{[\s\S]*prewarm\.rotationCertificationRequired = true;[\s\S]*prewarm\.certification = null;[\s\S]*settleSectorBoundaryPreparations/.test(source)
      && /if \(prepared\.cancelled\) \{[\s\S]*releaseSectorPrewarm\(prewarm, 'sector-prewarm-final-certification-invalidated'\);[\s\S]*_incomingSectorPrewarm === prewarm[\s\S]*_incomingSectorPrewarm = null;/.test(source));
  check('stale LIVE records are pruned only against the authoritative entity and mesh census',
    /export function isLiveSectorBoundaryRecordCurrent[\s\S]*current === prepared\.entity[\s\S]*boundary === prepared\.boundary[\s\S]*fingerprint === prepared\.fingerprint/.test(source)
      && /pruneSettledSectorBoundaryRecords\(record\.boundaryRecords, \{[\s\S]*isLiveRecordCurrent:[\s\S]*isLiveSectorBoundaryRecordCurrent[\s\S]*onPruned:[\s\S]*reviseSectorPrewarmPopulation\(record, prunedRecords\)/.test(source)
      && /validateSectorPrewarmPopulationCoverage\(record, sectorPrewarmCoverageOptions\(record\)\)/.test(source));
  check('fixpoint exhaustion and cleanup quarantine cannot rotate fallback residency',
    /SPACEFACE_SECTOR_PREWARM_FIXPOINT_EXHAUSTED/.test(source)
      && /preventSectorFallbackRotation = true/.test(source)
      && /const abortOutcomes = await this\._sectorBoundaryPreparations\.abortRecords\(/.test(source)
      && /error = promoteSectorPrewarmAbortQuarantine\(abortingRecords, abortOutcomes, error\);[\s\S]*if \(error\?\.preventSectorFallbackRotation !== true\) prewarm\.boundaryRecords\?\.clear\(\);/.test(source)
      && /if \(error\?\.preventSectorFallbackRotation === true\) \{[\s\S]*releaseSectorPrewarm\(prewarm, 'sector-prewarm-invariant-failed'\);[\s\S]*throw error;[\s\S]*rotateSector\(exactSectorId\)/.test(source));
  check('publication binds the prepared identity and flips visibility last',
    /publishBoundary: \(record\) => \{[\s\S]*publishPreparedSectorBoundary\(record, \{/.test(source)
      && /export function publishPreparedSectorBoundary[\s\S]*boundary\.visible = false;[\s\S]*options\.meshes\?\.set\(id, boundary\);[\s\S]*boundary\.visible = true;/.test(source));
  check('continuous sector entry keeps exact roots on ordinary reconciliation',
    /bus\.on\('sector:enter', \(\{ sectorId, sector, continuous \} = \{\}\)/.test(source)
      && /const stageExactBoundaries = continuous !== true;/.test(source)
      && /stageBoundaries: stageExactBoundaries/.test(source)
      && /if \(stageExactBoundaries\) stageSectorPrewarmBoundaries\(prewarm\);/.test(source)
      && /_authoredSectorPrewarmPendingId = stageExactBoundaries \? exactSectorId : null;/.test(source));
  check('context loss includes detached prepared instance targets',
    /prepareAuthoredInstancePoolsForContextLoss\(scene, renderer\)/.test(source)
      && /contextRoots\.push\(\.\.\.preparedPoolResources\.roots\)/.test(source)
      && /detachStaleWebGlDisposeListeners\([\s\S]*preparedPoolResources\.provenance/.test(source));
  check('actual render boundaries capture complete minification-stable GPU disposal provenance',
    (source.match(/beginAuthoredInstanceMeshDisposeRegistrationProbe\(/g) || []).length >= 3
      && (source.match(/endAuthoredInstanceMeshDisposeRegistrationProbe\(/g) || []).length >= 3
      && /prepareAuthoredInstancePoolsForContextLoss\(scene, renderer\)/.test(source)
      && /new THREE\.WebGLRenderTarget\(1, 1/.test(partsSource)
      && /probe\.castShadow = true/.test(partsSource)
      && /capturePrivateRegistration\(renderTarget, 'renderTargets'\)/.test(partsSource));
  check('every probe allocation is inside the render-state cleanup guard',
    probeIsGuarded(
      sourceSlice('state.render.warmPostProcess = () => {', 'const compileForCurrentTarget'),
      'dynamicBuffers.disarm(',
    )
      && probeIsGuarded(
        sourceSlice('const openingFrameStarted', 'result.openingFrame = {'),
        'dynamicBuffers.disarm(',
      )
      && probeIsGuarded(
        sourceSlice('drawPreparedFrame() {', 'renderFrame(alpha, frameDt'),
        'this._dynamicBuffers.disarm(',
      ));
  check('context, settings, and target-size changes invalidate prepared generations',
    /abortAll\('webgl-context-lost'\)/.test(source)
      && /abortAll\('video-settings-changed-during-sector-prewarm'\)/.test(source)
      && /abortAll\('render-target-resized-during-sector-prewarm'\)/.test(source));
  check('entity-scoped invalidation prunes only successfully disposed boundaries',
    /export function reconcileSettledSectorBoundaryRecords[\s\S]*prepared\?\.state === SECTOR_BOUNDARY_PREPARATION_STATE\.disposed[\s\S]*prepared\.cleanupBlocked !== true[\s\S]*expectedEntityInvalidation \|\| safelySuperseded/.test(source));
}

await completeEntry();
await incompleteEntry();
await staleEntry();
await thrownLoadEntry();
await rejectedWarmEntry();
manifestDerivedRequests();
productionWiring();

console.log(`\n${failures === 0 ? 'sector prewarm: prepare-then-publish holds' : `${failures} assertion(s) failed`}`);
if (failures > 0) process.exit(1);
