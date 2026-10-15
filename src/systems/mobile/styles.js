// Bundled with the module: no extra asset fetches, textures, or rendering dependency.
//
// The phone deck is drawn in ORRERY's language (design/frontend/ORRERY.md): light is the only material, the
// rest light of every ring and scale is warm bone, the Hand (amber) is the one thing that is yours and chosen,
// ice/azure is data in motion (here: thrust, from the flight dial's own speed ramp), red is threat only.
// Bloom is a wider second stroke or a gradient, never a filter: nothing in this sheet may cost a frame in flight.
// The --mf-* names below are local aliases onto the Deckplate/ORRERY roots (--dp-*), with the root's own values
// as the fallback; they are not a token system.
const FLIGHT_CSS = `
:root[data-sf-mobile="1"] { --sf-safe-top:env(safe-area-inset-top,0px); --sf-safe-bottom:env(safe-area-inset-bottom,0px); --sf-safe-right:env(safe-area-inset-right,0px); --sf-safe-left:env(safe-area-inset-left,0px); }
:root[data-sf-mobile-flight="1"], :root[data-sf-mobile-flight="1"] body { touch-action:none; overscroll-behavior:none; -webkit-user-select:none; user-select:none; -webkit-touch-callout:none; }
#sf-touch-overlay { position:fixed; inset:0; z-index:65; pointer-events:none; --mf-scale:1; --mf-bone:232 226 212; --mf-ice:143 203 255;
  --mf-hand:var(--dp-hand,#f2b950); --mf-hand-hot:var(--dp-hand-hot,#ffd98c); --mf-danger:var(--dp-danger,#ff5038); --mf-phos:var(--dp-phos,#dfeeff);
  --mf-face:var(--dp-face-label,"Archivo","Instrument Sans",system-ui,sans-serif); --mf-numeral:var(--dp-face-numeral,"Archivo","Instrument Sans",system-ui,sans-serif);
  --mf-body:var(--dp-face-body,"Instrument Sans","Archivo",system-ui,sans-serif); --mf-out:cubic-bezier(.16,1,.3,1); --mf-over:cubic-bezier(.34,1.36,.64,1);
  color:rgb(var(--mf-bone)); font:600 12px/1.25 var(--mf-face); font-stretch:112%; user-select:none; -webkit-user-select:none; -webkit-touch-callout:none; }
#sf-touch-overlay [hidden] { display:none!important; }
#sf-touch-overlay button { font:inherit; font-stretch:inherit; color:inherit; cursor:pointer; -webkit-tap-highlight-color:transparent; }
#sf-touch-overlay button:focus-visible { outline:2px solid var(--mf-hand-hot); outline-offset:3px; }
#sf-touch-overlay .mf-flight { position:absolute; inset:0; pointer-events:none; }
/* shared ring art: a luminous band with a crisp edge (ORRERY weight rule), glass behind for legibility */
#sf-touch-overlay :is(.mf-r-band,.mf-r-edge,.mf-r-plate,.mf-r-glyph,.mf-r-pulse) { fill:none; }
#sf-touch-overlay .mf-r-plate { fill:rgb(6 8 12 / .5); }
#sf-touch-overlay .mf-r-band { stroke:rgb(var(--mf-bone) / .10); stroke-width:7; }
#sf-touch-overlay .mf-r-edge { stroke:rgb(var(--mf-bone) / .58); stroke-width:1.5; }
#sf-touch-overlay .mf-r-glyph { stroke:currentColor; stroke-width:2.6; stroke-linecap:round; }
/* ---- top: status scales + pause ---- */
#sf-touch-overlay .mf-top { z-index:5; position:absolute; top:calc(10px + var(--sf-safe-top,0px)); left:calc(14px + var(--sf-safe-left,0px)); right:calc(12px + var(--sf-safe-right,0px)); display:flex; align-items:flex-start; gap:10px; }
#sf-touch-overlay .mf-status { position:relative; display:grid; gap:6px; width:176px; padding-top:1px; text-shadow:0 1px 5px rgb(0 0 0 / .9); }
#sf-touch-overlay .mf-status::before { content:''; position:absolute; inset:-12px -30px -12px -16px; z-index:-1; background:radial-gradient(ellipse at 24% 34%, rgb(6 8 12 / .58), transparent 72%); }
#sf-touch-overlay .mf-speed { display:flex; align-items:baseline; gap:8px; }
#sf-touch-overlay .mf-speed b { font:250 40px/.86 var(--mf-numeral); font-stretch:100%; letter-spacing:-.02em; font-variant-numeric:tabular-nums lining-nums; color:var(--mf-phos); }
#sf-touch-overlay .mf-speed i { font-style:normal; font:600 12px/1 var(--mf-face); font-stretch:112%; letter-spacing:.12em; text-transform:uppercase; color:rgb(var(--mf-bone) / .62); }
#sf-touch-overlay .mf-row { display:grid; grid-template-columns:62px 1fr; align-items:center; gap:8px; --k:236 230 216; }
#sf-touch-overlay .mf-row[data-k="shield"] { --k:143 203 255; }
#sf-touch-overlay .mf-row[data-k="energy"] { --k:223 238 255; }
#sf-touch-overlay .mf-row[data-k="boost"] { --k:92 160 255; }
#sf-touch-overlay .mf-row[data-low="1"][data-k="hull"], #sf-touch-overlay .mf-row[data-low="1"][data-k="shield"] { --k:255 80 56; }
#sf-touch-overlay .mf-lab { font:600 12px/1 var(--mf-face); font-stretch:104%; letter-spacing:.06em; text-transform:uppercase; color:rgb(var(--mf-bone) / .62); }
#sf-touch-overlay .mf-row[data-low="1"] .mf-lab { color:rgb(var(--k)); }
#sf-touch-overlay .mf-scale { position:relative; height:4px; background:rgb(var(--mf-bone) / .13); overflow:hidden; }
#sf-touch-overlay .mf-fill { position:absolute; inset:0; transform-origin:0 50%; transform:scaleX(0); background:rgb(var(--k)); }
#sf-touch-overlay .mf-scale::after { content:''; position:absolute; inset:0; background:repeating-linear-gradient(90deg, transparent 0 9px, rgb(6 8 12 / .85) 9px 10px); }
#sf-touch-overlay .mf-pause { pointer-events:auto; touch-action:manipulation; position:relative; margin-left:auto; flex:none; width:calc(52px * var(--mf-scale)); height:calc(52px * var(--mf-scale)); min-width:44px; min-height:44px; padding:0; border:0; background:none; color:rgb(var(--mf-bone)); }
#sf-touch-overlay .mf-pause svg { width:100%; height:100%; overflow:visible; }
#sf-touch-overlay .mf-pause:active .mf-r-edge { stroke:var(--mf-phos); }
/* ---- powers handle (the wheel opens from here) ---- */
#sf-touch-overlay .mf-edge { position:absolute; right:var(--sf-safe-right,0px); bottom:calc(18px + 156px * var(--mf-scale) + 78px + var(--sf-safe-bottom,0px)); width:calc(48px * var(--mf-scale)); height:calc(110px * var(--mf-scale)); min-width:44px; padding:0; border:0; background:none; pointer-events:auto; touch-action:none; color:rgb(var(--mf-bone)); z-index:6; }
#sf-touch-overlay .mf-edge::before { content:''; position:absolute; inset:-8px -2px -8px -18px; }
#sf-touch-overlay .mf-edge-art { position:absolute; inset:0; width:100%; height:100%; overflow:visible; }
#sf-touch-overlay .mf-e-plate { fill:rgb(6 8 12 / .56); }
#sf-touch-overlay .mf-e-edge { fill:none; stroke:rgb(var(--mf-bone) / .58); stroke-width:1.5; vector-effect:non-scaling-stroke; }
#sf-touch-overlay .mf-e-tick { fill:none; stroke:rgb(var(--mf-bone) / .5); stroke-width:1.6; stroke-linecap:round; }
#sf-touch-overlay .mf-edge-word { position:absolute; left:calc(17px * var(--mf-scale)); top:50%; writing-mode:vertical-rl; transform:translateY(-50%) rotate(180deg); font:600 12px/1 var(--mf-face); font-stretch:108%; letter-spacing:.2em; text-transform:uppercase; color:rgb(var(--mf-bone) / .82); }
#sf-touch-overlay .mf-edge[aria-expanded="true"] .mf-e-edge { stroke:var(--mf-hand); }
/* ---- the two keys: a gameboy diagonal, gun high, tether low ---- */
/* z-index 6 ties the handle (.mf-edge), and the keys and DOCK come later in the tree, so they win the tie: the handle's invisible
   hit pad reaches 24px past it, and in landscape (844x390) that pad lies over the top of the gun key and half of DOCK */
#sf-touch-overlay .mf-buttons { z-index:6; position:absolute; right:calc(16px + var(--sf-safe-right,0px)); bottom:calc(18px + var(--sf-safe-bottom,0px)); width:calc(196px * var(--mf-scale)); height:calc(156px * var(--mf-scale)); pointer-events:none; }
#sf-touch-overlay .mf-key { pointer-events:auto; touch-action:none; position:absolute; isolation:isolate; display:grid; place-content:center; justify-items:center; gap:3px; padding:0; border:0; background:none; color:rgb(var(--mf-bone)); transition:transform 90ms ease; }
#sf-touch-overlay .mf-key > svg:not([class]) { position:relative; z-index:2; width:calc(28px * var(--mf-scale)); height:calc(28px * var(--mf-scale)); fill:none; stroke:currentColor; stroke-width:1.7; stroke-linecap:round; stroke-linejoin:round; }
#sf-touch-overlay .mf-key-word { position:relative; z-index:2; font:700 12px/1 var(--mf-face); font-stretch:104%; letter-spacing:.08em; text-transform:uppercase; }
/* GUN is the one primary verb: the Lamp Key, an amber field with one 45-degree cut */
#sf-touch-overlay .mf-gun { right:0; top:0; width:calc(96px * var(--mf-scale)); height:calc(96px * var(--mf-scale)); color:#1c1406; }
#sf-touch-overlay .mf-gun-field { position:absolute; inset:0; z-index:1; background:var(--mf-hand); clip-path:polygon(0 0, calc(100% - 26px) 0, 100% 26px, 100% 100%, 0 100%); transition:background 80ms linear; }
#sf-touch-overlay .mf-gun::before { content:''; position:absolute; inset:-30px; z-index:-1; opacity:0; background:radial-gradient(circle, rgb(242 185 80 / .38), transparent 66%); transition:opacity 80ms linear; }
#sf-touch-overlay .mf-ping { position:absolute; inset:0; z-index:1; border:2px solid var(--mf-hand-hot); clip-path:polygon(0 0, calc(100% - 26px) 0, 100% 26px, 100% 100%, 0 100%); opacity:0; pointer-events:none; }
#sf-touch-overlay .mf-gun[data-held="1"] { transform:scale(.95); }
#sf-touch-overlay .mf-gun[data-held="1"] .mf-gun-field { background:var(--mf-hand-hot); }
#sf-touch-overlay .mf-gun[data-held="1"]::before { opacity:1; }
#sf-touch-overlay .mf-gun[data-held="1"] .mf-ping { animation:mf-ping 380ms ease-out; }
#sf-touch-overlay .mf-aimring { position:absolute; left:50%; top:50%; width:calc(100% + 58px); height:calc(100% + 58px); transform:translate(-50%,-50%); overflow:visible; opacity:0; pointer-events:none; transition:opacity 100ms linear; z-index:0; }
#sf-touch-overlay .mf-gun[data-aim="1"] .mf-aimring { opacity:1; }
#sf-touch-overlay .mf-a-edge { fill:none; stroke:rgb(var(--mf-bone) / .42); stroke-width:1.4; stroke-dasharray:2 7; }
#sf-touch-overlay .mf-a-arc { fill:none; stroke:var(--mf-hand-hot); stroke-width:4; stroke-linecap:round; }
/* TETHER: a ring instrument; latched, a bead of ice orbits it (data in motion) */
#sf-touch-overlay .mf-tether { left:0; bottom:0; width:calc(78px * var(--mf-scale)); height:calc(78px * var(--mf-scale)); }
#sf-touch-overlay .mf-ring-art { position:absolute; inset:0; width:100%; height:100%; overflow:visible; z-index:0; }
#sf-touch-overlay .mf-pulse { transform-origin:40px 40px; animation:mf-orbit 2.6s linear infinite; opacity:0; }
#sf-touch-overlay .mf-r-pulse { stroke:rgb(var(--mf-ice)); stroke-width:3.4; stroke-linecap:round; stroke-dasharray:24 190; }
#sf-touch-overlay .mf-tether[data-latched="1"] .mf-pulse { opacity:1; }
#sf-touch-overlay .mf-tether[data-latched="1"] .mf-r-edge { stroke:rgb(var(--mf-ice) / .8); }
#sf-touch-overlay .mf-tether[data-held="1"] { transform:scale(.95); }
#sf-touch-overlay .mf-tether[data-held="1"] .mf-r-edge { stroke:var(--mf-phos); stroke-width:2.2; }
#sf-touch-overlay .mf-tether[data-held="1"] .mf-r-band { stroke:rgb(var(--mf-ice) / .22); }
/* the reel ladder, left of the cluster while the tether thumb is down: slide up to reel in, down to pay out */
#sf-touch-overlay .mf-reel { position:absolute; z-index:4; right:calc(16px + 196px * var(--mf-scale) + 12px + var(--sf-safe-right,0px)); bottom:calc(18px + 39px * var(--mf-scale) - 38px + var(--sf-safe-bottom,0px)); width:84px; height:152px; pointer-events:none; }
#sf-touch-overlay .mf-reel > i { position:absolute; right:14px; font:600 12px/1 var(--mf-face); font-stretch:104%; font-style:normal; letter-spacing:.08em; text-transform:uppercase; color:rgb(var(--mf-bone) / .78); text-shadow:0 1px 4px #000; white-space:nowrap; }
#sf-touch-overlay .mf-reel-up { top:0; }
#sf-touch-overlay .mf-reel-down { bottom:0; }
#sf-touch-overlay .mf-reel .mf-reel-rail { position:absolute; right:4px; top:18px; bottom:18px; width:2px; background:rgb(var(--mf-bone) / .3); }
#sf-touch-overlay .mf-reel-rail::before { content:''; position:absolute; right:0; top:0; bottom:0; width:8px; background:repeating-linear-gradient(180deg, rgb(var(--mf-bone) / .45) 0 1px, transparent 1px 12px); }
#sf-touch-overlay .mf-reel-bead { position:absolute; right:-5px; top:calc(100% - 38px + 18px - 6px); width:12px; height:12px; border-radius:50%; background:rgb(var(--mf-ice)); }
/* the aim beam: where the gun thumb's shots will go, drawn from the hull */
#sf-touch-overlay .mf-beam { position:absolute; inset:0; width:100%; height:100%; pointer-events:none; overflow:visible; z-index:3; }
#sf-touch-overlay .mf-beam-bloom { stroke:rgb(242 185 80 / .24); stroke-width:9; stroke-linecap:round; }
#sf-touch-overlay .mf-beam-core { stroke:var(--mf-hand-hot); stroke-width:1.6; stroke-linecap:round; stroke-dasharray:3 8; }
#sf-touch-overlay .mf-beam-tip { fill:var(--mf-hand-hot); }
/* the contextual DOCK key: the same Lamp Key, only while a station is in range */
#sf-touch-overlay .mf-dock { position:absolute; z-index:6; right:calc(18px + var(--sf-safe-right,0px)); bottom:calc(18px + 156px * var(--mf-scale) + 14px + var(--sf-safe-bottom,0px)); isolation:isolate; display:inline-flex; align-items:center; min-height:50px; padding:0 26px 0 22px; border:0; background:none; color:#1c1406; pointer-events:auto; touch-action:manipulation; font:800 15px/1 var(--mf-face); font-stretch:125%; letter-spacing:.16em; text-transform:uppercase; animation:mf-key-in 260ms var(--mf-over) both; }
#sf-touch-overlay .mf-dock::before { content:''; position:absolute; inset:0; z-index:-1; background:var(--mf-hand); clip-path:polygon(0 0, calc(100% - 14px) 0, 100% 14px, 100% 100%, 0 100%); }
#sf-touch-overlay .mf-dock:active::before { background:var(--mf-hand-hot); }
/* ---- the stick: an orrery that powers up under the thumb ---- */
#sf-touch-overlay .mf-stick { position:absolute; left:0; top:0; width:0; height:0; pointer-events:none; --mf-r:74px; --mf-tint:226 220 206; --mf-approach:0; --mf-shift:0px; z-index:4; }
#sf-touch-overlay .mf-stick-svg { position:absolute; width:calc(var(--mf-r) * 3.4); height:calc(var(--mf-r) * 3.4); left:calc(var(--mf-r) * -1.7); top:calc(var(--mf-r) * -1.7); overflow:visible; }
#sf-touch-overlay .mf-stick:not([hidden]) .mf-stick-svg { animation:mf-arrive 300ms var(--mf-over) both; }
#sf-touch-overlay .mf-stick:not([hidden]) .mf-ticks { transform-box:fill-box; transform-origin:center; animation:mf-spin-in 560ms var(--mf-out) both; }
#sf-touch-overlay .mf-stick.is-leaving .mf-stick-svg { animation:mf-leave 190ms ease-in both; }
#sf-touch-overlay .mf-plate { fill:rgb(6 8 12 / .44); }
#sf-touch-overlay .mf-band { fill:none; stroke:rgb(var(--mf-bone) / .1); stroke-width:9; }
#sf-touch-overlay .mf-edge-ring { fill:none; stroke:rgb(var(--mf-bone) / .62); stroke-width:1.8; }
#sf-touch-overlay .mf-tick { fill:none; stroke:rgb(var(--mf-bone) / .4); }
#sf-touch-overlay .mf-tick--major { stroke:rgb(var(--mf-bone) / .74); }
#sf-touch-overlay .mf-boost-dash { fill:none; stroke:rgb(var(--mf-ice)); stroke-width:2.6; opacity:calc(.3 + .6 * var(--mf-approach)); }
#sf-touch-overlay .mf-boost-bloom { fill:none; stroke:rgb(var(--mf-tint) / .3); stroke-width:11; opacity:0; vector-effect:non-scaling-stroke; }
#sf-touch-overlay .mf-boost-lit { fill:none; stroke:rgb(var(--mf-tint)); stroke-width:3.4; opacity:0; vector-effect:non-scaling-stroke; }
#sf-touch-overlay .mf-micro text { font:600 15px var(--mf-face); letter-spacing:.2em; fill:rgb(var(--mf-bone) / .5); }
#sf-touch-overlay .mf-dead { fill:none; stroke:rgb(var(--mf-bone) / .22); stroke-width:1.2; }
#sf-touch-overlay .mf-brake { opacity:0; }
#sf-touch-overlay .mf-brake path { fill:none; stroke:rgb(var(--mf-bone) / .9); stroke-width:3; stroke-linecap:round; stroke-linejoin:round; vector-effect:non-scaling-stroke; }
#sf-touch-overlay .mf-heading { transform:rotate(0deg); }
#sf-touch-overlay .mf-heading path { fill:none; stroke:var(--mf-phos); stroke-width:2.6; stroke-linecap:round; stroke-linejoin:round; vector-effect:non-scaling-stroke; }
#sf-touch-overlay .mf-heading[data-off] { display:none; }
#sf-touch-overlay .mf-lit-bloom { fill:none; stroke:rgb(var(--mf-tint) / .3); stroke-width:13; stroke-linecap:round; vector-effect:non-scaling-stroke; }
#sf-touch-overlay .mf-lit { fill:none; stroke:rgb(var(--mf-tint)); stroke-width:3.6; stroke-linecap:round; vector-effect:non-scaling-stroke; }
#sf-touch-overlay :is(.mf-arm,.mf-arm-bloom,.mf-arm-hot) { stroke-linecap:round; vector-effect:non-scaling-stroke; }
#sf-touch-overlay .mf-arm { stroke:rgb(242 185 80 / .42); stroke-width:1.6; stroke-dasharray:1 6; }
#sf-touch-overlay .mf-arm-bloom { stroke:rgb(242 185 80 / .26); stroke-width:9; }
#sf-touch-overlay .mf-arm-hot { stroke:var(--mf-hand); stroke-width:2.6; }
#sf-touch-overlay .mf-bead-bloom { fill:rgb(242 185 80 / .26); }
#sf-touch-overlay .mf-bead { fill:var(--mf-hand-hot); }
#sf-touch-overlay .mf-pivot { fill:rgb(8 11 16 / .88); stroke:var(--mf-hand); stroke-width:2.2; vector-effect:non-scaling-stroke; }
#sf-touch-overlay .mf-pivot-dot { fill:var(--mf-hand); }
#sf-touch-overlay .mf-stick[data-reach="1"] .mf-edge-ring { stroke:rgb(var(--mf-tint)); stroke-width:2.4; }
#sf-touch-overlay .mf-stick[data-boost="1"] .mf-boost-dash { opacity:0; }
#sf-touch-overlay .mf-stick[data-boost="1"] :is(.mf-boost-lit,.mf-boost-bloom) { opacity:1; }
#sf-touch-overlay .mf-stick[data-boost="1"] .mf-tick--major { stroke:rgb(var(--mf-tint)); }
#sf-touch-overlay .mf-stick[data-brake="1"] .mf-brake { opacity:1; animation:mf-brake-in 360ms var(--mf-out) both; }
#sf-touch-overlay .mf-stick[data-brake="1"] :is(.mf-lit,.mf-lit-bloom,.mf-arm,.mf-arm-bloom) { opacity:0; }
#sf-touch-overlay .mf-stick[data-flick="1"] :is(.mf-lit,.mf-lit-bloom) { animation:mf-flick 190ms ease-out both; }
#sf-touch-overlay .mf-readout { position:absolute; left:calc(-90px + var(--mf-shift)); width:180px; top:calc(var(--mf-r) * 1.62 + 6px); display:grid; justify-items:center; gap:3px; text-align:center; text-shadow:0 1px 6px rgb(0 0 0 / .9); }
#sf-touch-overlay .mf-stick[data-side="above"] .mf-readout { top:auto; bottom:calc(var(--mf-r) * 1.62 + 24px); }
#sf-touch-overlay .mf-num { font:250 40px/.86 var(--mf-numeral); font-stretch:100%; font-variant-numeric:tabular-nums lining-nums; letter-spacing:-.02em; color:rgb(var(--mf-tint)); }
#sf-touch-overlay .mf-unit { font:600 12px/1 var(--mf-face); font-stretch:108%; font-style:normal; letter-spacing:.14em; text-transform:uppercase; color:rgb(var(--mf-bone) / .7); }
#sf-touch-overlay .mf-stick[data-boost="1"] .mf-num, #sf-touch-overlay .mf-stick[data-brake="1"] .mf-num { font:800 25px/1 var(--mf-face); font-stretch:125%; letter-spacing:.08em; }
/* the first-run ghost: where a thumb will make the stick */
#sf-touch-overlay .mf-ghost { position:absolute; left:23%; bottom:calc(124px + var(--sf-safe-bottom,0px)); width:0; height:0; pointer-events:none; animation:mf-breathe 3s ease-in-out infinite; }
#sf-touch-overlay .mf-ghost svg { position:absolute; width:170px; height:170px; left:-85px; top:-85px; overflow:visible; }
#sf-touch-overlay .mf-ghost .mf-band { stroke-width:9; }
#sf-touch-overlay .mf-ghost .mf-edge-ring { stroke:rgb(var(--mf-bone) / .5); }
#sf-touch-overlay .mf-ghost .mf-boost-dash { opacity:.4; }
#sf-touch-overlay .mf-ghost-hand { fill:none; stroke:var(--mf-hand); stroke-width:2.6; stroke-linecap:round; vector-effect:non-scaling-stroke; }
#sf-touch-overlay .mf-ghost-label { position:absolute; width:156px; left:-78px; top:94px; text-align:center; font:500 12px/1.3 var(--mf-body); font-stretch:100%; letter-spacing:.01em; color:rgb(var(--mf-bone) / .88); text-shadow:0 1px 5px #000; }
#sf-touch-overlay[data-lefty="1"] .mf-ghost { left:auto; right:23%; }
/* ---- the wheel: an ORRERY radial menu opening inward from the handle ---- */
#sf-touch-overlay .mf-wheel { position:absolute; inset:0; z-index:7; pointer-events:none; }
#sf-touch-overlay .mf-wheel-art { position:absolute; pointer-events:none; animation:mf-wheel-open 280ms var(--mf-out) both; }
#sf-touch-overlay .mf-wheel[data-orbit="0"][data-side="right"] .mf-wheel-art { clip-path:inset(0 44% 0 0); }
#sf-touch-overlay .mf-wheel[data-orbit="0"][data-side="left"] .mf-wheel-art { clip-path:inset(0 0 0 44%); }
#sf-touch-overlay .mf-wheel-svg { width:100%; height:100%; overflow:visible; }
#sf-touch-overlay .mf-w-plate { fill:rgb(6 8 12 / .66); }
#sf-touch-overlay .mf-w-band { fill:none; stroke:rgb(var(--mf-bone) / .09); stroke-width:10; }
#sf-touch-overlay .mf-w-edge { fill:none; stroke:rgb(var(--mf-bone) / .6); stroke-width:1.6; vector-effect:non-scaling-stroke; }
#sf-touch-overlay .mf-w-ticks { fill:none; stroke:rgb(var(--mf-bone) / .42); }
#sf-touch-overlay .mf-w-track { fill:none; stroke:rgb(var(--mf-bone) / .17); stroke-width:1.2; vector-effect:non-scaling-stroke; }
#sf-touch-overlay .mf-w-rule { fill:none; stroke:rgb(var(--mf-bone) / .17); stroke-width:1; vector-effect:non-scaling-stroke; }
#sf-touch-overlay .mf-w-wedge { fill:rgb(242 185 80 / .13); stroke:rgb(242 185 80 / .62); stroke-width:1.3; vector-effect:non-scaling-stroke; }
#sf-touch-overlay .mf-w-wedge[data-off] { display:none; }
#sf-touch-overlay .mf-w-hand-bloom { stroke:rgb(242 185 80 / .28); stroke-width:9; stroke-linecap:round; vector-effect:non-scaling-stroke; }
#sf-touch-overlay .mf-w-hand-core { stroke:var(--mf-hand); stroke-width:2.6; stroke-linecap:round; vector-effect:non-scaling-stroke; }
#sf-touch-overlay .mf-w-hand-bead { fill:var(--mf-hand-hot); }
#sf-touch-overlay .mf-w-hand[data-idle] { opacity:.32; }
#sf-touch-overlay .mf-w-hub { fill:rgb(8 11 16 / .92); stroke:var(--mf-hand); stroke-width:2.2; vector-effect:non-scaling-stroke; }
#sf-touch-overlay .mf-nodes { position:absolute; inset:0; pointer-events:none; }
#sf-touch-overlay .mf-node { position:absolute; pointer-events:auto; touch-action:none; transform:translate(-50%,-50%); width:var(--mf-node-size,56px); min-width:44px; aspect-ratio:1; display:grid; place-content:center; justify-items:center; gap:2px; padding:0; border:0; border-radius:50%; background:rgb(var(--mf-bone) / .075); color:rgb(var(--mf-bone) / .92); animation:mf-node-in 300ms var(--mf-over) both; animation-delay:calc(var(--i, 0) * 32ms + 70ms); transition:background 90ms linear, color 90ms linear; }
#sf-touch-overlay .mf-node svg { width:22px; height:22px; fill:none; stroke:currentColor; stroke-width:1.7; stroke-linecap:round; stroke-linejoin:round; }
#sf-touch-overlay .mf-node span { max-width:74px; font:600 11px/1.05 var(--mf-face); font-stretch:100%; letter-spacing:.01em; text-transform:uppercase; text-align:center; }
#sf-touch-overlay .mf-node[data-selected="1"] { background:var(--mf-phos); color:#0b141c; transform:translate(-50%,-50%) scale(1.14); box-shadow:0 0 0 2px var(--mf-hand); animation:none; }
#sf-touch-overlay .mf-wheel-top { position:absolute; left:50%; top:calc(132px + var(--sf-safe-top,0px)); transform:translateX(-50%); width:min(96vw,440px); display:grid; gap:4px; justify-items:center; pointer-events:none; }
#sf-touch-overlay .mf-tabs { display:grid; grid-template-columns:repeat(4,minmax(0,1fr)); width:100%; pointer-events:auto; }
#sf-touch-overlay .mf-tab { position:relative; min-width:0; min-height:44px; padding:0 4px; border:0; background:none; touch-action:manipulation; font:600 12px/1 var(--mf-face); font-stretch:100%; letter-spacing:.02em; text-transform:uppercase; color:rgb(var(--mf-bone) / .64); text-shadow:0 1px 5px #000; }
#sf-touch-overlay .mf-tab[aria-pressed="true"] { color:var(--mf-hand-hot); }
#sf-touch-overlay .mf-tab[aria-pressed="true"]::after { content:''; position:absolute; left:7px; right:7px; bottom:7px; height:2px; background:var(--mf-hand); }
#sf-touch-overlay .mf-pick { display:grid; justify-items:center; gap:3px; max-width:100%; padding:8px 18px 9px; text-align:center; background:rgb(8 11 16 / .74); }
#sf-touch-overlay .mf-pick-name { font:800 18px/1 var(--mf-face); font-stretch:125%; letter-spacing:.05em; text-transform:uppercase; color:rgb(var(--mf-bone)); }
#sf-touch-overlay .mf-wheel[data-choice="0"] .mf-pick-name { font-size:13px; letter-spacing:.16em; color:rgb(var(--mf-bone) / .72); }
#sf-touch-overlay .mf-pick-text { font:500 13px/1.3 var(--mf-body); font-stretch:100%; color:rgb(var(--mf-bone) / .8); }
#sf-touch-overlay .mf-wheel[data-orbit="1"] .mf-pick { padding:6px 14px; }
#sf-touch-overlay .mf-wheel[data-orbit="1"] .mf-pick-name { font-size:16px; }
#sf-touch-overlay .mf-wheel[data-orbit="1"] .mf-pick-text { font-size:12px; line-height:1.25; }
@media (max-height:599px) and (min-aspect-ratio:1/1) {
 #sf-touch-overlay .mf-wheel-top { top:calc(10px + var(--sf-safe-top,0px)); left:calc(212px + var(--sf-safe-left,0px)); right:calc(270px + var(--sf-safe-right,0px)); width:auto; transform:none; }
 #sf-touch-overlay .mf-tab { font-size:11px; font-stretch:90%; letter-spacing:0; }
 #sf-touch-overlay .mf-pick { box-sizing:border-box; width:176px; max-width:100%; padding:6px 10px; justify-self:start; }
 #sf-touch-overlay .mf-pick-name { font-size:14px; }
 #sf-touch-overlay .mf-pick-text { font-size:12px; line-height:1.25; }
}
/* ---- toast, guide pill, guide dialog ---- */
#sf-touch-overlay .mf-toast { position:absolute; z-index:8; left:50%; top:calc(78px + var(--sf-safe-top,0px)); transform:translateX(-50%); max-width:min(76vw,360px); padding:9px 16px 9px 20px; background:rgb(8 11 16 / .84); color:rgb(var(--mf-bone)); font:600 13px/1.3 var(--mf-face); font-stretch:106%; letter-spacing:.04em; text-align:left; animation:mf-key-in 220ms var(--mf-out) both; }
#sf-touch-overlay .mf-toast::before { content:''; position:absolute; left:0; top:0; bottom:0; width:3px; background:var(--mf-hand); }
#sf-touch-overlay .mf-guide-open { position:absolute; z-index:70; bottom:calc(58px + var(--sf-safe-bottom,0px)); right:calc(14px + var(--sf-safe-right,0px)); display:inline-flex; align-items:center; gap:8px; min-height:44px; padding:0 18px 0 12px; border:0; border-radius:999px; background:rgb(8 11 16 / .8); color:rgb(var(--mf-bone) / .92); pointer-events:auto; touch-action:manipulation; font:600 12px/1 var(--mf-face); font-stretch:104%; letter-spacing:.1em; text-transform:uppercase; }
#sf-touch-overlay .mf-guide-open svg { width:20px; height:20px; fill:none; stroke:currentColor; stroke-width:1.7; stroke-linecap:round; stroke-linejoin:round; }
.sf-mobile-guide { background:rgb(8 11 16 / .96); color:#e8e2d4; border:0; border-radius:0; max-width:min(520px,calc(100vw - 24px)); max-height:calc(100dvh - 36px); padding:22px 22px 20px; font:400 15px/1.5 var(--dp-face-body,"Instrument Sans",system-ui,sans-serif); overflow:auto; overscroll-behavior:contain; box-shadow:0 0 0 1px rgb(232 226 212 / .16); }
.sf-mobile-guide::backdrop { background:rgb(2 4 8 / .86); }
.sf-mobile-guide h2 { margin:0 0 14px; font:800 26px/.95 var(--dp-face-display,"Archivo",system-ui,sans-serif); font-stretch:125%; letter-spacing:-.01em; text-transform:uppercase; }
.sf-mobile-guide .mg-list { list-style:none; margin:0 0 12px; padding:0; display:grid; gap:12px; }
.sf-mobile-guide .mg-list li { display:grid; grid-template-columns:28px 1fr; gap:12px; align-items:start; }
.sf-mobile-guide .mg-list svg { width:26px; height:26px; margin-top:2px; fill:none; stroke:#f2b950; stroke-width:1.7; stroke-linecap:round; stroke-linejoin:round; }
.sf-mobile-guide .mg-list b { display:block; margin-bottom:1px; font:700 12px/1.2 var(--dp-face-label,"Archivo",system-ui,sans-serif); font-stretch:112%; letter-spacing:.16em; text-transform:uppercase; color:#dfeeff; }
.sf-mobile-guide .mg-note { margin:0 0 12px; color:rgb(232 226 212 / .66); font-size:13px; }
.sf-mobile-guide label { display:flex; flex-wrap:wrap; align-items:center; justify-content:space-between; gap:10px; min-height:44px; font:600 12px/1.2 var(--dp-face-label,"Archivo",system-ui,sans-serif); font-stretch:112%; letter-spacing:.12em; text-transform:uppercase; color:rgb(232 226 212 / .82); }
.sf-mobile-guide select, .sf-mobile-guide input[type="range"] { min-height:44px; font:500 15px var(--dp-face-body,"Instrument Sans",system-ui,sans-serif); max-width:58%; }
/* 16px: iPhone Safari zooms the whole page when a select under 16px takes focus, and the deck keeps browser zoom on */
.sf-mobile-guide select { background:rgb(232 226 212 / .08); color:#e8e2d4; border:0; padding:0 10px; font-size:16px; }
.sf-mobile-guide .mg-check { justify-content:flex-start; text-transform:none; letter-spacing:.02em; font-weight:500; font-size:14px; }
.sf-mobile-guide .mg-check input { width:22px; height:22px; }
.sf-mobile-guide .mg-ready { position:relative; isolation:isolate; display:flex; align-items:center; min-height:50px; margin:12px 0 0 auto; padding:0 28px 0 24px; border:0; background:none; color:#1c1406; font:800 15px/1 var(--dp-face-display,"Archivo",system-ui,sans-serif); font-stretch:125%; letter-spacing:.16em; text-transform:uppercase; }
.sf-mobile-guide .mg-ready::before { content:''; position:absolute; inset:0; z-index:-1; background:#f2b950; clip-path:polygon(0 0, calc(100% - 14px) 0, 100% 14px, 100% 100%, 0 100%); }
/* with the wheel open the key cluster steps back (still live under the other thumb) so the two do not fight for the eye */
:root[data-sf-mobile-wheel="1"] #sf-touch-overlay :is(.mf-buttons,.mf-dock) { opacity:.22; transition:opacity 120ms linear; }
/* ---- motion: arrivals are springs and spins; reduced motion keeps every state and drops the movement ---- */
@keyframes mf-arrive { from { opacity:0; transform:scale(.74); } to { opacity:1; transform:none; } }
@keyframes mf-leave { to { opacity:0; transform:scale(1.07); } }
@keyframes mf-spin-in { from { transform:rotate(-26deg); opacity:0; } to { transform:none; opacity:1; } }
@keyframes mf-brake-in { from { opacity:0; transform:scale(1.25); } to { opacity:1; transform:none; } }
@keyframes mf-flick { 0% { opacity:1; stroke-width:7; } 100% { opacity:0; } }
@keyframes mf-ping { from { opacity:.9; transform:scale(1); } to { opacity:0; transform:scale(1.5); } }
@keyframes mf-orbit { to { transform:rotate(360deg); } }
@keyframes mf-breathe { 50% { opacity:.42; } }
@keyframes mf-key-in { from { opacity:0; transform:translateY(8px) scale(.94); } to { opacity:1; transform:none; } }
@keyframes mf-wheel-open { from { opacity:0; transform:scale(.86) rotate(-14deg); } to { opacity:1; transform:none; } }
@keyframes mf-node-in { from { opacity:0; transform:translate(-50%,-50%) scale(.6); } to { opacity:1; transform:translate(-50%,-50%); } }
html.sf-reduce-motion #sf-touch-overlay *, html.sf-reduce-motion #sf-touch-overlay *::before, html.sf-reduce-motion #sf-touch-overlay *::after { animation:none!important; transition:none!important; }
@media (prefers-reduced-motion:reduce) { #sf-touch-overlay *, #sf-touch-overlay *::before, #sf-touch-overlay *::after { animation:none!important; transition:none!important; } }
@media (forced-colors:active) { #sf-touch-overlay .mf-gun-field, .sf-mobile-guide .mg-ready::before { background:Highlight; } #sf-touch-overlay :is(.mf-edge-ring,.mf-r-edge,.mf-w-edge) { stroke:ButtonText; } }
/* ---- phone sizing: shorter screens pull the deck in ---- */
@media (max-width:600px) {
 #sf-touch-overlay .mf-buttons { right:calc(12px + var(--sf-safe-right,0px)); }
}
@media (max-width:360px) {
 #sf-touch-overlay .mf-tab { font-size:11px; letter-spacing:0; }
 #sf-touch-overlay .mf-wheel[data-orbit="1"] .mf-pick { padding:4px 10px; }
 #sf-touch-overlay .mf-wheel[data-orbit="1"] .mf-pick-name { font-size:14px; }
 #sf-touch-overlay .mf-wheel[data-orbit="1"] .mf-pick-text { font-size:11px; line-height:1.2; }
}
@media (max-height:500px) {
 #sf-touch-overlay .mf-buttons { bottom:calc(10px + var(--sf-safe-bottom,0px)); width:calc(170px * var(--mf-scale)); height:calc(132px * var(--mf-scale)); }
 #sf-touch-overlay .mf-gun { width:calc(82px * var(--mf-scale)); height:calc(82px * var(--mf-scale)); }
 #sf-touch-overlay .mf-tether { width:calc(66px * var(--mf-scale)); height:calc(66px * var(--mf-scale)); }
 #sf-touch-overlay .mf-dock { bottom:calc(10px + 132px * var(--mf-scale) + 12px + var(--sf-safe-bottom,0px)); }
 #sf-touch-overlay .mf-reel { right:calc(12px + 170px * var(--mf-scale) + 12px + var(--sf-safe-right,0px)); bottom:calc(10px + 33px * var(--mf-scale) - 38px + var(--sf-safe-bottom,0px)); }
 #sf-touch-overlay .mf-speed b { font-size:32px; }
 #sf-touch-overlay .mf-status { gap:4px; }
 #sf-touch-overlay .mf-edge { bottom:calc(10px + 132px * var(--mf-scale) + 78px + var(--sf-safe-bottom,0px)); height:max(64px,calc(88px * var(--mf-scale) - var(--sf-safe-bottom,0px))); }
 #sf-touch-overlay .mf-ghost { bottom:calc(104px + var(--sf-safe-bottom,0px)); }
 #sf-touch-overlay .mf-ghost svg { width:132px; height:132px; left:-66px; top:-66px; }
 #sf-touch-overlay .mf-ghost-label { top:70px; }
}
#sf-touch-overlay[data-layout="compact"] .mf-buttons { bottom:calc(8px + var(--sf-safe-bottom,0px)); right:calc(10px + var(--sf-safe-right,0px)); transform:scale(.86); transform-origin:100% 100%; }
/* ---- left hand: the cluster, handle, reel and dock mirror to the left edge ---- */
#sf-touch-overlay[data-lefty="1"] .mf-buttons { right:auto; left:calc(16px + var(--sf-safe-left,0px)); }
#sf-touch-overlay[data-lefty="1"][data-layout="compact"] .mf-buttons { transform-origin:0 100%; }
#sf-touch-overlay[data-lefty="1"] .mf-gun { right:auto; left:0; }
#sf-touch-overlay[data-lefty="1"] .mf-tether { left:auto; right:0; }
#sf-touch-overlay[data-lefty="1"] .mf-dock { right:auto; left:calc(18px + var(--sf-safe-left,0px)); }
#sf-touch-overlay[data-lefty="1"] .mf-reel { right:auto; left:calc(16px + 196px * var(--mf-scale) + 12px + var(--sf-safe-left,0px)); }
#sf-touch-overlay[data-lefty="1"] .mf-reel > i { right:auto; left:14px; }
#sf-touch-overlay[data-lefty="1"] .mf-reel .mf-reel-rail { right:auto; left:4px; }
#sf-touch-overlay[data-lefty="1"] .mf-reel-rail::before { right:auto; left:0; }
#sf-touch-overlay[data-lefty="1"] .mf-reel-bead { right:auto; left:-5px; }
#sf-touch-overlay[data-lefty="1"] .mf-edge { right:auto; left:var(--sf-safe-left,0px); }
#sf-touch-overlay[data-lefty="1"] .mf-edge::before { inset:-8px -18px -8px -2px; }
#sf-touch-overlay[data-lefty="1"] .mf-edge-art { transform:scaleX(-1); }
#sf-touch-overlay[data-lefty="1"] .mf-edge-word { left:auto; right:calc(17px * var(--mf-scale)); transform:translateY(-50%); }
`;

/* Narrow-screen adaptations use actual Deckplate/ORRERY hooks; no transforms on the whole app. */
const SCREEN_CSS = `
/* Landscape phone: short and wide. The title and pause stand as two columns (name left, verbs right, each scrolling on its own). */
@media (max-height:520px) and (min-width:560px) {
 :root[data-sf-mobile="1"] #screens#screens > :is(.of-title.orr-title--phone,.of-pause.orr-pause--phone) { grid-template-columns:minmax(0,1fr) minmax(0,1fr)!important; grid-template-rows:minmax(0,1fr) auto!important; grid-template-areas:"head body" "foot foot"!important; column-gap:24px; }
 :root[data-sf-mobile="1"] #screens#screens > :is(.of-title.orr-title--phone,.of-pause.orr-pause--phone) > .dp-frame__head { align-self:center; }
 :root[data-sf-mobile="1"] #screens#screens > :is(.of-title.orr-title--phone,.of-pause.orr-pause--phone) > .dp-frame__body { align-self:center; max-height:calc(100dvh - 70px); overflow-y:auto!important; }
 :root[data-sf-mobile="1"] #screens#screens > .of-title.orr-title--phone .dp-logotype { font-size:clamp(26px,5.2vw,46px)!important; max-width:100%!important; }
}
@media (max-width:960px), (max-height:540px) and (pointer:coarse) {
 :root[data-sf-mobile="1"] .screen { box-sizing:border-box; max-width:100vw!important; max-height:100dvh!important; min-width:0!important; padding-left:max(14px,env(safe-area-inset-left))!important; padding-right:max(14px,env(safe-area-inset-right))!important; padding-top:max(12px,env(safe-area-inset-top))!important; padding-bottom:max(20px,env(safe-area-inset-bottom))!important; overflow-x:hidden; overflow-y:auto; overscroll-behavior:contain; touch-action:pan-y; }
 :root[data-sf-mobile="1"] .screen :is(button,[role="button"],select,input) { min-height:44px; touch-action:manipulation; }
 :root[data-sf-mobile="1"] .screen :is(input,select,textarea) { font-size:16px!important; }
 :root[data-sf-mobile="1"] .dp-frame__body { min-height:0!important; min-width:0!important; overflow:visible!important; grid-template-columns:minmax(0,1fr)!important; }
 :root[data-sf-mobile="1"] .dp-frame__col { width:100%!important; max-width:100%!important; min-width:0!important; }
 :root[data-sf-mobile="1"] .dp-frame__scroll { max-height:none!important; overflow:visible!important; }
 :root[data-sf-mobile="1"] .of-title-actions :is(ol,ul) { position:relative!important; display:flex!important; flex-direction:column; align-items:stretch; gap:8px; padding:0!important; margin:0!important; width:100%!important; height:auto!important; }
 :root[data-sf-mobile="1"] .of-title-actions li { position:relative!important; transform:none!important; inset:auto!important; width:100%!important; max-width:100%!important; }
 :root[data-sf-mobile="1"] .of-title-actions button { transform:none!important; position:relative!important; width:100%!important; min-height:48px; text-align:left; }
 :root[data-sf-mobile="1"] .of-title-actions canvas { display:none!important; }
 :root[data-sf-mobile="1"] .dp-logotype { max-width:85vw!important; font-size:clamp(32px,10vw,70px)!important; }
 :root[data-sf-mobile="1"] .screen :is(.dp-grid,.sf-grid) { min-width:0; grid-template-columns:repeat(auto-fit,minmax(min(240px,100%),1fr))!important; }
 :root[data-sf-mobile="1"] .screen :is(.dp-copy,.dp-read,.sf-slot-name) { overflow-wrap:anywhere; }
 /* the ESC cue beside every Back is a pseudo-element set with !important in a dozen layouts; two ids outrank them all */
 :root[data-sf-mobile="1"] #screens#screens :is(.sf-back,.gm-close)::after { content:none!important; display:none!important; }
 /* New Game: the hull yard has no ring to stand on in a phone's width, so its three hulls become a row of choices */
 :root[data-sf-mobile="1"] #screens .orr-newgame .orr-turntable { position:static!important; display:block!important; grid-column:1!important; pointer-events:auto!important; z-index:auto!important; height:auto!important; margin:14px 0 0!important; }
 :root[data-sf-mobile="1"] #screens .orr-newgame .orr-turntable::before { content:"Start as"; display:block; margin-bottom:4px; font:600 12px/1 var(--dp-face-label,"Archivo",system-ui,sans-serif); font-stretch:112%; letter-spacing:.18em; text-transform:uppercase; color:rgb(232 226 212 / .62); }
 :root[data-sf-mobile="1"] #screens .orr-newgame .orr-turntable > svg, :root[data-sf-mobile="1"] #screens .orr-newgame .orr-turntable .orr-turntable__art, :root[data-sf-mobile="1"] #screens .orr-newgame .orr-yard__model { display:none!important; }
 :root[data-sf-mobile="1"] #screens .orr-newgame .orr-turntable > .orr-turntable__row { position:static!important; display:flex!important; gap:6px; justify-content:space-between; inset:auto!important; }
 :root[data-sf-mobile="1"] #screens .orr-newgame .orr-turntable > .orr-turntable__row > li { position:static!important; transform:none!important; left:auto!important; top:auto!important; flex:1 1 0; min-width:0; text-align:center; opacity:1!important; }
 :root[data-sf-mobile="1"] #screens .orr-newgame .orr-turntable .k-word[aria-pressed="true"] { color:var(--dp-hand-hot,#ffd98c)!important; }
 /* The station: identity + vitals stay on glass; the tab body scrolls; destinations wrap above Undock.
    Two ids and html:root outrank the layout sheets, which pin these with !important. */
 html:root[data-sf-mobile="1"] body #screens#screens > .sx-berth.orr-station { display:flex!important; flex-direction:column; overflow:hidden!important; grid-template-rows:none!important; height:100%!important; max-height:100dvh!important; }
 html:root[data-sf-mobile="1"] body #screens#screens > .sx-berth.orr-station header.sxb-berth { flex:none!important; height:auto!important; max-height:none!important; }
 html:root[data-sf-mobile="1"] body #screens#screens > .sx-berth.orr-station .dp-frame__body--station { flex:1 1 0!important; min-height:0!important; height:auto!important; overflow-x:hidden!important; overflow-y:auto!important; }
 html:root[data-sf-mobile="1"] body #screens#screens > .sx-berth.orr-station .sx-screen__body { overflow:visible!important; max-height:none!important; height:auto!important; }
 html:root[data-sf-mobile="1"] body #screens#screens > .sx-berth.orr-station footer.sxb-ops { flex:none!important; position:relative!important; bottom:auto; z-index:6; display:flex!important; flex-wrap:wrap!important; align-items:center!important; gap:4px 10px!important; padding:6px 0 calc(8px + env(safe-area-inset-bottom,0px))!important; height:auto!important; background:linear-gradient(0deg,rgb(7 8 10) 62%,rgb(7 8 10 / 0)); }
 html:root[data-sf-mobile="1"] body #screens#screens > .sx-berth.orr-station .of-facility-rail { order:1; width:100%!important; flex:0 0 100%!important; max-width:100%!important; min-width:0!important; overflow:visible!important; height:auto!important; }
 html:root[data-sf-mobile="1"] body #screens#screens > .sx-berth.orr-station .of-facility-rail .sxb-ops__dock { display:block!important; width:100%!important; min-width:0; max-width:100%; }
 html:root[data-sf-mobile="1"] body #screens#screens > .sx-berth.orr-station .of-facility-rail .sx-dock { width:100%!important; flex-wrap:wrap!important; position:relative!important; }
 html:root[data-sf-mobile="1"] body #screens#screens > .sx-berth.orr-station .sx-comms { order:2; margin-left:0!important; }
 html:root[data-sf-mobile="1"] body #screens#screens > .sx-berth.orr-station .sxb-launch-seat { order:3; margin-left:auto; }
 /* Save/Load: a two-column grid with a fixed-height slot strip overran the footer in one column; it is a page here */
 html:root[data-sf-mobile="1"] body #screens#screens > .screen[data-screen="saveLoad"] { display:flex!important; flex-direction:column; gap:18px; overflow-y:auto!important; overflow-x:hidden; }
 html:root[data-sf-mobile="1"] body #screens#screens > .screen[data-screen="saveLoad"] > * { grid-area:auto!important; flex:none; width:100%!important; max-width:100%!important; min-width:0; }
 html:root[data-sf-mobile="1"] body #screens#screens > .screen[data-screen="saveLoad"] > .sf-save-stage { display:none!important; }
 html:root[data-sf-mobile="1"] body #screens#screens > .screen[data-screen="saveLoad"] .sf-save-ledger { order:1; }
 html:root[data-sf-mobile="1"] body #screens#screens > .screen[data-screen="saveLoad"] .orr-film { order:2; min-height:210px!important; height:210px!important; }
 html:root[data-sf-mobile="1"] body #screens#screens > .screen[data-screen="saveLoad"] > footer.k-foot { order:3; }
 /* New Game is a page too: fields, then the hull row, with Back / Launch pinned at the foot while the rest scrolls */
 html:root[data-sf-mobile="1"] body #screens#screens > .screen.orr-newgame { display:flex!important; flex-direction:column; gap:14px; overflow-y:auto!important; overflow-x:hidden; }
 html:root[data-sf-mobile="1"] body #screens#screens > .screen.orr-newgame > * { grid-area:auto!important; flex:none; width:100%!important; max-width:100%!important; min-width:0; }
 html:root[data-sf-mobile="1"] body #screens#screens > .screen.orr-newgame > :is(.k-stage,.orr-ng-pick) { display:none!important; }
 html:root[data-sf-mobile="1"] body #screens#screens > .screen.orr-newgame > .k-hang { height:auto!important; max-height:none!important; overflow:visible!important; }
 html:root[data-sf-mobile="1"] body #screens#screens > .screen.orr-newgame .orr-turntable { position:static!important; min-height:84px!important; height:auto!important; order:3; }
 html:root[data-sf-mobile="1"] body #screens#screens > .screen.orr-newgame > footer.sf-ng-footer { order:4; position:sticky; bottom:0; z-index:5; background:linear-gradient(0deg,rgb(7 8 10 / .96) 80%,rgb(7 8 10 / 0)); padding-bottom:max(8px,env(safe-area-inset-bottom)); }
 html:root[data-sf-mobile="1"] body #screens#screens > .screen.orr-newgame > .k-fine { order:5; }
 /* keyboard legends mean nothing under a thumb */
 :root[data-sf-mobile="1"] .screen :is(.dp-kbd,.sf-pause-foot__keys,.sf-pause-key,.sf-pause-key-verb) { display:none!important; }
 :root[data-sf-mobile="1"][data-sf-mobile-flight="1"] #gl-canvas { touch-action:none; }
 :root[data-sf-mobile="1"][data-sf-mobile-flight="1"] :is(.sf-prail,.sf-leftstack,.orr-hud-cluster,.sf-overview,.sf-target) { display:none!important; }
 /* the deck has its own DOCK key, so the keyboard-worded prompt goes; alerts and the travel tape clear the status strip */
 :root[data-sf-mobile="1"][data-sf-mobile-flight="1"] .sf-alert--dock { display:none!important; }
 /* the objective and comms stack stands under the status strip and the alerts, left-aligned; the radar band readout sits
    under the pause key and the deck has no band to switch, so it goes; hail and comms are real buttons and get thumb size */
 :root[data-sf-mobile="1"][data-sf-mobile-flight="1"] #hud .sf-leftcontext { top:calc(176px + var(--sf-safe-top,0px))!important; left:calc(14px + var(--sf-safe-left,0px))!important; max-width:min(250px,64vw); }
 :root[data-sf-mobile="1"][data-sf-mobile-flight="1"] #sf-band-hud { display:none!important; }
 /* the right dock stacks law/intercept and contact cards up from the bottom-right corner, which is the key cluster's:
    on a phone it hangs from under the pause key instead; the radar's accessibility canvas must not eat a thumb */
 :root[data-sf-mobile="1"][data-sf-mobile-flight="1"] #hud .sf-rightdock { top:calc(168px + var(--sf-safe-top,0px))!important; bottom:auto!important; right:calc(12px + var(--sf-safe-right,0px))!important; width:min(236px,58vw)!important; max-height:150px; overflow:hidden; }
 :root[data-sf-mobile="1"][data-sf-mobile-flight="1"] .sf-radar-semantic-canvas { pointer-events:none!important; }
 :root[data-sf-mobile-wheel="1"] #hud .sf-rightdock { opacity:0!important; }
 /* the Massline cadence card is a 330px instrument in the mid-left column, where a thumb lives: on a phone it keeps its
    status line and window bar, drops the stat row and hint, and sits under the pause key */
 :root[data-sf-mobile="1"][data-sf-mobile-flight="1"] .ml2-cadence-slot { position:fixed!important; right:auto!important; left:calc(14px + var(--sf-safe-left,0px))!important; top:calc(176px + var(--sf-safe-top,0px))!important; bottom:auto!important; width:min(230px,56vw)!important; }
 :root[data-sf-mobile="1"][data-sf-mobile-flight="1"]:has(.ml-cadence:not([hidden])) .sf-leftcontext { opacity:0!important; pointer-events:none!important; }
 :root[data-sf-mobile="1"][data-sf-mobile-flight="1"] .ml-cadence { width:100%!important; padding:9px 12px 8px!important; }
 :root[data-sf-mobile="1"][data-sf-mobile-flight="1"] .ml-cadence :is(.ml-cadence__stats,.ml-cadence__hint) { display:none!important; }
 :root[data-sf-mobile-wheel="1"] .ml2-cadence-slot { opacity:0!important; }
 /* Receipts grow upward above the stick and Dock key. Keep the power handle's edge clear;
    the cluster width also carries the player's control-size setting into this reserved lane. */
 :root[data-sf-mobile="1"][data-sf-mobile-flight="1"] #toasts { right:auto!important; left:calc(14px + var(--sf-safe-left,0px))!important; top:auto!important; bottom:calc(max(224px,94px + var(--mf-cluster-w,196px) * .8) + var(--sf-safe-bottom,0px))!important; width:min(320px,calc(100vw - 26px - max(58px,var(--mf-cluster-w,196px) * .25) - var(--sf-safe-left,0px) - var(--sf-safe-right,0px)))!important; max-width:none!important; }
 /* Informational arrivals stay two thin receipt rows, rather than wrapping a zone paragraph
    upward across the ship. Full text remains in the receipt and its live announcement. */
 :root[data-sf-mobile="1"][data-sf-mobile-flight="1"] #toasts .sf-toast--info { box-sizing:border-box; width:100%; max-width:100%; min-width:0; }
 :root[data-sf-mobile="1"][data-sf-mobile-flight="1"] #toasts .sf-toast--info .sf-toast__text { flex:1; min-width:0; white-space:nowrap; overflow:hidden; text-overflow:ellipsis; }
 /* Receipts remain information, so a touch through their text still starts the flight stick. */
 :root[data-sf-mobile="1"][data-sf-mobile-flight="1"] :is(#toasts,#toasts *) { pointer-events:none!important; }
 :root[data-sf-mobile="1"][data-sf-mobile-lefty="1"][data-sf-mobile-flight="1"] #toasts { left:auto!important; right:calc(14px + var(--sf-safe-right,0px))!important; }
 :root[data-sf-mobile="1"][data-sf-mobile-flight="1"] #hud :is(.sf-contact-hail__button,.sf-comm-backlog-btn) { min-height:40px; min-width:60px; pointer-events:auto; }
 :root[data-sf-mobile="1"][data-sf-mobile-flight="1"] #alerts { transform:translateY(calc(124px + var(--sf-safe-top,0px))); }
 :root[data-sf-mobile="1"][data-sf-mobile-flight="1"] #hud .sf-vtape { left:14px!important; bottom:auto!important; top:calc(128px + var(--sf-safe-top,0px))!important; }
 :root[data-sf-mobile="1"][data-sf-mobile-flight="1"] #hud .sf-radar-wrap { position:fixed!important; top:64px!important; right:12px!important; bottom:auto!important; left:auto!important; transform:scale(.5)!important; transform-origin:top right!important; pointer-events:auto!important; }
 /* Ordinary flight's camera/Circuits keys are a narrow rail under Pause, clear of the ship scales.
    Authored races keep their map and readings in a compact central instrument. */
 :root[data-sf-mobile="1"][data-sf-mobile-flight="1"] #race-tape { font:500 11px/1.3 var(--dp-face-body,"Instrument Sans",system-ui,sans-serif); background:rgb(8 11 16 / .76); padding:6px; }
 :root[data-sf-mobile="1"][data-sf-mobile-flight="1"] #race-tape[data-compact="true"] { top:calc(70px + var(--sf-safe-top,0px)); right:calc(12px + var(--sf-safe-right,0px)); width:min(128px,calc(100vw - 202px - var(--sf-safe-left,0px) - var(--sf-safe-right,0px))); }
 :root[data-sf-mobile="1"][data-sf-mobile-flight="1"] #race-tape .race-tape-actions { gap:4px; }
 :root[data-sf-mobile="1"][data-sf-mobile-flight="1"] #race-tape .race-tape-actions .k-word { min-height:44px; border:0; border-bottom:1px solid rgb(232 226 212 / .25); padding:4px 6px; font:inherit; }
 :root[data-sf-mobile="1"][data-sf-mobile-flight="1"] #race-tape[data-compact="true"] .race-tape-actions { display:grid; grid-template-columns:repeat(2,minmax(0,1fr)); }
 :root[data-sf-mobile="1"][data-sf-mobile-flight="1"] #race-tape[data-compact="true"] .k-word { min-width:0; padding:4px 1px; white-space:normal; overflow-wrap:normal; }
 :root[data-sf-mobile="1"][data-sf-mobile-flight="1"] #race-tape[data-compact="false"] { top:calc(12px + var(--sf-safe-top,0px)); left:calc(214px + var(--sf-safe-left,0px)); right:calc(78px + var(--sf-safe-right,0px)); width:auto; transform:none; grid-template-columns:64px minmax(0,1fr); max-height:calc(100dvh - 210px); overflow-y:auto; }
 :root[data-sf-mobile-wheel="1"] #race-tape { visibility:hidden; pointer-events:none; }
 :root[data-sf-mobile-wheel="1"] #race-tape * { pointer-events:none; }
}
 :root[data-sf-mobile-wheel="1"] #hud .sf-radar-wrap { display:none!important; }
 :root[data-sf-mobile-wheel="1"] :is(#hud .sf-vtape,#alerts) { opacity:0!important; }
@media (max-width:600px) {
 :root[data-sf-mobile="1"] :is(.of-title,.of-pause) { grid-template-columns:1fr!important; grid-template-rows:auto 1fr!important; gap:18px; }
 :root[data-sf-mobile="1"] .dp-frame__head { flex:none; }
}
@media (max-height:500px) {
 :root[data-sf-mobile="1"][data-sf-mobile-flight="1"] #toasts { bottom:calc(max(182px,84px + var(--mf-cluster-w,196px) * .675) + var(--sf-safe-bottom,0px))!important; }
 :root[data-sf-mobile="1"][data-sf-mobile-flight="1"] #hud .sf-radar-wrap { top:56px!important; transform:scale(.4)!important; }
 /* landscape has the width: alerts return to the top centre, the right dock sits left of the pause key */
 :root[data-sf-mobile="1"][data-sf-mobile-flight="1"] #alerts { transform:none!important; }
 :root[data-sf-mobile="1"][data-sf-mobile-flight="1"] #hud .sf-rightdock { top:calc(64px + var(--sf-safe-top,0px))!important; right:calc(104px + var(--sf-safe-right,0px))!important; width:min(236px,32vw)!important; max-height:150px; }
 :root[data-sf-mobile="1"][data-sf-mobile-flight="1"] #race-tape[data-compact="true"] { top:calc(68px + var(--sf-safe-top,0px)); right:calc(84px + var(--sf-safe-right,0px)); width:auto; }
 :root[data-sf-mobile="1"][data-sf-mobile-flight="1"] #race-tape[data-compact="true"] .race-tape-actions { display:flex; }
}
@media (max-width:600px) {
 :root[data-sf-mobile="1"][data-sf-mobile-flight="1"] #race-tape[data-compact="false"] { top:calc(172px + var(--sf-safe-top,0px)); left:14px; right:14px; max-height:calc(100dvh - 372px); }
}
`;

export const MOBILE_CSS = FLIGHT_CSS + SCREEN_CSS;
