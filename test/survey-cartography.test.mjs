// The survey pays (INF-U14, WF-10): a first deep read of a loss-linked wreck
// files a cartography claim, cold cases pay double, and surveyed-field
// milestones post chart bonuses. Generic debris still pays nothing.
import test from 'node:test';
import assert from 'node:assert/strict';
import { scanReveal } from '../src/systems/scanReveal.js';

function makeBus() {
  const handlers = new Map();
  return {
    on(name, fn) {
      if (!handlers.has(name)) handlers.set(name, []);
      handlers.get(name).push(fn);
    },
    off(name, fn) {
      const list = handlers.get(name) || [];
      handlers.set(name, list.filter((f) => f !== fn));
    },
    emit(name, p) {
      for (const fn of handlers.get(name) || []) fn(p);
    },
  };
}

function rig() {
  const state = {
    simTime: 1000, tick: 60000, playerId: 1,
    entities: new Map(), entityList: [],
    world: { currentSectorId: 'sector_test', sectors: { sector_test: { id: 'sector_test', name: 'Test Field' } } },
    lossLedger: { bySector: { sector_test: [] } },
    player: {},
  };
  const bus = makeBus();
  const sys = Object.create(scanReveal);
  sys.init({ state, bus });
  const grants = [];
  const investigated = [];
  const toasts = [];
  bus.on('economy:grantCredits', (p) => grants.push(p));
  bus.on('scan:wreckInvestigated', (p) => investigated.push(p));
  bus.on('toast', (p) => toasts.push(p));
  return { state, bus, sys, grants, investigated, toasts };
}

let nextId = 10;
function loss(ctx, lossId, extra = {}) {
  const entry = {
    lossId, kind: 'trader', factionId: 'faction_drift', sectorId: 'sector_test', simDay: 1,
    ...extra,
  };
  ctx.state.lossLedger.bySector.sector_test.push(entry);
  return entry;
}

function wreck(ctx, x, z, { lossId = null, pool = null } = {}) {
  const id = nextId++;
  const e = {
    id, type: 'wreck', alive: true, team: -1,
    pos: { x, y: 0, z }, vel: { x: 0, y: 0, z: 0 },
    radius: 8, hull: 10, hullMax: 10,
    data: {
      ...(lossId ? { provenance: { lossId } } : {}),
      ...(pool ? { salvagePool: { ...pool } } : {}),
    },
  };
  ctx.state.entities.set(id, e);
  ctx.state.entityList.push(e);
  return e;
}

function pulse(ctx, x = 0, z = 0) {
  ctx.bus.emit('scan:pulse', { pos: { x, z } });
}

test('a first deep read files a 150 cr cartography claim; a re-scan pays nothing', () => {
  const ctx = rig();
  loss(ctx, 'loss-1');
  wreck(ctx, 100, 0, { lossId: 'loss-1', pool: { cmdty_scrap_metal: 3 } });
  pulse(ctx);
  assert.equal(ctx.investigated.length, 1);
  assert.equal(ctx.investigated[0].lossId, 'loss-1');
  assert.equal(ctx.investigated[0].paid, 150, 'the event carries the payout');
  assert.equal(ctx.grants.length, 1);
  assert.equal(ctx.grants[0].amount, 150);
  assert.equal(ctx.grants[0].reason, 'survey_cartography');
  assert.equal(ctx.grants[0].lossId, 'loss-1');
  assert.ok(ctx.toasts.some((t) => /Survey logged/.test(t.text)));
  pulse(ctx);
  assert.equal(ctx.grants.length, 1, 'no double claim on re-scan');
});

test('a cold case pays double with its own toast', () => {
  const ctx = rig();
  loss(ctx, 'loss-cold');
  wreck(ctx, 100, 0, { lossId: 'loss-cold', pool: {} }); // picked clean
  pulse(ctx);
  assert.equal(ctx.investigated[0].cold, true);
  assert.equal(ctx.grants[0].amount, 300, 'double for the chart-only read');
  assert.equal(ctx.grants[0].cold, true);
  assert.ok(ctx.toasts.some((t) => /Cold case closed/.test(t.text)));
});

test('generic debris and shallow pulses pay nothing', () => {
  const ctx = rig();
  wreck(ctx, 100, 0, { pool: { cmdty_scrap_metal: 5 } }); // no ledger loss
  pulse(ctx);
  assert.equal(ctx.investigated.length, 0);
  assert.equal(ctx.grants.length, 0);
  const ctx2 = rig();
  loss(ctx2, 'loss-far');
  wreck(ctx2, 1500, 0, { lossId: 'loss-far', pool: { cmdty_scrap_metal: 5 } }); // contact band
  pulse(ctx2);
  assert.equal(ctx2.grants.length, 0, 'only deep reads file claims');
});

test('survey milestones post escalating chart bonuses, one toast each', () => {
  const ctx = rig();
  for (let i = 0; i < 6; i++) {
    loss(ctx, `loss-m${i}`);
    wreck(ctx, 100 + i * 10, i * 5, { lossId: `loss-m${i}`, pool: { cmdty_scrap_metal: 2 } });
  }
  pulse(ctx);
  const bonus = ctx.grants.filter((g) => g.reason === 'survey_chart_bonus');
  assert.deepEqual(bonus.map((g) => g.amount).sort((a, b) => a - b), [200, 450],
    'tier-3 and tier-6 bonuses posted');
  assert.ok(ctx.toasts.some((t) => /chart bonus 200/.test(t.text)));
  assert.ok(ctx.toasts.some((t) => /chart bonus 450/.test(t.text)));
  const count = bonus.length;
  pulse(ctx);
  assert.equal(ctx.grants.filter((g) => g.reason === 'survey_chart_bonus').length, count,
    'milestones pay once');
});
