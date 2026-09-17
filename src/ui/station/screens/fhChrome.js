// Presentation adapters shared by station controllers and the in-flight Shipworks view.
// Behaviour stays in controllers; material, typography and hover states belong to stylesheets.
// The former inline !important nine-slice paint made station layout impossible to override,
// consumed 24–48px per control, and installed six listeners on every painted key.
// Existing fh-* classes remain the fallback outside the scoped Orbital station skin.

export function fhUrl(rel) {
  // This module sits four directories under the server root (src/ui/station/screens/),
  // one deeper than the src/ui/screens/ helpers it mirrors — it needs four `..` hops.
  try { return new URL('../../../../assets/ui/kit/assets/' + rel, import.meta.url).href; }
  catch { return '/assets/ui/kit/assets/' + rel; }
}

/** Explicit caller-provided layout/semantic colour only; never an inline cascade lock. */
export function pin(node, props) {
  if (!node?.style) return node;
  for (const [name, value] of Object.entries(props || {})) {
    node.style.setProperty(name, String(value));
  }
  return node;
}
function add(node, ...names) { node?.classList?.add(...names); return node; }
// Kept for existing screen imports. Component sheets are loaded by ensureStylesheet().
export function ensureInteriorStyle() {}
export function paintMarking(node) { return add(node, 'fh-title'); }
export function paintLegend(node, lit = false) {
  add(node, 'fh-legend');
  if (node?.setAttribute && !node.getAttribute('data-fh-lit')) node.setAttribute('data-fh-lit', lit ? 'on' : 'off');
  return node;
}
export function paintHero(node) { return add(node, 'fh-hero'); }
export function paintHeroNum(node) { return add(node, 'fh-heronum'); }
export function paintPlate(node, variant = 'sunk', extra = {}) {
  add(node, 'fh-plate', 'fh-plate--' + (['raised', 'edge'].includes(variant) ? variant : 'sunk'));
  return pin(node, extra);
}
export function paintWindow(node) { return add(node, 'fh-window'); }
export function paintInput(node) { return add(node, 'fh-input'); }
export function paintKey(node, kind = 'legend') {
  if (!node) return node;
  node.classList?.remove('fh-key--primary', 'fh-key--legend', 'fh-key--small');
  add(node, 'k-word', 'fh-key', 'fh-key--' + (['primary', 'small'].includes(kind) ? kind : 'legend'));
  return node;
}
export function paintCap(node) { return add(node, 'fh-key', 'fh-key--small', 'so-cap'); }
export function paintRow(node, selected = false) {
  add(node, 'fh-row'); node?.classList?.toggle('is-selected', !!selected); return node;
}
export function paintSelectedTableRow(node, selected = false) { return paintRow(node, selected); }
export function pinKeyrack(node) { return add(node, 'fh-keyrack'); }
// CSS observes aria-selected/pressed/current and :hover/:focus-visible directly.
export function syncKeys() {}
export function dressState(host) {
  if (!host) return;
  paintLegend(host.querySelector('.sf-state__head, .sf-state__word'), true);
  paintKey(host.querySelector('.sf-state__verb'), 'legend');
}
