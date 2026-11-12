export function bindRuntimeToState(state, config, resolved) {
  if (!state || typeof state !== 'object') return state;
  const binding = Object.freeze({
    profileId: config.profileId,
    features: config.features,
    evidenceClass: config.evidenceClass,
    exclusions: config.exclusions,
    profileHash: resolved && resolved.profileHash,
    manifestHash: resolved && resolved.manifestHash,
  });
  // Ordinary state field holding frozen metadata; systems read state.runtime.features.
  state.runtime = binding;
  if (state.settings && state.settings.gameplay) {
    state.settings.gameplay.runtimeProfile = config.profileId;
  }
  return state;
}
