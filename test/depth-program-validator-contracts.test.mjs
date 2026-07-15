import test from 'node:test';
import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import { mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';

import {
  validateBlurbEntries,
  validateFactionKitContract,
  validateUniqueLootContract,
} from '../scripts/lib/depthProgramValidators.mjs';
import {
  blurbVoiceHash,
  selectChangedBlurbEntries,
} from '../scripts/lib/blurbVoiceSources.mjs';

function issueCodes(issues) {
  return new Set(issues.map((issue) => issue.code));
}

const ROOT = fileURLToPath(new URL('../', import.meta.url));

test('faction-kit validator accepts complete symmetric kits with distinct palette claims', () => {
  const kits = [
    {
      id: 'faction_a', name: 'A', short: 'A', color: '#D8334A', personality: 'a',
      startingRep: 0, homeSectors: [], controls: [], fleetClass: 'test',
      relations: { faction_b: 0.25 }, palette: { primary: '#D8334A' },
      shipRoles: [], illegalCommodities: [], custom: {}, voiceRegister: 'a',
    },
    {
      id: 'faction_b', name: 'B', short: 'B', color: '#2FCFA0', personality: 'b',
      startingRep: 0, homeSectors: [], controls: [], fleetClass: 'test',
      relations: { faction_a: 0.25 }, palette: { primary: '#2FCFA0' },
      shipRoles: [], illegalCommodities: [], custom: {}, voiceRegister: 'b',
    },
  ];
  const issues = validateFactionKitContract({
    kits,
    paintProfiles: { a: {}, b: {} },
    paletteClaims: [
      { id: 'a.primary', factionId: 'faction_a', role: 'primary', hex: '#D8334A' },
      { id: 'b.primary', factionId: 'faction_b', role: 'primary', hex: '#2FCFA0' },
    ],
  });
  assert.deepEqual(issues, []);
});

test('faction-kit validator rejects missing profiles, incomplete/asymmetric relations, and undocumented hue collisions', () => {
  const kits = [
    {
      id: 'faction_a', name: 'A', short: 'A', color: '#D8334A', personality: 'missing',
      startingRep: 0, homeSectors: [], controls: [], fleetClass: 'test',
      relations: { faction_b: 0.5 }, palette: { primary: '#D8334A' },
      shipRoles: [], illegalCommodities: [], custom: {}, voiceRegister: 'a',
    },
    {
      id: 'faction_b', name: 'B', short: 'B', color: '#D9354B', personality: 'b',
      startingRep: 0, homeSectors: [], controls: [], fleetClass: 'test',
      relations: { faction_a: -0.5 }, palette: { primary: '#D9354B' },
      shipRoles: [], illegalCommodities: [], custom: {}, voiceRegister: 'b',
    },
    {
      id: 'faction_c', name: 'C', short: 'C', color: '#2FCFA0', personality: 'c',
      startingRep: 0, homeSectors: [], controls: [], fleetClass: 'test',
      relations: { faction_a: 0, faction_b: 0 }, palette: { primary: '#2FCFA0' },
      shipRoles: [], illegalCommodities: [], custom: {}, voiceRegister: 'c',
    },
  ];
  const codes = issueCodes(validateFactionKitContract({
    kits,
    paintProfiles: { b: {}, c: {} },
    paletteClaims: [
      { id: 'a.primary', factionId: 'faction_a', role: 'primary', hex: '#D8334A' },
      { id: 'b.primary', factionId: 'faction_b', role: 'primary', hex: '#D9354B' },
      { id: 'c.primary', factionId: 'faction_c', role: 'primary', hex: '#2FCFA0' },
    ],
  }));
  assert(codes.has('faction.paint-profile.missing'));
  assert(codes.has('faction.relation.missing'));
  assert(codes.has('faction.relation.asymmetric'));
  assert(codes.has('palette.hue-collision'));
});

test('faction-kit validator requires near-hue exceptions to document a measurable distinction', () => {
  const kit = (id, color, relation, personality) => ({
    id, name: id, short: id, color, personality, startingRep: 0,
    homeSectors: [], controls: [], fleetClass: 'test', relations: relation,
    palette: { primary: color }, shipRoles: [], illegalCommodities: [], custom: {},
    voiceRegister: personality,
  });
  const claims = [
    { id: 'a.primary', factionId: 'faction_a', role: 'primary', hex: '#C9772E', pattern: 'clean-coat' },
    { id: 'b.primary', factionId: 'faction_b', role: 'primary', hex: '#C8501C', pattern: 'patch-over-host' },
  ];
  const issues = validateFactionKitContract({
    kits: [kit('faction_a', '#C9772E', { faction_b: 0 }, 'a'), kit('faction_b', '#C8501C', { faction_a: 0 }, 'b')],
    paintProfiles: { a: {}, b: {} },
    paletteClaims: claims,
    allowedPaletteCollisions: [{
      pair: ['a.primary', 'b.primary'],
      distinguishBy: ['saturation', 'pattern'],
      reason: 'Orange patches over the host coat never read as a clean copper livery.',
    }],
  });
  assert.deepEqual(issues, []);
});

test('unique-loot validator accepts a unique drop with a wired rumor channel', () => {
  const issues = validateUniqueLootContract({
    wrecks: [{ id: 'wreck_ok', uniqueDrops: ['item_unique_ok'], rumorSources: ['rumor_ok'] }],
    rumors: [{ id: 'rumor_ok', wreckId: 'wreck_ok', channel: 'bar' }],
    channels: ['bar', 'news'],
    stationInventoryIds: [],
  });
  assert.deepEqual(issues, []);
});

test('unique-loot validator rejects station-stocked uniques and missing or unknown rumor wiring', () => {
  const codes = issueCodes(validateUniqueLootContract({
    wrecks: [
      { id: 'wreck_stocked', uniqueDrops: ['item_unique_stocked'], rumorSources: [] },
      { id: 'wreck_unknown_channel', uniqueDrops: ['item_unique_other'], rumorSources: ['rumor_void'] },
    ],
    rumors: [{ id: 'rumor_void', wreckId: 'wreck_unknown_channel', channel: 'void' }],
    channels: ['bar'],
    stationInventoryIds: ['item_unique_stocked'],
  }));
  assert(codes.has('unique.station-inventory'));
  assert(codes.has('unique.rumor.missing'));
  assert(codes.has('unique.rumor.channel'));
});

test('unique-loot validator rejects vacuous manifests and reused unique ids', () => {
  assert(issueCodes(validateUniqueLootContract({ channels: ['bar'] })).has('unique.manifest.empty'));
  const codes = issueCodes(validateUniqueLootContract({
    wrecks: [
      { id: 'wreck_a', uniqueDrops: ['same_drop'], rumorSources: [{ id: 'a', channel: 'bar' }] },
      { id: 'wreck_b', uniqueDrops: ['same_drop'], rumorSources: [{ id: 'b', channel: 'bar' }] },
    ],
    channels: ['bar'],
  }));
  assert(codes.has('unique.drop.duplicate'));
});

test('unique-loot validator resolves authored rumor copy by ref, channel, wreck, and slot', () => {
  const wreck = {
    id: 'wreck_a', programSlot: 'D1', uniqueDrops: ['unique_a'],
    rumorSources: [{
      id: 'rumor_a', channelId: 'news', sourceRef: 'news.missing', status: 'authored',
    }],
  };
  const missing = issueCodes(validateUniqueLootContract({
    wrecks: [wreck], channels: ['news'], sourceIndex: {}, requireAuthored: true,
  }));
  assert(missing.has('unique.rumor.source-unresolved'));

  const mismatched = issueCodes(validateUniqueLootContract({
    wrecks: [wreck], channels: ['news'], requireAuthored: true,
    sourceIndex: {
      'news.missing': {
        id: 'different', wreckId: 'wreck_b', programSlot: 'D2', channelId: 'bar',
      },
    },
  }));
  assert(mismatched.has('unique.rumor.source-id'));
  assert(mismatched.has('unique.rumor.source-wreck'));
  assert(mismatched.has('unique.rumor.source-slot'));
  assert(mismatched.has('unique.rumor.source-channel'));
});

test('blurb validator accepts expressive localized prose and punctuation', () => {
  assert.deepEqual(validateBlurbEntries([
    { id: 'clean', text: 'Concord stamped the bright ancient hull clean; nobody checked what stayed inside, beneath the registry seals!!!' },
    { id: 'localized', text: '航路は開いた。信号を追って、ゲートで待て。' },
  ]), []);
});

test('blurb since-scope skips unchanged legacy prose and selects new or hash-changed lines', () => {
  const unchanged = { key: 'legacy', kind: 'comms', text: 'Filed once. Read twice.' };
  const changed = { key: 'changed', kind: 'comms', text: 'The file moved.' };
  const added = { key: 'added', kind: 'contact_blurb', text: 'Nobody signed the hull.' };
  const baseline = {
    legacy: blurbVoiceHash(unchanged),
    changed: blurbVoiceHash({ ...changed, text: 'The file stayed.' }),
  };
  assert.deepEqual(
    selectChangedBlurbEntries([unchanged, changed, added], baseline).map((entry) => entry.key),
    ['changed', 'added'],
  );
});

test('blurb validator rejects missing copy and characters that break inline UI layout', () => {
  const codes = issueCodes(validateBlurbEntries([
    { id: 'empty', text: '   ' },
    { id: 'multiline', text: 'First line.\nSecond line.' },
    { id: 'control', text: 'Signal\u0007lost.' },
    { id: 'replacement', text: 'Signal \ufffd lost.' },
  ]));
  assert(codes.has('blurb.text'));
  assert(codes.has('blurb.layout'));
  assert(codes.has('blurb.characters'));
});

test('all three validator CLIs reject deliberate temporary bad fixtures and leave no repo artifact', () => {
  const dir = mkdtempSync(join(tmpdir(), 'spaceface-depth-validator-'));
  try {
    const factionFixture = join(dir, 'bad-faction.json');
    writeFileSync(factionFixture, JSON.stringify({ kits: [], paintProfiles: {}, paletteClaims: [] }));

    const uniqueFixture = join(dir, 'bad-unique.json');
    writeFileSync(uniqueFixture, JSON.stringify({
      schemaVersion: 1,
      channels: [{ id: 'bar', carrier: 'src/ui/screens/bar.js' }],
      wrecks: [{
        id: 'bad_wreck', programSlot: 'D1', status: 'reserved',
        uniqueDrops: [{ id: 'mod_shield_booster_s', kind: 'module', baseId: 'mod_shield_booster_s' }],
        rumorSources: [],
      }],
    }));

    const blurbFixture = join(dir, 'bad-blurb.json');
    writeFileSync(blurbFixture, JSON.stringify({
      baseline: {},
      entries: [{ key: 'bad', kind: 'contact_blurb', text: 'First line.\nSecond line.' }],
    }));

    const cases = [
      ['scripts/check-faction-kit.mjs', factionFixture, 'faction.kits.empty'],
      ['scripts/check-unique-loot.mjs', uniqueFixture, 'unique.station-inventory'],
      ['scripts/check-blurb-voice.mjs', blurbFixture, 'blurb.layout'],
    ];
    for (const [script, fixture, code] of cases) {
      const result = spawnSync(process.execPath, [script, '--fixture', fixture], {
        cwd: ROOT,
        encoding: 'utf8',
      });
      assert.equal(result.status, 1, `${script} should reject its deliberate bad fixture`);
      assert.match(`${result.stdout}\n${result.stderr}`, new RegExp(code.replaceAll('.', '\\.')));
    }
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
});
