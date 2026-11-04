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
  /* Commission words belong to the dossier; the target text remains readable beside each verb. */
  html body #screens > .k-screen.sf-mlog.orr-mlog.orr-mlog .sf-mlog-commission-card > .sf-mlog-commission-actions {
    grid-column: 1; margin-top: 20px !important; min-width: 0;
  }
  html body #screens > .k-screen.sf-mlog.orr-mlog.orr-mlog .sf-mlog-commission-actions > .k-words--row {
    align-items: stretch; gap: 12px 24px;
  }
  html body #screens > .k-screen.sf-mlog.orr-mlog.orr-mlog .sf-mlog-commission-actions li {
    max-width: 100%; min-width: 0; align-items: flex-start;
  }
  html body #screens > .k-screen.sf-mlog.orr-mlog.orr-mlog .sf-mlog-commission-actions .k-word {
    min-height: 40px; white-space: normal; text-align: left;
  }
  html body #screens > .k-screen.sf-mlog.orr-mlog.orr-mlog .sf-mlog-commission-actions .sf-mlog-commission-target {
    max-width: 28ch; margin: 3px 0 0 !important; white-space: normal; overflow-wrap: anywhere;
    font-size: 13px !important; letter-spacing: normal !important; line-height: 1.35; text-transform: none !important;
  }
  @media (max-width: 639px) {
    html body #screens > .k-screen.sf-mlog.orr-mlog.orr-mlog .sf-mlog-commission-card > .sf-mlog-side { display: none !important; }
  }
  @media (max-width: 639px) and (max-height: 400px) {
    html body #screens > .k-screen.sf-mlog.orr-mlog.orr-mlog > .k-hang.sf-mlog-body { max-height: 25vh !important; }
    html body #screens > .k-screen.sf-mlog.orr-mlog.orr-mlog > .k-stage.sf-mlog-stage {
      -webkit-mask-image: none !important; mask-image: none !important;
    }
  }
  `;
  doc.head.appendChild(style);
}
