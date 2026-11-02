import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import test from 'node:test';

import { createBus } from '../src/core/eventBus.js';
import { createRegistry } from '../src/core/registry.js';
import { installSimCommandSink, uninstallSimCommandSink } from '../src/core/simLaneCommands.js';
import { createSimHost } from '../scripts/lib/simWorkerHost.mjs';
import { createSimCommandRing, pushLaneCommand } from '../scripts/lib/simCommandChannel.mjs';
import { applyDomainPathUpdate, DOMAIN_MIRROR_KEYS } from '../scripts/lib/simReadModel.mjs';

function applyHostReplyToMainReadModel(main, reply) {
  for (const key of DOMAIN_MIRROR_KEYS) {
    if (!key.includes('.') && main[key] === undefined) main[key] = {};
  }
  const holder = new Map();
  const touched = new Set();
  for (const update of reply.domainUpdates || []) {
    const segs = update.segs.length === 1 && update.segs[0].includes('.')
      ? update.segs[0].split('.') : update.segs;
    const root = segs[0];
    holder.clear();
    holder.set(root, main[root]);
    touched.clear();
    applyDomainPathUpdate(holder, { ...update, segs }, touched);
    main[root] = holder.get(root);
  }
  if (Number.isSafeInteger(reply.stateTick)) main.tick = reply.stateTick;
  if (Number.isFinite(reply.simTime)) main.simTime = reply.simTime;
}

test('paused worker drains a zero-step public drill-down input into the live drill owner', async () => {
  const host = createSimHost();
  try {
    const main = {};
    const initReply = await host.init({
      profile: 'production',
      seed: 4242,
      scenarioContract: JSON.parse(readFileSync(
        new URL('../src/data/scenarios/47a.scenario.json', import.meta.url), 'utf8',
      )),
    });
    applyHostReplyToMainReadModel(main, initReply);

    const pausedTick = host.host.state.tick;
    const sendPaused = (d) => {
      const ring = createSimCommandRing();
      assert.notEqual(pushLaneCommand(ring, { kind: 'domEvent', d }), null);
      return host.tick({ steps: 0, commands: ring.drain() }).then((reply) => {
        applyHostReplyToMainReadModel(main, reply);
        return reply;
      });
    };

    const beginReply = await sendPaused({ type: 'drillCall', op: 'begin', asteroidId: 545 });
    const state = host.host.state;
    const drill = state.drill;
    assert.equal(drill.active, true, 'the worker creates the public drill session while paused');
    assert.ok(beginReply.domainUpdates.some((update) => update.segs[0] === 'drill'),
      'the actual paused host reply publishes the newly created drill domain');
    assert.equal(main.drill?.active, true, 'the main read model applies the paused begin reply');
    assert.notEqual(main.drill, drill, 'the main mirror receives a detached domain snapshot');
    const { col, row } = drill.avatar;
    assert.equal(row, 0, 'new drill sessions start at the surface row');

    // Give the first inward cell an empty face so the public down input has one deterministic,
    // immediately visible result without requiring a simulation tick or a generated geology seed.
    drill.field[col][row + 1] = { type: 'empty', hp: 0, maxHp: 0, ore: null, tierReq: 1 };
    const held = { left: false, right: false, up: false, down: true };
    const opts = { impulse: true };
    const facadeRegistry = createRegistry({
      simLane: 'worker', state, bus: createBus(), helpers: {},
    });
    const facade = facadeRegistry.get('drill');
    const emitted = [];
    installSimCommandSink((descriptor) => emitted.push(descriptor));
    try { facade.tickInput(held, 1 / 60, opts); } finally { uninstallSimCommandSink(); }
    assert.equal(emitted.length, 1);
    assert.deepEqual(emitted[0], {
      kind: 'domEvent',
      d: { type: 'drillTick', held, dt: 1 / 60, opts },
    }, 'the worker facade emits the screen-owned drill clock as a DOM-event command');
    const firstInputReply = await sendPaused(emitted[0].d);
    assert.ok(firstInputReply.domainUpdates.some((update) => update.segs[0] === 'drill'));

    assert.equal(state.tick, pausedTick, 'paused drill work does not advance the world tick');
    assert.equal(main.tick, pausedTick, 'the applied main read model stays on the same world tick');
    assert.equal(drill.avatar.row, row + 1,
      'a zero-step worker command still applies the real drill controller input');
    assert.equal(main.drill.avatar.row, row + 1,
      'the actual host reply and domain application publish the moved avatar to main');

    let lastElapsed = main.drill.sessionElapsed;
    const mainDrillRoot = main.drill;
    for (let i = 0; i < 4; i++) {
      let nextDescriptor;
      installSimCommandSink((descriptor) => { nextDescriptor = descriptor; });
      try { facade.tickInput({ left: false, right: false, up: false, down: true }, 1 / 60, {}); }
      finally { uninstallSimCommandSink(); }
      assert.ok(nextDescriptor, 'each paused UI-clock tick emits through the worker facade');
      const reply = await sendPaused(nextDescriptor.d);
      assert.ok(reply.domainUpdates.some((update) => update.segs[0] === 'drill'),
        'each changed paused drill snapshot is shipped by the host domain differ');
      assert.equal(state.tick, pausedTick);
      assert.equal(main.tick, pausedTick);
      assert.equal(main.drill, mainDrillRoot,
        'canonical application updates the existing main drill root in place');
      assert.ok(main.drill.sessionElapsed > lastElapsed,
        'the main mirror receives drill elapsed time from successive same-world-tick replies');
      assert.equal(main.drill.avatar.row, drill.avatar.row,
        'the published main avatar tracks the authoritative UI-clock movement');
      assert.equal(JSON.stringify(main.drill.field), JSON.stringify(drill.field),
        'the published main field tracks the authoritative board at the same world tick');
      assert.notEqual(main.drill.avatar, drill.avatar,
        'the main avatar remains a detached copy of worker authority');
      assert.notEqual(main.drill.field, drill.field,
        'the main field remains a detached copy of worker authority');
      lastElapsed = main.drill.sessionElapsed;
    }
    assert.equal(main.drill.avatar.row, drill.avatar.row);
    assert.ok(lastElapsed > 0);
    assert.equal(state.tick, pausedTick);
    assert.equal(main.tick, pausedTick);
  } finally {
    host.shutdown();
  }
});
