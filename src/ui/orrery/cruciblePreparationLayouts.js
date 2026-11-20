// One composition sheet for the Crucible preparation family. Materials and typography inherit
// Deckplate/ORRERY; no new token root, runtime filter, full-screen canvas or animation loop.
import { injectOrrery } from './tokens.js';
import { runtimeAssetUrl } from '../../core/runtimeAssetUrl.js';
const BONE = '236 230 216';
const VOID = '5 7 10';
const D = 'html body #screens > .k-screen.orr-crucible.sf-crucible-door.orr-preparation[data-prep-step]';
const A = 'html body #screens > .k-screen.orr-crucible.sf-crucible-draft.orr-armory.orr-visual-armory';
const R = 'html body #screens > .k-screen.orr-crucible.sf-crucible-refit.orr-refit';
const RD = `html:root:not([data-sf-mobile="1"]) ${R.replace(/^html /, '')}`;
/* Scored Gauntlet rearm: three sky cards, no shop/orr-armory class. Armory densify (A) misses it. */
const RE = 'html body #screens > .k-screen.orr-crucible.sf-crucible-draft.orr-visual-armory:not(.orr-armory)';
const WORKSHOP_URL = runtimeAssetUrl('assets/ui/generated/armory/workshop.webp', import.meta.url);
const CSS = `
${D} .orr-prep-daily { color:#9edce9; font:500 14px var(--dp-face-body,'Instrument Sans'),sans-serif; margin:8px 0 12px; }
${D} .orr-cabinet-preview { position:absolute; top:14px; right:14px; width:min(78%, 360px); max-width:360px; padding:8px 10px; z-index:3; pointer-events:none; border:1px solid rgb(158 220 233 / .36); border-top:2px solid #9edce9; border-radius:2px; background:linear-gradient(90deg, rgb(9 22 33 / .92), rgb(12 28 40 / .85)); box-shadow:inset 0 1px 0 rgb(208 238 250 / .16), 0 10px 24px rgb(0 0 0 / .6); }
${D} .orr-cabinet-preview[hidden] { display:none !important; }
${D} .orr-cabinet-canvas { display:block; width:100%; height:auto; aspect-ratio:16/9; border:1px solid rgb(154 198 218 / .24); border-radius:2px; }
${D} .orr-cabinet-preview .orr-label { color:#9edce9; font:600 12px/1.3 var(--dp-face-label); letter-spacing:.12em; text-transform:uppercase; margin:4px 0 2px; }
.orr-equipment-glyph { display:block; width:48px; height:48px; flex:none; color:var(--dp-ink); pointer-events:none; }
${D} { display:grid !important; grid-template-columns:minmax(0,1fr) minmax(0,1fr) !important; grid-template-rows:auto auto minmax(0,1fr) auto !important; gap:10px 32px !important; padding:14px 40px 12px !important; width:100% !important; height:100dvh !important; max-width:none !important; max-height:none !important; margin:0 !important; overflow:hidden !important; background:radial-gradient(95% 75% at 50% 0%, rgb(20 44 62 / .38) 0%, transparent 68%), radial-gradient(80% 60% at 85% 100%, rgb(38 28 14 / .24) 0%, transparent 65%), repeating-linear-gradient(0deg, rgb(158 220 233 / .012) 0 1px, transparent 1px 4px), linear-gradient(180deg, #060d14 0%, #04080d 100%) !important; }
${D} > .k-title, ${D} .orr-prep__head { grid-column:1 / -1 !important; grid-row:1 !important; margin:0 !important; padding:8px 16px !important; border:1px solid rgb(154 198 218 / .34) !important; border-radius:2px !important; background:linear-gradient(90deg, #f2b950 0 28px, rgb(158 220 233 / .48) 28px 160px, rgb(158 220 233 / .14) 160px 100%) top left / 100% 2px no-repeat, linear-gradient(180deg, rgb(25 36 47 / .96) 0%, rgb(14 21 29 / .98) 100%) !important; box-shadow:inset 0 1px 0 rgb(215 238 248 / .20), inset 0 -2px 0 rgb(2 5 8 / .88), inset 0 0 0 1px rgb(14 28 40 / .75), 0 10px 24px rgb(0 0 0 / .55) !important; }
${D} > .k-title h1 { font-size:38px !important; line-height:1 !important; letter-spacing:-.025em !important; color:#edf6fa !important; }
${D} .sf-crd-sub { font-family:var(--dp-face-body, 'Instrument Sans'),sans-serif !important; text-transform:none !important; letter-spacing:0 !important; font-size:13.5px !important; line-height:1.4 !important; margin:2px 0 0 !important; color:rgb(198 224 236 / .86) !important; }
${D} .orr-prep-nav { grid-column:1 / -1; grid-row:2; display:flex; align-items:center; gap:10px; padding:5px 10px; border:1px solid rgb(154 198 218 / .32); border-radius:2px; background:linear-gradient(180deg, rgb(22 33 44 / .95) 0%, rgb(12 19 27 / .98) 100%); box-shadow:inset 0 1px 0 rgb(215 238 248 / .16), inset 0 -2px 0 rgb(2 5 8 / .85), 0 8px 20px rgb(0 0 0 / .48); min-width:0; }
${D} .orr-prep-tabs { display:flex; gap:8px; }
${D} .orr-prep-tab { display:flex; gap:10px; align-items:center; border:1px solid rgb(154 198 218 / .26) !important; border-radius:2px !important; background:linear-gradient(160deg, rgb(14 28 40 / .92) 0%, rgb(9 18 27 / .96) 100%) !important; box-shadow:inset 0 1px 0 rgb(208 238 250 / .10) !important; color:rgb(198 224 236 / .78); font:600 14px var(--dp-face-label); letter-spacing:.12em; text-transform:uppercase; padding:7px 14px; min-height:36px; cursor:pointer; position:relative; outline:none !important; }
${D} .orr-prep-tab::after { content:''; position:absolute; left:0; bottom:0; height:2px; width:100%; background:#e6ca8f; opacity:0; transform:none; }
${D} .orr-prep-tab[aria-selected=true], ${D} .orr-prep-step.is-active { color:#fff1cf !important; border:1px solid rgb(230 202 143 / .82) !important; background:linear-gradient(165deg, rgb(224 181 94 / .22) 0%, rgb(224 181 94 / .07) 60%, rgb(13 28 40 / .95) 100%) !important; box-shadow:inset 0 2px 0 #e6ca8f, inset 0 0 18px rgb(224 181 94 / .12), 0 6px 16px rgb(0 0 0 / .48) !important; outline:none !important; }
${D} .orr-prep-tab[aria-selected=true]::after { opacity:1; }
${D} .orr-prep-tab:focus, ${D} .orr-prep-tab:focus:not(:focus-visible) { outline:none !important; }
${D} .orr-prep-tab:focus-visible { border-radius:2px !important; outline:1px solid rgb(158 220 233 / .75) !important; outline-offset:0px !important; border-color:#e6ca8f !important; }
${D} .orr-prep-step { font-size:12px; font-variant-numeric:tabular-nums; letter-spacing:.08em; color:#9edce9; padding:2px 6px; border:1px solid rgb(158 220 233 / .28); border-radius:2px; background:rgb(9 20 30 / .85); }
${D} .orr-prep-tab[aria-selected=true] .orr-prep-step { color:#fff1cf; border-color:rgb(230 202 143 / .75); background:rgb(224 181 94 / .22); }
${D} .orr-prep-nextstep, ${D} .orr-prep-step--ghost { display:inline-flex; align-items:center; gap:10px; margin:0; padding:7px 14px; min-height:36px; border:1px solid rgb(154 198 218 / .22); border-radius:2px; background:rgb(10 20 30 / .6); box-shadow:inset 0 1px 0 rgb(208 238 250 / .08); font:600 13.5px var(--dp-face-label); letter-spacing:.12em; text-transform:uppercase; color:rgb(158 220 233 / .72); pointer-events:none; user-select:none; }
${D} .orr-prep-summary { margin-left:auto; color:#d8eaf2; font-size:13px; text-align:right; padding:4px 10px; border:1px solid rgb(154 198 218 / .22); border-radius:2px; background:rgb(9 20 30 / .75); }
${D} > .k-stage { grid-column:1 !important; grid-row:3 !important; position:relative !important; inset:auto !important; width:100% !important; max-width:none !important; min-height:0 !important; height:100% !important; padding:0 12px 0 0 !important; margin:0 !important; overflow:auto !important; mask-image:none !important; }
${D} > .k-stage::before { display:none !important; }
${D} .orr-prep-panel { padding:0 0 4px; }
${D} .orr-prep-settings, ${D} .orr-prep-step-pane[data-step="1"] .orr-door-rails { display:flex !important; flex-direction:column !important; gap:8px !important; padding:0 !important; margin:0 !important; }
${D} .orr-prep-settings > .k-row, ${D} .orr-door-group { display:block !important; margin:0 !important; padding:8px 12px !important; min-width:0; border:1px solid rgb(154 198 218 / .30) !important; border-radius:2px !important; background:linear-gradient(90deg, #f2b950 0 28px, rgb(158 220 233 / .48) 28px 140px, rgb(158 220 233 / .14) 140px 100%) top left / 100% 2px no-repeat, repeating-linear-gradient(0deg, rgb(158 220 233 / .012) 0 1px, transparent 1px 3px), radial-gradient(120% 90% at 18% 0%, rgb(24 54 74 / .34), transparent 62%), linear-gradient(160deg, rgb(11 24 35 / .95) 0%, rgb(7 16 24 / .97) 100%) !important; box-shadow:inset 0 1px 0 rgb(208 238 250 / .14), inset 0 -2px 0 rgb(2 6 10 / .85), 0 10px 24px rgb(0 0 0 / .52) !important; }
${D} .k-row > .k-row__name { display:block !important; font:700 12px var(--dp-face-label) !important; letter-spacing:.16em !important; text-transform:uppercase !important; color:#9edce9 !important; margin-bottom:5px !important; }
${D} .sf-crd-modes, ${D} .sf-crd-stakes, ${D} .sf-crd-arenas { display:grid !important; gap:6px !important; padding:0 !important; margin:0 !important; width:100% !important; }
${D} .sf-crd-modes { grid-template-columns:repeat(3,minmax(0,1fr)) !important; }
${D} .sf-crd-stakes { grid-template-columns:repeat(4,minmax(0,1fr)) !important; }
${D} .sf-crd-arenas, ${D} [data-group="arena"] .orr-door-group__grid { grid-template-columns:repeat(3,minmax(0,1fr)) !important; gap:6px !important; }
${D} .sf-crd-modes > li, ${D} .sf-crd-stakes > li, ${D} .sf-crd-arenas > li, ${D} .sf-crd-hulls > li { margin:0 !important; width:auto !important; min-width:0 !important; list-style:none !important; }
${D} .orr-tile { max-width:none !important; width:100% !important; min-width:0 !important; min-height:58px !important; padding:6px 10px !important; display:flex !important; flex-direction:column !important; justify-content:center !important; align-items:center !important; gap:4px !important; border:1px solid rgb(154 198 218 / .26) !important; border-radius:2px !important; background:linear-gradient(165deg, rgb(16 32 45 / .92), rgb(10 20 30 / .96)) !important; box-shadow:inset 0 1px 0 rgb(210 238 250 / .10), inset 0 -1px 0 rgb(2 6 10 / .82) !important; opacity:1 !important; }
${D} .orr-tile:is(:hover,:focus-visible):not([aria-pressed=true]) { border-color:rgb(158 220 233 / .62) !important; background:linear-gradient(165deg, rgb(22 44 60 / .95), rgb(13 27 39 / .98)) !important; }
${D} .orr-tile[aria-pressed=true] { border:1px solid rgb(230 202 143 / .82) !important; background:linear-gradient(165deg, rgb(224 181 94 / .22) 0%, rgb(224 181 94 / .07) 60%, rgb(13 28 40 / .95) 100%) !important; box-shadow:inset 0 2px 0 #e6ca8f, inset 0 0 18px rgb(224 181 94 / .12), 0 6px 18px rgb(0 0 0 / .5) !important; color:#fff1cf !important; }
${D} .orr-tile .fh-tile-legend { font:600 12px/1.3 var(--dp-face-label) !important; letter-spacing:.04em !important; white-space:normal !important; color:#e6f2f7 !important; max-width:100% !important; }
${D} .orr-tile[aria-pressed=true] .fh-tile-legend { color:#fff1cf !important; }
${D} .orr-tile .fh-tile-art { display:flex !important; align-items:center !important; justify-content:center !important; min-height:0 !important; width:100% !important; height:32px !important; }
${D} .orr-tile .fh-tile-art svg { width:32px !important; height:32px !important; opacity:.95 !important; color:#9edce9 !important; }
${D} .orr-tile[aria-pressed=true] .fh-tile-art svg { color:#f2b950 !important; }
${D} .sf-crd-stake .fh-tile-art { height:22px !important; }
${D} .sf-crd-stake-nums { display:none !important; }
${D} .orr-prep-stake-number { display:block; color:#edf6fa; font:600 20px/1.05 var(--dp-face-numeral); font-variant-numeric:tabular-nums; }
${D} .orr-tile[aria-pressed=true] .orr-prep-stake-number { color:#fff1cf; }
${D} .orr-prep-stake-pressure { display:block; margin-top:2px; font:500 12px/1.2 var(--dp-face-body,'Instrument Sans'),sans-serif; color:#9edce9; }
${D} :is(.sf-crd-mode-sub,.sf-crd-stake-sub,.sf-crd-arena-sub,.sf-crd-hull-sub) { max-width:none !important; font:400 12.5px/1.35 var(--dp-face-body,'Instrument Sans'),sans-serif !important; color:rgb(198 224 236 / .82) !important; letter-spacing:0 !important; margin:4px 0 0 !important; }
${D} .sf-crd-ghost-sub { display:none !important; }
${D} .sf-crd-arenas .fh-tile-art { height:26px !important; }
${D} .sf-crd-arenas .fh-tile-art img { width:100% !important; height:26px !important; object-fit:cover !important; filter:none !important; opacity:.92 !important; border-radius:2px; }
${D} .sf-crd-hulls { display:grid !important; grid-template-columns:repeat(2,minmax(0,1fr)) !important; gap:6px 10px !important; padding:0 !important; margin:0 !important; }
${D} .sf-crd-hull { min-height:58px !important; display:grid !important; grid-template-columns:54px minmax(0,1fr) !important; gap:2px 10px !important; text-align:left !important; padding:6px 10px !important; }
${D} .sf-crd-hull::before { content:none !important; display:none !important; }
${D} .sf-crd-hull[aria-pressed=true] { box-shadow:inset 3px 0 0 #e6ca8f, inset 0 2px 0 #e6ca8f, inset 0 0 18px rgb(224 181 94 / .12), 0 6px 16px rgb(0 0 0 / .48) !important; }
${D} .sf-crd-hull .fh-tile-art { width:54px !important; height:48px !important; border:1px solid rgb(154 198 218 / .24); border-radius:2px; background:radial-gradient(circle at 50% 50%, rgb(24 54 74 / .42), rgb(7 16 24 / .94)); }
${D} .sf-crd-hull .fh-tile-art > img { width:100% !important; height:100% !important; object-fit:contain !important; opacity:.95 !important; filter:none !important; transform:none !important; }
${D} .sf-crd-hull .fh-tile-legend { text-align:left !important; font-size:13px !important; }
${D} .orr-tile[disabled], ${D} .orr-tile[aria-disabled=true] { opacity:.48 !important; }
${D} .orr-prep-disclosure { padding:5px 10px; margin-top:6px; border:1px solid rgb(154 198 218 / .24); border-radius:2px; background:linear-gradient(160deg, rgb(12 25 36 / .9), rgb(8 17 26 / .94)); font-size:13px; }
${D} .orr-prep-disclosure:not([open]) > :not(summary) { display:none !important; }
${D} .orr-prep-disclosure > summary { min-height:24px; line-height:24px; cursor:pointer; color:#9edce9; font:600 12.5px/24px var(--dp-face-label); letter-spacing:.08em; text-transform:uppercase; }
${D} .orr-prep-disclosure[open] > summary { margin-bottom:8px; }
${D} .orr-prep-challenges { gap:12px; margin-bottom:8px; }
${D} .sf-crd-anyhull-ships { flex-wrap:wrap !important; }
${D} :is(.sf-crd-anyhull-ship,.sf-crd-records > summary) { min-height:34px !important; font-size:12.5px !important; }
${D} .orr-door-hero, ${D} .orr-prep-ship { position:relative !important; grid-column:2 !important; grid-row:3 !important; inset:auto !important; width:100% !important; height:100% !important; min-height:0; margin:0; overflow:hidden !important; pointer-events:auto !important; border:1px solid rgb(154 198 218 / .34) !important; border-radius:2px !important; background:linear-gradient(90deg, #f2b950 0 28px, rgb(158 220 233 / .48) 28px 140px, rgb(158 220 233 / .14) 140px 100%) top left / 100% 2px no-repeat, radial-gradient(120% 90% at 18% 0%, rgb(24 54 74 / .34), transparent 62%), linear-gradient(160deg, rgb(11 24 35 / .95) 0%, rgb(7 16 24 / .98) 100%) !important; box-shadow:inset 0 1px 0 rgb(208 238 250 / .14), inset 0 -2px 0 rgb(2 6 10 / .85), 0 12px 28px rgb(0 0 0 / .58) !important; }
${D} .orr-door-hero { isolation:isolate; z-index:0; overflow:hidden !important; }
${D} .orr-door-hero__art { inset:0 !important; width:100% !important; height:100% !important; object-fit:cover !important; object-position:center !important; -webkit-mask-image:linear-gradient(0deg,transparent 0%, transparent 6%, black 32%, black 92%, transparent 100%) !important; mask-image:linear-gradient(0deg,transparent 0%, transparent 6%, black 32%, black 92%, transparent 100%) !important; }
${D} .orr-door-hero__words { position:absolute !important; left:18px !important; right:18px !important; bottom:134px !important; text-align:left !important; max-width:none !important; z-index:2; }
${D} .orr-door-hero__name { font:800 clamp(24px,2.8vw,40px)/1.03 var(--dp-face-display,'Archivo') !important; letter-spacing:-.02em !important; color:#edf6fa !important; text-shadow:0 1px 18px rgb(${VOID} / .65); }
${D} .orr-door-hero__line { max-width:44ch !important; margin-top:8px !important; font:400 14px/1.45 var(--dp-face-body,'Instrument Sans'),sans-serif !important; color:rgb(214 234 244 / .9) !important; }
${D} .orr-prep-brief { position:absolute; bottom:12px; left:18px; right:18px; border:1px solid rgb(154 198 218 / .32); border-top:2px solid #f2b950; border-radius:2px; padding:12px 16px; z-index:2; }
${D} .orr-prep-purse { font:700 32px/1 var(--dp-face-numeral); color:#fff1cf; }
${D} .orr-prep-cadence { white-space:pre-line; font-size:13px; line-height:1.55; color:rgb(198 224 236 / .86); margin:6px 0 0; }
${D} .orr-prep-ship { display:flex; flex-direction:column; overflow:auto !important; padding:12px 16px !important; box-sizing:border-box; }
${D} .orr-prep-shiphead { position:relative; z-index:1; padding-bottom:6px; border-bottom:1px solid rgb(154 198 218 / .24); }
${D} .orr-prep-shiphead .orr-label { color:#9edce9; font:700 12px/1.2 var(--dp-face-label); letter-spacing:.14em; text-transform:uppercase; margin:0; }
${D} .orr-prep-hullname { font:800 34px/1.05 var(--dp-face-display,'Archivo'); letter-spacing:-.02em; margin:4px 0 2px; color:#edf6fa; }
${D} .orr-prep-hullline, ${D} .orr-prep-fitnote { font-size:13px; line-height:1.4; color:rgb(198 224 236 / .84); margin:3px 0; }
${D} .orr-prep-shipvisual { position:relative; min-height:224px; height:clamp(224px,26vh,268px); flex:none; margin-top:8px; padding:68px 16px 36px !important; box-sizing:border-box !important; border:1px solid rgb(154 198 218 / .24); border-radius:2px; background:radial-gradient(ellipse at 50% 56%, rgb(22 52 72 / .36) 0%, rgb(7 15 23 / .92) 78%); box-shadow:inset 0 1px 0 rgb(208 238 250 / .10); }
/* the render is inset inside .orr-prep-shipvisual so ENERGY 260 at the top of the hull ring sits cleanly inside the top border */
${D} .orr-prep-shipart { width:auto !important; max-width:min(100%, 440px) !important; height:100% !important; margin:0 auto !important; display:block; object-fit:contain; }
${D} .orr-prep-fallback { width:160px; height:160px; margin:auto; color:#9edce9; }
${D} .orr-prep-shipjig { position:absolute; inset:8px 8px 34px; }
${D} .orr-prep-views { position:absolute; left:8px; right:8px; bottom:6px; display:flex; gap:8px; justify-content:center; }
${D} .orr-prep-view { color:rgb(198 224 236 / .78); background:linear-gradient(180deg, rgb(16 32 45 / .92), rgb(10 20 30 / .96)); border:1px solid rgb(154 198 218 / .28); border-radius:2px; padding:4px 12px; font:600 12px var(--dp-face-label); letter-spacing:.08em; text-transform:uppercase; cursor:pointer; }
${D} .orr-prep-view[aria-pressed=true] { border-color:rgb(230 202 143 / .82); background:linear-gradient(165deg, rgb(224 181 94 / .24), rgb(13 28 40 / .95)); color:#fff1cf; box-shadow:inset 0 2px 0 #e6ca8f; }
${D} .orr-prep-manifest { display:grid; grid-template-columns:repeat(2,minmax(0,1fr)); gap:6px 10px; margin:8px 0 6px; padding:8px; background:rgb(6 14 22 / .88); border:1px solid rgb(154 198 218 / .26); border-radius:2px; }
${D} .orr-prep-fitting { text-transform:none !important; letter-spacing:0 !important; display:flex; align-items:center; gap:10px; background:linear-gradient(160deg, rgb(14 29 42 / .92), rgb(9 19 28 / .96)); border:1px solid rgb(154 198 218 / .24); border-radius:2px; text-align:left; color:#edf6fa; padding:6px 10px; cursor:pointer; min-width:0; box-shadow:inset 0 1px 0 rgb(208 238 250 / .08); }
${D} .orr-prep-fitting:is(:hover,:focus-visible) { border-color:rgb(158 220 233 / .62); background:linear-gradient(160deg, rgb(20 40 56 / .95), rgb(12 25 36 / .98)); }
${D} .orr-prep-fitting > span { min-width:0; }
${D} .orr-prep-fitting small { display:block; color:#9edce9; font:600 12px/1.35 var(--dp-face-label); letter-spacing:.06em; text-transform:uppercase; }
${D} .orr-prep-fitting strong { font:600 13px/1.3 var(--dp-face-body,'Instrument Sans'),sans-serif; display:block; overflow-wrap:anywhere; color:#edf6fa; }
${D} .orr-prep-fitting[aria-pressed=true] { border:1px solid rgb(230 202 143 / .82); background:linear-gradient(165deg, rgb(224 181 94 / .22) 0%, rgb(224 181 94 / .07) 60%, rgb(13 28 40 / .95) 100%); box-shadow:inset 0 2px 0 #e6ca8f, inset 0 0 14px rgb(224 181 94 / .12); color:#fff1cf; }
${D} .orr-prep-fitting.is-empty .orr-equipment-glyph { opacity:.4; color:#9edce9; }
${D} .orr-prep-fitnote:not(:empty) { background:rgb(9 20 30 / .92); border:1px solid rgb(154 198 218 / .26); border-left:2px solid #9edce9; border-radius:2px; color:#edf6fa; padding:8px 12px; }
${D} > .k-foot, ${D} .orr-prep-foot { grid-column:1 / -1 !important; grid-row:4 !important; display:block !important; position:relative !important; z-index:6 !important; inset:auto !important; width:auto !important; margin:0 !important; padding:10px 18px !important; border:1px solid rgb(154 198 218 / .34); border-radius:2px; background:linear-gradient(180deg, rgb(25 36 47 / .96) 0%, rgb(14 21 29 / .98) 100%); box-shadow:inset 0 1px 0 rgb(215 238 248 / .20), inset 0 -2px 0 rgb(2 5 8 / .88), 0 -12px 28px rgb(0 0 0 / .62); isolation:isolate; }
${D} .k-foot .k-words { display:flex !important; justify-content:flex-end; align-items:center; gap:18px !important; padding:0 !important; flex-wrap:wrap; position:relative; z-index:1; }
${D} .k-foot .orr-prep-continue, ${D} .k-foot .orr-key--hazard, ${D} .orr-door-launch, ${D} .orr-prep-advance { font:700 16px var(--dp-face-label) !important; min-height:44px !important; min-width:220px !important; text-align:center !important; padding:10px 22px !important; letter-spacing:.12em !important; text-transform:uppercase !important; color:#fff1cf !important; border:1px solid #e6ca8f !important; border-radius:2px !important; background:linear-gradient(180deg, rgb(224 181 94 / .32) 0%, rgb(224 181 94 / .14) 100%) !important; box-shadow:inset 0 1px 0 rgb(255 241 207 / .30), 0 8px 22px rgb(0 0 0 / .55) !important; clip-path:polygon(0 0,calc(100% - 10px) 0,100% 10px,100% 100%,10px 100%,0 calc(100% - 10px)) !important; }
${D} .k-foot .orr-prep-continue:is(:hover,:focus-visible), ${D} .k-foot .orr-key--hazard:is(:hover,:focus-visible) { border-color:#ffd98c !important; background:linear-gradient(180deg, rgb(242 185 80 / .42) 0%, rgb(224 181 94 / .22) 100%) !important; color:#ffffff !important; box-shadow:inset 0 1px 0 rgb(255 248 228 / .45), 0 0 18px rgb(242 185 80 / .28) !important; }
${D} .k-foot .orr-door-hint { text-align:right; font:400 12px/1.4 var(--dp-face-body,'Instrument Sans'),sans-serif !important; letter-spacing:0 !important; margin:6px 0 0 !important; color:rgb(198 224 236 / .80) !important; position:relative; z-index:1; }
/* foot rail: ‹ BACK + ESC keycap (matches new-game / save / tech-tree) */
${D} .k-foot .sf-back.k-word, ${D} .orr-door-back { all:unset !important; box-sizing:border-box !important; cursor:pointer !important; display:inline-flex !important; align-items:center !important; gap:0 !important; padding:8px 14px !important; min-height:40px !important; font:600 13px var(--dp-face-label) !important; font-stretch:112% !important; letter-spacing:.16em !important; text-transform:uppercase !important; color:#d8eaf2 !important; border:1px solid rgb(154 198 218 / .34) !important; border-radius:2px !important; background:linear-gradient(180deg, rgb(20 35 48 / .92) 0%, rgb(12 22 32 / .96) 100%) !important; box-shadow:inset 0 1px 0 rgb(210 238 250 / .14) !important; text-shadow:none !important; }
${D} .k-foot .sf-back.k-word::before { all:unset !important; content:"‹" !important; display:inline !important; margin-right:10px !important; font-size:15px !important; color:#9edce9 !important; }
${D} .k-foot .sf-back.k-word::after { all:unset !important; content:"ESC" / "" !important; display:inline-block !important; margin-left:12px !important; padding:3px 7px 4px !important; font:600 12px var(--dp-face-label) !important; letter-spacing:.06em !important; line-height:1 !important; text-transform:uppercase !important; color:#9edce9 !important; background:rgb(9 20 30 / .85) !important; border:1px solid rgb(158 220 233 / .4) !important; border-radius:2px !important; box-shadow:inset 0 -1px 0 rgb(0 0 0 / .35) !important; vertical-align:baseline !important; }
${D} .k-foot .sf-back.k-word :is(.k-kbd, .dp-kbd, kbd) { display:none !important; }
${D} .k-foot .sf-back.k-word:is(:hover, :focus-visible) { color:#fff1cf !important; border-color:#e6ca8f !important; outline:none !important; text-decoration:none !important; }
${D} .k-foot .sf-back.k-word:focus-visible::after { color:#fff1cf !important; border-color:rgb(230 202 143 / .6) !important; }
${D} :is(button,summary,input):focus-visible, ${A} :is(button,input,summary):focus-visible { outline:1px solid rgb(158 220 233 / .78) !important; outline-offset:1px !important; }
${D} .orr-prep-tab:focus-visible { outline:1px solid rgb(230 202 143 / .85) !important; outline-offset:0px !important; }
/* The armory's three planes: catalog, object/ship, transaction. */
${A} { display:grid !important; grid-template-columns:minmax(320px,.9fr) minmax(0,1.55fr) !important; grid-template-rows:auto minmax(0,1fr) auto !important; gap:24px 38px !important; padding:30px 48px 22px !important; width:100% !important; height:100dvh !important; max-width:none !important; max-height:none !important; margin:0 !important; overflow:hidden !important; }
${A} .k-title { grid-column:1 / -1 !important; grid-row:1; padding:0 !important; margin:0 !important; position:relative; }
${A} .k-title h1 { font:800 44px/1 var(--dp-face-display,'Archivo') !important; letter-spacing:-.02em !important; }
${A} .k-title .sf-cru-sub { font-size:14px !important; margin:10px 200px 0 0; color:var(--dp-ink-dim) !important; }
${A} .orr-armory-wallet { position:absolute; right:0; top:0; text-align:right; }
${A} .orr-armory-wallet strong { display:block; font:300 40px/1 var(--dp-face-numeral); font-variant-numeric:tabular-nums; }
${A} .orr-armory-wallet span { display:block; font:500 12px/1.4 var(--dp-face-label); letter-spacing:.08em; text-transform:uppercase; color:var(--dp-ink-dim); margin-top:6px; }
${A} .sf-cru-stage { grid-column:1 !important; grid-row:2 !important; display:flex !important; flex-direction:column !important; position:relative !important; inset:auto !important; max-width:none !important; width:100% !important; height:100% !important; min-height:0 !important; padding:0 !important; margin:0 !important; overflow:hidden !important; }
${A} .sf-cru-filters { display:flex !important; flex-wrap:wrap !important; gap:4px 14px !important; padding:0 0 12px !important; margin:0 !important; flex:none !important; }
${A} .sf-cru-filters > button { padding:8px 0 !important; font:500 12px var(--dp-face-label) !important; min-height:36px !important; letter-spacing:0 !important; color:var(--dp-ink-dim) !important; }
${A} .sf-cru-filters > button[aria-pressed=true] { color:var(--dp-ink) !important; border-bottom:1px solid var(--dp-hand) !important; }
${A} .sf-cru-count { margin-left:5px; font-size:12px; opacity:.7; }
${A} .sf-cru-search { width:100% !important; max-width:none !important; order:2; flex:1 0 100%; margin:6px 0 0 !important; min-height:44px !important; color:var(--dp-ink) !important; font:400 14px var(--dp-face-body,'Instrument Sans'),sans-serif !important; padding:10px 12px !important; border:0 !important; border-bottom:1px solid var(--dp-line) !important; background:var(--dp-glass-deep) !important; }
${A} .sf-cru-filters .orr-stationrow__rule { display:none !important; }
${A} .sf-cru-stage > .sf-cru-cards { display:flex !important; flex-direction:column !important; gap:0 !important; flex:1 1 auto !important; min-height:0 !important; max-height:none !important; height:auto !important; overflow:auto !important; padding:0 10px 16px 0 !important; mask-image:none !important; }
${A} .sf-cru-card.sf-cru-card { display:grid !important; grid-template-columns:58px minmax(0,1fr) auto !important; grid-template-rows:auto auto !important; align-items:center !important; gap:3px 12px !important; padding:12px 4px 12px 12px !important; margin:0 !important; min-height:88px !important; height:auto !important; flex:none !important; opacity:1 !important; width:100% !important; border:0 !important; border-bottom:1px solid var(--dp-line-faint) !important; border-radius:0 !important; background:none !important; text-align:left !important; }
${A} .sf-cru-card > .orr-equipment-glyph, ${A} .sf-cru-card > .sf-thumb.orr-armory-card-thumb { grid-column:1; grid-row:1 / 3; }
${A} .sf-cru-card > .orr-equipment-glyph { width:54px; height:54px; opacity:.8; }
${A} .sf-cru-card .sf-cru-name { grid-column:2 !important; grid-row:1 !important; font:600 16px/1.2 var(--dp-face-label) !important; white-space:normal !important; color:var(--dp-ink) !important; overflow-wrap:anywhere; }
${A} .sf-cru-card .sf-cru-price { grid-column:3 !important; grid-row:1 / 3 !important; font:500 13px var(--dp-face-numeral) !important; color:var(--dp-ink-dim) !important; padding-left:6px; white-space:nowrap; }
${A} .sf-cru-card .sf-cru-verb { display:block !important; grid-column:2 !important; grid-row:2 !important; font:400 12px/1.3 var(--dp-face-body,'Instrument Sans'),sans-serif !important; letter-spacing:0 !important; color:var(--dp-ink-dim) !important; }
${A} .sf-cru-card .sf-cru-key, ${A} .orr-rail-scale, ${A} .orr-rail-wallet { display:none !important; }
${A} .sf-cru-card.is-lit { background:linear-gradient(90deg,rgb(242 185 80 / .09),transparent) !important; }
${A} .sf-cru-card.is-lit::before { content:'' !important; display:block !important; position:absolute !important; left:0 !important; top:14px !important; bottom:14px !important; width:2px !important; background:var(--dp-hand) !important; }
/* S11 — the dealt three: tall authored cards above the shelf, ~360px wide and tall enough to
   hold the glyph, the verb, the name, one sentence and the price. One click picks and fits;
   the shelf rail stays a dense browse surface behind Browse all. */
${A} .sf-cru-dealt { display:grid !important; grid-template-columns:repeat(3,minmax(0,1fr)) !important; gap:14px !important; flex:none !important; margin:0 0 16px !important; }
${A} .sf-cru-dealt[hidden] { display:none !important; }
${A} .sf-cru-dealt .sf-cru-card.sf-cru-card--dealt { display:flex !important; flex-direction:column !important; align-items:stretch !important; gap:6px !important; min-height:360px !important; height:auto !important; width:100% !important; padding:14px 16px 12px !important; margin:0 !important; border:1px solid var(--dp-line) !important; border-radius:2px !important; background:rgb(12 13 16 / .55) !important; text-align:left !important; cursor:pointer !important; }
${A} .sf-cru-dealt .sf-cru-card--dealt:hover, ${A} .sf-cru-dealt .sf-cru-card--dealt:focus-visible { border-color:var(--dp-hand) !important; }
${A} .sf-cru-dealt .sf-cru-dealtface { display:grid !important; place-items:center !important; min-height:150px !important; flex:1 1 auto !important; border-bottom:1px solid var(--dp-line-faint) !important; margin-bottom:4px !important; }
${A} .sf-cru-dealt .sf-cru-dealtface > .orr-equipment-glyph, ${A} .sf-cru-dealt .sf-cru-dealtface > svg { width:132px !important; height:132px !important; opacity:.92; }
${A} .sf-cru-dealt .sf-cru-cardhead { display:flex !important; align-items:baseline !important; gap:10px !important; margin:0 !important; }
${A} .sf-cru-dealt .sf-cru-key { display:inline !important; font:500 12px/1 var(--dp-face-numeral) !important; color:var(--dp-ink-dim) !important; margin:0 !important; }
${A} .sf-cru-dealt .sf-cru-verb { flex:1 1 auto !important; font:600 13px/1.2 var(--dp-face-label) !important; letter-spacing:.14em !important; color:var(--dp-hand) !important; margin:0 !important; }
${A} .sf-cru-dealt .sf-cru-price { font:600 15px/1 var(--dp-face-numeral) !important; color:var(--dp-ink) !important; margin:0 !important; }
${A} .sf-cru-dealt .sf-cru-name { font:700 clamp(18px,1.5vw,24px)/1.1 var(--dp-face-display,'Archivo') !important; letter-spacing:-.015em !important; color:var(--dp-ink) !important; margin:2px 0 !important; overflow-wrap:anywhere !important; }
${A} .sf-cru-dealt .sf-cru-blurb { display:block !important; font:400 14px/1.45 var(--dp-face-body,'Instrument Sans'),sans-serif !important; color:var(--dp-ink-dim) !important; margin:0 !important; }
${A} .sf-cru-dealt .sf-cru-slot, ${A} .sf-cru-dealt .sf-cru-afford, ${A} .sf-cru-dealt .sf-cru-activation { display:block !important; margin:2px 0 0 !important; }
${A} .sf-cru-dealt .sf-cru-slot { font:400 12px/1.4 var(--dp-face-label) !important; color:var(--dp-ink-dim) !important; }
${A} .sf-cru-dealt .sf-cru-card--dealt.is-unavail { opacity:.55 !important; }
${A} .sf-cru-dealt .sf-cru-card--dealt.is-fitted { border-color:var(--dp-line-faint) !important; opacity:.6 !important; }
/* S15 — the synthesis is the room's golden row: a card that only exists because the build's own
   parts combined. Gold hairline + warm wash on both the shelf row and a dealt card. */
${A} .sf-cru-card.sf-cru-card--evo { border-color:var(--dp-hand) !important; background:linear-gradient(180deg, rgb(214 175 55 / .14), rgb(12 13 16 / .55) 55%) !important; box-shadow:0 0 0 1px rgb(214 175 55 / .22), 0 6px 22px -12px rgb(214 175 55 / .45) !important; }
${A} .sf-cru-card.sf-cru-card--evo .sf-cru-name { color:var(--dp-hand) !important; }
${A} .sf-cru-card.sf-cru-card--evo .sf-cru-verb::after { content:' synthesis'; }
${A} .sf-cru-stage > .sf-cru-cards[hidden] { display:none !important; }
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
${A} .orr-armory-reading__more { margin:6px 0 0; }
${A} .orr-armory-reading__more[hidden] { display:none; }
${A} .orr-armory-reading__more-word { font:500 13px var(--dp-face-label); color:var(--dp-ink-dim); cursor:pointer; min-height:32px; padding:6px 0; list-style:none; }
${A} .orr-armory-reading__more-word::-webkit-details-marker { display:none; }
${A} .orr-armory-reading__more:not([open]) > :not(.orr-armory-reading__more-word) { display:none !important; }
${A} .orr-armory-reading__more[open] > .orr-armory-reading__more-word { color:var(--dp-ink); }
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
${D} .sf-crd-hull .fh-tile-art { grid-column:1; grid-row:1 / 4; position:relative; }
${D} .sf-crd-hull .fh-tile-art .orr-prep-hullbadge { position:absolute; right:1px; bottom:1px; --sf-thumb-size:20px; width:20px; height:20px; padding:1px; border-radius:2px; }
${D} .sf-crd-hull .fh-tile-art .orr-prep-hullbadge img { width:100% !important; height:100% !important; object-fit:contain !important; opacity:1 !important; }
${D} .sf-crd-hull .fh-tile-legend { grid-column:2; grid-row:1; align-self:center; }
${D} .orr-prep-hullsub { grid-column:2; grid-row:2; }
${D} .orr-prep-locknote { grid-column:2; grid-row:3; font:400 12px/1.3 var(--dp-face-body,'Instrument Sans'),sans-serif; color:rgb(198 224 236 / .76); text-transform:none; letter-spacing:0; }
${D} .sf-crd-hull[data-locked='1'] .fh-tile-art { opacity:.5 !important; }
${D} .sf-crd-hull[data-locked='1'] .fh-tile-legend { opacity:.7 !important; }
${D} .orr-prep-fitting .orr-equipment-glyph { width:34px; height:34px; }
${D} .orr-prep-fitting .sf-thumb { flex:none; }
${D} .k-stage, ${D} .orr-prep-ship, ${A} .sf-cru-cards, ${A} .orr-armory-reading { scrollbar-width:thin; scrollbar-color:var(--dp-line-hi) transparent; }
${D} ::-webkit-scrollbar, ${A} ::-webkit-scrollbar { width:5px !important; height:5px !important; }
${D} ::-webkit-scrollbar-thumb, ${A} ::-webkit-scrollbar-thumb { background:var(--dp-line-hi); }
${A} .orr-armory-build { width:100%; font:400 12px/1.4 var(--dp-face-body,'Instrument Sans'),sans-serif; color:var(--dp-ink-dim); }
${A} .orr-armory-build:not([open]) > :not(summary) { display:none !important; }
${A}:has(.sf-cru-dealt:not([hidden])):has(.orr-armory-build[open]) .orr-armory-visual:not(:has(video)) { display:none !important; }
${A} .orr-armory-build summary { min-height:32px; padding:6px 0; cursor:pointer; color:#9edce9; font:600 12.5px/1.3 var(--dp-face-label); letter-spacing:.06em; text-transform:uppercase; }
${A} .orr-armory-build ul { margin:0; padding:0; list-style:none; }
${A} .orr-armory-build li { display:flex; align-items:center; gap:10px; padding:6px 0; border-top:1px solid var(--dp-line-faint); }
${A} .orr-armory-build li .orr-equipment-glyph, ${A} .orr-armory-build li .sf-thumb { width:32px; height:32px; flex:none; }
${A} .orr-armory-build li small { display:block; font-size:12px; color:var(--dp-ink-dim); }
/* Brief reveal only; idle interfaces do not schedule work and hidden screens do not animate. */
${D} .orr-prep-panel:not([hidden]), ${D} .orr-prep-ship:not([hidden]) { animation:orr-prep-arrive 240ms var(--dp-ease-out) both; }
${A} .orr-armory-item > svg { animation:orr-prep-arrive 200ms var(--dp-ease-out) both; }
@keyframes orr-prep-arrive { from { opacity:0; transform:translateY(6px); } to { opacity:1; transform:none; } }
html.sf-reduce-motion .orr-preparation *, html.sf-reduce-motion .orr-visual-armory * { animation:none !important; transition:none !important; scroll-behavior:auto !important; }
/* — the character-select pass —
   Keep the hull roster flush inside its bezel (no out-of-bounds pointer in the left margin). */
${D} .sf-crd-row--hull > div { position:relative; padding-left:0 !important; }
${D} .orr-prep-hand { display:none !important; }
/* mode leads */
${D} .sf-crd-modes { gap:6px !important; }
${D} .sf-crd-modes .orr-tile { min-height:62px !important; padding:6px 8px !important; }
${D} .sf-crd-modes .fh-tile-art { height:28px !important; }
${D} .sf-crd-modes .fh-tile-art svg { width:28px !important; height:28px !important; transition:transform .26s var(--dp-ease-out) !important; }
${D} .sf-crd-modes .orr-tile:not([aria-pressed=true]) { opacity:1 !important; }
${D} .sf-crd-modes .orr-tile:is(:hover,:focus-visible) { opacity:1 !important; }
${D} .sf-crd-modes .orr-tile[aria-pressed=true] .fh-tile-art svg { transform:scale(1.06); }
${D} .sf-crd-modes .fh-tile-legend { font-size:12.5px !important; letter-spacing:.10em !important; }
/* stakes: mark, purse, pressure — a service ladder */
${D} .sf-crd-stakes .orr-tile { min-height:62px !important; padding:5px 6px !important; gap:2px !important; }
${D} .sf-crd-stakes { gap:6px !important; }
/* Mark opacity is the tile art's (.orr-tile .fh-tile-art svg, .95 !important); only colour is set here. */
${D} .sf-crd-stake .fh-tile-art svg.orr-prep-stake-mark { width:20px !important; height:20px !important; color:#9edce9 !important;
  transition:color .18s linear; }
${D} .sf-crd-stake[aria-pressed=true] .fh-tile-art svg.orr-prep-stake-mark { color:#f2b950 !important; }
${D} .orr-prep-stake-number { font-size:20px !important; font-weight:600 !important; letter-spacing:-.01em; }
${D} .sf-crd-stake .fh-tile-art { height:20px !important; }
${D} .sf-crd-stake .fh-tile-art svg.orr-prep-stake-mark { width:20px !important; height:20px !important; stroke-width:3; }
${D} .orr-prep-stake-pressure { margin-top:1px; font:500 12px/1.2 var(--dp-face-label); letter-spacing:.06em; text-transform:uppercase; }
${D} .orr-prep-stake-yield { margin-top:1px; font:400 12px/1.2 var(--dp-face-body,'Instrument Sans'),sans-serif; color:rgb(198 224 236 / .82); }
/* arena: 3x3 tactical matrix of nine arenas */
${D} .sf-crd-arenas .orr-tile { min-height:36px !important; padding:4px 8px !important; flex-direction:row !important; justify-content:flex-start !important; gap:8px !important; }
${D} .sf-crd-arenas .fh-tile-art { width:38px !important; height:24px !important; flex:0 0 38px !important; border:1px solid rgb(154 198 218 / .26); border-radius:2px; overflow:hidden; }
${D} .sf-crd-arenas .fh-tile-art img { width:100% !important; height:100% !important; object-fit:cover !important; }
${D} .sf-crd-arenas .fh-tile-legend { font-size:12px !important; letter-spacing:.06em !important; text-align:left !important; white-space:normal; overflow:visible; text-overflow:clip; max-width:100%; }
/* the answer to the cursor: an underline drawn from the left, a two-pixel lift */
${D} .orr-tile { position:relative; transition:transform .22s var(--dp-ease-out), opacity .18s linear, border-color .18s linear, background .18s linear !important; }
${D} .orr-tile::after { content:''; position:absolute; left:0; right:0; top:0; height:2px; background:#e6ca8f;
  transform:scaleX(0); transform-origin:left center; transition:transform .26s var(--dp-ease-out), box-shadow .26s linear; }
${D} .orr-tile[aria-pressed=true]::after { transform:scaleX(1); box-shadow:0 0 10px rgb(242 185 80 / .35); }
${D} .orr-tile:is(:hover,:focus-visible):not([aria-pressed=true])::after { transform:scaleX(.35); background:#9edce9; }
${D} .orr-tile:is(:hover,:focus-visible) { transform:translateY(-1px) !important; }
/* crisp 1px cyan/amber bezel rule on keyboard focus */
${D} .orr-tile:focus-visible { clip-path:none !important; border-radius:2px !important; outline:1px solid #9edce9 !important; outline-offset:1px !important; }
${D} .orr-tile:active { transform:translateY(0) !important; transition-duration:.08s !important; }
/* a locked build refuses: one horizontal shake, never red */
${D} .orr-tile.is-denied { animation:orr-deny .32s linear; }
@keyframes orr-deny { 0%,100% { transform:translateX(0); } 20% { transform:translateX(-5px); } 40% { transform:translateX(4px); }
  60% { transform:translateX(-3px); } 80% { transform:translateX(2px); } }
/* roster faces: the sigil is the face, the hull line is the ride */
${D} .sf-crd-hull .fh-tile-art svg.orr-sigil { width:38px !important; height:38px !important; opacity:.9; color:#9edce9;
  transition:opacity .18s linear, transform .26s var(--dp-ease-out), color .18s linear, filter .26s linear !important; }
${D} .sf-crd-hull[aria-pressed=true] .fh-tile-art svg.orr-sigil { opacity:1; transform:scale(1.06); color:#f2b950;
  filter:drop-shadow(0 0 8px rgb(242 185 80 / .35)); }
${D} .orr-prep-hullsub { font:500 12px/1.25 var(--dp-face-label); letter-spacing:.10em; text-transform:uppercase; color:#9edce9; align-self:start; }
/* the weigh-in: the render rises and settles, the name snaps to rest, the manifest staggers */
${D} .orr-prep-ship.is-arriving .orr-prep-shipart { animation:orr-weighin .5s var(--dp-ease-out) both; }
@keyframes orr-weighin { from { opacity:0; transform:translateY(16px) scale(.97); } to { opacity:1; transform:none; } }
${D} .orr-prep-ship.is-arriving .orr-prep-hullname { animation:orr-slam .34s var(--dp-ease-out) both; transform-origin:left bottom; }
@keyframes orr-slam { from { transform:scale(1.035); } to { transform:scale(1); } }
${D} .orr-prep-ship.is-arriving .orr-prep-fitting { animation:orr-prep-arrive 300ms var(--dp-ease-out) both;
  animation-delay:calc(140ms + var(--i, 0) * 26ms); }
/* the purse is a counter; its unit rides beside it */
${D} .orr-prep-purse-unit { font:600 13px/1 var(--dp-face-label); letter-spacing:.12em; text-transform:uppercase; color:#f2b950; margin-left:6px; }
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
 ${D} .sf-crd-modes .fh-tile-legend { font-size:12px !important; letter-spacing:.1em !important; }
 ${D} .sf-crd-stakes .orr-tile { min-height:64px !important; padding:6px 4px !important; }
 ${D} .orr-prep-stake-number { font-size:20px !important; }
 /* UI polish: at 720p the stake mark gives its 30px back so purse, pressure and yield all fit the tile unclipped */
 ${D} .sf-crd-stake .fh-tile-art { display:none !important; }
 ${D} .orr-prep-stake-yield { font-size:12px !important; letter-spacing:0 !important; }
 ${D} .orr-prep-stake-pressure { letter-spacing:.02em !important; font-size:12px !important; }
 /* the payout line is the stake's whole trade (what it pays, what it scores): when a 1280-wide tile cannot hold it on one line
    it breaks at the dot, balanced, instead of ending in an ellipsis that eats the SCORES figure (the pressure line likewise at 1024) */
 ${D} :is(.orr-prep-stake-pressure, .orr-prep-stake-yield) { white-space:normal; text-wrap:balance; overflow-wrap:anywhere; max-width:100%; }
 /* Arena above the fold: hero carries the rooms — drop strip thumbs so both rows fit */
 ${D} .sf-crd-arenas .fh-tile-art { display:none !important; }
 ${D} .sf-crd-arenas .orr-tile { min-height:34px !important; padding:6px 2px !important; }
 ${D} .sf-crd-arenas .fh-tile-legend { font-size:12px !important; }
 ${D} :is(.sf-crd-mode-sub,.sf-crd-stake-sub,.sf-crd-arena-sub,.sf-crd-hull-sub) { margin-top:2px !important; font-size:12px !important; line-height:1.3 !important; display:-webkit-box; -webkit-line-clamp:2; -webkit-box-orient:vertical; overflow:hidden; }
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
${R} > .sf-cru-stage:not(.orr-hull--on) { position:relative !important; display:flex !important; flex-direction:column; min-height:0 !important; overflow:visible !important; padding-top:6px !important; -webkit-mask-image:none !important; mask-image:none !important; }
${R} > .sf-cru-stage:not(.orr-hull--on) > .sf-cru-rows { display:flex !important; flex-direction:column; flex:1 1 auto; min-height:0; overflow:auto; gap:0; margin:0 !important; scroll-padding:28px 0; scrollbar-width:thin; scrollbar-color:var(--dp-line-hi) transparent; -webkit-mask-image:linear-gradient(to bottom, transparent 0, #000 min(22px, 8%), #000 calc(100% - min(22px, 8%)), transparent 100%); mask-image:linear-gradient(to bottom, transparent 0, #000 min(22px, 8%), #000 calc(100% - min(22px, 8%)), transparent 100%); }
${R} > .sf-cru-stage:not(.orr-hull--on) .orr-hull-fitcount { position:absolute; left:16px; right:16px; bottom:calc(100% + 8px); z-index:2; margin:0; padding:0; color:rgb(${BONE} / .84); font:500 12px/1.4 var(--dp-face-label); letter-spacing:.08em; }
${R} > .sf-cru-stage:not(.orr-hull--on) > .sf-cru-rows, ${R} > .sf-cru-stage:not(.orr-hull--on) .sf-cru-row { width:100% !important; max-width:100% !important; min-width:0 !important; box-sizing:border-box; }
${R} > .sf-cru-stage:not(.orr-hull--on) .sf-cru-row { flex:none !important; display:grid !important; grid-template-columns:minmax(0,1fr) auto !important; align-items:start; column-gap:20px; padding:10px 0 12px !important; min-height:0 !important; border-bottom:1px solid rgb(${BONE} / .1); }
${R} > .sf-cru-stage:not(.orr-hull--on) .orr-hp__body { display:flex; flex-direction:column; gap:4px; min-width:0; }
${R} > .sf-cru-stage:not(.orr-hull--on) .orr-hp__head { display:flex; align-items:baseline; gap:12px; min-width:0; }
${R} > .sf-cru-stage:not(.orr-hull--on) .orr-hp__n { font-variant-numeric:tabular-nums; color:rgb(${BONE} / .6); min-width:2ch; }
${R} > .sf-cru-stage:not(.orr-hull--on) .k-row__name { display:flex; flex-wrap:wrap; align-items:baseline; gap:4px 12px; min-width:0; overflow:visible; white-space:normal; }
${R} > .sf-cru-stage:not(.orr-hull--on) .orr-hp__empty { color:rgb(${BONE} / .6); font-size:12px; letter-spacing:.08em; text-transform:uppercase; }
${R} > .sf-cru-stage:not(.orr-hull--on) .orr-hp__line { display:flex; flex-wrap:wrap; align-items:baseline; gap:6px 16px; min-width:0; }
${R} > .sf-cru-stage:not(.orr-hull--on) .orr-hp__spares { display:flex; flex-wrap:wrap; gap:6px 16px; min-width:0; }
${R} > .sf-cru-stage:not(.orr-hull--on) .orr-hp__spare { all:unset; box-sizing:border-box; display:inline-flex; flex-wrap:wrap; align-items:baseline; gap:2px 8px; padding:4px 0; cursor:pointer; color:rgb(${BONE} / .72); border-bottom:1px solid currentColor; font:500 14px/1.4 var(--dp-face-label); }
${R} > .sf-cru-stage:not(.orr-hull--on) .orr-hp__spare[aria-checked="true"] { color:rgb(${BONE} / .96); border-bottom-color:var(--dp-hand); }
${R} > .sf-cru-stage:not(.orr-hull--on) .orr-hp__spare-stat { font:400 12px/1.4 var(--dp-face-body,'Instrument Sans'),sans-serif; color:rgb(${BONE} / .72); }
${R} > .sf-cru-stage:not(.orr-hull--on) .orr-hp__spare:is(:hover,:focus-visible) { color:var(--dp-hand); border-bottom-color:var(--dp-hand); box-shadow:0 1px 0 var(--dp-hand); }
${R} > .sf-cru-stage:not(.orr-hull--on) .orr-hp__contrast { margin:2px 0 0 !important; white-space:normal !important; overflow-wrap:anywhere; line-height:1.4; color:rgb(${BONE} / .72); max-width:min(72ch, 100%) !important; }
${R} > .sf-cru-stage:not(.orr-hull--on) .sf-cru-act { align-self:center; }
@media (max-width:760px) {
 ${D}, ${A} { display:flex !important; flex-direction:column !important; height:100dvh !important; padding:18px !important; gap:16px !important; overflow:auto !important; }
 ${D} > .k-title h1, ${A} .k-title h1 { font-size:36px !important; }
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
 ${A} .k-title :is(.sf-cru-sub,.sf-cru-preview,.sf-cru-cradle) { margin-right:0; max-width:100%; }
 ${A} .orr-armory-wallet { position:static; text-align:left; display:flex; align-items:baseline; gap:12px; margin-top:16px; }
 ${A} .orr-armory-wallet strong { font-size:30px; }
 ${A} .sf-cru-stage { height:420px !important; flex:none !important; }
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
  left:0; bottom:0; width:100%; height:68%;
  background:
    linear-gradient(0deg, rgb(4 9 14 / .96) 0%, rgb(4 9 14 / .78) 28%, rgb(4 9 14 / .30) 58%, transparent 82%),
    linear-gradient(90deg, rgb(4 9 14 / .90) 0%, rgb(4 9 14 / .50) 42%, transparent 78%);
}
${D} .orr-door-hero__words {
  background:linear-gradient(100deg, rgb(8 20 30 / .94) 0%, rgb(11 25 37 / .88) 65%, rgb(11 25 37 / .65) 100%) !important;
  padding:12px 18px !important; margin-left:0; border:1px solid rgb(154 198 218 / .28); border-left:3px solid #9edce9; border-radius:2px;
  box-shadow:0 8px 24px rgb(0 0 0 / .58);
}
${D} .orr-prep-brief {
  background:linear-gradient(160deg, rgb(12 26 38 / .96) 0%, rgb(7 16 24 / .98) 100%) !important;
  padding:10px 16px !important; margin-left:0; border:1px solid rgb(154 198 218 / .32); border-top:2px solid #f2b950; border-radius:2px;
  box-shadow:inset 0 1px 0 rgb(208 238 250 / .14), 0 8px 22px rgb(0 0 0 / .6);
}
${D} .orr-door-hero__words::before, ${D} .orr-prep-brief::before { content:none !important; display:none !important; }
${D} .orr-prep-purse { color:#fff1cf; }
${D} .orr-prep-cadence { color:rgb(198 224 236 / .86); }
${D} .orr-prep-panelhead-line { color:rgb(198 224 236 / .84) !important; }
${D} :is(.sf-crd-mode-sub,.sf-crd-stake-sub,.sf-crd-arena-sub,.sf-crd-hull-sub) { color:rgb(198 224 236 / .84) !important; }
${D} .k-row > .k-row__name { color:#9edce9 !important; }
${D} .orr-tile .fh-tile-legend { color:#e6f2f7 !important; }
${D} .orr-tile[aria-pressed=true] .fh-tile-legend { color:#fff1cf !important; }
${D} .orr-prep-nextstep { text-transform:uppercase !important; letter-spacing:.12em !important; }
/* 1080p band: composition lift without CSS zoom (Encounter chrome is denser than
   settings/codex — zoom:1.12 pushed BACK / Continue off-frame). Scale faces +
   padding to read at the same weight as the 1.12 stack. */
@media (min-width:1800px) and (max-width:2199px) and (min-height:1000px) {
  ${D} { padding:16px 44px 12px !important; gap:10px 36px !important; }
  ${D} > .k-title h1 { font-size:40px !important; }
  ${D} .sf-crd-sub { font-size:14px !important; }
  ${D} .orr-prep-tab, ${D} .orr-prep-nextstep { font-size:14.5px; }
  ${D} .orr-door-hero__name { font-size:clamp(28px,3vw,42px) !important; }
  ${D} .orr-door-hero__line { font-size:14px !important; }
  ${D} .orr-prep-purse { font-size:34px; }
  ${D} .k-foot .orr-prep-continue, ${D} .k-foot .orr-key--hazard { font-size:16px !important; min-height:44px !important; }
}

/* —— UI polish: Crucible Armory (foot rail, contrast, filters, 1080p lift) —— */
/* Foot: ruggedized gunmetal deck housing + chamfered gold-amber primary key. */
${A} > .k-foot {
  z-index:6 !important; padding:10px 16px !important;
  border:1px solid rgb(154 198 218 / .34) !important; border-radius:2px !important;
  background:linear-gradient(180deg, rgb(25 36 47 / .96) 0%, rgb(14 21 29 / .98) 100%) !important;
  box-shadow:inset 0 1px 0 rgb(215 238 248 / .20), inset 0 -2px 0 rgb(2 5 8 / .88), 0 -10px 24px rgb(0 0 0 / .62) !important;
  isolation:isolate;
}
${A} .k-foot .k-words { position:relative; z-index:1; }
/* the foot's verbs are keys (STATION_STANDARD §5): chamfered gold-amber hardware primary, gunmetal secondaries */
${A} .k-foot .k-word--primary {
  display:inline-flex !important; align-items:center; min-height:42px; padding:0 22px;
  font:700 15px var(--dp-face-read) !important; letter-spacing:.12em !important; text-transform:uppercase !important;
  color:#fff1cf !important; text-shadow:none !important;
  background:linear-gradient(180deg, rgb(224 181 94 / .32) 0%, rgb(224 181 94 / .14) 100%) !important;
  border:1px solid #e6ca8f !important; border-radius:2px !important;
  clip-path:polygon(0 0, calc(100% - 10px) 0, 100% 10px, 100% 100%, 10px 100%, 0 calc(100% - 10px)) !important;
  box-shadow:inset 0 1px 0 rgb(255 241 207 / .30), 0 8px 22px rgb(0 0 0 / .55) !important;
  transition:background var(--dp-d-cut, 80ms) linear, box-shadow var(--dp-d-cut, 80ms) linear, border-color var(--dp-d-cut, 80ms) linear;
}
${A} .k-foot .k-word--primary .sf-cru-label { color:#fff1cf !important; text-shadow:none !important; }
${A} .k-foot .k-word--primary:is(:hover, :focus-visible) {
  color:#ffffff !important;
  border-color:#ffd98c !important;
  background:linear-gradient(180deg, rgb(242 185 80 / .42) 0%, rgb(224 181 94 / .22) 100%) !important;
  box-shadow:inset 0 1px 0 rgb(255 248 228 / .45), 0 0 18px rgb(242 185 80 / .28) !important;
  text-shadow:none !important;
}
${A} .k-foot .k-word:not(.k-word--primary) {
  display:inline-flex !important; align-items:center; min-height:38px; padding:0 14px;
  font:600 13px var(--dp-face-read) !important; letter-spacing:.08em !important; text-transform:uppercase !important;
  color:#d8eaf2 !important; font-weight:600 !important;
  background:linear-gradient(180deg, rgb(20 35 48 / .92) 0%, rgb(12 22 32 / .96) 100%) !important;
  border:1px solid rgb(154 198 218 / .34) !important; border-radius:2px !important;
  box-shadow:inset 0 1px 0 rgb(210 238 250 / .14) !important;
  transition:background var(--dp-d-cut, 80ms) linear, border-color var(--dp-d-cut, 80ms) linear, color var(--dp-d-cut, 80ms) linear;
}
${A} .k-foot .k-word:not(.k-word--primary):is(:hover, :focus-visible) {
  color:#fff1cf !important;
  background:linear-gradient(180deg, rgb(28 48 66 / .95) 0%, rgb(16 30 43 / .98) 100%) !important;
  border-color:#e6ca8f !important;
}
/* Keycaps — .sf-cru-kbd on Launch/Esc + nested kbd language; fine-print 1/2/3/Tab caps. */
${A} .k-foot .sf-cru-kbd,
${A} .sf-cru-fine .orr-armory-keycap {
  display:inline-block !important; box-sizing:border-box !important;
  margin-left:10px !important; margin-right:0 !important;
  padding:3px 7px 4px !important; min-width:0 !important; height:auto !important;
  font:600 12px var(--dp-face-label) !important; letter-spacing:.06em !important;
  line-height:1 !important; text-transform:uppercase !important;
  color:#9edce9 !important; background:rgb(9 20 30 / .88) !important;
  border:1px solid rgb(158 220 233 / .42) !important; border-radius:2px !important;
  box-shadow:inset 0 -1px 0 rgb(0 0 0 / .35) !important; vertical-align:baseline !important;
  opacity:1 !important; text-shadow:none !important;
}
${A} .sf-cru-fine .orr-armory-keycap { margin-left:0 !important; margin-right:4px !important; }
${A} .sf-cru-fine { color:rgb(198 224 236 / .82) !important; position:relative; z-index:1; }
${A} .orr-armory-hintword { color:rgb(198 224 236 / .82) !important; }

/* Secondary contrast — ice-cyan & visor-copy tones. */
${A} .k-title .sf-cru-sub { color:rgb(214 234 244 / .88) !important; }
${A} .k-title .sf-cru-preview { color:rgb(214 234 244 / .88) !important; margin:6px 0 0; font:400 13px/1.45 var(--dp-face-body,'Instrument Sans'),sans-serif !important; }
${A} .k-title .sf-cru-cradle { color:#9edce9 !important; margin:4px 0 0; font:500 12.5px/1.4 var(--dp-face-body,'Instrument Sans'),sans-serif !important; }
/* Right gutter for the wallet only where there's room; phones keep full text width. */
@media (min-width:761px) { ${A} .k-title :is(.sf-cru-preview,.sf-cru-cradle) { margin-right:200px; } }
${A} .orr-armory-wallet span { color:#9edce9 !important; }
${A} .sf-cru-filters > button { color:rgb(198 224 236 / .82) !important; }
${A} .sf-cru-filters > button[aria-pressed=true] {
  color:#fff1cf !important; border-bottom:2px solid #e6ca8f !important;
  box-shadow:0 1px 0 0 rgb(242 185 80 / .35);
}
${A} .sf-cru-count { opacity:1 !important; color:#9edce9 !important; }
${A} .sf-cru-card.sf-cru-card { position:relative !important; }
${A} .sf-cru-card .sf-cru-name { color:#edf6fa !important; }
${A} .sf-cru-card .sf-cru-verb { color:#9edce9 !important; }
${A} .sf-cru-card .sf-cru-price { color:#f2b950 !important; }
${A} .sf-cru-card.is-lit {
  border-color:rgb(230 202 143 / .82) !important;
  background:linear-gradient(165deg, rgb(224 181 94 / .22) 0%, rgb(224 181 94 / .07) 60%, rgb(13 28 40 / .95) 100%) !important;
  box-shadow:inset 0 2px 0 #e6ca8f, inset 0 0 18px rgb(224 181 94 / .12), 0 6px 18px rgb(0 0 0 / .5) !important;
}
${A} .sf-cru-card.is-lit .sf-cru-name { color:#fff1cf !important; }
${A} .sf-cru-card.is-lit::before {
  content:'' !important; display:block !important; position:absolute !important;
  left:0 !important; top:10px !important; bottom:10px !important; width:2px !important;
  height:auto !important; transform:none !important; clip-path:none !important;
  background:#e6ca8f !important; box-shadow:0 0 8px rgb(242 185 80 / .45) !important;
}
${A} .orr-crew-item-label, ${A} .orr-crew-names, ${A} .orr-crew-status { color:rgb(198 224 236 / .84) !important; }
${A} .orr-armory-object-label { color:#9edce9 !important; }
${A} .orr-armory-reading__verb { color:#9edce9 !important; }
${A} .orr-armory-reading__act { color:rgb(198 224 236 / .86) !important; }
${A} .orr-armory-build { color:rgb(198 224 236 / .84) !important; }
${A} .orr-armory-build li small { color:#9edce9 !important; }
${A} .orr-armory-refusal { color:#f1b059 !important; }
${A} .orr-rail-divider { color:#9edce9 !important; }
${A} .orr-armory-empty { color:rgb(198 224 236 / .84) !important; }
${A} .orr-armory-reading__demo-word, ${A} .orr-armory-reading__hold-word { color:#d8eaf2 !important; }

/* Filters + search chrome */
${A} .sf-cru-search {
  border:1px solid rgb(154 198 218 / .32) !important; border-radius:2px !important;
  background:rgb(8 18 27 / .94) !important;
  color:#edf6fa !important;
}
${A} .sf-cru-search::placeholder { color:rgb(158 220 233 / .58) !important; opacity:1 !important; }
${A} .sf-cru-wallet { color:#f2b950 !important; }
${A} .orr-armory-reading__blurb { color:#edf6fa !important; }
${A} .orr-armory-fitline { color:#d8eaf2 !important; }
${A} .sf-cru-note { color:#d8eaf2 !important; }

/* 1080p lift — type/spacing without CSS zoom (door learned zoom clips the foot). */
@media (min-width:1800px) and (max-width:2199px) and (min-height:1000px) {
  ${A} { padding:24px 48px 18px !important; gap:18px 36px !important; }
  ${A} .k-title h1 { font-size:48px !important; }
  ${A} .k-title .sf-cru-sub { font-size:15px !important; }
  ${A} .orr-armory-wallet strong { font-size:40px; }
  ${A} .sf-cru-card.sf-cru-card { min-height:88px !important; padding:12px 10px 12px 14px !important; }
  ${A} .sf-cru-card .sf-cru-name { font-size:17px !important; }
  ${A} .orr-armory-purchase { min-height:50px; font-size:16px; }
  ${A} .orr-armory-reading__name { font-size:clamp(26px,2.4vw,38px) !important; }
  ${A} .k-foot .k-word { font-size:15px !important; }
}

/* —— UI polish: Crucible Refit (foot rail, keycaps, contrast, lit spare, 1080p lift) —— */
${R} > .k-foot {
  z-index:6 !important; padding:10px 16px !important;
  border:1px solid rgb(154 198 218 / .34) !important; border-radius:2px !important;
  background:linear-gradient(180deg, rgb(25 36 47 / .96) 0%, rgb(14 21 29 / .98) 100%) !important;
  box-shadow:inset 0 1px 0 rgb(215 238 248 / .20), 0 -10px 24px rgb(0 0 0 / .62) !important;
  isolation:isolate;
}
${R} .k-foot .k-words { position:relative; z-index:1; }
${R} .k-foot .k-word:not(.k-word--primary):not(.is-lamp) {
  display:inline-flex !important; align-items:center; min-height:38px; padding:0 14px;
  font:600 13px var(--dp-face-read) !important; letter-spacing:.08em !important; text-transform:uppercase !important;
  color:#d8eaf2 !important; font-weight:600 !important;
  background:linear-gradient(180deg, rgb(20 35 48 / .92) 0%, rgb(12 22 32 / .96) 100%) !important;
  border:1px solid rgb(154 198 218 / .34) !important; border-radius:2px !important;
  box-shadow:inset 0 1px 0 rgb(210 238 250 / .14) !important;
  transition:background var(--dp-d-cut, 80ms) linear, border-color var(--dp-d-cut, 80ms) linear, color var(--dp-d-cut, 80ms) linear;
}
${R} .k-foot .k-word:not(.k-word--primary):not(.is-lamp):is(:hover, :focus-visible) {
  color:#fff1cf !important;
  background:linear-gradient(180deg, rgb(28 48 66 / .95) 0%, rgb(16 30 43 / .98) 100%) !important;
  border-color:#e6ca8f !important;
}
${R} .k-foot .k-word:focus-visible { outline:1px solid #9edce9 !important; outline-offset:1px !important; }
${R} > .k-foot.sf-cru-foot.sf-cru-foot { padding-left:14px !important; padding-right:14px !important; margin-left:0 !important; margin-right:0 !important; }
${R} .k-foot .k-word.k-word--primary:not(.is-lamp) {
  display:inline-flex !important; align-items:center; min-height:42px; padding:0 22px;
  font:700 15px var(--dp-face-read) !important; letter-spacing:.12em !important; text-transform:uppercase !important;
  color:#fff1cf !important; font-weight:700 !important;
  text-shadow:none !important;
  background:linear-gradient(180deg, rgb(224 181 94 / .32) 0%, rgb(224 181 94 / .14) 100%) !important;
  border:1px solid #e6ca8f !important; border-radius:2px !important;
  clip-path:polygon(0 0, calc(100% - 10px) 0, 100% 10px, 100% 100%, 10px 100%, 0 calc(100% - 10px)) !important;
  box-shadow:inset 0 1px 0 rgb(255 241 207 / .30), 0 8px 22px rgb(0 0 0 / .55) !important;
  transition:background var(--dp-d-cut, 80ms) linear, box-shadow var(--dp-d-cut, 80ms) linear, border-color var(--dp-d-cut, 80ms) linear;
}
${R} .k-foot .k-word.k-word--primary .sf-cru-label { color:#fff1cf !important; text-shadow:none !important; }
${R} .k-foot .k-word.k-word--primary:not(.is-lamp):is(:hover, :focus-visible) {
  color:#ffffff !important;
  border-color:#ffd98c !important;
  background:linear-gradient(180deg, rgb(242 185 80 / .42) 0%, rgb(224 181 94 / .22) 100%) !important;
  box-shadow:inset 0 1px 0 rgb(255 248 228 / .45), 0 0 18px rgb(242 185 80 / .28) !important;
  text-shadow:none !important;
}
${R} .k-foot .sf-cru-fine, ${R} .k-foot .sf-cru-keynote {
  color:rgb(198 224 236 / .86) !important; position:relative; z-index:1; max-width:42ch;
}
${R} .k-foot .k-word--primary .sf-cru-kbd,
${R} .k-foot .k-word--primary.is-lamp .sf-cru-kbd {
  color:#ffe7b3 !important; border-color:rgb(230 202 143 / .55) !important; background:rgb(9 20 30 / .85) !important;
}
/* Keycaps — .sf-cru-kbd on foot verbs + Enter on lit FIT */
${R} .k-foot .sf-cru-kbd {
  display:inline-block !important; box-sizing:border-box !important;
  margin-left:10px !important; margin-right:0 !important;
  padding:3px 7px 4px !important; min-width:0 !important; height:auto !important;
  font:600 12px var(--dp-face-label) !important; letter-spacing:.06em !important;
  line-height:1 !important; text-transform:uppercase !important;
  color:#9edce9 !important; background:rgb(9 20 30 / .88) !important;
  border:1px solid rgb(158 220 233 / .42) !important; border-radius:2px !important;
  box-shadow:inset 0 -1px 0 rgb(0 0 0 / .35) !important; vertical-align:baseline !important;
  opacity:1 !important; text-shadow:none !important; place-items:unset !important;
}
${R} > .sf-cru-stage.orr-hull--on .sf-cru-row.is-lit .sf-cru-act:not(:disabled)::after {
  display:inline-block !important; box-sizing:border-box !important;
  margin-left:8px !important; padding:2px 6px 3px !important; min-width:0 !important;
  width:auto !important; height:auto !important;
  font:600 12px var(--dp-face-label) !important; letter-spacing:.06em !important;
  line-height:1 !important; text-transform:uppercase !important;
  color:#ffe7b3 !important; background:rgb(9 20 30 / .88) !important;
  border:1px solid rgb(230 202 143 / .55) !important; border-radius:2px !important;
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
${R} > .sf-cru-stage.orr-hull--on .orr-hull-fitcount { color:rgb(${BONE} / .84) !important; bottom:var(--orr-hull-count-bottom, 150px) !important; }
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
  ${R} > .sf-cru-stage.orr-hull--on .orr-hull-fitcount { bottom:var(--orr-hull-count-bottom, 178px) !important; }
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
  ${R} > .sf-cru-stage.orr-hull--on .orr-hull-fitcount { font-size:13px !important; bottom:var(--orr-hull-count-bottom, 172px); }
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
  ${A} .k-title h1 { font-size:30px !important; }
  ${A} .k-title .sf-cru-sub { font-size:13px !important; margin-top:4px !important; }
  ${A} .k-title { display:grid !important; grid-template-columns:auto minmax(0,1fr); column-gap:20px; align-items:baseline; }
  ${A} .k-title > :is(h1,.sf-cru-sub) { grid-column:1 / -1; }
  ${A} .k-title :is(.sf-cru-preview,.sf-cru-cradle) { margin:4px 0 0 !important; font-size:12px !important; line-height:1.4 !important; white-space:nowrap; overflow:hidden; text-overflow:ellipsis; }
  ${A} .k-title .sf-cru-cradle { grid-column:1; grid-row:3; }
  ${A} .k-title .sf-cru-preview { grid-column:2; grid-row:3; }
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
  ${A} .orr-armory-reading__compare { margin:4px 0 !important; }
  ${A} .orr-armory-reading__demo, ${A} .orr-armory-reading__hold { display:inline-block !important; vertical-align:top; margin:0 10px 0 0 !important; }
  ${A} .orr-armory-reading__buy { margin:6px 0 4px !important; }
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
  ${A} .k-title .sf-cru-preview { white-space:normal; display:-webkit-box !important; -webkit-box-orient:vertical; -webkit-line-clamp:2; line-clamp:2; }
  /* review: the keycaps (ESC, 1 2 3, TAB) were 11px; 12px in this band. */
  ${A} .k-foot .sf-cru-kbd, ${A} .sf-cru-fine .orr-armory-keycap { font-size:12px !important; letter-spacing:.12em !important; }
}
/* review: under ~800 wide the one-row foot is wider than the frame, and its right-packed verbs
   pushed LAUNCH ROUND off the left edge (761×500). There the key hints take a second row.
   polish384: the same right-pack + nowrap also ejects Launch (and Rearrange) off the left at
   960×500 — five foot verbs (~908px) fight the fine strip (~284px) inside a 912px foot. Extend
   the wrap/flex-start guard through ~1100 so Launch stays on-frame; fine drops to its own row. */
@media (min-width:761px) and (max-width:1100px) and (max-height:500px) {
  ${A} > .k-foot { flex-wrap:wrap !important; row-gap:4px !important; }
  ${A} .k-foot .k-words { justify-content:flex-start !important; flex-wrap:wrap !important; flex:1 1 auto !important; min-width:0 !important; }
  ${A} .sf-cru-fine { margin:0 !important; flex:1 0 100% !important; text-align:left !important; }
  /* the second foot row costs the height the two-line preview needs, so here it stays one line (PURCHASE stays on-frame) */
  ${A} .k-title .sf-cru-preview { display:block !important; white-space:nowrap; -webkit-line-clamp:unset; line-clamp:none; }
}
/* review: a phone's larger type at ≤400 tall (844×390 landscape) has no room for the second preview line either;
   it pushed PURCHASE half under the foot, so there it stays one line too. */
@media (min-width:761px) and (max-height:400px) {
  html[data-sf-mobile="1"] ${A.replace(/^html /, '')} > .k-title .sf-cru-preview { display:block !important; white-space:nowrap; -webkit-line-clamp:unset; line-clamp:none; }
}
/* Narrow desktop refit (480–699 wide, 600+ tall: 600×844, 640×1000). The jig's compact label
   columns are ~150px: a nowrap head ran "EMPTY THRUSTER M" off the left edge ("PTY"), the STRIP
   verb squeezed fitted names to a word per line, and the fit count hid under the two-row foot.
   Here the head wraps, the verb takes its own row under the name, and the name steps down to
   15px. Desktop only; selectors and IDs are unchanged. */
@media (min-width:480px) and (max-width:699px) and (min-height:600px) {
  ${RD} > .sf-cru-stage.orr-hull--on .k-row__name { flex-wrap:wrap !important; white-space:normal !important; row-gap:2px !important; }
  ${RD} > .sf-cru-stage.orr-hull--on .sf-cru-slottag { letter-spacing:.14em !important; }
  ${RD} > .sf-cru-stage.orr-hull--on .orr-hp__line { flex-wrap:wrap !important; row-gap:4px !important; }
  ${RD} > .sf-cru-stage.orr-hull--on .orr-hp__line > .orr-hp__value { flex:1 1 100% !important; }
  ${RD} > .sf-cru-stage.orr-hull--on .orr-hp__value { font-size:15px !important; }
  /* A focused SELL also carries an ENTER hint; keep the whole control inside its label. */
  ${RD} > .sf-cru-stage.orr-hull--on .sf-cru-act { max-width:100% !important; white-space:normal !important; }
  /* a spare's stat reads on the line under its name, not as a three-line sliver beside it */
  ${RD} > .sf-cru-stage.orr-hull--on .orr-hp__spare { flex-wrap:wrap !important; row-gap:0 !important; }
  ${RD} > .sf-cru-stage.orr-hull--on .orr-hp__spare-stat { flex:1 0 100% !important; }
  /* the "N of 8 fitted" engraving sat under the two-row foot; it rides just above it */
  ${RD} > .sf-cru-stage.orr-hull--on .orr-hull-fitcount { bottom:var(--orr-hull-count-bottom, 228px) !important; }
}

/* ── Armory polish (2026-11-06 frontend pass) ───────────────────────────────────────────────────────
   1. Dealt cards share one skeleton. The art face is a fixed band (it flexed, so a card with a short
      blurb grew a taller face and its name sat lower than its neighbours'); the blurb takes the slack and
      the facts pin to the card's foot.
   2. The head: key and price share the top line and the verb gets its own full line. Squeezed beside them
      the verb was cut to "SC…", "SU…", "CO…" — a status name is never truncated (STATION_STANDARD §6).
   3. The shortcut hint on the amber primary key reads dark-on-amber (it was pale-on-amber, ~1.3:1).
   4. Demo / Hold are real keys (hairline box, hover, focus), not two bare words over a rule.
   5. The reading's two columns keep a real gutter so the schematic's labels never touch the words. */
${A} .sf-cru-dealt .sf-cru-dealtface { flex:0 0 auto !important; min-height:140px !important; }
${A} .sf-cru-dealt .sf-cru-blurb { flex:1 1 auto !important; }
${A} .sf-cru-dealt .sf-cru-dealtface { min-width:0 !important; overflow:hidden !important; }
${A} .sf-cru-dealt .sf-cru-dealtface > .orr-equipment-glyph, ${A} .sf-cru-dealt .sf-cru-dealtface > svg { width:min(132px,100%) !important;
  height:auto !important; max-height:132px !important; aspect-ratio:1 / 1 !important; }
${A} .sf-cru-dealt .sf-cru-card.sf-cru-card--dealt { border-radius:2px !important; min-width:0 !important; }
${A} .sf-cru-dealt .sf-cru-cardhead { flex-wrap:wrap !important; row-gap:4px !important; align-items:center !important; }
${A} .sf-cru-dealt .sf-cru-cardhead .sf-cru-price { margin-left:auto !important; }
${A} .sf-cru-dealt .sf-cru-cardhead .sf-cru-verb { order:3; flex:1 0 100% !important; white-space:normal !important;
  overflow:visible !important; text-overflow:clip !important; letter-spacing:.08em !important; }
${A} .k-word--primary .sf-cru-kbd { color:#ffe7b3 !important; background:rgb(9 20 30 / .85) !important;
  border-color:rgb(230 202 143 / .55) !important; }
${A} :is(.orr-armory-reading__demo-word, .orr-armory-reading__hold-word) {
  display:inline-flex !important; align-items:center; box-sizing:border-box; min-height:34px !important; padding:0 14px !important;
  font:600 13px/1 var(--dp-face-read, "Instrument Sans", system-ui, sans-serif) !important; letter-spacing:.06em; text-transform:uppercase;
  color:#d8eaf2 !important; background:linear-gradient(180deg, rgb(20 35 48 / .92), rgb(12 22 32 / .96)) !important;
  border:1px solid rgb(154 198 218 / .34) !important; border-radius:2px !important; margin:0 8px 8px 0 !important; }
${A} :is(.orr-armory-reading__demo-word, .orr-armory-reading__hold-word):is(:hover, :focus-visible) {
  color:#fff1cf !important; background:linear-gradient(180deg, rgb(28 48 66 / .95), rgb(16 30 43 / .98)) !important; border-color:#e6ca8f !important; }
${A} .orr-armory-reading { gap:40px !important; }
/* a footer key that cannot be used (Re-roll with none left) must look disabled, not merely refuse a click */
${A} .k-foot .k-word:is(:disabled, [aria-disabled="true"]) { opacity:.45 !important; cursor:not-allowed !important; }
/* ── Crucible entry (the door), 821–960px tall ─────────────────────────────────────────────────────
   Mode, stake, arena and zone need ~650px; the panel has ~570 at 900. The Zone row was entirely hidden
   below the scroll edge and the arena names were cut mid-word, with nothing to say more was there.
   The ≤820 band below already trims tiles; this is the same grammar one step gentler, so all four rows
   are on screen at once. */
@media (min-height:821px) and (max-height:960px) {
  ${D}.sf-crucible-door .orr-prep-settings.orr-prep-settings.orr-prep-settings { gap:8px !important; }
  ${D} .k-row > .k-row__name { margin-bottom:4px !important; }
  ${D}.sf-crucible-door :is(.sf-crd-mode-sub, .sf-crd-stake-sub, .sf-crd-arena-sub, .sf-crd-hull-sub) { margin-top:4px !important; }
  ${D} .sf-crd-modes button.fh-tile.orr-tile { min-height:72px !important; padding:6px 8px !important; }
  ${D} .sf-crd-modes .fh-tile-art, ${D} .sf-crd-modes .fh-tile-art svg { height:32px !important; }
  ${D} .sf-crd-stakes .orr-tile { min-height:0 !important; padding:6px 8px !important; gap:2px !important; }
  ${D} .sf-crd-stake .fh-tile-art { display:none !important; }
  ${D} .orr-prep-stake-number { font-size:22px !important; }
  ${D} .sf-crd-arenas .orr-tile { min-height:38px !important; padding:4px 8px !important; gap:8px !important; }
  ${D} .sf-crd-arenas .fh-tile-art, ${D} .sf-crd-arenas .fh-tile-art img { height:24px !important; }
}
/* ui-polish-523: on a phone the four stakes split ~81px each, so CONTENDER and IRONBOUND were cut by the tile's
   chamfer clip, each purse broke into "2,400 / CR" and the payout line stacked four lines deep. The ladder reads
   as two rows of two there: every name, purse and payout line sits whole. */
@media (max-width:640px) {
  ${D} .sf-crd-stakes { grid-template-columns:repeat(2,minmax(0,1fr)) !important; }
}
/* a 900px-tall window: the centre column (pip spanner, glyph disc, label, hull jig) needs ~600px and had
   ~560, so the hull schematic was cropped by the footer. The disc and the jig are trimmed to fit. */
@media (max-height:960px) {
  ${A} .orr-armory-visual { gap:14px; }
  ${A} .orr-armory-item { min-height:170px; height:190px; }
  ${A} .orr-armory-item > .orr-equipment-glyph { width:140px; height:140px; }
  ${A} .orr-armory-reading__jig { height:200px !important; min-height:160px; }
}

/* —— UI polish: scored Rearm (three sky cards, no orr-armory) —— */
${RE} {
  background:
    radial-gradient(95% 75% at 50% 0%, rgb(20 44 62 / .38) 0%, transparent 68%),
    radial-gradient(80% 60% at 85% 100%, rgb(38 28 14 / .24) 0%, transparent 65%),
    repeating-linear-gradient(0deg, rgb(158 220 233 / .012) 0 1px, transparent 1px 4px),
    linear-gradient(180deg, #060d14 0%, #04080d 100%) !important;
}
${RE} > .k-foot {
  z-index:6 !important; position:relative !important; isolation:isolate;
  padding:10px 16px !important;
  border:1px solid rgb(154 198 218 / .34) !important; border-radius:2px !important;
  background:linear-gradient(180deg, rgb(25 36 47 / .96) 0%, rgb(14 21 29 / .98) 100%) !important;
  box-shadow:inset 0 1px 0 rgb(215 238 248 / .20), 0 -12px 24px rgb(0 0 0 / .62) !important;
}
${RE} .k-foot .k-words { position:relative; z-index:1; }
@media (max-height:560px) {
  ${RE} {
    gap:10px 16px !important;
    padding:12px 18px 8px !important;
    overflow:hidden !important;
    align-content:stretch !important;
  }
  ${RE} > .k-title { margin:0 !important; padding:0 !important; }
  ${RE} > .k-title h1, ${RE} > .k-title .k-t-title { font-size:clamp(24px, 5.5vh, 32px) !important; line-height:.92 !important; }
  ${RE} > .k-title .sf-cru-sub { font-size:12px !important; margin-top:2px !important; line-height:1.3 !important; }
  ${RE} > .sf-cru-stage {
    min-height:0 !important; overflow:hidden !important;
    display:flex !important; flex-direction:column !important;
  }
  ${RE} .sf-cru-cards {
    flex:1 1 auto !important; min-height:0 !important; max-height:100% !important;
    height:auto !important; overflow:auto !important; align-items:flex-start !important;
    gap:10px !important; padding:4px 4px 24px !important;
    scroll-padding:4px 4px 24px; overscroll-behavior:contain; scrollbar-width:thin;
    -webkit-mask-image:linear-gradient(180deg, #000 0, #000 calc(100% - 18px), transparent 100%) !important;
    mask-image:linear-gradient(180deg, #000 0, #000 calc(100% - 18px), transparent 100%) !important;
  }
  ${RE} .sf-cru-card.sf-cru-card {
    min-height:0 !important; height:auto !important; max-height:none !important;
    padding:6px 6px 8px 10px !important; gap:3px !important; overflow:visible !important;
  }
  ${RE} .sf-cru-card:focus-visible { outline:1px solid #e6ca8f !important; outline-offset:1px; }
  ${RE} .sf-cru-card :is(.sf-cru-name, .sf-cru-blurb, .sf-cru-activation, .sf-cru-slot) {
    white-space:normal !important; overflow-wrap:anywhere;
  }
  ${RE} .sf-cru-card > .orr-equipment-glyph, ${RE} .sf-cru-card > svg.orr-equipment-glyph {
    width:36px !important; height:36px !important; flex:none !important;
  }
  ${RE} .sf-cru-card .sf-cru-cardhead { min-height:0 !important; gap:6px !important; }
  ${RE} .sf-cru-card .sf-cru-verb { font-size:12px !important; letter-spacing:.12em !important; }
  ${RE} .sf-cru-card .sf-cru-name { font-size:15px !important; line-height:1.15 !important; }
  ${RE} .sf-cru-card .sf-cru-blurb {
    font-size:12px !important; line-height:1.3 !important;
    display:block !important; -webkit-line-clamp:unset; line-clamp:unset;
    overflow:visible !important;
  }
  ${RE} .sf-cru-card .sf-cru-activation { font-size:12px !important; margin-block:2px !important; line-height:1.25 !important; }
  ${RE} > .k-foot {
    z-index:8 !important; flex:none !important;
    padding:8px 12px 6px !important;
    background:linear-gradient(180deg, rgb(25 36 47 / .96) 0%, rgb(14 21 29 / .98) 100%) !important;
    box-shadow:0 48px 0 0 #04080d, 0 -24px 24px -2px rgb(4 8 13 / .95) !important;
  }
  ${RE} > .k-foot::before {
    content:'' !important; display:block !important; pointer-events:none !important;
    position:absolute !important; left:0 !important; right:0 !important; bottom:100% !important;
    height:22px !important;
    background:linear-gradient(180deg, transparent, #04080d) !important;
  }
  ${RE} .k-foot .k-words { flex-wrap:wrap !important; gap:8px 14px !important; align-items:center !important; }
  ${RE} .k-foot .k-word { font-size:13px !important; min-height:32px !important; padding:0 10px !important; }
  ${RE} .k-foot .sf-cru-kbd { margin-left:6px !important; font-size:12px !important; }
  ${RE} .sf-cru-fine, ${RE} .orr-armory-wallet { font-size:12px !important; }
}
/* Narrow+short: foot verbs were wrapping to ~84px and stealing stage height; keep one compact row when possible. */
@media (min-width:641px) and (max-width:820px) and (max-height:560px) {
  ${RE} .k-foot .k-words { gap:8px 12px !important; }
  ${RE} .k-foot .k-word { font-size:12px !important; min-height:30px !important; padding:0 8px !important; white-space:normal !important; }
}
/* The service bay. The dealt hand and the searchable stock share a single inspection desk. */
${A} .orr-armory-body { display:contents; }
${A} {
  --armory-rule:rgb(154 198 218 / .32);
  --armory-cool:#9edce9;
  --armory-panel:rgb(11 24 35 / .95);
  box-sizing:border-box;
  grid-template-columns:minmax(0,1.58fr) minmax(330px,1fr) !important;
  gap:clamp(12px,1.8vh,20px) clamp(18px,2vw,32px) !important;
  padding:clamp(16px,2.4vh,28px) clamp(20px,3.2vw,56px) 16px !important;
  background:
    radial-gradient(95% 75% at 50% 0%, rgb(20 44 62 / .38) 0%, transparent 68%),
    radial-gradient(80% 60% at 85% 100%, rgb(38 28 14 / .24) 0%, transparent 65%),
    repeating-linear-gradient(0deg, rgb(158 220 233 / .012) 0 1px, transparent 1px 4px),
    linear-gradient(180deg, #060d14 0%, #04080d 100%) !important;
}
${A}::before {
  background:linear-gradient(0deg,#050b11 10%,rgb(6 13 20 / .16) 84%),
    linear-gradient(90deg,#050b11 8%,rgb(6 13 20 / .76) 38%,transparent 65%),
    url("${WORKSHOP_URL}") right 52% / cover no-repeat !important;
  height:clamp(150px,24vh,320px) !important; inset:0 0 auto !important;
}
${A} .k-title {
  min-height:clamp(102px,15vh,164px); align-self:start; box-sizing:border-box;
  padding:10px 18px 12px !important;
  border:1px solid rgb(154 198 218 / .34); border-radius:2px;
  background:
    linear-gradient(90deg, #f2b950 0 28px, rgb(158 220 233 / .48) 28px 160px, rgb(158 220 233 / .14) 160px 100%) top left / 100% 2px no-repeat,
    linear-gradient(180deg, rgb(25 36 47 / .94) 0%, rgb(14 21 29 / .97) 100%);
  box-shadow:inset 0 1px 0 rgb(215 238 248 / .18), inset 0 -2px 0 rgb(2 5 8 / .85), 0 10px 24px rgb(0 0 0 / .55);
}
${A} .k-title h1 { font:820 clamp(34px,3.8vw,60px)/.98 var(--dp-face-display,'Archivo'),sans-serif !important; letter-spacing:-.04em !important; color:#edf6fa !important; }
${A} .k-title .sf-cru-sub { max-width:66ch; margin:6px 190px 4px 0 !important; font:500 14px/1.4 var(--dp-face-read,'Instrument Sans'),sans-serif !important; }
${A} .k-title .sf-cru-cradle { font:600 13px/1.4 var(--dp-face-read,'Instrument Sans'),sans-serif !important; color:#9edce9 !important; }
${A} .orr-armory-briefing { max-width:70ch; margin:4px 0; color:#edf6fa; }
${A} .orr-armory-briefing summary { width:fit-content; padding:4px 4px 4px 0; font:600 13px/1.4 var(--dp-face-read),sans-serif; color:#9edce9; cursor:pointer; }
${A} .k-title .sf-cru-preview { margin:4px 0 4px !important; padding:8px 12px; border:1px solid rgb(154 198 218 / .26); border-left:2px solid #9edce9; border-radius:2px; background:rgb(8 19 29 / .94); white-space:normal !important; overflow:visible !important; display:block !important; }
${A} .orr-armory-wallet { position:absolute; top:10px; right:14px; min-width:128px; padding:10px 14px; margin:0; display:grid; gap:3px; background:linear-gradient(160deg, rgb(12 26 38 / .96), rgb(7 16 24 / .98)); border:1px solid rgb(154 198 218 / .34); border-top:2px solid #f2b950; border-radius:2px; box-shadow:inset 0 1px 0 rgb(208 238 250 / .14), 0 8px 20px rgb(0 0 0 / .5); text-align:left; }
${A} .orr-armory-wallet .orr-wallet-caption { margin:0; font:600 12px/1.3 var(--dp-face-read),sans-serif; color:#9edce9 !important; letter-spacing:.1em; text-transform:uppercase; }
${A} .orr-armory-wallet strong { display:flex; align-items:baseline; gap:6px; font:720 clamp(24px,2.2vw,36px)/1 var(--dp-face-display,'Archivo'),sans-serif; font-variation-settings:normal; letter-spacing:-.03em; color:#fff1cf; }
${A} .orr-armory-wallet .orr-wallet-amount { display:inline; margin:0; font:inherit; color:inherit !important; letter-spacing:inherit; font-variant-numeric:tabular-nums lining-nums; }
${A} .orr-armory-wallet small { font:650 13px/1 var(--dp-face-read),sans-serif; color:#f2b950; letter-spacing:.08em; text-transform:uppercase; }
${A} .sf-cru-stage { overflow:auto !important; overscroll-behavior:contain; padding:1px 4px 64px 1px !important; -webkit-mask-image:linear-gradient(to bottom,#000 calc(100% - 56px),transparent) !important; mask-image:linear-gradient(to bottom,#000 calc(100% - 56px),transparent) !important; }
${A} .orr-armory-section { font:700 18px/1.2 var(--dp-face-display),sans-serif; letter-spacing:.04em; text-transform:uppercase; color:#9edce9; margin:0 0 12px; flex:none; }
${A} .sf-cru-circuit { padding:12px 16px; margin:0 0 14px; border:1px solid var(--armory-rule); border-radius:2px; background:var(--armory-panel); }
${A} .sf-cru-circuit-options[hidden] { display:none !important; }
${A} .sf-cru-circuit-options > .sf-cru-circuit { margin:4px 0 0; }
${A} .sf-cru-circuit__choices { align-items:start; gap:10px 14px; }
${A} .sf-cru-circuit__choice { display:grid; gap:5px; min-width:0; }
${A} .sf-cru-circuit__choice > .k-word { width:fit-content; padding:6px 10px; border:1px solid var(--armory-rule); border-radius:2px; }
${A} .sf-cru-circuit__line { margin:0; }
${A} .sf-cru-dealt { gap:clamp(8px,1.1vw,16px) !important; margin:0 !important; }
${A} .sf-cru-dealt .sf-cru-card.sf-cru-card--dealt {
  box-sizing:border-box; padding:0 clamp(12px,1.1vw,18px) 14px !important; gap:8px !important;
  min-width:0; min-height:0 !important;
  border:1px solid rgb(154 198 218 / .32) !important; border-radius:2px !important;
  background:
    linear-gradient(90deg, #f2b950 0 26px, rgb(158 220 233 / .48) 26px 130px, rgb(158 220 233 / .14) 130px 100%) top left / 100% 2px no-repeat,
    repeating-linear-gradient(0deg, rgb(158 220 233 / .012) 0 1px, transparent 1px 3px),
    radial-gradient(120% 90% at 18% 0%, rgb(24 54 74 / .34), transparent 62%),
    linear-gradient(160deg, rgb(12 26 38 / .96) 0%, rgb(7 16 24 / .98) 100%) !important;
  box-shadow:inset 0 1px 0 rgb(208 238 250 / .14), inset 0 -2px 0 rgb(2 6 10 / .85), 0 12px 26px rgb(0 0 0 / .56) !important;
}
${A} .sf-cru-dealt .sf-cru-card.sf-cru-card--dealt:is(:hover,:focus-visible) {
  border-color:rgb(158 220 233 / .68) !important;
}
${A} .sf-cru-dealt .sf-cru-card.sf-cru-card--dealt:is(.is-lit, .is-inspecting, [aria-pressed="true"]) {
  border:1px solid rgb(230 202 143 / .86) !important;
  background:
    linear-gradient(165deg, rgb(224 181 94 / .22) 0%, rgb(224 181 94 / .07) 58%, rgb(12 26 38 / .96) 100%) !important;
  box-shadow:inset 0 2px 0 #e6ca8f, inset 0 0 18px rgb(224 181 94 / .14), 0 10px 24px rgb(0 0 0 / .58) !important;
}
${A} :is(.sf-cru-dealt .sf-cru-card.sf-cru-card--dealt, .sf-cru-cards .sf-cru-card):focus-visible { outline:1px solid #9edce9 !important; outline-offset:1px !important; }
${A} .sf-cru-dealt .sf-cru-card.sf-cru-card--dealt::before { display:none !important; }
${A} .sf-cru-dealt .sf-cru-dealtface,
${A} .sf-cru-dealt .sf-cru-card__art {
  min-height:0 !important; height:clamp(100px,12.5vw,220px); width:auto; position:relative;
  margin:2px calc(-1 * clamp(12px,1.1vw,18px)) 4px !important;
  background:
    repeating-linear-gradient(0deg, rgb(158 220 233 / .015) 0 1px, transparent 1px 3px),
    radial-gradient(ellipse at 50% 56%, rgb(var(--sf-thumb-rgb, 158 220 233) / .24) 0%, rgb(19 41 58 / .92) 45%, rgb(8 17 26 / .98) 85%);
  border-bottom:1px solid rgb(154 198 218 / .28) !important; overflow:hidden;
}
${A} .orr-equipment-plate { position:relative; display:grid; width:100%; height:100%; min-height:0; min-width:0; place-items:center; }
${A} .orr-equipment-plate > img { position:absolute; inset:6% 6%; width:88%; height:88%; object-fit:contain; filter:drop-shadow(0 6px 14px rgb(0 0 0 / .65)); }
${A} .orr-equipment-plate > .orr-equipment-glyph { position:absolute; left:7px; bottom:7px; width:27px; height:27px; box-sizing:border-box; padding:4px; color:#9edce9; border:1px solid rgb(154 198 218 / .34); border-radius:2px; background:rgb(8 18 27 / .92); }
${A} .orr-equipment-plate.is-schematic > .orr-equipment-glyph { position:static; width:64%; height:68%; background:none; border:none; }
${A} .sf-cru-dealt .sf-cru-dealtface > .orr-equipment-glyph { width:50% !important; height:60% !important; color:#9edce9; }
${A} .sf-cru-dealt .sf-cru-cardhead { min-height:0 !important; }
${A} .sf-cru-dealt :is(.sf-cru-key, .sf-cru-card__key) {
  display:inline-grid !important; place-items:center !important;
  width:22px !important; height:22px !important; min-width:22px !important;
  padding:0 4px !important; margin:0 !important;
  border:1px solid rgb(158 220 233 / .45) !important; border-radius:2px !important;
  background:rgb(13 28 40 / .92) !important;
  box-shadow:inset 0 1px 0 rgb(215 238 248 / .16), inset 0 -1px 0 rgb(2 6 10 / .8) !important;
  color:#9edce9 !important; font:700 12px/1 var(--dp-face-numeral) !important;
}
${A} .sf-cru-dealt .sf-cru-card--dealt:is(.is-lit, .is-inspecting) :is(.sf-cru-key, .sf-cru-card__key) {
  border-color:#e6ca8f !important; background:rgb(224 181 94 / .24) !important; color:#fff1cf !important;
}
${A} .sf-cru-dealt .sf-cru-verb { color:#9edce9 !important; }
${A} .sf-cru-dealt .sf-cru-card--dealt:is(.is-lit, .is-inspecting) .sf-cru-verb { color:#f2b950 !important; }
${A} .sf-cru-dealt .sf-cru-cardhead .sf-cru-price { font:700 16px/1.2 var(--dp-face-read),sans-serif !important; color:#f2b950 !important; font-variant-numeric:tabular-nums; letter-spacing:0 !important; }
${A} .sf-cru-dealt .sf-cru-name { font:720 clamp(17px,1.5vw,25px)/1.12 var(--dp-face-display),sans-serif !important; font-variation-settings:normal !important; overflow:visible !important; color:#edf6fa !important; }
${A} .sf-cru-dealt .sf-cru-card--dealt:is(.is-lit, .is-inspecting) .sf-cru-name { color:#fff1cf !important; }
${A} .sf-cru-dealt .sf-cru-blurb { padding:0 0 8px; color:rgb(214 234 244 / .88) !important; }
${A} .sf-cru-dealt .sf-cru-activation { border-top:1px solid rgb(154 198 218 / .24); padding-top:8px; color:rgb(198 224 236 / .82) !important; }
${A} .sf-cru-dealt .sf-cru-card--dealt:is(.is-unavail,.is-fitted) { opacity:1 !important; }
${A} .sf-cru-card.is-unavail .sf-cru-price, ${A} .sf-cru-dealt .sf-cru-afford { color:#f1b059 !important; }
${A} .sf-cru-dealt .is-unavail .sf-cru-dealtface { background:rgb(9 19 28 / .95); }
${A} .sf-cru-note:empty { min-height:0; margin:0 !important; }
${A} .sf-cru-stage > .sf-cru-cards { padding:4px !important; }
${A} .sf-cru-cards .sf-cru-card { border:1px solid rgb(154 198 218 / .26) !important; border-radius:2px !important; padding:8px 14px !important; background:linear-gradient(160deg, rgb(12 26 38 / .94), rgb(8 17 26 / .97)) !important; min-height:66px !important; box-shadow:inset 0 1px 0 rgb(208 238 250 / .10) !important; }
${A} .sf-cru-cards .sf-cru-card + .sf-cru-card { margin-top:4px !important; }
${A} .sf-cru-stage > .sf-cru-cards { padding-bottom:64px !important; -webkit-mask-image:linear-gradient(to bottom,#000 calc(100% - 56px),transparent) !important; mask-image:linear-gradient(to bottom,#000 calc(100% - 56px),transparent) !important; }
${A} .orr-armory-reading.orr-armory-reading { -webkit-mask-image:none !important; mask-image:none !important; }
${A} .orr-armory-reading > :last-child { margin-bottom:6px; }
@media (max-width:760px) {
  ${A} .orr-armory-reading.orr-armory-reading { -webkit-mask-image:none !important; mask-image:none !important; }
  ${A} .orr-armory-reading > :last-child { margin-bottom:0; }
  ${A} .sf-cru-stage { -webkit-mask-image:none !important; mask-image:none !important; padding-bottom:0 !important; }
}
${A} .sf-cru-cards .sf-cru-card:is(.is-lit,:focus-visible) { border-color:rgb(230 202 143 / .82) !important; }
${A} .sf-cru-cards .sf-cru-card.is-unavail { opacity:.82 !important; }
${A} .sf-cru-cards .orr-equipment-glyph { color:#9edce9; }
${A} .orr-armory-reading.orr-armory-reading {
  display:grid !important; grid-template-columns:minmax(0,1fr) !important; grid-template-rows:none !important;
  grid-auto-rows:max-content !important; gap:0 !important; align-content:start; box-sizing:border-box;
  background:
    linear-gradient(90deg, #f2b950 0 28px, rgb(158 220 233 / .48) 28px 140px, rgb(158 220 233 / .14) 140px 100%) top left / 100% 2px no-repeat,
    repeating-linear-gradient(0deg, rgb(158 220 233 / .012) 0 1px, transparent 1px 3px),
    radial-gradient(120% 90% at 18% 0%, rgb(24 54 74 / .34), transparent 62%),
    linear-gradient(160deg, rgb(11 24 35 / .95) 0%, rgb(7 16 24 / .98) 100%) !important;
  border:1px solid rgb(154 198 218 / .34) !important;
  border-radius:2px !important;
  box-shadow:inset 0 1px 0 rgb(208 238 250 / .14), inset 0 -2px 0 rgb(2 6 10 / .85), 0 12px 28px rgb(0 0 0 / .58) !important;
  padding:clamp(12px,1.2vw,18px) !important;
}
${A} .orr-armory-reading.orr-armory-reading[hidden] { display:none !important; }
${A} .orr-armory-reading__words { order:0; }
${A} .orr-armory-reading__verb { color:#9edce9 !important; }
${A} .orr-armory-reading__name { font-variation-settings:normal; margin:4px 0 6px !important; color:#edf6fa !important; }
${A} .orr-armory-reading__compare, ${A} .orr-armory-reading__budget, ${A} .orr-armory-deltas {
  margin:6px 0 !important; padding:6px 10px;
  border:1px solid rgb(154 198 218 / .28); border-radius:2px;
  background:rgb(7 16 24 / .9);
  box-shadow:inset 0 1px 0 rgb(208 238 250 / .08);
}
${A} .orr-armory-reading__buy { margin:6px 0 !important; }
${A} .orr-armory-visual { display:grid; grid-template-columns:100%; gap:3px; margin:0 0 8px; width:100%; order:1; }
@media (max-height:800px) {
  ${A}:has(.sf-cru-dealt:not([hidden])) .orr-armory-visual:not(:has(video)) { display:none; }
}
${A} .orr-armory-item { width:100%; height:clamp(84px,10.2vh,118px); min-height:0; background:radial-gradient(ellipse, rgb(24 54 74 / .55), rgb(8 18 27 / .96) 76%); margin:4px 0 0; border:1px solid rgb(154 198 218 / .28); border-radius:2px; overflow:hidden; }
${A} .orr-armory-item::before { display:none; }
${A} .orr-armory-object-label { display:block; }
${A} .orr-armory-support { order:2; margin-top:4px; border-top:1px solid rgb(154 198 218 / .26); }
${A} .orr-pip-spanner { border-top:1px solid rgb(154 198 218 / .26); padding:6px 0 4px; color:#9edce9 !important; }
${A} .orr-pip-spanner > svg { height:46px !important; }
${A} .orr-armory-reading__jig { width:100% !important; height:clamp(112px,14vh,154px) !important; min-height:96px !important; }
${A} .orr-crew-names { white-space:normal; color:#9edce9 !important; font-weight:600 !important; }
${A} .orr-crew-status { color:rgb(198 222 234 / .88) !important; margin:2px 0 0 !important; }
${A} .orr-armory-purchase {
  clip-path:polygon(0 0, calc(100% - 10px) 0, 100% 10px, 100% 100%, 10px 100%, 0 calc(100% - 10px)) !important;
  border:1px solid #e6ca8f !important; border-radius:2px !important;
  background:linear-gradient(180deg, rgb(224 181 94 / .32) 0%, rgb(224 181 94 / .14) 100%) !important;
  box-shadow:inset 0 1px 0 rgb(255 241 207 / .35), 0 8px 20px rgb(0 0 0 / .55) !important;
  color:#fff1cf !important; font-weight:700 !important;
  letter-spacing:.12em !important; text-transform:uppercase !important;
}
/* Gauntlet Rearm cards: feature rich hardware plate alongside clean type hierarchy */
${RE} .sf-cru-cards .sf-cru-card.sf-cru-card { display:grid !important; grid-template-columns:76px minmax(0,1fr) !important; grid-auto-rows:max-content !important; column-gap:16px !important; row-gap:4px !important; align-content:start !important; border:1px solid rgb(154 198 218 / .30) !important; border-radius:2px !important; background:linear-gradient(160deg, rgb(12 26 38 / .94), rgb(8 17 26 / .97)) !important; padding:12px 14px !important; }
${RE} .sf-cru-card > .sf-thumb.orr-rearm-card-thumb { grid-column:1; grid-row:1 / span 5; align-self:start; }
${RE} .sf-cru-card > :not(.sf-thumb) { grid-column:2; min-width:0; }
${A} .orr-armory-purchase:disabled {
  border-color:rgb(154 198 218 / .24) !important;
  background:linear-gradient(180deg, rgb(18 30 40 / .78), rgb(11 19 27 / .88)) !important;
  color:rgb(172 205 220 / .55) !important;
  box-shadow:none !important;
}
${A} .orr-armory-purchase:enabled:is(:hover,:focus-visible) {
  border-color:#ffd98c !important;
  background:linear-gradient(180deg, rgb(242 185 80 / .44) 0%, rgb(224 181 94 / .22) 100%) !important;
  box-shadow:inset 0 1px 0 rgb(255 248 228 / .5), 0 0 18px rgb(242 185 80 / .28) !important;
  color:#ffffff !important;
}
${A} > .k-foot:has(.orr-armory-launch-summary:not([hidden])) { flex-wrap:wrap !important; row-gap:6px !important; }
${A} .orr-armory-launch-summary {
  flex:1 0 100%; min-width:0; margin:0;
  color:#d8eaf2; font:500 13px/1.4 var(--dp-face-read,'Instrument Sans'),sans-serif;
  overflow-wrap:anywhere;
}
${A} .k-foot .k-words { flex-wrap:wrap !important; gap:8px 12px !important; }
/* Segmented 7px visor telemetry tracks for FIRE / IMPACT stat bars */
${A} .orr-armory-compare__word { fill:#9edce9 !important; font-size:12px !important; font-weight:700 !important; letter-spacing:.16em !important; }
${A} .orr-armory-compare__track { stroke:rgb(154 198 218 / .24) !important; stroke-width:7px !important; stroke-linecap:butt !important; }
${A} .orr-armory-compare__fill { stroke:#9edce9 !important; stroke-width:7px !important; stroke-linecap:butt !important; stroke-dasharray:10 2 !important; filter:drop-shadow(0 0 4px rgb(158 220 233 / .35)); }
${A} .orr-armory-compare__mark { stroke:#f2b950 !important; stroke-width:3px !important; }
${A} .orr-armory-compare__fitted { stroke:#edf6fa !important; stroke-width:2px !important; }
${A} .orr-armory-compare__val { fill:#fff1cf !important; font-size:15px !important; font-weight:700 !important; }
${A} .orr-armory-compare__delta { fill:#9edce9 !important; font-size:12px !important; font-weight:700 !important; }
${A} .orr-armory-budget__track { stroke:rgb(154 198 218 / .22) !important; stroke-width:6px !important; }
${A} .orr-armory-budget__keep { stroke:#9edce9 !important; stroke-width:6px !important; }
${A} .orr-armory-budget__spend { stroke:#f2b950 !important; stroke-width:6px !important; }
@media (min-width:761px) and (max-width:1080px) {
  ${A} { grid-template-columns:minmax(0,1.25fr) minmax(300px,.9fr) !important; }
  ${A} .sf-cru-dealt { grid-template-columns:1fr !important; }
}
@media (max-width:760px) {
  ${A} { display:grid !important; grid-template-columns:minmax(0,1fr) !important; grid-template-rows:minmax(0,1fr) auto !important; padding:12px !important; gap:8px !important; overflow:hidden !important; }
  ${A} .orr-armory-body { grid-area:1 / 1; display:flex; flex-direction:column; gap:16px; overflow:auto; min-height:0; min-width:0; scrollbar-width:thin; }
  ${A} .orr-armory-body > * { flex:none; }
  ${A} .k-title { flex:none !important; height:auto !important; min-height:0; width:100%; }
  ${A} .k-title h1 { padding:4px 114px 2px 0; font-size:clamp(32px,9vw,52px) !important; }
  ${A} .k-title .sf-cru-sub { margin:14px 0 5px !important; }
  ${A} .orr-armory-wallet { min-width:78px; padding:5px 10px; }
  ${A} .orr-armory-wallet strong { font-size:24px; }
  ${A} .orr-armory-section { font-size:18px; margin:0 0 10px; }
  ${A} .sf-cru-stage { height:auto !important; overflow:visible !important; }
  ${A} > .k-foot { grid-area:2 / 1 !important; position:relative !important; inset:auto !important; z-index:8; padding:6px !important; border:1px solid var(--armory-rule); background:linear-gradient(180deg, rgb(25 36 47 / .96), rgb(14 21 29 / .98)) !important; box-shadow:none !important; }
  ${A} .k-foot .k-words { flex-wrap:wrap !important; gap:4px !important; justify-content:flex-start !important; }
  ${A} .k-foot .k-words > li { flex:1 0 auto !important; }
  ${A} .k-foot .k-words > li > .k-word { justify-content:center !important; width:100%; font-size:12px !important; min-height:34px !important; padding:6px 8px !important; }
  ${A} .k-foot .k-words > li:has(.k-word--primary), ${A} .k-foot .k-words > li:has([aria-expanded]) { order:-1; }
  ${A} .k-foot .sf-cru-kbd { display:none !important; }
  ${A} .sf-cru-stage > .sf-cru-cards:not([hidden]) { flex:auto !important; height:clamp(255px,50svh,500px) !important; max-height:clamp(255px,50svh,500px) !important; }
  ${A} .sf-cru-dealt { grid-template-columns:1fr !important; }
  ${A} .orr-armory-reading.orr-armory-reading { overflow:visible !important; height:auto !important; }
  ${A} .k-foot .sf-cru-fine { display:none !important; }
}
@media (max-width:1080px) {
  ${A} .sf-cru-dealt .sf-cru-card.sf-cru-card--dealt {
    display:grid !important; grid-template-columns:clamp(80px,20%,120px) minmax(0,1fr) !important;
    grid-template-rows:auto !important; grid-auto-rows:auto; column-gap:12px !important; row-gap:4px !important; padding:10px !important;
  }
  ${A} .sf-cru-dealt .sf-cru-dealtface { grid-column:1; grid-row:1 / span 8; align-self:stretch; width:100%; height:auto; min-height:92px !important; margin:0 !important; border:1px solid var(--armory-rule); }
  ${A} .sf-cru-dealt .sf-cru-card--dealt > :not(.sf-cru-dealtface) { grid-column:2 !important; grid-row:auto !important; }
  ${A} .sf-cru-dealt .sf-cru-cardhead { flex-wrap:nowrap !important; }
  ${A} .sf-cru-dealt .sf-cru-card--dealt :is(.sf-cru-activation,.sf-cru-slot) { display:none !important; }
  ${A} .sf-cru-dealt .sf-cru-card--dealt .sf-cru-blurb { font-size:13px !important; line-height:1.35 !important; }
  ${A} .sf-cru-dealt .sf-cru-dealtface { grid-row:1 / span 4; }
  ${A} .sf-cru-fine .orr-armory-keycap, ${A} .sf-cru-fine .orr-armory-hintword { white-space:nowrap; }
  ${A} .sf-cru-dealt .sf-cru-cardhead .sf-cru-verb { order:0; flex:1 !important; }
  ${A} .sf-cru-dealt .sf-cru-name { margin:0 !important; }
  ${A} .sf-cru-dealt .sf-cru-activation { padding-top:4px; }
  ${A} .sf-cru-dealt .sf-cru-blurb { padding-bottom:0; }
}
@media (min-width:1081px) and (max-height:780px) {
  ${A} .sf-cru-dealt .sf-cru-dealtface { height:clamp(96px,16vh,125px); }
  ${A} .sf-cru-dealt .sf-cru-card--dealt :is(.sf-cru-activation,.sf-cru-slot) { display:none !important; }
}
@media (min-width:761px) and (max-height:600px) {
  ${A} { gap:8px 16px !important; padding-block:10px !important; }
  ${A} .k-title { min-height:0; display:block !important; padding-bottom:5px !important; }
  ${A} .k-title h1 { font-size:34px !important; }
  ${A} .k-title .sf-cru-sub { font-size:13px !important; margin-top:4px !important; }
  ${A} .orr-armory-section { margin:0 0 6px; }
  ${A} .sf-cru-dealt .sf-cru-card--dealt .sf-cru-blurb { display:none !important; }
  ${A} .sf-cru-dealt .sf-cru-dealtface { min-height:65px !important; }
  ${A} .k-foot { gap:5px !important; }
  ${A} .k-foot .k-words { flex:1 1 auto !important; gap:4px 6px !important; justify-content:flex-start !important; }
  ${A} .k-foot .k-words .k-word { min-height:34px !important; padding:4px 9px !important; font-size:13px !important; }
}
/* Landscape handhelds keep all three offers beside the inspector and its install key. */
@media (min-width:560px) and (max-height:500px) and (orientation:landscape) {
  ${A} { display:grid !important; grid-template: auto minmax(0,1fr) auto / minmax(0,1.1fr) minmax(0,1fr) !important; gap:6px 12px !important; padding:8px 12px !important; overflow:hidden !important; }
  ${A} .orr-armory-body { display:contents; }
  ${A} .k-title { grid-area:1 / 1 / 2 / -1 !important; position:relative; display:block !important; min-height:0; padding:0 112px 5px 0 !important; }
  ${A} .k-title h1 { display:inline; padding:0; margin:0 !important; font-size:31px !important; }
  ${A} .k-title .sf-cru-sub { display:none !important; }
  ${A} .k-title .sf-cru-cradle { display:block; margin:2px 0 0 !important; font-size:12px !important; }
  ${A} .k-title .orr-armory-briefing { display:inline-block; margin:0 0 0 14px; vertical-align:middle; }
  ${A} .orr-armory-briefing[open] > .sf-cru-preview { position:absolute; z-index:10; top:100%; left:0; width:min(420px,100%); box-sizing:border-box; border:1px solid var(--armory-rule); }
  ${A} .k-title .sf-cru-circuit-options[open] > .sf-cru-circuit { position:absolute; z-index:11; top:100%; left:0; width:min(420px,100%); max-height:55svh !important; box-sizing:border-box; }
  ${A} .orr-armory-wallet { min-width:86px; padding:4px 9px; }
  ${A} .orr-armory-wallet strong { font-size:23px; }
  ${A} .sf-cru-stage { grid-area:2 / 1 !important; min-height:0 !important; height:100% !important; overflow:auto !important; }
  ${A} .orr-armory-section { font-size:16px; margin:0 0 5px; }
  ${A} .sf-cru-dealt { display:grid !important; grid-template-columns:1fr !important; gap:5px !important; }
  ${A} .sf-cru-dealt[hidden] { display:none !important; }
  ${A} .sf-cru-dealt .sf-cru-card.sf-cru-card--dealt { display:grid !important; grid-template: auto auto / 46px minmax(0,1fr) !important; align-content:center; column-gap:9px !important; row-gap:1px !important; padding:5px 8px !important; }
  ${A} .sf-cru-dealt .sf-cru-dealtface { grid-area:1 / 1 / span 2 / 2 !important; align-self:center; height:43px; width:46px; min-height:0 !important; margin:0 !important; border:1px solid var(--armory-rule); }
  ${A} .sf-cru-dealt .sf-cru-dealtface .orr-equipment-glyph { display:none; }
  ${A} .sf-cru-dealt .sf-cru-dealtface .is-schematic > .orr-equipment-glyph { display:block; }
  ${A} .sf-cru-dealt .sf-cru-cardhead { grid-area:1 / 2 !important; }
  ${A} .sf-cru-dealt .sf-cru-name { grid-area:2 / 2 !important; margin:0 !important; font-size:16px !important; }
  ${A} .sf-cru-dealt .sf-cru-card--dealt :is(.sf-cru-blurb,.sf-cru-activation,.sf-cru-slot,.sf-cru-afford) { display:none !important; }
  ${A} .sf-cru-stage > .sf-cru-cards:not([hidden]) { min-height:80px !important; height:auto !important; flex:1 1 auto !important; }
  ${A} .orr-armory-reading.orr-armory-reading { grid-area:2 / 2 !important; min-height:0 !important; height:100% !important; overflow:auto !important; padding:10px 12px !important; }
  /* landscape handheld: this branch scrolls the reading again, so the dissolve comes back —
     the ≤760 stand-down above would otherwise leave the hardest-scrolling branch a hard cut
     (REVIEW-FIX05-BATCH finding 4) */
  ${A} .orr-armory-reading.orr-armory-reading { -webkit-mask-image:linear-gradient(to bottom,#000 calc(100% - 48px),transparent) !important; mask-image:linear-gradient(to bottom,#000 calc(100% - 48px),transparent) !important; }
  ${A} .orr-armory-reading__words { display:flex !important; flex-direction:column; align-items:stretch; }
  ${A} .orr-armory-reading__verb { order:-3; }
  ${A} .orr-armory-reading__name { order:-2; font-size:22px !important; margin:2px 0 5px !important; }
  ${A} .orr-armory-reading__buy { order:-1; margin:2px 0 7px !important; }
  ${A} .orr-armory-purchase { min-height:35px; padding:6px 10px; }
  ${A} > .k-foot { grid-area:3 / 1 / 4 / -1 !important; position:relative !important; padding:5px 0 0 !important; background:#0a1014 !important; border:0; border-top:1px solid var(--armory-rule); box-shadow:none !important; }
  ${A} .k-foot .k-words { flex:1 0 100% !important; gap:4px !important; justify-content:flex-start !important; }
  ${A} .k-foot .k-words > li { flex:0 1 auto !important; }
  ${A} .k-foot .k-words > li:has(.k-word--primary), ${A} .k-foot .k-words > li:has([aria-expanded]) { order:-1; }
  ${A} .k-foot .k-words .k-word { min-height:34px !important; padding:4px 8px !important; font-size:12px !important; }
  ${A} .k-foot .sf-cru-fine, ${A} .k-foot .sf-cru-kbd { display:none !important; }
}
@media (forced-colors:active) {
  ${A} :is(.orr-armory-reading,.sf-cru-dealtface,.orr-armory-wallet) { border-color:CanvasText; }
  ${A} .sf-cru-dealt .sf-cru-card.sf-cru-card--dealt.is-lit { outline:2px solid Highlight !important; }
  /* the dissolve is decoration: under an overridden palette a half-faded glyph is just a
     pale glyph, so every armory edge stands down (REVIEW-FIX05-BATCH finding 4, grok) */
  ${A} :is(.sf-cru-stage, .sf-cru-stage > .sf-cru-cards, .orr-armory-reading) { -webkit-mask-image:none !important; mask-image:none !important; }
}



/* —— Laptop height (first-hour pass): the Swarm armory on a 1280x720 screen or a shorter browser window.
   The dealt three become three rows in the left column (a ~130px-wide card cut every sentence), the
   title block closes up, the reading column drops its schematic height so the name, the sentence, the
   price line and the Install key all stand inside the frame, and the foot is one row. Type never goes
   under 12px; the full sentence of a dealt card is also in the reading panel beside it. —— */
@media (min-width:1151px) and (max-height:800px) {
  ${A} { padding:14px 40px 10px !important; gap:8px 32px !important; }
  ${A} > .k-title h1 { font-size:36px !important; }
  ${A} > .k-title .sf-cru-sub { margin:4px 200px 0 0 !important; font-size:14px !important; }
  ${A} > .k-title .sf-cru-preview, ${A} > .k-title .sf-cru-note { margin:3px 200px 0 0 !important; font-size:13px !important; line-height:1.3 !important; }
  ${A} .orr-armory-wallet strong { font-size:32px; }
  ${A} .orr-armory-wallet span { margin-top:2px; }
  ${A} .sf-cru-dealt { grid-template-columns:minmax(0,1fr) !important; gap:8px !important; margin:0 !important; }
  /* the catalog scroller keeps its fade tail even at laptop heights — a masked edge with no tail parks the last row inside the dissolve (REVIEW-FIX05-BATCH finding 5, grok) */
  ${A} .sf-cru-stage > .sf-cru-cards { padding-bottom:64px !important; }
  ${A} .sf-cru-dealt .sf-cru-card.sf-cru-card--dealt { display:grid !important; grid-template-columns:64px minmax(0,1fr) !important; column-gap:12px !important; row-gap:2px !important; align-content:start !important; min-height:0 !important; padding:10px 12px !important; }
  ${A} .sf-cru-dealt .sf-cru-dealtface { grid-column:1 !important; grid-row:1 / span 6 !important; min-height:0 !important; border-bottom:0 !important; margin:0 !important; align-self:start !important; }
  ${A} .sf-cru-dealt .sf-cru-dealtface > .orr-equipment-glyph, ${A} .sf-cru-dealt .sf-cru-dealtface > svg { width:56px !important; height:56px !important; }
  ${A} .sf-cru-dealt .sf-cru-card--dealt > :not(.sf-cru-dealtface) { grid-column:2 !important; min-width:0; }
  ${A} .sf-cru-dealt .sf-cru-name { font-size:18px !important; margin:0 !important; }
  ${A} .sf-cru-dealt .sf-cru-blurb { font-size:13px !important; line-height:1.4 !important; }
  ${A} .sf-cru-dealt .sf-cru-slot, ${A} .sf-cru-dealt .sf-cru-activation { display:none !important; }
  ${A} .orr-armory-reading.orr-armory-reading { gap:16px !important; padding:8px 2px 8px 16px !important; }
  ${A} .orr-armory-visual { gap:8px; }
  ${A} .orr-armory-item { height:150px; min-height:120px; }
  ${A} .orr-armory-item::before { width:130px; height:130px; }
  ${A} .orr-armory-item > .orr-equipment-glyph { width:110px; height:110px; }
  ${A} .orr-armory-reading__jig { height:110px !important; min-height:90px; }
  ${A} .orr-slotjig__word, ${A} .orr-slotjig__sub { display:none; }
  ${A} .orr-armory-object-label, ${A} .orr-crew-names, ${A} .orr-crew-status { display:none; }
  ${A} .orr-armory-build summary { min-height:32px; padding:6px 0; }
  ${A} .orr-armory-reading__name { font-size:clamp(24px,2.2vw,30px) !important; margin:4px 0 8px !important; }
  ${A} .orr-armory-reading__blurb { font-size:14px !important; line-height:1.45 !important; }
  ${A} .orr-armory-reading__act { font-size:13px !important; line-height:1.4 !important; }
  ${A} .orr-armory-reading__compare { margin:8px 0 !important; }
  ${A} .orr-armory-reading__budget { margin:10px 0 !important; }
  ${A} .orr-armory-reading__buy { margin:10px 0 6px !important; }
  ${A} .orr-armory-purchase { min-height:44px; padding:9px 16px; }
  ${A} .orr-armory-refusal { margin:6px 0 0; }
  ${A} .orr-armory-fitline { margin:0 0 6px; }
  ${A} > .k-foot { padding:8px 0 0 !important; display:flex !important; align-items:center !important; justify-content:space-between !important; gap:24px !important; }
  ${A} > .k-foot .k-words { flex-wrap:nowrap !important; gap:10px !important; justify-content:flex-start !important; flex:1 1 auto; min-width:0; }
  ${A} .k-foot .k-word:not(.k-word--primary) { padding:0 12px !important; white-space:nowrap; }
  ${A} .k-foot .sf-cru-fine { flex:0 1 190px; margin:0 !important; flex-wrap:wrap !important; justify-content:flex-end !important; gap:4px 10px !important; }
}
/* 801–940px plates: the inspector's crew column spends ~26px more than the card holds at rest, so
   the status line's descenders sat on the card's foot. The names row is decorative (the status line
   names Pip and the mount itself) and the spanner drawing has slack to give — the status clears. */
@media (min-width:761px) and (min-height:801px) and (max-height:940px) {
  ${A} .orr-crew-names { display:none; }
  ${A} .orr-pip-spanner > svg { height:56px; }
  ${A} .orr-pip-spanner { padding-top:8px; }
}
@media (min-width:1151px) and (max-height:680px) {
  ${A} > .k-title .sf-cru-note { display:none !important; }
  ${A} .orr-armory-reading__act { display:none !important; }
  ${A} .orr-armory-reading__budget { margin:6px 0 !important; }
  ${A} .orr-armory-reading__compare { margin:4px 0 !important; }
  ${A} .orr-armory-reading__demo, ${A} .orr-armory-reading__hold { display:inline-block !important; vertical-align:top; margin:0 10px 0 0 !important; }
  ${A} .orr-armory-reading__buy { margin:6px 0 4px !important; }
  ${A} .orr-armory-item { height:120px; min-height:100px; }
  ${A} .orr-armory-item::before { width:100px; height:100px; }
  ${A} .orr-armory-item > .orr-equipment-glyph { width:84px; height:84px; }
  /* the slot jig's hull art is laid out for a taller box and spilled past it under the price line; the Current build list below carries the same fitted count */
  ${A} .orr-armory-reading__jig { display:none !important; }
}

/* The room thumbnails are decision aids, not decoration: keep available rooms visible
   before hover. A visible stage scrollbar also signals more hulls below the fold. */
${D} .sf-crd-arenas.sf-crd-arenas .orr-tile:not([disabled]):not([aria-disabled="true"]) .fh-tile-art img {
  opacity:.94 !important; filter:saturate(1) !important;
}
${D} > .k-stage { scrollbar-color:rgb(${BONE} / .58) rgb(${BONE} / .1); }
${D} > .k-stage::-webkit-scrollbar { width:7px !important; }
${D} > .k-stage::-webkit-scrollbar-track { background:rgb(${BONE} / .1); }
${D} > .k-stage::-webkit-scrollbar-thumb { background:rgb(${BONE} / .58); border-radius:4px; }

`;
export function injectCruciblePreparation(doc = globalThis.document) {
  if (!doc?.head || doc.getElementById('orr-crucible-preparation-style')) return;
  injectOrrery(doc);
  const style = doc.createElement('style'); style.id = 'orr-crucible-preparation-style';
  style.textContent = CSS; doc.head.appendChild(style);
}
