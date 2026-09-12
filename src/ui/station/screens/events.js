// Field Hardware chrome for leftover berth event / ledger / mechanic strips.
// stationApp.js owns the writers; this module only pins kit type onto the articles
// it already mounts. Strips keep their CSS legend plates — do not swap in a bench plate.

import {
  ensureInteriorStyle,
  paintLegend,
  pin,
} from './fhChrome.js';

const STYLE_ID = 'sf-station-events-fh';

function ensureEventsStyle() {
  ensureInteriorStyle();
  if (typeof document === 'undefined' || !document.head) return;
  if (document.getElementById(STYLE_ID)) return;
  const style = document.createElement('style');
  style.id = STYLE_ID;
  style.textContent =
    '.sxb-event .fh-legend{display:inline!important}' +
    '.sxb-event[data-tone="danger"] .sxb-event__badge.fh-legend{color:var(--fh-hazard,var(--k-bad))!important}' +
    '.sxb-event[data-tone="good"] .sxb-event__badge.fh-legend{color:var(--k-good)!important}';
  document.head.appendChild(style);
}

function hostRoot(root) {
  if (!root) return typeof document !== 'undefined' ? document : null;
  if (root.querySelector) return root;
  return typeof document !== 'undefined' ? document : null;
}

export function dressEvents(root) {
  const host = hostRoot(root);
  if (!host || !host.querySelectorAll) return;
  ensureEventsStyle();
  for (const card of host.querySelectorAll('.sxb-event')) {
    const badge = card.querySelector('.sxb-event__badge');
    if (badge) paintLegend(badge, true);
    const title = card.querySelector('.sxb-event__title');
    if (title) {
      paintLegend(title, true);
      pin(title, {
        'font-size': 'inherit',
        'letter-spacing': 'inherit',
        color: 'var(--fh-text, var(--k-text-live))',
      });
    }
  }
}

let observer = null;
let watching = null;
let scheduled = false;

function kick(doc) {
  const host = (doc.querySelector && (doc.querySelector('.sx-berth') || doc.querySelector('.sx-app'))) || doc;
  if (observer && host && host !== watching && host.querySelector && host.querySelector('.sxb-tape, .sxb-event')) {
    watching = host;
    observer.disconnect();
    observer.observe(host, {
      childList: true,
      subtree: true,
      attributes: true,
      attributeFilter: ['hidden', 'data-tone'],
    });
  }
  dressEvents(host);
}

export function watchEvents(root) {
  const doc = hostRoot(root);
  if (!doc || typeof MutationObserver !== 'function') return;
  if (observer) {
    kick(doc);
    return;
  }
  const onMut = () => {
    if (scheduled) return;
    scheduled = true;
    const run = () => { scheduled = false; kick(doc); };
    if (typeof requestAnimationFrame === 'function') requestAnimationFrame(run);
    else run();
  };
  observer = new MutationObserver(onMut);
  const start = doc.documentElement || doc.body || doc;
  if (!start || !start.nodeType) return;
  observer.observe(start, { childList: true, subtree: true });
  kick(doc);
}

if (typeof document !== 'undefined') watchEvents(document);

export default dressEvents;
