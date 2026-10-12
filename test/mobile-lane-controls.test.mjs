import test from 'node:test';
import assert from 'node:assert/strict';
import { createLaneTouchReducer } from '../src/systems/mobile/laneTouchReducer.js';

test('worker touch snapshots release omitted brake, fire and power actions', () => {
  const touch = createLaneTouchReducer();
  const host = { _held:()=>false, _heldExcept:()=>false, _holdToggleLatches:{} };
  touch.applyLaneFrame({ active:true, axes:{leftY:0}, actions:{brake:true,fire:true,dropBomb:true} }, host);
  assert.equal(touch.actions.brake.held, true);
  touch.applyLaneFrame({ active:true, axes:{leftY:-.63}, actions:{} }, host);
  for (const id of ['brake','fire','dropBomb']) {
    assert.equal(touch.actions[id].held, false, `${id} is released when absent from the next complete snapshot`);
    assert.equal(touch.actions[id].released, true);
  }
  assert.equal(touch.axes.leftY, -.63, 'releasing the brake leaves the flight thumb live');
  assert.equal(host._held({},'brake'),false);
  touch.applyLaneFrame({ active:true, axes:{leftY:-.63}, actions:{fire:true} }, host);
  assert.equal(touch.actions.fire.pressed,true,'a fresh tap creates a new edge');
});

test('the worker releases the Gyre hold latch when the mobile toggle turns off', () => {
  const touch = createLaneTouchReducer();
  const host = { _held:()=>false, _heldExcept:()=>false, _holdToggleLatches:{gyreSnare:true} };
  touch.applyLaneFrame({active:true,actions:{gyreSnare:true}},host);
  touch.applyLaneFrame({active:true,actions:{}},host);
  assert.equal(host._holdToggleLatches.gyreSnare,false);
  assert.equal(touch.actions.gyreSnare.held,false);
});
