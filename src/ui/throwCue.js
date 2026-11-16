// The throw cue (doc 20 rule 2: one verb tag). While the pilot holds a throwable the world tag says
// `RMB · THROW` (live binding, worldObjectInteraction.beamHint); this reads whether the rope's own
// release window is open on the aimed target, so the same tag can light up at the moment a tap throws.
export function releaseWindowOpen(state) {
  const t = state && state.massline2 && state.massline2.throw;
  const sol = t && t.solution;
  // THROW-02: the held window mirror is authoritative while it lasts — masslineThrow keeps it lit
  // for at least RELEASE_WINDOW_MIN_S after the solver's own tick so the cue is readable. Mirrors
  // that predate the hold (no windowOpen field) fall back to the solver's on-solution tick.
  return !!(sol && (sol.windowOpen === true
    || (sol.valid && sol.onSolution && !sol.decisionStale && !sol.degraded)));
}
