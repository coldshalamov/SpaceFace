// A paid repair or refuel finished and nothing sounded: audio only heard service:started/aborted,
// and the "Repair complete" toast fell through to the generic menu click. service:completed now
// plays the berth's confirm chime once, scaled by how much the job returned; the completion toasts
// carry audio:false so the click does not ride on top. Seed 4242, no AudioContext.
import assert from 'node:assert/strict';
import test from 'node:test';

import { RECIPES } from '../src/data/audioRecipes.js';
import { createBus } from '../src/core/eventBus.js';
import {
  SERVICE_BERTH_CUES,
  audio,
  serviceCompletedCue,
} from '../src/audio/audioSystem.js';
import { stationServices } from '../src/systems/stationServices.js';

const SEED = 4242;

function boot(extra = {}) {
  const player = { id: 1, type: 'ship', alive: true, pos: { x: 0, z: 0 }, hull: 60, hullMax: 100, armorHp: 0, armorMax: 0 };
  const state = {
    tick: 120,
    simTime: 2,
    mode: 'flight',
    playerId: 1,
    player: { heat: 0 },
    meta: { seed: SEED },
    settings: { video: {}, accessibility: { captions: false } },
    world: { currentSectorId: 'sector_helios', sectors: {} },
    entities: new Map([[1, player]]),
    entityList: [player],
    fuel: { current: 20, max: 100 },
    ui: { docked: true },
    ...extra,
  };
  const bus = createBus();
  const ear = Object.create(audio);
  const plays = [];
  ear.init({ state, bus, helpers: {} });
  ear.play = (recipeId, opts) => { plays.push({ recipeId, opts }); return { recipeId }; };
  return { state, bus, ear, plays };
}

test('the completed cue is an authored recipe distinct from start and abort', () => {
  assert.ok(RECIPES.some((row) => row.id === SERVICE_BERTH_CUES.completed));
  assert.notEqual(SERVICE_BERTH_CUES.completed, SERVICE_BERTH_CUES.started);
  assert.notEqual(SERVICE_BERTH_CUES.completed, SERVICE_BERTH_CUES.aborted);
});

test('repair and refuel receipts map to the confirm chime and scale with the work done', () => {
  const small = serviceCompletedCue({ type: 'repair', cost: 40, restoredHull: 10, restoredArmor: 0, hullMax: 100, armorMax: 0 });
  const full = serviceCompletedCue({ type: 'repair', cost: 400, restoredHull: 100, restoredArmor: 0, hullMax: 100, armorMax: 0 });
  assert.equal(small.id, 'sfx_ui_confirm');
  assert.equal(full.id, 'sfx_ui_confirm');
  assert.ok(small.gain < full.gain, 'a bigger job rings a shade louder');
  assert.ok(small.gain >= 0.28 - 1e-9 && full.gain <= 0.42 + 1e-9, 'and stays a quiet confirm');

  const topUp = serviceCompletedCue({ type: 'refuel', cost: 30, units: 10 }, 100);
  const fill = serviceCompletedCue({ type: 'refuel', cost: 300, units: 100 }, 100);
  assert.equal(topUp.id, 'sfx_ui_confirm');
  assert.ok(topUp.gain < fill.gain);

  assert.equal(serviceCompletedCue({ type: 'hull_wash', cost: 50 }).id, 'sfx_ui_confirm');
  // The yard's "refuel on the note" job completes as a refuel with units: it rings.
  assert.equal(serviceCompletedCue({ type: 'refuel', cost: 0, debtCr: 40, units: 5 }, 100).id, 'sfx_ui_confirm');
});

test('the dockless emergency fuel reserve is a warning, not berth work: no confirm chime', () => {
  assert.equal(serviceCompletedCue({ type: 'emergency_fuel', units: 5, debtCr: 40 }), null);
});

test('an emergency weld filed on the note (cost 0, hull restored) still rings', () => {
  const cue = serviceCompletedCue({ type: 'repair', cost: 0, debtCr: 80, restoredHull: 20, restoredArmor: 0, hullMax: 100, armorMax: 0 });
  assert.equal(cue.id, 'sfx_ui_confirm');
});

test('silence: cost 0 and nothing restored, and non-berth services', () => {
  assert.equal(serviceCompletedCue({ type: 'repair', cost: 0, restoredHull: 0, restoredArmor: 0, hullMax: 100 }), null);
  assert.equal(serviceCompletedCue({ type: 'refuel', cost: 0, units: 0 }), null);
  assert.equal(serviceCompletedCue({ type: 'repair' }), null);
  assert.equal(serviceCompletedCue({ type: 'repair', cost: NaN, restoredHull: NaN }), null);
  for (const type of ['loan', 'settle', 'redeem_rights', 'cargo_insurance', 'ammo', 'insurance']) {
    assert.equal(serviceCompletedCue({ type, cost: 100, amount: 100, payout: 100 }), null, type);
  }
  assert.equal(serviceCompletedCue(null), null);
});

test('service:completed on the bus plays the chime once, even while docked (a pause)', () => {
  const { state, bus, ear, plays } = boot();
  try {
    ear.rt._paused = true;
    bus.emit('service:completed', {
      type: 'repair', cost: 120, restoredHull: 40, restoredArmor: 0, hullMax: 100, armorMax: 0,
    });
    bus.flush();
    assert.equal(plays.length, 1);
    assert.equal(plays[0].recipeId, 'sfx_ui_confirm');
    assert.ok(plays[0].opts.gain > 0.28 && plays[0].opts.gain < 0.42 + 1e-9);

    plays.length = 0;
    bus.emit('service:completed', { type: 'repair', cost: 0, restoredHull: 0, restoredArmor: 0, hullMax: 100 });
    bus.emit('service:completed', { type: 'loan', amount: 500, debtCr: 500 });
    bus.flush();
    assert.deepEqual(plays, [], 'nothing done, or not berth work: silent');

    // refuel reads the live tank size from state
    bus.emit('service:completed', { type: 'refuel', cost: 100, units: 100 });
    bus.flush();
    assert.equal(plays.length, 1);
    assert.equal(state.fuel.max, 100);
  } finally {
    ear.destroy();
  }
});

test('the real yard completion emits the chime once and no click on top of it', () => {
  for (const type of ['repair', 'refuel']) {
    const { state, bus, ear, plays } = boot();
    try {
      const toasts = [];
      bus.on('toast', (p) => toasts.push(p));
      const yard = Object.create(stationServices);
      yard.bus = bus;
      const job = type === 'repair'
        ? { id: 'j1', type, stationId: 'station_helios', deliveredHull: 40, deliveredArmor: 0, meta: { cost: 120, hullMax: 100, armorMax: 0 } }
        : { id: 'j2', type, stationId: 'station_helios', applied: 30, meta: { cost: 90 } };
      yard._emitJobCompleted(state, job, 3);
      bus.flush();
      assert.equal(toasts.length, 1, type);
      assert.equal(toasts[0].kind, 'success');
      assert.equal(toasts[0].audio, false, `${type} completion toast hands its sound to the chime`);
      assert.deepEqual(plays.map((row) => row.recipeId), ['sfx_ui_confirm'], `${type}: one chime, no click`);
    } finally {
      ear.destroy();
    }
  }
});

test('control: the same toast without the flag would have clicked on top', () => {
  const { bus, ear, plays } = boot();
  try {
    bus.emit('toast', { text: 'Repair complete', kind: 'success', ttl: 2 });
    bus.flush();
    assert.ok(plays.length >= 1, 'an unflagged success toast still makes the menu click');
  } finally {
    ear.destroy();
  }
});

test('a partial repair booked out of credits keeps its own toast sound', () => {
  const { bus, ear, plays } = boot();
  try {
    bus.emit('toast', { text: 'Partial repair booked — out of credits', kind: 'warn', ttl: 2 });
    bus.flush();
    assert.ok(plays.length >= 1, 'booking toasts are not silenced by the completion chime');
  } finally {
    ear.destroy();
  }
});
