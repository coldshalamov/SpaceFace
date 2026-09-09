// Fixture: a system that reads the wall clock inside the sim. Must trip no-wall-clock-in-sim.
export function tick(state) {
  state.lastSeen = Date.now();
  state.frameStart = performance.now();
}
