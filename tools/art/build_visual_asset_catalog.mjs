import { createHash } from 'node:crypto';
import {
  existsSync,
  readFileSync,
  writeFileSync,
} from 'node:fs';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), '..', '..');
const JSON_PATH = resolve(ROOT, 'design/graphics-sprints/VISUAL_ASSET_CATALOG.json');
const MARKDOWN_PATH = resolve(ROOT, 'design/graphics-sprints/VISUAL_ASSET_CATALOG.md');
const RELEASE_MANIFEST_PATH = resolve(ROOT, 'assets/ships/release/release_manifest.json');
const PARTS_MANIFEST_PATH = resolve(ROOT, 'assets/ships/parts/parts_manifest.json');
const THRUSTER_MANIFEST_PATH = resolve(ROOT, 'assets/fx/thruster/manifest.json');

const LIFECYCLE = Object.freeze({
  live: 'Reachable from a current runtime selector or world-site binding. Live does not mean visually accepted.',
  candidate: 'Tracked source or release candidate that is not wired into the default runtime.',
  'legacy-donor': 'Historical or alternate work worth selectively adapting; never promote wholesale.',
  'rejected/evidence-only': 'Useful only as evidence, failed experiment, or warning; not a production source.',
  'unsafe-foreign': 'Owned by another active or stopped lane. Inspect read-only until ownership is coordinated.',
});

const TOP_FIVE = Object.freeze([
  {
    rank: 1,
    id: 'kestrel_die_laughing_stencil',
    assetId: 'wholeship_kestrel',
    family: 'VA-110 Starter hero',
    lifecycle: 'candidate',
    exposureReason: 'The Kestrel is the default player ship and remains on screen throughout normal play.',
    currentState: 'In-place material-truth refinement; no manifest or live-release promotion is claimed here.',
    scope: 'Replace only the misleading raised BORROWED plaque with a conformal, chipped DIE LAUGHING field stencil while preserving the ship identity, sockets, collision, scale, and LOD structure.',
    gates: [
      'fiction/material agreement and authored material inventory',
      'normal-camera and close/grazing/clay review',
      'source/release hash and GLB contract checks',
      '120 px and under-45 px readability',
      'Browser/Electron default-route acceptance when browser-gpu is available',
      'independent human-eye art verdict',
    ],
    mutexOrder: ['blender', 'asset-manifest', 'browser-gpu'],
  },
  {
    rank: 2,
    id: 'ashline_v2_dart',
    assetId: 'wholeship_ashline_dart',
    family: 'VA-120 Common hostile/combat family',
    lifecycle: 'candidate',
    exposureReason: 'The live hostile selector maps wasp_swarmer to Ashline Dart.',
    currentState: 'Offline V2 source and KTX2/Meshopt candidate exist; the live selector still uses the older Ashline family.',
    source: 'assets/ships/m4_ashline_v2/source/wholeships/ashline_v2_dart.glb',
    sourceSha256: '12ea70c8c9e7295d65dce57aff3aed64cd7fb62c780fff61c183c67ad293b987',
    candidate: 'assets/ships/m4_ashline_v2/release_candidates/wholeships/ashline_v2_dart.glb',
    candidateSha256: 'c2d64a84d3b3575d2d4001eb82fddeddc31ed94158d72cad3706125c4e8dc720',
    gates: [
      'fiction/material agreement and component-level critique',
      'close, normal-flight, dense-combat, LOD-motion evidence',
      'source/release parity and exact manifest transaction',
      'socket, collision, scale, and behavior parity',
      'material-cache and texture-residency checks',
      'independent human-eye art verdict',
    ],
    mutexOrder: ['blender', 'asset-manifest', 'browser-gpu'],
  },
  {
    rank: 3,
    id: 'ashline_v2_lode',
    assetId: 'wholeship_ashline_lode',
    family: 'VA-121 Industrial/civilian family',
    lifecycle: 'candidate',
    exposureReason: 'The live hostile selector maps bruiser_brawler to Ashline Lode.',
    currentState: 'Offline V2 source and KTX2/Meshopt candidate exist; promotion remains unclaimed.',
    source: 'assets/ships/m4_ashline_v2/source/wholeships/ashline_v2_lode.glb',
    sourceSha256: 'a5f9dc2c54be15021398d886d1b25a32353cbcf6a495fe0837eecb8dc3684c81',
    candidate: 'assets/ships/m4_ashline_v2/release_candidates/wholeships/ashline_v2_lode.glb',
    candidateSha256: '8e003254dc9005a123d1eab15844103dadb1c8b2841fee45775a136559a87b5a',
    gates: [
      'fiction/material agreement and component-level critique',
      'close, normal-flight, dense-combat, LOD-motion evidence',
      'source/release parity and exact manifest transaction',
      'socket, collision, scale, and behavior parity',
      'material-cache and texture-residency checks',
      'independent human-eye art verdict',
    ],
    mutexOrder: ['blender', 'asset-manifest', 'browser-gpu'],
  },
  {
    rank: 4,
    id: 'ashline_v2_rig',
    assetId: 'wholeship_ashline_rig',
    family: 'VA-121 Industrial/civilian family',
    lifecycle: 'candidate',
    exposureReason: 'Two live hostile roles, reaver_pirate and corsair_raider, currently map to the same Ashline Rig.',
    currentState: 'Offline V2 source and KTX2/Meshopt candidate exist; two tracked foundry variants are available as distinct donor directions.',
    source: 'assets/ships/m4_ashline_v2/source/wholeships/ashline_v2_rig.glb',
    sourceSha256: '6517f0ba291a8f58bb0bd97866b2251f4ddf67cfa7f9ec213f49ad031c747926',
    candidate: 'assets/ships/m4_ashline_v2/release_candidates/wholeships/ashline_v2_rig.glb',
    candidateSha256: '21f63ddfd2fe4561668fd7cc5b51d087085d185252218649a6663f0d8c0ad662',
    gates: [
      'fiction/material agreement and distinct Reaver/Corsair role decision',
      'close, normal-flight, dense-combat, LOD-motion evidence',
      'source/release parity and exact manifest transaction',
      'socket, collision, scale, and behavior parity',
      'material-cache and texture-residency checks',
      'independent human-eye art verdict',
    ],
    mutexOrder: ['blender', 'asset-manifest', 'browser-gpu'],
  },
  {
    rank: 5,
    id: 'place_claim_outpost_relay',
    assetId: 'place_claim_outpost_relay',
    family: 'VA-160 Infrastructure/places',
    lifecycle: 'live',
    exposureReason: 'The relay is bound by world-site manifests and the PQ-019A heist facility data, making it a story and gameplay-facing place.',
    currentState: 'Source and release are live. Remaster work must coordinate with the owning PQ-019/PQ-022 lane and preserve world-site identity.',
    scope: 'Bring the relay to the same fiction-first material and shape standard without forking world-site, Atlas, collision, or facility ownership.',
    gates: [
      'facility fiction/material dossier',
      'socket, custody/collision, schedule, route, and scale parity',
      'close, default, far, motion, and LOD evidence',
      'source/release hash and exact manifest transaction',
      'Atlas/world-site reachability and normal-route acceptance',
      'independent human-eye art verdict',
    ],
    mutexOrder: ['blender', 'asset-manifest', 'atlas/renderer', 'browser-gpu'],
  },
]);

const RECOVERY_AND_DONORS = Object.freeze([
  {
    id: 'helios_lark_stopped_remaster',
    lifecycle: 'legacy-donor',
    sourceRef: 'refs/tags/recovery/lark-graphics-remaster-20260723',
    equivalentBranch: 'agent/gfx-production-remaster-lark',
    tip: 'd538a583b673c61051e305963254f6de83d871d0',
    uniqueCommitsVsMasterAtAudit: 16,
    finding: 'The branch contains a newer editable Lark blend and useful build/evidence logic, but its candidate/package evidence is not safe to promote as-is.',
    recovery: [
      'Do not merge or cherry-pick the branch wholesale.',
      'Extract the editable blend and only the scripts or evidence contracts that survive review.',
      'Rebuild source and release candidates with the current pipeline.',
      'Recompute every hash and regenerate normal-camera, motion, LOD, and material-channel evidence.',
      'Promote only after current source/release parity, runtime selection, and independent art review.',
    ],
    masterHashes: {
      blend: '51e8d91966ff4c7cc6528d64768341da4579ca8a375a6dcb24558fb3659c1ce5',
      familySource: '9090e7c21980d0d87d1da422bdb940a7731ceb3b39f4648adc0968df931b708f',
      candidate: 'ea6b131c7e822ff727a27b15c8d707c9e8a0177198a7a9aae52edd050b2426dc',
      liveRelease: '5dfb6c2a2baaa4c8e92758f4e969d262ee668cbf22e5de73020df659e782a473',
    },
    stoppedRefHashes: {
      blend: '2e2a7b454a9705e89085c9358682ec962c686d3ae5ee090d3b0a3d917b2aecee',
      familySource: 'e16c6a28692d209319d710c5ee4b11b6b2fabb7a669848f205711ae1a09cc866',
      candidate: '60ed547af535336e02508d528b0ea5b1588110517010650b416db9cdd0f5b2f5',
    },
  },
  {
    id: 'foundry_ashline_rig_corsair_blade',
    lifecycle: 'legacy-donor',
    path: 'assets/ships/foundry/fleet_breadth_20260720/variants/var_ashline_rig_corsair_blade_v01.glb',
    sha256: 'a795045a0b307614bfdbea7d623c73dca71c596317902cefa744297123996dae',
    use: 'Donor direction for separating corsair_raider from reaver_pirate; never substitute without authored source and live acceptance.',
  },
  {
    id: 'foundry_ashline_rig_reaver_hook',
    lifecycle: 'legacy-donor',
    path: 'assets/ships/foundry/fleet_breadth_20260720/variants/var_ashline_rig_reaver_hook_v01.glb',
    sha256: 'b9dfbf24667b64a9cf46a352cd250e2bf8df083b5e6b6fb75d1146290f4c2a22',
    use: 'Donor direction for separating reaver_pirate from corsair_raider; never substitute without authored source and live acceptance.',
  },
  {
    id: 'helios_arclight',
    lifecycle: 'candidate',
    blend: 'assets/ships/m4_hero_hauler/blender/helios_arclight_production.blend',
    blendSha256: '61e5d2cf14ea2eb595c7f478eb0c0469250229cd60f0fc9cd94616e77d001b6b',
    source: 'assets/ships/m4_hero_hauler/source/wholeships/helios_arclight.glb',
    sourceSha256: '5344a5a31a6fb6947d763b9a6715ad6ba291772dc737ab163f85bf8bc50082b0',
    candidate: 'assets/ships/m4_hero_hauler/release_candidates/wholeships/helios_arclight.glb',
    candidateSha256: '04fa1d52fc38c44b0839147be08a83532796b097636a902a73fa9143b007e8f4',
    use: 'Strong heavy-hauler candidate that still needs a gameplay identity, current build replay, and route acceptance.',
  },
  {
    id: 'kestrel_m5_upgrade',
    lifecycle: 'legacy-donor',
    path: 'assets/ships/m5_kestrel_upgrade',
    use: 'Historical Kestrel donor only. Extract justified component ideas; do not replace the current Kestrel or reintroduce superseded geometry.',
  },
]);

const REJECTED = Object.freeze([
  {
    id: 'legacy_pelican_and_wasp',
    lifecycle: 'rejected/evidence-only',
    paths: [
      'assets/ships/parts/wholeships/pelican.glb',
      'assets/ships/parts/wholeships/wasp.glb',
      'assets/ships/release/parts/wholeships/pelican.glb',
      'assets/ships/release/parts/wholeships/wasp.glb',
    ],
    finding: 'Packaged residuals exist, but the current player selector uses wasp_production_v1 and neither legacy file has a current release-manifest row. They are accessory-heavy legacy shells, not alternate ships ready for promotion.',
  },
  {
    id: 'helios_hub_v10_v12',
    lifecycle: 'rejected/evidence-only',
    finding: 'Retain only for defect history/evidence. Do not treat a rejected station iteration as an alternate live station.',
  },
  {
    id: 'fx_reference_sheets',
    lifecycle: 'rejected/evidence-only',
    paths: ['assets/fx/fx_explosions.jpg', 'assets/fx/fx_thrusters.jpg', 'assets/fx/fx_weapons.jpg'],
    finding: 'Reference-only sheets. The runtime uses deterministic masks and code-native effect systems.',
  },
]);

const UNSAFE_FOREIGN = Object.freeze([
  {
    id: 'stopped_grok_worktree',
    lifecycle: 'unsafe-foreign',
    path: 'C:/Users/93rob/.grok/worktrees/github-spaceface/subagent-019f50fb-0f1e-7a41-84dc-20c752d5c041',
    finding: 'The Git metadata is damaged, but the audited Kestrel outputs were byte-identical to tracked master files. Nothing unique should be recovered in place.',
    action: 'Preserve read-only until the user explicitly authorizes archival or deletion.',
  },
  {
    id: 'active_registered_worktrees',
    lifecycle: 'unsafe-foreign',
    paths: [
      'C:/Users/93rob/sf-l21',
      'C:/Users/93rob/sf-l22',
      'C:/Users/93rob/sf-perf-admission-20260726',
      'C:/Users/93rob/sf-perf-modernization-20260726',
      'C:/Users/93rob/sf-perf01a',
    ],
    finding: 'Concurrent product/performance/PQ worktrees are not visual donor libraries.',
    action: 'Do not inspect destructively, move, merge, or publish their assets without explicit coordination.',
  },
]);

const HIGH_EXPOSURE_PLACES = Object.freeze([
  ['place_debris_chunk', 18],
  ['place_dead_hulk', 15],
  ['place_asteroid_seamed', 9],
  ['place_lane_beacon', 9],
  ['place_nav_buoy', 8],
  ['place_station_blackmarket', 8],
  ['place_station_research', 6],
  ['place_station_trade_hub', 6],
  ['place_asteroid_rock_a', 5],
  ['place_station_mining', 5],
  ['place_station_military', 3],
  ['place_station_refinery', 3],
].map(([id, authoredReferenceCount]) => ({ id, authoredReferenceCount })));

function sha256(bytes) {
  return createHash('sha256').update(bytes).digest('hex');
}

function readJson(path) {
  return JSON.parse(readFileSync(path, 'utf8'));
}

function countBy(rows, key) {
  const counts = {};
  for (const row of rows) counts[row[key]] = (counts[row[key]] || 0) + 1;
  return Object.fromEntries(Object.entries(counts).sort(([a], [b]) => a.localeCompare(b)));
}

function selectorMappings() {
  return {
    player: [
      { runtimeId: 'ship_kestrel', releaseId: 'wholeship_kestrel', role: 'default player ship' },
      { runtimeId: 'ship_wasp', releaseId: 'wholeship_wasp_production_v1', role: 'alternate production player ship' },
    ],
    hostiles: [
      { runtimeId: 'wasp_swarmer', releaseId: 'wholeship_ashline_dart' },
      { runtimeId: 'bruiser_brawler', releaseId: 'wholeship_ashline_lode' },
      { runtimeId: 'reaver_pirate', releaseId: 'wholeship_ashline_rig' },
      { runtimeId: 'corsair_raider', releaseId: 'wholeship_ashline_rig', finding: 'role alias: no distinct corsair hull' },
    ],
    traffic: [
      { runtimeId: 'courier', releaseId: 'wholeship_helios_lark' },
      { runtimeId: 'miner', releaseId: 'wholeship_helios_cradle' },
      { runtimeId: 'hauler', releaseId: 'wholeship_helios_span' },
    ],
    source: 'src/render/partsLibrary.js',
  };
}

export function buildVisualAssetCatalog() {
  const releaseBytes = readFileSync(RELEASE_MANIFEST_PATH);
  const partsBytes = readFileSync(PARTS_MANIFEST_PATH);
  const release = JSON.parse(releaseBytes);
  const parts = JSON.parse(partsBytes);
  const thrusters = readJson(THRUSTER_MANIFEST_PATH);
  const releaseIds = new Set(release.assets.map((row) => row.id));
  const partsIds = new Set(parts.parts.map((row) => row.id));
  const sourceOnly = [...partsIds].filter((id) => !releaseIds.has(id)).sort();
  const releaseOnly = [...releaseIds].filter((id) => !partsIds.has(id)).sort();

  const catalog = {
    schema: 'spaceface.visual-asset-catalog.v1',
    snapshotDate: '2026-07-28',
    authority: {
      status: 'read-only census and production routing; not program state or visual acceptance',
      craft: 'docs/visual-assets/VISUAL_ASSET_PRODUCTION_STANDARD.md',
      program: 'design/program/NOW.md and design/program/roadmap/program-queue.json',
      releaseTruth: 'assets/ships/release/release_manifest.json',
      sourceTruth: 'assets/ships/parts/parts_manifest.json',
    },
    coverage: {
      releaseManifestRows: 'complete: every current row, path, and exact source/release hash',
      liveWholeShipSelectors: 'complete for the current partsLibrary player, hostile, and traffic maps',
      standaloneMedia: 'major runtime families counted; individual 23 portrait and 9 thruster records remain in their owning registries/manifests',
      runtimePlaces: 'ranked static-reference census for the highest-exposure places; not route telemetry',
      candidateAndLegacyArchaeology: 'dated 2026-07-28 and hash-pinned where tracked bytes exist',
      glbInternals: 'not complete: per-mesh materials, UVs, texture channels, LODs, fallbacks, and editable-source replay still require the deeper VA-001 inspector',
      visualAcceptance: 'none assigned by this catalog',
    },
    lifecycleVocabulary: LIFECYCLE,
    manifestCensus: {
      releaseManifest: {
        path: 'assets/ships/release/release_manifest.json',
        sha256: sha256(releaseBytes),
        total: release.assets.length,
        byKind: countBy(release.assets, 'kind'),
      },
      sourceManifest: {
        path: 'assets/ships/parts/parts_manifest.json',
        sha256: sha256(partsBytes),
        total: parts.parts.length,
      },
      sourceOnlyIds: sourceOnly,
      releaseOnlyIds: releaseOnly,
      releaseAssets: release.assets.map((asset) => ({
        id: asset.id,
        kind: asset.kind,
        source: asset.source,
        release: asset.release,
        sourceSha256: asset.sourceSha256,
        releaseSha256: asset.releaseSha256,
      })),
    },
    runtime: {
      selectors: selectorMappings(),
      highExposurePlaces: {
        measurement: 'authored static reference count from the 2026-07-28 read-only census; not runtime telemetry',
        rows: HIGH_EXPOSURE_PLACES,
      },
      standaloneMedia: {
        authoredRecurringPortraits: 23,
        cinematicPosterVideoPairs: 4,
        deterministicThrusterMasks: thrusters.textures.length,
        thrusterManifest: 'assets/fx/thruster/manifest.json',
        menuBackdrop: 'assets/cinematics/C-INTRO-01.jpg',
        notes: [
          'Portrait count comes from src/data/portraits.js identity mappings.',
          'C-INTRO-01 is preloaded by the renderer and used by the menu/UI background path.',
          'Thruster masks are runtime inputs; the three FX JPG sheets are reference-only.',
        ],
      },
      codeNativeVisuals: [
        'src/render/spaceBackground.js',
        'src/render/starfield.js',
        'src/render/parallaxLayers.js',
        'src/render/planetFactory.js',
        'src/render/visualFactory.js',
        'src/render/vfx.js',
        'src/render/combat/phasedExplosions.js',
        'src/render/post/spaceRenderGraph.js',
      ],
    },
    rankedTopFive: TOP_FIVE,
    candidatesAndLegacyDonors: RECOVERY_AND_DONORS,
    rejectedOrEvidenceOnly: REJECTED,
    unsafeForeign: UNSAFE_FOREIGN,
    findings: [
      'Packaged does not imply selected, and selected does not imply accepted art.',
      'The source manifest has legacy Pelican/Wasp records that are absent from the current release manifest.',
      'The release manifest has three Kestrel package records outside the source-manifest census: the ship reference plus LOD1 and LOD2.',
      'Two hostile roles alias the same Ashline Rig; the foundry Corsair/Reaver variants are donor directions, not accepted alternates.',
      'The stopped Lark branch contains useful unique authoring work but stale packaging evidence; selective recovery plus current rebuild is mandatory.',
      'The stopped Grok worktree contains no audited unique visual output and must not be mined or cleaned destructively.',
      'Recent dock, hulk, debris, production Wasp, Gatling, portraits, thruster masks, Cathedral, and trade-hub work should be preserved and reviewed before any reauthoring.',
      'icons_atlas, reticle, and menu_background are cleanup/audit candidates; no player-facing upgrade priority is assigned without live reference proof.',
    ],
    nextQueue: [
      ...TOP_FIVE.map((row) => ({ rank: row.rank, id: row.id, state: row.currentState })),
      { rank: 6, id: 'station_tethys_unique_visual', state: 'Split from trade-hub reuse after exact runtime/Atlas ownership review.' },
      { rank: 7, id: 'C-INTRO-01', state: 'Refresh only after real game identity and crop/video contracts are established.' },
      { rank: 8, id: 'wholeship_helios_lark', state: 'Selectively recover the stopped branch, rebuild current, then use it as civilian craft pilot.' },
      { rank: 9, id: 'wholeship_helios_cradle', state: 'Follow only an accepted Lark construction/material method.' },
      { rank: 10, id: 'wholeship_helios_span', state: 'Follow only an accepted Lark method; evaluate foundry faction variants as donors.' },
    ],
  };
  validateVisualAssetCatalog(catalog);
  return catalog;
}

export function validateVisualAssetCatalog(catalog) {
  const failures = [];
  if (catalog?.schema !== 'spaceface.visual-asset-catalog.v1') failures.push('schema');
  const release = catalog?.manifestCensus?.releaseManifest;
  const assets = catalog?.manifestCensus?.releaseAssets;
  if (!Array.isArray(assets) || assets.length !== release?.total) failures.push('release-total');
  if (new Set((assets || []).map((row) => row.id)).size !== (assets || []).length) failures.push('duplicate-release-id');
  if (Object.values(release?.byKind || {}).reduce((sum, value) => sum + value, 0) !== release?.total) {
    failures.push('release-kind-total');
  }
  const ranks = (catalog?.rankedTopFive || []).map((row) => row.rank);
  if (JSON.stringify(ranks) !== JSON.stringify([1, 2, 3, 4, 5])) failures.push('top-five-ranks');
  for (const row of catalog?.rankedTopFive || []) {
    if (!Object.hasOwn(LIFECYCLE, row.lifecycle)) failures.push(`top-five-lifecycle:${row.id}`);
    if (!Array.isArray(row.gates) || row.gates.length < 5) failures.push(`top-five-gates:${row.id}`);
    if (!row.gates.some((gate) => gate.includes('human-eye'))) failures.push(`top-five-art-gate:${row.id}`);
  }
  const lark = catalog?.candidatesAndLegacyDonors?.find((row) => row.id === 'helios_lark_stopped_remaster');
  if (lark?.tip !== 'd538a583b673c61051e305963254f6de83d871d0') failures.push('lark-tip');
  if (!lark?.recovery?.some((step) => step.includes('Do not merge'))) failures.push('lark-recovery');
  const grok = catalog?.unsafeForeign?.find((row) => row.id === 'stopped_grok_worktree');
  if (!grok || !grok.action.includes('Preserve read-only')) failures.push('grok-preservation');
  for (const row of [
    ...(catalog?.candidatesAndLegacyDonors || []),
    ...(catalog?.rejectedOrEvidenceOnly || []),
    ...(catalog?.unsafeForeign || []),
  ]) {
    if (!Object.hasOwn(LIFECYCLE, row.lifecycle)) failures.push(`lifecycle:${row.id}`);
  }
  for (const row of [
    ...(catalog?.rankedTopFive || []),
    ...(catalog?.candidatesAndLegacyDonors || []),
  ]) {
    validatePinnedFile(row, 'path', 'sha256', failures);
    validatePinnedFile(row, 'blend', 'blendSha256', failures);
    validatePinnedFile(row, 'source', 'sourceSha256', failures);
    validatePinnedFile(row, 'candidate', 'candidateSha256', failures);
  }
  const releaseIds = new Set((assets || []).map((row) => row.id));
  for (const row of catalog?.runtime?.highExposurePlaces?.rows || []) {
    if (!releaseIds.has(row.id)) failures.push(`high-exposure-not-released:${row.id}`);
  }
  for (const path of catalog?.runtime?.codeNativeVisuals || []) {
    if (!existsSync(resolve(ROOT, path))) failures.push(`missing-code-native-owner:${path}`);
  }
  if (failures.length) throw new Error(`visual asset catalog invalid: ${failures.join(', ')}`);
  return true;
}

function validatePinnedFile(row, pathField, hashField, failures) {
  const path = row?.[pathField];
  const expected = row?.[hashField];
  if (!path || !expected) return;
  const absolute = resolve(ROOT, path);
  if (!existsSync(absolute)) {
    failures.push(`missing-pinned-file:${row.id}:${pathField}`);
    return;
  }
  const actual = sha256(readFileSync(absolute));
  if (actual !== expected) failures.push(`pinned-hash-drift:${row.id}:${pathField}`);
}

export function renderVisualAssetCatalogMarkdown(catalog) {
  const kinds = Object.entries(catalog.manifestCensus.releaseManifest.byKind)
    .map(([kind, count]) => `| \`${kind}\` | ${count} |`)
    .join('\n');
  const top = catalog.rankedTopFive.map((row) => (
    `| ${row.rank} | \`${row.id}\` | ${row.lifecycle} | ${row.exposureReason} | ${row.currentState} |`
  )).join('\n');
  const liveSelectors = [
    ...catalog.runtime.selectors.player,
    ...catalog.runtime.selectors.hostiles,
    ...catalog.runtime.selectors.traffic,
  ].map((row) => `| \`${row.runtimeId}\` | \`${row.releaseId}\` | ${row.finding || row.role || ''} |`).join('\n');
  const donors = catalog.candidatesAndLegacyDonors.map((row) => (
    `| \`${row.id}\` | ${row.lifecycle} | ${row.finding || row.use || ''} |`
  )).join('\n');
  const exposure = catalog.runtime.highExposurePlaces.rows
    .map((row) => `| \`${row.id}\` | ${row.authoredReferenceCount} |`)
    .join('\n');
  const findings = catalog.findings.map((finding) => `- ${finding}`).join('\n');

  return `# SpaceFace visual-asset catalog

**Snapshot:** ${catalog.snapshotDate}
**Status:** ${catalog.authority.status}

This is the readable companion to [VISUAL_ASSET_CATALOG.json](./VISUAL_ASSET_CATALOG.json). It
separates what ships from what is selected, what is only a candidate, what may be adapted as a
legacy donor, what is evidence-only, and what belongs to another lane. It does **not** declare any
asset visually accepted.

The ranked remediation sequence and component-level fiction/development agreements are in
[TOP_FIVE_MATERIAL_TRUTH_PLAN.md](./TOP_FIVE_MATERIAL_TRUTH_PLAN.md).

## Coverage boundary

- Every current release-manifest row, path, and exact source/release hash is included.
- Current whole-ship player, hostile, and traffic selectors are included.
- Major standalone-media families and the highest-exposure place references are counted.
- Candidate/worktree archaeology is a dated ${catalog.snapshotDate} snapshot, hash-pinned where the
  files are tracked.
- Per-mesh materials, UVs, embedded texture channels, LODs, fallbacks, and editable-source replay
  are **not yet a complete GLB-internal census**. Those remain the deeper VA-001 inspector task.

## Lifecycle rules

- **live** — ${catalog.lifecycleVocabulary.live}
- **candidate** — ${catalog.lifecycleVocabulary.candidate}
- **legacy-donor** — ${catalog.lifecycleVocabulary['legacy-donor']}
- **rejected/evidence-only** — ${catalog.lifecycleVocabulary['rejected/evidence-only']}
- **unsafe-foreign** — ${catalog.lifecycleVocabulary['unsafe-foreign']}

## Manifest census

The release manifest contains **${catalog.manifestCensus.releaseManifest.total}** exact rows and is
anchored by SHA-256
\`${catalog.manifestCensus.releaseManifest.sha256}\`. The source manifest contains
**${catalog.manifestCensus.sourceManifest.total}** rows and is anchored by
\`${catalog.manifestCensus.sourceManifest.sha256}\`.

| Release kind | Count |
|---|---:|
${kinds}

Source-only IDs: ${catalog.manifestCensus.sourceOnlyIds.map((id) => `\`${id}\``).join(', ') || 'none'}.
Release-only IDs: ${catalog.manifestCensus.releaseOnlyIds.map((id) => `\`${id}\``).join(', ') || 'none'}.

The JSON records every release ID, source/release path, and exact source/release hash. A manifest row
means the bytes are packaged; it does not prove a current selector, a normal gameplay route, or an
art verdict.

## Current whole-ship selectors

| Runtime identity | Release identity | Finding |
|---|---|---|
${liveSelectors}

The important structural gap is explicit: \`reaver_pirate\` and \`corsair_raider\` both select
\`wholeship_ashline_rig\`. The tracked Corsair Blade and Reaver Hook files are donor directions,
not accepted alternate ships.

## Ranked first five

| Rank | Slice | Lifecycle | Why now | Honest state |
|---:|---|---|---|---|
${top}

Each row in the JSON carries its exact acceptance gates and mutex order. None may skip fiction and
material definition, normal-camera review, source/release validation, runtime acceptance when
required, or an independent human-eye verdict.

## High-exposure places

These counts are authored static references from the read-only ${catalog.snapshotDate} census, not
runtime telemetry:

| Place | Static references |
|---|---:|
${exposure}

Recent dock, hulk, debris, military-station, trade-hub, Cathedral, Wasp, Gatling, portrait, and
thruster work is review input—not permission to restart those assets.

## Scattered candidates and donor assets

| Asset | Lifecycle | Use or finding |
|---|---|---|
${donors}

### Stopped Lark recovery

Use tag \`${catalog.candidatesAndLegacyDonors[0].sourceRef}\` at
\`${catalog.candidatesAndLegacyDonors[0].tip}\`. Do not merge it wholesale. Recover the editable
blend and only reviewed build/evidence logic, rebuild against the current pipeline, regenerate
hashes/evidence, and then seek normal-route and independent art acceptance. The JSON pins the master
and stopped-ref hashes needed to audit that extraction.

### Stopped Grok worktree

\`${catalog.unsafeForeign[0].path}\` still exists. Its audited Kestrel outputs were byte-identical to
tracked master assets and no unique visual output was found. Preserve it read-only; do not use
damaged Git metadata as a reason to copy, delete, or promote files.

## Standalone and code-native visuals

- ${catalog.runtime.standaloneMedia.authoredRecurringPortraits} authored recurring portraits.
- ${catalog.runtime.standaloneMedia.cinematicPosterVideoPairs} cinematic poster/video pairs.
- ${catalog.runtime.standaloneMedia.deterministicThrusterMasks} deterministic runtime thruster/RCS masks.
- \`${catalog.runtime.standaloneMedia.menuBackdrop}\` is the menu/boot cinematic backdrop.
- Backgrounds, planets, fallbacks, combat effects, propulsion, and post processing also include
  code-native visuals; their exact owner files are enumerated in the JSON.

## Findings and next use

${findings}

Regenerate after a manifest/runtime-map change:

\`\`\`powershell
node tools/art/build_visual_asset_catalog.mjs
node --test test/visual-asset-catalog.test.mjs
\`\`\`

The generator intentionally does not inspect or mutate foreign worktrees. Branch/worktree
archaeology is a dated, hash-pinned snapshot and must be refreshed by a coordinated read-only audit.
`;
}

function writeOutputs() {
  const catalog = buildVisualAssetCatalog();
  const json = `${JSON.stringify(catalog, null, 2)}\n`;
  const markdown = renderVisualAssetCatalogMarkdown(catalog);
  writeFileSync(JSON_PATH, json);
  writeFileSync(MARKDOWN_PATH, markdown);
  return { catalog, json, markdown };
}

function checkOutputs() {
  const catalog = buildVisualAssetCatalog();
  const expectedJson = `${JSON.stringify(catalog, null, 2)}\n`;
  const expectedMarkdown = renderVisualAssetCatalogMarkdown(catalog);
  const failures = [];
  if (!existsSync(JSON_PATH) || readFileSync(JSON_PATH, 'utf8') !== expectedJson) failures.push('JSON');
  if (!existsSync(MARKDOWN_PATH) || readFileSync(MARKDOWN_PATH, 'utf8') !== expectedMarkdown) failures.push('Markdown');
  if (failures.length) throw new Error(`visual asset catalog stale: ${failures.join(', ')}`);
  return catalog;
}

if (process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  try {
    const catalog = process.argv.includes('--check') ? checkOutputs() : writeOutputs().catalog;
    process.stdout.write(`visual-asset-catalog: PASS rows=${catalog.manifestCensus.releaseManifest.total} top=${catalog.rankedTopFive.length} sha256=${catalog.manifestCensus.releaseManifest.sha256}\n`);
  } catch (error) {
    process.stderr.write(`visual-asset-catalog: FAIL ${error instanceof Error ? error.message : String(error)}\n`);
    process.exitCode = 1;
  }
}
