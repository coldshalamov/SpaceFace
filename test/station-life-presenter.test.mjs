import assert from 'node:assert/strict';
import { existsSync, readFileSync } from 'node:fs';
import test from 'node:test';

const appUrl = new URL('../src/ui/station/stationApp.js', import.meta.url);
const lifeUrl = new URL('../src/ui/station/stationLife.js', import.meta.url);

test('every presenter module stationApp.js imports from ./ exists (stationLife.js build/404 regression)', () => {
  const source = readFileSync(appUrl, 'utf8');
  const local = [...source.matchAll(/from '(\.\/[^']+\.js)'/g)].map((m) => m[1]);
  assert.ok(local.includes('./stationLife.js'));
  for (const spec of local) assert.ok(existsSync(new URL(spec, appUrl)), `${spec} must exist next to stationApp.js`);
});

test('createStationLifePresenter honours the show/hide/dispose lifecycle stationApp.js drives, inertly', async () => {
  const { createStationLifePresenter } = await import(lifeUrl.href);
  const emitted = [];
  const receipts = [];
  const ctx = { state: { ui: { docked: true, dockedStationId: 'helios' } }, bus: { emit: (...a) => emitted.push(a), on() {}, off() {} } };
  const p = createStationLifePresenter(ctx, {
    showReceipt: (...a) => receipts.push(a), receiptVisible: () => false,
    setTimeout: () => { throw new Error('placeholder must not schedule timers'); },
  });
  for (const m of ['show', 'hide', 'dispose']) assert.equal(typeof p[m], 'function');
  p.show(); assert.equal(p.visible, true);
  p.hide(); assert.equal(p.visible, false);
  p.show(); p.dispose(); assert.equal(p.visible, false);
  p.show(); assert.equal(p.visible, false, 'a disposed presenter stays hidden');
  assert.deepEqual(emitted, []);
  assert.deepEqual(receipts, []);
  assert.equal(ctx.state.ui.dockedStationId, 'helios');
  // Created with no options, as a bare opts.lifeTimers spread would leave it.
  assert.doesNotThrow(() => createStationLifePresenter({ state: {} }).dispose());
});
