// Station controls take their labels from this map. A control with an empty or unknown id
// has no binding-map label. Keys shared with flight (undock, comms) also read src/ui/bindings.js.
import { BINDINGS } from '../bindings.js';

export const STATION_CONTROLS = Object.freeze({
  find: { label: 'Find a service' },
  comms: { label: 'Comms', binding: 'comms' },
  help: { label: 'Help' },
  undock: { label: 'Undock', binding: 'dock', role: 'primary' },
  'launch-anyway': { label: 'Launch anyway', role: 'primary' },
  'dismiss-handoff': { label: 'Dismiss' },
  'handoff-step': { label: 'Continue' },
  'departure-chip': { label: 'Review' },
  'hold-row': { label: 'Sell' },
  'hold-manifest': { label: 'Cargo manifest' },
  repair: { label: 'Repair' },
  wash: { label: 'Wash' },
  insurance: { label: 'Insurance' },
  refuel: { label: 'Refuel' },
  resupply: { label: 'Resupply' },
  sell: { label: 'Sell' },
  'close-palette': { label: 'Close' },
  market: { label: 'Market' },
  shipworks: { label: 'Shipworks' },
  industry: { label: 'Industry' },
  contracts: { label: 'Missions' },
  factions: { label: 'Factions' },
  bar: { label: 'Bar' },
  ledger: { label: 'Ledger' },
  fleet: { label: 'Fleet' },
  'for-sale': { label: 'For sale' },
  'previous-ships': { label: 'Previous ships' },
  'next-ships': { label: 'Next ships' },
  'rotate-left': { label: 'Left' },
  'center-view': { label: 'Center' },
  'rotate-right': { label: 'Right' },
  buy: { label: 'Buy' },
  fewer: { label: 'Fewer' },
  more: { label: 'More' },
  max: { label: 'Max' },
  'market-filter': { label: 'Filter' },
  'set-course': { label: 'Set course' },
  'accept-mission': { label: 'Accept', role: 'primary' },
  'mission-row': { label: 'Mission' },
  track: { label: 'Track' },
  blueprint: { label: 'Blueprint' },
  'source-market': { label: 'Source in market' },
  fabricate: { label: 'Fabricate', role: 'primary' },
  faction: { label: 'Faction' },
  'faction-relation': { label: 'Relation' },
  contact: { label: 'Contact' },
  choice: { label: 'Ask' },
  'buy-survey': { label: 'Buy' },
  'inspect-lead': { label: 'Inspect' },
  'open-board': { label: 'Open the board' },
  offer: { label: 'Offer', role: 'primary' },
  'open-wreck-map': { label: 'Open Sker-Run wreck map', role: 'primary' },
  'cap-chip': { label: 'Capability' },
  'cap-next': { label: 'Next' },
  'loadout-preset': { label: 'Build' },
  'save-build': { label: 'Save fit' },
  'delete-build': { label: 'Delete build' },
  band: { label: 'Band' },
  range: { label: 'Take it to the range' },
  record: { label: 'Record' },
  fit: { label: 'Fit' },
  activate: { label: 'Make active' },
  scar: { label: 'Condition' },
  hardpoint: { label: 'Hardpoint' },
  'inspect-hull': { label: 'Inspect' },
  'preview-hull': { label: 'Preview' },
  'buy-ship': { label: 'Buy ship', role: 'primary' },
  restock: { label: 'Restock' },
  'upgrade-rack': { label: 'Upgrade' },
  'make-active': { label: 'Make active' },
  'buy-fit': { label: 'Buy' },
  back: { label: 'Back' },
  'remove-module': { label: 'Remove' },
  'payload-fit': { label: 'Load', role: 'primary' },
  'payload-buy': { label: 'Buy' },
  'payload-sell': { label: 'Sell' },
  unload: { label: 'Unload' },
});

function escapeAttr(value) {
  return String(value).replace(/&/g, '&amp;').replace(/"/g, '&quot;').replace(/</g, '&lt;');
}

export function stationControlLabel(id) {
  const row = STATION_CONTROLS[id];
  if (!row || typeof row.label !== 'string' || !row.label.trim()) {
    throw new Error(`station control "${id}" has no binding-map label`);
  }
  if (row.binding) {
    const key = BINDINGS[row.binding] && BINDINGS[row.binding].label;
    if (!key) throw new Error(`station control "${id}" has no binding-map label`);
  }
  return row.label;
}

export function stationControlAttrs(id, opts = {}) {
  const label = stationControlLabel(id);
  const row = STATION_CONTROLS[id];
  const primary = !!(opts && opts.primary) || row.role === 'primary';
  let attrs = `data-station-control="${escapeAttr(id)}" data-control-label="${escapeAttr(label)}"`;
  if (primary) attrs += ' data-sf-role="primary"';
  if (row.binding && BINDINGS[row.binding]) {
    attrs += ` data-binding="${escapeAttr(row.binding)}" data-binding-key="${escapeAttr(BINDINGS[row.binding].label)}"`;
  }
  return attrs;
}

export function markStationControl(node, id, opts) {
  if (!node || typeof node.setAttribute !== 'function') return node;
  const label = stationControlLabel(id);
  const row = STATION_CONTROLS[id];
  node.setAttribute('data-station-control', id);
  node.setAttribute('data-control-label', label);
  if ((opts && opts.primary) || row.role === 'primary') node.setAttribute('data-sf-role', 'primary');
  if (row.binding && BINDINGS[row.binding]) {
    node.setAttribute('data-binding', row.binding);
    node.setAttribute('data-binding-key', BINDINGS[row.binding].label);
  }
  return node;
}

function inferStationControlId(attrs) {
  const has = (re) => re.test(attrs);
  if (has(/\bsxb-launch\b/)) return 'undock';
  if (has(/\bso-command-trigger\b/)) return 'find';
  if (has(/\bsx-comms__toggle\b/)) return 'comms';
  if (has(/\bsxb-help\b/)) return 'help';
  if (has(/data-camera="left"/)) return 'rotate-left';
  if (has(/data-camera="reset"/)) return 'center-view';
  if (has(/data-camera="right"/)) return 'rotate-right';
  if (has(/data-rail-step="prev"/)) return 'previous-ships';
  if (has(/data-rail-step="next"/)) return 'next-ships';
  if (has(/data-mode="fleet"/)) return 'fleet';
  if (has(/\bsx-trade__go--buy\b/) || (has(/data-mode="buy"/) && has(/\bsx-trade__go\b/))) return 'buy';
  if (has(/\bsx-trade__go--sell\b/) || has(/data-mode="sell"/)) return 'sell';
  if (has(/data-mode="buy"/)) return 'for-sale';
  if (has(/data-q="-1"/)) return 'fewer';
  if (has(/data-q="1"/)) return 'more';
  if (has(/data-q="max"/)) return 'max';
  if (has(/data-market-filter=/)) return 'market-filter';
  if (has(/\bsx-ct-commit\b/) || has(/data-accept=/)) return 'accept-mission';
  if (has(/\bdata-close\b/)) return 'close-palette';
  return '';
}

/** Stamp binding-map labels onto station markup that was authored outside src/ui/station/. */
export function bindStationMarkup(html) {
  const source = String(html || '');
  const open = '<' + 'button';
  const end = '>';
  if (!source.includes(open)) return source;
  return source.replace(new RegExp(open + '\\b([^' + end + ']*)' + end, 'g'), (full, attrs) => {
    if (/data-station-control=/.test(attrs)) return full;
    const id = inferStationControlId(attrs);
    if (!id || !STATION_CONTROLS[id]) {
      throw new Error(`station control has no binding-map label: ${String(attrs).replace(/\s+/g, ' ').slice(0, 180)}`);
    }
    const primary = /\b(?:k-word--primary|fh-key--primary|sx-btn-primary|dp-key--primary)\b/.test(attrs);
    const gap = /^\s/.test(attrs) ? '' : ' ';
    return `<button ${stationControlAttrs(id, { primary })}${gap}${attrs}>`;
  });
}
