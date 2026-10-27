import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';
import test from 'node:test';
try { os.setPriority(os.constants.priority.PRIORITY_LOW); } catch {}

const sourceRoot = process.env.SPACEFACE_CHARON_SOURCE_ROOT
  || path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const view = await import(pathToFileURL(path.join(sourceRoot, 'src/world/charonSupplyReadout.js')));
const { admitReceipt } = await import(pathToFileURL(path.join(sourceRoot, 'src/ui/hudAttention.js')));
const C = view.CHARON_SUPPLY;
const source = readFileSync(path.join(sourceRoot, 'src/world/charonSalvageSupply.js'), 'utf8');
// Run the real observer with the real readout and normalizer; do not boot or fake
// physics to assert a presentation-only observation of the canonical custody book.
const observer = source.slice(source.indexOf('const approachWindows ='), source.indexOf('const legacyCargo ='));
const normalizerStart = source.indexOf('export function normalizeCharonSupply(');
const tail = source.slice(normalizerStart);
const normalizerEnd = tail.slice(1).search(/\n(?:export )?function /);
assert.ok(observer && normalizerStart >= 0 && normalizerEnd > 0);
const normalizer = tail.slice(0, normalizerEnd + 1).replace(/^export /, '');
const helper = name => source.split('\n').find(line => line.startsWith(`const ${name} =`));
const makeObserver = new Function('C', 'live', 'book', 'charonApproachFlight', 'charonApproachCenter',
  'charonSupplyApproachCue', 'charonSupplyMilestoneCue',
  `${helper('whole')}\n${helper('clone')}\n${observer}\n${normalizer}
   return { approach: approachCharonSupply, reset: owner => approachWindows.delete(owner) };`);

function fixture() {
  const center = view.charonApproachCenter();
  const entity = (id, slot, name) => ({ id, type: 'ship', alive: true, hull: 100, hullMax: 100,
    team: slot ? 2 : 0, occupantGeneration: id + 10, pos: { ...center }, vel: { x: 0, z: 0 },
    data: slot ? { name, callsign: name, activityActorSlotId: slot, worldRecordId: `record:${slot}`,
      identityKey: `charon:activity:${slot}`, durable: true,
      trafficRole: slot === C.hauler ? 'hauler' : 'salvor', jobPhase: 'hold', ai: { passive: true } } : {} });
  const player = entity(1), hauler = entity(2, C.hauler, 'AIR HAULER'), cutter = entity(3, C.salvor, 'CREW CUTTER');
  const fields = ['loose', 'aboard', 'delivered', 'consumed', 'player', 'other', 'lost'];
  const lot = { id: C.sourceId, original: 6, ...Object.fromEntries(fields.map(k => [k, k === 'loose' ? 6 : 0])) };
  const book = { schema: 1, original: 6, phase: 'collect', haulerId: hauler.data.worldRecordId,
    salvorId: cutter.data.worldRecordId, haulerReady: true, salvorReady: true, pods: [lot] };
  const state = { mode: 'flight', simTime: 1, tick: 60, playerId: player.id, player: { targetId: null },
    ui: { docked: false }, world: { currentSectorId: C.sectorId, records: { byId: {} } },
    traffic: { charonSalvageSupply: book }, entities: new Map([player, hauler, cutter].map(e => [e.id, e])),
    entityList: [player, hauler, cutter], missions: { active: [] }, pirateParley: { squads: {} } };
  for (const e of [hauler, cutter]) state.world.records.byId[e.data.worldRecordId] = {
    recordId: e.data.worldRecordId, identityKey: e.data.identityKey, alive: true,
    outcome: 'active', homeSectorId: C.sectorId };
  const emitted = [];
  const owner = { state, bus: { emit: (type, payload) => emitted.push({ type, ...payload }) } };
  const watcher = makeObserver(C, view.charonSupplyLive, view.charonSupplyBook, view.charonApproachFlight,
    view.charonApproachCenter, view.charonSupplyApproachCue, view.charonSupplyMilestoneCue);
  const at = distance => {
    player.pos.x = center.x + distance; player.pos.z = center.z;
    state.simTime++; state.tick += 60; watcher.approach(owner);
  };
  const phase = (name, field) => { book.phase = name; for (const k of fields) lot[k] = k === field ? 6 : 0; };
  return { center, state, player, hauler, cutter, book, lot, owner, watcher, emitted, at, phase };
}

test('nearby observation follows real six-kit custody and actual new-round admission', () => {
  const f = fixture(); f.at(800); f.at(400);
  assert.equal(f.emitted.length, 1);
  const original = JSON.stringify(f.book);
  f.at(400); assert.equal(f.emitted.length, 1, 'no timer invents work or repeats a report');
  assert.equal(JSON.stringify(f.book), original);
  f.phase('collect', 'aboard'); f.at(400);
  assert.match(f.emitted.at(-1).text, /all six original kits aboard the original hauler/);
  assert.match(f.emitted.at(-1).text, /still needs the physical handoff/);
  f.phase('delivered', 'delivered'); f.at(400);
  assert.match(f.emitted.at(-1).text, /reached the cutter.*still pending/);
  f.phase('working', 'consumed'); const final = JSON.stringify(f.book); f.at(400);
  assert.match(f.emitted.at(-1).text, /used the six-kit reserve and started/);
  for (const cue of f.emitted) assert.equal(view.validCharonApproachReceipt(f.state,
    { ...cue, charonApproach: { ...cue.charonApproach, simTime: f.state.simTime } }), true);
  assert.equal(JSON.stringify(f.book), final, 'observation never mutates stock or admits a round');
  assert.equal(f.state.player.targetId, null, 'no automatic target or course');
  f.at(400); assert.equal(f.emitted.length, 4);
});

test('shortfall is observed once without inventing a replacement or blaming a collector', () => {
  const f = fixture(); f.at(400); assert.equal(f.emitted.length, 0);
  f.lot.loose = 5; f.lot.player = 1; f.at(400);
  assert.match(f.emitted.at(-1).text, /reserve is now short.*blocked.*no replacement/);
  f.at(400); assert.equal(f.emitted.length, 1);
  f.book.phase = 'shortfall'; f.at(400);
  assert.match(f.emitted.at(-1).text, /cancelled.*Remaining kits stay/);
  assert.equal(f.lot.player, 1); assert.equal(f.lot.loose, 5);
});

test('departure and restored observations do not replay unseen work as a fresh milestone', () => {
  const f = fixture(); f.at(800); f.at(400); f.at(800); f.phase('working', 'consumed'); f.at(400);
  assert.equal(f.emitted.length, 1, 'ordinary approach cooldown remains');
  f.watcher.reset(f.owner); f.at(400);
  assert.equal(f.emitted.length, 1, 'restore starts a new observation, not an invented transition');
  f.state.simTime += 121; f.at(800); f.at(400);
  assert.equal(f.emitted.at(-1).charonApproach.kind, 'approach');
  assert.match(f.emitted.at(-1).text, /Last crew report: reserve used/);
});

test('cue validation rejects forged milestone kinds, stale lives, tampering and expired observations', () => {
  const f = fixture(); f.at(400); f.phase('working', 'consumed'); f.at(400);
  const cue = f.emitted.at(-1); assert.ok(cue, 'the actual phase change emitted a milestone');
  assert.equal(view.validCharonApproachReceipt(f.state, cue), true);
  for (const mutate of [
    p => p.text = 'Charon supply: infinite replacement kits',
    p => p.charonApproach.kind = 'reward',
    p => p.charonApproach.previousStatus = p.charonApproach.status,
    p => p.charonApproach.actorGeneration++,
    p => p.charonApproach.simTime -= 2,
  ]) {
    const bad = structuredClone(cue); mutate(bad);
    assert.equal(view.validCharonApproachReceipt(f.state, bad), false);
  }
});

test('SUPPLY ROUTE gives an actual receiver distance and handoff drift without claiming center distance is contact', () => {
  const f = fixture(); f.at(400);
  let lines = view.charonSupplyHailLines(f.state, f.hauler);
  assert.match(lines[1], /hull contact.*within 2 WU\/s.*release your tether/);
  assert.match(lines[1], /AIR HAULER is 400 WU from you/);
  f.phase('collect', 'aboard'); f.cutter.pos.x += 30; f.cutter.pos.z += 40;
  f.hauler.vel = { x: 4, z: 0 }; f.cutter.vel = { x: 1, z: 0 };
  lines = view.charonSupplyHailLines(f.state, f.hauler);
  assert.match(lines[1], /hull gap of 4 WU or less.*within 2 WU\/s/);
  assert.match(lines[1], /50 WU between hull centers · 3.0 WU\/s relative drift/);
  assert.doesNotMatch(lines[1], /handoff ready|arrival confirmed/i);
});

test('the existing receipt owner keeps milestones quiet in combat and validates their original actor', () => {
  const f = fixture(); f.at(400); f.phase('working', 'consumed'); f.at(400);
  const cue = f.emitted.at(-1); assert.ok(cue);
  assert.equal(admitReceipt({ ...cue, state: f.state }).admit, true);
  assert.equal(admitReceipt({ ...cue, state: f.state, combat: true }).admit, false);
  f.hauler.occupantGeneration++;
  assert.equal(admitReceipt({ ...cue, state: f.state }).admit, false);
});

test('ordinary approach keeps its genuine crossing, 120-second cooldown and two-report visit budget', () => {
  const f = fixture(); const before = JSON.stringify(f.book);
  f.at(400); assert.equal(f.emitted.length, 0);
  f.at(800); f.at(400); assert.equal(f.emitted.length, 1);
  f.at(800); f.at(400); assert.equal(f.emitted.length, 1);
  f.state.simTime += 121; f.at(800); f.at(400); assert.equal(f.emitted.length, 2);
  f.state.simTime += 121; f.at(800); f.at(400); assert.equal(f.emitted.length, 2);
  assert.equal(JSON.stringify(f.book), before);
});

test('a replacement player life starts a fresh observation rather than inheriting an earlier witness', () => {
  const f = fixture(); f.at(400);
  f.player.occupantGeneration++; f.phase('working', 'consumed'); f.at(400);
  assert.equal(f.emitted.length, 0);
  f.at(800); f.at(400);
  assert.match(f.emitted.at(-1).text, /Last crew report: reserve used/);
});
