// The berth game borrows the station's ink, lettering and action keys. The four printed
// illustrations do double duty as a teaching deck and the actual cards dealt to the pilot.
import { runtimeAssetUrl } from '../../core/runtimeAssetUrl.js';
import { injectOrrery } from './tokens.js';

const MF = 'html body #screens > .screen.k-screen.orr-manifest';
const printRoot = runtimeAssetUrl('assets/ui/manifest/', import.meta.url);

export function injectManifestLayouts(doc = globalThis.document) {
  injectOrrery(doc);
  if (!doc?.head || doc.getElementById('sf-manifest-layout')) return;
  const style = doc.createElement('style');
  style.id = 'sf-manifest-layout';
  style.textContent = `
    ${MF} {
      --paper:#f1eadb; --muted:#bec6bc; --rule:rgb(217 222 200 / .25);
      display:grid; grid-template-columns:minmax(0,1fr);
      grid-template-rows:auto minmax(0,1fr) auto; grid-template-areas:"title" "stage" "foot";
      padding:clamp(16px,3.5vh,42px) max(clamp(16px,4vw,66px),calc((100vw - 1560px)/2));
      gap:clamp(10px,2vh,24px); color:var(--paper);
      background:radial-gradient(ellipse at 80% 16%,#284540 0,transparent 50%),linear-gradient(120deg,#101a1b,#172c2c 64%,#111f22);
      font-family:var(--dp-face-read,'Instrument Sans',sans-serif); box-sizing:border-box;
    }
    ${MF}::before { background:repeating-linear-gradient(112deg,transparent 0 3px,rgb(179 215 200 / .022) 3px 4px); }
    ${MF} :is(h1,h2,h3,p) { margin:0; }
    ${MF} .manifest-header { grid-area:title; display:flex; align-items:end; justify-content:space-between; gap:18px;
      padding-bottom:clamp(12px,2.3vh,24px); border-bottom:1px solid var(--rule); }
    ${MF} .manifest-title { color:var(--paper); font:780 clamp(40px,5.5vw,84px)/.94 var(--dp-face-label);
      font-stretch:107%; letter-spacing:-.065em; text-transform:none; }
    ${MF} .manifest-subtitle { color:#d7dfd6; margin-top:9px; font-size:clamp(14px,1.2vw,18px); }
    ${MF} .manifest-balance { flex:none; display:grid; grid-template-columns:auto auto; align-items:baseline; gap:2px 5px; text-align:right; }
    ${MF} .manifest-balance .manifest-label { grid-column:1/-1; }
    ${MF} .manifest-balance strong { font:660 clamp(24px,2.8vw,42px)/1 var(--dp-face-numeral); font-variant-numeric:tabular-nums; color:var(--paper); }
    ${MF} .manifest-unit { color:var(--dp-lamp); font-weight:650; font-size:15px; }
    ${MF} .manifest-body { grid-area:stage; min-width:0; min-height:0; overflow:auto; overscroll-behavior:contain;
      display:grid; grid-template-columns:minmax(265px,.78fr) minmax(0,1.55fr); align-content:start; align-items:start;
      gap:clamp(14px,2.1vw,32px); padding:4px; scrollbar-color:#75867e transparent; }
    ${MF} .manifest-table, ${MF} .manifest-hand { min-width:0; }
    ${MF} .manifest-table { border:1px solid var(--rule); border-top:3px solid #a99064; border-radius:3px;
      background:linear-gradient(135deg,rgb(18 29 31 / .95),rgb(12 21 23 / .8)); padding:clamp(14px,1.7vw,28px); }
    ${MF} .manifest-label, ${MF} .manifest-suit { color:#c5d3c5; font:670 13px/1.25 var(--dp-face-label);
      letter-spacing:.075em; text-transform:uppercase; }
    ${MF} .manifest-rival { font:660 clamp(24px,2.4vw,38px)/1.05 var(--dp-face-label); letter-spacing:-.034em;
      margin:9px 0 6px; color:var(--paper); overflow-wrap:anywhere; }
    ${MF} .manifest-style { display:inline-block; color:#ead4a9; font-weight:620; margin-bottom:7px; }
    ${MF} .manifest-prose, ${MF} .manifest-note { color:var(--muted); font-size:15px; line-height:1.45; }
    ${MF} .manifest-note { font-size:13px; }
    ${MF} .manifest-stakes { border-block-start:1px solid var(--rule); margin-top:18px; padding-top:16px; }
    ${MF} .manifest-section-title { font:650 clamp(22px,1.95vw,30px)/1.12 var(--dp-face-label); letter-spacing:-.026em; color:var(--paper); }
    ${MF} .manifest-stakes .manifest-section-title { font-size:19px; }
    ${MF} .manifest-actions { display:grid; grid-template-columns:repeat(2,minmax(0,1fr)); gap:8px; margin:13px 0; }
    ${MF} .sf-key { min-height:42px; padding:8px 12px; letter-spacing:0; text-transform:none; font-size:15px; line-height:1.2; }
    ${MF} .manifest-primary { clip-path:none; background:#eed09a; border-color:#f1d9ac; color:#1c231c; }
    ${MF} .manifest-primary:is(:hover,:focus-visible) { background:#ffe6ae; }
    ${MF} .manifest-hand > .manifest-section-title { margin-bottom:13px; }
    ${MF} .manifest-hand > .manifest-label { margin-bottom:5px; }
    ${MF} .manifest-cards { display:grid; grid-template-columns:repeat(3,minmax(0,1fr)); gap:clamp(8px,1vw,16px); }
    ${MF} .manifest-cards--guide { grid-template-columns:repeat(2,minmax(0,1fr)); }
    ${MF} .manifest-card { --suit:#deb78c; display:grid; grid-template-rows:auto auto auto 1fr; align-items:start;
      justify-content:stretch; justify-items:stretch; gap:0; position:relative; overflow:hidden; min-width:0;
      text-align:left; padding:0 0 12px; clip-path:none; border:1px solid #66716a; border-radius:4px;
      color:var(--paper); background:linear-gradient(125deg,#25302d,#161e20); box-shadow:0 3px 8px rgb(0 0 0 / .2);
      white-space:normal; font-family:var(--dp-face-read); }
    ${MF} .manifest-card[data-suit=permit] { --suit:#8fd4c3; }
    ${MF} .manifest-card[data-suit=bribe] { --suit:#e8c578; }
    ${MF} .manifest-card[data-suit=audit] { --suit:#f0a09a; }
    ${MF} .manifest-print { display:block; width:100%; height:clamp(72px,12vh,148px); border-bottom:2px solid var(--suit);
      background-color:#2d3633; background-size:cover; background-position:center; }
    ${MF} [data-suit=cargo] .manifest-print { background-image:url("${printRoot}cargo.webp"); }
    ${MF} [data-suit=permit] .manifest-print { background-image:url("${printRoot}permit.webp"); }
    ${MF} [data-suit=bribe] .manifest-print { background-image:url("${printRoot}bribe.webp"); }
    ${MF} [data-suit=audit] .manifest-print { background-image:url("${printRoot}audit.webp"); }
    ${MF} .manifest-cards--guide .manifest-print { height:clamp(90px,15vh,175px); }
    ${MF} .manifest-print { position:relative; }
    ${MF} .manifest-rank { position:absolute; top:0; left:9px; display:flex; align-items:center; justify-content:center;
      min-width:34px; height:36px; gap:2px; padding:0 4px; box-sizing:border-box; border:1px solid #151c1a; border-top:0;
      border-radius:0 0 3px 3px; color:#202823; background:var(--suit); box-shadow:0 1px 3px rgb(0 0 0 / .28); }
    ${MF} .manifest-rank strong { font:760 25px/1 var(--dp-face-numeral); }
    ${MF} .manifest-rank small { font-size:12px; }
    ${MF} .manifest-rank .dp-icon .accent { fill:#4b5140; }
    ${MF} .manifest-last { margin:12px 0 0; color:#e0ddcc; font-size:14px; line-height:1.4; }
    ${MF} .manifest-suit { color:var(--suit); margin:10px 12px 2px; font-size:12px; }
    ${MF} .manifest-card-name { font:690 clamp(17px,1.28vw,21px)/1.12 var(--dp-face-label); letter-spacing:-.018em; margin:0 12px; }
    ${MF} .manifest-card-copy { color:#d1d7cf; font:450 13px/1.38 var(--dp-face-read); margin:5px 12px 0; }
    ${MF} button.manifest-card:enabled:is(:hover,:focus-visible) { background:#30413a; color:var(--paper);
      border-color:var(--suit); box-shadow:inset 0 -2px var(--suit); }
    ${MF} .manifest-portfolio { display:grid; grid-template-columns:repeat(2,minmax(0,1fr)); margin:12px 0 16px; border-block:1px solid var(--rule); }
    ${MF} .manifest-hold { padding:13px 9px 14px 0; min-width:0; }
    ${MF} .manifest-hold + .manifest-hold { border-left:1px solid var(--rule); padding-left:12px; padding-right:0; }
    ${MF} .manifest-hold-head { display:flex; flex-wrap:wrap; align-items:baseline; gap:2px 8px; }
    ${MF} .manifest-tonnes { color:var(--paper); font:650 clamp(30px,3.2vw,53px)/1.1 var(--dp-face-numeral); margin:10px 0;
      font-variant-numeric:tabular-nums; letter-spacing:-.04em; white-space:nowrap; }
    ${MF} .manifest-tonnes span { font:540 15px/1 var(--dp-face-label); color:var(--muted); }
    ${MF} .manifest-meter { height:4px; background:linear-gradient(to right,#afcbaa var(--fill),rgb(210 222 202 / .2) var(--fill)); }
    ${MF} .is-over .manifest-meter { background:#e99083; }
    ${MF} .manifest-condition { color:#d6decb; margin:10px 0 4px; font-size:14px; line-height:1.35; }
    ${MF} details { border-top:1px solid var(--rule); margin-top:14px; padding-top:3px; }
    ${MF} summary { color:#e1e7dc; font-weight:620; font-size:15px; cursor:pointer; padding:9px 0; }
    ${MF} details ol, ${MF} details ul { padding:0 0 0 20px; color:var(--muted); font-size:14px; }
    ${MF} details li { margin-block:6px; }
    ${MF} .manifest-deeds li span { margin-left:6px; }
    ${MF} .manifest-result, ${MF} .manifest-error { margin-bottom:15px; color:#f1deb1; border-left:3px solid var(--dp-lamp); padding:6px 10px; }
    ${MF} .manifest-foot { grid-area:foot; display:flex; align-items:center; justify-content:space-between; gap:10px;
      padding-top:10px; border-top:1px solid var(--rule); }
    ${MF} .manifest-announcement { position:absolute; width:1px; height:1px; overflow:hidden; clip-path:inset(50%); }
    @media (min-width:1100px) { ${MF} .manifest-actions { max-width:420px; } }
    @media (max-width:1000px) { ${MF} .manifest-cards { grid-template-columns:repeat(2,minmax(0,1fr)); } }
    @media (max-width:720px) {
      ${MF} { padding:12px max(12px,env(safe-area-inset-right)) max(10px,env(safe-area-inset-bottom)) max(12px,env(safe-area-inset-left)); }
      ${MF} .manifest-header { align-items:start; }
      ${MF} .manifest-title { font-size:36px; }
      ${MF} .manifest-subtitle { max-width:45ch; }
      ${MF} .manifest-body { grid-template-columns:minmax(0,1fr); gap:18px; }
      ${MF} .manifest-hand { margin:0 1px; }
      ${MF} .manifest-table { padding:14px; }
      ${MF} .manifest-print, ${MF} .manifest-cards--guide .manifest-print { height:clamp(72px,21vw,120px); }
      ${MF} .manifest-label { font-size:12px; }
      ${MF}[data-table-phase=hand] .manifest-subtitle { display:none; }
      ${MF}[data-table-phase=hand] .manifest-table { padding:10px 12px; }
      ${MF}[data-table-phase=hand] .manifest-style { margin:0; font-size:14px; }
      ${MF}[data-table-phase=hand] .manifest-rival { display:inline; font-size:20px; margin-right:7px; }
      ${MF}[data-table-phase=hand] .manifest-table > .manifest-label { margin:0 0 4px; }
      ${MF}[data-table-phase=hand] .manifest-portfolio { margin:8px 0 0; }
      ${MF}[data-table-phase=hand] .manifest-hold { padding-block:7px; }
      ${MF}[data-table-phase=hand] .manifest-tonnes { margin:1px 0 5px; font-size:28px; }
      ${MF}[data-table-phase=hand] .manifest-condition { margin:5px 0 0; }
      ${MF}[data-table-phase=hand] .manifest-tools { display:flex; align-items:start; justify-content:space-between; gap:6px; flex-wrap:wrap; }
      ${MF}[data-table-phase=hand] .manifest-tools details { margin:0; border:0; padding:0; }
      ${MF}[data-table-phase=hand] .manifest-tools details[open] { flex-basis:100%; }
      ${MF}[data-table-phase=hand] .manifest-tools summary { padding:7px 0 0; font-size:13px; }
      ${MF}[data-table-phase=hand] .manifest-body { gap:12px; }
      ${MF}[data-table-phase=hand] .manifest-hand > .manifest-label { display:inline; float:right; margin:6px 0; }
      ${MF}[data-table-phase=hand] .manifest-hand > .manifest-section-title { margin-bottom:8px; }
      ${MF}[data-table-phase=hand] .manifest-last { margin-top:8px; }
    }
    @media (max-height:560px) and (min-width:721px) {
      ${MF} { padding-block:10px; gap:6px; }
      ${MF} .manifest-header { padding-bottom:8px; }
      ${MF} .manifest-title { font-size:35px; }
      ${MF} .manifest-foot { padding-top:6px; }
    }
    @media (forced-colors:active) {
      ${MF} .manifest-card, ${MF} .manifest-table { border-color:CanvasText; }
      ${MF} .manifest-meter { forced-color-adjust:none; }
    }
  `;
  doc.head.appendChild(style);
}
