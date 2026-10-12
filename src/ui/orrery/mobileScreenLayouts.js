// Phone compositions of the existing ORRERY instruments. Desktop coordinates do not become
// smaller coordinates: choices and readings flow in order, with one scroll owner per screen.
const STYLE_ID = 'sf-orrery-mobile-screen-layouts';
const P = 'html:root[data-sf-mobile="1"] body #screens#screens#screens > .screen';
const N = `${P}.orr-newgame`;
const S = `${P}.orr-settings`;
const B = `${P}.orr-station`;
const M = `${B} .sx-mkt.orr-market`;
const C = 'html:root[data-sf-mobile="1"] body #screens#screens#screens #sf-galaxymap';
const W = `${P} :is(.sx-sw)`;
const H = `${P}.orr-help`;
const V = `${P}.orr-saveload`;
const A = 'html:root[data-sf-mobile="1"] body #screens#screens#screens #sf-automation';

export const MOBILE_SCREEN_CSS = `
@media (max-width:960px), (max-height:540px) and (pointer:coarse) {
  ${P} { --k-margin:14px; --k-gap:18px; --k-s:1; min-height:0 !important;
    height:100%; max-height:100dvh !important; scroll-padding:12px 0 90px; }
  ${P} *, ${A} * { box-sizing:border-box; }
  ${P} [hidden] { display:none !important; }
  ${P} :is(button, [role="button"], select, input) { min-height:44px !important; }
  ${P} :is(.k-title, .dp-frame__head) { min-width:0; }
  ${P} :is(.k-title > h1, .dp-title__name) { font-size:clamp(28px, 8vw, 42px) !important; }
  ${P} :is(.k-title > p, .dp-title__sub) { font-size:14px !important; line-height:1.4 !important; }

  /* Pause/title: ordinary document flow keeps the long reference list and its footer apart. */
  ${P}:is(.orr-title--phone, .orr-pause--phone) { display:flex !important; flex-direction:column;
    justify-content:flex-start !important; gap:18px !important; overflow-y:auto !important; }
  ${P}:is(.orr-title--phone, .orr-pause--phone) > :is(.dp-frame__head, .dp-frame__body, .dp-frame__foot) {
    position:relative !important; inset:auto !important; width:100% !important; flex:none; align-self:stretch !important; }
  ${P}.orr-pause--phone .sf-pause-brief { margin:0 0 16px !important; }
  ${P}.orr-pause--phone .sf-slot-name { font-size:20px !important; line-height:1.2 !important; }
  ${P}.orr-pause--phone .sf-pause-brief .dp-copy { font-size:14px !important; }
  ${P}.orr-pause--phone .dp-frame__body { max-height:none !important; }
  ${P}.orr-pause--phone .k-words--row { gap:8px 18px !important; }

  /* New Game: retain the selected hull, its loadout and its measured dials below the form. */
  ${N} { display:flex !important; flex-direction:column; gap:14px !important; overflow-y:hidden !important; }
  ${N} > * { position:relative !important; inset:auto !important; grid-area:auto !important; flex:none;
    width:100% !important; max-width:100% !important; min-width:0 !important; }
  ${N} > .sf-ng-scroll { display:flex; flex-direction:column; gap:14px; flex:1 1 0 !important;
    min-height:0 !important; overflow-y:auto !important; overflow-x:hidden !important; overscroll-behavior:contain; }
  ${N} .sf-ng-scroll > * { position:relative !important; inset:auto !important; width:100% !important;
    max-width:100% !important; min-width:0 !important; flex:none; }
  ${N} .sf-ng-header { order:0; }
  ${N} .sf-ng-body { order:1; height:auto !important; max-height:none !important; overflow:visible !important; }
  ${N} .sf-ng-difficulty-choices { display:grid !important; grid-template-columns:repeat(2,minmax(0,1fr)) !important;
    grid-auto-flow:row !important; gap:6px 14px !important; padding:4px 0 !important; }
  ${N} .sf-ng-difficulty-choices > li { grid-column:auto !important; grid-row:auto !important; width:auto !important; }
  ${N} .sf-ng-difficulty-choices .k-word { width:100%; min-height:44px !important; font-size:13px !important;
    padding:4px 0 !important; white-space:normal; letter-spacing:.12em !important; }
  ${N} .sf-ng-difficulty-choices .k-word[aria-pressed="true"] { color:var(--dp-hand-hot) !important; }
  ${N} .orr-yard { order:2; margin:0 !important; }
  ${N} .orr-ng-pick { display:none !important; }
  ${N} .k-stage { display:block !important; order:3; min-height:0 !important; height:auto !important; padding:0 !important; overflow:visible !important; }
  ${N} .k-stage::before { display:none !important; }
  ${N} .orr-ng-caption { position:relative !important; inset:auto !important; width:100% !important;
    max-width:100% !important; padding:0 !important; gap:8px !important; }
  ${N} .orr-ng-caption .sf-slot-card-title { font-size:28px !important; }
  ${N} .orr-ng-caption .orr-ng-stats { position:static !important; display:flex !important;
    justify-content:space-around; gap:12px; margin:6px 0 !important; }
  ${N} .k-stage > :is(.k-stage__poster, .k-world--stage) { position:relative !important; inset:auto !important;
    display:block !important; width:100% !important; height:170px !important; transform:none !important;
    opacity:1 !important; visibility:visible !important; object-fit:contain; }
  ${N} .k-stage > .orr-ng-hero-box { display:none !important; }
  ${N} .orr-ng-caption > div:has(> ul[aria-label="Loadout"]) { margin-top:8px !important; }
  ${N} .orr-ng-caption ul[aria-label="Loadout"] { display:flex !important; flex-direction:column !important; gap:5px !important; }
  ${N} .sf-ng-route { position:relative !important; inset:auto !important; width:100% !important; margin-top:12px !important; }
  ${N} .sf-ng-route .sf-ng-route__steps { display:grid !important; grid-template-columns:repeat(2,minmax(0,1fr));
    gap:12px 18px !important; padding:12px 0 0 !important; }
  ${N} .sf-ng-route .sf-ng-route__step { padding:8px 0 0 !important; }
  ${N} .sf-ng-route .sf-ng-route__steps::after { display:none !important; }
  ${N} .sf-ng-route .sf-ng-route__step::before { top:0 !important; }
  ${N} .sf-ng-route .sf-ng-route__step .k-row__sub { opacity:1 !important; }
  ${N} > .sf-ng-footer { order:4; position:relative !important; bottom:auto !important; z-index:8;
    margin-top:4px !important; padding:10px 0 !important; }
  ${N} .sf-ng-scroll > .k-fine { order:5; }
  ${N} > .sf-ng-launch-error { order:4; margin:0 !important; width:100%; }
  ${N} .orr-stopscale .k-word { min-height:44px !important; }

  /* Settings: scroll the category rail sideways; give explanatory labels their whole line. */
  ${S} { display:flex !important; flex-direction:column; gap:14px !important; overflow-y:auto !important; }
  ${S} > :is(.k-title, .k-hang, #sf-settings-pane, .orr-set-preview, .k-foot) { flex:none; width:100% !important; min-width:0 !important; }
  ${S} .sf-tabbar { flex-direction:row !important; width:100% !important; gap:8px !important;
    overflow-x:auto !important; overflow-y:hidden !important; background:none !important; padding:0 0 6px !important; }
  ${S} .sf-tabbar > li { width:auto !important; flex:0 0 auto; }
  ${S} .sf-tabbar > li::before { display:none !important; }
  ${S} .sf-tabbar .sf-tab { width:auto !important; min-height:44px !important; padding:8px 12px !important;
    letter-spacing:.12em !important; }
  ${S} .sf-tabbar .sf-tab::before, ${S} .sf-tabbar .sf-tab::after { display:none !important; }
  ${S} .sf-tabbar .sf-tab[aria-selected="true"] { color:var(--dp-hand-hot) !important; }
  ${S} #sf-settings-pane { max-height:none !important; overflow:visible !important; padding:0 !important;
    -webkit-mask-image:none !important; mask-image:none !important; --orr-scale-w:min(60vw,240px); }
  ${S} #sf-settings-pane .k-row { grid-template-columns:minmax(0,1fr) !important; padding:10px 0 10px 22px !important; row-gap:8px !important; }
  ${S} #sf-settings-pane .k-row > * { grid-column:1 !important; grid-row:auto !important; min-width:0; max-width:100%; }
  ${S} #sf-settings-pane .k-row > :is(label, span.k-t-body) { font-size:12px !important; line-height:1.35 !important; letter-spacing:.09em !important; }
  ${S} #sf-settings-pane .k-row > .k-words--row { width:100%; max-width:100%; flex-wrap:wrap !important; }
  ${S} #sf-settings-pane .k-row > div.k-words--row { grid-template-columns:minmax(0,1fr) 54px !important; gap:10px !important; }
  ${S} #sf-settings-pane .k-row .k-range { width:100% !important; min-width:0 !important; }
  ${S} > .orr-set-preview { display:grid !important; position:relative !important; inset:auto !important;
    min-height:360px !important; height:360px !important; grid-template-rows:auto minmax(220px,1fr) !important; order:4; }
  ${S} > .k-foot { order:5; position:relative !important; bottom:auto; z-index:5; padding:8px 0 !important; background:rgb(5 7 10 / .96); }

  /* Berth: no desktop minimum widths; the vitals wrap and the tab starts after the header. */
  ${B} { display:flex !important; flex-direction:column; gap:18px !important; overflow-y:auto !important; }
  ${B} header.sxb-berth { display:flex !important; flex-direction:column; align-items:stretch !important;
    gap:14px !important; padding:0 !important; min-width:0 !important; flex:none; }
  ${B} .sxb-crown { width:100% !important; min-width:0 !important; max-width:100% !important; }
  ${B} .sxb-vitals { display:grid !important; grid-template-columns:repeat(3,minmax(0,1fr)) !important;
    gap:12px 8px !important; justify-content:start; }
  ${B} .sxb-vital { min-width:0 !important; width:100% !important; max-width:100%; }
  ${B} .sxb-vital [data-vital-act] { flex-wrap:wrap; justify-content:center; white-space:normal; letter-spacing:.05em !important; }
  ${B} :is(.sxb-berth, .sxb-handoff, .sxb-mechanic, .sxb-next) { max-width:100% !important; min-width:0 !important; }
  ${B} .sxb-next { flex-wrap:wrap !important; }
  ${B} .dp-frame__body--station { flex:none !important; height:auto !important; min-height:0 !important; overflow:visible !important; }
  ${B} .sx-screen__body { height:auto !important; max-height:none !important; overflow:visible !important; }
  ${B} :is(.sx-ind, .sx-ct, .sx-fac, .sx-bar, .sx-ledger, .sx-dossier) { display:flex !important;
    flex-direction:column; gap:18px !important; min-width:0 !important; height:auto !important; overflow:visible !important; }
  ${B} :is(.sx-ind, .sx-ct, .sx-fac, .sx-bar, .sx-ledger, .sx-dossier) > * { min-width:0 !important;
    max-width:100% !important; height:auto !important; max-height:none !important; flex:none; }
  ${B} .sx-fab-head { display:flex !important; flex-direction:column; gap:8px !important; }
  ${B} .sx-fab-head > * { position:relative !important; inset:auto !important; grid-area:auto !important; text-align:left !important; }
  ${B} .sx-fab-head__name { font-size:26px !important; }
  ${B} .sx-fab { display:flex !important; flex-direction:column; gap:12px !important; height:auto !important; }
  ${B} .sx-fab > * { position:relative !important; inset:auto !important; transform:none !important;
    grid-area:auto !important; width:100% !important; max-width:100% !important; min-width:0 !important; }
  ${B} .orr-chain__label { max-width:55%; white-space:normal !important; }
  ${B} .orr-chain__verb > * { max-width:100%; white-space:normal !important; overflow-wrap:anywhere;
    font-size:12px !important; letter-spacing:.08em !important; }
  ${B} :is(.sx-fac__stage, .sx-bar__stage, .sx-ct__stage) { grid-template-columns:minmax(0,1fr) !important; }
  ${B} footer.sxb-ops { position:relative !important; bottom:auto !important; flex:none !important; }
  ${M}, ${M} .sx-mkt__stage { display:flex !important; flex-direction:column; gap:20px !important; height:auto !important; overflow:visible !important; }
  ${M} :is(.sx-mkt__hang, .sx-mkt__analysis, .sx-mkt__console, .sx-mkt__decision, .sx-mkt-browser, .sx-mkt-browser__rail) {
    position:relative !important; inset:auto !important; width:100% !important; max-width:100% !important;
    min-width:0 !important; height:auto !important; max-height:none !important; overflow:visible !important; mask-image:none !important; }
  ${M} .orr-mkt-find { position:relative !important; inset:auto !important; width:100% !important; margin:8px 0 !important; }
  ${M} .sx-mkt-browser__mode { padding-right:0 !important; flex-wrap:wrap; gap:8px; }
  ${M} .sx-mkt-browser__filters { gap:6px 14px !important; }
  ${M} .sx-mkt-table { width:100% !important; font-size:12px; }
  ${M} .sx-mkt-table :is(td,th) { padding-left:4px !important; padding-right:4px !important; }
  ${M} .sx-mkt-table .k-row__name { white-space:normal !important; overflow-wrap:anywhere; }

  /* Shared ship instrument: keep the ship, stats, systems and choices in a reachable stack. */
  ${W} { display:flex !important; flex-direction:column; gap:16px !important; width:100% !important; min-width:0 !important;
    height:auto !important; overflow:visible !important; align-self:start !important; }
  ${W} > *, ${W} .sx-sw__main { position:relative !important; inset:auto !important; width:100% !important;
    max-width:100% !important; min-width:0 !important; height:auto !important; max-height:none !important; overflow:visible !important;
    flex:0 0 auto !important; mask-image:none !important; -webkit-mask-image:none !important; }
  ${W} .sx-sw__main { display:flex !important; flex-direction:column; gap:14px !important; }
  ${W} .sx-sw__stage { position:relative !important; height:420px !important; min-height:420px !important; width:100% !important; overflow:hidden !important; flex:none !important; }
  ${W} .sx-sw__stats, ${W} .sx-sw-verbs { position:relative !important; inset:auto !important; transform:none !important;
    width:100% !important; max-width:100% !important; flex-wrap:wrap !important; flex:none !important; margin:0 !important;
    padding-right:0 !important; grid-template-columns:repeat(2,minmax(0,1fr)) !important; }
  ${W} .sx-sw__nameplate { position:relative !important; inset:auto !important; max-width:100% !important;
    width:100% !important; margin:0 !important; padding:0 !important; flex:none; }
  ${W} .sx-sw__nameplate .sx-sw__blurb { font-size:14px !important; max-height:none !important; overflow:visible !important; }
  ${W} .sx-sw__side .k-row { grid-template-columns:minmax(0,1fr) auto !important; min-height:44px !important; }

  /* Chart keeps a real viewport, then an inspector. The map owns gestures, the page owns scroll. */
  ${C} { overflow-y:auto !important; overflow-x:hidden !important; --gm-inspector-w:100%; }
  ${C} .gm-head { grid-template-columns:minmax(0,1fr) auto auto !important; grid-template-rows:auto auto auto !important; gap:8px !important; }
  ${C} .gm-title-lockup { grid-column:1 !important; grid-row:1 !important; min-width:0; }
  ${C} .gm-title { white-space:normal !important; overflow:visible !important; font-size:20px !important; }
  ${C} .gm-rail { grid-column:1 / -1 !important; grid-row:3 !important; }
  ${C} .gm-search-container { grid-column:1 / -1 !important; grid-row:2 !important; width:100% !important; }
  ${C} .gm-navfoot { display:grid !important; grid-template-columns:repeat(2,minmax(0,1fr)); gap:12px 16px !important; }
  ${C} .gm-navfoot .gm-nav-row { flex-direction:column !important; align-items:flex-start !important; gap:4px !important; min-width:0; }
  ${C} .gm-navfoot .gm-nav-row-v { max-width:100%; white-space:normal !important; overflow-wrap:anywhere; }

  /* The reference screens are pages: neither their category rail nor their rig can sit off-right. */
  ${H} { display:flex !important; flex-direction:column; gap:16px !important; overflow-y:auto !important; }
  ${H} > * { position:relative !important; inset:auto !important; flex:none; width:100% !important;
    min-width:0 !important; height:auto !important; max-height:none !important; }
  ${H} .orr-help__tabs { flex-direction:row !important; overflow-x:auto !important; gap:8px !important; background:none !important; }
  ${H} .orr-help__tabs > li { width:auto !important; flex:none; }
  ${H} .orr-help__tabs > li::before { display:none !important; }
  ${H} .orr-help__tabs .sf-tab { width:auto !important; padding:8px 12px !important; min-height:44px !important; }
  ${H} .orr-help__tabs .sf-tab::before, ${H} .orr-help__tabs .sf-tab::after { display:none !important; }
  ${H} .orr-help-controls { grid-template-columns:minmax(0,1fr) !important; height:auto !important; gap:20px !important; }
  ${H} .orr-help-controls__rig { min-height:320px !important; }
  ${H} .orr-help-controls__rig.is-phone { display:grid; grid-template-columns:repeat(2,minmax(0,1fr));
    gap:8px 12px; padding-top:280px; }
  ${H} .orr-help-controls__rig.is-phone .orr-hrig__st { position:relative !important; inset:auto !important;
    width:100% !important; min-width:0; min-height:44px !important; transform:none !important;
    flex-direction:row !important; text-align:left !important; order:2; gap:6px !important; }
  ${H} .orr-help-controls__rig.is-phone .orr-hrig__verb { white-space:normal; font-size:12px; }
  ${H} .orr-help-controls__rig.is-phone .orr-hrig__pool { left:0 !important; top:0 !important; width:100% !important; height:280px !important; }
  ${H} .orr-help-controls__rig.is-phone .orr-hrig__foot { position:relative !important; inset:auto !important;
    grid-column:1 / -1; flex-wrap:wrap; order:3; width:100%; }
  ${H} .orr-help-controls__rig.is-phone :is(.orr-hrig__lead, .orr-hrig__lead-band, .orr-hrig__halo) { display:none; }
  ${H} :is(.orr-hreg, .orr-hreg__scroll) { height:auto !important; max-height:none !important; overflow:visible !important; }
  ${H} .orr-help__stage :is(.sf-grid, .dp-grid) { grid-template-columns:minmax(0,1fr) !important; }

  /* Save portraits retain a horizontal rail, with enough room for each save's own label. */
  ${V} .orr-film { height:auto !important; min-height:280px !important; overflow-x:auto !important; overflow-y:hidden !important; }
  ${V} .orr-film__list { width:max-content !important; min-width:100%; gap:18px !important; align-items:flex-start !important; }
  ${V} .orr-film__list > .sf-slot { flex:0 0 150px !important; width:150px !important; min-width:150px !important; }
  ${V} .orr-film__list .sf-slot-badges { display:block !important; margin:4px 0 !important; }
  ${V} .orr-film__list .sf-slot-badge { display:block !important; margin:0 !important; }

  /* Operations keeps all four tabs, purchasing prerequisites and flow instruments readable. */
  ${A} { width:100% !important; height:100% !important; min-width:0 !important; max-width:100% !important;
    overflow-y:auto !important; overflow-x:hidden !important; }
  ${A} .au-head, ${A} .au-body { padding:12px !important; }
  ${A} .au-top, ${A} .au-top-right, ${A} .au-income { flex-wrap:wrap !important; gap:12px !important; }
  ${A} .au-title { font-size:28px !important; }
  ${A} .au-top-right { justify-content:space-between; width:100%; }
  ${A} .au-body { flex:none !important; overflow:visible !important; }
  ${A} .au-flow { display:grid !important; grid-template-columns:repeat(2,minmax(0,1fr)) !important;
    flex:0 0 100% !important; width:100% !important; gap:10px 14px !important; margin:0 !important; }
  ${A} .au-flow__cap { grid-column:1 / -1; white-space:normal !important; margin:0 !important; }
  ${A} .au-node { min-width:0 !important; }
  ${A} .au-node__ring { width:44px !important; height:44px !important; }
  ${A} .au-command, ${A} .au-summary { grid-template-columns:minmax(0,1fr) !important; gap:16px !important; }
  ${A} .au-next-row { flex-direction:column !important; align-items:flex-start !important; gap:10px !important; }
  ${A} .au-next-body { display:block !important; -webkit-line-clamp:unset !important; overflow:visible !important; }
  ${A} .au-shop .grow, ${A} .au-shop .meta { grid-template-columns:minmax(0,1fr) !important; grid-auto-flow:row !important; }
  ${A} .au-shop .meta { grid-column:1 !important; }
  ${A} .au-shop .meta > span { white-space:normal !important; }
  ${A} .au-card { min-width:0 !important; }
  ${A} button { min-height:44px !important; max-width:100%; white-space:normal !important; }

  /* The mine remains a playfield; its toolbar wraps inside it instead of clipping Leave. */
  ${P} .ast-screen { width:100% !important; max-width:100% !important; min-width:0; }
  ${P} .aw-crest { flex:none !important; flex-wrap:wrap; gap:8px 10px; height:auto !important; padding:8px 10px !important; }
  ${P} .aw-crest-name { font-size:20px !important; line-height:1.2; white-space:normal; }
  ${P} .aw-crest-right { margin-left:auto; flex-wrap:wrap; justify-content:flex-end; gap:6px !important; }
  ${P} .aw-chip { white-space:normal; max-width:100%; }
  ${P} .aw-key { display:none; }
  ${P} .aw-guide { max-width:calc(100% - 20px) !important; }
}
`;

export function injectOrreryMobileScreens(doc = globalThis.document) {
  if (!doc?.head || doc.getElementById(STYLE_ID)) return;
  const style = doc.createElement('style');
  style.id = STYLE_ID;
  style.textContent = MOBILE_SCREEN_CSS;
  doc.head.appendChild(style);
}
