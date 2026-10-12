#!/usr/bin/env node
// AEP-U3 — 'placeholder at zero' triage (spec §5 Phase U / §7 metric).
//
// Two jobs:
//   1. Station-read dedup audit: every spawned station/gate resolves a single base place body,
//      plus at most one registered faction overlay garnish. A generic place_station_* read
//      carrying an overlay must never double-publish as two bodies, and an overlay stem must
//      never publish as a standalone body.
//   2. Census/classification red-row attribution: every red row in src/data/modelTruthCensus.json
//      and every non-accepted design/production/asset-classifications record is attributed to
//      the §3 program items that cover it (or 'ambient'). The §7 metric targets the §3-attributable
//      count; ambient rows are out-of-program legacy debt tracked separately.
//
// Artifacts (regenerate with --write after landing changes; --check is the drift gate):
//   design/program/asset-experience-program/U3_PLACEHOLDER_TRIAGE.json
//   design/program/asset-experience-program/U3_PLACEHOLDER_TRIAGE.md

import { readFileSync, writeFileSync, existsSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const WRITE = process.argv.includes('--write');
const CHECK = process.argv.includes('--check') || !WRITE;

// Minimal DOM stubs so partsLibrary imports cleanly in node (mirrors check-station-archetype-wiring).
function makeStubCanvas() {
  return {
    width: 1, height: 1, style: {},
    getContext: () => null,
    addEventListener: () => {},
    removeEventListener: () => {},
    toDataURL: () => 'data:,',
  };
}
globalThis.document = {
  createElement: (tag) => (tag === 'canvas' ? makeStubCanvas() : { style: {}, getContext: () => null }),
  createElementNS: () => makeStubCanvas(),
  addEventListener: () => {},
};
globalThis.window = { addEventListener: () => {}, devicePixelRatio: 1 };

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const ARTIFACT_JSON = 'design/program/asset-experience-program/U3_PLACEHOLDER_TRIAGE.json';
const ARTIFACT_MD = 'design/program/asset-experience-program/U3_PLACEHOLDER_TRIAGE.md';

const { SECTORS } = await import('../src/data/sectors.js');
const {
  STATION_OVERLAY_FILES,
  resolvePlaceFileForEntity,
  stationOverlayFileForEntity,
} = await import('../src/render/partsLibrary.js');

// ---------------------------------------------------------------------------
// ITEMS registry — which §3 program items cover each census row / classification
// record. Rows not listed anywhere are 'ambient' (out-of-program legacy debt).
// ---------------------------------------------------------------------------

const PL_FINISH = [
  'place_station_trade_hub', 'place_station_refinery', 'place_station_military',
  'place_station_blackmarket', 'place_station_mining', 'place_station_fab',
  'place_station_research', 'place_station_billboard',
  'place_asteroid_seamed', 'place_asteroid_rock_a', 'place_asteroid_rock_b', 'place_asteroid_rock_c',
  'place_graffiti_berth01', 'place_dead_hulk', 'place_debris_chunk', 'place_lane_beacon',
  'place_nav_buoy', 'place_conveyor_barge', 'place_mining_drone', 'place_gate_jump_ring',
];
const PH3_PLACEHOLDERS = [
  ...PL_FINISH.filter((id) => id.startsWith('place_station_')),
  'var_station_trade_hub_scn_overlay_v01',
  'var_station_trade_hub_mts_overlay_v01',
  'var_station_trade_hub_free_overlay_v01',
];
// AD-1..12 are the 12 `integration_candidate` `*_production_v1` wholeships; their live census
// rows are the `ship_<name>` hulls (massline_express_liner ships as wholeship_* and has no
// census row today — noted in the report, not a red row).
const AD_PRODUCTION = [
  'ship_atlas', 'ship_bastion', 'ship_colossus', 'ship_hornet', 'ship_ironback',
  'ship_leviathan', 'ship_mule', 'ship_pelican', 'ship_ranger', 'ship_saucer', 'ship_warden',
];
// F2 (Lattice Warden chunk): the boss hull's escorts and faction span variants.
const F2_LATTICE = ['warden_escort', 'span:faction_dmc', 'span:faction_mts', 'span:faction_reach'];
// Q-3/BP-8b/L-2 landmark family rows already live in the census (incl. the shipped wreck
// cathedral that Q3's `landmark_wreck_cathedral` QUEUE row is ruled as already-satisfying).
const LANDMARK_FAMILY = [
  'place_landmark_candle_fleet', 'place_landmark_resonant_cathedral',
  'place_landmark_skerris_throne', 'place_landmark_wreck_cathedral',
];
// PP-4 claims dressing: the live claim-outpost body family.
const CLAIM_FAMILY = [
  'place_claim_mark', 'place_claim_outpost_base', 'place_claim_outpost_bastion',
  'place_claim_outpost_catcher', 'place_claim_outpost_fence',
  'place_claim_outpost_refinery', 'place_claim_outpost_relay',
];
const BP8_PLACES = ['place_shrine_pylon', 'place_radiation_pocket', 'place_drifter_fire'];

const ITEM_ROWS = [
  { items: ['PL-1..20', 'PH-3 (stations only)'], ids: PL_FINISH },
  { items: ['PH-3'], ids: PH3_PLACEHOLDERS.filter((id) => id.startsWith('var_station_')) },
  { items: ['AD-1..12'], ids: AD_PRODUCTION },
  { items: ['C-3..C-6 (capital encounter rows)'], ids: ['ship_colossus', 'ship_leviathan', 'ship_warden'] },
  { items: ['F2 (Lattice Warden)'], ids: F2_LATTICE },
  { items: ['Q-3', 'BP-8b', 'L-2 (landmark family)'], ids: LANDMARK_FAMILY },
  { items: ['BP-8'], ids: BP8_PLACES },
  { items: ['PP-4 (claims)'], ids: CLAIM_FAMILY },
];

const CLASS_ROWS = [
  { items: ['PL-1', 'PH-3', 'C-1'], ids: ['place_station_trade_hub'] },
  { items: ['PL-19', 'PT-B-7'], ids: ['place_lane_beacon'] },
  { items: ['PL-11', 'PL-12'], ids: ['place_asteroid_rock_b', 'place_asteroid_rock_c'] },
  { items: ['PL-20'], ids: ['place_gate_jump_ring'] },
  { items: ['Q-3', 'BP-8b', 'L-2'], ids: ['family_core_landmarks'] },
  { items: ['BP-8'], ids: ['family_frontier_pois'] },
  { items: ['PP-4'], ids: ['family_outposts'] },
];

function itemsFor(map, id) {
  return map.filter((row) => row.ids.includes(id)).flatMap((row) => row.items);
}

// ---------------------------------------------------------------------------
// 1) Station-read dedup audit
// ---------------------------------------------------------------------------

const stationReads = [];
let overlayAsBase = 0;
for (const sector of SECTORS) {
  const factionId = sector.factionId || null;
  for (const st of sector.stations || []) {
    const ent = {
      type: 'station',
      id: `spawn_${st.id}`,
      factionId: st.factionId || factionId,
      data: {
        stationId: st.id,
        archetypeGlb: st.archetypeGlb || null,
        stationTypeId: st.type,
        factionId: st.factionId || factionId,
        isGate: false,
      },
    };
    const baseRead = resolvePlaceFileForEntity(ent);
    const overlayRead = stationOverlayFileForEntity(ent);
    if (baseRead && STATION_OVERLAY_FILES.includes(baseRead)) overlayAsBase += 1;
    const presentation = overlayRead
      ? 'base+overlay'
      : (baseRead && baseRead.startsWith('places/place_station_') ? 'generic_only' : 'authored');
    stationReads.push({
      sector: sector.id,
      station: st.id,
      stationType: st.type || null,
      factionId: ent.factionId,
      authoredTag: st.archetypeGlb || null,
      baseRead,
      overlayRead,
      presentation,
    });
  }
  for (const g of sector.gates || []) {
    const ent = {
      type: 'station',
      id: `spawn_${g.id}`,
      factionId,
      data: { stationId: g.id, archetypeGlb: g.archetypeGlb || null, isGate: true, factionId },
    };
    const baseRead = resolvePlaceFileForEntity(ent);
    if (baseRead && STATION_OVERLAY_FILES.includes(baseRead)) overlayAsBase += 1;
    stationReads.push({
      sector: sector.id,
      station: g.id || g.name || `gate→${g.to || '?'}`,
      stationType: 'gate',
      factionId,
      authoredTag: g.archetypeGlb || null,
      baseRead,
      overlayRead: null,
      presentation: 'gate',
    });
  }
}

const genericOnly = stationReads.filter((r) => r.presentation === 'generic_only');
const composed = stationReads.filter((r) => r.presentation === 'base+overlay');

// ---------------------------------------------------------------------------
// 2) Census / classification red-row attribution
// ---------------------------------------------------------------------------

const census = JSON.parse(readFileSync(resolve(ROOT, 'src/data/modelTruthCensus.json'), 'utf8'));
const censusRows = census.rows || [];
const censusAttribution = censusRows
  .filter((r) => r.status !== 'green')
  .map((r) => {
    const items = itemsFor(ITEM_ROWS, r.id);
    return {
      id: r.id,
      reasons: r.reasons || [],
      attribution: items.length ? 'aep-§3' : 'ambient',
      items,
    };
  })
  .sort((a, b) => a.id.localeCompare(b.id));

const classDir = resolve(ROOT, 'design/production/asset-classifications');
const classAttribution = [];
const { readdirSync } = await import('node:fs');
for (const f of readdirSync(classDir).filter((n) => n.endsWith('.json')).sort()) {
  const rec = JSON.parse(readFileSync(resolve(classDir, f), 'utf8'));
  if (rec.classification === 'accepted') continue;
  const items = itemsFor(CLASS_ROWS, rec.assetId);
  classAttribution.push({
    assetId: rec.assetId,
    classification: rec.classification,
    attribution: items.length ? 'aep-§3' : 'ambient',
    items,
  });
}
classAttribution.sort((a, b) => a.assetId.localeCompare(b.assetId));

// ---------------------------------------------------------------------------
// Metrics + report assembly
// ---------------------------------------------------------------------------

const metrics = {
  stations_total: stationReads.length,
  stations_base_plus_overlay: composed.length,
  stations_generic_only: genericOnly.length,
  stations_gate: stationReads.filter((r) => r.presentation === 'gate').length,
  stations_authored: stationReads.filter((r) => r.presentation === 'authored').length,
  stations_overlay_as_base: overlayAsBase,
  registered_overlay_pairs: STATION_OVERLAY_FILES.length,
  census_rows_total: censusRows.length,
  census_red_total: censusAttribution.length,
  census_red_aep: censusAttribution.filter((r) => r.attribution === 'aep-§3').length,
  census_red_ambient: censusAttribution.filter((r) => r.attribution === 'ambient').length,
  classes_nonaccepted: classAttribution.length,
  classes_red_aep: classAttribution.filter((r) => r.attribution === 'aep-§3').length,
  classes_ambient: classAttribution.filter((r) => r.attribution === 'ambient').length,
};

const artifact = {
  generatedBy: 'scripts/check-aep-placeholder-triage.mjs (AEP-U3)',
  schema: 1,
  metrics,
  stationReads,
  censusAttribution,
  classAttribution,
};

const mdLines = [
  '# U3 Placeholder Triage — AEP §7 "placeholder at zero"',
  '',
  'Generated by `scripts/check-aep-placeholder-triage.mjs` — regenerate with `--write`.',
  '',
  '## Metrics',
  '',
  ...Object.entries(metrics).map(([k, v]) => `- \`${k}\` = **${v}**`),
  '',
  `### §7 placeholder stand-ins at zero`,
  '',
  `- Live stations reading a generic \`place_station_*\` body with **no** faction overlay: **${metrics.stations_generic_only}** of ${metrics.stations_total} station/gate spawns.`,
  `- Composed reads (generic base + registered faction overlay, one body + one garnish): **${metrics.stations_base_plus_overlay}** (Free/MTS/SCN trade hubs).`,
  `- Stations publishing an overlay garnish as a standalone body: **${metrics.stations_overlay_as_base}** (hard gate — must stay 0).`,
  `- PH-3 residual: the generic-only reads above are the de-duplicate debt; the commissioned fix is C7/BP-8a faction overlays + C1 archetype finish pass, registered through \`STATION_OVERLAY_FILE_BY_BASE_AND_FACTION\` in \`src/render/partsLibrary.js\`.`,
  `- Census red rows attributable to §3 program items: **${metrics.census_red_aep}** / ${metrics.census_red_total} red rows (${metrics.census_rows_total} total rows).`,
  `- Classification records (non-accepted) attributable to §3 program items: **${metrics.classes_red_aep}** / ${metrics.classes_nonaccepted}.`,
  '- Ambient rows are out-of-program legacy debt (enemy/traffic/player hulls, `aftermath_*` wreck families — BP-9 lifecycle is spec-deferred — VFX, decorative sky). `wholeship_massline_express_liner_v1` is the one AD-1..12 item with no live census row.',
  '',
  '## Station reads',
  '',
  '| sector | station | type | faction | authoredTag | baseRead | overlayRead | presentation |',
  '|---|---|---|---|---|---|---|---|',
  ...stationReads.map((r) => `| ${r.sector} | ${r.station} | ${r.stationType} | ${r.factionId || ''} | ${r.authoredTag || ''} | ${r.baseRead || ''} | ${r.overlayRead || ''} | ${r.presentation} |`),
  '',
  '## Census red-row attribution',
  '',
  '| id | reasons | attribution | items |',
  '|---|---|---|---|',
  ...censusAttribution.map((r) => `| ${r.id} | ${r.reasons.join(', ')} | ${r.attribution} | ${r.items.join('; ')} |`),
  '',
  '## Classification record attribution',
  '',
  '| assetId | classification | attribution | items |',
  '|---|---|---|---|',
  ...classAttribution.map((r) => `| ${r.assetId} | ${r.classification} | ${r.attribution} | ${r.items.join('; ')} |`),
  '',
];

const jsonText = JSON.stringify(artifact, null, 2) + '\n';
const mdText = mdLines.join('\n') + '\n';

if (WRITE) {
  writeFileSync(resolve(ROOT, ARTIFACT_JSON), jsonText);
  writeFileSync(resolve(ROOT, ARTIFACT_MD), mdText);
  console.log(`aep-placeholder-triage: wrote ${ARTIFACT_JSON} + ${ARTIFACT_MD}`);
} else {
  let drift = false;
  for (const [rel, live] of [[ARTIFACT_JSON, jsonText], [ARTIFACT_MD, mdText]]) {
    const p = resolve(ROOT, rel);
    if (!existsSync(p)) {
      console.error(`aep-placeholder-triage: FAIL missing ${rel} (run --write)`);
      drift = true;
      continue;
    }
    if (readFileSync(p, 'utf8') !== live) {
      console.error(`aep-placeholder-triage: FAIL ${rel} drifted from live truth (run --write)`);
      drift = true;
    }
  }
  if (drift) process.exit(1);
}

// Hard gate: overlay garnish never publishes as a base body.
if (overlayAsBase > 0) {
  console.error(`aep-placeholder-triage: FAIL ${overlayAsBase} station reads resolve an overlay garnish as the base body`);
  process.exit(1);
}
for (const r of stationReads) {
  if (!r.baseRead) {
    console.error(`aep-placeholder-triage: FAIL ${r.sector}/${r.station} resolves no base read`);
    process.exit(1);
  }
}
console.log(
  `aep-placeholder-triage: ok — ${metrics.stations_total} station reads `
  + `(${metrics.stations_base_plus_overlay} composed, ${metrics.stations_generic_only} generic-only, `
  + `${metrics.stations_gate} gates, ${metrics.stations_authored} authored), `
  + `census red ${metrics.census_red_aep}/${metrics.census_red_total} aep-attributable, `
  + `classes ${metrics.classes_red_aep}/${metrics.classes_nonaccepted} aep-attributable`,
);
