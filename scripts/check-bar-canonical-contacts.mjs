// Pins the station-bar recurring NPC layer to real stations and UI hooks.
// The bar remains dynamic, but these authored figures must stay reachable in default play.
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { SECTORS } from '../src/data/sectors.js';
import { barContactIntelTags } from '../src/ui/screens/bar.js';

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
assert.ok(source.includes('function rewardCredits('), 'bar mission replies must share a reward formatter instead of ad hoc reward fields');
assert.ok(!source.includes("|| '???'"), 'bar mission replies must not show ??? for unknown reward fields');
assert.ok(source.includes('missionOfferAvailable(ctx, missionId)'), 'bar accept button must verify the offer is still available before/after the intent');
assert.ok(source.includes('const accepted = wasAvailable && !missionOfferAvailable(ctx, missionId)'), 'bar accept button must only mark accepted after the mission system removes the offer');
assert.ok(source.includes("import { missionPreflight } from '../missionPreflight.js'"), 'bar mission offers must use shared mission preflight');
assert.ok(source.includes("import { missionConsequenceSummary } from '../missionPreflight.js'"), 'bar mission offers must use shared mission consequences');
assert.ok(source.includes('st-bar-offer'), 'bar mission offers must render a readiness/action block');
assert.ok(source.includes('st-bar-offer-consequences'), 'bar mission offers must render visible consequence stakes');
assert.ok(source.includes('st-bar-offer-blocker'), 'bar mission offers must show visible readiness blockers');
assert.ok(source.includes('ACCEPT + TRACK'), 'bar mission accept button must use the same tracking language as the board');
assert.ok(source.includes('offer.requirementUnmet || offer.lockedReason || preflight.blocker'), 'bar offer buttons must respect shared readiness blockers');
assert.ok(source.includes("acceptButton.setAttribute('aria-label', acceptButton.title)"), 'bar mission offer buttons must expose readiness titles to assistive tech');
assert.ok(source.includes("acceptBtn.textContent = 'No Longer Available'"), 'stale bar mission offers must avoid generic unavailable copy');
assert.ok(source.includes('export function barContactIntelTags'), 'bar contact intel tags must stay directly testable');
assert.ok(source.includes('class="st-bar-intel"'), 'bar contact cards must render a visible intel strip before dialogue choices');
assert.ok(source.includes('st-bar-intel-chip--'), 'bar contact intel tags must expose stable tone style hooks');

const routeState = {
  economy: {
    marketIntel: {
      station_helios: { snapshot: { cmdty_food: { buy: 10 } } },
      station_tethys: { snapshot: { cmdty_food: { sell: 18 } } },
    },
  },
  missions: { boards: {} },
};
let tags = barContactIntelTags({ role: 'merchant' }, routeState, 'station_helios');
assert.equal(tags[0].label, 'Route', 'merchant intel should surface the best known trade route first');
assert.match(tags[0].text, /Provisions -> Tethys Trade Hub \+8\/u/, 'merchant route intel should name cargo, buyer, and spread');
assert.equal(tags[0].kind, 'ok', 'profitable route intel should use the positive tone');

tags = barContactIntelTags({ role: 'pilot' }, {
  missions: {
    boards: {
      station_coalition: {
        slots: [{ id: 'm1', type: 'cargo_delivery' }, { id: 'm2', type: 'bounty_hunt' }],
      },
    },
  },
}, 'station_coalition');
assert.equal(tags[0].label, 'Board', 'pilot intel should summarize the live board');
assert.match(tags[0].text, /2 live contracts/, 'pilot intel should count available contracts');

tags = barContactIntelTags({ role: 'bounty_hunter' }, {
  missions: { boards: { station_coalition: { slots: [{ id: 'b1', type: 'bounty_hunt' }] } } },
}, 'station_coalition');
assert.equal(tags[0].label, 'Targets', 'bounty hunter intel should summarize combat postings');
assert.match(tags[0].text, /1 combat posting/, 'bounty hunter intel should count combat work');

tags = barContactIntelTags({ role: 'smuggler' }, { missions: { boards: {} } }, 'station_helios');
assert.equal(tags[0].label, 'Black Market', 'smuggler intel should point toward black-market access');
assert.match(tags[0].text, /Smuggler Den|Sker Bazaar|Ruined Cache Station/, 'smuggler intel should name a real black-market station');

tags = barContactIntelTags({ role: 'miner' }, { missions: { boards: {} } }, 'station_beltout');
assert.equal(tags[0].label, 'Field', 'miner intel should point at a real asteroid field');
assert.match(tags[0].text, /Ceres Belt/, 'miner intel should prefer local mining fields');

tags = barContactIntelTags({ role: 'engineer' }, { missions: { boards: {} } }, 'station_forge');
assert.equal(tags[0].label, 'Station', 'engineer intel should summarize local station services');
assert.match(tags[0].text, /shipyard|fabrication|repair|fuel|market/, 'engineer intel should name actionable service context');

console.log(`Station bar canonical contacts OK - ${expected.length} recurring NPCs across ${stationIds.size} stations`);
