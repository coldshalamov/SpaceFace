// Field Hardware chrome for the station Comms interior (toggle, help, session log).
// stationApp.js owns open/close and the receipt writer; this module pins kit plates and
// keys onto that markup so the open history is engraved rows, not a word table.

import {
  ensureInteriorStyle,
  paintKey,
  paintLegend,
  paintPlate,
  paintRow,
  pinKeyrack,
  syncKeys,
} from './fhChrome.js';

const STYLE_ID = 'sf-station-comms-fh';

function ensureCommsStyle() {
  ensureInteriorStyle();
  if (typeof document === 'undefined' || !document.head) return;
  if (document.getElementById(STYLE_ID)) return;
  const style = document.createElement('style');
  style.id = STYLE_ID;
  style.textContent =
    '.sx-comms .k-word.fh-key::after,.sxb-help.k-word.fh-key::after{display:none!important}' +
    '.sx-comms-entry.fh-row{box-shadow:none!important;background-color:transparent!important}' +
    '.sx-comms .fh-keyrack{gap:6px!important;align-items:center!important;flex-wrap:wrap!important}';
  document.head.appendChild(style);
}

function hostRoot(root) {
  if (!root) return typeof document !== 'undefined' ? document : null;
  if (root.querySelector) return root;
  return typeof document !== 'undefined' ? document : null;
}

export function dressComms(root) {
  const host = hostRoot(root);
  if (!host || !host.querySelector) return;
  ensureCommsStyle();
  const comms = (host.matches && host.matches('.sx-comms')) ? host : host.querySelector('.sx-comms');
  if (!comms) return;
  pinKeyrack(comms);
  const toggle = comms.querySelector('.sx-comms__toggle');
  if (toggle) paintKey(toggle, 'small');
  const help = comms.querySelector('.sxb-help');
  if (help) paintKey(help, 'small');
  const count = comms.querySelector('.sx-comms__count');
  if (count) paintLegend(count, !count.hidden);
  const receipt = comms.querySelector('.sx-receipt');
  if (receipt) paintLegend(receipt.querySelector('.sx-receipt__kind'), true);
  const history = comms.querySelector('.sx-comms__history');
  if (history) {
    paintPlate(history, 'sunk');
    paintLegend(history.querySelector('.sx-comms__history-head'), true);
    paintLegend(history.querySelector('.sx-comms__empty'), true);
    for (const row of history.querySelectorAll('.sx-comms-entry')) paintRow(row, false);
  }
  syncKeys(comms);
}

let observer = null;
let watching = null;
let scheduled = false;

function kick(doc) {
  const host = (doc.querySelector && (doc.querySelector('.sx-berth') || doc.querySelector('.sx-app'))) || doc;
  if (observer && host && host !== watching && host.querySelector && host.querySelector('.sx-comms')) {
    watching = host;
    observer.disconnect();
    observer.observe(host, {
      childList: true,
      subtree: true,
      attributes: true,
      attributeFilter: ['hidden', 'aria-expanded'],
    });
  }
  dressComms(host);
}

export function watchComms(root) {
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

if (typeof document !== 'undefined') watchComms(document);

export default dressComms;
