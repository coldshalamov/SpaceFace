// One composition sheet for the Crucible preparation family. Materials and typography inherit
// Deckplate/ORRERY; no new token root, runtime filter, full-screen canvas or animation loop.
import { injectOrrery } from './tokens.js';
const BONE = '236 230 216';
const VOID = '5 7 10';
const D = 'html body #screens > .k-screen.orr-crucible.sf-crucible-door.orr-preparation[data-prep-step]';
const A = 'html body #screens > .k-screen.orr-crucible.sf-crucible-draft.orr-armory.orr-visual-armory';
const R = 'html body #screens > .k-screen.orr-crucible.sf-crucible-refit.orr-refit';
const CSS = `
.orr-equipment-glyph { display:block; width:48px; height:48px; flex:none; color:var(--dp-ink); pointer-events:none; }
${D} { display:grid !important; grid-template-columns:minmax(0,1fr) minmax(0,1fr) !important; grid-template-rows:auto auto minmax(0,1fr) auto !important; gap:18px 40px !important; padding:30px 48px 22px !important; width:100% !important; height:100dvh !important; max-width:none !important; max-height:none !important; margin:0 !important; overflow:hidden !important; }
${D} > .k-title { grid-column:1 / -1 !important; grid-row:1 !important; margin:0 !important; padding:0 !important; }
${D} > .k-title h1 { font-size:54px !important; line-height:1 !important; letter-spacing:-.025em !important; }
${D} .sf-crd-sub { font-family:var(--dp-face-body, 'Instrument Sans'),sans-serif !important; text-transform:none !important; letter-spacing:0 !important; font-size:15px !important; line-height:1.5 !important; margin:6px 0 0 !important; color:rgb(${BONE} / .82) !important; }
${D} .orr-prep-nav { grid-column:1 / -1; grid-row:2; display:flex; align-items:center; gap:30px; border-bottom:1px solid var(--dp-line); min-width:0; }
${D} .orr-prep-tabs { display:flex; gap:28px; }
${D} .orr-prep-tab { display:flex; gap:10px; align-items:center; border:0 !important; border-radius:0; background:none !important; box-shadow:none !important; color:rgb(${BONE} / .72); font:600 16px var(--dp-face-label); letter-spacing:.12em; text-transform:uppercase; padding:14px 0; min-height:48px; cursor:pointer; position:relative; outline:none; }
${D} .orr-prep-tab::after { content:''; position:absolute; left:0; bottom:-1px; height:2px; width:100%; background:var(--dp-hand); opacity:0; transform:none; }
${D} .orr-prep-tab[aria-selected=true] { color:rgb(${BONE} / .96); background:none !important; box-shadow:none !important; border:0 !important; outline:none; }
${D} .orr-prep-tab[aria-selected=true]::after { opacity:1; }
${D} .orr-prep-tab:focus:not(:focus-visible) { outline:none !important; }
${D} .orr-prep-tab:focus-visible { outline:2px solid var(--dp-hand-hot) !important; outline-offset:3px !important; }
${D} .orr-prep-step { font-size:12px; font-variant-numeric:tabular-nums; letter-spacing:.08em; color:rgb(${BONE} / .55); }
${D} .orr-prep-tab[aria-selected=true] .orr-prep-step { color:var(--dp-hand); }
${D} .orr-prep-nextstep { display:inline-flex; align-items:center; gap:10px; margin:0; padding:14px 0; min-height:48px; font:600 16px var(--dp-face-label); letter-spacing:.12em; text-transform:uppercase; color:rgb(${BONE} / .42); pointer-events:none; user-select:none; }
${D} .orr-prep-summary { margin-left:auto; color:rgb(${BONE} / .78); font-size:13px; text-align:right; }
${D} > .k-stage { grid-column:1 !important; grid-row:3 !important; position:relative !important; inset:auto !important; width:100% !important; max-width:none !important; min-height:0 !important; height:100% !important; padding:0 12px 0 0 !important; margin:0 !important; overflow:auto !important; mask-image:none !important; }
${D} > .k-stage::before { display:none !important; }
${D} .orr-prep-panel { padding:4px 0 12px; }
${D} .orr-prep-settings { display:flex !important; flex-direction:column !important; gap:22px !important; padding:0 !important; margin:0 !important; }
${D} .orr-prep-settings > .k-row { display:block !important; margin:0 !important; padding:0 !important; min-width:0; }
${D} .k-row > .k-row__name { display:block !important; font:600 12px var(--dp-face-label) !important; letter-spacing:.12em !important; color:var(--dp-ink-dim) !important; margin-bottom:10px !important; }
${D} .sf-crd-modes, ${D} .sf-crd-stakes, ${D} .sf-crd-arenas { display:grid !important; gap:8px !important; padding:0 !important; margin:0 !important; width:100% !important; }
${D} .sf-crd-modes { grid-template-columns:repeat(3,minmax(0,1fr)) !important; }
${D} .sf-crd-stakes { grid-template-columns:repeat(4,minmax(0,1fr)) !important; }
${D} .sf-crd-arenas { grid-template-columns:repeat(5,minmax(0,1fr)) !important; }
${D} .sf-crd-modes > li, ${D} .sf-crd-stakes > li, ${D} .sf-crd-arenas > li, ${D} .sf-crd-hulls > li { margin:0 !important; width:auto !important; min-width:0 !important; list-style:none !important; }
${D} .orr-tile { max-width:none !important; width:100% !important; min-width:0 !important; min-height:76px !important; padding:9px 8px !important; display:flex !important; flex-direction:column !important; justify-content:center !important; align-items:center !important; gap:6px !important; border-bottom:1px solid var(--dp-line-faint) !important; border-radius:0 !important; opacity:1 !important; }
${D} .orr-tile[aria-pressed=true] { background:linear-gradient(0deg, rgb(242 185 80 / .10), transparent 75%) !important; }
${D} .orr-tile .fh-tile-legend { font:600 12px/1.35 var(--dp-face-label) !important; letter-spacing:.01em !important; white-space:normal !important; color:var(--dp-ink) !important; max-width:100% !important; }
${D} .orr-tile .fh-tile-art { display:flex !important; align-items:center !important; justify-content:center !important; min-height:0 !important; width:100% !important; height:42px !important; }
${D} .orr-tile .fh-tile-art svg { width:44px !important; height:44px !important; opacity:.95 !important; color:var(--dp-ink) !important; }
${D} .sf-crd-stake .fh-tile-art { height:30px !important; }
${D} .sf-crd-stake-nums { display:none !important; }
${D} .orr-prep-stake-number { display:block; color:var(--dp-ink); font:300 25px/1.1 var(--dp-face-numeral); font-variant-numeric:tabular-nums; }
${D} .orr-prep-stake-pressure { display:block; margin-top:5px; font:400 12px/1.25 var(--dp-face-body,'Instrument Sans'),sans-serif; color:var(--dp-ink-dim); }
${D} :is(.sf-crd-mode-sub,.sf-crd-stake-sub,.sf-crd-arena-sub,.sf-crd-hull-sub) { max-width:none !important; font:400 14px/1.45 var(--dp-face-body,'Instrument Sans'),sans-serif !important; color:var(--dp-ink-dim) !important; letter-spacing:0 !important; margin:10px 0 0 !important; }
${D} .sf-crd-ghost-sub { display:none !important; }
${D} .sf-crd-arenas .fh-tile-art { height:48px !important; }
${D} .sf-crd-arenas .fh-tile-art img { width:100% !important; height:56px !important; object-fit:cover !important; filter:none !important; opacity:.9 !important; }
${D} .sf-crd-hulls { display:grid !important; grid-template-columns:repeat(2,minmax(0,1fr)) !important; gap:8px 14px !important; padding:0 !important; margin:0 !important; }
${D} .sf-crd-hull { min-height:106px !important; display:grid !important; grid-template-columns:86px minmax(0,1fr) !important; gap:8px !important; text-align:left !important; }
${D} .sf-crd-hull .fh-tile-art { width:86px !important; height:72px !important; }
${D} .sf-crd-hull .fh-tile-art img { width:108px !important; height:82px !important; object-fit:contain !important; opacity:.92 !important; filter:none !important; transform:none !important; }
${D} .sf-crd-hull .fh-tile-legend { text-align:left !important; font-size:13px !important; }
${D} .orr-tile[disabled], ${D} .orr-tile[aria-disabled=true] { opacity:.5 !important; }
${D} .orr-prep-disclosure { padding:15px 0; border-bottom:1px solid var(--dp-line-faint); font-size:14px; }
${D} .orr-prep-disclosure > summary { min-height:32px; line-height:32px; cursor:pointer; color:var(--dp-ink); font:500 14px/32px var(--dp-face-body,'Instrument Sans'),sans-serif; letter-spacing:0; }
${D} .orr-prep-disclosure[open] > summary { margin-bottom:14px; }
${D} .orr-prep-challenges { gap:20px; margin-bottom:16px; }
${D} .sf-crd-anyhull-ships { flex-wrap:wrap !important; }
${D} :is(.sf-crd-anyhull-ship,.sf-crd-records > summary) { min-height:40px !important; font-size:13px !important; }
${D} .orr-door-hero, ${D} .orr-prep-ship { position:relative !important; grid-column:2 !important; grid-row:3 !important; inset:auto !important; width:100% !important; height:100% !important; min-height:0; margin:0; overflow:hidden !important; pointer-events:auto !important; }
${D} .orr-door-hero { isolation:isolate; z-index:0; overflow:hidden !important; }
${D} .orr-door-hero__art { inset:0 !important; width:100% !important; height:100% !important; object-fit:cover !important; object-position:center !important; -webkit-mask-image:linear-gradient(0deg,transparent 0%, transparent 8%, black 36%, black 90%, transparent 100%) !important; mask-image:linear-gradient(0deg,transparent 0%, transparent 8%, black 36%, black 90%, transparent 100%) !important; }
${D} .orr-door-hero__words { position:absolute !important; left:24px !important; right:24px !important; bottom:138px !important; text-align:left !important; max-width:none !important; z-index:2; }
${D} .orr-door-hero__name { font:800 clamp(26px,3vw,44px)/1.03 var(--dp-face-display,'Archivo') !important; letter-spacing:-.02em !important; color:rgb(${BONE} / .98) !important; text-shadow:0 1px 18px rgb(${VOID} / .55); }
${D} .orr-door-hero__line { max-width:40ch !important; margin-top:12px !important; font:400 14px/1.5 var(--dp-face-body,'Instrument Sans'),sans-serif !important; color:rgb(${BONE} / .88) !important; }
${D} .orr-prep-brief { position:absolute; bottom:10px; left:24px; right:24px; border-top:1px solid rgb(${BONE} / .18); padding-top:16px; z-index:2; }
${D} .orr-prep-purse { font:300 36px/1 var(--dp-face-numeral); color:var(--dp-ink); }
${D} .orr-prep-cadence { white-space:pre-line; font-size:13px; line-height:1.65; color:var(--dp-ink-dim); margin:8px 0 0; }
${D} .orr-prep-ship { display:flex; flex-direction:column; overflow:auto !important; padding:8px 8px 8px 24px; }
${D} .orr-prep-shiphead { position:relative; z-index:1; }
${D} .orr-prep-hullname { font:800 44px/1.05 var(--dp-face-display,'Archivo'); letter-spacing:-.02em; margin:10px 0 6px; }
${D} .orr-prep-hullline, ${D} .orr-prep-fitnote { font-size:13px; line-height:1.45; color:var(--dp-ink-dim); margin:6px 0; }
${D} .orr-prep-shipvisual { position:relative; min-height:180px; height:clamp(180px,23vh,250px); flex:none; }
/* the render is a bounded stage, not a strip: the stat ring reads round the ship, not the column */
${D} .orr-prep-shipart { width:auto !important; max-width:min(100%, 520px) !important; height:100% !important; margin:0 auto; display:block; object-fit:contain; }
${D} .orr-prep-fallback { width:200px; height:200px; margin:auto; }
${D} .orr-prep-shipjig { position:absolute; inset:0 8px 24px; }
${D} .orr-prep-views { position:absolute; left:0; right:0; bottom:0; display:flex; gap:18px; justify-content:center; }
${D} .orr-prep-view { color:var(--dp-ink-dim); background:none; border:0; border-bottom:1px solid transparent; border-radius:0; padding:8px 4px; font:500 13px var(--dp-face-label); cursor:pointer; }
${D} .orr-prep-view[aria-pressed=true] { border-bottom-color:var(--dp-hand); color:var(--dp-ink); }
${D} .orr-prep-manifest { display:grid; grid-template-columns:repeat(2,minmax(0,1fr)); gap:0 16px; margin:14px 0 10px; }
${D} .orr-prep-fitting { text-transform:none !important; letter-spacing:0 !important; display:flex; align-items:center; gap:10px; background:none; border:0; border-bottom:1px solid var(--dp-line-faint); border-radius:0; text-align:left; color:var(--dp-ink); padding:8px 0; cursor:pointer; min-width:0; }
${D} .orr-prep-fitting > span { min-width:0; }
${D} .orr-prep-fitting small { display:block; color:var(--dp-ink-dim); font:500 12px/1.4 var(--dp-face-label); text-transform:uppercase; }
${D} .orr-prep-fitting strong { font:500 13px/1.3 var(--dp-face-body,'Instrument Sans'),sans-serif; display:block; overflow-wrap:anywhere; }
${D} .orr-prep-fitting[aria-pressed=true] { border-bottom-color:var(--dp-hand); }
${D} .orr-prep-fitting.is-empty .orr-equipment-glyph { opacity:.35; }
${D} > .k-foot { grid-column:1 / -1 !important; grid-row:4 !important; display:block !important; position:relative !important; z-index:6 !important; inset:auto !important; width:auto !important; margin:0 !important; padding:14px 0 0 !important; border-top:1px solid rgb(${BONE} / .16); background:rgb(${VOID}); box-shadow:0 -28px 40px 12px rgb(${VOID}); isolation:isolate; }
${D} .k-foot .k-words { display:flex !important; justify-content:flex-end; align-items:center; gap:26px !important; padding:0 !important; flex-wrap:wrap; position:relative; z-index:1; }
${D} .k-foot .orr-prep-continue, ${D} .k-foot .orr-key--hazard { font:650 19px var(--dp-face-label) !important; min-height:48px !important; min-width:240px !important; text-align:center !important; padding:10px 24px !important; letter-spacing:0 !important; color:var(--dp-void) !important; background:var(--dp-hand) !important; clip-path:polygon(0 0,calc(100% - 12px) 0,100% 12px,100% 100%,0 100%); }
${D} .k-foot .orr-door-hint { text-align:right; font:400 12px/1.45 var(--dp-face-body,'Instrument Sans'),sans-serif !important; letter-spacing:0 !important; margin:9px 0 0 !important; color:rgb(${BONE} / .78) !important; position:relative; z-index:1; }
/* foot rail: ‹ BACK + ESC keycap (matches new-game / save / tech-tree) */
${D} .k-foot .sf-back.k-word { all:unset !important; box-sizing:border-box !important; cursor:pointer !important; display:inline-flex !important; align-items:baseline !important; gap:0 !important; padding:10px 0 12px !important; min-height:44px !important; font:600 13.5px var(--dp-face-label) !important; font-stretch:112% !important; letter-spacing:.22em !important; text-transform:uppercase !important; color:rgb(255 253 248) !important; background:linear-gradient(0deg, rgb(${BONE} / .28) 0 1.5px, transparent 1.5px) 0 100% / 120px 100% no-repeat !important; text-shadow:none !important; }
${D} .k-foot .sf-back.k-word::before { all:unset !important; content:"‹" !important; display:inline !important; margin-right:12px !important; font-size:15px !important; color:rgb(${BONE} / .6) !important; }
${D} .k-foot .sf-back.k-word::after { all:unset !important; content:"ESC" / "" !important; display:inline-block !important; margin-left:16px !important; padding:3px 7px 4px !important; font:600 11px var(--dp-face-label) !important; letter-spacing:.2em !important; line-height:1 !important; text-transform:uppercase !important; color:rgb(${BONE} / .9) !important; background:rgb(${BONE} / .1) !important; border:1px solid rgb(${BONE} / .5) !important; border-radius:3px !important; box-shadow:inset 0 -1px 0 rgb(0 0 0 / .35) !important; vertical-align:baseline !important; }
${D} .k-foot .sf-back.k-word :is(.k-kbd, .dp-kbd, kbd) { display:none !important; }
${D} .k-foot .sf-back.k-word:is(:hover, :focus-visible) { color:var(--dp-hand-hot, #ffd98c) !important; outline:none !important; text-decoration:none !important; }
${D} .k-foot .sf-back.k-word:focus-visible::after { color:rgb(255 253 248) !important; border-color:rgb(255 253 248 / .45) !important; }
${D} :is(button,summary,input):focus-visible, ${A} :is(button,input,summary):focus-visible { outline:2px solid var(--dp-hand-hot) !important; outline-offset:3px !important; }
/* The armory's three planes: catalog, object/ship, transaction. */
${A} { display:grid !important; grid-template-columns:minmax(320px,.9fr) minmax(0,1.55fr) !important; grid-template-rows:auto minmax(0,1fr) auto !important; gap:24px 38px !important; padding:30px 48px 22px !important; width:100% !important; height:100dvh !important; max-width:none !important; max-height:none !important; margin:0 !important; overflow:hidden !important; }
${A} > .k-title { grid-column:1 / -1 !important; grid-row:1; padding:0 !important; margin:0 !important; position:relative; }
${A} > .k-title h1 { font:800 44px/1 var(--dp-face-display,'Archivo') !important; letter-spacing:-.02em !important; }
${A} > .k-title .sf-cru-sub { font-size:14px !important; margin:10px 200px 0 0; color:var(--dp-ink-dim) !important; }
${A} .orr-armory-wallet { position:absolute; right:0; top:0; text-align:right; }
${A} .orr-armory-wallet strong { display:block; font:300 40px/1 var(--dp-face-numeral); font-variant-numeric:tabular-nums; }
${A} .orr-armory-wallet span { display:block; font:500 12px/1.4 var(--dp-face-label); letter-spacing:.08em; text-transform:uppercase; color:var(--dp-ink-dim); margin-top:6px; }
${A} > .sf-cru-stage { grid-column:1 !important; grid-row:2 !important; display:flex !important; flex-direction:column !important; position:relative !important; inset:auto !important; max-width:none !important; width:100% !important; height:100% !important; min-height:0 !important; padding:0 !important; margin:0 !important; overflow:hidden !important; }
${A} .sf-cru-filters { display:flex !important; flex-wrap:wrap !important; gap:4px 14px !important; padding:0 0 12px !important; margin:0 !important; flex:none !important; }
${A} .sf-cru-filters > button { padding:8px 0 !important; font:500 12px var(--dp-face-label) !important; min-height:36px !important; letter-spacing:0 !important; color:var(--dp-ink-dim) !important; }
${A} .sf-cru-filters > button[aria-pressed=true] { color:var(--dp-ink) !important; border-bottom:1px solid var(--dp-hand) !important; }
${A} .sf-cru-count { margin-left:5px; font-size:12px; opacity:.7; }
${A} .sf-cru-search { width:100% !important; max-width:none !important; order:2; flex:1 0 100%; margin:6px 0 0 !important; min-height:44px !important; color:var(--dp-ink) !important; font:400 14px var(--dp-face-body,'Instrument Sans'),sans-serif !important; padding:10px 12px !important; border:0 !important; border-bottom:1px solid var(--dp-line) !important; background:var(--dp-glass-deep) !important; }
${A} .sf-cru-filters .orr-stationrow__rule { display:none !important; }
${A} .sf-cru-stage > .sf-cru-cards { display:flex !important; flex-direction:column !important; gap:0 !important; flex:1 1 auto !important; min-height:0 !important; max-height:none !important; height:auto !important; overflow:auto !important; padding:0 10px 16px 0 !important; mask-image:none !important; }
${A} .sf-cru-card.sf-cru-card { display:grid !important; grid-template-columns:58px minmax(0,1fr) auto !important; grid-template-rows:auto auto !important; align-items:center !important; gap:3px 12px !important; padding:12px 4px 12px 12px !important; margin:0 !important; min-height:88px !important; height:auto !important; flex:none !important; opacity:1 !important; width:100% !important; border:0 !important; border-bottom:1px solid var(--dp-line-faint) !important; border-radius:0 !important; background:none !important; text-align:left !important; }
${A} .sf-cru-card > .orr-equipment-glyph { grid-column:1; grid-row:1 / 3; width:54px; height:54px; opacity:.8; }
${A} .sf-cru-card .sf-cru-name { grid-column:2 !important; grid-row:1 !important; font:600 16px/1.2 var(--dp-face-label) !important; white-space:normal !important; color:var(--dp-ink) !important; overflow-wrap:anywhere; }
${A} .sf-cru-card .sf-cru-price { grid-column:3 !important; grid-row:1 / 3 !important; font:500 13px var(--dp-face-numeral) !important; color:var(--dp-ink-dim) !important; padding-left:6px; white-space:nowrap; }
${A} .sf-cru-card .sf-cru-verb { display:block !important; grid-column:2 !important; grid-row:2 !important; font:400 12px/1.3 var(--dp-face-body,'Instrument Sans'),sans-serif !important; letter-spacing:0 !important; color:var(--dp-ink-dim) !important; }
${A} .sf-cru-card .sf-cru-key, ${A} .orr-rail-scale, ${A} .orr-rail-wallet { display:none !important; }
${A} .sf-cru-card.is-lit { background:linear-gradient(90deg,rgb(242 185 80 / .09),transparent) !important; }
${A} .sf-cru-card.is-lit::before { content:'' !important; display:block !important; position:absolute !important; left:0 !important; top:14px !important; bottom:14px !important; width:2px !important; background:var(--dp-hand) !important; }
${A} .orr-rail-divider { font:500 12px/1.4 var(--dp-face-label) !important; letter-spacing:.12em; color:var(--dp-ink-dim) !important; margin:14px 0 4px 12px !important; }
/* Doubled .orr-armory-reading.orr-armory-reading is a deliberate specificity bump so these !important reading rules win over earlier stage layout. */
${A} .orr-armory-reading.orr-armory-reading { pointer-events:auto !important; grid-column:2 !important; grid-row:2 !important; position:relative !important; inset:auto !important; width:100% !important; height:100% !important; min-width:0 !important; min-height:0 !important; display:grid !important; grid-template-columns:minmax(180px,.9fr) minmax(0,1.1fr) !important; grid-template-rows:minmax(0,1fr) !important; gap:24px !important; overflow:auto !important; padding:14px 2px 14px 16px !important; border-left:1px solid var(--dp-line-faint); }
${A} .orr-armory-reading[hidden] { display:none !important; }
${A} .orr-armory-visual { display:flex; flex-direction:column; width:100%; min-width:0; gap:16px; }
${A} .orr-pip-spanner { width:100%; flex:none; order:-1; color:var(--dp-ink); }
${A} .orr-pip-spanner > svg { display:block; width:100%; max-width:320px; height:70px; margin:auto; fill:none; stroke:currentColor; stroke-width:2; stroke-linecap:square; stroke-linejoin:bevel; }
${A} .orr-pip-spanner > svg[hidden], ${A} .orr-crew-stage[hidden] { display:none !important; }
${A} .orr-crew-stage { position:relative; width:100%; max-width:360px; aspect-ratio:5 / 3; margin:auto; }
${A} .orr-crew-stage > canvas { display:block; width:100%; height:100%; pointer-events:none; }
${A} .orr-crew-item { position:absolute; width:44px; height:44px; transform:translate(-50%,-50%); pointer-events:none; }
${A} .orr-crew-item > .orr-equipment-glyph { width:100%; height:100%; }
${A} .orr-crew-item-label { position:absolute; transform:translateX(-50%); width:150px; text-align:center; font:500 12px/1.4 var(--dp-face-label); color:var(--dp-ink-dim); pointer-events:none; }
${A} .orr-crew-pointer { color:var(--dp-hand); stroke:currentColor; }
${A} .orr-crew-names { display:flex; justify-content:space-between; white-space:pre; font:500 12px/1.5 var(--dp-face-label); color:var(--dp-ink-dim); margin:0; }
${A} .orr-crew-status { font:400 12px/1.5 var(--dp-face-label); color:var(--dp-ink-dim); margin:4px 0 0; }
${A} .orr-pip-spanner[data-state=accepted] .orr-crew-jaw-upper, ${A} .orr-pip-spanner[data-state=installed] .orr-crew-jaw-upper { transform:translateY(9px); }
${A} .orr-pip-spanner[data-state=accepted] .orr-crew-jaw-lower, ${A} .orr-pip-spanner[data-state=installed] .orr-crew-jaw-lower { transform:translateY(-9px); }
${A} .orr-pip-spanner[data-animate=true] .orr-crew-jaw-upper { animation:orr-spanner-upper 480ms var(--dp-ease-out) both; }
${A} .orr-pip-spanner[data-animate=true] .orr-crew-jaw-lower { animation:orr-spanner-lower 480ms var(--dp-ease-out) both; }
${A} .orr-pip-spanner[data-state=denied] .orr-crew-pointer { stroke-dasharray:4 4; }
@keyframes orr-spanner-upper { from { transform:translateY(0); } to { transform:translateY(9px); } }
@keyframes orr-spanner-lower { from { transform:translateY(0); } to { transform:translateY(-9px); } }
@media (prefers-reduced-motion:reduce) { ${A} .orr-pip-spanner * { animation:none !important; } }
html.sf-reduce-motion .orr-pip-spanner *, html.sf-reduce-flash .orr-pip-spanner * { animation:none !important; }
${A} .orr-armory-item { position:relative; display:grid; place-items:center; min-height:210px; height:250px; flex:none; }
${A} .orr-armory-item::before { content:''; position:absolute; inset:16px; border-radius:50%; border:1px solid var(--dp-line); pointer-events:none; }
${A} .orr-armory-item > .orr-equipment-glyph { width:180px; height:180px; color:var(--dp-ink); }
${A} .orr-armory-item > img { width:100%; height:100%; object-fit:contain; }
${A} .orr-armory-object-label { text-align:center; margin:0; font:500 12px/1.5 var(--dp-face-label); color:var(--dp-ink-dim); letter-spacing:.1em; text-transform:uppercase; }
${A} .orr-armory-reading__jig { width:100% !important; height:230px !important; aspect-ratio:auto !important; min-height:180px; }
${A} .orr-armory-fitline { font:400 13px/1.45 var(--dp-face-body,'Instrument Sans'),sans-serif; color:var(--dp-ink); margin:0 0 12px; }
${A} .orr-armory-reading__words { padding:0 !important; min-width:0; }
${A} .orr-armory-reading__verb { font:600 12px/1.4 var(--dp-face-label) !important; color:var(--dp-ink-dim) !important; letter-spacing:.1em !important; }
${A} .orr-armory-reading__name { font:800 clamp(24px,2.4vw,36px)/1.06 var(--dp-face-display,'Archivo') !important; letter-spacing:-.02em !important; overflow-wrap:anywhere; margin:10px 0 16px !important; }
${A} .orr-armory-reading__blurb { font:400 15px/1.5 var(--dp-face-body,'Instrument Sans'),sans-serif !important; color:var(--dp-ink) !important; max-width:none !important; }
${A} .orr-armory-reading__act { font:400 13px/1.5 var(--dp-face-body,'Instrument Sans'),sans-serif !important; color:var(--dp-ink-dim) !important; }
${A} .orr-armory-reading__compare { margin:14px 0 !important; }
${A} .orr-armory-reading__budget { margin:20px 0 !important; }
${A} .orr-armory-reading__buy { margin:18px 0 12px !important; }
${A} .orr-armory-purchase { display:block; width:100%; min-height:50px; padding:12px 16px; background:var(--dp-hand); color:var(--dp-void); border:0; border-radius:0; font:650 16px/1.25 var(--dp-face-label); cursor:pointer; clip-path:polygon(0 0,calc(100% - 10px) 0,100% 10px,100% 100%,0 100%); }
${A} .orr-armory-purchase:disabled { background:var(--dp-line); color:var(--dp-ink-dim); cursor:default; }
${A} .orr-armory-refusal { margin:8px 0 0; font:400 13px/1.45 var(--dp-face-body,'Instrument Sans'),sans-serif; color:var(--dp-ink-dim); }
${A} .orr-armory-reading__demo-word, ${A} .orr-armory-reading__hold-word { font:500 13px var(--dp-face-label) !important; min-height:40px; padding:8px 0; color:var(--dp-ink-dim) !important; border:0; border-bottom:1px solid var(--dp-line); background:none; cursor:pointer; }
${A} .sf-cru-note { min-height:24px; margin:8px 0 0 !important; font:400 13px/1.4 var(--dp-face-body,'Instrument Sans'),sans-serif !important; color:var(--dp-ink) !important; }
${A} .orr-armory-empty { padding:36px 12px; color:var(--dp-ink-dim); font-size:15px; line-height:1.5; }
${A} .orr-armory-clear { display:block; margin-top:16px; background:none; color:var(--dp-ink); border:0; border-bottom:1px solid var(--dp-line); padding:10px 0; min-height:44px; cursor:pointer; }
${A} > .k-foot { grid-column:1 / -1 !important; grid-row:3 !important; position:relative !important; inset:auto !important; width:auto !important; margin:0 !important; padding:16px 0 0 !important; border-top:1px solid var(--dp-line-faint); }
${A} .k-foot .k-words { display:flex !important; justify-content:flex-end !important; gap:28px !important; align-items:center !important; padding:0 !important; }
${A} .k-foot .k-word { font:600 16px var(--dp-face-label) !important; min-height:44px !important; }
${A} .k-foot .k-word--primary { color:var(--dp-ink) !important; }
${A} .sf-cru-fine { margin:8px 0 0 !important; font-size:12px !important; text-align:right; color:var(--dp-ink-dim) !important; }
${A} .orr-armory-reading.is-unavailable .orr-armory-reading__name { color:var(--dp-ink) !important; }
${D} [hidden], ${A} [hidden] { display:none !important; }
${D} .sf-crd-row--share:not(.is-open) { display:none !important; }
${D} .orr-door-hero { mask-image:none !important; -webkit-mask-image:none !important; }
${D} .orr-door-hero__words, ${D} .orr-prep-brief { z-index:2; position:absolute; }
${D} .orr-prep-challenges { display:flex !important; gap:16px; }
${D} .orr-prep-challenges > li { flex:1; list-style:none; }
${A} .sf-cru-card .sf-cru-price { visibility:visible !important; }
${A} .sf-cru-card .sf-cru-price::before { content:none !important; }
${A} .orr-armory-reading__buy { display:block !important; text-transform:none !important; letter-spacing:0 !important; }
${A} .orr-armory-purchase, ${A} .orr-armory-refusal { text-transform:none !important; letter-spacing:0 !important; }
${A} .orr-armory-item::before { width:210px; height:210px; inset:auto; }
${D} .sf-crd-hull .fh-tile-art { grid-column:1; grid-row:1 / 4; }
${D} .sf-crd-hull .fh-tile-legend { grid-column:2; grid-row:1; align-self:center; }
${D} .orr-prep-hullsub { grid-column:2; grid-row:2; }
${D} .orr-prep-locknote { grid-column:2; grid-row:3; font:400 12px/1.4 var(--dp-face-body,'Instrument Sans'),sans-serif; color:var(--dp-ink-dim); text-transform:none; letter-spacing:0; }
${D} .sf-crd-hull[data-locked='1'] .fh-tile-art { opacity:.5 !important; }
${D} .sf-crd-hull[data-locked='1'] .fh-tile-legend { opacity:.7 !important; }
${D} .orr-prep-fitting .orr-equipment-glyph { width:38px; height:38px; }
${D} .k-stage, ${D} .orr-prep-ship, ${A} .sf-cru-cards, ${A} .orr-armory-reading { scrollbar-width:thin; scrollbar-color:var(--dp-line-hi) transparent; }
${D} ::-webkit-scrollbar, ${A} ::-webkit-scrollbar { width:5px !important; height:5px !important; }
${D} ::-webkit-scrollbar-thumb, ${A} ::-webkit-scrollbar-thumb { background:var(--dp-line-hi); }
${A} .orr-armory-build { width:100%; font:400 12px/1.4 var(--dp-face-body,'Instrument Sans'),sans-serif; color:var(--dp-ink-dim); }
${A} .orr-armory-build summary { min-height:40px; padding:10px 0; cursor:pointer; color:var(--dp-ink); }
${A} .orr-armory-build ul { margin:0; padding:0; list-style:none; }
${A} .orr-armory-build li { display:flex; align-items:center; gap:10px; padding:8px 0; border-top:1px solid var(--dp-line-faint); }
${A} .orr-armory-build li .orr-equipment-glyph { width:30px; height:30px; }
${A} .orr-armory-build li small { display:block; font-size:12px; color:var(--dp-ink-dim); }
/* Brief reveal only; idle interfaces do not schedule work and hidden screens do not animate. */
${D} .orr-prep-panel:not([hidden]), ${D} .orr-prep-ship:not([hidden]) { animation:orr-prep-arrive 240ms var(--dp-ease-out) both; }
${A} .orr-armory-item > svg { animation:orr-prep-arrive 200ms var(--dp-ease-out) both; }
@keyframes orr-prep-arrive { from { opacity:0; transform:translateY(6px); } to { opacity:1; transform:none; } }
html.sf-reduce-motion .orr-preparation *, html.sf-reduce-motion .orr-visual-armory * { animation:none !important; transition:none !important; scroll-behavior:auto !important; }
/* — the character-select pass —
   Mode is the first decision and takes the biggest face; stakes carry their service marks over
   thin numerals; the arena collapses to one calm strip of five stops (the hero carries the art).
   Every tile answers the cursor: an underline that draws from its left end, a two-pixel lift.
   The roster is the character select: authored sigils, the amber Hand on its rail, the stat ring
   round the render, and a weigh-in when the build changes. */
${D} .sf-crd-row--hull > div { position:relative; padding-left:26px; }
${D} .orr-prep-hand { position:absolute; left:0; top:0; width:18px; height:22px; color:var(--dp-hand); pointer-events:none;
  filter:drop-shadow(0 0 6px rgb(242 185 80 / .45)); will-change:transform; }
${D} .orr-prep-hand svg { display:block; width:18px; height:22px; fill:none; stroke:currentColor; stroke-width:2; stroke-linecap:round; stroke-linejoin:round; }
/* mode leads */
${D} .sf-crd-modes { gap:10px !important; }
${D} .sf-crd-modes .orr-tile { min-height:124px !important; padding:16px 8px 12px !important; }
${D} .sf-crd-modes .fh-tile-art { height:60px !important; }
${D} .sf-crd-modes .fh-tile-art svg { width:60px !important; height:60px !important; transition:transform .26s var(--dp-ease-out) !important; }
${D} .sf-crd-modes .orr-tile:not([aria-pressed=true]) { opacity:.6 !important; }
${D} .sf-crd-modes .orr-tile:is(:hover,:focus-visible) { opacity:1 !important; }
${D} .sf-crd-modes .orr-tile[aria-pressed=true] .fh-tile-art svg { transform:scale(1.08); }
${D} .sf-crd-modes .fh-tile-legend { font-size:13px !important; letter-spacing:.14em !important; }
/* stakes: mark, purse, pressure — a service ladder */
${D} .sf-crd-stakes .orr-tile { min-height:102px !important; }
${D} .sf-crd-stakes { gap:10px !important; }
${D} .sf-crd-stake .fh-tile-art svg.orr-prep-stake-mark { width:28px !important; height:28px !important; opacity:.8; color:var(--dp-ink-dim) !important;
  transition:color .18s linear, opacity .18s linear; }
${D} .orr-tile[aria-pressed=true] .orr-prep-stake-mark { color:var(--dp-hand) !important; opacity:1; }
${D} .orr-prep-stake-number { font-size:29px !important; font-weight:250 !important; letter-spacing:-.01em; }
${D} .orr-prep-stake-pressure { margin-top:3px; font:400 12px/1.3 var(--dp-face-label); letter-spacing:.1em; text-transform:uppercase; }
${D} .orr-prep-stake-yield { margin-top:2px; font:400 12px/1.3 var(--dp-face-body,'Instrument Sans'),sans-serif; color:var(--dp-ink-dim); }
/* arena: one strip of five; the words carry the choice, the hero carries the rooms */
${D} .sf-crd-arenas .orr-tile { min-height:66px !important; padding:6px 4px 8px !important; }
${D} .sf-crd-arenas .fh-tile-art { height:34px !important; }
${D} .sf-crd-arenas .fh-tile-art img { width:88% !important; height:40px !important; object-fit:cover !important; }
${D} .sf-crd-arenas .fh-tile-legend { font-size:12px !important; letter-spacing:.08em !important; white-space:nowrap; overflow:hidden; text-overflow:ellipsis; max-width:100%; }
/* the answer to the cursor: an underline drawn from the left, a two-pixel lift */
${D} .orr-tile { position:relative; transition:transform .22s var(--dp-ease-out), opacity .18s linear !important; }
${D} .orr-tile::after { content:''; position:absolute; left:8%; right:8%; bottom:-1px; height:2px; background:var(--dp-hand);
  transform:scaleX(0); transform-origin:left center; transition:transform .26s var(--dp-ease-out), box-shadow .26s linear; }
${D} .orr-tile[aria-pressed=true]::after { transform:scaleX(1); box-shadow:0 0 10px rgb(242 185 80 / .35); }
${D} .orr-tile:is(:hover,:focus-visible):not([aria-pressed=true])::after { transform:scaleX(.32); }
${D} .orr-tile:is(:hover,:focus-visible) { transform:translateY(-2px) !important; }
${D} .orr-tile:active { transform:translateY(0) !important; transition-duration:.08s !important; }
/* a locked build refuses: one horizontal shake, never red */
${D} .orr-tile.is-denied { animation:orr-deny .32s linear; }
@keyframes orr-deny { 0%,100% { transform:translateX(0); } 20% { transform:translateX(-5px); } 40% { transform:translateX(4px); }
  60% { transform:translateX(-3px); } 80% { transform:translateX(2px); } }
/* roster faces: the sigil is the face, the hull line is the ride */
${D} .sf-crd-hull .fh-tile-art svg.orr-sigil { width:62px !important; height:62px !important; opacity:.8; color:var(--dp-ink);
  transition:opacity .18s linear, transform .26s var(--dp-ease-out), color .18s linear, filter .26s linear !important; }
${D} .sf-crd-hull[aria-pressed=true] .fh-tile-art svg.orr-sigil { opacity:1; transform:scale(1.07); color:var(--dp-hand);
  filter:drop-shadow(0 0 8px rgb(242 185 80 / .3)); }
${D} .orr-prep-hullsub { font:400 12px/1.3 var(--dp-face-label); letter-spacing:.14em; text-transform:uppercase; color:var(--dp-ink-dim); align-self:start; }
/* the weigh-in: the render rises and settles, the name snaps to rest, the manifest staggers */
${D} .orr-prep-ship.is-arriving .orr-prep-shipart { animation:orr-weighin .5s var(--dp-ease-out) both; }
@keyframes orr-weighin { from { opacity:0; transform:translateY(16px) scale(.97); } to { opacity:1; transform:none; } }
${D} .orr-prep-ship.is-arriving .orr-prep-hullname { animation:orr-slam .34s var(--dp-ease-out) both; transform-origin:left bottom; }
@keyframes orr-slam { from { transform:scale(1.035); } to { transform:scale(1); } }
${D} .orr-prep-ship.is-arriving .orr-prep-fitting { animation:orr-prep-arrive 300ms var(--dp-ease-out) both;
  animation-delay:calc(140ms + var(--i, 0) * 26ms); }
/* the purse is a counter; its unit rides beside it */
${D} .orr-prep-purse-unit { font:500 13px/1 var(--dp-face-label); letter-spacing:.12em; text-transform:uppercase; color:var(--dp-ink-dim); margin-left:6px; }
/* arrival: the panel's rows land in sequence */
${D} .orr-prep-panel:not([hidden]) .orr-prep-settings > .k-row { animation:orr-prep-arrive 320ms var(--dp-ease-out) both; }
${D} .orr-prep-panel:not([hidden]) .orr-prep-settings > .k-row:nth-child(2) { animation-delay:70ms; }
${D} .orr-prep-panel:not([hidden]) .orr-prep-settings > .k-row:nth-child(3) { animation-delay:140ms; }
${D} .orr-prep-panel:not([hidden]) .orr-prep-settings > .k-row:nth-child(n+4) { animation-delay:210ms; }
/* the arena hero settles into its new room instead of only cross-fading */
${D} .orr-door-hero__art { transform:scale(1.045); transition:opacity .35s linear, transform .7s var(--dp-ease-out) !important; }
${D} .orr-door-hero__art.is-on { transform:scale(1); }
/* the Lamp Key's slow sheen; the key dips under the press */
${D} .k-foot .orr-prep-continue, ${D} .k-foot .orr-key--hazard { position:relative; overflow:hidden; transition:transform .12s var(--dp-ease-out); }
${D} .k-foot .orr-prep-continue::after { content:''; position:absolute; top:-4px; bottom:-4px; left:0; width:34%; pointer-events:none;
  background:linear-gradient(100deg, transparent, rgb(255 244 214 / .55), transparent);
  transform:translateX(-180%) skewX(-18deg); animation:orr-key-sheen 6s ease-in-out 2.4s infinite; }
@keyframes orr-key-sheen { 0% { transform:translateX(-180%) skewX(-18deg); } 22%, 100% { transform:translateX(440%) skewX(-18deg); } }
${D} .k-foot .orr-prep-continue:active, ${D} .k-foot .orr-key--hazard:active { transform:translateY(1px); }
/* a short plate trims the lead tiles, never the hierarchy: mode stays the biggest face */
@media (max-height:820px) {
 ${D} { padding:18px 36px 14px !important; gap:10px 28px !important; }
 ${D} > .k-title h1 { font-size:40px !important; }
 ${D} .sf-crd-sub { font-size:13px !important; margin:4px 0 0 !important; }
 ${D} .orr-prep-nav { gap:18px; }
 ${D} .orr-prep-tab, ${D} .orr-prep-nextstep { padding:8px 0; min-height:36px; font-size:14px; }
 ${D} .orr-prep-panelhead { margin:0 0 10px !important; }
 ${D} .orr-prep-panelhead-step { font-size:13px !important; }
 ${D} .orr-prep-panelhead-line { font-size:12px !important; margin:2px 0 0 !important; }
 ${D} .orr-prep-settings { gap:10px !important; }
 ${D} .k-row > .k-row__name { margin-bottom:6px !important; }
 ${D} .sf-crd-modes .orr-tile { min-height:72px !important; padding:6px 6px 6px !important; }
 ${D} .sf-crd-modes .fh-tile-art, ${D} .sf-crd-modes .fh-tile-art svg { height:34px !important; }
 ${D} .sf-crd-modes .fh-tile-art svg { width:34px !important; }
 ${D} .sf-crd-modes .fh-tile-legend { font-size:11px !important; letter-spacing:.1em !important; }
 ${D} .sf-crd-stakes .orr-tile { min-height:64px !important; padding:6px 4px !important; }
 ${D} .orr-prep-stake-number { font-size:20px !important; }
 /* UI polish: at 720p the stake mark gives its 30px back so purse, pressure and yield all fit the tile unclipped */
 ${D} .sf-crd-stake .fh-tile-art { display:none !important; }
 ${D} .orr-prep-stake-yield { font-size:11px !important; letter-spacing:0 !important; }
 ${D} .orr-prep-stake-pressure { letter-spacing:.04em !important; font-size:11px !important; }
 ${D} :is(.orr-prep-stake-pressure,.orr-prep-stake-yield) { white-space:nowrap; overflow:hidden; text-overflow:ellipsis; max-width:100%; }
 /* Arena above the fold: hero carries the rooms — drop strip thumbs so both rows fit */
 ${D} .sf-crd-arenas .fh-tile-art { display:none !important; }
 ${D} .sf-crd-arenas .orr-tile { min-height:34px !important; padding:6px 2px !important; }
 ${D} .sf-crd-arenas .fh-tile-legend { font-size:11px !important; }
 ${D} :is(.sf-crd-mode-sub,.sf-crd-stake-sub,.sf-crd-arena-sub,.sf-crd-hull-sub) { margin-top:2px !important; font-size:11.5px !important; line-height:1.3 !important; display:-webkit-box; -webkit-line-clamp:2; -webkit-box-orient:vertical; overflow:hidden; }
 ${D} .orr-prep-disclosure { padding:2px 0; font-size:12px; }
 ${D} .orr-door-hero__words { bottom:110px !important; }
 ${D} > .k-foot { padding:8px 0 0 !important; }
}
@media (max-width:1150px) {
 ${D}, ${A} { padding:24px !important; column-gap:24px !important; }
 ${D} .sf-crd-hull { grid-template-columns:62px minmax(0,1fr) !important; }
 ${D} .sf-crd-hull .fh-tile-art { width:62px !important; }
 ${D} .orr-prep-hullname { font-size:34px; }
 ${A} { grid-template-columns:minmax(300px,.9fr) minmax(0,1.2fr) !important; }
 ${A} .orr-armory-reading.orr-armory-reading { grid-template-columns:minmax(0,1fr) !important; overflow:auto !important; }
 ${A} .orr-armory-visual { flex-direction:row; flex-wrap:wrap; align-items:center; gap:10px; }
 ${A} .orr-armory-item { width:45%; min-width:0; height:165px; min-height:150px; }
 ${A} .orr-armory-item > .orr-equipment-glyph { width:130px; height:130px; }
 ${A} .orr-armory-reading__jig { width:calc(55% - 10px) !important; min-width:0; flex:none; height:180px !important; }
 ${A} .orr-armory-object-label { display:none; }
 ${A} .orr-slotjig__word, ${A} .orr-slotjig__sub { display:none; }
}
/* One reading column (761–1150 wide): its rows size to their content and the words lead, so
   the name, the sentence and the purchase key are never printed under the schematic and jig. */
@media (min-width:761px) and (max-width:1150px) {
 ${A} .orr-armory-reading.orr-armory-reading { grid-template-rows:none !important; grid-auto-rows:max-content !important; align-content:start !important; }
 ${A} .orr-armory-reading__words { order:-1; }
}
/* …and on a short plate (960×540) the words close up so the purchase key sits above the fold. */
@media (min-width:761px) and (max-width:1150px) and (max-height:640px) {
 ${A} .orr-armory-reading.orr-armory-reading { padding-top:8px !important; }
 ${A} .orr-armory-reading__name { margin:4px 0 8px !important; }
 ${A} .orr-armory-reading__budget { margin:8px 0 !important; }
 ${A} .orr-armory-reading__buy { margin:8px 0 12px !important; }
}
/* Refit without the hull plan (narrow or short plates): a plain hardpoint list. Each row is a
   ruled block (numeral, name, slot tag and Empty spaced apart), its sentence wraps inside the row,
   and the stage opens at its first row instead of cutting it under the title. */
${R} > .sf-cru-stage:not(.orr-hull--on) { padding-top:6px !important; scroll-padding:28px 0; -webkit-mask-image:linear-gradient(to bottom, transparent 0, #000 22px, #000 calc(100% - 22px), transparent 100%); mask-image:linear-gradient(to bottom, transparent 0, #000 22px, #000 calc(100% - 22px), transparent 100%); }
${R} > .sf-cru-stage:not(.orr-hull--on) > .sf-cru-rows { display:flex !important; flex-direction:column; gap:0; margin:0 !important; }
${R} > .sf-cru-stage:not(.orr-hull--on) > .sf-cru-rows, ${R} > .sf-cru-stage:not(.orr-hull--on) .sf-cru-row { width:100% !important; max-width:100% !important; min-width:0 !important; box-sizing:border-box; }
${R} > .sf-cru-stage:not(.orr-hull--on) .sf-cru-row { display:grid !important; grid-template-columns:minmax(0,1fr) auto !important; align-items:start; column-gap:20px; padding:10px 0 12px !important; min-height:0 !important; border-bottom:1px solid rgb(${BONE} / .1); }
${R} > .sf-cru-stage:not(.orr-hull--on) .orr-hp__body { display:flex; flex-direction:column; gap:4px; min-width:0; }
${R} > .sf-cru-stage:not(.orr-hull--on) .orr-hp__head { display:flex; align-items:baseline; gap:12px; min-width:0; }
${R} > .sf-cru-stage:not(.orr-hull--on) .orr-hp__n { font-variant-numeric:tabular-nums; color:rgb(${BONE} / .6); min-width:2ch; }
${R} > .sf-cru-stage:not(.orr-hull--on) .k-row__name { display:flex; flex-wrap:wrap; align-items:baseline; gap:4px 12px; min-width:0; overflow:visible; white-space:normal; }
${R} > .sf-cru-stage:not(.orr-hull--on) .orr-hp__empty { color:rgb(${BONE} / .6); font-size:12px; letter-spacing:.08em; text-transform:uppercase; }
${R} > .sf-cru-stage:not(.orr-hull--on) .orr-hp__line { display:flex; flex-wrap:wrap; align-items:baseline; gap:6px 16px; min-width:0; }
${R} > .sf-cru-stage:not(.orr-hull--on) .orr-hp__contrast { margin:2px 0 0 !important; white-space:normal !important; overflow-wrap:anywhere; line-height:1.4; color:rgb(${BONE} / .72); max-width:min(72ch, 100%) !important; }
${R} > .sf-cru-stage:not(.orr-hull--on) .sf-cru-act { align-self:center; }
@media (max-width:760px) {
 ${D}, ${A} { display:flex !important; flex-direction:column !important; height:100dvh !important; padding:18px !important; gap:16px !important; overflow:auto !important; }
 ${D} > .k-title h1, ${A} > .k-title h1 { font-size:36px !important; }
 ${D} .orr-prep-nav { flex:none; gap:12px; flex-wrap:wrap; }
 ${D} .orr-prep-tabs { gap:20px; }
 ${D} .orr-prep-tab { font-size:14px; }
 ${D} .orr-prep-summary { display:none; }
 ${D} .orr-prep-nextstep { font-size:12px; margin-left:auto; }
 ${D} > .k-stage { height:auto !important; overflow:visible !important; flex:none !important; padding-right:0 !important; }
 ${D} .orr-door-hero { flex:none; height:400px !important; min-height:400px; }
 ${D} .orr-prep-ship { flex:none; height:auto !important; overflow:visible !important; padding:0; }
 ${D} .orr-prep-shipvisual { height:260px; }
 ${D} > .k-foot, ${A} > .k-foot { flex:none; width:100% !important; }
 ${D} .k-foot .k-words, ${A} .k-foot .k-words { gap:16px !important; justify-content:flex-start !important; flex-wrap:wrap !important; }
 ${D} .k-foot .orr-door-hint, ${A} .sf-cru-fine { text-align:left !important; }
 ${D} .sf-crd-hull { grid-template-columns:60px minmax(0,1fr) !important; min-height:92px !important; }
 ${D} .sf-crd-hull .fh-tile-legend { font-size:12px !important; }
 ${D} .orr-tile .fh-tile-legend { font-size:12px !important; }
 ${D} .orr-prep-stake-number { font-size:22px; }
 ${D} .orr-prep-stake-pressure { font-size:12px; }
 ${A} > .k-title :is(.sf-cru-sub,.sf-cru-preview,.sf-cru-cradle) { margin-right:0; max-width:100%; }
 ${A} .orr-armory-wallet { position:static; text-align:left; display:flex; align-items:baseline; gap:12px; margin-top:16px; }
 ${A} .orr-armory-wallet strong { font-size:30px; }
 ${A} > .sf-cru-stage { height:420px !important; flex:none !important; }
 ${A} .orr-armory-reading.orr-armory-reading { display:flex !important; flex-direction:column !important; height:auto !important; flex:none !important; padding:16px 0 !important; border-left:0; border-top:1px solid var(--dp-line); overflow:visible !important; }
 ${A} .orr-armory-reading[hidden] { display:none !important; }
 ${A} .orr-armory-visual { flex-direction:row; flex:none; width:100%; }
 ${A} .orr-armory-reading__words { width:100%; }
}
@media (forced-colors:active) {
 ${D} .orr-prep-tab[aria-selected=true], ${D} .orr-tile[aria-pressed=true], ${A} .sf-cru-card.is-lit { outline:2px solid Highlight !important; }
 ${D} .k-foot .orr-prep-continue, ${D} .k-foot .orr-key--hazard, ${A} .orr-armory-purchase { background:ButtonFace !important; color:ButtonText !important; border:1px solid ButtonText !important; clip-path:none; }
 ${A} .sf-cru-card.is-unavail { opacity:1 !important; }
 ${A} .sf-cru-card.is-unavail .sf-cru-name { color:GrayText !important; }
}
/* each preparation step names its one decision: the fight, then the ship, then the armory */
${D} .orr-prep-panelhead { margin:2px 0 18px !important; }
${D} .orr-prep-panelhead-step { font:700 15px/1.3 var(--dp-face-label) !important; letter-spacing:.06em !important; color:var(--dp-ink) !important; margin:0 !important; }
${D} .orr-prep-panelhead-line { font:400 13px/1.5 var(--dp-face-body,'Instrument Sans'),sans-serif !important; color:var(--dp-ink-dim) !important; margin:4px 0 0 !important; max-width:60ch !important; }
/* the shelf tells buyable from not at a glance: unavailable rows dim (still inspectable, still
   readable — the reason line names the unlock), fitted rows mark their price in the Hand */
${A} .sf-cru-card.is-unavail { opacity:.55 !important; }
${A} .sf-cru-card.is-unavail > .orr-equipment-glyph { opacity:.4 !important; }
${A} .sf-cru-card.is-unavail .sf-cru-afford { color:var(--dp-ink-dim) !important; }
${A} .sf-cru-card.is-lit.is-unavail { opacity:.75 !important; }
${A} .sf-cru-card.is-fitted .sf-cru-price { color:var(--dp-hand) !important; }
${A} .orr-armory-item > video { width:100%; height:100%; object-fit:contain; }

/* —— UI polish: Crucible door (scrim, contrast, 1080p lift) —— */
/* Bottom-left void scrim under hero copy + brief (void → transparent). */
${D} .orr-door-hero::after {
  content:''; position:absolute; pointer-events:none; z-index:1;
  left:0; bottom:0; width:100%; height:70%;
  background:
    linear-gradient(0deg, rgb(${VOID} / .97) 0%, rgb(${VOID} / .82) 28%, rgb(${VOID} / .35) 58%, transparent 82%),
    linear-gradient(90deg, rgb(${VOID} / .92) 0%, rgb(${VOID} / .55) 42%, transparent 78%);
}
${D} .orr-door-hero__words {
  background:linear-gradient(100deg, rgb(${VOID} / .9) 0%, rgb(${VOID} / .62) 55%, rgb(${VOID} / .15) 88%, transparent 100%) !important;
  padding:18px 36px 16px 18px !important; margin-left:-18px; border-radius:2px;
  box-shadow:0 0 40px 18px rgb(${VOID} / .35);
}
${D} .orr-prep-brief {
  background:linear-gradient(90deg, rgb(${VOID} / .94) 0%, rgb(${VOID} / .7) 50%, rgb(${VOID} / .2) 82%, transparent 100%) !important;
  padding:16px 28px 12px 18px !important; margin-left:-18px; border-radius:2px;
}
${D} .orr-door-hero__words::before, ${D} .orr-prep-brief::before { content:none !important; display:none !important; }
${D} .orr-prep-purse { color:rgb(${BONE} / .98); }
${D} .orr-prep-cadence { color:rgb(${BONE} / .82); }
${D} .orr-prep-panelhead-line { color:rgb(${BONE} / .8) !important; }
${D} :is(.sf-crd-mode-sub,.sf-crd-stake-sub,.sf-crd-arena-sub,.sf-crd-hull-sub) { color:rgb(${BONE} / .8) !important; }
${D} .k-row > .k-row__name { color:rgb(${BONE} / .72) !important; }
${D} .orr-tile .fh-tile-legend { color:rgb(${BONE} / .94) !important; }
${D} .orr-prep-nextstep { text-transform:uppercase !important; letter-spacing:.12em !important; }
/* 1080p band: composition lift without CSS zoom (Encounter chrome is denser than
   settings/codex — zoom:1.12 pushed BACK / Continue off-frame). Scale faces +
   padding to read at the same weight as the 1.12 stack. */
@media (min-width:1800px) and (max-width:2199px) and (min-height:1000px) {
  ${D} { padding:28px 52px 20px !important; gap:16px 44px !important; }
  ${D} > .k-title h1 { font-size:58px !important; }
  ${D} .sf-crd-sub { font-size:16px !important; }
  ${D} .orr-prep-tab, ${D} .orr-prep-nextstep { font-size:17px; }
  ${D} .orr-door-hero__name { font-size:clamp(30px,3.2vw,48px) !important; }
  ${D} .orr-door-hero__line { font-size:15px !important; }
  ${D} .orr-prep-purse { font-size:40px; }
  ${D} .k-foot .orr-prep-continue, ${D} .k-foot .orr-key--hazard { font-size:20px !important; min-height:52px !important; }
}

/* —— UI polish: Crucible Armory (foot rail, contrast, filters, 1080p lift) —— */
/* Foot: solid void + upward shadow + stronger top rule (matches door). Launch stays a word. */
${A} > .k-foot {
  z-index:6 !important; padding:14px 0 0 !important;
  border-top:1px solid rgb(${BONE} / .16) !important;
  background:rgb(${VOID}) !important;
  box-shadow:0 -10px 14px 0 rgb(${VOID} / .85) !important;
  isolation:isolate;
}
${A} .k-foot .k-words { position:relative; z-index:1; }
${A} .k-foot .k-word--primary {
  color:rgb(255 253 248) !important; font-weight:700 !important;
  text-shadow:0 0 18px rgb(0 0 0 / .55) !important; background:none !important;
}
${A} .k-foot .k-word--primary:is(:hover, :focus-visible) {
  color:var(--dp-hand-hot, #ffd98c) !important;
  text-shadow:0 0 22px rgb(242 185 80 / .5) !important;
}
${A} .k-foot .k-word:not(.k-word--primary) {
  color:rgb(${BONE} / .72) !important; font-weight:600 !important;
}
${A} .k-foot .k-word:not(.k-word--primary):is(:hover, :focus-visible) {
  color:rgb(${BONE} / .92) !important;
}
/* Keycaps — .sf-cru-kbd on Launch/Esc + nested kbd language; fine-print 1/2/3/Tab caps. */
${A} .k-foot .sf-cru-kbd,
${A} .sf-cru-fine .orr-armory-keycap {
  display:inline-block !important; box-sizing:border-box !important;
  margin-left:12px !important; margin-right:0 !important;
  padding:3px 7px 4px !important; min-width:0 !important; height:auto !important;
  font:600 11px var(--dp-face-label) !important; letter-spacing:.2em !important;
  line-height:1 !important; text-transform:uppercase !important;
  color:rgb(${BONE} / .9) !important; background:rgb(${BONE} / .1) !important;
  border:1px solid rgb(${BONE} / .5) !important; border-radius:3px !important;
  box-shadow:inset 0 -1px 0 rgb(0 0 0 / .35) !important; vertical-align:baseline !important;
  opacity:1 !important; text-shadow:none !important;
}
${A} .sf-cru-fine .orr-armory-keycap { margin-left:0 !important; margin-right:4px !important; }
${A} .sf-cru-fine { color:rgb(${BONE} / .78) !important; position:relative; z-index:1; }
${A} .orr-armory-hintword { color:rgb(${BONE} / .78) !important; }

/* Secondary contrast — bone alphas where washed --dp-ink-dim was the problem. */
${A} > .k-title .sf-cru-sub { color:rgb(${BONE} / .86) !important; }
${A} > .k-title .sf-cru-preview { color:rgb(${BONE} / .82) !important; margin:6px 0 0; font:400 13px/1.45 var(--dp-face-body,'Instrument Sans'),sans-serif !important; }
${A} > .k-title .sf-cru-cradle { color:rgb(${BONE} / .8) !important; margin:4px 0 0; font:400 12.5px/1.4 var(--dp-face-body,'Instrument Sans'),sans-serif !important; }
/* Right gutter for the wallet only where there's room; phones keep full text width. */
@media (min-width:761px) { ${A} > .k-title :is(.sf-cru-preview,.sf-cru-cradle) { margin-right:200px; } }
${A} .orr-armory-wallet span { color:rgb(${BONE} / .8) !important; }
${A} .sf-cru-filters > button { color:rgb(${BONE} / .82) !important; }
${A} .sf-cru-filters > button[aria-pressed=true] {
  color:rgb(${BONE} / .98) !important; border-bottom:2px solid var(--dp-hand) !important;
  box-shadow:0 1px 0 0 rgb(242 185 80 / .35);
}
${A} .sf-cru-count { opacity:1 !important; color:rgb(${BONE} / .72) !important; }
${A} .sf-cru-card.sf-cru-card { position:relative !important; }
${A} .sf-cru-card .sf-cru-name { color:rgb(${BONE} / .9) !important; }
${A} .sf-cru-card .sf-cru-verb { color:rgb(${BONE} / .78) !important; }
${A} .sf-cru-card .sf-cru-price { color:rgb(${BONE} / .82) !important; }
${A} .sf-cru-card.is-lit {
  background:linear-gradient(90deg,rgb(242 185 80 / .16),rgb(242 185 80 / .04) 48%,transparent 78%) !important;
}
${A} .sf-cru-card.is-lit .sf-cru-name { color:rgb(255 253 248) !important; }
${A} .sf-cru-card.is-lit::before {
  content:'' !important; display:block !important; position:absolute !important;
  left:0 !important; top:14px !important; bottom:14px !important; width:2px !important;
  height:auto !important; transform:none !important; clip-path:none !important;
  background:var(--dp-hand) !important; box-shadow:0 0 8px rgb(242 185 80 / .35) !important;
}
${A} .orr-crew-item-label, ${A} .orr-crew-names, ${A} .orr-crew-status { color:rgb(${BONE} / .8) !important; }
${A} .orr-armory-object-label { color:rgb(${BONE} / .78) !important; }
${A} .orr-armory-reading__verb { color:rgb(${BONE} / .78) !important; }
${A} .orr-armory-reading__act { color:rgb(${BONE} / .82) !important; }
${A} .orr-armory-build { color:rgb(${BONE} / .8) !important; }
${A} .orr-armory-build li small { color:rgb(${BONE} / .78) !important; }
${A} .orr-armory-refusal { color:rgb(${BONE} / .78) !important; }
${A} .orr-rail-divider { color:rgb(${BONE} / .72) !important; }
${A} .orr-armory-empty { color:rgb(${BONE} / .8) !important; }
${A} .orr-armory-reading__demo-word, ${A} .orr-armory-reading__hold-word { color:rgb(${BONE} / .78) !important; }

/* Filters + search chrome */
${A} .sf-cru-search {
  border-bottom:1px solid rgb(${BONE} / .28) !important;
  color:rgb(${BONE} / .96) !important;
}
${A} .sf-cru-search::placeholder { color:rgb(${BONE} / .62) !important; opacity:1 !important; }
${A} .sf-cru-wallet { color:rgb(${BONE} / .8) !important; }
${A} .orr-armory-reading__blurb { color:rgb(${BONE} / .92) !important; }
${A} .orr-armory-fitline { color:rgb(${BONE} / .9) !important; }
${A} .sf-cru-note { color:rgb(${BONE} / .88) !important; }

/* 1080p lift — type/spacing without CSS zoom (door learned zoom clips the foot). */
@media (min-width:1800px) and (max-width:2199px) and (min-height:1000px) {
  ${A} { padding:28px 52px 20px !important; gap:22px 42px !important; }
  ${A} > .k-title h1 { font-size:52px !important; }
  ${A} > .k-title .sf-cru-sub { font-size:15px !important; }
  ${A} .orr-armory-wallet strong { font-size:44px; }
  ${A} .sf-cru-card.sf-cru-card { min-height:96px !important; padding:14px 4px 14px 14px !important; }
  ${A} .sf-cru-card .sf-cru-name { font-size:17px !important; }
  ${A} .orr-armory-purchase { min-height:54px; font-size:17px; }
  ${A} .orr-armory-reading__name { font-size:clamp(26px,2.5vw,40px) !important; }
  ${A} .k-foot .k-word { font-size:17px !important; }
}

/* —— UI polish: Crucible Refit (foot rail, keycaps, contrast, lit spare, 1080p lift) —— */
/* Foot: solid void + upward shadow + stronger top rule (matches door/armory). Continue stays a word. */
${R} > .k-foot {
  z-index:6 !important; padding:16px 0 10px !important;
  border-top:1px solid rgb(${BONE} / .18) !important;
  background:rgb(${VOID}) !important;
  box-shadow:0 -10px 14px 0 rgb(${VOID} / .85) !important;
  isolation:isolate;
}
${R} .k-foot .k-words { position:relative; z-index:1; }
${R} .k-foot .k-word:not(.k-word--primary):not(.is-lamp) {
  color:rgb(${BONE} / .88) !important; font-weight:600 !important;
}
${R} .k-foot .k-word:not(.k-word--primary):not(.is-lamp):is(:hover, :focus-visible) {
  color:rgb(${BONE} / .98) !important;
}
${R} .k-foot .k-word.k-word--primary:not(.is-lamp) {
  color:rgb(255 253 248) !important; font-weight:700 !important;
  text-shadow:0 0 18px rgb(0 0 0 / .55) !important; background:none !important; background-image:none !important;
}
${R} .k-foot .k-word.k-word--primary:not(.is-lamp):is(:hover, :focus-visible) {
  color:var(--dp-hand-hot, #ffd98c) !important;
  text-shadow:0 0 22px rgb(242 185 80 / .5) !important;
}
${R} .k-foot .sf-cru-fine, ${R} .k-foot .sf-cru-keynote {
  color:rgb(${BONE} / .86) !important; position:relative; z-index:1; max-width:42ch;
}
${R} .k-foot .k-word--primary.is-lamp .sf-cru-kbd {
  color:rgb(${BONE} / .92) !important; border-color:rgb(${BONE} / .55) !important;
}
/* Keycaps — .sf-cru-kbd on foot verbs + Enter on lit FIT (override bare-hint strip in screenLayouts). */
${R} .k-foot .sf-cru-kbd {
  display:inline-block !important; box-sizing:border-box !important;
  margin-left:12px !important; margin-right:0 !important;
  padding:3px 7px 4px !important; min-width:0 !important; height:auto !important;
  font:600 11px var(--dp-face-label) !important; letter-spacing:.2em !important;
  line-height:1 !important; text-transform:uppercase !important;
  color:rgb(${BONE} / .9) !important; background:rgb(${BONE} / .1) !important;
  border:1px solid rgb(${BONE} / .5) !important; border-radius:3px !important;
  box-shadow:inset 0 -1px 0 rgb(0 0 0 / .35) !important; vertical-align:baseline !important;
  opacity:1 !important; text-shadow:none !important; place-items:unset !important;
}
${R} > .sf-cru-stage.orr-hull--on .sf-cru-row.is-lit .sf-cru-act:not(:disabled)::after {
  display:inline-block !important; box-sizing:border-box !important;
  margin-left:10px !important; padding:3px 7px 4px !important; min-width:0 !important;
  width:auto !important; height:auto !important;
  font:600 11px var(--dp-face-label) !important; letter-spacing:.2em !important;
  line-height:1 !important; text-transform:uppercase !important;
  color:rgb(${BONE} / .9) !important; background:rgb(${BONE} / .1) !important;
  border:1px solid rgb(${BONE} / .5) !important; border-radius:3px !important;
  box-shadow:inset 0 -1px 0 rgb(0 0 0 / .35) !important; vertical-align:baseline !important;
  place-items:unset !important;
}

/* Secondary contrast — bone alphas on sub, slot tags, bare values, contrast, spares, fit count. */
${R} > .k-title .sf-cru-sub { color:rgb(${BONE} / .86) !important; }
${R} > .k-title .sf-cru-preview { color:rgb(${BONE} / .82) !important; }
${R} > .sf-cru-stage.orr-hull--on .sf-cru-row { color:rgb(${BONE} / .84) !important; }
${R} > .sf-cru-stage.orr-hull--on .orr-hp__n { color:rgb(${BONE} / .72) !important; }
${R} > .sf-cru-stage.orr-hull--on .sf-cru-slottag { color:rgb(${BONE} / .78) !important; }
${R} > .sf-cru-stage.orr-hull--on .is-bare .orr-hp__value { color:rgb(${BONE} / .8) !important; }
${R} > .sf-cru-stage.orr-hull--on .orr-hp__contrast { color:rgb(${BONE} / .78) !important; }
${R} > .sf-cru-stage.orr-hull--on .orr-hp__spare { color:rgb(${BONE} / .72) !important; }
${R} > .sf-cru-stage.orr-hull--on .orr-hp__spare-stat { color:rgb(${BONE} / .78) !important; }
${R} > .sf-cru-stage.orr-hull--on .orr-hp__empty { color:rgb(${BONE} / .78) !important; }
${R} > .sf-cru-stage.orr-hull--on .is-open .orr-hp__spare { color:rgb(${BONE} / .78) !important; }
${R} > .sf-cru-stage.orr-hull--on .is-open .orr-hp__spare-name::before { color:rgb(${BONE} / .72) !important; }
${R} > .sf-cru-stage.orr-hull--on .orr-hull-fitcount { color:rgb(${BONE} / .84) !important; }
${R} > .sf-cru-stage.orr-hull--on .orr-hp__scales .orr-hp__scale-word { fill:rgb(${BONE} / .8) !important; }
${R} > .sf-cru-stage.orr-hull--on .orr-hp__scales .orr-hp__scale-max { fill:rgb(${BONE} / .7) !important; }

/* Selected / focus Hand underline on spares — 2px + soft glow (matches armory filters). */
${R} > .sf-cru-stage.orr-hull--on .orr-hp__spare::after {
  height:2px !important; background:rgb(${BONE} / .85) !important;
}
${R} > .sf-cru-stage.orr-hull--on .orr-hp__spare[aria-checked="true"] {
  color:rgb(255 253 248) !important;
}
${R} > .sf-cru-stage.orr-hull--on .orr-hp__spare[aria-checked="true"]::after {
  background:var(--dp-hand, #f2b950) !important;
  box-shadow:0 0 8px rgb(242 185 80 / .45) !important;
}
${R} > .sf-cru-stage.orr-hull--on .orr-hp__spare:focus-visible::after {
  height:2px !important; background:var(--dp-hand, #f2b950) !important;
  box-shadow:0 0 8px rgb(242 185 80 / .5) !important;
}
${R} > .sf-cru-stage.orr-hull--on .is-open .orr-hp__spare[aria-checked="true"] {
  color:rgb(${BONE} / .96) !important;
}
${R} > .sf-cru-stage.orr-hull--on .is-open .orr-hp__spare::after {
  height:2px !important;
  background:repeating-linear-gradient(90deg, var(--dp-hand, #f2b950) 0 4px, transparent 4px 7px) !important;
  box-shadow:0 0 6px rgb(242 185 80 / .3) !important;
}
${R} > .sf-cru-stage.orr-hull--on .sf-cru-row.is-lit .sf-cru-slottag { color:rgb(${BONE} / .92) !important; }

/* Short plates: keep the void rail, but don't bury the fit count under a tall foot. */
@media (max-height:820px) {
  ${R} > .k-foot { padding:8px 0 4px !important; box-shadow:0 -8px 12px 0 rgb(${VOID} / .85) !important; }
  ${R} > .sf-cru-stage.orr-hull--on .orr-hull-fitcount { bottom:178px !important; }
}

/* 1080p lift — type/spacing without CSS zoom (door/armory lesson: zoom clips the foot). */
@media (min-width:1800px) and (max-width:2199px) and (min-height:1000px) {
  ${R} > .k-title .k-t-title { font-size:clamp(38px, 4.8vh, 56px) !important; }
  ${R} > .k-title .sf-cru-sub { font-size:15px !important; max-width:48ch; }
  ${R} > .sf-cru-stage.orr-hull--on .orr-hp__n { font-size:23px !important; }
  ${R} > .sf-cru-stage.orr-hull--on .orr-hp__value { font-size:18px !important; }
  ${R} > .sf-cru-stage.orr-hull--on .orr-hp__spare-name { font-size:16px !important; }
  ${R} > .sf-cru-stage.orr-hull--on .sf-cru-slottag { font-size:13px !important; }
  ${R} > .sf-cru-stage.orr-hull--on .orr-hp__contrast { font-size:13px !important; }
  ${R} .k-foot .k-word { font-size:17px !important; }
  ${R} > .sf-cru-stage.orr-hull--on .orr-hull-fitcount { font-size:13px !important; bottom:172px; }
  ${R} > .k-foot { padding:18px 0 12px !important; }
}

/* Short desktop armory (≥761 wide, ≤500 tall: 844×390, 900×420, 1024×440, 1280×480). The tall
   title and the two-row foot left the catalog and the reading a ~24px row, so the filters, the
   offers and the purchase key printed off the frame. The title closes to three lines (cradle and
   preview share one), the foot to one row, the search joins the filters' second row where it
   fits, and the reading's words lead so the purchase key sits above the fold. Selectors, IDs and
   the catalog are unchanged. */
@media (min-width:761px) and (max-height:500px) {
  ${A} { grid-template-columns:minmax(0,1fr) minmax(0,1fr) !important; gap:10px 24px !important; padding:14px 24px 8px !important; }
  ${A} > .k-title h1 { font-size:30px !important; }
  ${A} > .k-title .sf-cru-sub { font-size:13px !important; margin-top:4px !important; }
  ${A} > .k-title { display:grid !important; grid-template-columns:auto minmax(0,1fr); column-gap:20px; align-items:baseline; }
  ${A} > .k-title > :is(h1,.sf-cru-sub) { grid-column:1 / -1; }
  ${A} > .k-title :is(.sf-cru-preview,.sf-cru-cradle) { margin:4px 0 0 !important; font-size:12px !important; line-height:1.4 !important; white-space:nowrap; overflow:hidden; text-overflow:ellipsis; }
  ${A} > .k-title .sf-cru-cradle { grid-column:1; grid-row:3; }
  ${A} > .k-title .sf-cru-preview { grid-column:2; grid-row:3; }
  ${A} .orr-armory-wallet strong { font-size:30px; }
  ${A} .orr-armory-wallet span { margin-top:4px; }
  ${A} .sf-cru-filters { gap:2px 10px !important; padding:0 0 6px !important; align-items:center !important; }
  ${A} .sf-cru-filters > button { min-height:32px !important; padding:6px 0 !important; }
  ${A} .sf-cru-search { order:0 !important; flex:1 1 150px !important; width:auto !important; min-width:150px !important; min-height:32px !important; margin:0 !important; padding:6px 10px !important; font-size:13px !important; }
  ${A} .sf-cru-stage > .sf-cru-cards { padding-bottom:8px !important; }
  ${A} .sf-cru-card.sf-cru-card { min-height:60px !important; padding:8px 4px 8px 10px !important; grid-template-columns:40px minmax(0,1fr) auto !important; }
  ${A} .sf-cru-card > .orr-equipment-glyph { width:38px; height:38px; }
  ${A} .sf-cru-card .sf-cru-name { font-size:14px !important; }
  ${A} .orr-rail-divider { margin:8px 0 2px 10px !important; }
  ${A} .orr-armory-reading.orr-armory-reading { grid-template-columns:minmax(0,1fr) !important; grid-template-rows:none !important; grid-auto-rows:max-content !important; align-content:start !important; padding:4px 2px 8px 16px !important; }
  ${A} .orr-armory-reading__words { order:-1; }
  ${A} .orr-armory-reading__name { font-size:22px !important; margin:4px 0 6px !important; }
  ${A} .orr-armory-reading__blurb { font-size:13px !important; line-height:1.4 !important; }
  ${A} .orr-armory-fitline { margin:0 0 6px; }
  ${A} .orr-armory-reading__compare { margin:6px 0 !important; }
  ${A} .orr-armory-reading__budget { margin:6px 0 !important; }
  ${A} .orr-armory-reading__buy { margin:6px 0 8px !important; }
  ${A} .orr-armory-purchase { min-height:40px; padding:9px 14px; font-size:14px; }
  ${A} > .k-foot { padding:6px 0 0 !important; flex-wrap:nowrap !important; align-items:center !important; gap:16px !important; }
  ${A} .k-foot .k-words { flex-wrap:nowrap !important; gap:20px !important; flex:0 1 auto !important; min-width:0; }
  ${A} .k-foot .k-word { font-size:14px !important; min-height:36px !important; white-space:nowrap; }
  ${A} .k-foot .sf-cru-kbd { margin-left:8px !important; }
  ${A} .sf-cru-fine { margin:0 0 0 auto !important; flex:0 1 auto; }
  ${A} .sf-cru-fine .sf-cru-hint { margin-left:0; }
  /* review: the next-round line ran to one ellipsized line and lost its tail ("… Choir Ze…", "new: Choir
     Zealot"); it takes two lines before it clips. */
  ${A} > .k-title .sf-cru-preview { white-space:normal; display:-webkit-box !important; -webkit-box-orient:vertical; -webkit-line-clamp:2; line-clamp:2; }
  /* review: the keycaps (ESC, 1 2 3, TAB) were 11px; 12px in this band. */
  ${A} .k-foot .sf-cru-kbd, ${A} .sf-cru-fine .orr-armory-keycap { font-size:12px !important; letter-spacing:.12em !important; }
}
/* review: under ~800 wide the one-row foot is wider than the frame, and its right-packed verbs
   pushed LAUNCH ROUND off the left edge (761×500). There the key hints take a second row. */
@media (min-width:761px) and (max-width:820px) and (max-height:500px) {
  ${A} > .k-foot { flex-wrap:wrap !important; row-gap:0 !important; }
  ${A} .k-foot .k-words { justify-content:flex-start !important; }
  /* the second foot row costs the height the two-line preview needs, so here it stays one line (PURCHASE stays on-frame) */
  ${A} > .k-title .sf-cru-preview { display:block !important; white-space:nowrap; -webkit-line-clamp:unset; line-clamp:none; }
}
`;
export function injectCruciblePreparation(doc = globalThis.document) {
  if (!doc?.head || doc.getElementById('orr-crucible-preparation-style')) return;
  injectOrrery(doc);
  const style = doc.createElement('style'); style.id = 'orr-crucible-preparation-style';
  style.textContent = CSS; doc.head.appendChild(style);
}
