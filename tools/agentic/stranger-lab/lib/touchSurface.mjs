// Simulated 390×844 touch. The worker-lane reducer is the phone deck's sim half:
// no DOM, and the same axis merge src/systems/input.js applies to a live touch frame.
// deviceTested stays false — this is not a physical handset.

import { createLaneTouchReducer } from '../../../../src/systems/mobile/laneTouchReducer.js';

export const TOUCH_VIEWPORT = Object.freeze({
  width: 390,
  height: 844,
  device: 'simulated-touch',
  deviceTested: false,
});

function quant(value) {
  const n = Number(value) || 0;
  const clamped = n < -1 ? -1 : (n > 1 ? 1 : n);
  return Math.round(clamped * 4) / 4;
}

export function createTouchSession() {
  return createLaneTouchReducer();
}

// Left stick is yaw and throttle. Strafe is not a touch axis on the live merge.
export function projectSimulatedTouch(reducer, action) {
  const turn = quant(action.turnIntent);
  const thrust = quant(action.moveZ);
  reducer.applyLaneFrame({
    active: true,
    axes: { leftX: turn, leftY: -thrust, rightX: 0, rightY: 0 },
    actions: {
      boost: !!action.boost,
      brake: !!action.brake,
      fire: !!action.fire,
      mine: (action.fireGroup | 0) === 2,
      tether: !!action.tether,
      reelIn: action.reel < 0,
      reelOut: action.reel > 0,
    },
    activityPending: true,
  }, null);
  reducer.tick(0, null, null);
  const held = (name) => !!(reducer.actions[name] && reducer.actions[name].held);
  return {
    moveX: 0,
    moveZ: -(Number(reducer.axes.leftY) || 0),
    turnIntent: Number(reducer.axes.leftX) || 0,
    boost: held('boost'),
    fire: held('fire'),
    fireGroup: held('mine') ? 2 : 0,
    brake: held('brake'),
    tether: held('tether'),
    reel: held('reelIn') ? -1 : (held('reelOut') ? 1 : 0),
    viewport: TOUCH_VIEWPORT,
  };
}
