/** Read-only onboarding state predicates shared by presentation and meta systems. */
export function isOnboardingTeaching(state) {
  const onboarding = state && state.onboarding;
  return !!(onboarding && onboarding.active && !onboarding.finished);
}
