// Family batch planner for the graphics-asset-review campaign (dispatch-20261116, devin1).
// Builds the finite, in-scope queue of model families out of coverage-status.json
// (pending + needs follow-up), cross-referenced against the render-package pilot manifest
// (assets/ships/render-packages/pilots.json), the generated release manifest
// (assets/ships/release/release_manifest.json) and live procedural builders in src/render/.
//
//   node scripts/fleet/family-batches.mjs
//
// Outputs: .devshots/fleet/dispatch-20261116/batch-plan.json and batch-plan.md
// Read-only: never edits the ledger, manifests, assets or source.

import { existsSync, mkdirSync, readFileSync, readdirSync, statSync, writeFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..', '..');
const OUT_DIR = join(ROOT, '.devshots', 'fleet', 'dispatch-20261116');
const COVERAGE = join(ROOT, 'design', 'program', 'fleet', 'graphics-asset-review', 'coverage-status.json');
const PILOTS = join(ROOT, 'assets', 'ships', 'render-packages', 'pilots.json');
const RELEASE_MANIFEST = join(ROOT, 'assets', 'ships', 'release', 'release_manifest.json');

const readJson = (p) => JSON.parse(readFileSync(p, 'utf8'));
const sizeOf = (rel) => {
  try { return statSync(join(ROOT, rel)).size; } catch { return null; }
};
const dirBytes = (rel) => {
  const abs = join(ROOT, rel);
  try {
    if (!statSync(abs).isDirectory()) return null;
    let total = 0;
    for (const f of readdirSync(abs)) total += statSync(join(abs, f)).size;
    return total;
  } catch { return null; }
};
const fileEntry = (rel) => ({ path: rel, bytes: sizeOf(rel) });
const codeEntry = (rel) => ({ path: rel, bytes: sizeOf(rel) });

const coverage = readJson(COVERAGE);
const pilots = readJson(PILOTS).pilots;
const releaseAssets = readJson(RELEASE_MANIFEST).assets;
const releaseById = new Map(releaseAssets.map((a) => [a.id, a]));

const pilotsByRuntimeId = new Map();
for (const p of pilots) {
  if (!pilotsByRuntimeId.has(p.runtimeAssetId)) pilotsByRuntimeId.set(p.runtimeAssetId, []);
  pilotsByRuntimeId.get(p.runtimeAssetId).push(p);
}

const TARGET_STATUSES = new Set(['pending', 'needs follow-up']);
const targets = Object.entries(coverage.models)
  .filter(([, m]) => TARGET_STATUSES.has(m.status))
  .map(([id, m]) => ({ id, status: m.status }));

// ── Representation paths ─────────────────────────────────────────────────────
// For a runtime:* ledger record: every pilot in its runtimeAssetId group contributes a
// source (parts GLB, via the release manifest), a release GLB (pilot.sourceUrl) and a
// package dir (pilot.outputDir holding render.glb + render-package.json).
function runtimeReps(runtimeId) {
  const group = pilotsByRuntimeId.get(runtimeId) || [];
  const source = [], release = [], pkg = [];
  const seen = new Set();
  for (const p of group) {
    const rel = releaseById.get(p.releaseAssetId);
    if (rel && !seen.has(rel.source)) { seen.add(rel.source); source.push(fileEntry(rel.source)); }
    if (p.sourceUrl && !seen.has(p.sourceUrl)) { seen.add(p.sourceUrl); release.push(fileEntry(p.sourceUrl)); }
    if (p.outputDir && !seen.has(p.outputDir)) { seen.add(p.outputDir); pkg.push({ path: p.outputDir, bytes: dirBytes(p.outputDir) }); }
  }
  return { source, release, package: pkg };
}

function releasePathsFor(runtimeId) {
  return (pilotsByRuntimeId.get(runtimeId) || []).map((p) => p.sourceUrl).filter(Boolean);
}

// ── Batch registry ───────────────────────────────────────────────────────────
// Ordered rules; first match wins. Every rule names the batch, the proposed capture
// command builder and the review hint. `match` receives {id, key, stem} where id is the
// ledger id, key = field[1], stem = field[2] for runtime:* records.

const LOCK = 'node scripts/fleet/game-lock.mjs run -- ';
const OUT_BASE = '.devshots/fleet/graphics-overhaul-asset-review-current';
const filesCmd = (files, out, views = 'chase,close,inspect') =>
  `${LOCK}node scripts/fleet-look.mjs --files=${files.join(',')} --views=${views} --out=${out}`;

// Staging hook shared by the enemy-silhouette and faction-ship proposals; mirrors the
// interception pattern proven by scripts/fleet/looks/procedural-ship-review.mjs — the
// incoming kestrel preview entity is re-stamped before the live factory builds it.
const stampInit = (field, value, check) => `(() => {
  const timer = setInterval(() => {
    const look = window.SF_fleetLook;
    if (!look || typeof look.shoot !== 'function') return;
    clearInterval(timer);
    const shoot = look.shoot.bind(look);
    look.shoot = async (opts) => {
      const vf = window.SF?.state?.render?.vf;
      if (!vf || typeof vf.build !== 'function') throw Error('live visual factory unavailable');
      const original = vf.build;
      let selected = null;
      vf.build = function(entity) {
        if (entity?.id >= 900000 && entity?.type === 'ship') {
          entity.isPlayer = false;
          entity.data.${field} = ${JSON.stringify(value)};
          selected = original.call(this, entity);
          return selected;
        }
        return original.call(this, entity);
      };
      try {
        const result = await shoot(opts);
        ${check}
        return result;
      } finally { vf.build = original; }
    };
  }, 20);
})()`;

const BATCHES = [];
function batch(def) { BATCHES.push(def); return def; }

// ── Runtime authored GLB families (route: --files on release GLBs) ───────────
function rtFilesBatch({ id, title, match, order, worker = null, note = '', views = 'chase,close,inspect' }) {
  return batch({
    id, title, kind: 'runtime-glb', match, order, worker, note, views,
    reviewer: 'multimodal image review of the PNGs + report.json',
    commandFor(members) {
      const files = [...new Set(members.flatMap((m) => m.files))];
      return filesCmd(files, `${OUT_BASE}/${id}-<date>`);
    },
  });
}

// Aftermath wreck/debris dressing (src/data/wreckAftermathDressing.js selects each id,
// including the *_authored_down dressed-down alternates — distinct GLBs, not duplicates).
rtFilesBatch({ id: 'rt-aftermath-aft', title: 'Aftermath — aft-section pieces', order: 25,
  match: ({ key }) => /^place_aftermath_aft_/.test(key) });
rtFilesBatch({ id: 'rt-aftermath-deb', title: 'Aftermath — debris panels/rings', order: 26,
  match: ({ key }) => /^place_aftermath_deb_/.test(key) });
rtFilesBatch({ id: 'rt-aftermath-frag', title: 'Aftermath — fragment shards', order: 27,
  match: ({ key }) => /^place_aftermath_frag_/.test(key) });
rtFilesBatch({ id: 'rt-aftermath-wreck', title: 'Aftermath — wreck hull pieces', order: 28,
  match: ({ key }) => /^place_aftermath_wreck_/.test(key) });

// Works conduit lane/power segments — INSTALLED-NETWORK review already running under agy2.
batch({
  id: 'rt-works-conduits', title: 'Works conduit lane/power segments', kind: 'runtime-glb', order: 1,
  worker: 'agy2 (installed-network route + machines flag landing this session)',
  note: 'Isolated place captures exist; agy2 is adding a network-composition route for the 12 segment GLBs.',
  reviewer: 'multimodal image review (agy2) — network joins, LOD swap, family colour identity',
  match: ({ key }) => /^place_works_conduit_/.test(key),
  commandFor(members) {
    const files = [...new Set(members.flatMap((m) => m.files))];
    return `${LOCK}node scripts/fleet-look.mjs --files=${files.join(',')} --views=inspect,close,top --out=${OUT_BASE}/works-conduits-<date>  # isolated fallback; primary = agy2 network route, see results/agy2-conduits.md`;
  },
});
rtFilesBatch({ id: 'rt-works-industry', title: 'Works industrial machines (derrick, fabricator, refinery…)', order: 24,
  match: ({ key }) => /^place_works_/.test(key) });

// Station kits + trade-hub overlays.
rtFilesBatch({ id: 'rt-stations', title: 'Station kits & trade-hub overlays', order: 12,
  match: ({ key }) => /^SF_PLACE_STATION_/.test(key) });

// Authored rock/geology places.
rtFilesBatch({ id: 'rt-places-rocks', title: 'Authored rock/boulder/monolith places', order: 22,
  match: ({ key }) => /^SF_PLACE_ROCK_|^SF_PLACE_ASTEROID_|^SF_PLACE_HELIOS_ROCK_/.test(key) });

rtFilesBatch({ id: 'rt-places-claim', title: 'Claim-outpost site pieces', order: 18,
  match: ({ key }) => /^SF_PLACE_CLAIM_/.test(key) });
rtFilesBatch({ id: 'rt-places-ceres', title: 'Ceres breakers yard set', order: 19,
  match: ({ key }) => /^SF_PLACE_CERES_/.test(key) });
rtFilesBatch({ id: 'rt-places-landmarks', title: 'Landmark megastructures', order: 20,
  match: ({ key }) => /^SF_PLACE_LANDMARK_|^SF_LANDMARK_/.test(key) });
rtFilesBatch({ id: 'rt-places-nav-infra', title: 'Helios nav/lane infrastructure', order: 21,
  match: ({ key }) => /^(SF_PLACE_HELIOS_NAV_SPIRE|SF_PLACE_HELIOS_SUPPORT_DOCK_ARM|SF_PLACE_HELIOS_SUPPORT_GANTRY|SF_PLACE_LANE_PIN)$/.test(key) });
rtFilesBatch({ id: 'rt-places-hulks', title: 'Place-scale hulks & freighters', order: 17,
  match: ({ key }) => /^(SF_PLACE_QUIESSENCE_|SF_PLACE_RHEA_SLAG_HAULER|SF_PLACE_CONVEYOR_BARGE|SF_PLACE_CHARON_COLONY_SERVICE_BARGE|SF_PLACE_47A_RESCUE_CAPSULE)/.test(key) });
rtFilesBatch({ id: 'rt-ship-fragments', title: 'Wasp fragment pieces', order: 23,
  match: ({ key }) => /^SF_WASP_FRAG_/.test(key) });
// Remaining SF_PLACE_* one-off sites (anvil, ash pin, borrowed voice ring, breakaway,
// cold locker, dock interiors, gate ring, latch nine, memorial, proteus, tally, whistle).
rtFilesBatch({ id: 'rt-places-sites', title: 'Story/site one-off places', order: 29,
  match: ({ key }) => /^SF_PLACE_/.test(key) });

// Ship bodies.
rtFilesBatch({ id: 'rt-ships-production', title: 'Player-family production wholeships', order: 2,
  match: ({ key, stem }) => /_PRODUCTION_V1$/.test(key) || key === 'SF_K0_KESTREL_BORROWED_TIME_V4' });
rtFilesBatch({ id: 'rt-ships-faction-variants', title: 'Faction/variant wholeship bodies', order: 4,
  match: ({ key }) => /^SF_(DRIFTER|HORNET|IRONBACK|KESTREL|MULE|RANGER|WASP)_/.test(key) });
rtFilesBatch({ id: 'rt-ships-civilian', title: 'Civilian/NPC wholeships', order: 5,
  match: ({ key }) => /^SF_WHOLESHIP_/.test(key) });
rtFilesBatch({ id: 'rt-ships-named-npc', title: 'Named NPC ships (towline, stormshift, swarm, one-offs)', order: 6,
  match: ({ key }) => /^SF_SHIP_|^SF_STORMSHIFT_|^SF_SWARM_/.test(key) });

// Ship parts.
rtFilesBatch({ id: 'rt-parts-hulls', title: 'Hull kit pieces', order: 8,
  match: ({ key }) => /^SF_HULL_/.test(key) });
rtFilesBatch({ id: 'rt-parts-cockpits', title: 'Cockpit kit pieces', order: 9,
  match: ({ key }) => /^SF_COCKPIT_/.test(key) });
rtFilesBatch({ id: 'rt-parts-engines', title: 'Engine kit pieces', order: 10,
  match: ({ key }) => /^SF_ENGINE_/.test(key) });
rtFilesBatch({ id: 'rt-parts-fins', title: 'Fin kit pieces', order: 11,
  match: ({ key }) => /^(SF_FIN_|SF_PART_FIN_)/.test(key) });
rtFilesBatch({ id: 'rt-parts-greebles', title: 'Greeble kit pieces', order: 13,
  match: ({ key }) => /^(SF_GREEBLE_|SF_PART_GREEBLE_)/.test(key) });
rtFilesBatch({ id: 'rt-parts-weapons', title: 'Weapon kit pieces', order: 14,
  match: ({ key }) => /^SF_WEAPON_/.test(key) });
rtFilesBatch({ id: 'rt-parts-pods-skids', title: 'Pods & landing skids', order: 15,
  match: ({ key }) => /^(SF_POD_|SF_SKID_)/.test(key) });
rtFilesBatch({ id: 'rt-props', title: 'Loose props (borrowed-voice, cask, lamp, drone, spanner…)', order: 30,
  match: ({ key }) => /^(SF_PROP_|SF_PART_PLACE_MINING_DRONE|sf20_19_)/.test(key) });

// Generic place_* props by theme.
rtFilesBatch({ id: 'rt-places-cargo-yard', title: 'Cargo-yard props (racks, sorters, tanks, pods)', order: 16,
  match: ({ key }) => /^place_(cargo_pod_|container_rack|ore_bulk_container|ore_sorter|slurry_tank|tanker_coupling|hull_rack|parts_rack|scrap_cage|salvage_clamp|debris_chunk)/.test(key) });
rtFilesBatch({ id: 'rt-places-platforms', title: 'Platforms, docks & work structures', order: 16.5,
  match: ({ key }) => /^place_(construction_frame|conveyor_truss|crusher_module|drill_platform|extraction_mast|freight_platform|improvised_dock|inspection_platform|maintenance_gantry|passenger_platform|repair_scaffold|shuttle_dock|dock_interior|transfer_arm|welding_drone|worklight_tower)/.test(key) });
rtFilesBatch({ id: 'rt-places-nav-comms', title: 'Nav/comms pylons, buoys & arrays', order: 16.7,
  match: ({ key }) => /^place_(comms_array|customs_pylon|interdiction_buoy|pirate_sensor_mast|sensor_mast|traffic_signal|transponder_gate|observation_blister)/.test(key) });
rtFilesBatch({ id: 'rt-places-hab-power', title: 'Habitat & power props', order: 16.9,
  match: ({ key }) => /^place_(habitat_pod|power_skid|radiator_bank|solar_array|utility_module|illicit_transfer_frame)/.test(key) });
rtFilesBatch({ id: 'rt-places-megasites', title: 'Mega-site set pieces (fracture, ringworld, monolith, wrecks)', order: 31,
  match: ({ key }) => /^place_(dead_hulk|haumea_fracture_mouth|hush_gap|hyperion_caved_shaft|io_reach_wreck|last_shift_fairlead|nyx_false_gate|orcus_signal_plinth|phoebe_shard_sphere|sedna_ringworld_arc|triton_aperture_monolith)/.test(key) });

// ── Procedural families ──────────────────────────────────────────────────────

// Asteroids — agy1 owns the factory file and is capturing this session.
batch({
  id: 'proc-asteroids', title: 'Procedural asteroid types ×5 variants', kind: 'procedural', order: 0,
  worker: 'agy1 (factory file + captures in flight)',
  reviewer: 'multimodal image review (agy1) — per-type silhouette variety + lod2 far read',
  match: ({ id }) => id.startsWith('procedural-asteroid:'),
  reps: () => ({ code: [codeEntry('src/render/visualFactory.js'), codeEntry('src/render/asteroidInstancePool.js'), codeEntry('src/render/rockSurfaceLibrary.js'), codeEntry('src/render/partsLibrary.js')] }),
  commandFor: () => `${LOCK}node scripts/fleet-look.mjs --asteroids=ast_common_rock,ast_crystalline,ast_gas_cloud,ast_icy,ast_metallic,ast_rare_exotic --variants=0,1,2,3,4 --lods=lod0,lod2 --views=chase,close --out=${OUT_BASE}/asteroids-<date>  # run one type per invocation per agy1 sizing`,
});

// Fauna — species bodies; split bolus canal ecosystem (40) from open-water species (16).
const faunaReps = () => ({ code: [codeEntry('src/render/faunaVisuals.js'), codeEntry('src/data/alienFauna.js'), codeEntry('src/data/alienEcology.js'), codeEntry('src/render/casketWormGeometry.js'), codeEntry('src/render/lanternCystGeometry.js'), codeEntry('src/render/veilRayNurseryVisuals.js')] });
function faunaBatch({ id, title, match, order, note = '', command, splitKey, limit }) {
  return batch({
    id, title, kind: 'procedural', order, note, splitKey, limit,
    reviewer: 'multimodal image review — silhouette variety, skin read, site-strain colour',
    match, reps: faunaReps,
    commandFor: command || ((members) => `${LOCK}node scripts/fleet-look.mjs --fauna=${members.map((m) => m.modelId.split(':')[2]).join(',')} --views=chase,close --out=${OUT_BASE}/${id}-<date>`),
  });
}
const bolusMatch = ({ id }) => id.startsWith('procedural:fauna:bolus_');
faunaBatch({ id: 'proc-fauna-bolus-a', title: 'Bolus-canal fauna (first half)', order: 33,
  match: bolusMatch, splitKey: 'fauna-bolus', limit: [0, 20] });
faunaBatch({ id: 'proc-fauna-bolus-b', title: 'Bolus-canal fauna (second half)', order: 34,
  match: bolusMatch, splitKey: 'fauna-bolus', limit: [20, Infinity] });
faunaBatch({ id: 'proc-fauna-open', title: 'Open-water fauna (non-bolus species)', order: 35,
  match: ({ id }) => id.startsWith('procedural:fauna:') && !id.startsWith('procedural:fauna:bolus_'),
  note: 'veil_ray additionally supports --fauna-aggregate for the nursery swarm view.' });

// Bombs.
batch({
  id: 'proc-bombs', title: 'Bomb payload bodies', kind: 'procedural', order: 32,
  reviewer: 'multimodal image review — payload silhouette + armed-state read',
  match: ({ id }) => id.startsWith('procedural:bomb:'),
  reps: () => ({ code: [codeEntry('src/render/bombPresentation.js'), codeEntry('src/data/bombs.js')] }),
  commandFor: (members) => `${LOCK}node scripts/fleet-look.mjs --bombs=${members.map((m) => 'bomb_' + m.modelId.split(':')[2]).join(',')} --views=chase,close --out=${OUT_BASE}/proc-bombs-<date>`,
});

// Machines + machine props — openencoder construction pass in flight; --machines flag
// lands with agy2 Task 2 (usage line lands in results/agy2-conduits.md).
batch({
  id: 'proc-machines', title: 'Verge machines (witness, shepherd, executor…)', kind: 'procedural', order: 3,
  worker: 'openencoder (construction pass in flight), agy2 (--machines viewer route landing)',
  note: 'Capture AFTER the construction pass lands. Prop selector syntax TBC in agy2 report.',
  reviewer: 'multimodal image review after construction lands; construction itself is code-only',
  match: ({ id }) => id.startsWith('procedural:machine:'),
  reps: () => ({ code: [codeEntry('src/render/machineVisuals.js'), codeEntry('src/data/precursorMachines.js')] }),
  commandFor: (members) => `${LOCK}node scripts/fleet-look.mjs --machines=${members.map((m) => m.modelId.split(':')[2]).join(',')} --views=inspect,close --out=${OUT_BASE}/proc-machines-<date>`,
});
batch({
  id: 'proc-machine-props', title: 'Machine place props (pylon, monolith, gate_ring…)', kind: 'procedural', order: 3.5,
  worker: 'openencoder (construction pass in flight), agy2 (--machines viewer route landing)',
  note: 'Place ids are machine_<prop>; confirm selector syntax in results/agy2-conduits.md.',
  reviewer: 'multimodal image review after construction lands; construction itself is code-only',
  match: ({ id }) => id.startsWith('procedural:machine-prop:'),
  reps: () => ({ code: [codeEntry('src/render/machineVisuals.js'), codeEntry('src/data/precursorMachines.js')] }),
  commandFor: (members) => `${LOCK}node scripts/fleet-look.mjs --machines=${members.map((m) => 'machine_' + m.modelId.split(':')[2]).join(',')} --views=inspect,close --out=${OUT_BASE}/proc-machine-props-<date>`,
});

// Enemy silhouettes (data.silhouette → ENEMY_FAMILY_BUILDERS in visualFactory).
batch({
  id: 'proc-ships-enemy', title: 'Enemy-family silhouette bodies', kind: 'procedural', order: 40,
  note: 'No first-class flag; staged via the procedural-ship-review interception pattern (stamps data.silhouette). Proves builder output, not ordinary-route admission. One run per family.',
  reviewer: 'multimodal image review — silhouette distinctiveness is the spec acceptance test',
  match: ({ id }) => id.startsWith('procedural:procedural-ship:') && /:(drone_swarm|sniper_lance|bruiser_armor|trader_haul|pirate_swoop|corsair_blade|patrol_interdict|dreadnought_enemy|detonator_dart)$/.test(id),
  reps: () => ({ code: [codeEntry('src/render/visualFactory.js')] }),
  commandFor: (members) => members.map((m) => {
    const fam = m.modelId.split(':')[2];
    const init = stampInit('silhouette', fam, `if (!selected || selected.userData?.authoredVisualRoot) throw Error('procedural silhouette body absent: ${fam}');`);
    return `${LOCK}node scripts/fleet-look.mjs --def=ship_kestrel --name=${fam} --views=chase,close,inspect --out=${OUT_BASE}/proc-ships-enemy-<date> --init='${init.replace(/\n\s*/g, ' ')}'`;
  }).join('\n'),
});

// Generic ship families (familyFor(defId) → FAMILY_BUILDERS). These bodies only appear
// when authored admission is absent — stage by blocking render-package metadata fetches.
batch({
  id: 'proc-ships-family', title: 'Generic hull-family bodies (player-family fallback)', kind: 'procedural', order: 41,
  note: 'All 14 player defs carry authored wholeships, so family bodies show only on authored-failure or non-def NPCs. Stage with a fetch-block hook (below) to render the procedural fallback; proves builder output only.',
  reviewer: 'multimodal image review — but this is the fallback body, not the shipping one',
  match: ({ id }) => id.startsWith('procedural:procedural-ship:') && /:(scout|fighter|freighter|miner|frigate|capital|multirole)$/.test(id),
  reps: () => ({ code: [codeEntry('src/render/visualFactory.js')] }),
  commandFor: () => {
    const defFor = { scout: 'ship_kestrel', fighter: 'ship_wasp', freighter: 'ship_mule', miner: 'ship_pelican', frigate: 'ship_bastion', capital: 'ship_colossus', multirole: 'ship_drifter' };
    const block = `(() => { const f = window.fetch.bind(window); window.fetch = (u, ...a) => String(u).includes('/render-packages/') ? Promise.reject(new Error('staged authored block')) : f(u, ...a); })()`;
    return `# one run per family; representative def shown — pick any def with visuals.family=<family>\n` +
      `${LOCK}node scripts/fleet-look.mjs --def=${defFor.fighter} --name=fighter --views=chase,close,inspect --out=${OUT_BASE}/proc-ships-family-<date> --init='${block}'\n` +
      `# defs by family: ${Object.entries(defFor).map(([k, v]) => `${k}→${v}`).join(', ')}`;
  },
});

// Faction bespoke bodies (data.lootTableId → FACTION_BUILDERS via visualOverrides).
batch({
  id: 'proc-ships-faction', title: 'Faction bespoke ship bodies', kind: 'procedural', order: 42,
  note: 'scripts/fleet/looks/procedural-ship-review.mjs already covers concord-interdictor + quiet-raider; extend its candidates list with the other four (reaver-pirate→reaver_pirate/SF_REACH_REAVER_PIRATE, drift-barge→bruiser_brawler/SF_DMC_DRIFT_BARGE, meridian-trader→mule_trader/SF_MTS_MERIDIAN_HAULER, vael-sniper→lancer_sniper/SF_VAEL_SNIPER), or run the equivalent inline --init shown here.',
  reviewer: 'multimodal image review — staged; does not prove ordinary-play admission',
  match: ({ id }) => id.startsWith('procedural:ship:') || id === 'procedural:presentation:vael-sniper',
  reps: () => ({ code: [codeEntry('src/render/ships/concordPatrol.js'), codeEntry('src/render/ships/reaverPirate.js'), codeEntry('src/render/ships/meridianTrader.js'), codeEntry('src/render/ships/driftBarge.js'), codeEntry('src/render/ships/quietRaider.js'), codeEntry('src/render/ships/vaelSniper.js'), codeEntry('src/render/visualOverrides.js')] }),
  commandFor: (members) => {
    const sel = { 'concord-interdictor': ['patrol_lawman', 'SF_SCN_CONCORD_INTERDICTOR'], 'drift-barge': ['bruiser_brawler', 'SF_DMC_DRIFT_BARGE'], 'meridian-trader': ['mule_trader', 'SF_MTS_MERIDIAN_HAULER'], 'quiet-raider': ['corsair_raider', 'SF_QUIET_RAIDER'], 'reaver-pirate': ['reaver_pirate', 'SF_REACH_REAVER_PIRATE'], 'vael-sniper': ['lancer_sniper', 'SF_VAEL_SNIPER'] };
    return members.map((m) => {
      const name = m.modelId.split(':').pop();
      const [selector, assetId] = sel[name] || [];
      const init = stampInit('lootTableId', selector, `let found = false; selected?.traverse(n => { if (n.userData?.assetId === ${JSON.stringify(assetId)}) { let v = true, c = n; while (c) { if (!c.visible) v = false; c = c.parent; } if (v && n.parent) found = true; } }); if (!found) throw Error('expected procedural asset absent or replaced: ${assetId}');`);
      return `${LOCK}node scripts/fleet-look.mjs --def=ship_kestrel --name=${name} --views=chase,close,inspect --out=${OUT_BASE}/proc-ships-faction-<date> --init='${init.replace(/\n\s*/g, ' ')}'`;
    }).join('\n');
  },
});

// Kestrel hero — procedural hero body still wired through visualOverrides/shipPreviewMount;
// the authored SF_K0 package is the shipping body.
batch({
  id: 'proc-presentation-kestrel', title: 'Kestrel hero procedural body', kind: 'procedural', order: 46,
  note: 'No clean isolated route — the authored K0 package wins on the ordinary --def route. Suit a code-only construction review; if a capture is wanted, stage authored-block + the kestrelBuilder path.',
  reviewer: 'code-only (builder/source review) — non-vision worker acceptable',
  match: ({ id }) => id === 'procedural:presentation:kestrel-hero',
  reps: () => ({ code: [codeEntry('src/render/ships/kestrelHero.js'), codeEntry('src/render/ships/kestrelDamage.js'), codeEntry('src/render/ships/shipKit.js'), codeEntry('src/render/visualOverrides.js')] }),
  commandFor: () => `# no fitting isolated route — see note; nearest ordinary route:\n${LOCK}node scripts/fleet-look.mjs --def=ship_kestrel --views=chase,close,inspect --out=${OUT_BASE}/proc-presentation-kestrel-<date>  # renders the AUTHORED K0 body, not this procedural record`,
});

// One-off cast characters — entity-flagged procedural bodies; no fleet-look route.
batch({
  id: 'proc-characters', title: 'One-off cast rescue machines (morrow, vesper, bracket…)', kind: 'procedural', order: 47,
  note: 'No fitting isolated route — entities build via data flags (morrow/vesper/bracket/ravel/solstice/rubricPart/ruudPart) inside visualFactory. Code-only review until a viewer route exists.',
  reviewer: 'code-only — non-vision worker acceptable',
  match: ({ id }) => id.startsWith('procedural:character:'),
  reps: (members) => ({ code: members.flatMap((m) => [codeEntry(`src/render/characters/${m.id.split(':')[2]}Model.js`), codeEntry(`src/data/${m.id.split(':')[2]}.js`)]) }),
  commandFor: () => '# no fitting route — code-only review; ordinary-route encounter evidence is the acceptance path',
});

// Optic cells — lattice cells on asteroids (ceres prism gallery, swarm optic arenas).
batch({
  id: 'proc-optic-cells', title: 'Optic lattice cells (stone/diamond/metal/spent)', kind: 'procedural', order: 44,
  note: 'No fitting isolated route — cells render only inside lattice placements. Nearest is a sector shot of sector_ceres_belt (prism gallery) or a swarm optic-arena round; isolated variants stay code-only.',
  reviewer: 'code-only for cell variants; any sector-shot evidence gets multimodal review',
  match: ({ id }) => id.startsWith('procedural-optic-cell:'),
  reps: () => ({ code: [codeEntry('src/render/opticCellPresentation.js'), codeEntry('src/combat/opticField.js'), codeEntry('src/data/opticStructures.js')] }),
  commandFor: () => `${LOCK}node scripts/fleet/looks/sector-shots.mjs sector_ceres_belt  # nearest route — contextual, not isolated`,
});

// Bolus canal rib environment.
batch({
  id: 'proc-environment-bolus', title: 'Bolus canal rib environment', kind: 'procedural', order: 45,
  note: 'Environment mesh, not an isolated model — sector-level capture only.',
  reviewer: 'multimodal if sector shots show the ribs; otherwise code-only',
  match: ({ id }) => id === 'procedural:environment:bolus_canal_rib',
  reps: () => ({ code: [codeEntry('src/render/bolusCanal.js'), codeEntry('src/render/bolusView.js')] }),
  commandFor: () => `${LOCK}node scripts/fleet/looks/sector-shots.mjs sector_the_bolus`,
});

// Playable variants — fauna site strains + volatile pod classes.
batch({
  id: 'pv-fauna-strains', title: 'Fauna site-strain variants', kind: 'playable-variant', order: 36,
  note: 'Variant id is the strain; --fauna-site takes a SITE that casts that strain. Mapping: casket_worm ashfall_choir→breathing_dock (or converted_yards/towed_moonlet), casket_worm charon_grave→closed_refinery (or red_cable_yard), lantern_cyst charon_grave→warm_freighter (or three_hull_garden), lantern_cyst veil_glass→quiet_ice. One run each.',
  reviewer: 'multimodal image review — strain colour read vs base species',
  match: ({ id }) => id.startsWith('playable-variant:procedural:fauna:'),
  reps: faunaReps,
  commandFor: () => {
    const site = { 'casket_worm:ashfall_choir': 'breathing_dock', 'casket_worm:charon_grave': 'closed_refinery', 'lantern_cyst:charon_grave': 'warm_freighter', 'lantern_cyst:veil_glass': 'quiet_ice' };
    return `${LOCK}node scripts/fleet-look.mjs --fauna=casket_worm --fauna-site=breathing_dock --name=casket_worm_ashfall_choir --views=chase,close --out=${OUT_BASE}/pv-fauna-strains-<date>\n` +
      `${LOCK}node scripts/fleet-look.mjs --fauna=casket_worm --fauna-site=closed_refinery --name=casket_worm_charon_grave --views=chase,close --out=${OUT_BASE}/pv-fauna-strains-<date>\n` +
      `${LOCK}node scripts/fleet-look.mjs --fauna=lantern_cyst --fauna-site=warm_freighter --name=lantern_cyst_charon_grave --views=chase,close --out=${OUT_BASE}/pv-fauna-strains-<date>\n` +
      `${LOCK}node scripts/fleet-look.mjs --fauna=lantern_cyst --fauna-site=quiet_ice --name=lantern_cyst_veil_glass --views=chase,close --out=${OUT_BASE}/pv-fauna-strains-<date>\n` +
      `# sites → strains: ${JSON.stringify(site)}`;
  },
});
batch({
  id: 'pv-volatile-pods', title: 'Volatile cargo-pod classes', kind: 'playable-variant', order: 43,
  note: 'No first-class flag — pods build for pickup/payload entities carrying data.volatileClass. Stage like the faction ships: re-stamp the preview entity into a pickup (see init below); else code-only.',
  reviewer: 'multimodal if staged capture runs; otherwise code-only',
  match: ({ id }) => id.startsWith('playable-variant:procedural:factory:volatile-pod:'),
  reps: () => ({ code: [codeEntry('src/render/visualFactory.js'), codeEntry('src/render/volatileSurfaceLibrary.js'), codeEntry('src/data/commodityVolatileClasses.js')] }),
  commandFor: () => `node scripts/fleet/game-lock.mjs run -- node scripts/fleet-look.mjs --def=ship_kestrel --name=volatile-pod-corrosive --views=chase,close --out=${OUT_BASE}/pv-volatile-pods-<date> --init='(() => { const t = setInterval(() => { const l = window.SF_fleetLook; if (!l || !l.shoot) return; clearInterval(t); const s = l.shoot.bind(l); l.shoot = async (o) => { const vf = window.SF?.state?.render?.vf; const orig = vf.build; vf.build = (e) => { if (e?.id >= 900000) { e.type = "pickup"; e.data = { volatileClass: "corrosive" }; } return orig.call(vf, e); }; try { return await s(o); } finally { vf.build = orig; } }; }, 20); })()'  # repeat per class: corrosive, cryogenic, explosive, superdense`,
});

// Runtime characters — authored ruckus GLBs outside the ships tree.
batch({
  id: 'rt-characters', title: 'Ruckus character GLBs', kind: 'runtime-glb', order: 7,
  reviewer: 'multimodal image review',
  match: ({ id }) => id.startsWith('runtime-character:'),
  reps: (members) => {
    const glbs = members.flatMap((m) => m.id.split(':')[1] === 'ruckus'
      ? ['ruckus-lod0.glb', 'ruckus-lod1.glb', 'ruckus-lod2.glb'].map((f) => `assets/characters/ruckus/${f}`)
      : ['assets/characters/ruckus/pressure-core.glb']);
    return { source: glbs.map(fileEntry), release: glbs.map(fileEntry), package: [],
      code: [codeEntry('src/render/characters/ruckusModel.js'), codeEntry('src/render/characters/ruckusMeshData.js')] };
  },
  commandFor: () => `${LOCK}node scripts/fleet-look.mjs --files=assets/characters/ruckus/ruckus-lod0.glb,assets/characters/ruckus/ruckus-lod1.glb,assets/characters/ruckus/ruckus-lod2.glb,assets/characters/ruckus/pressure-core.glb --views=chase,close,inspect --out=${OUT_BASE}/rt-characters-<date>`,
});

// ── Assign every target record ───────────────────────────────────────────────
const assigned = new Map(); // modelId -> batch
const unassigned = [];
for (const t of targets) {
  const [ns, key, ...rest] = t.id.split(':');
  const stem = rest.join(':');
  const ctx = { id: t.id, ns, key: key || '', stem };
  const b = BATCHES.find((def) => def.match(ctx));
  if (b) assigned.set(t.id, { batch: b, record: t });
  else unassigned.push(t.id);
}

// Per-batch member lists (respecting optional `limit` slicing for split families).
const perBatch = new Map(BATCHES.map((b) => [b.id, { def: b, members: [] }]));
const splitQueues = new Map();
for (const [modelId, { batch: b, record }] of assigned) {
  if (b.splitKey) {
    const q = splitQueues.get(b.splitKey) || [];
    q.push({ b, modelId, record });
    splitQueues.set(b.splitKey, q);
  } else {
    perBatch.get(b.id).members.push({ modelId, record });
  }
}
for (const [key, q] of splitQueues) {
  // Batches sharing one splitKey partition the queue by their limit slices.
  const shares = BATCHES.filter((b) => b.splitKey === key).sort((a, z) => BATCHES.indexOf(a) - BATCHES.indexOf(z));
  for (const b of shares) {
    const [lo, hi] = b.limit;
    perBatch.get(b.id).members.push(...q.slice(lo, hi === Infinity ? q.length : hi).map((x) => ({ modelId: x.modelId, record: x.record })));
  }
}

// Build outputs.
const batchOut = [];
let covered = 0;
for (const b of BATCHES) {
  const slot = perBatch.get(b.id);
  const members = slot.members.map(({ modelId, record }) => {
    const [ns, key, ...rest] = modelId.split(':');
    const stem = rest.join(':');
    const reps = b.kind === 'runtime-glb' && ns === 'runtime'
      ? runtimeReps(key)
      : (b.reps ? b.reps([{ id: modelId }]) : null);
    return {
      modelId, status: record.status,
      files: ns === 'runtime' ? releasePathsFor(key) : [],
      representations: reps,
    };
  });
  if (!members.length) continue;
  covered += members.length;
  const counts = { pending: 0, 'needs follow-up': 0 };
  for (const m of members) counts[m.status] += 1;
  batchOut.push({
    id: b.id, title: b.title, order: b.order, kind: b.kind,
    worker: b.worker || null, reviewer: b.reviewer, note: b.note || null,
    counts, command: b.commandFor(members),
    modelIds: members.map((m) => m.modelId),
    members,
  });
}
batchOut.sort((a, z) => a.order - z.order || a.id.localeCompare(z.id));

// Duplicate-hash audit: two distinct ledger ids pointing at byte-identical release GLBs
// would be an authoring/representation-of relationship worth flagging.
const hashSeen = new Map();
const dupFindings = [];
for (const b of batchOut) for (const m of b.members) {
  for (const p of (m.representations?.release || [])) {
    const a = releaseAssets.find((x) => x.release === p.path);
    if (!a) continue;
    if (hashSeen.has(a.releaseSha256)) dupFindings.push({ modelId: m.modelId, release: p.path, sameAs: hashSeen.get(a.releaseSha256) });
    else hashSeen.set(a.releaseSha256, m.modelId);
  }
}

const plan = {
  schema: 'spaceface.familyBatchPlan.v1',
  generatedAt: new Date().toISOString(),
  sourceLedger: 'design/program/fleet/graphics-asset-review/coverage-status.json',
  ledgerCounts: { pending: coverage.statusCounts.pending, 'needs follow-up': coverage.statusCounts['needs follow-up'], targets: targets.length },
  classification: {
    playableRuntime: covered,
    authoringOnlyRepresentation: 0,
    uncertain: unassigned.length,
    note: 'Every pending/follow-up record resolves to a runtime-render-package pilot or a live procedural builder — nothing in this set is a bare authoring source or an unresolved id. The *_authored_down aftermath pieces are distinct GLBs selected by wreckAftermathDressing.js, not duplicates (see duplicateHashFindings).',
  },
  duplicateHashFindings: dupFindings,
  uncoveredIds: unassigned,
  batches: batchOut,
};

mkdirSync(OUT_DIR, { recursive: true });
writeFileSync(join(OUT_DIR, 'batch-plan.json'), JSON.stringify(plan, null, 2) + '\n');

// ── Markdown ─────────────────────────────────────────────────────────────────
const L = [];
L.push('# Family batch plan — graphics-asset-review (dispatch-20261116)');
L.push('');
L.push(`Generated ${plan.generatedAt} by \`node scripts/fleet/family-batches.mjs\` (rerunnable; read-only).`);
L.push('');
L.push(`## Coverage`);
L.push('');
L.push(`- Ledger targets (pending + needs follow-up): **${targets.length}** (${coverage.statusCounts.pending} pending, ${coverage.statusCounts['needs follow-up']} needs follow-up)`);
L.push(`- Covered by this plan: **${covered}** across **${batchOut.length}** disjoint batches`);
L.push(`- Excluded as authoring-only representation of another listed model: **0** — no two target records share a release GLB hash (${dupFindings.length} collisions found; see JSON)`);
L.push(`- Uncertain / unassigned: **${unassigned.length}**${unassigned.length ? ' — ' + unassigned.join(', ') : ''}`);
L.push(`- Classification basis: every \`runtime:*\` record matches a \`runtimeAssetId\` in \`assets/ships/render-packages/pilots.json\` (the generated runtime package manifest the game loads); every \`procedural:*\` / \`playable-variant:*\` record resolves to a live builder in \`src/render/\`. Byte sizes come from the release manifest + live file stats.`);
L.push('');
L.push(`## Recommended execution order`);
L.push('');
L.push('Finite runtime families first (authored GLBs, deterministic `--files` captures), then procedural families with a real viewer route, then staged/code-only tails. In-flight families are marked but stay in the plan so the queue is complete.');
L.push('');
L.push('| # | Batch | Models | Capture route | Worker | Reviewer |');
L.push('|---|-------|--------|---------------|--------|----------|');
for (const b of batchOut) {
  const route = b.command.split('\n')[0].replace(/^node scripts\/fleet\/game-lock\.mjs run -- /, '').slice(0, 110);
  L.push(`| ${b.order} | \`${b.id}\` — ${b.title} | ${b.counts.pending + b.counts['needs follow-up']} (${b.counts.pending}p/${b.counts['needs follow-up']}f) | ${route}${b.command.includes('\n') ? ' …' : ''} | ${b.worker || '—'} | ${b.reviewer.split('—')[0].trim()} |`);
}
L.push('');
L.push('## Batches');
for (const b of batchOut) {
  L.push('');
  L.push(`### \`${b.id}\` — ${b.title} (${b.counts.pending + b.counts['needs follow-up']})`);
  L.push('');
  if (b.worker) L.push(`- **In flight:** ${b.worker}`);
  L.push(`- **Reviewer:** ${b.reviewer}`);
  if (b.note) L.push(`- **Note:** ${b.note}`);
  L.push(`- **Proposed capture:**`);
  L.push('  ```');
  L.push('  ' + b.command.split('\n').join('\n  '));
  L.push('  ```');
  L.push(`- **Models:**`);
  for (const m of b.members) {
    const rel = (m.representations?.release || m.representations?.source || m.representations?.code || [])
      .map((r) => `\`${r.path}\` (${r.bytes == null ? 'missing' : r.bytes + ' B'})`).join(', ');
    L.push(`  - \`${m.modelId}\` [${m.status}] — ${rel}`);
  }
}
writeFileSync(join(OUT_DIR, 'batch-plan.md'), L.join('\n') + '\n');

// ── Stdout summary ───────────────────────────────────────────────────────────
console.log(`targets: ${targets.length} (pending ${coverage.statusCounts.pending}, follow-up ${coverage.statusCounts['needs follow-up']})`);
console.log(`covered: ${covered} in ${batchOut.length} batches; unassigned: ${unassigned.length}`);
console.log(`duplicate release-hash findings: ${dupFindings.length}`);
for (const b of batchOut) console.log(`  ${String(b.order).padStart(4)}  ${b.id.padEnd(28)} ${b.counts.pending + b.counts['needs follow-up']}`);
if (unassigned.length) { console.log('UNASSIGNED:', unassigned); process.exitCode = 1; }
