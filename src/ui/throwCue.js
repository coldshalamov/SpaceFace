// The throw cue (doc 20 rule 2: one verb tag). While the pilot holds a throwable the world tag says
// `RMB · THROW` (live binding, worldObjectInteraction.beamHint); this reads whether the rope's own
// release window is open on the aimed target, so the same tag can light up at the moment a tap throws.
export function releaseWindowOpen(state) {
  const t = state && state.massline2 && state.massline2.throw;
  const sol = t && t.solution;
  return !!(sol && sol.valid && sol.onSolution && !sol.decisionStale && !sol.degraded);
}
