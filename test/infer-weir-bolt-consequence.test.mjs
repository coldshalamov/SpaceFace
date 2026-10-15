// INFERENCE unit — bolting the customs weir was paperwork: one scolding voice line, a hidden
// +15% scan-roll bump, and `law:response` (the canonical law-loop event) dying on the bus with
// zero subscribers. The law now answers the bolt: the gate's own first-party observation
// prices into WANTED heat (one unread transit stays suspicion, breaking a live read is the
// stronger evidence, repeat runners tip over into the existing hunt machinery), and the
// canonical row gets its designed bark leg — the booth's filing read back in the lawful
// register, deduped per gate per kind per 10-minute bucket.
import test from 'node:test';
import assert from 'node:assert/strict';

import { heat } from '../src/systems/heat.js';
import { barkDirector } from '../src/systems/barkDirector.js';
import { isPlayerWanted } from '../src/systems/heat.js';
import { lawResponseBarkFor } from '../src/data/barks.js';

function makeBus() {
  const handlers = new Map();
  const log = [];
  return {
    emitLog: log,
    on(evt, fn) {
      if (!handlers.has(evt)) handlers.set(evt, []);
      handlers.get(evt).push(fn);
    },
    off(evt, fn) {
      const list = handlers.get(evt) || [];
      handlers.set(evt, list.filter((h) => h !== fn));
    },
    emit(evt, payload) {
      log.push({ evt, payload });
      for (const fn of handlers.get(evt) || []) fn(payload);
      return true;
    },
  };
}

function makeState({ heatValue = 0, simTime = 1000 } = {}) {
  return {
    meta: { seed: 4242 },
    simTime,
    tick: 100,
    mode: 'flight',
    playerId: 'player',
    player: {
      credits: 50000, heat: heatValue,
      pos: { x: 0, z: 0 }, rot: 0, alive: true,
    },
    entities: new Map(),
    ui: {},
    world: { currentSectorId: 'sector_dione_lane' },
  };
}

function bootHeat(state) {
  const bus = makeBus();
  const heatSys = Object.create(heat);
  heatSys.init({ state, bus, helpers: {}, registry: { get() { return null; } } });
  return { bus, heatSys, state };
}

function bootBarks(state) {
  const said = [];
  const bus = makeBus();
  const barks = Object.create(barkDirector);
  barks.init({ state, bus, helpers: { voice: { say: (entry) => { said.push(entry); return true; } } }, registry: { get() { return null; } } });
  return { bus, barks, said };
}

const weirRow = (kind, t = 1000) => ({
  action: 'weir_bolt', weirId: 'weir_dione', stationId: 'station_tethys_customs',
  factionId: 'faction_scn', kind, tick: 60, t,
});

test('breaking a live read prices in at the stronger evidence', () => {
  const { bus, state } = bootHeat(makeState());
  bus.emit('customs:weirBolt', weirRow('read_bolt'));
  assert.ok(Math.abs(state.player.heat - 0.10) < 1e-9, `heat 0.10, got ${state.player.heat}`);
});

test('an unread transit stays suspicion: below the WANTED line', () => {
  const { bus, state } = bootHeat(makeState());
  bus.emit('customs:weirBolt', weirRow('speed_run'));
  assert.ok(Math.abs(state.player.heat - 0.05) < 1e-9, `heat 0.05, got ${state.player.heat}`);
  assert.equal(isPlayerWanted(state), false, 'one clean bolt is not yet a hunt');
});

test('repeat runners tip over into the hunt the machinery already owns', () => {
  const { bus, state } = bootHeat(makeState());
  bus.emit('customs:weirBolt', weirRow('speed_run'));
  bus.emit('customs:weirBolt', weirRow('read_bolt'));
  assert.ok(state.player.heat >= 0.15, `heat ${state.player.heat} crosses WANTED`);
  assert.equal(isPlayerWanted(state), true);
});

test('the gate filing reads back once in the lawful register, per kind', () => {
  const { bus, said } = bootBarks(makeState());
  bus.emit('law:response', weirRow('speed_run'));
  bus.emit('law:response', weirRow('read_bolt', 1001));
  assert.equal(said.length, 2, 'one filing line per kind');
  assert.ok(said.every((s) => s.channel === 'bark' && s.factionId === 'faction_scn'));
  assert.notEqual(said[0].text, said[1].text, 'the read bolt names what the gate kept');
  assert.equal(said[0].text, lawResponseBarkFor({ action: 'weir_bolt', kind: 'speed_run' }));
});

test('a repeat run inside the bucket does not restate the filing; a later one speaks', () => {
  const { bus, said } = bootBarks(makeState());
  bus.emit('law:response', weirRow('speed_run', 1000));
  bus.emit('law:response', weirRow('speed_run', 1100));
  bus.emit('law:response', weirRow('speed_run', 1199));
  assert.equal(said.length, 1, 'ten minutes of runs file once');
  bus.emit('law:response', weirRow('speed_run', 1800));
  assert.equal(said.length, 2, 'a later window files again');
});

test('non-weir law:response rows stay silent, and a bare payload rings nothing', () => {
  const { bus, said } = bootBarks(makeState());
  bus.emit('law:response', { action: 'checkpoint_posted', t: 1000 });
  bus.emit('law:response', { action: 'warrant_released', t: 1000 });
  bus.emit('law:response', null);
  assert.equal(said.length, 0);
});
