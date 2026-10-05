/** Bundled with the module: no extra asset fetches, fonts, textures, or rendering dependency. */
export const MOBILE_CSS = `
:root[data-sf-mobile="1"] { --sf-safe-top:env(safe-area-inset-top,0px); --sf-safe-bottom:env(safe-area-inset-bottom,0px); --sf-safe-right:env(safe-area-inset-right,0px); --sf-safe-left:env(safe-area-inset-left,0px); }
#sf-touch-overlay { position:fixed; inset:0; z-index:65; pointer-events:none; --mf-ice:#62e9ff; --mf-hot:#ffca68; --mf-gun:#ff7faa; --mf-ink:#eafaff; --mf-bg:rgba(5,15,29,.88); --mf-scale:1; color:var(--mf-ink); font:600 12px/1.25 var(--mono,monospace); user-select:none; -webkit-user-select:none; }
#sf-touch-overlay [hidden] { display:none!important; }
#sf-touch-overlay button { font:inherit; color:inherit; cursor:pointer; -webkit-tap-highlight-color:transparent; }
#sf-touch-overlay svg { width:26px; height:26px; fill:none; stroke:currentColor; stroke-width:1.6; stroke-linecap:round; stroke-linejoin:round; }
#sf-touch-overlay button:focus-visible { outline:3px solid var(--mf-hot); outline-offset:4px; }
#sf-touch-overlay .mf-flight { position:absolute; inset:0; pointer-events:none; }
#sf-touch-overlay .mf-button { pointer-events:auto; touch-action:none; background:var(--mf-bg); border:1px solid currentColor; display:grid; place-content:center; justify-items:center; gap:4px; min-width:48px; min-height:48px; }
#sf-touch-overlay .mf-buttons { z-index:3; position:absolute; right:calc(24px + var(--sf-safe-right,0px)); bottom:calc(18px + var(--sf-safe-bottom,0px)); display:flex; align-items:end; gap:17px; }
#sf-touch-overlay .mf-buttons button { position:relative; width:calc(68px * var(--mf-scale)); height:calc(68px * var(--mf-scale)); border-radius:50%; letter-spacing:.10em; font-size:11px; box-shadow:inset 0 0 0 5px rgba(255,255,255,.025),0 4px 16px #0008; }
#sf-touch-overlay .mf-buttons .sf-touch-fire { width:calc(83px * var(--mf-scale)); height:calc(83px * var(--mf-scale)); color:var(--mf-gun); }
#sf-touch-overlay .sf-touch-tether { color:var(--mf-ice); margin-bottom:4px; }
#sf-touch-overlay .mf-buttons button[data-held="1"] { background:#18384c; box-shadow:inset 0 0 0 5px currentColor,0 0 18px #62e9ff44; }
#sf-touch-overlay .mf-buttons button[data-latched="1"] { border-style:double; border-width:4px; }
#sf-touch-overlay[data-lefty="1"] .mf-buttons { right:auto; left:calc(24px + var(--sf-safe-left,0px)); }
#sf-touch-overlay .mf-edge { position:absolute; right:calc(10px + var(--sf-safe-right,0px)); top:47%; transform:translateY(-50%); width:44px; height:92px; border-radius:24px 9px 9px 24px; color:var(--mf-ice); border-color:#62e9ff70; background:linear-gradient(90deg,#08202dd9,#08111bf5); font-size:10px; writing-mode:vertical-rl; letter-spacing:.14em; }
#sf-touch-overlay .mf-edge::before { content:'‹'; font-size:24px; writing-mode:horizontal-tb; }
#sf-touch-overlay .mf-top { z-index:1; position:absolute; top:calc(10px + var(--sf-safe-top,0px)); left:calc(12px + var(--sf-safe-left,0px)); right:calc(12px + var(--sf-safe-right,0px)); display:flex; align-items:start; gap:8px; }
#sf-touch-overlay .mf-status { background:linear-gradient(90deg,#061323e8,#06132330); padding:8px 10px; display:grid; gap:5px; width:176px; border-left:2px solid var(--mf-ice); }
#sf-touch-overlay .mf-status-line { display:flex; justify-content:space-between; gap:10px; font-size:11px; letter-spacing:.08em; }
#sf-touch-overlay .mf-status meter { width:82px; height:8px; accent-color:var(--mf-ice); }
#sf-touch-overlay .mf-speed { color:var(--mf-hot); font-size:16px; }
#sf-touch-overlay .mf-pause { position:relative; z-index:3; margin-left:auto; border-radius:50%; background:#061323c9; }
#sf-touch-overlay .mf-stick { position:absolute; top:0; left:0; width:0; height:0; color:var(--mf-ice); pointer-events:none; }
#sf-touch-overlay .mf-ring { position:absolute; width:var(--mf-diameter); height:var(--mf-diameter); left:calc(var(--mf-diameter) / -2); top:calc(var(--mf-diameter) / -2); border-radius:50%; border:1px solid #62e9ff66; background:radial-gradient(circle,#62e9ff14 12%,transparent 13%,transparent 65%,#62e9ff0a 66%); }
#sf-touch-overlay .mf-ring::after { content:''; position:absolute; inset:-19%; border:1px dashed #ffca6866; border-radius:50%; }
#sf-touch-overlay .mf-knob { position:absolute; left:-14px; top:-14px; width:28px; height:28px; border-radius:50%; background:currentColor; box-shadow:0 0 15px currentColor; display:grid; place-content:center; }
#sf-touch-overlay .mf-knob::after { content:''; width:8px; height:8px; background:#082030; transform:rotate(45deg); }
#sf-touch-overlay .mf-stick[data-boost="1"] { color:var(--mf-hot); }
#sf-touch-overlay .mf-stick-label { position:absolute; width:180px; left:-90px; top:calc(var(--mf-diameter) / 2 + 21px); text-align:center; font-size:10px; letter-spacing:.14em; color:currentColor; text-shadow:0 1px 4px #000; }
#sf-touch-overlay .mf-wheel { position:absolute; inset:0; pointer-events:none; }
#sf-touch-overlay .mf-wheel-face { position:absolute; width:var(--mf-wheel-d); height:var(--mf-wheel-d); border-radius:50%; background:radial-gradient(circle,#071524ee 28%,#12354cea 29%,#091a2bed 71%); border:1px solid #62e9ff77; box-shadow:0 0 38px #000a; }
#sf-touch-overlay .mf-slot { position:absolute; width:66px; min-height:56px; border:1px solid transparent; border-radius:13px; transform:translate(-50%,-50%); background:transparent; color:#a9cedb; font-size:9px; letter-spacing:.03em; gap:3px; }
#sf-touch-overlay .mf-slot[data-selected="1"],#sf-touch-overlay .mf-slot:hover { color:#071723; background:var(--mf-ice); border-color:#c7faff; box-shadow:0 0 18px #62e9ff55; }
#sf-touch-overlay .mf-slot[aria-disabled="true"] { opacity:.45; }
#sf-touch-overlay .mf-wheel-note { position:absolute; transform:translate(-100%,-50%); width:78px; padding-right:7px; text-align:right; font-size:10px; color:#b9d2e5; }
#sf-touch-overlay .mf-pages { position:absolute; right:calc(62px + var(--sf-safe-right,0px)); top:calc(12px + var(--sf-safe-top,0px)); display:grid; grid-template-columns:repeat(2,minmax(68px,1fr)); gap:4px; pointer-events:auto; }
#sf-touch-overlay .mf-pages button { background:#061727f5; border:1px solid #4f758a; border-radius:8px; min-height:44px; padding:6px; font-size:11px; touch-action:manipulation; }
#sf-touch-overlay .mf-pages button[aria-pressed="true"] { border-color:var(--mf-ice); color:var(--mf-ice); }
#sf-touch-overlay .mf-toast { position:absolute; left:50%; top:calc(140px + var(--sf-safe-top,0px)); transform:translateX(-50%); max-width:min(72vw,340px); padding:8px 12px; border-radius:10px; background:#04111fee; color:var(--mf-hot); text-align:center; }
#sf-touch-overlay .mf-guide-open { position:absolute; bottom:calc(10px + var(--sf-safe-bottom,0px)); right:calc(12px + var(--sf-safe-right,0px)); padding:10px 14px; border-radius:20px; min-height:44px; background:#061727f5; border:1px solid #62e9ff88; pointer-events:auto; touch-action:manipulation; }
.sf-mobile-guide { background:#091b2a; color:#eafaff; border:1px solid #62e9ff; border-radius:20px; max-width:min(500px,calc(100vw - 28px)); max-height:calc(100dvh - 44px); padding:24px; font:15px/1.55 var(--mono,monospace); overflow:auto; overscroll-behavior:contain; }
.sf-mobile-guide::backdrop { background:#010810db; }
.sf-mobile-guide h2 { margin-top:0; font-size:24px; }
.sf-mobile-guide strong { color:#62e9ff; }
.sf-mobile-guide button { min-height:48px; padding:10px 18px; background:#62e9ff; color:#071723; border:0; border-radius:10px; font:inherit; }
.sf-mobile-guide label { display:block; margin:12px 0; }
.sf-mobile-guide select,.sf-mobile-guide input { min-height:44px; font:inherit; max-width:100%; }
/* Narrow-screen adaptations use actual Deckplate/ORRERY hooks; no transforms on the whole app. */
@media (max-width:960px), (max-height:540px) and (pointer:coarse) {
 :root[data-sf-mobile="1"] .screen { box-sizing:border-box; max-width:100vw!important; max-height:100dvh!important; min-width:0!important; padding-left:max(14px,env(safe-area-inset-left))!important; padding-right:max(14px,env(safe-area-inset-right))!important; padding-top:max(12px,env(safe-area-inset-top))!important; padding-bottom:max(20px,env(safe-area-inset-bottom))!important; overflow-x:hidden; overflow-y:auto; overscroll-behavior:contain; touch-action:pan-y; }
 :root[data-sf-mobile="1"] .screen :is(button,[role="button"],select,input) { min-height:44px; touch-action:manipulation; }
 :root[data-sf-mobile="1"] .screen :is(input,select,textarea) { font-size:16px!important; }
 :root[data-sf-mobile="1"] .dp-frame__body { min-height:0!important; min-width:0!important; overflow:visible!important; }
 :root[data-sf-mobile="1"] .dp-frame__col { width:100%!important; max-width:100%!important; min-width:0!important; }
 :root[data-sf-mobile="1"] .dp-frame__scroll { max-height:none!important; overflow:visible!important; }
 :root[data-sf-mobile="1"] .of-title-actions :is(ol,ul) { position:relative!important; display:flex!important; flex-direction:column; align-items:stretch; gap:8px; padding:0!important; margin:0!important; width:100%!important; height:auto!important; }
 :root[data-sf-mobile="1"] .of-title-actions li { position:relative!important; transform:none!important; inset:auto!important; width:100%!important; max-width:100%!important; }
 :root[data-sf-mobile="1"] .of-title-actions button { transform:none!important; position:relative!important; width:100%!important; min-height:48px; text-align:left; }
 :root[data-sf-mobile="1"] .of-title-actions canvas { display:none!important; }
 :root[data-sf-mobile="1"] .dp-logotype { max-width:85vw!important; font-size:clamp(32px,10vw,70px)!important; }
 :root[data-sf-mobile="1"] .screen :is(.dp-grid,.sf-grid) { min-width:0; grid-template-columns:repeat(auto-fit,minmax(min(240px,100%),1fr))!important; }
 :root[data-sf-mobile="1"] .screen :is(.dp-copy,.dp-read,.sf-slot-name) { overflow-wrap:anywhere; }
 :root[data-sf-mobile="1"][data-sf-mobile-flight="1"] #gl-canvas { touch-action:none; }
 :root[data-sf-mobile="1"][data-sf-mobile-flight="1"] :is(.sf-prail,.sf-leftstack,.orr-hud-cluster,.sf-overview,.sf-target) { display:none!important; }
 :root[data-sf-mobile="1"][data-sf-mobile-flight="1"] #hud .sf-radar-wrap { position:fixed!important; top:72px!important; right:10px!important; bottom:auto!important; left:auto!important; transform:scale(.55)!important; transform-origin:top right!important; pointer-events:none!important; }
}
@media (max-width:600px) {
 :root[data-sf-mobile="1"] :is(.of-title,.of-pause) { grid-template-columns:1fr!important; grid-template-rows:auto 1fr!important; gap:18px; }
 :root[data-sf-mobile="1"] .dp-frame__head { flex:none; }
 #sf-touch-overlay .mf-status { width:152px; }
 #sf-touch-overlay .mf-buttons { right:calc(16px + var(--sf-safe-right,0px)); gap:14px; }
}
@media (max-height:500px) {
 #sf-touch-overlay .mf-status { width:156px; padding:5px 8px; }
 #sf-touch-overlay .mf-buttons { bottom:calc(10px + var(--sf-safe-bottom,0px)); }
 #sf-touch-overlay .mf-buttons button { width:58px; height:58px; }
 #sf-touch-overlay .mf-buttons .sf-touch-fire { width:72px; height:72px; }
 #sf-touch-overlay .mf-pages { right:auto; left:calc(12px + var(--sf-safe-left,0px)); top:142px; grid-template-columns:repeat(2,1fr); }
 #sf-touch-overlay .mf-slot { width:60px; min-height:48px; font-size:9px; }
 #sf-touch-overlay .mf-slot svg { width:22px; height:22px; }
}
@media (prefers-reduced-motion:reduce) { #sf-touch-overlay * { transition:none!important; animation:none!important; } }
@media (forced-colors:active) { #sf-touch-overlay .mf-button,#sf-touch-overlay .mf-ring,#sf-touch-overlay .mf-wheel-face { border:2px solid ButtonText; background:Canvas; color:CanvasText; } }
`;
