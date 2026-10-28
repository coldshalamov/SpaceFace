import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import vm from 'node:vm';
import { fenceBarContact, fenceBarReply, proteusFindingKnown, proteusFindingMapOffer } from '../src/ui/station/fenceContact.js';
import { fenceContactId, FENCE_BY_ID } from '../src/data/fences.js';
import { BORROWED_SUN } from '../src/data/borrowedSun.js';
import { MAP_FOCUS, openGalaxyMap } from '../src/ui/mapAuthority.js';

// Exact production buildReply body, with only unrelated contact families adapted.
// The fence readers and map owner above are ordinary production imports. This is a
// bounded contact-route test, not DOM, renderer, full boot or Save/Continue acceptance.
const source = fs.readFileSync(new URL('../src/ui/station/barContacts.js', import.meta.url), 'utf8');
const start = source.indexOf('export function buildReply(');
const end = source.indexOf('\nfunction dossSourceList(', start);
assert.ok(start >= 0 && end > start);
const scope = { fenceBarReply, proteusFindingMapOffer, MAP_FOCUS, openGalaxyMap, BORROWED_SUN,
  DOSS_ARCHIVE_CONTACT_ID: 'contact_halev_doss', VONN_FREIGHT_CONTACT_ID: 'contact_vonn',
};
vm.runInNewContext(source.slice(start, end).replace('export function', 'function') + '\nglobalThis.reply = buildReply;', scope);
const reply = scope.reply;
const station = 'station_proteus', sector = 'sector_proteus_well', poiId = 'poi_proteus_stash';
const fence = FENCE_BY_ID.get('fence_pyrrha_rivet');
const contact = { id: fenceContactId(fence), fenceId: fence.id, role: 'smuggler' };
function fixture() {
  return { player: { heat: 0, credits: 1700 }, simTime: 0,
    ui: { docked: true, dockedStationId: station }, nav: { waypoint: { x: 1, z: 2 } },
    entities: new Map([[9, { alive: true, pos: { x: 46176, z: 25511 } }]]),
    encounterDirector: { stats: { fences: { byId: { [fence.id]: { trust: 1 } } } } },
    world: { currentSectorId: sector, activeSector: { id: sector,
      pois: [{ id: 9, poiId, pos: { x: 46170, z: 25500 } }] },
      discovery: { [sector]: { pois: { [poiId]: { investigated: true, discovered: true, identified: true } } } } },
    missions: { boards: { [station]: { slots: [] } }, active: [] },
  };
}
const mapChoice = state => fenceBarContact(station, state)?.choices.some(c => c.id === 'proteus_sounding_map');
const ask = state => fenceBarReply(contact, 'proteus_sounding', state, station).text;

test('genuine investigation, not proximity or truthy legacy data, admits the finding', () => {
  for (const record of [{}, { discovered: true }, { identified: true }, { investigated: 'true' }]) {
    const s = fixture(); s.world.discovery[sector].pois[poiId] = record;
    assert.equal(proteusFindingKnown(s), false); assert.equal(mapChoice(s), false);
    assert.equal(proteusFindingMapOffer(s, station, contact), null);
    assert.match(ask(s), /active scan/); assert.doesNotMatch(ask(s), /Below-Deck Cache|46176|25511/);
  }
});
test('known finding distinguishes cartography payment from a Den sale', () => {
  const s = fixture(), before = JSON.stringify(s);
  assert.equal(mapChoice(s), true); assert.match(ask(s), /Below-Deck Cache/);
  assert.match(ask(s), /do not buy/); assert.match(ask(s), /cartography pays/);
  assert.equal(JSON.stringify(s), before);
});
test('map route uses the current entity position and copies it', () => {
  const s = fixture(), offer = proteusFindingMapOffer(s, station, contact);
  assert.deepEqual(offer.pos, { x: 46176, z: 25511 });
  offer.pos.x = -99; assert.equal(s.entities.get(9).pos.x, 46176);
});
test('resident projection is the fallback when its entity is absent', () => {
  const s = fixture(); s.entities.clear();
  assert.deepEqual(proteusFindingMapOffer(s, station, contact).pos, { x: 46170, z: 25500 });
});
for (const [name, alter] of [
  ['wrong station', s => { s.ui.dockedStationId = 'station_nyx_march'; }],
  ['undocked', s => { s.ui.docked = false; }],
  ['wrong sector', s => { s.world.currentSectorId = 'sector_veil_nebula'; }],
  ['stale resident sector', s => { s.world.activeSector.id = 'sector_veil_nebula'; }],
  ['lost trust', s => { s.encounterDirector.stats.fences.byId[fence.id].trust = 0; }],
  ['lost investigation', s => { s.world.discovery[sector].pois[poiId].investigated = false; }],
  ['dead entity', s => { s.entities.get(9).alive = false; }],
  ['nonfinite entity position', s => { s.entities.get(9).pos.x = NaN; }],
  ['missing marker', s => { s.world.activeSector.pois = []; }],
  ['malformed marker bag', s => { s.world.activeSector.pois = {}; }],
  ['nonfinite fallback', s => { s.entities.clear(); s.world.activeSector.pois[0].pos.z = Infinity; }],
]) test('stale map click fails closed: ' + name, () => {
  const s = fixture(); assert.equal(mapChoice(s), true); alter(s);
  const before = JSON.stringify(s), events = [];
  const result = reply('smuggler', 'proteus_sounding_map', { state: s, bus: { emit: (...v) => events.push(v) } }, station, contact);
  assert.match(result.text, /cannot put that one on a chart/); assert.equal(events.length, 0); assert.equal(JSON.stringify(s), before);
});
test('wrong contact identity and supplied station cannot open a map', () => {
  for (const [sid, c] of [[station, { ...contact, id: 'forged' }], [station, { ...contact, fenceId: 'fence_hesper_quill' }], ['station_nyx_march', contact]]) {
    const s = fixture(), before = JSON.stringify(s), events = [];
    reply('smuggler', 'proteus_sounding_map', { state: s, bus: { emit: (...v) => events.push(v) } }, sid, c);
    assert.equal(events.length, 0); assert.equal(JSON.stringify(s), before);
  }
});
test('explicit click opens only the existing system map and rereads a moved marker', () => {
  const s = fixture(); assert.equal(mapChoice(s), true);
  s.entities.get(9).pos = { x: 46200, z: 25600 };
  const previous = JSON.stringify({ player:s.player, nav:s.nav, world:s.world, missions:s.missions, director:s.encounterDirector });
  const events = []; const result = reply('smuggler', 'proteus_sounding_map', { state:s, bus:{emit:(...v)=>events.push(v)} }, station, contact);
  assert.match(result.text, /course is yours/); assert.deepEqual(events, [['ui:pushScreen', { id:'galaxyMap' }]]);
  assert.equal(s.ui.mapOpenIntent.focus, MAP_FOCUS.SYSTEM);
  assert.deepEqual(s.ui.mapOpenIntent.pos, {x:46200,z:25600});
  assert.equal(JSON.stringify({player:s.player,nav:s.nav,world:s.world,missions:s.missions,director:s.encounterDirector}), previous);
});
test('an existing screen manager receives the same route', () => {
  const s=fixture(), pushes=[];
  reply('smuggler','proteus_sounding_map',{state:s,screenManager:{pushScreen:id=>pushes.push(id)}},station,contact);
  assert.deepEqual(pushes,['galaxyMap']);
});
test('clean/untrusted remains hidden; wanted remains admitted without creating trust', () => {
  const s=fixture(); s.encounterDirector.stats.fences.byId[fence.id].trust=0;
  assert.equal(fenceBarContact(station,s),null); s.player.heat=0.2;
  assert.ok(fenceBarContact(station,s)); assert.equal(s.encounterDirector.stats.fences.byId[fence.id].trust,0);
});
test('ordinary work retains the exact existing board offer', () => {
  const s=fixture(), job={id:'existing',cause:{tag:'wanted_deniable'}};
  s.missions.boards[station].slots.push(job);
  assert.strictEqual(fenceBarReply(contact,'fence_work',s,station).missionOffer,job);
});
test('a restored durable discovery remains known after residency is rebuilt', () => {
  const first=fixture(), restored=fixture();
  restored.world.discovery=JSON.parse(JSON.stringify(first.world.discovery));
  restored.entities.get(9).pos={x:46233,z:25633};
  assert.equal(proteusFindingKnown(restored),true); assert.match(ask(restored),/Below-Deck Cache/);
  assert.deepEqual(proteusFindingMapOffer(restored,station,contact).pos,{x:46233,z:25633});
  // This exercises the discovery payload contract, not the complete Save owner.
});
test('current-master Nyx eligibility and choices are not expanded by Proteus', () => {
  const s=fixture(); assert.equal(fenceBarContact('station_nyx_march',s),null);
  s.player.heat=0.2; const nyx=fenceBarContact('station_nyx_march',s);
  assert.ok(nyx); assert.equal(nyx.choices.some(c=>c.id.startsWith('proteus_')),false);
  assert.equal(nyx.choices.some(c=>c.id==='clinic_freight_report'),false);
});
