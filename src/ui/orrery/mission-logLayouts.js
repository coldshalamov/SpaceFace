// src/ui/orrery/mission-logLayouts.js — the Mission log's own layout sheet.
//
// The screen composes the ORRERY library through src/ui/orrery/archiveLayouts.js (the tracing beam,
// the dial, the route band, the words); that shared sheet stays untouched and this one carries only
// the mission log's own layout corrections, injected after it so the cascade resolves without
// !important. Class names, roles and data hooks are the screen's; nothing here introduces a second
// token root, a box, or a new stylesheet under styles/.
import { injectOrrery } from './tokens.js';

export function injectMissionLogLayouts(doc = globalThis.document) {
  injectOrrery(doc);
  if (!doc?.head || doc.getElementById('sf-mlog-layout')) return;
  const style = doc.createElement('style');
  style.id = 'sf-mlog-layout';
  style.textContent = `
  /* The route band's FROM/TO ends: the base (wide) band held each end to one line with an
     ellipsis, so a long destination lost its sector — "Ruined Cache Station (Ashfall …" on the
     real pixels (ui-bench mission-log, the traced two-contract state, 2026-10-24). The narrow
     bands already wrap between place names rather than ellipsize the sector away; the wide band
     takes the same rule. Same selectors as the archive sheet, injected after it. */
  html body #screens > .k-screen.sf-mlog.orr-mlog.orr-mlog :is(.ml-route__from, .ml-route__to) {
    white-space: normal;
  }
  `;
  doc.head.appendChild(style);
}
