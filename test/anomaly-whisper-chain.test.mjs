// INFERENCE U1 (WF-10 polish) — anomaly_whisper is a complete discovery chain:
// the line is the clue, a physical source is placed nearby, and the player can
// close in to identify it (survey data + a wreck to strip), scan first for a
// range hint, destroy it from afar for partial data, ignore it, or let it fade.
// Drives the real director + script on fixed seeds; no wall clock, no RNG.
import test from 'node:test';
import assert from 'node:assert/strict';

import { createSimulation } from '../src/core/sim.js';
import { encounterDirector } from '../src/systems/encounterDirector.js';
import { ENCOUNTERS, WHISPER_LINES, receiptText } from '../src/data/encounters.js';

const SHAPE = 'anomaly_whisper';
const SECTOR = 'sector_veil_nebula';

function boot(seed = 424207) {
  const sim = createSimulation({ seed, systems: [encounterDirector] });
  const player = sim.spawn({
    type: 'ship', team: 0, pos: { x: 0, z: 0 }, vel: { x: 0, z: 0 },
    radius: 8, mass: 100, hull: 100, hullMax: 100,
    data: { intent: {}, ai: {} },
  });
  sim.state.playerId = player.id;
  sim.state.mode = 'flight';
  sim.state.world.currentSectorId = SECTOR;
  return { sim, state: sim.state, bus: sim.bus, director: sim.registry.get('encounterDirector'), player };
}

function record(t, names) {
  const rows = [];
  for (const name of names) t.bus.on(name, (payload) => rows.push({ name, payload }));
  return rows;
}

function force(t, suffix, anchor = { x: 0, z: 0 }) {
  const encounterId = `whisper-test:${suffix}`;
  const result = t.director.requestAuthoredEncounter({
    shapeId: SHAPE, encounterId, sectorId: SECTOR, anchor, force: true,
  });
  assert.equal(result.ok, true, `${suffix}: ${JSON.stringify(result)}`);
  return encounterId;
}

const liveOf = (t, id) => t.state.encounterDirector.live[id];
const rowsOf = (rows, name) => rows.filter((r) => r.name === name).map((r) => r.payload);

function sourceOf(t, id) {
  const live = liveOf(t, id);
  return t.state.entities.get(live.data.sourceId);
}

function step(t, n = 3) {
  for (let s = 0; s < n; s++) t.sim.step(1);
}

test('firing places one scannable source in the readability band and speaks the clue once', () => {
  const t = boot();
  const rows = record(t, ['encounter:voice', 'encounter:choiceOffered', 'encounter:resolved']);
  const id = force(t, 'fire');
  const live = liveOf(t, id);
  assert.equal(live.phase, 'seek');

  const src = sourceOf(t, id);
  assert.ok(src, 'a physical source exists');
  assert.equal(src.data.scanLabel, 'Unresolved Signal');
  assert.equal(src.data.storyPropKind, 'anomaly_whisper_source');
  const dist = Math.hypot(src.pos.x, src.pos.z);
  assert.ok(dist >= 120 && dist <= 380, `source sits 120-380 WU out (got ${dist.toFixed(1)})`);

  const voices = rowsOf(rows, 'encounter:voice');
  const primary = voices.filter((v) => v.primary);
  assert.equal(primary.length, 1, 'exactly one primary line per encounter');
  assert.ok(WHISPER_LINES.includes(primary[0].text), 'the clue is still the whisper line');

  const offers = rowsOf(rows, 'encounter:choiceOffered');
  assert.equal(offers.length, 1);
  assert.deepEqual(offers[0].options.map((o) => o.id), ['approach', 'scan', 'ignore']);
  assert.equal(rowsOf(rows, 'encounter:resolved').length, 0, 'nothing resolves on fire');
});

test('same seed fires the identical clue and site (deterministic)', () => {
  const a = boot();
  const ra = record(a, ['encounter:voice']);
  const ida = force(a, 'det');
  const b = boot();
  const rb = record(b, ['encounter:voice']);
  const idb = force(b, 'det');
  assert.equal(rowsOf(ra, 'encounter:voice')[0].text, rowsOf(rb, 'encounter:voice')[0].text);
  const sa = sourceOf(a, ida);
  const sb = sourceOf(b, idb);
  assert.equal(sa.pos.x, sb.pos.x);
  assert.equal(sa.pos.z, sb.pos.z);
});

test('closing in identifies the source: data money, comms log, a wreck to strip, receipt', () => {
  const t = boot();
  const rows = record(t, ['encounter:resolved', 'encounter:receipt', 'economy:grantCredits', 'comms:log']);
  const id = force(t, 'identify');
  const src = sourceOf(t, id);
  t.player.pos.x = src.pos.x;
  t.player.pos.z = src.pos.z;
  step(t);

  assert.equal(liveOf(t, id), undefined, 'the encounter resolved');
  const resolved = rowsOf(rows, 'encounter:resolved');
  assert.equal(resolved.length, 1);
  assert.equal(resolved[0].outcome, 'identified');

  const grants = rowsOf(rows, 'economy:grantCredits');
  assert.equal(grants.length, 1, 'one consequence intent, through the economy owner');
  assert.equal(grants[0].amount, 90);
  assert.equal(grants[0].reason, 'survey:whisper');

  const logs = rowsOf(rows, 'comms:log').filter((l) => l.from === 'SURVEY');
  assert.equal(logs.length, 1);

  const wrecks = [...t.state.entities.values()].filter((e) => e.data && e.data.scanLabel === 'Opened Signal Source');
  assert.equal(wrecks.length, 1);
  assert.deepEqual(wrecks[0].data.salvagePool, { cmdty_salvage_electronics: 2, cmdty_scrap_metal: 2 });

  const receipts = rowsOf(rows, 'encounter:receipt');
  assert.equal(receipts.length, 1);
  assert.match(receipts[0].text, /SIGNAL IDENTIFIED/);
  assert.equal(t.state.encounterDirector.stats.whisperIdentified, 1);
});

test('repeat identifications pay more: knowledge accumulates into value', () => {
  const t = boot();
  const rows = record(t, ['economy:grantCredits']);
  for (const suffix of ['first', 'second']) {
    const id = force(t, suffix);
    const src = sourceOf(t, id);
    t.player.pos.x = src.pos.x;
    t.player.pos.z = src.pos.z;
    step(t);
  }
  const grants = rowsOf(rows, 'economy:grantCredits');
  assert.deepEqual(grants.map((g) => g.amount), [90, 120]);
});

test('scan pulse near the source gives one range hint; far pulses stay silent', () => {
  const t = boot();
  const rows = record(t, ['encounter:voice']);
  const id = force(t, 'scan');
  const before = rows.length;
  t.bus.emit('scan:pulse', {});
  step(t, 1);
  const hints = rows.slice(before).filter((r) => r.name === 'encounter:voice');
  assert.equal(hints.length, 1);
  assert.match(hints[0].payload.text, /Hold it on your scanner/);

  t.bus.emit('scan:pulse', {});
  step(t, 1);
  assert.equal(rows.length, before + 1, 'the hint is given once');

  t.player.pos.x = 5000;
  t.player.pos.z = 0;
  const id2 = force(t, 'scan-far');
  assert.ok(liveOf(t, id2), 'second encounter live while player is far');
  const farBefore = rows.length;
  t.bus.emit('scan:pulse', {});
  step(t, 1);
  assert.equal(rows.length, farBefore, 'no hint beyond scanTellR');
});

test('destroying the source pays partial data and no wreck', () => {
  const t = boot();
  const rows = record(t, ['encounter:resolved', 'economy:grantCredits']);
  const id = force(t, 'broken');
  const src = sourceOf(t, id);
  t.bus.emit('entity:killed', { id: src.id, killerId: t.player.id, type: src.type, pos: { ...src.pos } });
  step(t, 1);
  const resolved = rowsOf(rows, 'encounter:resolved');
  assert.equal(resolved.length, 1);
  assert.equal(resolved[0].outcome, 'broken');
  const grants = rowsOf(rows, 'economy:grantCredits');
  assert.equal(grants.length, 1);
  assert.equal(grants[0].amount, 30);
  const wrecks = [...t.state.entities.values()].filter((e) => e.data && e.data.scanLabel === 'Opened Signal Source');
  assert.equal(wrecks.length, 0, 'shooting it yields data, not the stripping verb');
});

test('ignore and deadline end the encounter silently', () => {
  const t = boot();
  const rows = record(t, ['encounter:resolved', 'encounter:receipt']);
  const ignoreId = force(t, 'ignore');
  t.bus.emit('encounter:choose', { encounterId: ignoreId, choiceId: 'ignore' });
  step(t, 1);
  assert.equal(rowsOf(rows, 'encounter:resolved')[0].outcome, 'ignored');

  const fadeId = force(t, 'fade');
  liveOf(t, fadeId).deadlineAt = 0;
  step(t, 1);
  const outcomes = rowsOf(rows, 'encounter:resolved').map((r) => r.outcome);
  assert.deepEqual(outcomes, ['ignored', 'faded']);
  assert.equal(rowsOf(rows, 'encounter:receipt').length, 0, 'quiet exits carry no receipt');
});

test('catalog carries the chain tuning and factual receipts', () => {
  const def = ENCOUNTERS[SHAPE];
  assert.equal(def.windowS, 420);
  assert.equal(def.investigateR, 70);
  assert.equal(def.scanTellR, 700);
  assert.equal(def.identifyPay, 90);
  assert.ok(receiptText(SHAPE, 'identified', { name: 'a dead survey relay', pay: 90}).length > 0);
  assert.ok(receiptText(SHAPE, 'broken', { pay: 30 }).length > 0);
  assert.equal(receiptText(SHAPE, 'faded', {}), '', 'fades stay silent');
});
