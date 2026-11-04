import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import test from 'node:test';
import { createSimHost } from '../scripts/lib/simWorkerHost.mjs';
import { createSimCommandRing } from '../scripts/lib/simCommandChannel.mjs';
import { installSimCommandSink, uninstallSimCommandSink } from '../src/core/simLaneCommands.js';
import { createLaneSystemFacade } from '../src/runtime/laneSystemFacades.js';

function deferred() {
  let resolve;
  const promise = new Promise((done) => { resolve = done; });
  return { promise, resolve };
}

test('save import uses the production worker command boundary and save facade', async (t) => {
  const api = createSimHost();
  const fileReaderDescriptor = Object.getOwnPropertyDescriptor(globalThis, 'FileReader');
  const readers = [];
  let serial = 0;
  const replies = [];
  const descriptors = [];
  // Only the browser's byte reader is substituted. RPC dispatch, async settlement,
  // reply serialization, canonical malformed-save validation and UI verdict are real.
  globalThis.FileReader = class {
    readAsText(file) { this.file = file; readers.push(this); }
  };
  const dispatch = async (descriptor) => {
    descriptors.push(descriptor);
    const ring = createSimCommandRing();
    ring.pushRpc(descriptor.id, descriptor.op, descriptor.args);
    const reply = structuredClone(await api.tick({
      tick: ++serial, steps: 0, commands: ring.drain(),
    }));
    replies.push(reply);
    return reply.rpcAcks.find((ack) => ack.id === descriptor.id);
  };
  const rpc = (op, args) => dispatch({ id: `import-test-${serial + 1}`, op, args });
  const beginFileImport = (facade, text, slot) => {
    const done = deferred();
    const callbacks = [];
    const beforeReaders = readers.length;
    facade.importFile({ size: text.length }, (ok) => {
      callbacks.push(ok);
      done.resolve(ok);
    }, slot);
    assert.equal(readers.length, beforeReaders + 1);
    const reader = readers.at(-1);
    reader.result = text;
    reader.onload();
    return { done: done.promise, callbacks };
  };

  try {
    await api.init({ profile: 'production', seed: 7407,
      scenarioContract: JSON.parse(readFileSync(new URL('../src/data/scenarios/47a.scenario.json', import.meta.url), 'utf8')) });
    const { state, registry, bus } = api.host;
    const save = registry.get('save');
    const facade = createLaneSystemFacade({ state, bus })('save');
    const withImporter = async (importer, run) => {
      const prior = save.importString;
      save.importString = importer;
      try { await run(); } finally { save.importString = prior; }
    };
    const errors = [];
    const unsubscribe = bus.on('save:error', (payload) => errors.push(payload));
    t.after(() => unsubscribe?.());

    await t.test('awaits the asynchronous owner before a clone-safe worker reply', async () => {
      const gate = deferred();
      const called = deferred();
      let returned = false;
      await withImporter((json, slot) => {
        called.resolve({ json, slot });
        return gate.promise;
      }, async () => {
        const pending = rpc('saveImport', { json: '{"fixture":"bridge"}', slot: '2' });
        pending.then(() => { returned = true; }, () => { returned = true; });
        try {
          assert.deepEqual(await called.promise, { json: '{"fixture":"bridge"}', slot: '2' });
          assert.equal(returned, false, 'the worker cannot acknowledge an unfinished import');
          gate.resolve(true);
          assert.deepEqual(await pending, {
            id: 'import-test-1', ok: true, result: { ok: true, result: null },
          });
        } finally { gate.resolve(false); }
      });
    });

    await t.test('facade preserves the selected destination and waits for owner success', async () => {
      const gate = deferred();
      const called = deferred();
      installSimCommandSink(dispatch);
      try {
        await withImporter((json, slot) => {
          called.resolve({ json, slot });
          return gate.promise;
        }, async () => {
          const attempt = beginFileImport(facade, '{"fixture":"selected"}', '4');
          try {
            assert.deepEqual(await called.promise, { json: '{"fixture":"selected"}', slot: '4' });
            assert.deepEqual(attempt.callbacks, [], 'file read alone cannot finish the import');
            gate.resolve(true);
            assert.equal(await attempt.done, true);
            assert.deepEqual(attempt.callbacks, [true]);
          } finally { gate.resolve(false); }
        });
      } finally { uninstallSimCommandSink(); }
    });

    await t.test('canonical malformed import is rejected without losing the live world or worker', async () => {
      const before = { entities: state.entities, world: state.world, tick: state.tick,
        mode: state.mode, playerId: state.playerId, currentSlot: state.save.currentSlot };
      installSimCommandSink(dispatch);
      try {
        const attempt = beginFileImport(facade, '{not a save envelope', '3');
        assert.equal(await attempt.done, false);
        assert.deepEqual(attempt.callbacks, [false]);
        const ack = replies.at(-1).rpcAcks[0];
        assert.equal(ack.ok, true, 'the RPC transport delivered the owner refusal');
        assert.equal(ack.result.ok, false);
        assert.equal(errors.at(-1).slot, '3');
        assert.equal(errors.at(-1).reason, 'parse_failed');
        assert.deepEqual({ entities: state.entities, world: state.world, tick: state.tick,
          mode: state.mode, playerId: state.playerId, currentSlot: state.save.currentSlot }, before);
        assert.equal(state.entities, before.entities);
        assert.equal(state.world, before.world);
        assert.equal((await rpc('noop', {})).ok, true, 'the next command remains usable');
      } finally { uninstallSimCommandSink(); }
    });

    await t.test('an asynchronous domain refusal is not reported as successful transport', async () => {
      installSimCommandSink(dispatch);
      try {
        await withImporter(async () => ({ ok: false, reason: 'restore-refused' }), async () => {
          const attempt = beginFileImport(facade, '{"fixture":"refused"}', '2');
          assert.equal(await attempt.done, false);
          const ack = replies.at(-1).rpcAcks[0];
          assert.equal(ack.ok, true);
          assert.deepEqual(ack.result, { ok: false, result: { ok: false, reason: 'restore-refused' } });
        });
      } finally { uninstallSimCommandSink(); }
    });

    await t.test('an asynchronous owner exception becomes a clone-safe failed reply', async () => {
      installSimCommandSink(dispatch);
      try {
        await withImporter(async () => { throw new Error('restore-disk-unavailable'); }, async () => {
          const attempt = beginFileImport(facade, '{"fixture":"throw"}', '2');
          assert.equal(await attempt.done, false);
          assert.deepEqual(attempt.callbacks, [false]);
          const ack = replies.at(-1).rpcAcks[0];
          assert.equal(ack.ok, false);
          assert.equal(ack.reason, 'restore-disk-unavailable');
          assert.equal(ack.op, 'saveImport');
          assert.equal((await rpc('noop', {})).ok, true);
        });
      } finally { uninstallSimCommandSink(); }
    });

    await t.test('an omitted destination remains the canonical owner first-empty choice', async () => {
      const prior = save._firstEmptyImportSlot;
      const choices = [];
      save._firstEmptyImportSlot = function () {
        const slot = prior.call(this);
        choices.push(slot);
        return slot;
      };
      installSimCommandSink(dispatch);
      try {
        const attempt = beginFileImport(facade, '{not a save envelope');
        assert.equal(await attempt.done, false);
        assert.equal(descriptors.at(-1).args.slot, null);
        assert.equal(choices.length, 1, 'the bridge must not select Quick for the owner');
        assert.match(choices[0], /^\d+$/);
        assert.equal(errors.at(-1).slot, choices[0]);
      } finally {
        save._firstEmptyImportSlot = prior;
        uninstallSimCommandSink();
      }
    });

    await t.test('facade rejects incomplete acknowledgements and transport failure', async () => {
      try {
        for (const ack of [undefined, { ok: true }, { ok: true, result: {} },
          { ok: false, result: { ok: true } }]) {
          installSimCommandSink(() => Promise.resolve(ack));
          const attempt = beginFileImport(facade, '{}', '2');
          assert.equal(await attempt.done, false);
          assert.deepEqual(attempt.callbacks, [false]);
        }
        installSimCommandSink(() => Promise.reject(new Error('transport-closed')));
        assert.equal(await beginFileImport(facade, '{}', '2').done, false);
      } finally { uninstallSimCommandSink(); }
    });
  } finally {
    uninstallSimCommandSink();
    api.shutdown();
    if (fileReaderDescriptor) Object.defineProperty(globalThis, 'FileReader', fileReaderDescriptor);
    else delete globalThis.FileReader;
  }
});
