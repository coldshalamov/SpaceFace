import test from 'node:test';
import assert from 'node:assert/strict';
import { createSimulation } from '../src/core/sim.js';
import { chronicler } from '../src/systems/chronicler.js';
import { logbookEntries, logbookRecap } from '../src/chronicler/logbook.js';
import { createLogbookMedia, selectedLogbookFrame, logbookStill } from '../src/ui/logbookMedia.js';
import { createLogbookRecap, createRecapClock, LOGBOOK_RECAP_MS } from '../src/ui/logbookRecap.js';
import { fakeDom, textLines, findButtons } from './helpers/fake-dom.mjs';

function run() {
  const sim = createSimulation({ seed: 4242, systems: [chronicler] });
  sim.state.mode = 'flight'; sim.state.meta.createdAt = 'logbook-4242';
  sim.state.world.currentSectorId = 'sector_helios'; sim.state.playerId = 1;
  const record = (id, tick) => {
    sim.state.tick = tick; sim.state.simTime = tick / 60;
    sim.bus.emit('entity:killed', { id, victimId: id, victimName: `Gull ${id}`, killerId: 1, killerName: 'You',
      cause: 'kinetic', pos: { x: 12, z: 30 } });
    sim.registry.get('chronicler').update(1 / 60, sim.state);
  };
  record(7, 600); record(8, 1200);
  return sim;
}
function memoryStore() {
  const records = new Map();
  return { records, async all() { return [...records.values()]; }, async put(row) { records.set(row.key, row); return true; }, async close() {} };
}
function urls() {
  let seq = 0;
  return { revoked: [], createObjectURL() { return `blob:logbook-${++seq}`; }, revokeObjectURL(url) { this.revoked.push(url); } };
}

test('451: journal derives chronological house prose from real Chronicler receipts and survives JSON reload', () => {
  const { state } = run(), before = JSON.stringify(state.chronicler);
  const entries = logbookEntries(state);
  assert.equal(entries.length, 2);
  assert.match(entries[0].body, /You destroyed Gull 8/);
  assert.match(entries[1].body, /You destroyed Gull 7/);
  assert.ok(entries[0].at > entries[1].at);
  assert.deepEqual(logbookEntries(JSON.parse(JSON.stringify({ ...state, entities: undefined }))), entries);
  assert.equal(JSON.stringify(state.chronicler), before, 'presentation is never an archive writer');
  assert.equal(logbookRecap(state)[0].id, entries[1].id, 'previously tells the recent sequence in order');
  assert.match(logbookEntries({})[0].body, /next choice is yours/, 'the opening page is useful before a deed');
});

test('451: Moment Machine picks the actual payoff still, never a nearby unrelated session picture', () => {
  const entry = logbookEntries(run().state)[0];
  const frames = [{ tick: 1000, blob: new Blob(['before']) }, { tick: 1200, blob: new Blob(['payoff']) }];
  const picked = selectedLogbookFrame(entry, { ring: { frames } });
  assert.equal(picked.frame, frames[1]); assert.equal(picked.moment.payoffTick, 1200);
  assert.equal(selectedLogbookFrame(entry, { ring: { frames: [frames[0]] } }), null);
  assert.equal(selectedLogbookFrame({ facts: [] }, { ring: { frames } }), null);
});

test('451: still capture persists outside GameState and restores after presentation teardown', async () => {
  const { state, bus } = run(), store = memoryStore(), urlApi = urls();
  const before = JSON.stringify(state.chronicler), blob = new Blob(['real frame'], { type: 'image/jpeg' });
  const entry = logbookEntries(state)[0];
  const options = { store, urlApi, footage: () => ({ ring: { frames: [{ tick: 1200, blob }] } }) };
  const first = createLogbookMedia({ state, bus }, options);
  await first.restore(); await first.frame();
  assert.match(logbookStill(state, entry), /^blob:/); assert.equal(store.records.size, 1);
  const saved = [...store.records.values()][0];
  assert.equal(saved.blob, blob); assert.equal(saved.tick, 1200); assert.match(saved.momentId, /logged_kill/);
  first.dispose(); assert.equal(logbookStill(state, entry), null);
  const second = createLogbookMedia({ state, bus }, { ...options, footage: () => null });
  await second.restore(); assert.match(logbookStill(state, entry), /^blob:/);
  const unrelated = { ...entry, facts: entry.facts.map(fact => ({ ...fact, tick: fact.tick + 600 })) };
  assert.equal(logbookStill(state, unrelated), null, 'a reused seed/story id cannot borrow another deed’s image');
  assert.equal(JSON.stringify(state.chronicler), before);
  second.dispose(); assert.ok(urlApi.revoked.length >= 2);
});

test('451: a late decode is discarded across a new loaded run', async () => {
  const { state, bus } = run(), store = memoryStore(), urlApi = urls();
  let finish;
  const media = createLogbookMedia({ state, bus }, { store, urlApi,
    footage: () => ({ ring: { frames: [{ tick: 1200, blob: new Blob(['frame']) }] } }),
    decode: () => new Promise(resolve => { finish = resolve; }) });
  await media.restore(); const capture = media.frame();
  state.meta.createdAt = 'other-run'; media.reload(); finish(new Blob(['stale'])); await capture;
  assert.equal(store.records.size, 0); assert.equal(logbookStill(state, logbookEntries(state)[0]), null);
  media.dispose();
});

test('451: recap gives twenty readable seconds, excluding loading and pause time', () => {
  let now = 0; const clock = createRecapClock(() => now);
  assert.equal(clock.step(3, false).visible, false);
  now = 50000; assert.equal(clock.step(3).page, 0);
  now += 7000; assert.equal(clock.step(3).page, 1);
  clock.step(3, false); now += 100000; assert.equal(clock.step(3).page, 1);
  now += 13000; assert.equal(clock.step(3).visible, false);
  assert.equal(LOGBOOK_RECAP_MS, 20000);
});

test('451: load recap renders prose, dismisses, and cleans up without gameplay intents', async () => {
  const { state, bus } = run(), previous = globalThis.document, doc = fakeDom();
  const make = doc.createElement;
  doc.createElement = tag => {
    const node = make(tag);
    node.replaceChildren = (...children) => { node.children.length = 0; node.append(...children); };
    node.remove = () => { if (node.parentNode) node.parentNode.children = node.parentNode.children.filter(child => child !== node); };
    return node;
  };
  const root = doc.createElement('div'); root.id = 'ui-root'; doc.head.appendChild(root);
  globalThis.document = doc;
  let time = 0, recap;
  try {
    recap = createLogbookRecap({ state, bus }, { document: doc, now: () => time,
      media: { store: memoryStore(), urlApi: urls(), footage: () => null } });
    bus.emit('save:loaded', {}); recap.frame();
    assert.match(textLines(root).join(' '), /Previously, on your run/);
    assert.match(textLines(root).join(' '), /You destroyed Gull/);
    assert.equal(root.children[0].hidden, false);
    findButtons(root)[0].click(); assert.equal(root.children[0].hidden, true);
    time += 500; recap.frame(); assert.equal(root.children[0].hidden, true);
    bus.emit('save:loaded', {}); state.paused = true; recap.frame();
    assert.equal(root.children[0].hidden, true);
    state.paused = false; recap.frame(); assert.equal(root.children[0].hidden, false);
    recap.dispose(); assert.equal(root.children.length, 0);
    await Promise.resolve();
  } finally { recap?.dispose(); globalThis.document = previous; }
});
