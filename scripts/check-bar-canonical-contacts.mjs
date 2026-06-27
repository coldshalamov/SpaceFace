// Pins the station-bar recurring NPC layer to real stations and UI hooks.
// The bar remains dynamic, but these authored figures must stay reachable in default play.
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { SECTORS } from '../src/data/sectors.js';

const source = readFileSync(new URL('../src/ui/screens/bar.js', import.meta.url), 'utf8');
const stationIds = new Set();
for (const sector of SECTORS) {
  for (const station of sector.stations || []) {
    stationIds.add(station.id);
  }
}

const expected = [
  { key: 'kessler', stations: ['station_helios'], text: 'Contract 47-A' },
  { key: 'rook', stations: ['station_coalition'], text: 'missionOffer' },
  { key: 'voss', stations: ['station_beltout'], text: 'Claim Recorder' },
  { key: 'hale', stations: ['station_customs'], text: 'Customs Officer' },
  { key: 'mira', stations: ['station_tethys'], text: 'Freight Seal Clerk' },
  { key: 'slate', stations: ['station_forge'], text: 'Shipyard Welder' },
  { key: 'drift', stations: ['station_drift'], text: 'Ore Ledger' },
  { key: 'quinn', stations: ['station_smuggler', 'station_sker'], text: 'Proprietor' },
];

for (const entry of expected) {
  assert.ok(source.includes(`key: '${entry.key}'`), `bar canonical contacts missing ${entry.key}`);
  assert.ok(source.includes(entry.text), `bar canonical contact ${entry.key} missing expected authored text "${entry.text}"`);
  for (const stationId of entry.stations) {
    assert.ok(stationIds.has(stationId), `${entry.key} references missing station ${stationId}`);
    assert.ok(source.includes(`'${stationId}'`), `${entry.key} is not wired to ${stationId}`);
  }
}

assert.ok(source.includes('const canonical = canonicalContactForStation(stationId)'), 'bar contact generation must insert canonical contacts');
assert.ok(source.includes('buildCanonicalReply(contact, choiceId, ctx, stationId)'), 'bar replies must dispatch to canonical contacts');
assert.ok(source.includes('c.roleLabel || ROLE_LABELS[c.role]'), 'bar render must show canonical role labels');

console.log(`Station bar canonical contacts OK - ${expected.length} recurring NPCs across ${stationIds.size} stations`);
