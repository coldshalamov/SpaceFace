import test from 'node:test';
import assert from 'node:assert/strict';
import { createSimulation } from '../src/core/sim.js';
import { createKesslerScale } from '../src/systems/kesslerScale.js';
import { kesslerPadPosition } from '../src/systems/kesslerScaleWorksite.js';
import { KESSLER_SCALE } from '../src/data/kessler.js';
import { cargo, addCargo } from '../src/systems/cargo.js';
import { lootShards } from '../src/systems/lootShards.js';
import { mining } from '../src/systems/mining.js';
import { kesslerTrueRead } from '../src/characters/kesslerRules.js';

const IRON = 'cmdty_ore_iron';

// The real owners: the cargo system's jettison mints the physical pod, the mining system's
// collector drains its salvagePool — the scale only reads and labels what they produce.
function fixture() {
  const said = [];
  const sim = createSimulation({
    seed: 47,
    systems: [createKesslerScale(), cargo, lootShards, mining],
    updateOrder: [],
    helpers: { voice: { say: (m) => { said.push(m); return true; } } },
  });
  const s = sim.state, pad = kesslerPadPosition();
  s.mode = 'flight'; s.run.kind = 'adventure'; s.world.currentSectorId = KESSLER_SCALE.sectorId;
  s.story.flags = {}; s.story.beatIndex = 1;
  // No recorded handoff: the desk's delivered crate is not on the plate here, so the
  // only jettisoned cargo in these checks is the pod the cargo owner just minted.
  s.story.campaign47a = { stepProgress: { '1': { completed: [] } } };
  Object.assign(s.player.cargo, { capMass: 100, capVolume: 100 });
  const p = sim.spawn({ type: 'ship', isPlayer: true, team: 0, pos: pad, radius: 12, mass: 18, hull: 100, data: {} });
  s.playerId = p.id;
  const o = sim.registry.get('kesslerScale'), c = sim.registry.get('cargo'), m = sim.registry.get('mining');
  o._sync();
  addCargo(s, IRON, 17);
  assert.equal(c.jettison(IRON, 17, { bay: true, slot: 0 }), 17);
  const w = s.entityList.find((e) => e.alive && e.data?.jettisonedCargo);
  o.update(0, s);
  return { sim, s, p, w, o, c, m, said, tick: () => o.update(0, s) };
}

const scaleBeacons = (s) => s.entityList.filter((e) => e.alive && e.data?.kesslerScale === true);
const recoveryProps = (s) => s.entityList.filter((e) => e.alive && e.data?.kesslerFreightRecovery);
const tag = (w) => String(w.data?.scanLabel || '');
const receiptTag = (pod, units, name = 'Cargo pod') => {
  const { plateRead, trueRead } = pod.data.kesslerReceipt;
  return `${name} · WEIGHED ${plateRead.toFixed(1)} t · STAMP ${trueRead.toFixed(1)} t · ${units} u`;
};

test('the weighed pod keeps its receipt on its own tag; real collection returns the freight once', () => {
  const h = fixture();
  try {
    const stamp = kesslerTrueRead(h.w.mass);
    assert.equal(h.w.data.kesslerRead, true);
    assert.equal(h.w.data.kesslerReceipt.trueRead, stamp);
    assert.equal(tag(h.w), receiptTag(h.w, 17), 'the pod itself carries the receipt and the live units');
    assert.equal(recoveryProps(h.s).length, 0, 'no second beacon is minted for the fix');
    assert.equal(scaleBeacons(h.s).length, 1, 'only the scale board itself exists');
    assert.equal(h.s.player.cargo.items[IRON] || 0, 0);
    h.m._collectPayload(h.w, h.p);
    h.tick();
    assert.equal(h.s.player.cargo.items[IRON], 17, 'the whole pool comes home once');
    assert.equal(h.w.alive, false);
    h.tick();
    assert.equal(h.s.player.cargo.items[IRON], 17, 'no double-collect on a dead pod');
  } finally { h.sim.dispose(); }
});

test('partial actual collection updates the remaining units on the pod tag', () => {
  const h = fixture();
  try {
    h.s.player.cargo.capMass = 100;
    h.s.player.cargo.capVolume = 4; // iron volPerU 1.0 — four units fit
    h.m._collectPayload(h.w, h.p);
    h.tick();
    const held = h.s.player.cargo.items[IRON] || 0;
    assert.ok(held > 0 && held < 17);
    assert.equal(tag(h.w), receiptTag(h.w, 17 - held), 'the tag follows the drained pool');
    assert.equal(h.w.data.kesslerRead, true, 'weighed identity is preserved');
    h.s.player.cargo.capVolume = 100;
    h.m._collectPayload(h.w, h.p);
    h.tick();
    assert.equal(h.s.player.cargo.items[IRON], 17);
    assert.equal(h.w.alive, false);
  } finally { h.sim.dispose(); }
});

test('a multi-item pool never shows a stale single amount on the tag', () => {
  const h = fixture();
  try {
    // A manifest pod whose pool holds two commodities must not collapse to data.amount.
    h.w.data.salvagePool = { [IRON]: 10, cmdty_ore_copper: 5 };
    h.tick(); // the tracked tag refreshes off the real pool
    assert.equal(tag(h.w), receiptTag(h.w, 15));
    h.w.data.salvagePool = { [IRON]: 10, cmdty_ore_copper: 2 };
    h.tick();
    assert.equal(tag(h.w), receiptTag(h.w, 12));
    assert.equal(h.w.data.amount, 17, 'the stale single amount is never the shown figure');
  } finally { h.sim.dispose(); }
});

test('a second, differently-stamped real load flips the board and Kessler says the one line', () => {
  const h = fixture();
  try {
    assert.equal(tag(h.w).includes('WEIGHED'), true);
    assert.equal(h.said.length, 0);
    addCargo(h.s, IRON, 40);
    assert.equal(h.c.jettison(IRON, 40, { bay: true, slot: 1 }), 40);
    const second = h.s.entityList.find((e) => e.alive && e.data?.jettisonedCargo && e !== h.w);
    assert.ok(second);
    h.tick();
    const watch = h.s.story.flags[KESSLER_SCALE.comparisonFlag];
    assert.equal(watch?.second?.stamp, kesslerTrueRead(second.mass));
    assert.notEqual(watch.second.stamp, watch.first.stamp, 'a heavier real load reads a different stamp');
    const board = scaleBeacons(h.s)[0];
    assert.equal(board.data.scanLabel, `PLATE ${watch.second.plate.toFixed(1)} t · STAMP ${watch.second.stamp.toFixed(1)} t`);
    const lines = h.said.filter((m) => m.text === KESSLER_SCALE.comparisonLine);
    assert.equal(lines.length, 1, 'the one line, once, through the story voice');
    h.tick(); h.tick();
    assert.equal(h.said.filter((m) => m.text === KESSLER_SCALE.comparisonLine).length, 1);
    // The weighed pods keep their own tags — no synthetic recovery beacon appears.
    assert.equal(recoveryProps(h.s).length, 0);
    assert.equal(tag(second), receiptTag(second, 40));
  } finally { h.sim.dispose(); }
});

test('latched, weighed, released: the pod tag survives on the pod itself', () => {
  const h = fixture();
  try {
    const before = tag(h.w);
    h.s.player.tether = { targetId: h.w.id, active: true };
    h.tick();
    assert.equal(tag(h.w), before, 'a live line on the pod does not erase its receipt');
    h.w.data.masslineLatched = true;
    h.tick();
    assert.equal(tag(h.w), before);
    delete h.w.data.masslineLatched;
    h.s.player.tether = null;
    h.tick();
    assert.equal(tag(h.w), receiptTag(h.w, 17));
    assert.equal(recoveryProps(h.s).length, 0);
  } finally { h.sim.dispose(); }
});

test('the actual save serializer keeps the physical pod and its receipt; no derived beacon persists', async () => {
  const h = fixture();
  try {
    const { save } = await import('../src/save/saveSystem.js');
    const rows = save._serializeEntities.call({ state: h.s });
    assert.doesNotMatch(JSON.stringify(rows), /kesslerFreightRecovery/);
    const row = rows.persistent.find((e) => e.data?.jettisonedCargo);
    assert.ok(row?.data.kesslerReceipt);
    assert.match(row.data.scanLabel, /WEIGHED/);
    assert.equal(row.data.amount, 17);
  } finally { h.sim.dispose(); }
});

test('a persisted weighed pod re-materializes with its tag and refreshes on partial collection', async () => {
  const h = fixture();
  try {
    const { save } = await import('../src/save/saveSystem.js');
    const rows = save._serializeEntities.call({ state: h.s });
    const row = rows.persistent.find((e) => e.data?.jettisonedCargo && e.data?.kesslerReceipt);
    assert.ok(row);
    row.data.scanLabel = `Cargo pod · WEIGHED ${row.data.kesslerReceipt.trueRead.toFixed(1)} t · 17 u`;
    // The restore lane retires the old hull and respawns the envelope copy on a fresh generation.
    h.w.alive = false;
    save._spawnPersistentEntities.call({ state: h.s, helpers: h.sim.helpers }, [row]);
    const restored = h.s.entityList.find((e) => e.alive && e.type === 'payload' && e.data?.jettisonedCargo && e.data?.kesslerReceipt);
    assert.ok(restored);
    assert.notEqual(restored, h.w);
    assert.equal(restored.data.kesslerRead, true);
    assert.match(restored.data.scanLabel, /WEIGHED/);
    h.sim.bus.emit('save:loaded', {});
    h.tick();
    assert.equal(tag(restored), receiptTag(restored, 17), 'restore corrects the older stamp-only label');
    h.s.player.cargo.capVolume = 5;
    h.m._collectPayload(restored, h.p);
    h.tick();
    const held = h.s.player.cargo.items[IRON] || 0;
    assert.ok(held > 0 && held < 17);
    assert.equal(tag(restored), receiptTag(restored, 17 - held), 'the restored pod still answers for its real remainder');
    assert.equal(recoveryProps(h.s).length, 0);
  } finally { h.sim.dispose(); }
});

test('an old save with no comparison record and a stale-format tag is tolerated — nothing minted twice', async () => {
  const h = fixture();
  try {
    const { save } = await import('../src/save/saveSystem.js');
    // Legacy shape: weighed under the old receipt label, no pool key story, no record.
    delete h.s.story.flags[KESSLER_SCALE.comparisonFlag];
    h.w.data.scanLabel = `Iron freight · Scale 4 · plate 18.8t / stamp 20.0t · freight retained`;
    h.tick(); // discovery only — the old tag is preserved, not rewritten
    assert.equal(tag(h.w), 'Iron freight · Scale 4 · plate 18.8t / stamp 20.0t · freight retained');
    h.s.player.cargo.capVolume = 5;
    h.m._collectPayload(h.w, h.p);
    h.tick();
    const held = h.s.player.cargo.items[IRON] || 0;
    assert.ok(held > 0 && held < 17);
    // On first real change the tag is rebuilt from its honest parts — name kept, never minted.
    assert.equal(tag(h.w), receiptTag(h.w, 17 - held, 'Iron freight'));
    assert.equal(h.said.length, 0, 'nothing replays');
    const rows = save._serializeEntities.call({ state: h.s });
    assert.doesNotMatch(JSON.stringify(rows), /kesslerFreightRecovery/);
  } finally { h.sim.dispose(); }
});
