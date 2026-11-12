// Survey dossier. The game owns the claim, its investments and all command handlers.
import { runtimeAssetUrl } from '../../core/runtimeAssetUrl.js';
const screen = '#screens .screen.panel.sf-menu.orr-base';
const surveyArt = runtimeAssetUrl('assets/ui/backdrops/base-survey.webp', import.meta.url);
const page = '#screens .orr-base #sf-base';
const css = `
${screen} {
  --base-ink: var(--dp-ink, #efece3);
  --base-dim: #bac6ca;
  --base-line: #40505b;
  --base-panel: #17222b;
  --base-water: #a1d6d4;
  --base-gold: var(--dp-lamp, #f2b950);
  --base-pad: clamp(16px, 2.5vw, 32px);
  width:min(96vw, 1160px); min-width:0; max-width:96vw; max-height:92vh; max-height:92dvh;
  padding:0; gap:0; overflow:hidden; isolation:isolate; z-index:101;
  flex-direction:column; box-sizing:border-box;
  background:#101921; color:var(--base-ink);
  border:1px solid var(--base-line); border-radius:12px; box-shadow:0 14px 44px #04090f80;
  mask:none; backdrop-filter:none;
}
${screen}.is-empty { width:min(94vw, 880px); align-self:center; }
${screen}::before, ${screen}::after { display:none; }
${page} {
  position:relative; flex:1 1 auto; min-height:0; min-width:0; display:flex; flex-direction:column;
  padding:0 var(--base-pad) var(--base-pad); gap:14px;
  overflow-y:auto; overscroll-behavior:contain; scrollbar-width:thin; scrollbar-color:#62717a #101921;
  pointer-events:auto; font:400 15px/1.45 "Instrument Sans",system-ui,sans-serif; color:var(--base-ink);
}
${page} > * { flex-shrink:0; }
${page} .base-hero {
  min-height:clamp(148px, 20vh, 205px); box-sizing:border-box; display:flex; flex-direction:column;
  align-items:flex-start; justify-content:flex-end; gap:5px; padding:22px var(--base-pad);
  margin:0 calc(-1 * var(--base-pad)); border-bottom:1px solid var(--base-line);
  background-color:#16212b;
  background-image:linear-gradient(90deg,#0a141cee 0%,#101920c9 34%,#10192070 57%,transparent 80%),
                   url("${surveyArt}");
  background-size:cover; background-position:center 59%;
}
${page} .base-hero > * { position:relative; max-width:min(54ch, 62%); margin:0; }
${page} .base-kicker, ${page} .base-plan-k, ${page} .base-sec-h, ${page} .base-ledger-k {
  font:650 13px/1.25 "Instrument Sans",system-ui,sans-serif; letter-spacing:.05em; text-transform:uppercase;
  color:var(--base-water);
}
${page} .base-title {
  font:720 clamp(28px, 3.2vw, 44px)/1.03 "Archivo",system-ui,sans-serif;
  font-variation-settings:"wdth" 104,"wght" 720; letter-spacing:-.025em; text-transform:none; color:#fff6e6;
}
${page} .base-sub { font:500 14px/1.42 "Instrument Sans",system-ui,sans-serif; color:#e6edef; }
${page} .base-sub + .base-sub { color:#c7d2d6; margin-top:2px; }
${page} .base-plan {
  display:grid; grid-template-columns:minmax(0,1fr) auto; align-items:center; gap:3px 20px;
  background:var(--base-panel); border:1px solid var(--base-line); border-inline-start:3px solid var(--base-gold);
  border-radius:5px; padding:12px 16px;
}
${page} .base-plan > :not(button) { grid-column:1; }
${page} .base-plan .base-plan-k { color:#f6cb7f; }
${page} .base-plan .base-plan-title, ${page} :is(.base-slot,.base-spec,.base-mod) .nm {
  margin:0; color:var(--base-ink); font:670 16px/1.25 "Instrument Sans",system-ui,sans-serif; letter-spacing:0; text-transform:none;
}
${page} .base-plan-body, ${page} .desc, ${page} .effect, ${page} .risk { font-size:14px; line-height:1.4; color:var(--base-dim); }
${page} .base-plan > button { grid-column:2; grid-row:1 / span 3; }
${page} .base-sec-h { display:flex; align-items:center; gap:10px; margin:4px 0 -6px; color:#e2e9e9; }
${page} .base-sec-h::after { content:""; flex:1; height:1px; background:var(--base-line); }
${page} .base-slots { display:grid; grid-template-columns:repeat(auto-fit,minmax(min(126px,100%),1fr)); gap:8px; }
${page} .base-slot, ${page} .base-slot:hover {
  display:flex; flex-direction:column; justify-content:center; min-width:0; padding:10px 12px;
  background:#1c2b34; border:1px solid var(--base-line); border-top:2px solid #72a9b1; border-radius:5px;
}
${page} .base-slot .eff { color:var(--base-water); font:500 13px/1.4 "Instrument Sans",system-ui,sans-serif; text-transform:none; }
${page} .base-slot.empty, ${page} .base-slot.empty:hover { padding:0; border:1px dashed #546571; background:#111c24; }
${page} .base-well { display:flex; align-items:center; min-height:44px; }
${page} .base-well button { width:100%; }
${page} .base-specializations, ${page} .orr-base__cands { display:grid; grid-template-columns:repeat(3,minmax(0,1fr)); gap:10px; }
${page} .base-spec, ${page} .base-spec:hover {
  display:flex; flex-direction:column; align-items:flex-start; gap:6px;
  min-width:0; padding:14px; background:var(--base-panel);
  border:1px solid var(--base-line); border-radius:7px;
}
${page} .base-spec.active, ${page} .base-spec.active:hover { border-color:#678786; background:#1a3035; }
${page} .base-spec-head { display:flex; align-items:center; gap:10px; margin-bottom:4px; width:100%; }
${page} .base-spec-head svg { flex:none; color:var(--base-water); }
${page} .base-spec .verb { font:600 14px/1.4 "Instrument Sans",system-ui,sans-serif; color:var(--base-ink); }
${page} .base-spec .risk { color:#d7c2a4; }
${page} .base-spec .k-word { margin-top:auto; }
${page} .base-ledger { display:grid; gap:12px; background:var(--base-panel); border:1px solid var(--base-line); border-radius:7px; padding:16px; }
${page} .base-ledger h3 { margin:0; }
${page} .base-ledger-hero { display:flex; flex-wrap:wrap; align-items:baseline; gap:4px 12px; }
${page} :is(.base-ledger-heronum,.base-ledger-v,.meta) { font-family:var(--dp-face-num,"Spline Sans Mono",monospace); font-variant-numeric:tabular-nums; }
${page} .base-ledger-heronum { font-size:32px; line-height:1.1; color:#eef2e9; }
${page} .base-ledger-herok, ${page} .base-receipt { font-size:13px; color:var(--base-dim); }
${page} .base-ledger-grid { display:grid; grid-template-columns:repeat(auto-fit,minmax(min(140px,100%),1fr)); gap:12px; }
${page} .base-ledger-cell { border:none; border-top:1px solid var(--base-line); padding:7px 0 0; }
${page} .base-ledger-v { font-size:15px; overflow-wrap:anywhere; color:var(--base-ink); }
${page} .base-ledger-v--sub { font-size:13px; color:var(--base-dim); }
${page} .is-threat { color:var(--dp-danger-hot,#ffab9a); }
${page} .base-shop { display:grid; gap:0; }
${page} .base-mod, ${page} .base-mod:hover {
  display:grid; grid-template-columns:minmax(0,1.8fr) minmax(100px,.9fr) minmax(115px,.7fr);
  gap:4px 16px; align-items:center; padding:14px 3px;
  background:transparent; border:0; border-bottom:1px solid var(--base-line);
}
${page} .base-mod .nm, ${page} .base-mod .desc { grid-column:1; }
${page} .base-mod .meta { grid-column:2; grid-row:1 / span 2; font-size:13px; color:#c5d5da; }
${page} .base-mod button { grid-column:3; grid-row:1 / span 2; justify-self:end; }
${page} .orr-base__built { color:var(--base-water); font-size:13px; }
${page} .base-freight { display:flex; flex-wrap:wrap; gap:8px; }
${page} .k-word, ${screen} .base-foot .k-word, ${screen} .base-jump button, ${page} .orr-base__cand {
  display:inline-flex; align-items:center; justify-content:center; gap:6px; min-height:38px;
  padding:6px 12px; border:1px solid #596c78; border-radius:5px; clip-path:none;
  background:#20303a; box-shadow:none; color:#edf2ee; text-align:center; text-transform:none;
  font:600 14px/1.25 "Instrument Sans",system-ui,sans-serif; letter-spacing:0; white-space:normal;
}
${page} .k-word::after, ${screen} .base-foot .k-word::after { display:none; }
${page} .base-well button { background:transparent; border:0; min-height:44px; }
${page} .k-word:disabled { cursor:default; opacity:1; background:transparent; color:#acb7ba; border-color:#45525b; }
${page} button:enabled:hover, ${screen} .base-foot .k-word:hover, ${screen} .base-jump button:hover {
  background:#293d48; border-color:#a2b7bd; color:white;
}
${screen} button:focus-visible, ${page} [tabindex="-1"]:focus-visible { outline:2px solid var(--base-gold); outline-offset:2px; }
${page} .orr-base__cand { flex-wrap:wrap; justify-content:flex-start; align-content:center; gap:3px 8px; text-align:left; }
${page} .orr-base__cand.is-armed { background:#273b40; border-color:var(--base-water); }
${page} .orr-base__cand-num, ${page} .orr-base__cand-range, ${screen} .orr-base__key, ${screen} .orr-base__esc { font-size:13px; color:var(--base-water); }
${page} .orr-base__cand-range { flex-basis:100%; }
${screen} .base-foot {
  flex:none; display:flex; align-items:center; justify-content:flex-end; gap:9px; flex-wrap:wrap;
  border-top:1px solid var(--base-line); padding:10px var(--base-pad); background:#131e27;
}
${screen} .base-foot .orr-base__chartkey, ${screen} .base-jump { margin-right:auto; }
${screen} .base-dispatch-state { color:var(--base-dim); font:500 13px/1.35 "Instrument Sans",system-ui,sans-serif; }
${screen} .base-jump { display:flex; gap:5px; flex-wrap:wrap; }
${screen} .base-jump button { min-height:36px; padding:4px 9px; background:transparent; border:1px solid var(--base-line); }
${screen} .orr-base__esc { color:#b7c2c7; }
${screen} .base-foot .orr-base__lamp { font-size:14px !important; letter-spacing:.02em !important; }
@media (max-width:700px) {
  ${screen} { max-height:96vh; max-height:96dvh; }
  ${page} .base-hero { min-height:145px; padding-block:18px; }
  ${page} .base-hero > * { max-width:85%; }
  ${page} .base-specializations { grid-template-columns:1fr; }
  ${page} .base-spec { gap:5px; }
  ${page} .base-ledger-grid { grid-template-columns:repeat(2,minmax(0,1fr)); }
  ${page} .base-mod { grid-template-columns:minmax(0,1fr) auto; }
  ${page} .base-mod .meta { grid-column:1; grid-row:3; }
  ${page} .base-mod button { grid-column:2; grid-row:1 / span 3; max-width:14ch; }
  ${screen} .base-foot { gap:6px; }
  ${screen} .base-dispatch-state { flex:1; order:-1; }
  ${screen} .base-jump { order:-2; }
  ${screen} .base-jump { flex-basis:100%; }
}
@media (max-width:460px) {
  ${page} { gap:11px; }
  ${page} .base-hero { background-position:63% center; background-image:linear-gradient(90deg,#0a141cee,#0d1722a6 75%,#10182060),url("${surveyArt}"); }
  ${page} .base-hero > * { max-width:100%; }
  ${page} .base-plan, ${page} .base-mod { grid-template-columns:minmax(0,1fr); }
  ${page} .base-plan > button, ${page} .base-mod button { grid-column:1; grid-row:auto; justify-self:start; max-width:100%; }
  ${page} .orr-base__cands { grid-template-columns:1fr; gap:5px; }
  ${page} .orr-base__cand-range { flex-basis:auto; margin-left:auto; }
  ${screen} .orr-base__esc { display:none; }
}
@media (pointer:coarse) {
  ${screen} .base-jump button, ${page} .k-word, ${page} .orr-base__cand, ${screen} .base-foot button { min-height:44px; }
}
@media (forced-colors:active) {
  ${page} .base-hero { background:Canvas; }
  ${page} .base-spec.active, ${page} .orr-base__cand.is-armed { border:2px solid Highlight; }
}
`;
export function injectBaseLayout() {
  if (document.getElementById('sf-base-style')) return;
  const style = document.createElement('style');
  style.id = 'sf-base-style';
  style.textContent = css;
  document.head.appendChild(style);
}
