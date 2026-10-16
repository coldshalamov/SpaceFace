// An old human docking note. Three marks, no reason.
// A repeated lane can match it. The last mark is a place.

export const HUMAN_DOCK_CHART = Object.freeze({
  siteId: 'warm_freighter',
  marks: Object.freeze([
    Object.freeze({ x: -1200, z: 400 }),
    Object.freeze({ x: -1600, z: 700 }),
    Object.freeze({ x: -1900, z: 850 }),
  ]),
});

export const CHART_FINDING =
  'CHART MATCH. THE LANE REPEATS AN OLD DOCKING NOTE. THE LAST MARK IS A PLACE, NOT AN EXPLANATION.';

export function chartMatches(waypoints, chart) {
  const marks = chart && chart.marks;
  if (!Array.isArray(waypoints) || !Array.isArray(marks)) return false;
  if (waypoints.length !== marks.length || marks.length < 2) return false;
  for (let i = 0; i < marks.length; i++) {
    const w = waypoints[i];
    const m = marks[i];
    if (!w || !m) return false;
    if (Math.abs(Number(w.x) - Number(m.x)) > 1) return false;
    if (Math.abs(Number(w.z) - Number(m.z)) > 1) return false;
  }
  return true;
}

export function chartPlace(site, chart) {
  const points = site && site.routeEcho && site.routeEcho.waypoints;
  if (!site || !site.center || !chartMatches(points, chart)) return null;
  const last = chart.marks[chart.marks.length - 1];
  return {
    x: site.center.x + last.x,
    z: site.center.z + last.z,
    text: CHART_FINDING,
  };
}
