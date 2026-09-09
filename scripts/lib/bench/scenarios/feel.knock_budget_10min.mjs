// scripts/lib/bench/scenarios/feel.knock_budget_10min.mjs — B13 ten-minute case, REAL path.
// Same measurement as feel.knock_budget.mjs; counted window is the contract's 10 minutes.

import { runKnockBudget } from './feel.knock_budget.mjs';

export const scenario = {
  id: 'feel.knock_budget_10min',
  label: 'B13 Player Knock Budget — contact-sourced velocity changes on the player hull (REAL PATH)',
  async run(seed) {
    return runKnockBudget(seed, { simSeconds: 600 });
  },
};
