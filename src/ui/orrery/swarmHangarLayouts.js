// The hangar's one composition owner. It deliberately does not opt into the retired
// Encounter-first preparation sheet; future changes extend this surface in place.
import { injectOrrery } from './tokens.js';
import { runtimeAssetUrl } from '../../core/runtimeAssetUrl.js';
const ID = 'sf-swarm-hangar-layouts';
const H = 'html body #screens > .k-screen.orr-crucible.orr-swarm-hangar';
const WORKSHOP = runtimeAssetUrl('assets/ui/generated/armory/workshop.webp', import.meta.url);
export const SWARM_HANGAR_CSS = `
${H} { display:grid !important; grid-template-columns:minmax(370px,.9fr) minmax(0,1.4fr) !important;
  grid-template-rows:auto auto minmax(0,1fr) auto !important; gap:18px 26px !important;
  box-sizing:border-box; position:absolute !important; inset:0 !important; width:100% !important; height:100dvh !important;
  max-width:none !important; max-height:none !important; margin:0 !important; padding:28px 40px 22px !important;
  background:linear-gradient(115deg,var(--dp-metal-0,#0b1017),var(--dp-glass-deep)) !important;
  color:var(--dp-ink); overflow:hidden !important; user-select:none; -webkit-user-select:none;
  font:400 15px/1.45 var(--dp-face-body,'Instrument Sans'),sans-serif; }
${H} *, ${H} *::before, ${H} *::after { box-sizing:border-box; }
${H} :is(input,textarea,[contenteditable=true]) { user-select:text; -webkit-user-select:text; }
${H} > .k-title { grid-column:1/-1 !important; grid-row:1 !important; position:static !important; margin:0 !important; padding:0 !important; }
${H} > .k-title h1 { font:850 clamp(30px,3vw,48px)/1 var(--dp-face-display,'Archivo') !important;
  letter-spacing:.01em !important; margin:0 !important; text-transform:uppercase; }
${H} .sf-crd-sub { font:400 15px/1.4 var(--dp-face-body,'Instrument Sans') !important; letter-spacing:0 !important;
  text-transform:none !important; color:var(--dp-ink-dim) !important; margin:7px 0 0 !important; }
${H} .sf-hangar-nav { grid-column:1/-1; display:flex; gap:12px; border-bottom:1px solid var(--dp-line); padding:0 0 12px; }
${H} .sf-hangar-step { display:flex; align-items:center; gap:10px; min-height:44px; padding:10px 16px;
  font:600 15px/1.3 var(--dp-face-body,'Instrument Sans'); border:1px solid transparent; border-radius:4px;
  background:transparent; color:var(--dp-ink-dim); cursor:pointer; }
${H} .sf-hangar-step[aria-current=step] { border-color:var(--dp-hand); background:var(--dp-field-ink); color:var(--dp-ink); }
${H} .sf-hangar-step-number { font:600 12px/1 var(--dp-face-label); color:var(--dp-hand); }
${H} .sf-hangar-step--next { margin-left:auto; cursor:default; }
${H} > .k-stage { grid-column:1 !important; grid-row:3 !important; display:block !important; position:relative !important;
  inset:auto !important; width:100% !important; height:100% !important; max-width:none !important; min-height:0 !important;
  margin:0 !important; padding:0 10px 4px 0 !important; overflow:auto !important; mask:none !important;
  background:none !important; border:0 !important; box-shadow:none !important; scrollbar-width:thin; scrollbar-color:var(--dp-line-hi) transparent; }
${H} > .k-stage::before, ${H} > .k-stage::after { display:none !important; }
${H} .sf-hangar-section { margin:0 0 20px; }
${H} .sf-hangar-section-title { font:650 20px/1.2 var(--dp-face-body,'Instrument Sans'); margin:0 0 8px; }
${H} .sf-hangar-note { margin:0 0 12px; color:var(--dp-ink-dim); font:400 14px/1.5 var(--dp-face-body,'Instrument Sans'); }
${H} .sf-hangar-roster { display:grid; grid-template-columns:repeat(3,minmax(0,1fr)); gap:9px; max-height:clamp(240px,37vh,440px); overflow:auto; padding:3px; scrollbar-width:thin; }
${H} .sf-hangar-hull { display:grid; grid-template-rows:70px auto auto; align-content:start; position:relative; min-width:0;
  padding:8px; border:1px solid var(--dp-line); border-radius:5px; background:var(--sf-face-raised);
  box-shadow:var(--sf-edge-raised); color:var(--dp-ink); text-align:left; cursor:pointer; overflow:hidden; transition:border-color .14s,background-color .14s; }
${H} .sf-hangar-hull img { width:100%; height:70px; object-fit:contain; pointer-events:none; }
${H} .sf-hangar-hull strong { font:650 15px/1.3 var(--dp-face-body,'Instrument Sans'); }
${H} .sf-hangar-hull > span { font:400 12px/1.3 var(--dp-face-body,'Instrument Sans'); color:var(--dp-ink-dim); margin-top:3px; }
${H} .sf-hangar-hull[aria-pressed=true] { border-color:var(--dp-hand); box-shadow:inset 3px 0 var(--dp-hand),var(--sf-edge-raised); background:var(--dp-field-ink-hi); }
${H} .sf-hangar-hull[aria-pressed=true] strong { color:var(--dp-hand-hot); }
${H} .sf-hangar-hull[aria-disabled=true] { opacity:.63; }
${H} .sf-hangar-lock { position:absolute; top:6px; right:6px; background:var(--dp-void); padding:3px 6px; font-size:12px; }
${H} .sf-hangar-selection-status { color:var(--dp-hand-hot); margin:8px 0 0; font-size:14px; }
${H} .sf-hangar-selection-status:empty { display:none; }
${H} .sf-hangar-kits { display:grid; grid-template-columns:repeat(2,minmax(0,1fr)); gap:8px; }
${H} .sf-hangar-kit { display:flex; flex-direction:column; gap:5px; padding:12px; border:1px solid var(--dp-line); border-radius:4px;
  color:var(--dp-ink); background:var(--sf-face); text-align:left; cursor:pointer; min-width:0; }
${H} .sf-hangar-kit strong { font:600 14px/1.3 var(--dp-face-body,'Instrument Sans'); }
${H} .sf-hangar-kit span { font:400 12px/1.4 var(--dp-face-body,'Instrument Sans'); color:var(--dp-ink-dim); }
${H} .sf-hangar-kit[aria-pressed=true] { border-color:var(--dp-hand); box-shadow:inset 3px 0 var(--dp-hand); }
${H} .sf-hangar-kit[aria-disabled=true] { opacity:.6; }
${H} .sf-hangar-preview, ${H} > .orr-door-hero { grid-column:2 !important; grid-row:3 !important; position:relative !important;
  inset:auto !important; min-height:0; min-width:0; width:100% !important; height:100% !important; margin:0 !important;
  border:1px solid var(--dp-line); border-radius:7px; overflow:auto !important; background:var(--sf-face); box-shadow:var(--sf-edge),var(--sf-drop-raised); }
${H} .sf-hangar-preview { display:flex; flex-direction:column; padding:22px 24px 18px; }
${H} .sf-hangar-shiphead { z-index:2; position:relative; }
${H} .sf-hangar-eyebrow { font:600 12px/1.3 var(--dp-face-label); text-transform:uppercase; letter-spacing:.08em; color:var(--dp-hand); margin:0 0 6px; }
${H} .sf-hangar-shipname { font:800 clamp(30px,3.6vw,56px)/1.05 var(--dp-face-display,'Archivo'); letter-spacing:-.02em; margin:0; }
${H} .sf-hangar-shiprole { color:var(--dp-ink-dim); font-size:15px; margin:8px 0 0; }
${H} .sf-hangar-shipstage { position:relative; isolation:isolate; min-height:180px; flex:1 1 270px; width:100%;
  background:radial-gradient(ellipse at center,var(--dp-field-ink),transparent 68%); overflow:hidden; }
${H} .sf-hangar-shipstage::before { content:''; position:absolute; inset:0; z-index:-1; opacity:.12; background:url('${WORKSHOP}') center 55%/cover; }
${H} .sf-hangar-shipstage :is(canvas,.k-stage__poster,.sf-hangar-poster) { display:block !important; position:absolute !important;
  inset:0 !important; width:100% !important; height:100% !important; object-fit:contain !important; z-index:1 !important; transform:none !important; opacity:1; }
${H} .sf-hangar-shipstage.has-poster:not(.is-live) canvas { visibility:hidden; }
${H} .sf-hangar-shipstage.is-live .k-stage__poster { opacity:0 !important; pointer-events:none; }
${H} .sf-hangar-stats { display:grid; grid-template-columns:repeat(3,minmax(0,1fr)); gap:12px 22px; padding:16px 0; border-block:1px solid var(--dp-line-faint); }
${H} .sf-hangar-stat { display:grid; grid-template-columns:1fr auto; gap:6px; font-size:13px; }
${H} .sf-hangar-stat strong { color:var(--dp-ink); font:600 13px/1.3 var(--dp-face-numeral); font-variant-numeric:tabular-nums; }
${H} .sf-hangar-stat meter { grid-column:1/-1; width:100%; height:6px; border:0; appearance:none; -webkit-appearance:none; background:var(--dp-metal-4); }
${H} .sf-hangar-stat meter::-webkit-meter-bar { background:var(--dp-metal-4); border:0; height:6px; border-radius:0; }
${H} .sf-hangar-stat meter::-webkit-meter-optimum-value { background:var(--dp-hand); border-radius:0; }
${H} .sf-hangar-stat meter::-moz-meter-bar { background:var(--dp-hand); }
${H} .sf-hangar-fit-title { display:flex; align-items:center; gap:10px; justify-content:space-between; margin:16px 0 10px; }
${H} .sf-hangar-fit-title h3 { font:600 15px/1.3 var(--dp-face-body,'Instrument Sans'); margin:0; }
${H} .sf-hangar-fit-title > span { font-size:12px; color:var(--dp-ink-dim); }
${H} .sf-hangar-manifest { display:grid; grid-template-columns:repeat(3,minmax(0,1fr)); gap:7px; max-height:165px; overflow:auto; scrollbar-width:thin; }
${H} .sf-hangar-fitting { display:flex; align-items:center; gap:8px; min-width:0; padding:9px; background:var(--dp-field-ink); border:1px solid var(--dp-line-faint); border-radius:3px; }
${H} .sf-hangar-fitting svg { width:26px; height:26px; flex:none; color:var(--dp-hand-hot); }
${H} .sf-hangar-fitting span { min-width:0; }
${H} .sf-hangar-fitting small { display:block; font-size:12px; color:var(--dp-ink-dim); }
${H} .sf-hangar-fitting strong { display:block; font:500 13px/1.3 var(--dp-face-body,'Instrument Sans'); overflow-wrap:anywhere; }
${H} .sf-hangar-fitting.is-empty { opacity:.65; }
${H} .sf-hangar-fit-note { font-size:13px; color:var(--dp-ink-dim); margin:10px 0 0; }
${H} .sf-hangar-fit-note.is-empty { color:var(--dp-hand-hot); }
${H} .sf-hangar-options { list-style:none; margin:0; padding:0; display:flex; flex-direction:column; gap:20px; }
${H} .sf-hangar-options > .k-row { display:block !important; padding:0 !important; margin:0 !important; }
${H} .sf-hangar-options .k-row__name { display:block !important; font:650 18px/1.3 var(--dp-face-body,'Instrument Sans') !important; color:var(--dp-ink) !important; text-transform:none !important; letter-spacing:0 !important; margin:0 0 10px; }
${H} :is(.sf-crd-arenas,.sf-crd-stakes,.sf-crd-modes) { display:grid !important; grid-template-columns:repeat(2,minmax(0,1fr)) !important; gap:8px !important; list-style:none; padding:0; margin:0; }
${H} :is(.sf-crd-arenas,.sf-crd-stakes,.sf-crd-modes) > li { min-width:0; width:auto !important; margin:0 !important; }
${H} .orr-tile { display:flex !important; flex-direction:column !important; width:100% !important; min-height:88px !important;
  padding:12px !important; gap:6px !important; background:var(--sf-face) !important; border:1px solid var(--dp-line) !important;
  border-radius:4px !important; box-shadow:none !important; clip-path:none !important; color:var(--dp-ink) !important;
  text-align:left; align-items:flex-start !important; overflow:visible !important; }
${H} .orr-tile[aria-pressed=true] { border-color:var(--dp-hand) !important; box-shadow:inset 3px 0 var(--dp-hand) !important; }
${H} .orr-tile::after { display:none !important; }
${H} .orr-tile .fh-tile-art { height:56px !important; width:100% !important; display:flex !important; align-items:center; justify-content:center; }
${H} .orr-tile .fh-tile-art img { width:100% !important; height:56px !important; object-fit:cover !important; opacity:1 !important; filter:none !important; transform:none !important; border-radius:2px; }
${H} .orr-tile .fh-tile-legend { font:600 14px/1.3 var(--dp-face-body,'Instrument Sans') !important; letter-spacing:0 !important;
  white-space:normal !important; text-transform:none !important; overflow:visible !important; }
${H} .sf-crd-modes .fh-tile-art { display:none !important; }
${H} .sf-crd-stake strong { font:600 17px/1.2 var(--dp-face-body,'Instrument Sans'); }
${H} .sf-crd-stake span, ${H} .sf-hangar-choice-detail { font:400 13px/1.4 var(--dp-face-body,'Instrument Sans'); color:var(--dp-ink-dim); }
${H} .sf-crd-stake .sf-hangar-budget { font:650 18px/1.3 var(--dp-face-numeral); color:var(--dp-hand-hot); font-variant-numeric:tabular-nums; }
${H} .sf-crd-stake small { font:400 12px/1.4 var(--dp-face-body,'Instrument Sans'); color:var(--dp-ink-dim); }
${H} :is(.sf-crd-mode-sub,.sf-crd-stake-sub,.sf-crd-arena,.sf-crd-zone) { font:400 14px/1.5 var(--dp-face-body,'Instrument Sans') !important; color:var(--dp-ink-dim) !important; margin:10px 0 0 !important; }
${H} .sf-crd-ghost-sub { display:none !important; }
${H} .sf-hangar-disclosure { border:1px solid var(--dp-line-faint); border-radius:4px; background:var(--sf-face); margin-top:14px; padding:12px; }
${H} .sf-hangar-disclosure > summary { min-height:30px; cursor:pointer; font:600 14px/1.5 var(--dp-face-body,'Instrument Sans'); }
${H} .sf-hangar-disclosure[open] > summary { margin-bottom:14px; }
${H} .sf-hangar-challenges { display:flex; gap:8px; flex-wrap:wrap; }
${H} .sf-hangar-challenges > li { list-style:none; flex:1; min-width:110px; }
${H} .sf-hangar-lesson { margin-top:20px; padding:14px; border:1px solid var(--dp-line-faint); background:var(--sf-face); border-radius:4px; }
${H} .sf-hangar-lesson .sf-hangar-section-title { font-size:17px; }
${H} button[data-swarm-training] { min-height:42px !important; padding:10px 16px !important; border:1px solid var(--dp-line) !important; background:var(--dp-field-ink) !important; font:600 14px/1.3 var(--dp-face-body,'Instrument Sans') !important; letter-spacing:0 !important; }
${H} button[data-swarm-training][aria-pressed=true] { border-color:var(--dp-hand) !important; color:var(--dp-hand-hot) !important; }
${H} > .orr-door-hero { overflow:hidden !important; isolation:isolate; }
${H} .orr-door-hero__art { position:absolute !important; inset:0 !important; width:100% !important; height:100% !important;
  object-fit:cover !important; object-position:center; mask:none !important; -webkit-mask:none !important; opacity:0; }
${H} .orr-door-hero__art.is-on { opacity:1; }
${H} .orr-door-hero::after { content:''; position:absolute; inset:0; height:auto !important; z-index:1;
  background:linear-gradient(0deg,var(--dp-void) 0%,transparent 80%) !important; pointer-events:none; }
${H} .orr-door-hero__words { position:absolute !important; inset:auto 26px 28px !important; z-index:2; padding:0 !important; width:auto !important; max-width:none !important; }
${H} .orr-door-hero__name { font:800 clamp(26px,3.5vw,46px)/1.1 var(--dp-face-display,'Archivo') !important; letter-spacing:-.02em !important; margin:0 0 12px; }
${H} .orr-door-hero__line { font:400 17px/1.5 var(--dp-face-body,'Instrument Sans') !important; max-width:42ch; }
${H} > .k-foot { grid-column:1/-1 !important; grid-row:4 !important; position:static !important; display:block !important;
  margin:0 !important; padding:14px 0 0 !important; border-top:1px solid var(--dp-line) !important; background:none !important; }
${H} .sf-hangar-actions { display:flex; align-items:center; gap:14px; }
${H} .sf-hangar-summary { flex:1; font:500 14px/1.3 var(--dp-face-body,'Instrument Sans'); color:var(--dp-ink-dim); margin:0; text-align:center; }
${H} .sf-hangar-footer-note { margin:8px 0 0; color:var(--dp-ink-dim); font-size:12px; text-align:right; }
${H} :is(.sf-hangar-next,.sf-swarm-enter-key) { display:inline-flex !important; align-items:center; justify-content:center; min-width:210px !important;
  min-height:52px !important; padding:12px 24px !important; color:var(--dp-void) !important; background:var(--dp-hand) !important;
  font:700 17px/1.2 var(--dp-face-body,'Instrument Sans') !important; border:1px solid var(--dp-hand-hot) !important; border-radius:4px;
  letter-spacing:0 !important; text-transform:none !important; text-shadow:none !important; box-shadow:none !important; cursor:pointer; }
${H} :is(.sf-hangar-next,.sf-swarm-enter-key)::before, ${H} :is(.sf-hangar-next,.sf-swarm-enter-key)::after { display:none !important; }
${H} .sf-back.k-word { min-height:44px !important; padding:8px 14px !important; color:var(--dp-ink) !important; border:1px solid var(--dp-line) !important;
  background:var(--dp-field-ink) !important; font:600 14px/1.3 var(--dp-face-body,'Instrument Sans') !important; text-transform:none !important; letter-spacing:0 !important; }
${H} button:hover:not(:disabled) { border-color:var(--dp-hand-hot) !important; }
${H} :is(.sf-hangar-next,.sf-swarm-enter-key):hover { background:var(--dp-hand-hot) !important; }
${H} button:active:not(:disabled) { transform:translateY(1px); }
${H} :is(button,summary,input,textarea):focus-visible { outline:2px solid var(--dp-ice) !important; outline-offset:3px !important; }
${H} button:disabled { opacity:.5; cursor:not-allowed; }
@media (max-height:760px) and (min-width:801px) {
  ${H} { padding:18px 26px 14px !important; gap:12px 20px !important; }
  ${H} > .k-title h1 { font-size:32px !important; }
  ${H} .sf-crd-sub { margin-top:4px !important; }
  ${H} .sf-hangar-preview { padding:16px; }
  ${H} .sf-hangar-shipname { font-size:32px; }
  ${H} .sf-hangar-shipstage { min-height:160px; }
  ${H} .sf-hangar-roster { max-height:250px; }
  ${H} .sf-hangar-hull { grid-template-rows:52px auto auto; }
  ${H} .sf-hangar-hull img { height:52px; }
  ${H} .sf-hangar-stats { gap:9px 18px; padding:12px 0; }
}
@media (max-width:1100px) and (min-width:801px) {
  ${H} { grid-template-columns:minmax(320px,1fr) minmax(0,1.1fr) !important; padding-inline:22px !important; }
  ${H} .sf-hangar-manifest { grid-template-columns:repeat(2,minmax(0,1fr)); }
  ${H} .sf-hangar-step { padding-inline:10px; font-size:14px; }
  ${H} .sf-hangar-summary { font-size:12px; }
}
@media (max-width:800px) {
  ${H} { display:flex !important; flex-direction:column !important; overflow:auto !important; padding:20px 16px !important; gap:16px !important; }
  ${H} > .k-title { flex:none; }
  ${H} > .k-title h1 { font-size:32px !important; }
  ${H} .sf-hangar-nav { flex:none; flex-wrap:wrap; gap:7px; }
  ${H} .sf-hangar-step { padding:8px 9px; font-size:13px; gap:6px; }
  ${H} .sf-hangar-step--next { margin:0; width:100%; min-height:20px; padding:0 9px; font-size:12px; }
  ${H} > .k-stage { flex:none; height:auto !important; overflow:visible !important; padding:0 !important; }
  ${H} .sf-hangar-roster { max-height:300px; }
  ${H} .sf-hangar-preview, ${H} > .orr-door-hero { flex:none; height:auto !important; min-height:360px; overflow:hidden !important; }
  ${H} .sf-hangar-preview { padding:18px; }
  ${H} .sf-hangar-shipstage { min-height:230px; flex:none; }
  ${H} .sf-hangar-shipname { font-size:36px; }
  ${H} .sf-hangar-stats { gap:10px 16px; }
  ${H} .sf-hangar-manifest { grid-template-columns:repeat(2,minmax(0,1fr)); }
  ${H} .sf-hangar-actions { flex-wrap:wrap; gap:10px; }
  ${H} .sf-hangar-summary { order:3; flex-basis:100%; text-align:left; }
  ${H} :is(.sf-hangar-next,.sf-swarm-enter-key) { flex:1; min-width:160px !important; font-size:15px !important; }
  ${H} .sf-hangar-footer-note { text-align:left; }
  ${H} > .k-foot { flex:none; position:sticky !important; bottom:-20px; background:var(--dp-void) !important; padding:12px 0 !important; z-index:5; }
}
@media (prefers-reduced-motion:reduce) { ${H} *, ${H} *::before, ${H} *::after { transition:none !important; animation:none !important; } }
${H.replace('html ', 'html.sf-reduce-motion ')} *, ${H.replace('html ', 'html.sf-reduce-motion ')} *::before, ${H.replace('html ', 'html.sf-reduce-motion ')} *::after { transition:none !important; animation:none !important; }
@media (forced-colors:active) { ${H} button { border:1px solid ButtonText !important; } ${H} button[aria-pressed=true] { outline:2px solid Highlight !important; } }
/* Keep the semantic hidden state above every layout and breakpoint display rule. */
${H} [hidden] { display:none !important; }
`;
export function injectSwarmHangarLayouts(doc = globalThis.document) {
  if (!doc?.head || doc.getElementById(ID)) return;
  injectOrrery(doc);
  const style = doc.createElement('style'); style.id = ID; style.textContent = SWARM_HANGAR_CSS; doc.head.append(style);
}
