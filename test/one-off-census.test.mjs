// W-ONEOFFS (build_map.md row 505, §34.3) — the one-off census.
//
// Every authored one-off maps to a SECTOR, a BOOK window and a CHART entry
// (src/data/oneOffCast.js). This census fails loudly, listing every offender, when
//   * any one-off is missing any of the three mappings,
//   * any one-off's authored sectors drift from the code that owns it (a renamed sector,
//     an encounter re-gated, a berth moved),
//   * any chart ref stops resolving on its real surface (encounter id, system name in the
//     authoritative manifest, site id, station board, lane contact),
//   * or any named sector ends up with no resident — a resident counting both the cast
//     (someone) and the texture one-offs of worldOneOffs.js (something), because
//     "every sector has someone in it" reads both.
import test from 'node:test';
import assert from 'node:assert/strict';
import { existsSync, readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';

import {
  ONE_OFF_CAST,
  ONE_OFF_CHART_KINDS,
  oneOffHomeSectorIds,
  oneOffResidentsBySector,
} from '../src/data/oneOffCast.js';
import { WORLD_ONE_OFFS, HELIOS_ROPE_CACHE } from '../src/data/worldOneOffs.js';
import { SECTORS } from '../src/data/sectors.js';
import { ENCOUNTERS } from '../src/data/encounters/index.generated.js';
import { NAMED_LANE_CONTACTS } from '../src/data/laneContacts.js';
import { ALIEN_SITES } from '../src/data/alienEcology.js';
import { PLANET_SITE } from '../src/data/planets.js';
import { LAST_SHIFT } from '../src/data/lastShift.js';
import { WRECK_COURT_ENTRY_CASE, caseDef } from '../src/data/wreckCourt/index.js';
import {
  PRODUCTION_INIT_ORDER,
  PRODUCTION_UPDATE_ORDER,
} from '../src/runtime/authoritativeSystemManifest.js';

// The authoritative sector each implemented one-off is authored against in code. The census
// pins the cast table to these sources: move a character, re-gate an encounter or re-berth the
// sun, and the census names the drift instead of silently mapping a dead home.
import { MORROW } from '../src/data/morrow.js';
import { VESPER } from '../src/data/vesper.js';
import { BRACKET } from '../src/data/bracket.js';
import { RUCKUS } from '../src/data/ruckus.js';
import { RUBRIC } from '../src/data/rubric.js';
import { SOLSTICE } from '../src/data/solstice.js';
import { RAVEL } from '../src/data/ravel.js';
import { RUUD } from '../src/data/ruud.js';
import { TALLY_THREE } from '../src/data/tallyThree.js';
import { RED_KITE } from '../src/data/redKite.js';
import { SABLE_VENN } from '../src/data/sableVenn.js';
import { ILEX_ARK } from '../src/data/ilexArk.js';
import { SECOND_RINSE } from '../src/data/secondRinse.js';
import { WAKE_HANDOFF } from '../src/data/wakeHandoff.js';
import { BORROWED_SUN_BERTHS } from '../src/data/borrowedSun.js';
import { BORROWED_VOICE } from '../src/data/borrowedVoice.js';
import { LAST_ARGUMENT } from '../src/data/lastArgument.js';
import { PALLET_JACK } from '../src/data/palletJack.js';
import { KILNBACK } from '../src/data/kilnback.js';
import { MOTHLIGHT } from '../src/data/mothlight.js';
import { SCISSORWAKE } from '../src/data/scissorwake.js';
import { DOCKET } from '../src/data/docket.js';
import { TARE } from '../src/data/tare.js';
import { LAMPLIGHTER } from '../src/data/lamplighter.js';

const SECTOR_BY_ID = new Map(SECTORS.map((s) => [s.id, s]));
const LIVE_SYSTEM_IDS = new Set([...PRODUCTION_INIT_ORDER, ...PRODUCTION_UPDATE_ORDER]);
const SYSTEMS_DIR = fileURLToPath(new URL('../src/systems/', import.meta.url));
const CAST_BY_ID = new Map(ONE_OFF_CAST.map((o) => [o.id, o]));
const IMPLEMENTED = ONE_OFF_CAST.filter((o) => o.implemented !== false);

const sameSet = (a, b) => a.length === b.length && a.every((x) => b.includes(x));

test('the cast is the size the row promises: ~35 authored one-offs', () => {
  assert.ok(IMPLEMENTED.length >= 30,
    `expected ~35 authored one-offs, found ${IMPLEMENTED.length} implemented census rows`);
  const ids = ONE_OFF_CAST.map((o) => o.id);
  assert.equal(new Set(ids).size, ids.length, 'census ids are unique');
  for (const oneOff of ONE_OFF_CAST) {
    assert.ok(oneOff.name && oneOff.name.length > 3, `${oneOff.id} needs a name a chart can print`);
  }
});

test('every one-off maps to a real sector', () => {
  const homeless = [];
  for (const oneOff of ONE_OFF_CAST) {
    const homes = oneOffHomeSectorIds(oneOff, SECTORS);
    if (!(homes.length >= 1)) {
      homeless.push(`${oneOff.id}: no sector mapping at all`);
      continue;
    }
    for (const sectorId of homes) {
      const sector = SECTOR_BY_ID.get(sectorId);
      if (!sector) {
        homeless.push(`${oneOff.id}: unknown sector ${sectorId}`);
      } else if (sector.interiorHost) {
        homeless.push(`${oneOff.id}: ${sectorId} is an interior host — it materializes its own volume`);
      }
    }
    // A fixed home list must be authored, not left null — that is the census' whole point.
    if (oneOff.sectorIds == null && oneOff.reach == null) {
      homeless.push(`${oneOff.id}: neither sectorIds nor reach authored`);
    }
  }
  assert.deepEqual(homeless, [], 'one-offs with no sector:\n' + homeless.join('\n'));
});

test('every one-off maps to a Book window in the campaign script', () => {
  const unbooked = [];
  for (const oneOff of ONE_OFF_CAST) {
    const books = oneOff.books;
    if (!books || !Number.isInteger(books.from) || !Number.isInteger(books.to)) {
      unbooked.push(`${oneOff.id}: no books window`);
    } else if (books.from < 0 || books.to > 7 || books.from > books.to) {
      unbooked.push(`${oneOff.id}: books ${books.from}–${books.to} is outside B0–B7 or inverted`);
    }
  }
  assert.deepEqual(unbooked, [], 'one-offs with no Book window:\n' + unbooked.join('\n'));
});

test('every one-off maps to a chart entry on a real surface', () => {
  const offChart = [];
  const stationsIn = (sectorId) => (SECTOR_BY_ID.get(sectorId)?.stations || []).map((s) => s.id);
  const siteIds = new Set([
    ...Object.values(ALIEN_SITES).map((s) => s.siteId),
    PLANET_SITE.id,
    LAST_SHIFT.siteId,
  ]);
  for (const oneOff of ONE_OFF_CAST) {
    const chart = oneOff.chart;
    if (!chart || !ONE_OFF_CHART_KINDS.includes(chart.kind)) {
      offChart.push(`${oneOff.id}: no chart mapping (kind ${chart && chart.kind})`);
      continue;
    }
    if (oneOff.implemented === false) {
      // Planned residents carry an authored intent, not a surface to resolve yet.
      if (chart.kind !== 'planned') {
        offChart.push(`${oneOff.id}: unimplemented but claims chart surface ${chart.kind}`);
      }
      continue;
    }
    switch (chart.kind) {
      case 'contact': {
        const via = chart.presentVia || chart.ref;
        assert.equal(typeof chart.ref, 'string', `${oneOff.id}: contact chart needs a ref`);
        if (!LIVE_SYSTEM_IDS.has(via)) {
          offChart.push(`${oneOff.id}: contact ${chart.ref} is not live under '${via}' in the authoritative manifest`);
        } else if (!existsSync(`${SYSTEMS_DIR}${chart.ref}.js`)
          && via === chart.ref) {
          offChart.push(`${oneOff.id}: src/systems/${chart.ref}.js is missing`);
        }
        break;
      }
      case 'encounter':
        if (!ENCOUNTERS[chart.ref]) offChart.push(`${oneOff.id}: encounter ${chart.ref} is not in the catalog`);
        break;
      case 'site':
        if (!siteIds.has(chart.ref)) offChart.push(`${oneOff.id}: site ${chart.ref} is not an authored chart site`);
        if (chart.presentVia && !LIVE_SYSTEM_IDS.has(chart.presentVia)) {
          offChart.push(`${oneOff.id}: site ${chart.ref} has no live owner ('${chart.presentVia}' not in the manifest)`);
        }
        break;
      case 'board':
        if (chart.ref === 'wreckCourt') {
          if (!caseDef(WRECK_COURT_ENTRY_CASE)) offChart.push('wreck_court: the docket lost its entry case');
        } else if (!oneOffHomeSectorIds(oneOff, SECTORS).some((sid) => stationsIn(sid).includes(chart.ref))) {
          offChart.push(`${oneOff.id}: board station ${chart.ref} is not in any of its home sectors`);
        }
        break;
      case 'traffic':
        if (!NAMED_LANE_CONTACTS.some((c) => c.id === chart.ref)) {
          offChart.push(`${oneOff.id}: lane contact ${chart.ref} is not in NAMED_LANE_CONTACTS`);
        }
        break;
      default:
        offChart.push(`${oneOff.id}: implemented one-off cannot claim chart kind 'planned'`);
    }
  }
  assert.deepEqual(offChart, [], 'one-offs with no chart entry:\n' + offChart.join('\n'));
});

test('the census agrees with the code about where each one-off lives', () => {
  // Encounters carry their home in gates.sectorIds; the cast table must not drift from it.
  const drift = [];
  for (const id of ['blind_welder', 'eighth_bell', 'runaway_kiln', 'two_ships_one_mistake',
    'drift_auction', 'pallet_jack', 'kilnback', 'mothlight']) {
    const oneOff = CAST_BY_ID.get(id);
    const gates = ENCOUNTERS[oneOff.chart.ref] && ENCOUNTERS[oneOff.chart.ref].gates;
    const gated = (gates && gates.sectorIds) || [];
    if (!sameSet([...gated].sort(), [...oneOff.sectorIds].sort())) {
      drift.push(`${id}: census ${oneOff.sectorIds} vs encounter gates ${gated}`);
    }
  }
  // The roaming gates match their authored reach rules, not a pinned sector list.
  const scissorGates = ENCOUNTERS.scissorwake_intro.gates;
  const scissor = CAST_BY_ID.get('scissorwake');
  assert.equal(scissor.reach.minSectorTier, scissorGates.minSectorTier, 'scissorwake tier gate');
  assert.equal(scissor.reach.maxSecurity, scissorGates.maxSecurity, 'scissorwake security gate');
  assert.ok(scissorGates.storyBeatMin >= 1, 'scissorwake does not roam before the first beat');
  assert.ok(oneOffHomeSectorIds(scissor, SECTORS).length >= 3,
    'scissorwake\'s reach must cover at least a few outlaw lanes');
  assert.equal(scissor.chart.ref, SCISSORWAKE.encounterId,
    'the census points at the encounter the cutter actually registers');
  // Multi-sector residents pin both ends of their route.
  assert.ok(sameSet(CAST_BY_ID.get('last_argument').sectorIds, [...LAST_ARGUMENT.sectors].sort()),
    'last_argument sectors');
  const pallet = CAST_BY_ID.get('pallet_jack');
  assert.ok(sameSet(pallet.sectorIds, [...PALLET_JACK.sectors].sort()), 'pallet_jack sectors');
  const ilex = CAST_BY_ID.get('ilex_ark');
  assert.ok(sameSet(ilex.sectorIds,
    [ILEX_ARK.originSectorId, ILEX_ARK.destinationSectorId].sort()), 'ilex_ark route sectors');
  const sun = CAST_BY_ID.get('borrowed_sun');
  assert.ok(sameSet(sun.sectorIds, [...new Set(BORROWED_SUN_BERTHS.map((b) => b.sectorId))].sort()),
    'borrowed_sun berths');

  const EXPECTED = {
    morrow: [MORROW.sectorId],
    vesper: [VESPER.sectorId],
    bracket: [BRACKET.sectorId],
    ruckus: [RUCKUS.sectorId],
    rubric: [RUBRIC.sectorId],
    solstice: [SOLSTICE.sectorId],
    ravel: [RAVEL.sectorId],
    hook_left: [RUUD.sectorId],
    tally_three: [TALLY_THREE.sectorId],
    red_kite: [RED_KITE.sectorId],
    sable_venn: [SABLE_VENN.sectorId],
    last_shift: [LAST_SHIFT.sectorId],
    second_rinse: [SECOND_RINSE.sectorId],
    wake_handoff: [WAKE_HANDOFF.sectorId],
    borrowed_voice: [BORROWED_VOICE.sectorId],
    stormshift: [PLANET_SITE.sectorId],
    // The thief is bound to the Candle Fleet cache pod — its sector is his sector.
    memorial_thief: [HELIOS_ROPE_CACHE.sectorId],
    kilnback: [KILNBACK.sectorId],
    mothlight: [MOTHLIGHT.sectorId],
    docket: [DOCKET.sectorId],
    tare: [TARE.sectorId],
    lamplighter: [LAMPLIGHTER.sectorId],
  };
  for (const [id, sectorIds] of Object.entries(EXPECTED)) {
    const oneOff = CAST_BY_ID.get(id);
    assert.ok(oneOff, `census is missing ${id}`);
    assert.ok(sameSet([...oneOff.sectorIds].sort(), [...sectorIds].sort()),
      `${id}: census ${oneOff.sectorIds} vs code ${sectorIds}`);
  }
  const courier = NAMED_LANE_CONTACTS.find((c) => c.id === 'lane_cinder_run_courier');
  assert.ok(sameSet(CAST_BY_ID.get('cinder_courier').sectorIds, [...courier.sectorIds].sort()),
    'the courier lives where her contact fixture does');
  // Latch Nine serves at the Tethys hub — its census sector is the service's sector. The pin is
  // a source read because the service id is authored inline, not exported as data.
  const latchSource = readFileSync(
    fileURLToPath(new URL('../src/data/latchNine.js', import.meta.url)), 'utf8');
  assert.match(latchSource, /station_tethys/, 'latch nine still serves station_tethys');
  assert.match(latchSource, /sector_tethys_junction/, 'latch nine still lives in Tethys Junction');
  const tethysStations = (SECTOR_BY_ID.get('sector_tethys_junction').stations || []).map((s) => s.id);
  assert.ok(tethysStations.includes('station_tethys'), 'station_tethys exists in Tethys Junction');
  assert.ok(oneOffHomeSectorIds(CAST_BY_ID.get('wreck_court'), SECTORS).length
    === SECTORS.filter((s) => !s.interiorHost).length,
    'the wreck court can convene in any named sector');
  assert.deepEqual(drift, [], 'cast/census sector drift:\n' + drift.join('\n'));
});

test('every named sector has a resident', () => {
  // A resident is a cast one-off (someone) or a texture one-off (something placed) — either is
  // enough for "every sector has someone in it". Interior hosts are their own volume.
  const residents = oneOffResidentsBySector(ONE_OFF_CAST, SECTORS);
  const textureSectors = new Set([
    ...WORLD_ONE_OFFS.map((o) => o.sectorId),
    HELIOS_ROPE_CACHE.sectorId,
  ]);
  const empty = [];
  for (const sector of SECTORS) {
    if (sector.interiorHost) continue;
    const castHere = residents.get(sector.id) || [];
    const textureHere = textureSectors.has(sector.id) ? 1 : 0;
    if (castHere.length + textureHere < 1) empty.push(sector.id);
  }
  assert.deepEqual(empty, [], 'named sectors with no resident one-off:\n' + empty.join('\n'));

  // The stronger clause: the sectors the bible already wrote machine-people into really do
  // have a SOMEONE (cast), not only a something — and the twelve Orphaned Shift sectors are
  // claimed by authored rows, not left to inference.
  const castHome = (oneOff) => oneOffHomeSectorIds(oneOff, SECTORS);
  const SOMEONE_SECTORS = new Map();
  for (const oneOff of ONE_OFF_CAST) {
    for (const sid of castHome(oneOff)) {
      if (!SOMEONE_SECTORS.has(sid)) SOMEONE_SECTORS.set(sid, []);
      SOMEONE_SECTORS.get(sid).push(oneOff.id);
    }
  }
  const EXPECTED_RESIDENT_SECTORS = [
    'sector_helios_prime', 'sector_ceres_belt', 'sector_tethys_junction', 'sector_vesta_forge',
    'sector_pallas_drift', 'sector_io_reach', 'sector_charon_expanse', 'sector_sker_haven',
    'sector_ashfall_reach',
  ];
  for (const sid of EXPECTED_RESIDENT_SECTORS) {
    assert.ok((SOMEONE_SECTORS.get(sid) || []).length >= 1,
      `${sid} has no cast resident`);
  }
  const ORPHANED_SHIFT_SECTORS = {
    tare: 'sector_dione_lane', docket: 'sector_io_reach', lamplighter: 'sector_sedna_dark',
    shepherd_12: 'sector_orcus_shadow', quill: 'sector_triton_wake', holdfast: 'sector_haumea_rift',
    bouncer: 'sector_sker_haven', receipt: 'sector_kepler_scar', mop: 'sector_nyx_march',
    bellhop: 'sector_phoebe_echo', gravedigger: 'sector_eunomia_gulf', tallyho: 'sector_rhea_cinder',
  };
  for (const [id, sid] of Object.entries(ORPHANED_SHIFT_SECTORS)) {
    const oneOff = CAST_BY_ID.get(id);
    assert.ok(oneOff, `the census lost the authored Orphaned Shift resident ${id}`);
    assert.deepEqual(oneOff.sectorIds, [sid], `${id} must live where 03 §4.3 put it: ${sid}`);
    if (id === 'docket' || id === 'bouncer' || id === 'receipt' || id === 'mop' || id === 'tallyho' || id === 'tare' || id === 'lamplighter') {
      // Row 506's shipped members: implemented, on the contact surface, live in the
      // authoritative manifest — the chart-surface check above resolves them.
      assert.equal(oneOff.implemented, true, `${id} shipped its encounter and is implemented`);
      continue;
    }
    assert.equal(oneOff.implemented, false,
      `${id} is row 506's to ship — do not mark it implemented ahead of the encounter`);
  }
  // Latch Nine's census row stays honest about which surface it rides: a station service.
  assert.equal(CAST_BY_ID.get('latch_nine').chart.kind, 'contact');
});
