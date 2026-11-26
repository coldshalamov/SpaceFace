// WORLD slice 2 — a sector's standing hostiles are rolled once and then persist.
// Before: leaving a sector for more than 180 s re-rolled a brand-new identical crowd (the dead
// came back); one kill left a tombstone that blocked every later roll, so after 180 s away the
// sector was empty for good. Now: survivors return where they live, and a killed member's slot
// is refilled one game day later by a replacement that arrives at one of the sector's gates.
import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { createSimulation } from '../src/core/sim.js';
import { spawnBudget } from '../src/systems/spawnBudget.js';
import { world, AMBIENT_REPLACE_DELAY_S, normalizeAmbientCast } from '../src/systems/world.js';

const S = 'sector_pallas_drift';
const FAR = 'sector_ashfall_reach';

function boot() {
  const sim = createSimulation({ seed: 4747, systems: [spawnBudget, world] });
  const { state } = sim;
  state.mode = 'flight';
  const player = sim.spawn({ type: 'ship', team: 0, pos: { x: 0, z: 0 }, vel: { x: 0, z: 0 }, hull: 140, hullMax: 140, radius: 6 });
  state.playerId = player.id;
  const w = sim.registry.get('world');
  const ambient = () => [...state.entities.values()].filter((e) => e.alive !== false && e.type === 'ship'
    && e.id !== state.playerId && (e.homeSectorId === S || e.data?.homeSectorId === S) && e.data?.ambientSlot);
  const poses = () => ambient().map((e) => `${e.data.worldRecordId}@${Math.round(e.pos.x)},${Math.round(e.pos.z)}`).sort();
  const kill = (e) => { e.hull = 0; e.alive = false; sim.bus.emit('entity:killed', { id: e.id, killerId: state.playerId }); };
  const away = (seconds) => { w.enterSector(FAR); sim.runTicks(60); sim.runTicks(Math.round(seconds * 60)); w.enterSector(S); sim.runTicks(60); };
  w.enterSector(S);
  sim.runTicks(60);
  return { sim, state, w, ambient, poses, kill, away };
}

test('untouched sector: the same cast comes back at home after a long absence (no re-roll)', () => {
  const t = boot();
  const first = t.ambient();
  assert.ok(first.length >= 2, `pallas rolls a cast (${first.length})`);
  const homes = new Map(first.map((e) => [e.data.worldRecordId, e.data.ambientSlot.home]));
  t.away(200); // past the old 180 s memory window that used to re-roll the whole crowd
  const back = t.ambient();
  assert.equal(back.length, first.length, 'nobody added, nobody lost');
  for (const e of back) {
    const home = homes.get(e.data.worldRecordId);
    assert.ok(home, `returning ship ${e.data.worldRecordId} is one of the original cast, not a re-roll`);
    assert.ok(Math.hypot(e.pos.x - home.x, e.pos.z - home.z) < 1, 'it is back at its home');
  }
  assert.deepEqual(t.state.world.ambientCast[S].vacancies, []);
  t.sim.dispose();
});

test('one kill: the survivors stay, the slot stays empty, then a replacement arrives at a gate', () => {
  const t = boot();
  const first = t.ambient();
  const victim = first[0];
  const victimHome = victim.data.ambientSlot.home;
  t.kill(victim);
  t.sim.runTicks(10);
  t.away(240);
  const after = t.ambient();
  assert.equal(after.length, first.length - 1, 'the dead stay dead and the survivors are not forgotten');
  assert.ok(!after.some((e) => e.data.worldRecordId === victim.data.worldRecordId));
  assert.equal(t.state.world.ambientCast[S].vacancies.length, 1);

  t.away(AMBIENT_REPLACE_DELAY_S + 30);
  const refilled = t.ambient();
  assert.equal(refilled.length, first.length, 'the slot is filled again a game day later');
  const newcomer = refilled.find((e) => !first.some((f) => f.data.worldRecordId === e.data.worldRecordId));
  assert.ok(newcomer, 'the filler is a new ship, not the dead one resurrected');
  const gates = t.state.world.sectorContents[S].gates;
  const nearestGate = Math.min(...gates.map((g) => Math.hypot(g.pos.x - newcomer.pos.x, g.pos.z - newcomer.pos.z)));
  assert.ok(nearestGate < 400, `the replacement arrived at a gate (${Math.round(nearestGate)} WU)`);
  assert.deepEqual(newcomer.data.ambientSlot.home, victimHome, 'and it inherits the slot it fills');
  assert.deepEqual(t.state.world.ambientCast[S].vacancies, []);
  t.sim.dispose();
});

function bootFromHeadSave(mutate = null) {
  const envelope = JSON.parse(readFileSync(new URL('./fixtures/saves/world-head-v23.json', import.meta.url), 'utf8'));
  const sim = createSimulation({ seed: 4747, systems: [spawnBudget, world] });
  const { state } = sim;
  state.mode = 'flight';
  const player = sim.spawn({ type: 'ship', team: 0, pos: { x: 0, z: 0 }, vel: { x: 0, z: 0 }, hull: 140, hullMax: 140, radius: 6 });
  state.playerId = player.id;
  const data = JSON.parse(JSON.stringify(envelope.data.world));
  if (mutate) mutate(data);
  const w = sim.registry.get('world');
  w.deserialize(data);
  state.simTime = envelope.data.entities.simTime || 0;
  w.enterSector(S);
  sim.runTicks(30);
  const ambient = [...state.entities.values()].filter((e) => e.alive !== false && e.type === 'ship'
    && e.id !== state.playerId && (e.homeSectorId === S || e.data?.homeSectorId === S) && e.data?.ai);
  return { sim, state, envelope, ambient };
}

test('a save made at the 2026-11-20 checkpoint: Pallas keeps its survivors and adopts them as its cast', () => {
  const t = bootFromHeadSave();
  const victim = t.envelope._fixture.pallasVictimRecordId;
  const aliveRecords = Object.values(t.envelope.data.world.records.byId)
    .filter((r) => r.sectorId === S && r.kind === 'npc' && r.alive !== false);
  assert.ok(aliveRecords.length >= 1);
  assert.equal(t.ambient.length, aliveRecords.length, 'exactly the saved survivors, no second crowd on top');
  assert.ok(!t.ambient.some((e) => e.data.worldRecordId === victim), 'the saved kill stays dead');
  assert.ok(t.ambient.every((e) => e.data.ambientSlot), 'survivors are adopted as standing cast');
  assert.equal(t.state.world.ambientCast[S].target, aliveRecords.length);
  t.sim.dispose();
});

test('a checkpoint save whose survivors had already been forgotten no longer leaves Pallas empty', () => {
  const t = bootFromHeadSave((data) => {
    for (const [id, r] of Object.entries(data.records.byId)) {
      if (r.sectorId === S && r.kind === 'npc' && r.alive !== false) delete data.records.byId[id];
    }
  });
  assert.ok(t.ambient.length >= 1, `the tombstone no longer blocks the sector's cast (${t.ambient.length})`);
  assert.ok(t.state.world.ambientCast[S], 'and the cast is now on the ledger');
  t.sim.dispose();
});

test('the ledger survives a save round trip and old saves without it load clean', () => {
  const t = boot();
  t.kill(t.ambient()[0]);
  const saved = JSON.parse(JSON.stringify(t.w.serialize()));
  assert.ok(saved.ambientCast && saved.ambientCast[S], 'ledger is written once a sector rolled');
  assert.equal(saved.ambientCast[S].vacancies.length, 1);
  const restored = normalizeAmbientCast(saved.ambientCast);
  assert.deepEqual(restored[S].vacancies[0].home, saved.ambientCast[S].vacancies[0].home);
  assert.deepEqual(normalizeAmbientCast(undefined), {}, 'pre-ledger saves: empty ledger');
  assert.deepEqual(normalizeAmbientCast({ x: { vacancies: [{ diedAtT: 'bad' }] } }).x.vacancies, []);
  t.sim.dispose();
});
