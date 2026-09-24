// Map controls take their labels from this map. Engage shares a keyboard key and a pad button.
import { BINDINGS } from '../bindings.js';

export const MAP_CONTROLS = Object.freeze({
  engage: { label: 'Engage Route', key: 'g', pad: 'accept', role: 'primary' },
  resume: { label: 'Resume Route', role: 'primary' },
  disengage: { label: 'Disengage' },
  pause: { label: 'Pause' },
  plot: { label: 'Plot Course', role: 'primary' },
  'set-course': { label: 'Set Waypoint' },
  'return-ship': { label: 'Return to ship' },
  'frame-both': { label: 'Frame ship + destination' },
  'sort-deck': { label: 'Sort' },
  layer: { label: 'Layer' },
  lane: { label: 'Lane' },
  'world-site': { label: 'Site' },
  'frontier-rumor': { label: 'Rumor' },
  'vesta-cache': { label: 'Cache' },
  'pallas-cache': { label: 'Cache' },
  frame: { label: 'Frame' },
  'open-system': { label: 'Open system' },
  'sweep-sector': { label: 'Sweep sector' },
  bookmark: { label: 'Bookmark' },
  note: { label: 'Note' },
  tab: { label: 'Tab' },
  'deck-route': { label: 'Route' },
  'rail-mission': { label: 'Mission' },
  'rail-bookmark': { label: 'Bookmark' },
  'bookmark-add': { label: 'Bookmark this view' },
  'route-option': { label: 'Route option' },
  'scale-local': { label: 'Local' },
  'scale-system': { label: 'System' },
  'scale-galaxy': { label: 'Galaxy' },
  controls: { label: 'Controls' },
  close: { label: 'Close' },
});

function escapeAttr(value) {
  return String(value).replace(/&/g, '&amp;').replace(/"/g, '&quot;').replace(/</g, '&lt;');
}

export function mapControlLabel(id) {
  const row = MAP_CONTROLS[id];
  if (!row || typeof row.label !== 'string' || !row.label.trim()) {
    throw new Error(`map control "${id}" has no binding-map label`);
  }
  if (row.binding) {
    const key = BINDINGS[row.binding] && BINDINGS[row.binding].label;
    if (!key) throw new Error(`map control "${id}" has no binding-map label`);
  }
  return row.label;
}

export function mapControlAttrs(id, opts = {}) {
  const label = mapControlLabel(id);
  const row = MAP_CONTROLS[id];
  const primary = !!(opts && opts.primary) || row.role === 'primary';
  let attrs = `data-map-control="${escapeAttr(id)}" data-control-label="${escapeAttr(label)}"`;
  if (primary) attrs += ' data-sf-role="primary"';
  if (row.key) attrs += ` data-binding-key="${escapeAttr(row.key.toUpperCase())}"`;
  if (row.pad) attrs += ` data-pad-action="${escapeAttr(row.pad)}"`;
  return attrs;
}

function inferMapControlId(attrs) {
  const has = (re) => re.test(attrs);
  if (has(/data-focus="local"/)) return 'scale-local';
  if (has(/data-focus="system"/)) return 'scale-system';
  if (has(/data-focus="galaxy"/)) return 'scale-galaxy';
  if (has(/\bgm-hint-btn\b/)) return 'controls';
  if (has(/\bgm-close\b/)) return 'close';
  if (has(/id="gm-engage-route-btn"/)) return 'engage';
  if (has(/id="gm-plot-course-btn"/)) return 'plot';
  if (has(/id="gm-set-course-btn"/)) return 'set-course';
  if (has(/id="gm-return-ship-btn"/)) return 'return-ship';
  if (has(/id="gm-frame-both-btn"/)) return 'frame-both';
  if (has(/id="gm-deck-sort"/)) return 'sort-deck';
  if (has(/data-layer="/)) return 'layer';
  if (has(/data-ribbon-action="engage"/)) return 'engage';
  if (has(/data-ribbon-action="resume"/)) return 'resume';
  if (has(/data-ribbon-action="disengage"/)) return 'disengage';
  if (has(/data-ribbon-action="pause"/)) return 'pause';
  if (has(/data-place-action="plot"/)) return 'plot';
  if (has(/data-place-action="frame"/)) return 'frame';
  if (has(/data-place-action="open-system"/)) return 'open-system';
  if (has(/data-place-action="bookmark"/)) return 'bookmark';
  return '';
}

/** Stamp binding-map labels onto chart markup authored outside src/ui/map/. */
export function bindMapMarkup(html) {
  const source = String(html || '');
  const open = '<' + 'button';
  const end = '>';
  if (!source.includes(open)) return source;
  return source.replace(new RegExp(open + '\\b([^' + end + ']*)' + end, 'g'), (full, attrs) => {
    if (/data-map-control=/.test(attrs)) return full;
    const id = inferMapControlId(attrs);
    if (!id || !MAP_CONTROLS[id]) {
      throw new Error(`map control has no binding-map label: ${String(attrs).replace(/\s+/g, ' ').slice(0, 180)}`);
    }
    const primary = /\b(?:k-word--primary|fh-key--primary|dp-key--primary)\b/.test(attrs);
    const gap = /^\s/.test(attrs) ? '' : ' ';
    return `<button ${mapControlAttrs(id, { primary })}${gap}${attrs}>`;
  });
}
