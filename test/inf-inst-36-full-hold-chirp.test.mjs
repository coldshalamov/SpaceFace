import test from 'node:test';
import assert from 'node:assert/strict';
import { audio } from '../src/audio/audioSystem.js';
import { pickupHoldIsFull } from '../src/core/pickupAcceptance.js';
import { cargo, addCargo, removeCargo } from '../src/systems/cargo.js';
import { instrumentScenario } from './helpers/infInstrumentScenario.mjs';

const ORE = 'cmdty_scrap_metal';
const FULL_CUE = 'sfx_mining_cargo_full';

function boot(used = 0) {
  const h = instrumentScenario([cargo]);
  h.state.player.cargo = {
    items: used ? { [ORE]: used } : {}, usedVolume: used, usedMass: used,
    capVolume: 3, capMass: 100,
  };
  const ear = Object.create(audio);
  ear.init({ state: h.state, bus: h.bus, helpers: {} });
  const plays = [];
  ear.play = (recipeId, opts) => { plays.push({ recipeId, opts }); };
  return {
    ...h, ear, plays,
    scoop(amount) {
      const payload = { kind: 'cargo', collectorId: h.player.id, commodityId: ORE, amount };
      h.bus.emit('pickup:collected', payload);
      h.bus.flush();
      return payload;
    },
    fullCues: () => plays.filter((play) => play.recipeId === FULL_CUE),
    close() { ear.destroy(); h.sim.dispose(); },
  };
}

test('INST-36 seed 4242: exact fill chirps once, rejected rocks stay silent, freeing capacity rearms', () => {
  const h = boot();
  try {
    h.scoop(2);
    assert.equal(h.fullCues().length, 0);
    assert.equal(h.scoop(1).acceptedAmount, 1);
    assert.equal(h.fullCues().length, 1, 'the exact fill needs no refusal to sound');
    assert.equal(h.fullCues()[0].opts.gain, 0.3, 'one soft authored cue');
    const afterFill = h.plays.length;
    for (let i = 0; i < 6; i++) {
      h.sim.step();
      assert.equal(h.scoop(4).acceptedAmount, 0);
      h.bus.emit('audio:cue', { id: 'presentation.mining.cargo_full', cueId: 'mining.cargo.full' });
      h.bus.flush();
    }
    assert.equal(h.plays.length, afterFill, 'neither refusal nor presentation alias speaks again');
    assert.equal(removeCargo(h.state, ORE, 1), 1);
    assert.equal(h.fullCues().length, 1, 'freeing capacity is silent');
    h.scoop(1);
    assert.equal(h.fullCues().length, 2, 'one cue on the next crossing');
  } finally { h.close(); }
});

test('INST-36 seed 4242: partial acceptance and its refusal alias share one full-hold voice', () => {
  const h = boot();
  try {
    const receipt = h.scoop(9);
    assert.equal(receipt.acceptedAmount, 3);
    assert.equal(receipt.rejectedAmount, 6);
    h.bus.emit('audio:cue', { id: 'presentation.mining.cargo_full', cueId: 'mining.cargo.full' });
    h.bus.flush();
    assert.equal(h.fullCues().length, 1);
  } finally { h.close(); }
});

test('INST-36 seed 4242: an already full loaded hold is silent until it frees and fills again', () => {
  const h = boot(3);
  try {
    h.scoop(1);
    h.bus.emit('save:loaded', {});
    h.bus.emit('cargo:changed', {});
    h.bus.flush();
    assert.equal(h.fullCues().length, 0);
    removeCargo(h.state, ORE, 3);
    h.scoop(3);
    assert.equal(h.fullCues().length, 1);
    for (const hold of [null, { capVolume: NaN, usedVolume: 3 }, { capVolume: 3, usedVolume: NaN }]) {
      assert.equal(pickupHoldIsFull(hold), false);
    }
  } finally { h.close(); }
});

test('FIX2 INST-36 seed 4242: a fractional gap chirps on the first whole-unit refusal only', () => {
  const h = boot();
  try {
    assert.equal(addCargo(h.state, 'cmdty_ice_water', 2), 2);
    assert.equal(h.state.player.cargo.usedVolume, 2.8);
    assert.equal(h.fullCues().length, 0);
    assert.equal(h.scoop(1).acceptedAmount, 0);
    assert.equal(h.fullCues().length, 1, '0.2 free cannot admit one scrap unit');
    for (let i = 0; i < 4; i++) {
      h.bus.emit('cargo:changed', {});
      h.bus.emit('audio:cue', { id: 'presentation.mining.cargo_full', cueId: 'mining.cargo.full' });
      h.scoop(1);
    }
    assert.equal(h.fullCues().length, 1, 'unchanged cargo and aliases cannot rearm refusal');
    assert.equal(removeCargo(h.state, 'cmdty_ice_water', 1), 1);
    assert.equal(h.scoop(1).acceptedAmount, 1);
    assert.equal(h.fullCues().length, 1, 'the accepted unit still leaves a fractional gap');
    assert.equal(h.scoop(1).acceptedAmount, 0);
    assert.equal(h.fullCues().length, 2, 'freeing real capacity rearms one crossing');
  } finally { h.close(); }
});
