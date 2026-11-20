import { FIRST_TRADE_CONTRACT_SOURCE } from '../data/economyContractTemplates.js';

// Read the actual guide owner; disabling hints can leave its active flag retained.
// This gates new unsolicited opportunities, never existing work or explicit actions.
export function isGuidedOnboardingActive(state) {
  const onboarding = state?.onboarding;
  return !!(onboarding?.active && !onboarding.finished
    && state.settings?.gameplay?.tutorialHints !== false);
}

// The accepted job survives temporary chart detours and the focus reset on Continue.
export function isFirstFreightActive(state) {
  const active = state?.missions?.active;
  const now = state?.simTime || 0;
  return Array.isArray(active) && active.some(mission => mission?.source === FIRST_TRADE_CONTRACT_SOURCE
    && mission.status === 'active' && Number.isFinite(mission.deadline_s) && mission.deadline_s > now);
}
