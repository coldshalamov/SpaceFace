// The only shared combat hook TOWJAW needs. Import this tiny bridge in damage.js,
// at the beginning of routeDamage, before resolving the target. Registration is
// runtime-local and never serialized. No global damage monkey-patching.
const ROUTES = new WeakMap();

export function registerTowjawDamageRoute(state, route) {
  if (!state || typeof route !== 'function') throw new TypeError('TOWJAW damage route requires state and callback');
  let rows = ROUTES.get(state);
  if (!rows) { rows = new Set(); ROUTES.set(state, rows); }
  // One optional predator per sector. A bad integration must not create an
  // unbounded fan-out in the central damage path.
  if (rows.size >= 1 && !rows.has(route)) throw new Error('A TOWJAW damage route is already active');
  rows.add(route);
  let removed = false;
  return () => {
    if (removed) return;
    removed = true;
    rows.delete(route);
    if (!rows.size) ROUTES.delete(state);
  };
}

/** Returns the original input for every unrelated hit. Never applies/refunds HP. */
export function interceptTowjawDamage(state, input) {
  if (!input || typeof input !== 'object') return input;
  const routes = ROUTES.get(state);
  if (!routes) return input;
  let result = input;
  for (const route of routes) result = route(result) || result;
  return result;
}
