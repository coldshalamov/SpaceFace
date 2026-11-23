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

// The opening rail retires the moment the pilot takes real work at the first berth. That first job
// still gets the harbour to itself: the world's unasked-for set scenes (a patrol hailing you into a
// timed decision, a staged vignette) wait while the first trade run is live, and for a few minutes of
// flight after the rail retired on any other job. Runtime only; a loaded save starts settled.
export const OPENING_SETTLE_S = 180;
export function isOpeningSettling(state) {
  if (isGuidedOnboardingActive(state) || isFirstFreightActive(state)) return true;
  const at = Number(state?.onboarding?.finishedAt);
  return Number.isFinite(at) && (Number(state?.simTime) || 0) - at < OPENING_SETTLE_S;
}
