import test from 'node:test';
import assert from 'node:assert/strict';
import { createSwarmArmoryShipPreview } from '../src/ui/ship/swarmArmoryShipPreview.js';

function fixture() {
  const calls = [], host = { dataset: {}, setAttribute() {} }, name = {}, note = {};
  const view = createSwarmArmoryShipPreview({ host, name, note, motionReduced: () => true,
    stageFactory: () => {
      calls.push(['create']);
      return {
        show(id, options) { calls.push(['show', id, options]); },
        activate(ctx) { calls.push(['activate', ctx.state.settings.video.motionReduce]); },
        deactivate() { calls.push(['deactivate']); },
        release() { calls.push(['release']); },
        restore() { calls.push(['restore']); },
        dispose() { calls.push(['dispose']); },
      };
    },
  });
  return { view, calls, name, note };
}

test('prewarming the armory does not create or render another GPU context', () => {
  const f = fixture();
  f.view.show('ship_kestrel', [{ slotIndex: 0, defId: 'wpn_pulse_laser_s' }]);
  assert.equal(f.calls.length, 0);
  assert.equal(f.name.textContent, 'Hitch');
  f.view.setActive(true);
  assert.deepEqual(f.calls.map(call => call[0]), ['create', 'show', 'activate']);
  assert.equal(f.calls[1][1], 'ship_kestrel');
  assert.equal(f.calls[1][2].fittings[0], 'wpn_pulse_laser_s');
  assert.equal(f.calls[2][1], true, 'reduced motion reaches the stage');
});

test('successful fitting snapshots change the same ship while repeated inspection leaves it intact', () => {
  const f = fixture(); f.view.setActive(true);
  f.view.show('ship_kestrel', [{ slotIndex: 0, defId: 'wpn_pulse_laser_s' }]);
  f.view.show('ship_kestrel', [{ slotIndex: 0, defId: 'wpn_pulse_laser_s' }]);
  assert.equal(f.calls.filter(call => call[0] === 'show').length, 1);
  f.view.show('ship_kestrel', [{ slotIndex: 0, defId: 'wpn_autocannon_s' }]);
  const shows = f.calls.filter(call => call[0] === 'show');
  assert.equal(shows.length, 2);
  assert.equal(shows[1][2].fittings[0], 'wpn_autocannon_s');
  assert.equal(shows[1][2].preserveView, true);
  assert.match(f.note.textContent, /1 installed item · 1 weapon/);
  f.view.show('ship_wasp', []);
  assert.equal(f.calls.filter(call => call[0] === 'show').at(-1)[2].preserveView, false);
  assert.equal(f.name.textContent, 'Wasp');
  assert.match(f.note.textContent, /No weapons fitted/);
});

test('leaving for combat releases the preview and re-entry restores only the latest committed fit', () => {
  const f = fixture(); f.view.setActive(true);
  f.view.show('ship_kestrel', []);
  f.view.setActive(false); f.view.setActive(false);
  assert.equal(f.calls.filter(call => call[0] === 'release').length, 1);
  f.view.show('ship_wasp', [{ slotIndex: 0, defId: 'wpn_autocannon_s' }]);
  assert.equal(f.calls.filter(call => call[0] === 'show').length, 1, 'hidden updates never draw');
  f.view.setActive(true);
  assert.equal(f.calls.filter(call => call[0] === 'restore').length, 1);
  assert.equal(f.calls.filter(call => call[0] === 'show').at(-1)[1], 'ship_wasp');
  f.view.dispose(); f.view.dispose();
  const before = f.calls.length;
  f.view.show('ship_hornet', []); f.view.setActive(true);
  assert.equal(f.calls.length, before);
  assert.equal(f.calls.filter(call => call[0] === 'dispose').length, 1);
});

test('the Saucer caption distinguishes built-in weapons from purchased equipment', () => {
  const f = fixture();
  f.view.show('ship_saucer', []);
  assert.equal(f.note.textContent, '0 installed items · 3 built-in weapons');
  assert.equal(f.calls.length, 0);
});
