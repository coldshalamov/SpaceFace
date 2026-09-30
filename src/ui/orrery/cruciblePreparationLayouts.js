// One composition sheet for the Crucible preparation family. Materials and typography inherit
// Deckplate/ORRERY; no new token root, runtime filter, full-screen canvas or animation loop.
import { injectOrrery } from './tokens.js';
const D = 'html body #screens > .k-screen.orr-crucible.sf-crucible-door.orr-preparation[data-prep-step]';
const A = 'html body #screens > .k-screen.orr-crucible.sf-crucible-draft.orr-armory.orr-visual-armory';
const CSS = `
.orr-equipment-glyph { display:block; width:48px; height:48px; flex:none; color:var(--dp-ink); pointer-events:none; }
${D} { display:grid !important; grid-template-columns:minmax(0,1fr) minmax(0,1fr) !important; grid-template-rows:auto auto minmax(0,1fr) auto !important; gap:18px 40px !important; padding:30px 48px 22px !important; width:100% !important; height:100dvh !important; max-width:none !important; max-height:none !important; margin:0 !important; overflow:hidden !important; }
${D} > .k-title { grid-column:1 / -1 !important; grid-row:1 !important; margin:0 !important; padding:0 !important; }
${D} > .k-title h1 { font-size:54px !important; line-height:1 !important; letter-spacing:-.025em !important; }
${D} .sf-crd-sub { font-family:var(--dp-face-body, 'Instrument Sans'),sans-serif !important; text-transform:none !important; letter-spacing:0 !important; font-size:15px !important; line-height:1.5 !important; margin:6px 0 0 !important; color:var(--dp-ink-dim) !important; }
${D} .orr-prep-nav { grid-column:1 / -1; grid-row:2; display:flex; align-items:center; gap:30px; border-bottom:1px solid var(--dp-line); min-width:0; }
${D} .orr-prep-tabs { display:flex; gap:28px; }
${D} .orr-prep-tab { display:flex; gap:10px; align-items:center; border:0; border-radius:0; background:none; color:var(--dp-ink-dim); font:600 16px var(--dp-face-label); padding:14px 0; min-height:48px; cursor:pointer; position:relative; }
${D} .orr-prep-tab::after { content:''; position:absolute; left:0; bottom:-1px; height:2px; width:100%; background:var(--dp-hand); opacity:0; }
${D} .orr-prep-tab[aria-selected=true] { color:var(--dp-ink); }
${D} .orr-prep-tab[aria-selected=true]::after { opacity:1; }
${D} .orr-prep-step { font-size:12px; font-variant-numeric:tabular-nums; color:var(--dp-ink-dim); }
${D} .orr-prep-tab[aria-selected=true] .orr-prep-step { color:var(--dp-hand); }
${D} .orr-prep-nextstep { color:var(--dp-ink-dim); font-size:13px; }
${D} .orr-prep-summary { margin-left:auto; color:var(--dp-ink-dim); font-size:13px; text-align:right; }
${D} > .k-stage { grid-column:1 !important; grid-row:3 !important; position:relative !important; inset:auto !important; width:100% !important; max-width:none !important; min-height:0 !important; height:100% !important; padding:0 12px 0 0 !important; margin:0 !important; overflow:auto !important; mask-image:none !important; }
${D} > .k-stage::before { display:none !important; }
${D} .orr-prep-panel { padding:4px 0 12px; }
${D} .orr-prep-settings { display:flex !important; flex-direction:column !important; gap:22px !important; padding:0 !important; margin:0 !important; }
${D} .orr-prep-settings > .k-row { display:block !important; margin:0 !important; padding:0 !important; min-width:0; }
${D} .k-row > .k-row__name { display:block !important; font:600 11px var(--dp-face-label) !important; letter-spacing:.12em !important; color:var(--dp-ink-dim) !important; margin-bottom:10px !important; }
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
${D} .orr-door-hero { isolation:isolate; }
${D} .orr-door-hero__art { inset:0 !important; width:100% !important; height:100% !important; object-fit:cover !important; object-position:center !important; mask-image:linear-gradient(0deg,transparent, black 40%,black 92%, transparent) !important; }
${D} .orr-door-hero__words { position:absolute !important; left:24px !important; right:24px !important; bottom:138px !important; text-align:left !important; max-width:none !important; }
${D} .orr-door-hero__name { font:800 clamp(26px,3vw,44px)/1.03 var(--dp-face-display,'Archivo') !important; letter-spacing:-.02em !important; }
${D} .orr-door-hero__line { max-width:40ch !important; margin-top:12px !important; font:400 14px/1.5 var(--dp-face-body,'Instrument Sans'),sans-serif !important; color:var(--dp-ink-dim) !important; }
${D} .orr-prep-brief { position:absolute; bottom:10px; left:24px; right:24px; border-top:1px solid var(--dp-line); padding-top:16px; }
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
${D} .orr-prep-fitting small { display:block; color:var(--dp-ink-dim); font:500 10px/1.4 var(--dp-face-label); text-transform:uppercase; }
${D} .orr-prep-fitting strong { font:500 13px/1.3 var(--dp-face-body,'Instrument Sans'),sans-serif; display:block; overflow-wrap:anywhere; }
${D} .orr-prep-fitting[aria-pressed=true] { border-bottom-color:var(--dp-hand); }
${D} .orr-prep-fitting.is-empty .orr-equipment-glyph { opacity:.35; }
${D} > .k-foot { grid-column:1 / -1 !important; grid-row:4 !important; display:block !important; position:relative !important; inset:auto !important; width:auto !important; margin:0 !important; padding:14px 0 0 !important; border-top:1px solid var(--dp-line-faint); }
${D} .k-foot .k-words { display:flex !important; justify-content:flex-end; align-items:center; gap:26px !important; padding:0 !important; flex-wrap:wrap; }
${D} .k-foot .sf-back { font-size:14px !important; }
${D} .k-foot .orr-prep-continue, ${D} .k-foot .orr-key--hazard { font:650 19px var(--dp-face-label) !important; min-height:48px !important; min-width:240px !important; text-align:center !important; padding:10px 24px !important; letter-spacing:0 !important; color:var(--dp-void) !important; background:var(--dp-hand) !important; clip-path:polygon(0 0,calc(100% - 12px) 0,100% 12px,100% 100%,0 100%); }
${D} .k-foot .orr-door-hint { text-align:right; font:400 12px/1.45 var(--dp-face-body,'Instrument Sans'),sans-serif !important; letter-spacing:0 !important; margin:9px 0 0 !important; }
${D} :is(button,summary,input):focus-visible, ${A} :is(button,input,summary):focus-visible { outline:2px solid var(--dp-hand-hot) !important; outline-offset:3px !important; }
/* The armory's three planes: catalog, object/ship, transaction. */
${A} { display:grid !important; grid-template-columns:minmax(320px,.9fr) minmax(0,1.55fr) !important; grid-template-rows:auto minmax(0,1fr) auto !important; gap:24px 38px !important; padding:30px 48px 22px !important; width:100% !important; height:100dvh !important; max-width:none !important; max-height:none !important; margin:0 !important; overflow:hidden !important; }
${A} > .k-title { grid-column:1 / -1 !important; grid-row:1; padding:0 !important; margin:0 !important; position:relative; }
${A} > .k-title h1 { font:800 44px/1 var(--dp-face-display,'Archivo') !important; letter-spacing:-.02em !important; }
${A} > .k-title .sf-cru-sub { font-size:14px !important; margin:10px 200px 0 0; color:var(--dp-ink-dim) !important; }
${A} .orr-armory-wallet { position:absolute; right:0; top:0; text-align:right; }
${A} .orr-armory-wallet strong { display:block; font:300 40px/1 var(--dp-face-numeral); font-variant-numeric:tabular-nums; }
${A} .orr-armory-wallet span { display:block; font:500 11px/1.4 var(--dp-face-label); letter-spacing:.08em; text-transform:uppercase; color:var(--dp-ink-dim); margin-top:6px; }
${A} > .sf-cru-stage { grid-column:1 !important; grid-row:2 !important; display:flex !important; flex-direction:column !important; position:relative !important; inset:auto !important; max-width:none !important; width:100% !important; height:100% !important; min-height:0 !important; padding:0 !important; margin:0 !important; overflow:hidden !important; }
${A} .sf-cru-filters { display:flex !important; flex-wrap:wrap !important; gap:4px 14px !important; padding:0 0 12px !important; margin:0 !important; flex:none !important; }
${A} .sf-cru-filters > button { padding:8px 0 !important; font:500 12px var(--dp-face-label) !important; min-height:36px !important; letter-spacing:0 !important; color:var(--dp-ink-dim) !important; }
${A} .sf-cru-filters > button[aria-pressed=true] { color:var(--dp-ink) !important; border-bottom:1px solid var(--dp-hand) !important; }
${A} .sf-cru-count { margin-left:5px; font-size:10px; opacity:.7; }
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
${A} .orr-rail-divider { font:500 10px/1.4 var(--dp-face-label) !important; letter-spacing:.12em; color:var(--dp-ink-dim) !important; margin:14px 0 4px 12px !important; }
${A} .orr-armory-reading.orr-armory-reading { pointer-events:auto !important; grid-column:2 !important; grid-row:2 !important; position:relative !important; inset:auto !important; width:100% !important; height:100% !important; min-width:0 !important; min-height:0 !important; display:grid !important; grid-template-columns:minmax(180px,.9fr) minmax(0,1.1fr) !important; grid-template-rows:minmax(0,1fr) !important; gap:24px !important; overflow:auto !important; padding:14px 2px 14px 16px !important; border-left:1px solid var(--dp-line-faint); }
${A} .orr-armory-reading[hidden] { display:none !important; }
${A} .orr-armory-visual { display:flex; flex-direction:column; width:100%; min-width:0; gap:16px; }
${A} .orr-armory-item { position:relative; display:grid; place-items:center; min-height:210px; height:250px; flex:none; }
${A} .orr-armory-item::before { content:''; position:absolute; inset:16px; border-radius:50%; border:1px solid var(--dp-line); pointer-events:none; }
${A} .orr-armory-item > .orr-equipment-glyph { width:180px; height:180px; color:var(--dp-ink); }
${A} .orr-armory-item > img { width:100%; height:100%; object-fit:contain; }
${A} .orr-armory-object-label { text-align:center; margin:0; font:500 10px/1.5 var(--dp-face-label); color:var(--dp-ink-dim); letter-spacing:.1em; text-transform:uppercase; }
${A} .orr-armory-reading__jig { width:100% !important; height:230px !important; aspect-ratio:auto !important; min-height:180px; }
${A} .orr-armory-fitline { font:400 13px/1.45 var(--dp-face-body,'Instrument Sans'),sans-serif; color:var(--dp-ink); margin:0 0 12px; }
${A} .orr-armory-reading__words { padding:0 !important; min-width:0; }
${A} .orr-armory-reading__verb { font:600 11px/1.4 var(--dp-face-label) !important; color:var(--dp-ink-dim) !important; letter-spacing:.1em !important; }
${A} .orr-armory-reading__name { font:800 clamp(24px,2.4vw,36px)/1.06 var(--dp-face-display,'Archivo') !important; letter-spacing:-.02em !important; overflow-wrap:anywhere; margin:10px 0 16px !important; }
${A} .orr-armory-reading__blurb { font:400 15px/1.5 var(--dp-face-body,'Instrument Sans'),sans-serif !important; color:var(--dp-ink) !important; max-width:none !important; }
${A} .orr-armory-reading__act { font:400 13px/1.5 var(--dp-face-body,'Instrument Sans'),sans-serif !important; color:var(--dp-ink-dim) !important; }
${A} .orr-armory-reading__compare { margin:14px 0 !important; }
${A} .orr-armory-reading__budget { margin:20px 0 !important; }
${A} .orr-armory-reading__buy { margin:18px 0 12px !important; }
${A} .orr-armory-purchase { display:block; width:100%; min-height:50px; padding:12px 16px; background:var(--dp-hand); color:var(--dp-void); border:0; border-radius:0; font:650 16px/1.25 var(--dp-face-label); cursor:pointer; clip-path:polygon(0 0,calc(100% - 10px) 0,100% 10px,100% 100%,0 100%); }
${A} .orr-armory-purchase:disabled { background:var(--dp-line); color:var(--dp-ink-dim); cursor:default; }
${A} .orr-armory-refusal { margin:8px 0 0; font:400 13px/1.45 var(--dp-face-body,'Instrument Sans'),sans-serif; color:var(--dp-ink-dim); }
${A} .orr-armory-reading__demo-word { font:500 13px var(--dp-face-label) !important; min-height:40px; padding:8px 0; color:var(--dp-ink-dim) !important; border:0; border-bottom:1px solid var(--dp-line); background:none; cursor:pointer; }
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
${D} .orr-door-hero__words, ${D} .orr-prep-brief { z-index:2; }
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
${D} .orr-prep-locknote { grid-column:2; grid-row:3; font:400 10px/1.4 var(--dp-face-body,'Instrument Sans'),sans-serif; color:var(--dp-ink-dim); text-transform:none; letter-spacing:0; }
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
${A} .orr-armory-build li small { display:block; font-size:10px; color:var(--dp-ink-dim); }
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
${D} .orr-prep-stake-pressure { margin-top:3px; font:400 10.5px/1.3 var(--dp-face-label); letter-spacing:.1em; text-transform:uppercase; }
/* arena: one strip of five; the words carry the choice, the hero carries the rooms */
${D} .sf-crd-arenas .orr-tile { min-height:66px !important; padding:6px 4px 8px !important; }
${D} .sf-crd-arenas .fh-tile-art { height:34px !important; }
${D} .sf-crd-arenas .fh-tile-art img { width:88% !important; height:40px !important; object-fit:cover !important; }
${D} .sf-crd-arenas .fh-tile-legend { font-size:10px !important; letter-spacing:.08em !important; white-space:nowrap; overflow:hidden; text-overflow:ellipsis; max-width:100%; }
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
${D} .orr-prep-hullsub { font:400 11px/1.3 var(--dp-face-label); letter-spacing:.14em; text-transform:uppercase; color:var(--dp-ink-dim); align-self:start; }
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
 ${D} .orr-prep-settings { gap:14px !important; }
 ${D} .sf-crd-modes .orr-tile { min-height:92px !important; padding:10px 8px 8px !important; }
 ${D} .sf-crd-modes .fh-tile-art, ${D} .sf-crd-modes .fh-tile-art svg { height:44px !important; }
 ${D} .sf-crd-modes .fh-tile-art svg { width:44px !important; }
 ${D} .sf-crd-stakes .orr-tile { min-height:80px !important; }
 ${D} .orr-prep-stake-number { font-size:24px !important; }
 ${D} .sf-crd-arenas .orr-tile { min-height:56px !important; padding:4px 4px 6px !important; }
 ${D} .sf-crd-arenas .fh-tile-art img { height:32px !important; }
 ${D} :is(.sf-crd-mode-sub,.sf-crd-stake-sub,.sf-crd-arena-sub,.sf-crd-hull-sub) { margin-top:6px !important; }
 ${D} .orr-prep-disclosure { padding:8px 0; }
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
@media (max-width:760px) {
 ${D}, ${A} { display:flex !important; flex-direction:column !important; height:100dvh !important; padding:18px !important; gap:16px !important; overflow:auto !important; }
 ${D} > .k-title h1, ${A} > .k-title h1 { font-size:36px !important; }
 ${D} .orr-prep-nav { flex:none; gap:12px; flex-wrap:wrap; }
 ${D} .orr-prep-tabs { gap:20px; }
 ${D} .orr-prep-tab { font-size:14px; }
 ${D} .orr-prep-summary { display:none; }
 ${D} .orr-prep-nextstep { font-size:11px; margin-left:auto; }
 ${D} > .k-stage { height:auto !important; overflow:visible !important; flex:none !important; padding-right:0 !important; }
 ${D} .orr-door-hero { flex:none; height:400px !important; min-height:400px; }
 ${D} .orr-prep-ship { flex:none; height:auto !important; overflow:visible !important; padding:0; }
 ${D} .orr-prep-shipvisual { height:260px; }
 ${D} > .k-foot, ${A} > .k-foot { flex:none; width:100% !important; }
 ${D} .k-foot .k-words, ${A} .k-foot .k-words { gap:16px !important; justify-content:flex-start !important; flex-wrap:wrap !important; }
 ${D} .k-foot .orr-door-hint, ${A} .sf-cru-fine { text-align:left !important; }
 ${D} .sf-crd-hull { grid-template-columns:60px minmax(0,1fr) !important; min-height:92px !important; }
 ${D} .sf-crd-hull .fh-tile-legend { font-size:11px !important; }
 ${D} .orr-tile .fh-tile-legend { font-size:11px !important; }
 ${D} .orr-prep-stake-number { font-size:22px; }
 ${D} .orr-prep-stake-pressure { font-size:10px; }
 ${A} > .k-title .sf-cru-sub { margin-right:0; max-width:100%; }
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
}
`;
export function injectCruciblePreparation(doc = globalThis.document) {
  if (!doc?.head || doc.getElementById('orr-crucible-preparation-style')) return;
  injectOrrery(doc);
  const style = doc.createElement('style'); style.id = 'orr-crucible-preparation-style';
  style.textContent = CSS; doc.head.appendChild(style);
}
