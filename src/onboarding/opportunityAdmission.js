// Read the actual guide owner; disabling hints can leave its active flag retained.
// This gates new unsolicited opportunities, never existing work or explicit actions.
export function isGuidedOnboardingActive(state) {
  const onboarding = state?.onboarding;
  return !!(onboarding?.active && !onboarding.finished
    && state.settings?.gameplay?.tutorialHints !== false);
}
