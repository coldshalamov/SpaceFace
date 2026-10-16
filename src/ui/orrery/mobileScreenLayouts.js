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

  /* Berth phone: identity, a swipeable tape, one row of vitals and the next step stay on glass; the tab body
     is the one scroll; the destinations sit above Undock. */
  ${B} { display:flex !important; flex-direction:column; gap:8px !important; overflow:hidden !important;
    height:100% !important; max-height:100dvh !important; }
  ${B} header.sxb-berth { position:relative !important; display:grid !important; grid-template-columns:minmax(0,1fr) 44px !important;
    grid-template-areas:"title title" "tape find" "crown crown" "hand hand" !important; column-gap:6px !important; row-gap:6px !important;
    align-items:center !important; padding:0 !important; min-width:0 !important; flex:0 0 auto !important; max-height:none; }
  ${B} header.sxb-berth > .so-station-mark { position:absolute !important; width:1px !important; height:1px !important; overflow:hidden !important; opacity:0 !important; }
  ${B} .so-station-title { grid-area:title; width:100% !important; max-width:100% !important; min-width:0 !important; }
  ${B} .so-station-title > :is(.sxb-berth__ident, .sxb-berth__name) { padding-right:104px !important; }
  ${B} .sxb-berth__ident { white-space:nowrap !important; overflow:hidden !important; text-overflow:ellipsis !important; }
  ${B} .sxb-berth__name, ${B} .sxb-berth__name.k-t-hero, ${B} .sxb-berth__name.k-t-title,
  ${B} .sxb-berth__name.fh-hero, ${B} .sxb-berth__name.fh-title {
    font-size:clamp(22px, 6.6vw, 28px) !important; line-height:1.05 !important; }
  /* The purse rides the title band's right end. */
  ${B} .sxb-purse { position:absolute !important; grid-area:auto !important; top:0 !important; right:0 !important; left:auto !important; bottom:auto !important; width:100px !important; margin:0 !important; display:flex !important;
    flex-direction:column !important; align-items:flex-end !important; gap:3px !important; text-align:right; }
  ${B} .sxb-purse__label { font-size:12px !important; letter-spacing:.16em !important; line-height:14px !important; margin:0 !important; }
  ${B} .sxb-purse__value { font-size:24px !important; line-height:1.05 !important; }
  /* Find a service: no Ctrl K on glass, so the palette keeps a 44px icon key beside the tape. */
  ${B} .so-command-trigger { grid-area:find; justify-self:end; align-self:center; position:relative !important;
    display:inline-flex !important; align-items:center !important; justify-content:center !important;
    width:44px !important; height:44px !important; min-width:44px !important; min-height:44px !important; padding:0 !important; margin:0 !important;
    border-radius:50% !important; color:rgb(236 230 216 / .82) !important;
    background:radial-gradient(circle, rgb(7 8 10 / .55) 0 14.5px, rgb(236 230 216 / .34) 15px 16px, rgb(236 230 216 / 0) 16.5px) !important; }
  ${B} .so-command-trigger > .so-icon { display:block !important; width:16px !important; height:16px !important; }
  ${B} .so-command-trigger > span { position:absolute !important; width:1px !important; height:1px !important; overflow:hidden !important;
    clip:rect(0 0 0 0) !important; white-space:nowrap !important; }
  ${B} .so-command-trigger > .dp-kbd { display:none !important; }
  ${B} .so-command-trigger:is(:hover, :focus-visible) { color:var(--dp-hand, #f2b950) !important; }
  /* The tape: mechanic, station event and story ledger as two-line cards; swipe for the next one. */
  ${B} .sxb-tape { grid-area:tape; max-width:100% !important; min-width:0 !important; margin:0 !important; padding:0 !important;
    display:flex !important; flex-wrap:nowrap !important; gap:12px !important; align-items:flex-start !important;
    overflow-x:auto !important; overflow-y:hidden !important; scroll-snap-type:x mandatory; overscroll-behavior-x:contain;
    scrollbar-width:none; -webkit-overflow-scrolling:touch; }
  ${B} .sxb-tape::-webkit-scrollbar { display:none; }
  ${B} .sxb-tape > .sxb-event:not([hidden]) { display:-webkit-box !important; -webkit-box-orient:vertical; -webkit-line-clamp:2;
    flex:0 0 100% !important; min-width:0 !important; max-width:100% !important; max-height:30px; overflow:hidden !important;
    scroll-snap-align:start; margin:0 !important; padding:0 !important; background:none !important; border:0 !important;
    box-shadow:none !important; font-size:12px !important; line-height:15px !important; white-space:normal !important; }
  ${B} .sxb-tape:has(> .sxb-event:not([hidden]) ~ .sxb-event:not([hidden])) > .sxb-event:not([hidden]) { flex-basis:86% !important; }
  /* The hull reading leads (a re-render keeps the strip on it); event and ledger peek in from the right. */
  ${B} .sxb-tape > .sxb-berth__mechanic { order:-1; }
  ${B} .sxb-tape:has(> .sxb-berth__mechanic:not([hidden])) > .sxb-event:not(.sxb-berth__mechanic):not([hidden]),
  ${B} .sxb-tape > .sxb-event:not(.sxb-berth__mechanic):not([hidden]) ~ .sxb-berth__ledger:not([hidden]) { padding-left:12px !important;
    border-left:1px solid rgb(236 230 216 / .22) !important; }
  ${B} .sxb-tape .sxb-event > * { display:inline !important; position:static !important; margin:0 6px 0 0 !important; padding:0 !important; }
  ${B} .sxb-tape :is(.sxb-event__badge, .sxb-event__title) { font-size:12px !important; letter-spacing:.14em !important; white-space:nowrap !important; }
  ${B} .sxb-tape .sxb-event__body { font-size:12px !important; line-height:15px !important; opacity:.74; white-space:normal !important;
    overflow:visible !important; text-overflow:clip !important; max-width:none !important; }
  /* Next step: one line, after the vitals. */
  ${B} .sxb-handoff { grid-area:hand; max-width:100% !important; min-width:0 !important; margin:0 !important;
    padding:0 !important; gap:4px 12px !important; flex-wrap:nowrap !important; align-items:center !important; overflow:hidden !important; }
  ${B} .sxb-next { flex:1 1 auto !important; min-width:0 !important; flex-wrap:nowrap !important; gap:6px 8px !important;
    align-items:center !important; overflow:hidden !important; padding:0 !important; }
  ${B} .sxb-next__t { font-size:12px !important; letter-spacing:.12em !important; white-space:nowrap !important; flex:none !important; }
  ${B} .sxb-next__w { font-size:12px !important; line-height:1.25 !important; padding-left:0 !important;
    white-space:nowrap !important; overflow:hidden !important; text-overflow:ellipsis !important; min-width:0 !important; }
  ${B} .sxb-next__n { display:none !important; }
  ${B} .sxb-next__x { min-height:44px !important; height:44px !important; padding:0 0 0 8px !important; font-size:12px !important;
    letter-spacing:.12em !important; flex:none !important; }
  /* Crown: one row of small dials, every column on the 14px gutter; each service verb is a two-line key
     with a 44px hit box (the box reaches over the label above, never over another control). */
  ${B} .sxb-crown { grid-area:crown; position:static !important; width:100% !important; min-width:0 !important; max-width:100% !important;
    display:block !important; margin:0 0 10px !important; padding:0 !important; }
  ${B} .sxb-crown::before { display:none !important; }
  ${B} .sxb-vitals { display:grid !important; grid-auto-flow:column !important; grid-auto-columns:minmax(0,1fr) !important;
    grid-template-columns:none !important; gap:0 4px !important; justify-content:stretch !important; align-items:stretch !important;
    margin:0 !important; padding:0 !important; max-width:none !important; width:100% !important; }
  ${B} .sxb-vital { min-width:0 !important; width:auto !important; max-width:100%; align-items:center !important; justify-content:flex-start !important;
    grid-column:auto !important; grid-row:auto !important; }
  ${B} :is(.sxb-vital__track, .sxb-vital > .orr-vdial-bare, .orr-vdial) { width:60px !important; height:40px !important; }
  ${B} .sxb-vital__value { top:9px !important; }
  ${B} .sxb-vital__value .orr-vnum { font-size:13px !important; }
  ${B} .sxb-vital__value .orr-vden { font-size:12px !important; letter-spacing:.02em !important; }
  ${B} .sxb-vital__label { max-width:60px !important; min-height:28px !important; font-size:12px !important; letter-spacing:.08em !important; line-height:14px !important;
    white-space:normal !important; overflow-wrap:anywhere !important; text-align:center !important; }
  /* A word reading (LEDGER: CREDIT LINE OPEN) takes the dial's place, so its label lines up with the others. */
  ${B} .sxb-vital:has(.sxb-vital__value .orr-vnum.is-word) > .orr-vdial-bare { display:none !important; }
  ${B} .sxb-vital:has(.sxb-vital__value .orr-vnum.is-word) .sxb-vital__value { position:static !important; order:-1; height:40px !important;
    margin:0 !important; justify-content:center !important; }
  ${B} .sxb-vital__value .orr-vnum.is-word { font-size:12px !important; line-height:14px !important; letter-spacing:.06em !important;
    margin:0 !important; white-space:normal !important; overflow-wrap:anywhere !important; text-align:center !important; max-width:60px !important; }
  ${B} .sxb-vital__acts { margin-top:4px !important; gap:2px !important; display:flex !important; flex-direction:column !important;
    align-items:center !important; width:100% !important; }
  ${B} .sxb-vital [data-vital-act] { position:relative !important; display:flex !important; flex-direction:column !important; align-items:center !important;
    gap:0 !important; min-height:0 !important; min-width:0 !important; height:auto !important; width:100% !important; padding:2px 0 !important;
    font-size:12px !important; line-height:14px !important; letter-spacing:.06em !important; white-space:nowrap !important; }
  ${B} .sxb-vital [data-vital-act]::before { display:none !important; }
  ${B} .sxb-vital [data-vital-act] .orr-act__cost { font-size:12px !important; letter-spacing:.04em !important; }
  ${B} .sxb-vital [data-vital-act]::after { content:"" !important; display:block !important; position:absolute !important;
    left:-2px !important; right:-2px !important; top:-14px !important; bottom:-2px !important; width:auto !important; height:auto !important;
    background:none !important; border:0 !important; transform:none !important; }
  ${B} .sxb-vital [data-vital-act]:first-of-type:not(:last-of-type)::after { top:-16px !important; bottom:0 !important; }
  ${B} .sxb-vital [data-vital-act]:last-of-type:not(:first-of-type)::after { top:0 !important; bottom:-16px !important; }
  ${B} :is(.sxb-berth, .sxb-handoff, .sxb-mechanic, .sxb-next) { max-width:100% !important; min-width:0 !important; }
  /* Tab body owns the remaining glass; the inner body is the only scroll. */
  ${B} .dp-frame__body--station { flex:1 1 0 !important; min-height:0 !important; height:auto !important; max-height:none !important;
    display:flex !important; flex-direction:column !important; overflow:hidden !important; padding:0 !important; }
  ${B} .dp-frame__body--station > .sx-screen__body { flex:1 1 0 !important; min-height:0 !important; height:auto !important; max-height:none !important;
    overflow-x:hidden !important; overflow-y:auto !important; overscroll-behavior:contain; -webkit-overflow-scrolling:touch; padding:0 !important; }
  ${B} :is(.sx-ind, .sx-ct, .sx-fac, .sx-bar, .sx-ledger, .sx-dossier) { display:flex !important;
    flex-direction:column; gap:14px !important; min-width:0 !important; height:auto !important; overflow:visible !important; }
  ${B} :is(.sx-ind, .sx-ct, .sx-fac, .sx-bar, .sx-ledger, .sx-dossier) > * { min-width:0 !important;
    max-width:100% !important; height:auto !important; max-height:none !important; flex:none; }
  ${B} .sx-fab-head { display:flex !important; flex-direction:column; gap:8px !important; }
  ${B} .sx-fab-head > * { position:relative !important; inset:auto !important; grid-area:auto !important; text-align:left !important; }
  ${B} .sx-fab-head__name { font-size:22px !important; }
  ${B} .sx-fab { display:flex !important; flex-direction:column; gap:12px !important; height:auto !important; }
  ${B} .sx-fab > * { position:relative !important; inset:auto !important; transform:none !important;
    grid-area:auto !important; width:100% !important; max-width:100% !important; min-width:0 !important; }
  ${B} .orr-chain__label { max-width:55%; white-space:normal !important; }
  ${B} .orr-chain__verb > * { max-width:100%; white-space:normal !important; overflow-wrap:anywhere;
    font-size:12px !important; letter-spacing:.08em !important; }
  ${B} :is(.sx-fac__stage, .sx-bar__stage, .sx-ct__stage) { grid-template-columns:minmax(0,1fr) !important; }
  /* Contract dossier: a phone-sized title and reward, and ACCEPT docks on a full-width opaque band so the
     dossier scrolls under it instead of through it. Over 800px tall only:
     shorter phones already keep ACCEPT in flow with the compact title. */
  @media (min-height:801px) {
    ${B} .sx-dossier__title { font-size:24px !important; line-height:1.12 !important; margin:4px 0 6px !important; }
    ${B} .sx-dossier .k-hero--hero .k-hero__n { font-size:44px !important; }
    ${B} .sx-dossier > .sx-dossier__foot { align-self:stretch !important; margin:12px -16px 0 !important; padding:10px 16px 10px !important; width:auto !important; max-width:none !important;
      background:rgb(6 8 11) !important; border-top:1px solid rgb(236 230 216 / .12) !important;
      -webkit-mask-image:none !important; mask-image:none !important; }
  }
  ${B} .sx-dossier > .orr-ct-route { height:240px !important; }
  /* Ledger: the desktop right column is pinned beside the list; on a phone it follows the list in flow,
     so the tape, the reading and the purse each take the full width instead of laying over the rows.
     Each entry puts its cycle above the line, so the item and its figure get the whole row; the arrow-key hint
     has no keys to name on glass. */
  ${B} .sx-ledger .st-ledger-entry-body { grid-template-columns:minmax(0, 1fr) !important; grid-template-areas:"time" "line" "note" !important; row-gap:3px !important; }
  ${B} .sx-ledger .st-ledger-line .sx-ledger__item { min-width:0 !important; white-space:normal !important; overflow-wrap:anywhere !important;
    overflow:visible !important; text-overflow:clip !important; }
  ${B} .sx-ledger > .sx-ledger__right { position:relative !important; inset:auto !important; left:auto !important; width:100% !important;
    display:flex !important; flex-direction:column !important; gap:6px !important; overflow:visible !important; }
  ${B} .sx-ledger > .st-ledger { padding-bottom:0 !important; }
  ${B} .sx-ledger .sx-ledger__keys { display:none !important; }
  ${B} .sx-ledger__right > .orr-ledger-tape { height:196px !important; margin:0 !important; }
  ${B} .sx-ledger__right > .sx-ledger__row { display:flex !important; flex-direction:column !important; align-items:stretch !important; gap:12px !important; }
  ${B} .sx-ledger__row > .sx-ledger__read { width:100% !important; }
  ${B} .sx-ledger__read::before { inset:-12px -16px !important; }
  ${B} .sx-ledger__read-num { font-size:52px !important; }
  ${B} .sx-ledger__read-title { font-size:18px !important; }
  ${B} .sx-ledger__row > .orr-ledger-purse { align-self:center !important; width:240px !important; height:190px !important; margin:0 0 8px !important; }
  /* Destination foot stays on glass: the seven tabs on a 4-column grid, then Comms and Undock. */
  ${B} footer.sxb-ops { position:relative !important; bottom:auto !important; flex:0 0 auto !important;
    display:flex !important; flex-wrap:wrap !important; align-items:center !important; gap:2px 10px !important; margin:0 !important;
    padding:6px 0 calc(4px + env(safe-area-inset-bottom, 0px)) !important; height:auto !important;
    background:linear-gradient(180deg, rgb(5 7 10 / 0), rgb(5 7 10 / .92) 18%, rgb(5 7 10 / .98)) !important;
    border-top:1px solid rgb(236 230 216 / .14) !important; z-index:5; }
  ${B} .sxb-ops .of-facility-rail { order:1; max-width:100% !important; flex:1 1 100% !important; min-width:0 !important;
    width:100% !important; overflow:visible !important; height:auto !important; }
  ${B} .sxb-ops .of-facility-rail .sxb-ops__dock { display:block !important; width:100% !important; min-width:0 !important; max-width:100% !important; }
  ${B} .sxb-ops .of-facility-rail .sx-dock { width:100% !important; max-width:100% !important; position:relative !important; }
  ${B} .sxb-ops .sx-dock__group--nav, ${B} .sxb-ops .sx-dock > .sx-dock__group { display:grid !important;
    grid-template-columns:repeat(4, auto) !important; justify-content:space-between !important; gap:0 8px !important;
    padding:0 !important; margin:0 !important; max-width:100% !important; width:100% !important; }
  ${B} .sxb-ops .sx-dock__group > li { margin:0 !important; min-width:0 !important; }
  ${B} .sxb-ops .sx-tile { display:inline-flex !important; align-items:center !important; justify-content:flex-start !important;
    min-height:34px !important; padding:0 !important; gap:0 !important; }
  ${B} .sxb-ops .sx-tile__label { order:1; letter-spacing:.1em !important; font-size:12px !important; }
  /* A count is a badge on its own tab: a small pill after the word, never a loose numeral before it. */
  ${B} .sxb-ops .sx-tile__badge:not([hidden]) { order:2; display:inline-flex !important; align-items:center !important; justify-content:center !important;
    min-width:15px !important; height:15px !important; margin:0 0 0 4px !important; padding:0 4px !important; border-radius:8px !important;
    background:var(--dp-hand, #f2b950) !important; color:#1c1406 !important; font-size:12px !important; font-weight:750 !important;
    letter-spacing:0 !important; line-height:15px !important; transform:translateY(-5px); }
  ${B} .sxb-ops .orr-stationrow__rule { display:none !important; }
  ${B} .sxb-ops .sx-comms { order:2; margin:0 !important; }
  ${B} .sxb-ops .sxb-launch-seat { order:3; margin:0 0 0 auto !important; }
  ${B} .sxb-launch { gap:8px !important; padding:4px 2px 4px !important; min-height:44px !important; }
  ${B} .sxb-launch__label { font-size:15px !important; letter-spacing:.08em !important; }
  /* A phone on its side has ~390px: the berth scrolls as one page there, with the destination foot pinned. */
  @media (max-height:560px) {
    ${B} { overflow-x:hidden !important; overflow-y:auto !important; padding-bottom:0 !important; scroll-padding-bottom:0 !important; }
    ${B} .dp-frame__body--station, ${B} .dp-frame__body--station > .sx-screen__body { flex:none !important; overflow:visible !important; }
    /* one row, not two: the tabs take what Comms and Undock leave and slide sideways if a narrow phone runs out */
    ${B} footer.sxb-ops { position:sticky !important; bottom:0 !important; background:rgb(5 7 10) !important; flex-wrap:nowrap !important;
      gap:0 12px !important; padding:3px 0 calc(3px + env(safe-area-inset-bottom, 0px)) !important; }
    ${B} .sxb-ops .of-facility-rail { flex:1 1 0 !important; width:auto !important; overflow-x:auto !important; overflow-y:hidden !important;
      overscroll-behavior-x:contain; scrollbar-width:none; }
    ${B} .sxb-ops .of-facility-rail::-webkit-scrollbar { display:none; }
    ${B} .sxb-ops .of-facility-rail .sxb-ops__dock, ${B} .sxb-ops .of-facility-rail .sx-dock { width:max-content !important; min-width:100% !important; max-width:none !important; }
    ${B} .sxb-ops .sx-dock__group--nav, ${B} .sxb-ops .sx-dock > .sx-dock__group { grid-template-columns:repeat(7, auto) !important;
      width:max-content !important; min-width:100% !important; max-width:none !important; gap:0 12px !important; }
    ${B} .sxb-ops .sx-tile__label { letter-spacing:.07em !important; }
    ${B} .sxb-ops .sx-tile { min-height:44px !important; }
    ${B} .sxb-ops :is(.sx-comms, .sxb-launch-seat) { flex:none !important; }
    @media (max-width:800px) {
      ${B} .sxb-ops .of-facility-rail { -webkit-mask-image:linear-gradient(90deg, #000 calc(100% - 28px), transparent);
        mask-image:linear-gradient(90deg, #000 calc(100% - 28px), transparent); }
    }
  }
  /* Market on a phone: the commodity, then the trade (dial, total, Buy/Sell), then the adventure decision, then
     the trace and its words, then the register. One column in normal flow: nothing is drawn over anything. */
  ${M} { display:flex !important; flex-direction:column !important; gap:18px !important; height:auto !important; min-height:0 !important;
    overflow:visible !important; padding:6px 0 18px !important; grid-template-columns:none !important; }
  ${M} > * { flex:0 0 auto !important; position:relative !important; inset:auto !important; width:100% !important; max-width:100% !important;
    min-width:0 !important; height:auto !important; max-height:none !important; overflow:visible !important; margin:0 !important;
    -webkit-mask-image:none !important; mask-image:none !important; grid-area:auto !important; }
  ${M} > .sx-mkt__stage { order:1; }
  ${M} > .sx-mkt__list { order:2; padding:0 !important; }
  ${M} .sx-mkt__stage { display:grid !important; grid-template-columns:minmax(0,1fr) auto !important; grid-template-rows:none !important;
    grid-auto-rows:auto !important; column-gap:12px !important; row-gap:10px !important; align-items:start !important; padding:0 !important; }
  ${M} :is(.sx-mkt__analysis, .sx-mkt__quote) { display:contents !important; }
  ${M} .sx-mkt__stage > :is(.sx-mkt__console, .sx-mkt__decision),
  ${M} .sx-mkt__analysis > :is(.so-route-disclosure, .sx-adboard),
  ${M} .sx-mkt__quote > :is(.sx-mkt-cause, .sx-mkt-instrument, .sx-mkt-chart-key, .orr-mkt-subkey, .orr-mkt-tape, .sx-mkt-drivers, .sx-mkt-chain, .sx-mkt-readouts, .sx-mkt-sale, .sx-mkt-disposition) {
    grid-column:1 / -1 !important; position:relative !important; inset:auto !important; width:100% !important; max-width:100% !important;
    min-width:0 !important; height:auto !important; max-height:none !important; margin:0 !important; transform:none !important;
    -webkit-mask-image:none !important; mask-image:none !important; }
  ${M} .sx-mkt__quote > .sx-mkt-cat-inline { grid-column:1 !important; grid-row:1 !important; margin:0 !important; }
  ${M} .sx-mkt__quote > .sx-mkt-title { grid-column:1 !important; grid-row:2 !important; margin:0 !important; width:auto !important;
    font-size:26px !important; line-height:1.05 !important; }
  ${M} .sx-mkt__quote > .sx-mkt__hero { grid-column:2 !important; grid-row:1 / span 2 !important; align-self:end !important; position:relative !important;
    inset:auto !important; transform:none !important; margin:0 !important; padding:0 !important; text-align:right; }
  ${M} .sx-mkt__hero .k-hero__n { font-size:34px !important; line-height:1 !important; }
  /* the trade's total says what one unit costs; the hero keeps the numeral */
  ${M} .sx-mkt__hero .k-hero__w { display:none !important; }
  ${M} .sx-mkt__quote > .sx-mkt-disposition { grid-row:3 !important; }
  ${M} .sx-mkt__stage > .sx-mkt__console { grid-row:4 !important; }
  ${M} .sx-mkt__stage > .sx-mkt__decision { grid-row:5 !important; }
  ${M} .sx-mkt__decision:empty { display:none !important; }
  /* The trade: a 128px dial left; total, Buy/Sell and the quote breakdown right. */
  ${M} .sx-mkt__console, ${M} .sx-mkt__trade { display:block !important; padding:0 !important; min-height:0 !important; overflow:visible !important; }
  ${M} .sx-trade { display:grid !important; grid-template-columns:128px minmax(0,1fr) !important; grid-template-rows:auto auto auto auto !important;
    grid-template-areas:"dial total" "dial verb" "dial note" "dial breakdown" !important; column-gap:16px !important; row-gap:6px !important;
    align-items:center !important; align-content:center !important; justify-items:start !important; width:100% !important; }
  ${M} .sx-trade > .sx-qty { grid-area:dial; width:128px !important; height:146px !important; position:relative !important; }
  ${M} .sx-qty .orr-qdial { left:8px !important; top:0 !important; width:112px !important; height:112px !important; }
  ${M} .sx-qty .sx-qty__k { left:8px !important; width:112px !important; top:32px !important; font-size:12px !important; letter-spacing:.18em !important; }
  ${M} .sx-qty .sx-qty__in { left:24px !important; width:80px !important; top:44px !important; height:32px !important; min-height:32px !important;
    font-size:28px !important; line-height:32px !important; }
  ${M} .sx-qty .sx-qty__words { top:104px !important; left:0 !important; right:0 !important; justify-content:space-between !important; }
  ${M} .sx-qty :is(.sx-qty__b, .sx-qty__max) { font-size:12px !important; letter-spacing:.08em !important; min-height:44px !important; padding:0 !important; min-width:40px !important;
    justify-content:center !important; }
  /* Fewer / More read as − / + keys (their words stay the accessible name) */
  ${M} .sx-qty .sx-qty__b { font-size:0 !important; letter-spacing:0 !important; }
  ${M} .sx-qty .sx-qty__b[data-q="-1"]::before, ${M} .sx-qty .sx-qty__b[data-q="1"]::after { font-size:18px !important; line-height:1 !important; }
  ${M} .sx-qty .sx-qty__b[data-q="-1"]::before { content:"\u2212" !important; }
  ${M} .sx-qty .sx-qty__b[data-q="1"]::after { content:"+" !important; }
  ${M} .sx-qty .sx-qty__words li:has(.sx-qty__max) { order:1; }
  ${M} .sx-qty .sx-qty__words li:has([data-q="1"]) { order:2; }
  ${M} .so-trade-total { grid-area:total; display:flex !important; flex-direction:column !important; gap:3px !important; }
  ${M} .so-trade-total > span { display:block !important; font-size:12px !important; letter-spacing:.18em !important; }
  ${M} .so-trade-total > strong { font-size:26px !important; white-space:nowrap !important; }
  ${M} .orr-mkt-holdarc { display:none !important; }
  ${M} .sx-trade__note { grid-area:note; text-align:left !important; font-size:12px !important; line-height:1.35 !important; }
  ${M} .sx-trade__words { grid-area:verb; display:flex !important; flex-wrap:nowrap !important; align-items:center !important;
    justify-content:flex-start !important; gap:16px !important; margin:2px 0 0 !important; width:auto !important; }
  ${M} .sx-trade__go.orr-lampkey { min-height:44px !important; font-size:14px !important; padding:0 20px 0 14px !important; white-space:nowrap !important; }
  ${M} .sx-trade__go:not([data-go]) { min-height:44px !important; font-size:12px !important; letter-spacing:.16em !important; padding:0 2px !important; }
  ${M} .so-trade-breakdown { grid-area:breakdown; display:block !important; justify-self:stretch !important; text-align:left !important; }
  ${M} .so-trade-breakdown > summary { min-height:32px; display:flex; align-items:center; font-size:12px !important; letter-spacing:.14em !important; white-space:nowrap; }
  ${M} .so-trade-breakdown .sx-trade__rows { margin:4px 0 0 !important; font-size:12px !important; }
  /* The adventure decision: its sentence and each option as a full-width 44px row. */
  ${M} .sx-mkt__decision { display:block !important; padding:12px 0 2px !important; border-top:1px solid rgb(236 230 216 / .16) !important; }
  ${M} .sx-decision { gap:2px !important; align-items:stretch !important; }
  ${M} .sx-decision > .k-sentence { max-width:none !important; font-size:13px !important; margin:0 0 4px !important; }
  ${M} .sx-decision__opt { display:flex !important; flex-direction:column !important; align-items:flex-start !important; justify-content:center !important;
    gap:2px !important; width:100% !important; min-height:44px !important; padding:6px 0 6px 16px !important; position:relative !important; text-align:left !important; }
  ${M} .sx-decision__opt::before { position:absolute !important; left:2px !important; top:50% !important; transform:translateY(-50%) !important; }
  ${M} .sx-decision__opt .k-row__name { white-space:normal !important; }
  ${M} .sx-decision__opt .k-row__sub { font-size:12px !important; line-height:1.35 !important; white-space:normal !important; }
  /* The trace keeps its own width; its readings follow it instead of sitting on it. */
  ${M} .sx-mkt__quote > .sx-mkt-cause { font-size:12px !important; }
  ${M} .sx-mkt-instrument { display:block !important; padding:6px 0 0 !important; }
  ${M} .sx-mkt-instrument__plot { position:relative !important; height:96px !important; width:auto !important; margin:0 44px 0 40px !important; }
  ${M} .orr-mkt-spread { position:relative !important; right:auto !important; left:auto !important; width:auto !important; margin:8px 0 0 !important; }
  ${M} .sx-mkt-chart-key { display:flex !important; flex-wrap:wrap !important; gap:2px 12px !important; margin:0 !important; font-size:12px !important; }
  ${M} .orr-mkt-subkey { display:grid !important; grid-template-columns:repeat(2, minmax(0, 1fr)) !important; gap:4px 12px !important; margin:0 !important; }
  ${M} .orr-mkt-subkey__bit { font-size:12px !important; letter-spacing:.06em !important; white-space:normal !important; overflow-wrap:anywhere !important; }
  ${M} .orr-mkt-tape { overflow:hidden !important; }
  /* The register: legend + find, the families as one swipeable row, then the rows. */
  ${M} .sx-mkt__list { overflow:visible !important; }
  ${M} .sx-mkt-browser { display:block !important; position:relative !important; padding:0 !important; height:auto !important; max-height:none !important;
    overflow:visible !important; border-top:1px solid rgb(236 230 216 / .16) !important; padding-top:12px !important; }
  ${M} .sx-mkt-browser__mode { padding:0 !important; margin:0 0 6px !important; min-height:0 !important; font-size:12px !important; letter-spacing:.18em !important; }
  ${M} .sx-mkt-browser__filters { display:flex !important; flex-wrap:nowrap !important; gap:0 14px !important; margin:0 !important; padding:0 !important;
    overflow-x:auto !important; overflow-y:hidden !important; scrollbar-width:none; background:none !important; }
  ${M} .sx-mkt-browser__filters::-webkit-scrollbar { display:none; }
  ${M} .sx-mkt-browser__filters { -webkit-mask-image:linear-gradient(90deg, #000 calc(100% - 28px), transparent) !important;
    mask-image:linear-gradient(90deg, #000 calc(100% - 28px), transparent) !important; padding-right:28px !important; }
  ${M} .sx-mkt-browser__filters li { flex:none !important; margin:0 !important; padding:0 !important; }
  ${M} .sx-mkt-filter { min-height:40px !important; padding:0 !important; font-size:12px !important; letter-spacing:.12em !important; white-space:nowrap !important; }
  ${M} .orr-mkt-find { position:relative !important; inset:auto !important; width:100% !important; margin:4px 0 6px !important; padding:0 !important; }
  ${M} .sx-mkt-browser__rail { position:relative !important; inset:auto !important; height:auto !important; max-height:none !important; overflow:visible !important; }
  ${M} .sx-mkt-table { width:100% !important; table-layout:fixed !important; font-size:12px; }
  ${M} .sx-mkt-table :is(td, th) { padding-left:4px !important; padding-right:4px !important; }
  ${M} .sx-mkt-table :is(th, td):first-child { padding-left:0 !important; }
  ${M} .sx-mkt-table .k-row__name, ${M} .sx-mkt-row__name { white-space:nowrap !important; overflow:hidden !important; text-overflow:ellipsis !important; }

  /* Shared ship instrument: keep the ship, stats, systems and choices in a reachable stack. */
  ${W} { display:flex !important; flex-direction:column; gap:16px !important; width:100% !important; min-width:0 !important;
    height:auto !important; overflow:visible !important; align-self:start !important; }
  ${W} > *, ${W} .sx-sw__main { position:relative !important; inset:auto !important; width:100% !important;
    max-width:100% !important; min-width:0 !important; height:auto !important; max-height:none !important; overflow:visible !important;
    flex:0 0 auto !important; mask-image:none !important; -webkit-mask-image:none !important; }
  ${W} .sx-sw__main { display:flex !important; flex-direction:column; gap:14px !important; }
  /* the berth head already spaces the tab; the rail starts at the body's top */
  ${W} > .sx-sw__rail { padding:4px 0 0 !important; }
  ${W} > .sx-sw__rail .sx-seg { margin:0 0 8px !important; }
  ${W} .sx-sw__stage { position:relative !important; height:420px !important; min-height:420px !important; width:100% !important; overflow:hidden !important; flex:none !important; }
  /* Phone on its side (~844×390): a 420px stage taller than the viewport buries jig labels under
     the sticky destination foot. Shrink the stage so the dial + callout columns stay on first paint. */
  @media (max-height:560px) {
    ${W} .sx-sw__stage { height:min(268px, 68vh) !important; min-height:200px !important; }
  }
  /* Phone jig callouts: columns are ~88–128px. Drop the leading numeral (SVG dial already marks
     the socket) so the name + EMPTY line keep their glyphs instead of clipping mid-letter. */
  ${W} .orr-sw-node__num { display:none !important; }
  ${W} .orr-sw-node { gap:0 !important; padding:2px 0 3px !important; }
  ${W} .orr-sw-node__name { font-size:12.5px !important; }
  ${W} .orr-sw-node__state { font-size:12px !important; letter-spacing:.1em !important;
    overflow:hidden !important; text-overflow:ellipsis !important; max-width:100% !important; }
  ${W} .sx-sw__stats, ${W} .sx-sw-verbs { position:relative !important; inset:auto !important; transform:none !important;
    width:100% !important; max-width:100% !important; flex-wrap:wrap !important; flex:none !important; margin:0 !important;
    padding-right:0 !important; grid-template-columns:repeat(2,minmax(0,1fr)) !important; }
  ${W} .sx-sw__nameplate { position:relative !important; inset:auto !important; max-width:100% !important;
    width:100% !important; margin:0 !important; padding:0 !important; flex:none; }
  /* Flight host has no space for this sentence beside the desktop stage, but the phone layout
     stacks the nameplate above it. Keep the handling/heat readings available in that flow. */
  html:root[data-sf-mobile="1"] body #screens#screens#screens #sf-ship .sx-sw__nameplate .sx-sw__blurb {
    display:block !important; font-size:14px !important; max-height:none !important; overflow:visible !important; }
  ${W} .sx-sw__side .k-row { grid-template-columns:minmax(0,1fr) auto !important; min-height:44px !important; }

  /* Chart keeps a real viewport, then an inspector. The map owns gestures, the page owns scroll. */
  ${C} { overflow-y:auto !important; overflow-x:hidden !important; --gm-inspector-w:100%; }
  /* Four head rows: title+CONTROLS/CLOSE, search, QUIET reading, then LOCAL/SYSTEM/GALAXY — without
     a weather row, QUIET sat on the search underline (bench: buried). */
  ${C} .gm-head { grid-template-columns:minmax(0,1fr) auto auto !important; grid-template-rows:auto auto auto auto !important; gap:8px !important; }
  ${C} .gm-title-lockup { grid-column:1 !important; grid-row:1 !important; min-width:0; }
  ${C} .gm-hint-btn { grid-column:2 !important; grid-row:1 !important; }
  ${C} .gm-close { grid-column:3 !important; grid-row:1 !important; }
  ${C} .gm-title { white-space:normal !important; overflow:visible !important; font-size:20px !important; }
  ${C} .gm-search-container { grid-column:1 / -1 !important; grid-row:2 !important; width:100% !important; }
  /* The hub gives the palette a 440px desktop reading width and right-anchors it. On a portrait
     chart that puts the panel's left edge outside the viewport, cutting the first glyph of every
     result. The search field is already the full phone column, so the palette follows that box. */
  ${C}[data-layout="narrow"] .gm-search-results,
  ${C}[data-layout="narrow"] .gm-search-results[data-palette="1"] {
    left:0 !important; right:auto !important; width:100% !important; max-width:100% !important; box-sizing:border-box !important;
  }
  ${C} .gm-weather { grid-column:1 / -1 !important; grid-row:3 !important; justify-self:start; text-align:left; }
  ${C} .gm-rail { grid-column:1 / -1 !important; grid-row:4 !important; }
  /* Zoom strip: on phone --gm-foot clears the stacked inspector + foot; +28px sits the strip
     in the map stage just above OVERVIEW/ROUTE, fully clear of the foot rail and detail lines. */
  ${C} .gmh-tools { bottom:calc(var(--gm-foot, 220px) + 28px) !important; left:calc(var(--gm-stage-x, 14px) + 8px) !important; }
  /* Portrait: use the measured foot clearance instead of the sky's page coordinate. The latter put
     the toolbar below POSITION/TRACKING after the inspector stacked under the sky. */
  ${C}[data-layout="narrow"] .gmh-tools {
    left:auto !important; right:14px; top:auto !important; bottom:calc(var(--gm-foot, 220px) + 40px) !important;
  }
  /* Keep long tips inside the portrait chart. Right-aligning to each 44px key avoids the right-edge
     clip of the centered fit tip; wrapping preserves the complete label for touch and focus. */
  ${C}[data-layout="narrow"] .gmh-tool[data-tip]::after {
    left:auto !important; right:0 !important; bottom:calc(100% + 8px) !important;
    width:max-content !important; max-width:calc(100vw - 28px) !important; white-space:normal !important; text-align:center !important;
    transform:translate(0, 6px) !important;
  }
  ${C}[data-layout="narrow"] .gmh-tool[data-tip]:is(:hover, :focus-visible)::after {
    transform:translate(0, 0) !important;
  }
  ${C} .gm-navfoot { display:grid !important; grid-template-columns:repeat(2,minmax(0,1fr)); gap:12px 16px !important; }
  ${C} .gm-navfoot .gm-nav-row { flex-direction:column !important; align-items:flex-start !important; gap:4px !important; min-width:0; }
  ${C} .gm-navfoot .gm-nav-row-v { max-width:100%; white-space:normal !important; overflow-wrap:anywhere; }
  /* Portrait phone: the sky is a real window between the lenses and the inspector, and the page
     scrolls past it. Squeezed into one 844px frame, the inspector was a 64px box (ENGAGE ROUTE hid
     inside it) printed over a dimmed map, and the foot rails crossed the readings. */
  ${C}[data-layout="narrow"] { grid-template-rows:repeat(3, max-content) !important; align-content:start !important; }
  ${C}[data-layout="narrow"] .gm-body-container { grid-template-rows:repeat(3, max-content) !important; row-gap:10px !important; }
  ${C}[data-layout="narrow"] :is(.gm-left-rail, .gm-right-inspector) { position:relative; z-index:1; }
  ${C}[data-layout="narrow"] .gm-left-rail { max-height:44px !important; }
  ${C}[data-layout="narrow"] .gm-viewport { position:relative !important; inset:auto !important; z-index:0 !important;
    grid-area:stage; height:clamp(260px, 44dvh, 420px); margin:0 -14px; }
  ${C}[data-layout="narrow"] .gm-right-inspector { max-height:none !important; overflow:visible !important; }
  ${C}[data-layout="narrow"] .gm-inspector-content,
  ${C}[data-layout="narrow"] .gm-frame-group { width:100% !important; max-width:100% !important; min-width:0 !important; }
  ${C}[data-layout="narrow"] .gm-frame-group { flex-wrap:wrap !important; }
  ${C}[data-layout="narrow"] .gm-frame-group .gm-frame-btn {
    flex:1 1 100% !important; width:100% !important; max-width:100% !important; min-width:0 !important;
    min-height:44px !important; white-space:normal !important; overflow-wrap:break-word !important; line-height:1.3 !important;
  }
  ${C}[data-layout="narrow"] .gm-apron { max-height:none !important; }
  /* All nine inspector tabs stand on the page (three rows on the instrument's per-row scales);
     the one-row strip was 875px wide and ECONOMY…HISTORY sat past the edge, out of reach. */
  ${C}[data-layout="narrow"] .gm-tabs.k-words { display:flex !important; flex-wrap:wrap !important; align-items:end;
    grid-template-columns:none !important; width:100% !important; max-width:100% !important; min-width:0 !important; gap:6px 18px !important; }
  ${C}[data-layout="narrow"] .gm-tab.k-word { flex:0 0 auto !important; }
  /* The page owns the scroll, so its glass runs the full length instead of stopping at the first fold. */
  ${C}[data-layout="narrow"] { background-attachment:local !important; }
  /* The foot is two rows of two: each row carries its own run of the tape (the one-row tape sat over
     POSITION/TRACKING only, and the lit leg's band ran off the left edge from DESTINATION). */
  ${C}[data-layout="narrow"] .gm-navfoot { background:none !important; padding-top:0 !important; row-gap:14px !important; column-gap:16px !important; }
  ${C}[data-layout="narrow"] .gm-navfoot .gm-nav-row { padding-top:24px !important;
    background:linear-gradient(180deg, transparent 6px, rgb(236 230 216 / .56) 6px, rgb(236 230 216 / .56) 7.5px, transparent 7.5px) 0 0 / 100% 100% no-repeat,
      linear-gradient(180deg, transparent 3px, rgb(236 230 216 / .34) 3px, rgb(236 230 216 / .34) 11px, transparent 11px) 0 0 / 100% 100% no-repeat,
      repeating-linear-gradient(90deg, rgb(236 230 216 / .28) 0 1.5px, transparent 1.5px 10px) 0 12px / 100% 4px no-repeat !important; }
  ${C}[data-layout="narrow"] .gm-navfoot .gm-nav-row:nth-child(odd) { margin-right:-16px; padding-right:16px !important; }
  ${C}[data-layout="narrow"] .gm-navfoot .gm-nav-row::before { top:2px !important; }
  ${C}[data-layout="narrow"] .gm-navfoot .gm-nav-row[data-tone="tracked"]::before { top:1px !important; }
  ${C}[data-layout="narrow"] .gm-navfoot .gm-nav-row[data-tone="tracked"]:not(:first-child)::after { top:5px !important;
    left:calc(-100% - 16px) !important; width:calc(100% + 16px) !important; }
  ${C}[data-layout="narrow"] .gm-navfoot .gm-nav-row[data-tone="tracked"]:nth-child(odd)::after { left:0 !important; width:0 !important; display:none !important; }
  /* The window's edges fade into the page instead of cutting the sky with a hard line. */
  ${C}[data-layout="narrow"] .gm-viewport { -webkit-mask-image:linear-gradient(to bottom, transparent 0, #000 22px, #000 calc(100% - 22px), transparent 100%);
    mask-image:linear-gradient(to bottom, transparent 0, #000 22px, #000 calc(100% - 22px), transparent 100%); }

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
/* Phone on its side (compact chart, <=540 tall): the four-row phone head took 188 of 390px, and the
   lens band, sky and inspector shared the 41px left, so the map sat under every word and ENGAGE ROUTE
   was out of reach. Head in two rows, then the sky as a real window, then the inspector, then the
   foot: the page scrolls past the sky, as in portrait. */
@media (max-height:540px) and (pointer:coarse) {
  ${C}[data-layout="compact"] { grid-template-rows:repeat(3, max-content) !important; align-content:start !important;
    row-gap:10px !important; background-attachment:local !important; }
  ${C}[data-layout="compact"] .gm-head { grid-template-columns:auto minmax(max-content,1fr) auto auto !important; grid-template-rows:auto auto !important;
    column-gap:24px !important; row-gap:4px !important; align-items:center; }
  ${C}[data-layout="compact"] .gm-title-lockup { grid-column:1 !important; grid-row:1 !important; }
  ${C}[data-layout="compact"] .gm-rail { grid-column:2 !important; grid-row:1 !important; justify-self:center; }
  ${C}[data-layout="compact"] .gm-stamp { display:none !important; }
  ${C}[data-layout="compact"] .gm-hint-btn { grid-column:3 !important; grid-row:1 !important; }
  ${C}[data-layout="compact"] .gm-close { grid-column:4 !important; grid-row:1 !important; }
  ${C}[data-layout="compact"] .gm-search-container { grid-column:1 / 3 !important; grid-row:2 !important; }
  ${C}[data-layout="compact"] .gm-weather { grid-column:3 / -1 !important; grid-row:2 !important; justify-self:end; text-align:right; }
  ${C}[data-layout="compact"] .gm-body-container { grid-template-columns:minmax(0,1fr) !important; grid-template-rows:repeat(3, max-content) !important;
    grid-template-areas:"hang" "stage" "inspector" !important; row-gap:10px !important; }
  ${C}[data-layout="compact"] .gm-left-rail { max-height:44px !important; position:relative; z-index:1; }
  ${C}[data-layout="compact"] .gm-viewport { position:relative !important; inset:auto !important; z-index:0 !important;
    grid-area:stage; height:clamp(220px, 72dvh, 300px); margin:0 -14px;
    -webkit-mask-image:linear-gradient(to bottom, transparent 0, #000 18px, #000 calc(100% - 18px), transparent 100%);
    mask-image:linear-gradient(to bottom, transparent 0, #000 18px, #000 calc(100% - 18px), transparent 100%); }
  ${C}[data-layout="compact"] .gm-right-inspector { grid-area:inspector; max-height:none !important; overflow:visible !important; position:relative; z-index:1; }
  ${C}[data-layout="compact"] .gm-apron { max-height:none !important; }
  /* 816px holds the four answers on one run of the tape, as on desktop; two-by-two sent the lit leg's
     band off the left edge from DESTINATION. */
  ${C}[data-layout="compact"] .gm-navfoot { grid-template-columns:repeat(4, minmax(0,1fr)) !important; column-gap:var(--k-gap, 18px) !important; }
  ${C}[data-layout="compact"] .gmh-tools { left:auto !important; right:14px; bottom:auto !important; top:calc(var(--gm-sky-bottom, 320px) - 60px); }
}
`;

export function injectOrreryMobileScreens(doc = globalThis.document) {
  if (!doc?.head || doc.getElementById(STYLE_ID)) return;
  const style = doc.createElement('style');
  style.id = STYLE_ID;
  style.textContent = MOBILE_SCREEN_CSS;
  doc.head.appendChild(style);
}
