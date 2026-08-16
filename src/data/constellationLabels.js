// Plan 30 — tiny contributor/tester signatures on the galaxy chart.
//
// These are presentation-only normalized chart-background coordinates. They are not sectors, discoveries, targets,
// rewards, or save state, and they deliberately carry no interaction metadata.

function point(x, y) {
  return Object.freeze({ x, y });
}

function constellation(id, label, labelAt, points) {
  return Object.freeze({
    id,
    label,
    labelAt: point(labelAt.x, labelAt.y),
    points: Object.freeze(points.map((entry) => point(entry.x, entry.y))),
    interactive: false,
  });
}

export const CONTRIBUTOR_CONSTELLATIONS = Object.freeze([
  constellation('constellation_cold_shalamov', 'COLD SHALAMOV', { x: 0.27, y: 0.22 }, [
    { x: 0.17, y: 0.25 }, { x: 0.23, y: 0.13 }, { x: 0.31, y: 0.20 }, { x: 0.37, y: 0.12 },
  ]),
  constellation('constellation_spaceface_orchestrator', 'SPACEFACE ORCHESTRATOR', { x: 0.68, y: 0.24 }, [
    { x: 0.56, y: 0.13 }, { x: 0.62, y: 0.29 }, { x: 0.72, y: 0.20 }, { x: 0.80, y: 0.12 },
  ]),
  constellation('constellation_gfx_remaster', 'GFX REMASTER', { x: 0.29, y: 0.66 }, [
    { x: 0.17, y: 0.56 }, { x: 0.25, y: 0.72 }, { x: 0.36, y: 0.67 }, { x: 0.42, y: 0.55 },
  ]),
]);

export function contributorConstellations() {
  return CONTRIBUTOR_CONSTELLATIONS;
}

export default CONTRIBUTOR_CONSTELLATIONS;
