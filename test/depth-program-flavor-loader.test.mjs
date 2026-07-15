import test from 'node:test';
import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import { mkdtempSync, readFileSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';

import {
  FLAVOR_MODULES,
  FLAVOR_PACKS,
  FLAVOR_SOURCE_BY_REF,
  FLAVOR_TEXT_ENTRIES,
} from '../src/data/flavor/index.generated.js';
import {
  buildFlavorCatalog,
  buildFlavorSourceIndex,
  defineFlavorPack,
} from '../src/data/flavor/catalog.js';
import { collectBlurbVoiceEntries } from '../scripts/lib/blurbVoiceSources.mjs';

const ROOT = fileURLToPath(new URL('../', import.meta.url));
const UNIQUE_LOOT = JSON.parse(readFileSync(
  new URL('../design/depth-program/unique-loot-reservations.json', import.meta.url),
  'utf8',
));

const PACK_IDS = [
  'wreck_rumors',
  'ad_board',
  'graffiti',
  'band',
  'roaming_events',
  'quiessence',
  'hush',
  'landmark_lore',
  'set_piece_missions',
];

const RUMOR_SOURCE_REFS = new Map([
  ['D1', ['news.losses_in_the_veil', 'loss.vigilant']],
  ['D2', ['comms.ironsing_gun']],
  ['D3', ['campaign.lighthouse_reveal']],
  ['D4', ['mission.the_lost_coils']],
  ['D5', ['bark.singing_bell']],
  ['D6', ['news.hand_that_fed_the_gulf']],
  ['D7', ['bar.sker.nestbreaker']],
  ['D8', ['bar.rift_observatory.deepsurvey']],
  ['D9', ['bar.io_mercenary.smokesong']],
  ['D10', ['news.tragedy_at_helios']],
  ['D11', ['bar.helios_meridian.silver_draft']],
  ['D12', ['campaign.cassandra_reveal']],
]);

const BAND_CHANNELS = [
  'concord_bulletin',
  'the_margin',
  'the_static',
  'ballad_line',
  'choir_vespers',
  'fulfillment_routing',
  'numbers_station',
  'landmark_bleed',
];

const LANDMARK_TARGETS = [
  'C1', 'C2', 'C3', 'C4', 'C5', 'C6', 'C7', 'C8', 'C9', 'C10', 'C11', 'C12',
  'C13a', 'C13b', 'C13c', 'C13d', 'C13e', 'C14', 'C15',
];

test('generated flavor index is fresh, deterministic, and deeply frozen', () => {
  const check = spawnSync(process.execPath, ['scripts/build-flavor-index.mjs', '--check'], {
    cwd: ROOT,
    encoding: 'utf8',
  });
  assert.equal(check.status, 0, `${check.stdout}\n${check.stderr}`);
  assert.equal(FLAVOR_MODULES.length, PACK_IDS.length);
  assert.deepEqual(Object.keys(FLAVOR_PACKS), PACK_IDS);
  assert.equal(Object.isFrozen(FLAVOR_PACKS), true);
  for (const pack of Object.values(FLAVOR_PACKS)) {
    assert.equal(Object.isFrozen(pack), true, `${pack.id} must be frozen`);
    assert.equal(Object.isFrozen(pack.entries), true, `${pack.id}.entries must be frozen`);
  }
  assert.equal(Object.isFrozen(FLAVOR_PACKS.wreck_rumors.entries[0].sources[0].lines[0]), true);
  assert.equal(Object.isFrozen(FLAVOR_TEXT_ENTRIES), true);
});

test('flavor catalogue rejects ambiguous modules and copy the linter could miss', () => {
  const record = (order, id, entries, sourceFile = `${String(order).padStart(3, '0')}-${id}.js`) => ({
    sourceFile,
    namespace: {
      flavorOrder: order,
      flavorId: id,
      flavorKind: 'test',
      default: defineFlavorPack({ id, kind: 'test', entries }),
    },
  });
  const a = record(10, 'a', [{ id: 'a_line', text: 'Filed.' }]);
  assert.throws(() => defineFlavorPack({ id: 'empty', kind: 'test', entries: [] }), /require id, kind, and entries/);
  assert.throws(() => buildFlavorCatalog([a, record(10, 'b', [{ id: 'b_line', text: 'Held.' }])]), /Duplicate flavor order/);
  assert.throws(() => buildFlavorCatalog([a, record(20, 'a', [{ id: 'a2_line', text: 'Returned.' }])]), /Duplicate flavor pack id/);
  assert.throws(
    () => buildFlavorCatalog([record(30, 'primitive', [{ id: 'bad', lines: ['Unscoped copy.'] }])]),
    /lines arrays require \{ id, text \}/,
  );
  assert.throws(
    () => buildFlavorCatalog([record(40, 'duplicate_copy', [
      { id: 'one', text: 'First.' },
      { id: 'one', text: 'Second.' },
    ])]),
    /duplicates copy id one/,
  );
  const duplicateSource = (id) => defineFlavorPack({
    id, kind: 'test', entries: [{ id: `${id}_source`, sourceRef: 'same.ref', lines: [{ id: `${id}_line`, text: 'Filed.' }] }],
  });
  assert.throws(
    () => buildFlavorSourceIndex({ a: duplicateSource('source_a'), b: duplicateSource('source_b') }),
    /Duplicate flavor source ref same.ref/,
  );
});

test('wreck rumors cover D1-D12 in their native channels and resolve every reserved source ref', () => {
  const rumors = FLAVOR_PACKS.wreck_rumors.entries;
  assert.equal(rumors.length, 12);
  assert.deepEqual(rumors.map((entry) => entry.programSlot), [...RUMOR_SOURCE_REFS.keys()]);
  for (const rumor of rumors) {
    assert.deepEqual(
      rumor.sources.map((source) => source.sourceRef),
      RUMOR_SOURCE_REFS.get(rumor.programSlot),
      `${rumor.programSlot} source refs drifted from the unique-loot reservation`,
    );
    for (const source of rumor.sources) {
      assert.equal(source.lines.length >= 2, true, `${source.sourceRef} needs a rumor set, not one line`);
      assert.equal(typeof source.nativeFormat, 'string');
      assert.equal(source.nativeFormat.length > 0, true);
    }
  }

  const manifestSources = UNIQUE_LOOT.wrecks.flatMap((wreck) => wreck.rumorSources.map((source) => ({
    ...source,
    wreckId: wreck.id,
    programSlot: wreck.programSlot,
  })));
  assert.equal(manifestSources.length, 13);
  assert.equal(manifestSources.every((source) => source.status === 'authored' || source.status === 'wired'), true);
  const wreckSourceRefs = Object.entries(FLAVOR_SOURCE_BY_REF)
    .filter(([, source]) => source.packId === 'wreck_rumors')
    .map(([sourceRef]) => sourceRef)
    .sort();
  assert.deepEqual(wreckSourceRefs, manifestSources.map((source) => source.sourceRef).sort());
  for (const expected of manifestSources) {
    const authored = FLAVOR_SOURCE_BY_REF[expected.sourceRef];
    assert.ok(authored, `${expected.sourceRef} must resolve to authored copy`);
    assert.equal(authored.id, expected.id);
    assert.equal(authored.wreckId, expected.wreckId);
    assert.equal(authored.programSlot, expected.programSlot);
    assert.equal(authored.channelId, expected.channelId);
    assert.equal(authored.packId, 'wreck_rumors');
  }
});

test('flavor packs meet the V2 count and identity contracts', () => {
  assert.equal(FLAVOR_PACKS.ad_board.entries.length >= 20, true);

  const graffitiSets = new Set(FLAVOR_PACKS.graffiti.entries.map((entry) => entry.set));
  assert.deepEqual(graffitiSets, new Set(['vols_hand', 'kindness', 'cynic', 'senna_name']));
  assert.equal(FLAVOR_PACKS.graffiti.entries.filter((entry) => entry.set === 'senna_name').every((entry) => entry.text.includes('{name}')), true);

  const band = FLAVOR_PACKS.band.entries;
  assert.deepEqual(band.map((entry) => entry.id), BAND_CHANNELS);
  assert.equal(band.every((entry) => entry.bed && entry.bed.kind), true);
  assert.equal(band.filter((entry) => !entry.contextual).every((entry) => entry.ident && entry.ident.text), true);
  assert.equal(band.every((entry) => entry.lines.length >= 7), true);
  assert.equal(band.reduce((sum, entry) => sum + entry.lines.length, 0) >= 60, true);
  const margin = band.find((entry) => entry.id === 'the_margin');
  assert.equal(margin.lines.filter((entry) => entry.text.includes('Tessera')).every((entry) => entry.eventKey), true);
  const staticChannel = band.find((entry) => entry.id === 'the_static');
  assert.deepEqual(staticChannel.lines.filter((entry) => entry.repBand).map((entry) => entry.repBand), ['hostile', 'neutral', 'allied']);
  const numbersDrop = band.find((entry) => entry.id === 'numbers_station').lines.find((entry) => entry.role === 'unique_wreck_bearing');
  assert.deepEqual({ seeded: numbersDrop.seeded, perSaveCap: numbersDrop.perSaveCap }, { seeded: true, perSaveCap: 1 });
  const bleed = band.find((entry) => entry.id === 'landmark_bleed');
  assert.equal(bleed.tunable, false);
  assert.equal(bleed.sourceBehaviors.find((entry) => entry.sourceId === 'landmark_quiessence').ident.text, 'QUIET MEMORIAL: THEY ARE NOT DEAD.');
  assert.deepEqual(
    bleed.sourceBehaviors.find((entry) => entry.sourceId === 'planet_hush'),
    { id: 'hush_carrier', sourceId: 'planet_hush', kind: 'silence' },
  );

  assert.deepEqual(
    FLAVOR_PACKS.roaming_events.entries.map((entry) => entry.id),
    ['insolvent', 'slow_fleet'],
  );
  assert.equal(FLAVOR_PACKS.roaming_events.entries.every((entry) => entry.economyHook && entry.lines.length >= 8), true);

  const facts = FLAVOR_PACKS.quiessence.entries;
  assert.equal(facts.length, 17);
  assert.deepEqual(facts.map((entry) => entry.shipIndex), Array.from({ length: 17 }, (_, index) => index + 1));
  assert.equal(facts.every((entry) => entry.snapshotId === 'formation_census_final'), true);
  assert.deepEqual(facts.map((entry) => entry.livingCrewCount), Array.from({ length: 17 }, (_, index) => index));
  assert.equal(new Set(facts.map((entry) => entry.text)).size, 17);

  assert.equal(FLAVOR_PACKS.hush.entries.length >= 8, true);
  assert.deepEqual(new Set(FLAVOR_PACKS.hush.entries.map((entry) => entry.phase)), new Set(['passive', 'focused', 'repeat', 'complete', 'exit']));
  assert.equal(FLAVOR_PACKS.hush.entries.every((entry) => entry.signalKind === 'absence'), true);

  const lore = FLAVOR_PACKS.landmark_lore.entries;
  assert.deepEqual(lore.map((entry) => entry.programSlot), LANDMARK_TARGETS);
  for (const landmark of lore) {
    assert.equal(typeof landmark.targetRef, 'string');
    assert.equal(landmark.lines.length >= 3 && landmark.lines.length <= 5, true, `${landmark.programSlot} needs 3-5 fragments`);
  }
  assert.equal(lore.find((entry) => entry.programSlot === 'C14').location.zoneId, 'zone_pallas_drift');
});

test('every authored line has a stable unique id and inline-safe text', () => {
  assert.equal(FLAVOR_TEXT_ENTRIES.length >= 233, true);
  assert.equal(new Set(FLAVOR_TEXT_ENTRIES.map((entry) => entry.key)).size, FLAVOR_TEXT_ENTRIES.length);
  for (const entry of FLAVOR_TEXT_ENTRIES) {
    assert.match(entry.key, /^src\/data\/flavor\//);
    assert.equal(typeof entry.text, 'string');
    assert.equal(entry.text.trim().length > 0, true, `${entry.key} must contain authored text`);
    assert.doesNotMatch(entry.text, /[\r\n\u2028\u2029]/u, `${entry.key} must stay one-line`);
    assert.doesNotMatch(entry.text, /[\u0000-\u001f\u007f\ufffd]/u, `${entry.key} contains an unsafe control/replacement character`);
  }
});

test('every flavor line participates in the F2 blurb-voice gate', () => {
  const scoped = collectBlurbVoiceEntries().filter((entry) => entry.kind === 'flavor');
  assert.equal(scoped.length, FLAVOR_TEXT_ENTRIES.length);
  assert.deepEqual(scoped.map((entry) => entry.key), FLAVOR_TEXT_ENTRIES.map((entry) => entry.key));
});

test('flavor corpus CLI emits a deterministic human taste-review artifact', () => {
  const dir = mkdtempSync(join(tmpdir(), 'spaceface-flavor-review-'));
  const review = join(dir, 'corpus-review.md');
  try {
    const run = () => spawnSync(process.execPath, ['scripts/check-flavor-corpus.mjs', '--review-out', review], {
      cwd: ROOT,
      encoding: 'utf8',
    });
    const first = run();
    assert.equal(first.status, 0, `${first.stdout}\n${first.stderr}`);
    const firstText = readFileSync(review, 'utf8');
    assert.match(firstText, /^# SpaceFace V2 Corpus Review/m);
    assert.match(firstText, /## Wreck Rumors/);
    assert.match(firstText, /## Landmark Lore/);
    assert.match(firstText, /354 authored lines/);
    const second = run();
    assert.equal(second.status, 0, `${second.stdout}\n${second.stderr}`);
    assert.equal(readFileSync(review, 'utf8'), firstText);
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
});
