// Owned flight presentation. The ACTIVE hull is drawn from the canonical silhouette table.
// No aircraft art, cockpit geometry, simulation state, event subscriptions or frame loops live here.
import { SHIP_SILHOUETTES } from '../../data/shipSilhouettes.js';
import { escapeMarkup } from './identity.js';
export function hullMarkSvg(cls, defId) {
  const body = SHIP_SILHOUETTES[defId] || SHIP_SILHOUETTES.ship_kestrel;
  return `<svg class="sf-sch-ship ${escapeMarkup(cls)}" viewBox="0 0 48 48" xmlns="http://www.w3.org/2000/svg" aria-hidden="true" preserveAspectRatio="xMidYMid meet"><g class="sf-sch-hull">${body}</g></svg>`;
}
export function shipConditionMarkup(defId) {
  return '<svg class="sf-sch-ring" viewBox="0 0 100 100" xmlns="http://www.w3.org/2000/svg" aria-hidden="true">' +
    '<circle class="sf-sch-track" cx="50" cy="50" r="46"/>' +
    '<circle class="sf-sch-shield" cx="50" cy="50" r="46" transform="rotate(-90 50 50)"/></svg>' +
    '<div class="sf-sch-ship-wrap">' + hullMarkSvg('sf-sch-ship--empty', defId) +
    '<div class="sf-sch-ship-fill-crop">' + hullMarkSvg('sf-sch-ship--fill', defId) +
    '</div><div class="sf-sch-fill-line"></div></div>';
}
export function hudBarMarkup(label, mod) {
  const modifier = ['energy','boost','heat','fuel'].includes(mod) ? mod : 'energy';
  return `<span class="sf-barrow__label">${escapeMarkup(label)}</span><div class="sf-bar sf-bar--${modifier}"><div class="sf-bar__fill"></div></div><span class="sf-barrow__num mono">0</span>`;
}
