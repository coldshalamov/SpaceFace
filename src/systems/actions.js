// SG-03 pre-physics combat-action phase. Input and AI submit the same ActionDef requests through
// helpers.requestCombatAction(); this system resolves costs/cancels/effects before bodies step.
import { getCombatKernel } from '../combat/kernel.js';

export const actions = {
  name: 'actions',
  init(ctx) {
    this.kernel = getCombatKernel(ctx);
  },
  update(dt) {
    this.kernel.prePhysics(dt);
  },
};
