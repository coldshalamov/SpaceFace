// The production flight stylesheet, isolated from system imports for genuine presentation tests.
// uiRoot invokes this same one-time style owner; no copied CSS or substitute runtime.
// The flight HUD is the first surface built on the deckplate design system (src/ui/deckplate/*);
// injectDeckplate runs before the HUD sheet so the register's var(--dp-*) references resolve.
import { bracketCss } from '../hudBrackets.js';
import { injectDeckplate } from '../deckplate/index.js';
const HUD_STYLE_ID = 'sf-hud-style';

export function injectHudCss() {
  if (document.getElementById(HUD_STYLE_ID)) return;
  injectDeckplate();
  const s = document.createElement('style');
  s.id = HUD_STYLE_ID;
  s.textContent = `
  /* ===== SpaceFace flight HUD ===== */
  #hud { font-size:calc(var(--k-fs-data) * var(--ui-scale, 1)); }
  #hud > * { pointer-events:none; }
  #hud > .sf-cargo-panel { pointer-events:auto; }
  #hud > .sf-rightdock, #hud > .sf-command-deck, #hud > .sf-overview { pointer-events:auto; }
  body.ui-modal-open #aim-reticle,
  body.ui-modal-open #pilot-portrait { display:none !important; }
  body.ui-modal-open #alerts,
  body.ui-modal-open #toasts { opacity:0 !important; pointer-events:none !important; }

  /* Reticle reflects aim mode: amber tint + slight pulse when auto-target is tracking hostiles,
     cyan when the pilot aims/fires manually (Phase 2). */
  #aim-reticle { transition:none; }
  #aim-reticle svg * { filter:none !important; }
  #aim-reticle .sf-reticle-shape--bracket { display:none; }
  #aim-reticle[data-mode="auto"] .sf-reticle-shape--open { display:none; }
  #aim-reticle[data-mode="auto"] .sf-reticle-shape--bracket { display:block; }
  #aim-reticle.autofire > svg { animation:sf-reticlepulse 1.4s ease-in-out infinite alternate; }
  @keyframes sf-reticlepulse { from { opacity:.88; } to { opacity:1; } }

  /* ===== bottom-left: ship schematic + thin micro-bars (Tactical Visor §3C) ===== */
  /* Container is now chromeless — no panel background, border, or blur. */
  /* Bottom-left anchor is ONE flex column (SPEC3-36 three-anchor law): a contextual sub-column
     (.sf-leftcontext — mission tracker + objectives + nav readout, relocated from the old top
     stragglers) sits ABOVE the schematic + vitals (.sf-bars). Compositor-cheap: no shadow/transition. */
  .sf-leftstack { position:absolute; left:calc(22px + var(--sf-safe-inset-x, 0px)); bottom:22px; display:flex; flex-direction:column;
    gap:12px; align-items:flex-start; max-width:340px; }
  .sf-leftcontext { display:flex; flex-direction:column; gap:8px; align-items:flex-start; max-width:300px; }
  .sf-leftcontext:empty { display:none; }   /* collapses when every contextual readout is hidden */
  .sf-bars { position:relative; display:flex; flex-direction:column;
    gap:10px; align-items:flex-start; }

  /* Top-down ship schematic: outline + shield ring + hull readout. */
  .sf-schematic { position:relative; width:96px; height:96px; }
  .sf-schematic svg { width:100%; height:100%; overflow:visible; }
  .sf-schematic .sf-sch-ship { fill:none; stroke:var(--hud-cyan); stroke-width:2; transition:stroke .25s ease, filter .25s ease; }
  .sf-schematic .sf-sch-shield { fill:none; stroke:var(--hud-cyan); stroke-width:2.5;
    stroke-linecap:round; opacity:.85;
    transition:stroke-dashoffset .15s linear; }
  /* Hull-critical state: tint the whole schematic red and pulse. */
  .sf-schematic.sf-sch-critical .sf-sch-ship { stroke:var(--k-red); animation:sf-schpulse 1s ease-in-out infinite alternate; }
  @keyframes sf-schpulse { from { opacity:.6; } to { opacity:1; } }
  .sf-sch-hull { position:absolute; left:50%; top:50%; transform:translate(-50%,-50%);
    font-family:var(--hud-data); font-size:var(--k-fs-emph); font-weight:700; color:var(--hud-paper); pointer-events:none; }
  .sf-schematic.sf-sch-critical .sf-sch-hull { color:var(--k-red); }
  /* Damage flash: a quick white-hot pulse of the ship outline when the player is hit. */
  .sf-schematic.sf-sch-hit .sf-sch-ship { animation:sf-schhit .34s ease-out; }
  @keyframes sf-schhit {
    0% { stroke:var(--hud-paper); }
    100% { stroke:var(--hud-cyan); } }

  /* Thin micro-bars (energy / heat / boost) — 2px glowing lines, no panel. */
  .sf-barrow { display:flex; align-items:center; gap:8px; }
  .sf-barrow__label { width:40px; font-family:var(--hud-data); font-size:var(--k-fs-data);
    color:var(--hud-muted); }
  .sf-barrow__num { width:38px; text-align:right; font-family:var(--hud-data); font-size:var(--k-fs-data);
    color:var(--hud-paper); }
  .sf-bar { position:relative; width:150px; height:2px; overflow:visible;
    background:var(--k-hair); }
  .sf-bar--sm { height:2px; width:100%; }
  .sf-bar__fill { position:absolute; inset:0; transform-origin:left center; transform:scaleX(1);
    transition:transform .1s linear; }
  /* hull/shield modifiers are now consumed only by the target panel — keep them distinct
     (hull = red, shield = cyan) so a target's defensive state stays parseable. */
  .sf-bar--hull .sf-bar__fill { background:var(--k-red); }
  .sf-bar--shield .sf-bar__fill { background:var(--hud-cyan); }
  .sf-bar--energy .sf-bar__fill { background:var(--hud-amber); }
  .sf-bar--heat .sf-bar__fill { background:var(--k-red); }
  .sf-bar--heat.sf-bar--overheated .sf-bar__fill { background:var(--k-red); }
  .sf-barrow.sf-bar--venting .sf-bar--heat .sf-bar__fill,
  .sf-bar--heat.sf-bar--venting .sf-bar__fill { background:var(--k-red); }
  .sf-bar--boost .sf-bar__fill { background:var(--hud-cyan); }

  /* ===== nav / target-lock readout — chromeless text, relocated into the bottom-left column (§3E) ===== */
   .sf-nav-readout { position:relative; text-align:left;
    pointer-events:none; contain:layout paint style;
    padding:2px 10px; }
  .sf-nav-label { font-family:var(--hud-data); font-size:var(--k-fs-data);
    color:var(--hud-cyan); }
  /* The "[ TARGET LOCK: ... ]" / "[ NNN u ]" framing applies only to a live, in-range fix — the JS
     toggles .sf-nav--lock for that case; route/tutorial guidance renders plain (§3E). */
  .sf-nav--lock .sf-nav-label::before { content:'[ TARGET LOCK: '; color:var(--hud-muted); }
  .sf-nav--lock .sf-nav-label::after { content:' ]'; color:var(--hud-muted); }
  .sf-nav-meta { font-family:var(--hud-data); font-size:var(--k-fs-data); color:var(--hud-muted);
    margin-top:3px; }
  .sf-nav-meta .sf-nav-dist { color:var(--hud-paper); }
  .sf-nav--lock .sf-nav-meta .sf-nav-dist::before { content:'[ '; color:var(--hud-muted); }
  .sf-nav--lock .sf-nav-meta .sf-nav-dist::after { content:' ]'; color:var(--hud-muted); }

  /* ===== bottom-left: fuel gauge styling ===== */
  .sf-bar--fuel .sf-bar__fill { background:var(--hud-cyan); }

  /* ===== bottom-center: action bar (key→ability map) + flight readouts (§3B) ===== */
  #action-bar { position:absolute; bottom:28px; left:50%; transform:translateX(-50%);
    display:flex; gap:16px; }
  .action-slot { display:flex; flex-direction:column; align-items:center; gap:6px; }
  .action-slot .bind { font-family:var(--hud-data); font-size:var(--k-fs-data);
    color:var(--hud-muted); }
  .icon-box { position:relative; width:44px; height:44px; border:1px solid var(--k-hair); display:flex; justify-content:center; align-items:center; transition:box-shadow .12s ease, border-color .12s ease; }
  .icon-box svg { width:24px; height:24px; fill:none; stroke:var(--hud-cyan); stroke-width:1.8;
    stroke-linecap:round; stroke-linejoin:round; opacity:.9; }
  .icon-box.sf-act-active { border-color:var(--hud-cyan); }
  .icon-box.sf-act-active svg { opacity:1; }

  /* ===== bottom-center: flight readouts — chromeless thin-line row above the action bar (§3B) ===== */
  .sf-cluster { position:absolute; left:50%; bottom:92px; transform:translateX(-50%);
    display:flex; flex-wrap:wrap; justify-content:center; gap:6px 20px; align-items:baseline;
    max-width:min(880px, 92vw); }
  .sf-stat { display:flex; align-items:baseline; gap:5px; position:relative;
    font-family:var(--hud-data); }
  .sf-stat__k { font-size:var(--k-fs-data); color:var(--hud-muted); }
  .sf-stat__v { font-size:var(--k-fs-data); color:var(--hud-paper); }
  .sf-credits { color:var(--hud-cyan); }
  .sf-stat__v.sf-warn { color:var(--hud-amber); }
  /* HUD 2.0 (GDD §9.4): SPD reads a size up — it's the one number flight always needs. */
  .sf-stat--speed .sf-stat__v { font-size:var(--k-fs-emph); }
  /* Contextual chips: hidden at rest, surface on value change, fade out. Nothing glows at rest. */
  .sf-stat--chip { opacity:0; transform:translateY(5px); pointer-events:none;
    transition:opacity .28s var(--ease, ease), transform .28s var(--ease, ease); }
  .sf-stat--chip.sf-chip-show { opacity:1; transform:translateY(0); pointer-events:auto; }
  /* Directional money pulse: income flares mint and settles; spend dips amber. One-shot, no
     strobe — the count-up tween already owns the digits, this only tints the readout. */
  .sf-stat--chip.sf-credits--gain .sf-stat__v { animation:sf-cred-gain .55s ease-out; }
  .sf-stat--chip.sf-credits--spend .sf-stat__v { animation:sf-cred-spend .55s ease-out; }
  @keyframes sf-cred-gain {
    0% { color:#8dffb6; text-shadow:0 0 14px rgb(141 255 182 / .55); }
    100% { color:var(--hud-cyan); text-shadow:none; }
  }
  @keyframes sf-cred-spend {
    0% { color:var(--hud-amber); text-shadow:0 0 10px rgb(255 190 92 / .45); }
    100% { color:var(--hud-cyan); text-shadow:none; }
  }
  /* Hover-affordance: these are readouts; underline the key to hint at the tooltip. */
  .sf-stat--info { cursor:default; user-select:none; }
  /* Line-control key hint. Sits under the tether readout only while a line is attached, which is
     exactly when those keys do anything. Calm, not shouty: this is chrome that teaches, so it takes
     --sf-calm and the data face, and holds the 12px grammar floor like everything else. */
  /* .sf-stat is a baseline flex ROW, so the hint has to claim a full basis to land on its own line;
     inline it would push a long string across the 272px left stack, which already overflows. Wrapping
     is enabled on the tether stat only, so no other readout changes shape. */
  #sf-tetherstat { flex-wrap:wrap; }
  .sf-stat__hint { flex-basis:100%; margin-top:2px; font-family:var(--hud-data); font-size:var(--k-fs-data); color:var(--hud-muted); opacity:.85; }
  .sf-stat__hint[hidden] { display:none; }
  .sf-stat--info .sf-stat__k { border-bottom:1px dotted var(--k-hair); padding-bottom:1px; }
  .sf-stat--info:hover .sf-stat__k { color:var(--hud-cyan); border-bottom-color:var(--k-hair); }
  /* Hover tooltip for stat readouts — the one place a dark backing aids legibility of dense text. */
  .sf-tip { display:none; position:absolute; left:50%; bottom:calc(100% + 12px); transform:translateX(-50%);
    min-width:180px; max-width:260px; padding:8px 10px;
    border:1px solid var(--hud-cyan); color:var(--hud-paper);
    font-family:var(--hud-data); font-size:var(--k-fs-data); line-height:1.45;
    white-space:pre-line; pointer-events:none; z-index:200; }
  .sf-tip::after { content:''; position:absolute; left:50%; top:100%; transform:translateX(-50%);
    border:6px solid transparent; border-top-color:var(--hud-cyan); }
  .sf-stat--info:hover .sf-tip { display:block; }

  /* ===== bottom-right: tactical node map (radar) + target readout (§3D) ===== */
  /* Borderless: the radar reads as a raw projection. The canvas uses compact size in normal
     flight and switches to the larger tactical surface only while expanded. */
  .sf-rightdock { position:absolute; right:calc(22px + var(--sf-safe-inset-x, 0px)); bottom:22px; display:flex; flex-direction:column; align-items:flex-end; gap:8px;
    contain:layout paint style; }
  .sf-radar-wrap { display:flex; flex-direction:column; align-items:center; gap:6px; contain:layout paint style; }
  .sf-radar { position:relative; width:var(--sf-radar-size, 220px); height:var(--sf-radar-size, 220px); border-radius:50%; overflow:hidden; cursor:pointer;
    contain:layout paint style; }
  .sf-radar--expanded { width:340px !important; height:340px !important; }
  /* Canvas is centered so compact/expanded size changes stay anchored on the player marker. */
  .sf-radar canvas { display:block; position:absolute; left:50%; top:50%; transform:translate(-50%,-50%); }
  .sf-radar-objective-key { width:100%; text-align:center; color:var(--hud-amber);
    font-family:var(--hud-data); font-size:var(--k-fs-data); font-weight:700; }
  /* HUD sub-panel surface — now chromeless. Legibility comes from hard text-shadow on the content. */
  .sf-hudpanel { background:none; border:none; }
  .sf-target { width:100%; display:flex; flex-direction:column; gap:5px; text-align:right; contain:layout paint style; padding:2px 0; }
  .sf-target__head { display:flex; align-items:baseline; justify-content:flex-end; gap:8px; }
  .sf-target__name { font-family:var(--hud-data); font-size:var(--k-fs-data); color:var(--hud-paper); white-space:nowrap; overflow:hidden; text-overflow:ellipsis; }
  .sf-target__faction { font-family:var(--hud-data); font-size:var(--k-fs-data); }
  .sf-target__meta { display:flex; justify-content:flex-end; gap:14px; font-family:var(--hud-data); font-size:var(--k-fs-data);
    color:var(--hud-muted); }
  .sf-target .sf-bar__fill { transition:none; }
  /* The target panel's mini hull/shield bars become thin lines flush right (3px for legibility). */
  .sf-target .sf-bar { width:100%; }
  .sf-target .sf-bar--sm { height:3px; }

  /* Damage triangle (BP-02): E/K/X effectiveness vs the target's current outer layer. Three tiny
     labeled bars; the best family highlights so "what should I be shooting" reads instantly. */
  .sf-target__triangle { display:flex; align-items:center; gap:7px; margin-top:5px; font-family:var(--hud-data); }
  .sf-target__tri-label { font-size:var(--k-fs-data); color:var(--hud-muted); opacity:.7; }
  .sf-target__tri-layer { font-size:var(--k-fs-data); color:var(--hud-muted); opacity:.6; margin-left:auto; }
  .sf-tri { display:flex; align-items:center; gap:3px; }
  /* Focusable so the tier-2 why (data-why: Energy/Kinetic/Explosive) answers keyboard focus, not
     just hover. A thin bar glyph needs a generous focus target or it is unreachable. */
  .sf-tri:focus-visible { outline:2px solid var(--hud-paper); outline-offset:3px; }
  .sf-tri__k { font-size:var(--k-fs-data); color:var(--hud-muted); opacity:.75; width:8px; text-align:center; }
  .sf-tri__bar { display:inline-block; width:26px; height:3px; background:var(--k-hair); overflow:hidden; }
  .sf-tri__fill { display:block; width:100%; height:100%; transform-origin:left center; transform:scaleX(0);
    background:var(--hud-muted); }
  .sf-tri.best .sf-tri__k { color:var(--hud-cyan); opacity:1; }
  .sf-tri.best .sf-tri__fill { background:var(--hud-cyan); }
  /* Weak-point reveal line (BP-02) — appears after a scan pulse resolves the target's soft spot. */
  .sf-target__identity { margin-top:3px; font-size:var(--k-fs-data); color:var(--hud-muted);
    opacity:.88; }
  .sf-target__weak { margin-top:4px; font-size:var(--k-fs-data); color:var(--hud-amber); }

  /* ===== objective tracker — chromeless lines, relocated into the bottom-left column (§3) ===== */
  .sf-objectives { position:relative; display:flex; flex-direction:column; gap:6px; align-items:flex-start; max-width:300px;
    contain:layout paint style; }
  .sf-obj { display:flex; align-items:center; gap:7px; font-family:var(--hud-data); font-size:var(--k-fs-data); color:var(--hud-paper); padding:2px 6px; }
  .sf-obj__dot { width:6px; height:6px; transform:rotate(45deg); background:var(--hud-cyan); flex:0 0 auto; }
  .sf-obj__t { white-space:nowrap; overflow:hidden; text-overflow:ellipsis; }

  /* One spatial goal marker: an amber diamond on the world target, a directional chevron when it
     leaves the camera. The attached plate repeats the same GOAL identity as the tracker/radar and
     goes compact when the projected target passes behind a persistent HUD anchor. */
  .sf-objarrow { position:absolute; left:0; top:0; width:16px; height:16px; z-index:11;
    pointer-events:none; will-change:transform; }
  .sf-objarrow__glyph { position:absolute; left:50%; top:50%; display:block; }
  .sf-objarrow--onscreen .sf-objarrow__glyph { width:14px; height:14px;
    transform:translate(-50%,-50%) rotate(45deg); border:2px solid var(--hud-paper);
    background:var(--hud-amber); }
  .sf-objarrow--edge .sf-objarrow__glyph { width:0; height:0;
    transform:translate(-50%,-50%) rotate(var(--sf-arrow-angle, 0rad));
    border-style:solid; border-width:7px 0 7px 12px;
    border-color:transparent transparent transparent var(--hud-amber); }
  .sf-objarrow__label { position:absolute; max-width:280px; padding:4px 7px;
    overflow:hidden; text-overflow:ellipsis; white-space:nowrap; border-left:1px solid var(--k-hair);
    color:var(--hud-paper); font-size:var(--k-fs-data); font-weight:700;
    line-height:1.35; }
  .sf-objarrow[data-edge="left"] .sf-objarrow__label { left:20px; top:50%; transform:translateY(-50%); }
  .sf-objarrow[data-edge="right"] .sf-objarrow__label { right:20px; top:50%; transform:translateY(-50%); }
  .sf-objarrow[data-edge="top"] .sf-objarrow__label { left:50%; top:20px; transform:translateX(-50%); }
  .sf-objarrow[data-edge="bottom"] .sf-objarrow__label { left:50%; bottom:20px; transform:translateX(-50%); }
  .sf-objarrow--compact .sf-objarrow__label { display:none; }

  /* ===== receipts (HUD layer; not website cards) ===== */
  #hud #toasts, #toasts.sf-receipts { z-index:11; pointer-events:none; }
  .sf-toast { display:flex; align-items:center; gap:6px; width:100%; max-width:360px; padding:2px 0;
    background:none; border:none; color:var(--hud-paper, var(--ink)); font-size:var(--k-fs-data);
    pointer-events:auto; cursor:pointer; transform:none; opacity:0; transition:opacity .16s ease; }
  body.ui-modal-open .sf-toast { pointer-events:none; cursor:default; }
  .sf-toast--in { transform:none; opacity:1; }
  .sf-toast--out { transform:none; opacity:0; }
  .sf-toast__icon { display:flex; align-items:center; font-family:var(--hud-data); font-size:var(--k-fs-data); color:var(--hud-cyan); }
  /* Shared inline-SVG glyphs (src/ui/glyphs.js): sit on the text baseline like the marks they
     replaced and never stretch inside flex rows. */
  svg.sf-glyph { display:inline-block; vertical-align:-0.15em; flex:none; }
  .sf-toast--success, .sf-toast--good { border-left-color:var(--hud-cyan); }
  .sf-toast--success .sf-toast__icon, .sf-toast--good .sf-toast__icon { color:var(--hud-cyan); }
  .sf-toast--error, .sf-toast--danger { border-left-color:var(--k-red); }
  .sf-toast--error .sf-toast__icon, .sf-toast--danger .sf-toast__icon { color:var(--k-red); }
  .sf-toast--warn { border-left-color:var(--hud-amber); }
  .sf-toast--warn .sf-toast__icon { color:var(--hud-amber); }
  .sf-toast--credits .sf-toast__icon, .sf-toast--rep .sf-toast__icon { color:var(--hud-cyan); }
  /* GF-10: count badge for grouped identical toasts ("Platinum x1 ×5"). Sits after the text,
     monospace + accent-colored so it reads as a multiplier, not part of the message. */
  .sf-toast__count { font-family:var(--hud-data); font-size:var(--k-fs-data); color:var(--hud-cyan); margin-left:6px;
    padding:0; }

  /* ===== alerts ===== */
  .sf-alert { display:flex; align-items:center; gap:8px; padding:6px 16px;
    font-family:var(--hud-data); font-size:var(--k-fs-data); border:1px solid var(--k-hair); color:var(--hud-paper); }
  .sf-alert--info { color:var(--hud-cyan); border-color:var(--hud-cyan); }
  .sf-alert--warn { color:var(--hud-amber); border-color:var(--hud-amber); }
  .sf-alert--danger { color:var(--k-red); border-color:var(--k-red);
    animation:sf-alertpulse .8s ease-in-out infinite alternate; }
  /* One-voice floor: the arbiter-surfaced attention line always sits atop the persistent status
     pills (dock/gate/lock/low-vitals) in the top-center slot, regardless of DOM insertion order. */
  .sf-alert--floor { order:-1; }
  .sf-alert--dock { color:var(--hud-cyan); border-color:var(--hud-cyan); font-size:var(--k-fs-emph);
    padding:12px 28px; }
  @keyframes sf-alertpulse { from { transform:scale(1); }
    to { transform:scale(1.03); } }

  /* ===== combat HUD overlay (lock-on, weapon heat bars, target diamond) ===== */

  /* Lock-on progress arc — circular SVG indicator near reticle center */
  .sf-lockring { display:none; position:absolute; left:50%; top:50%; width:72px; height:72px;
    transform:translate(-50%,-50%) scale(1); transform-origin:50% 50%;
    pointer-events:none; z-index:14; opacity:0; will-change:transform;
    transition:opacity .15s ease; }
  .sf-lockring.active { display:block; opacity:1; }
  .sf-lockring.sf-lockring--latch { animation:sf-lockring-latch 160ms cubic-bezier(.2,.7,.2,1) 1; }
  .sf-lockring .sf-lockring__track { fill:none; stroke:var(--k-hair); stroke-width:2.5; }
  .sf-lockring .sf-lockring__fill { fill:none; stroke:var(--hud-cyan); stroke-width:3;
    stroke-linecap:round; transition:stroke .15s ease; }
  .sf-lockring.locked .sf-lockring__fill { stroke:var(--k-red); }
  .sf-lockring__label { position:absolute; left:50%; bottom:-2px; transform:translateX(-50%);
    font-family:var(--hud-data); font-size:var(--k-fs-data); color:var(--hud-cyan); white-space:nowrap; }
  .sf-lockring.locked .sf-lockring__label { color:var(--k-red); font-weight:700; }
  @keyframes sf-lockring-latch {
    0% { transform:translate(-50%,-50%) scale(1); }
    50% { transform:translate(-50%,-50%) scale(1.16); }
    100% { transform:translate(-50%,-50%) scale(1); }
  }

  /* Multi-stage convergence brackets inside lockRing */
  .sf-lockring__brackets { position:absolute; inset:0; pointer-events:none; will-change:transform; transition:transform .08s linear; }
  .sf-lockring__bracket { position:absolute; width:8px; height:8px; border-color:var(--hud-cyan); border-style:solid; opacity:.8; }
  .sf-lockring__bracket--tl { top:10px; left:10px; border-width:2px 0 0 2px; }
  .sf-lockring__bracket--tr { top:10px; right:10px; border-width:2px 2px 0 0; }
  .sf-lockring__bracket--br { bottom:10px; right:10px; border-width:0 2px 2px 0; }
  .sf-lockring__bracket--bl { bottom:10px; left:10px; border-width:0 0 2px 2px; }

  .sf-lockring[data-stage="acquiring"] .sf-lockring__track { stroke-dasharray:6 6; }
  .sf-lockring[data-stage="tracking"] .sf-lockring__fill { stroke:var(--hud-amber); }
  .sf-lockring[data-stage="tracking"] .sf-lockring__label { color:var(--hud-amber); }
  .sf-lockring[data-stage="tracking"] .sf-lockring__bracket { border-color:var(--hud-amber); opacity:1; }
  .sf-lockring[data-stage="locked"] .sf-lockring__fill { stroke:var(--k-red); }
  .sf-lockring[data-stage="locked"] .sf-lockring__label { color:var(--k-red); }
  .sf-lockring[data-stage="locked"] .sf-lockring__bracket { border-color:var(--k-red); opacity:1; border-width:2.5px; }

  /* Weapon heat bars — chromeless, anchored above the schematic (left:22px matches .sf-bars) */
  .sf-wpn-heats { position:absolute; left:22px;
    display:flex; flex-direction:column; gap:4px; pointer-events:none; }
  .sf-wpn-heat { display:flex; align-items:center; gap:6px; }
  .sf-wpn-heat__label { font-family:var(--hud-data); font-size:var(--k-fs-data);
    color:var(--hud-muted); width:46px; overflow:hidden; text-overflow:ellipsis; white-space:nowrap; }
  .sf-wpn-heat__bar { position:relative; width:110px; height:2px;
    background:var(--k-hair); overflow:visible; }
  .sf-wpn-heat__fill { position:absolute; inset:0; transform-origin:left center;
    background:var(--k-red); transition:transform .08s linear; }
  .sf-wpn-heat.overheated .sf-wpn-heat__fill { background:var(--k-red); }
  .sf-wpn-heat.overheated { animation:sf-wpnpulse .5s ease-in-out infinite alternate; }
  @keyframes sf-wpnpulse { from { opacity:.7; } to { opacity:1; } }
  /* Forced vent: every weapon bar goes hot-red and pulses while the 2 s lockout runs. */
  .sf-wpn-heats.venting .sf-wpn-heat__fill { background:var(--k-red); }
  .sf-wpn-heats.venting .sf-wpn-heat__label { color:var(--k-red); }
  .sf-wpn-heats.venting { animation:sf-wpnpulse .4s ease-in-out infinite alternate; }

  /* Target lock diamond — world-space overlay on locked/selected enemy.
     Outer div is the invisible positioning anchor (translate -50% centers on target).
     Inner div is the visible rotated diamond with pulsing glow. */
  .sf-lockdiamond { display:none; position:absolute; left:0; top:0; width:32px; height:32px; pointer-events:none; z-index:13;
    opacity:0; transition:opacity .12s ease; will-change:transform;
    --dia-glow:57,208,255; }
  .sf-lockdiamond.visible { display:block; opacity:1; }
  .sf-lockdiamond.locked-tgt { --dia-glow:255,84,112; }
  .sf-lockdiamond__inner { position:absolute; inset:2px;
    transform:rotate(45deg); will-change:transform;
    border:2px solid var(--hud-cyan);
    animation:sf-diamondpulse 1s ease-in-out infinite alternate; }
  @keyframes sf-diamondpulse {
    from { transform:rotate(45deg) scale(.92); }
    to { transform:rotate(45deg) scale(1.04); } }
  .sf-lockdiamond[data-stage="tracking"] .sf-lockdiamond__inner { border-color:var(--hud-amber); }
  .sf-lockdiamond[data-stage="locked"] .sf-lockdiamond__inner { border-color:var(--k-red); border-width:3px; animation:none; }
  .sf-lockdiamond[data-shape="bracket-hostile"] .sf-lockdiamond__inner {
    border-radius:0; animation:none;
    clip-path:polygon(50% 0, 100% 100%, 0 100%); }
  .sf-lockdiamond[data-shape="bracket-friendly"] .sf-lockdiamond__inner {
    border-radius:0; clip-path:none; }
  .sf-lockdiamond[data-shape="bracket-cargo"] .sf-lockdiamond__inner {
    border-radius:50%; clip-path:none; animation:none; }

  /* G-LOC tunnel vision vignette — sleeps out of the compositor tree until the first
     fade-in; hud.js drives display block/none so opacity:0 never holds a live layer. */
  .sf-gloc-vignette { display:none; position:absolute; inset:0; pointer-events:none; z-index:9; opacity:0;
    background:radial-gradient(ellipse at center, transparent 45%, rgba(0,5,12,.4) 72%, rgba(0,2,8,.85) 92%, rgba(0,0,0,.98) 100%);
    transition:opacity .12s linear; will-change:opacity; }

  /* Electronic disruption glitch & scanlines */
  #hud.sf-hud--glitch { animation:sf-hud-jitter 180ms steps(6, end) 1; }
  #hud.sf-hud--glitch .sf-caption,
  #hud.sf-hud--glitch .sf-nav-label,
  #hud.sf-hud--glitch .sf-lockring__label,
  #hud.sf-hud--glitch .sf-mt-obj { text-shadow:-2px 0 0 #ff0040, 2px 0 0 #00ffff !important; }
  @keyframes sf-hud-jitter {
    0% { transform:translate3d(0,0,0); }
    20% { transform:translate3d(-3px,1px,0); }
    40% { transform:translate3d(4px,-1px,0); }
    60% { transform:translate3d(-2px,2px,0); }
    80% { transform:translate3d(2px,-1px,0); }
    100% { transform:translate3d(0,0,0); }
  }
  .sf-hud-glitch-overlay { display:none; position:absolute; inset:0; pointer-events:none; z-index:25; opacity:0;
    background:repeating-linear-gradient(to bottom, transparent 0px, transparent 2px, rgba(0,255,255,.12) 3px, rgba(255,0,64,.12) 4px);
    mix-blend-mode:screen; }
  .sf-hud-glitch-overlay.active { display:block; opacity:.85; }

  /* Gravity Mark — a persistent world-space contracting well read, independent of selection. */
  .sf-gravity-mark { display:none; position:absolute; left:0; top:0; width:46px; height:46px;
    pointer-events:none; z-index:12; opacity:0; transition:opacity .12s ease; will-change:transform; }
  .sf-gravity-mark.visible { display:block; opacity:1; }
  .sf-gravity-mark__ring { position:absolute; inset:3px; border:2px solid var(--hud-paper);
    border-radius:50%;
    animation:sf-gravity-mark-contract .9s cubic-bezier(.4,0,.2,1) infinite; }
  .sf-gravity-mark__core { position:absolute; left:50%; top:50%; width:6px; height:6px;
    transform:translate(-50%,-50%) rotate(45deg); background:var(--hud-paper); }
  .sf-gravity-mark__label { position:absolute; left:50%; top:48px; transform:translateX(-50%);
    color:var(--hud-paper); font-size:var(--k-fs-data); white-space:nowrap; }
  @keyframes sf-gravity-mark-contract {
    from { transform:scale(1.18); opacity:.48; }
    to { transform:scale(.78); opacity:1; }
  }

  /* Momentum Sink — static opposing brackets name the player's moving reference frame. */
  .sf-momentum-sink { display:none; position:absolute; left:0; top:0; width:58px; height:58px;
    pointer-events:none; z-index:12; opacity:0; transition:opacity .12s ease; will-change:transform; }
  .sf-momentum-sink.visible { display:block; opacity:1; }
  .sf-momentum-sink__bracket { position:absolute; inset:5px; border-left:1px solid var(--k-hair);
    border-right:3px solid var(--hud-amber); }
  .sf-momentum-sink__bracket::before, .sf-momentum-sink__bracket::after {
    content:''; position:absolute; left:7px; right:7px; height:2px; background:var(--hud-amber); }
  .sf-momentum-sink__bracket::before { top:7px; }
  .sf-momentum-sink__bracket::after { bottom:7px; }
  .sf-momentum-sink__axis { position:absolute; left:16px; right:16px; top:50%; height:1px;
    background:var(--hud-amber); }
  .sf-momentum-sink__axis::before, .sf-momentum-sink__axis::after { content:''; position:absolute; top:-3px;
    width:7px; height:7px; border-top:1px solid var(--hud-amber); }
  .sf-momentum-sink__axis::before { left:0; border-left:1px solid var(--hud-amber); transform:rotate(-45deg); }
  .sf-momentum-sink__axis::after { right:0; border-right:1px solid var(--hud-amber); transform:rotate(45deg); }
  .sf-momentum-sink__label { position:absolute; left:50%; top:60px; transform:translateX(-50%);
    color:var(--hud-amber); font-size:var(--k-fs-data); white-space:nowrap; }

  /* Lead pip (BP-02 combat ceiling) — world-space marker showing where to aim so a shot fired NOW
     intercepts the moving target. A hollow reticle-ring the player walks their crosshair onto. Tints
     amber→green as the crosshair converges (solved via the SAME lead solver the guns use). */
  .sf-leadpip { display:none; position:absolute; left:0; top:0; width:22px; height:22px; pointer-events:none; z-index:13;
    opacity:0; transition:opacity .1s ease; will-change:transform;
    --pip-glow:255,196,84; }
  .sf-leadpip.visible { display:block; opacity:.92; }
  .sf-leadpip.on-solution { --pip-glow:120,240,150; }
  .sf-leadpip__svg { width:100%; height:100%; overflow:visible; }
  .sf-leadpip__full, .sf-leadpip__arc {
    fill:none; stroke:var(--hud-cyan); stroke-width:1.6; vector-effect:non-scaling-stroke; }
  .sf-leadpip__arc { stroke-linecap:round; }
  .sf-leadpip.on-solution .sf-leadpip__full { opacity:1; }
  .sf-leadpip.on-solution .sf-leadpip__arc { opacity:0; }
  .sf-leadpip:not(.on-solution) .sf-leadpip__full { opacity:0; }
  .sf-leadpip:not(.on-solution) .sf-leadpip__arc { opacity:1; }
  .sf-leadpip__tick { stroke:var(--hud-cyan); stroke-width:1.5; stroke-linecap:round; }

  .sf-threat-halo { display:none; position:absolute; inset:0; pointer-events:none; z-index:13; }
  .sf-threat-halo__slot { display:none; position:absolute; left:0; top:0; opacity:.55; }
  .sf-threat-halo__slot--arc .sf-threat-halo__arc {
    width:54px; height:18px; box-sizing:border-box;
    border:2px solid var(--k-red);
  }
  .sf-threat-halo__slot--arc[data-edge="top"] .sf-threat-halo__arc {
    border-bottom:none;
  }
  .sf-threat-halo__slot--arc[data-edge="bottom"] .sf-threat-halo__arc {
    border-top:none;
  }
  .sf-threat-halo__slot--arc[data-edge="left"] .sf-threat-halo__arc {
    width:18px; height:54px; border-right:none;
  }
  .sf-threat-halo__slot--arc[data-edge="right"] .sf-threat-halo__arc {
    width:18px; height:54px; border-left:none;
  }
  .sf-threat-halo__slot--missile .sf-threat-halo__chev {
    width:22px; height:22px; display:block; color:var(--k-signal, #e6b478);
    filter:drop-shadow(0 0 6px color-mix(in srgb, var(--k-signal, #e6b478) 80%, transparent));
  }
  .sf-threat-halo__slot--missile .sf-threat-halo__chev path {
    fill:none; stroke:currentColor; stroke-width:2.2; stroke-linecap:round; stroke-linejoin:round;
  }
  .sf-threat-halo__slot--missile[data-edge="right"] .sf-threat-halo__chev { transform:rotate(90deg); }
  .sf-threat-halo__slot--missile[data-edge="bottom"] .sf-threat-halo__chev { transform:rotate(180deg); }
  .sf-threat-halo__slot--missile[data-edge="left"] .sf-threat-halo__chev { transform:rotate(-90deg); }
  .sf-threat-halo__slot--missile {
    animation: sf-threat-halo-telegraph 0.5s steps(2, end) infinite;
  }
  /* Off-screen hostile boosting straight at the player: amber edge pulse + inward chevron,
     same language as the torpedo glyph so the read is "something incoming from this edge". */
  .sf-threat-halo__slot--arc .sf-threat-halo__chev {
    display:none; position:absolute; left:50%; top:50%;
    width:18px; height:18px; margin:-9px 0 0 -9px;
    color:var(--k-signal, #e6b478);
  }
  .sf-threat-halo__slot--arc .sf-threat-halo__chev path {
    fill:none; stroke:currentColor; stroke-width:2.2; stroke-linecap:round; stroke-linejoin:round;
  }
  .sf-threat-halo__slot--arc[data-closing="boost"] {
    animation: sf-threat-halo-telegraph 0.5s steps(2, end) infinite;
  }
  .sf-threat-halo__slot--arc[data-closing="boost"] .sf-threat-halo__arc {
    border-color: var(--k-signal, #e6b478);
    box-shadow: 0 0 10px color-mix(in srgb, var(--k-signal, #e6b478) 70%, transparent);
  }
  .sf-threat-halo__slot--arc[data-closing="boost"] .sf-threat-halo__chev { display:block; }
  .sf-threat-halo__slot--arc[data-edge="top"] .sf-threat-halo__chev { transform:translateY(13px); }
  .sf-threat-halo__slot--arc[data-edge="right"] .sf-threat-halo__chev { transform:rotate(90deg) translateY(13px); }
  .sf-threat-halo__slot--arc[data-edge="bottom"] .sf-threat-halo__chev { transform:rotate(180deg) translateY(13px); }
  .sf-threat-halo__slot--arc[data-edge="left"] .sf-threat-halo__chev { transform:rotate(-90deg) translateY(13px); }
  .sf-threat-halo__slot--telegraph .sf-threat-halo__arc {
    border-color: var(--k-gold, #e6b478);
    box-shadow: 0 0 10px color-mix(in srgb, var(--k-gold, #e6b478) 70%, transparent);
  }
  .sf-threat-halo__slot--telegraph[data-telegraph-kind="weapon_charge"] .sf-threat-halo__arc {
    border-color: var(--k-signal, #e6b478);
  }
  .sf-threat-halo__slot--telegraph[data-telegraph-kind="attach_spool"] .sf-threat-halo__arc {
    border-color: var(--k-good, #a5d2b0);
  }
  .sf-threat-halo__slot--telegraph[data-telegraph-kind="wake_mines"] .sf-threat-halo__arc {
    border-color: var(--k-red, #ff9a89);
  }
  .sf-threat-halo__slot--telegraph {
    animation: sf-threat-halo-telegraph 0.5s steps(2, end) infinite;
  }
  @keyframes sf-threat-halo-telegraph {
    0%, 100% { filter: brightness(1.15); }
    50% { filter: brightness(1.55); }
  }
  @media (prefers-reduced-motion: reduce) {
    .sf-threat-halo__slot--telegraph { animation: none; filter: brightness(1.35); }
  }
  html.sf-reduce-flash .sf-threat-halo__slot--missile,
  html.sf-reduce-flash .sf-threat-halo__slot--arc[data-closing="boost"],
  html.sf-reduce-flash .sf-threat-halo__slot--telegraph { animation:none; }

  /* Feature 20: first-discovery glass plate — slides out of the right HUD edge, holds 3 s,
     then tucks back. A moment surface, not a receipt line; the codex record is already durable. */
  .sf-discovery-plate {
    position:absolute; right:0; top:20%; z-index:14; pointer-events:none;
    min-width:230px; max-width:320px;
    transform:translateX(104%); opacity:0;
    transition:transform .45s cubic-bezier(.2,.9,.25,1), opacity .3s ease;
  }
  .sf-discovery-plate--in { transform:translateX(-14px); opacity:1; }
  .sf-discovery-plate--out { transform:translateX(104%); opacity:0; }
  .sf-discovery-plate__frame {
    padding:9px 16px 10px 14px;
    background:linear-gradient(180deg, rgba(10,18,28,.86), rgba(6,10,16,.9));
    border:1px solid var(--k-hair, rgba(160,210,255,.28)); border-right:none;
    border-left:3px solid var(--hud-cyan);
    box-shadow:0 4px 18px rgba(0,0,0,.5), inset 0 0 24px rgba(57,208,255,.06);
  }
  .sf-discovery-plate__kicker {
    font-family:var(--hud-data); font-size:var(--k-fs-data);
    letter-spacing:.14em; color:var(--hud-cyan);
  }
  .sf-discovery-plate__title {
    font-family:var(--hud-data); font-size:var(--k-fs-emph, 15px); font-weight:700;
    color:var(--hud-paper); margin-top:2px;
  }
  .sf-discovery-plate__meta {
    font-family:var(--hud-data); font-size:var(--k-fs-data); color:var(--hud-muted);
    margin-top:2px; letter-spacing:.04em;
  }
  @media (forced-colors: active) {
    .sf-discovery-plate__frame { border-color:CanvasText; border-left-color:CanvasText; }
    .sf-discovery-plate__kicker { color:CanvasText; }
  }
  @media (forced-colors: active) {
    .sf-leadpip__svg { filter:none; }
    .sf-leadpip__full, .sf-leadpip__arc, .sf-leadpip__tick { stroke:CanvasText; }
    .sf-threat-halo__slot--arc .sf-threat-halo__arc {
      border-color:CanvasText; forced-color-adjust:none;
    }
    .sf-threat-halo__slot--missile .sf-threat-halo__chev path,
    .sf-threat-halo__slot--arc .sf-threat-halo__chev path {
      stroke:CanvasText; forced-color-adjust:none;
    }
  }

  /* Capacitor readout near weapon area */
  .sf-cap-readout { position:absolute; left:18px; bottom:18px; pointer-events:none;
    font-family:var(--hud-data); font-size:var(--k-fs-data); color:var(--hud-muted); }

  @media (max-width: 760px), (max-height: 620px) {
    #pilot-portrait { width:54px; height:54px; top:10px; right:10px; }
    #toasts { left:calc(12px + var(--sf-safe-inset-x, 0px)); right:calc(12px + var(--sf-safe-inset-x, 0px)); width:auto; transform:none; }
    .sf-toast { width:auto; max-width:none; font-size:var(--k-fs-data); padding:8px 10px; }
    #alerts { left:calc(10px + var(--sf-safe-inset-x, 0px)); right:calc(10px + var(--sf-safe-inset-x, 0px)); top:84px; width:auto; }
    .sf-alert { max-width:100%; font-size:var(--k-fs-data); white-space:normal; text-align:center; justify-content:center; }

    #action-bar { display:none !important; }

    .sf-fuel { left:10px; top:10px; }
    .sf-fuel-label { font-size:var(--k-fs-data); }
    .sf-bar--fuel { width:64px; }
    .sf-fuel-num { width:28px; font-size:var(--k-fs-data); }
    .sf-nav-readout { max-width:calc(100vw - 24px); }
    .sf-nav-label { max-width:calc(100vw - 32px); overflow:hidden; text-overflow:ellipsis; white-space:nowrap; font-size:var(--k-fs-data); }
    /* The full "[ TARGET LOCK: ... ]" prefix overflows a narrow pane — shorten to brackets here. */
    .sf-nav--lock .sf-nav-label::before { content:'[ '; }
    .sf-nav-meta { font-size:var(--k-fs-data); }

    #sf-onboarding { left:12px !important; top:138px !important; width:min(316px, calc(100vw - 24px)) !important; }
    #sf-onboarding .sf-ob-card { padding:10px 11px; }
    #sf-onboarding .sf-ob-title { font-size:var(--k-fs-data); }
    #sf-onboarding .sf-ob-hint { font-size:var(--k-fs-data); line-height:1.4; }
    .sf-ob-intro { top:12% !important; width:min(520px, calc(100vw - 24px)) !important; padding:18px !important; }
    .sf-ob-intro h1 { font-size:var(--k-fs-emph); }
    .sf-ob-intro p { font-size:var(--k-fs-data); }

    .sf-leftstack { left:calc(8px + var(--sf-safe-inset-x, 0px)); bottom:96px; max-width:calc(100vw - 16px); }
    .sf-bars { gap:7px; }
    .sf-schematic { width:64px; height:64px; }
    .sf-sch-hull { font-size:var(--k-fs-data); }
    .sf-barrow { gap:5px; }
    .sf-barrow__label { width:34px; font-size:var(--k-fs-data); }
    .sf-barrow__num { width:26px; font-size:var(--k-fs-data); }
    .sf-bar { width:78px; }

    #hud { --sf-dock-w:150px; --sf-radar-size:132px; }
    .sf-rightdock { right:calc(8px + var(--sf-safe-inset-x, 0px)); bottom:96px; gap:5px; }
    .sf-target__name { font-size:var(--k-fs-data); }
    .sf-target__meta { font-size:var(--k-fs-data); }
    .sf-radar-wrap { gap:4px; }
    .sf-radar canvas { width:132px !important; height:132px !important; }
    .sf-radar-objective-key { font-size:var(--k-fs-data); line-height:1.25; }

    .sf-cluster { left:50%; right:auto; width:min(420px, calc(100vw - 16px)); bottom:8px;
      transform:translateX(-50%); display:flex; flex-wrap:wrap;
      justify-content:center; gap:4px 14px; }
    .sf-stat__k { font-size:var(--k-fs-data); }
    .sf-stat__v { font-size:var(--k-fs-data); white-space:nowrap; overflow:hidden; text-overflow:ellipsis; max-width:46vw; }
    #sf-rolestat { display:none; }
    .sf-tip { display:none !important; }

    .sf-lockring { width:56px; height:56px; }
    .sf-wpn-heats { left:8px; }
    .sf-wpn-heat__bar { width:80px; }
    .sf-wpn-heat__label { width:34px; font-size:var(--k-fs-data); }
    .sf-lockdiamond { width:24px; height:24px; }
  }

  /* ===== cargo panel overlay ===== */
  .sf-cargo-panel { position:absolute; left:50%; bottom:120px; transform:translateX(-50%);
    width:380px; max-height:60vh; display:none; flex-direction:column; border:1px solid var(--hud-cyan);
    z-index:200; pointer-events:auto; font-family:var(--hud-data); overflow:hidden; }
  .sf-cargo-panel.open { display:flex; }
  .sf-cargo-panel__head { display:flex; align-items:center; justify-content:space-between;
    padding:10px 14px; border-bottom:1px solid var(--k-hair); }
  .sf-cargo-panel__title { font-size:var(--k-fs-data); color:var(--hud-cyan); }
  .sf-cargo-panel__close { background:none; border:1px solid var(--k-bone-38);
    color:var(--hud-muted); font-size:var(--k-fs-data); padding:2px 8px; cursor:pointer; font-family:var(--hud-data); }
  .sf-cargo-panel__close:hover { border-color:var(--hud-cyan); color:var(--hud-cyan); }
  .sf-cargo-panel__summary { display:flex; justify-content:space-between; padding:8px 14px;
    font-size:var(--k-fs-data); color:var(--hud-muted); border-bottom:1px solid var(--hud-cyan); }
  .sf-cargo-panel__list { overflow-y:auto; max-height:calc(60vh - 90px); padding:6px 0; }
  .sf-cargo-panel__list::-webkit-scrollbar { width:4px; }
  .sf-cargo-panel__list::-webkit-scrollbar-thumb { background:var(--k-hair); }
  .sf-cargo-row { display:grid; grid-template-columns:1fr 50px 50px 60px 56px; align-items:center;
    padding:5px 14px; font-size:var(--k-fs-data); color:var(--hud-paper); gap:4px; }
  .sf-cargo-row:hover { background:var(--k-hair); }
  .sf-cargo-row__name { overflow:hidden; text-overflow:ellipsis; white-space:nowrap; color:var(--hud-paper); }
  .sf-cargo-row__qty { text-align:right; color:var(--hud-cyan); }
  .sf-cargo-row__vol { text-align:right; color:var(--hud-muted); }
  .sf-cargo-row__val { text-align:right; color:var(--hud-muted); }
  .sf-cargo-row__jet { background:none; border:1px solid var(--k-red);
    color:var(--k-red); font-size:var(--k-fs-data); padding:1px 6px; cursor:pointer; font-family:var(--hud-data); opacity:0.7; }
  .sf-cargo-row__jet:hover { opacity:1; }
  .sf-cargo-row__jet:disabled { border-color:var(--k-hair); color:var(--k-bone-38);
    cursor:not-allowed; opacity:.75; background:var(--k-hair); }
  .sf-cargo-row__jet:disabled:hover { background:var(--k-hair); opacity:.75; }
  .sf-cargo-empty { padding:20px 14px; text-align:center; color:var(--k-bone-38); font-size:var(--k-fs-data); }
  @media (max-width: 760px) {
    .sf-cargo-panel { width:calc(100vw - 24px); bottom:110px; }
  }

  /* ===== HUD mission tracker — chromeless, with an edge marker; relocated into the bottom-left column ===== */
  .sf-mission-tracker { position:relative; width:320px; max-width:calc(100vw - 32px);
    padding:10px 12px; border-left:1px solid var(--k-hair); pointer-events:none; contain:layout paint style; }
  .sf-mt-title { font-family:var(--hud-data); font-size:var(--k-fs-data); color:var(--hud-amber);
    margin-bottom:3px; white-space:nowrap; overflow:hidden; text-overflow:ellipsis; }
  .sf-mt-obj { font-family:var(--hud-data); font-size:var(--k-fs-data); line-height:1.35; color:var(--hud-paper); margin-bottom:5px; }
  .sf-mt-time { font-family:var(--hud-data); font-size:var(--k-fs-data); color:var(--hud-amber); }
  .sf-mt-time.sf-mt-urgent { color:var(--hud-amber); }
  @media (max-width: 760px) {
    /* Sit below the fuel line + comms (≡) button + top-center SYS line so nothing overlaps. */
    .sf-mission-tracker { max-width:calc(100vw - 16px); }
    .sf-mt-title { font-size:var(--k-fs-data); }
    .sf-mt-obj { font-size:var(--k-fs-data); }
    .sf-mt-time { font-size:var(--k-fs-data); }
  }

  /* ===== Flight HUD finish pass =====
     A small number of joined instruments replaces the previous field of unrelated floating cards.
     Material follows the menu fascia (styles/menu.css): near-black hairline plates, letterspaced
     mono stamps, ONE signal cyan reserved for live/active marks, amber kept for the objective.
     Holographic-bleak rather than frosted-glass: crisp hairlines and flat dark surfaces with no
     always-on backdrop blur (compositor cost) — legibility comes from panel opacity, not frost. */
  #hud { --hud-display:var(--k-display); --hud-body:var(--k-text); --hud-data:var(--k-text);
    --hud-paper:var(--k-text-live); --hud-muted:var(--k-bone-62); --hud-line:var(--k-hair);
    --hud-cyan:var(--k-text-live); --hud-amber:var(--k-signal); --hud-radius:0;
    /* Aliases the encounter prompts (recovery / parley / signal) still read; nearest kit value. */
    --hud-copy:var(--k-bone-62); --hud-line-strong:var(--k-hair); --hud-danger:var(--k-red);
    --font-mono:var(--hud-data);
    font-family:var(--k-text); font-size:calc(var(--k-fs-data) * var(--ui-scale, 1)); color:var(--k-bone-62);
    font-variant-numeric:tabular-nums; }

  .sf-leftstack {
    left:calc(12px + var(--sf-safe-inset-x, 0px)); bottom:12px; width:272px; max-width:calc(100vw - 24px); gap:8px;
    align-items:stretch;
  }
  .sf-leftcontext {
    width:100%; max-width:none; gap:6px; align-items:stretch;
  }
  .sf-bars {
    width:272px; max-width:100%; display:grid;
    grid-template-columns:92px minmax(0, 1fr); grid-template-rows:auto repeat(4, 17px);
    gap:4px 10px; align-items:center; padding:4px 2px 2px;
    background:none; border:none; overflow:visible;
  }
  .sf-bars::before, .sf-bars::after { display:none; }
  .sf-condition-head {
    grid-column:1 / -1; min-height:0; display:flex; align-items:center; justify-content:flex-start;
    font-family:var(--hud-display); font-size:var(--k-fs-data); font-weight:700;
    color:var(--hud-muted); border:none; padding:0; margin:0;
  }
  .sf-condition-title-group {
    display:flex; align-items:center; gap:8px;
  }
  .sf-condition-state {
    font-family:var(--hud-data); font-size:var(--k-fs-data); font-weight:600; color:var(--hud-cyan);
    padding:0;
  }
  .sf-condition-critical .sf-condition-state {
    color:var(--k-red);
  }
  .sf-condition-shield-low .sf-condition-state {
    color:var(--hud-amber);
  }
  .sf-condition-metrics {
    display:flex; align-items:center; gap:7px; font-family:var(--hud-data); font-size:var(--k-fs-data);
  }
  .sf-cond-stat {
    color:var(--hud-muted);
  }
  .sf-cond-stat strong {
    color:var(--hud-paper); font-weight:700; margin-left:3px;
  }
  .sf-condition-critical .sf-cond-hull-val { color:var(--k-red); }
  .sf-condition-shield-low .sf-cond-shd-val { color:var(--hud-amber); }

  .sf-schematic {
    grid-column:1; grid-row:2 / span 4; width:88px; height:88px; align-self:center; justify-self:center;
    display:grid; place-items:center; isolation:isolate; position:relative;
  }
  .sf-schematic .sf-sch-ring { position:absolute; inset:2px; width:84px; height:84px; overflow:visible; z-index:1; }
  .sf-schematic .sf-sch-track { fill:var(--k-hair); stroke:var(--hud-cyan); stroke-width:1.6; }
  .sf-schematic .sf-sch-shield {
    fill:none; stroke:var(--hud-cyan); stroke-width:2.5; stroke-linecap:round; opacity:.92; transition:stroke-dashoffset .15s linear, stroke .2s ease;
  }
  .sf-schematic.sf-sch-shield-low .sf-sch-shield {
    stroke:var(--hud-amber);
  }
  .sf-sch-ship-wrap {
    position:relative; width:62px; height:74px; z-index:2; display:flex; align-items:center; justify-content:center;
  }
  .sf-sch-ship {
    width:62px; height:74px; object-fit:contain; pointer-events:none;
  }
  .sf-sch-ship--empty {
    position:absolute; inset:0; z-index:1;
    /* No grayscale/brightness crush: that filter existed to dim a full-colour raster. Applied to a
       vector outline it erases it. The outline is dimmed by its own stroke colour instead. */
    transition:filter .22s ease;
  }
  .sf-sch-ship-fill-crop {
    position:absolute; left:0; right:0; bottom:0; top:auto;
    height:var(--hull-pct, 100%);
    overflow:hidden; z-index:2;
    transition:height .15s ease-out;
  }
  .sf-sch-ship--fill {
    position:absolute; left:0; bottom:0; width:62px; height:74px; max-width:none;
    transition:filter .22s ease;
  }
  /* J07: the mark is a vector hull now, not a raster Scout. The empty layer is the outline you are
     losing; the fill layer is the hull you still have. Both are the SAME geometry, so the fill line
     reads as a waterline across one shape rather than a seam between two images. */
  /* Both layers must be the SAME box, bottom-anchored, or the waterline cuts across a shape that
     has shifted relative to the outline behind it. The old raster pair shared one aspect ratio by
     accident; the vector pair has to be told.
     .sf-schematic svg { height:100% ; } sits above this file at (0,1,1) and never applied to the old
     <img> marks. It applies to these, and it squashed the fill layer to the crop's height so the
     hull deformed as damage came off. Matching that specificity is the fix; measuring the rendered
     boxes in the running game is the only reason it was found. */
  .sf-schematic .sf-sch-ship--empty, .sf-schematic .sf-sch-ship--fill {
    position:absolute; left:0; bottom:0; top:auto; width:62px; height:74px; max-width:none;
  }
  /* The quarter turn. transform-box:view-box pins the origin to the 48x48 viewBox rather than the
     group's own bbox, so the maths is stable whatever hull is loaded: centre the 48x28 body in the
     square (translate 10 down), then rotate about the square's centre. Reading right to left, CSS
     applies the translate first. */
  .sf-schematic .sf-sch-hull {
    transform-box:view-box; transform-origin:24px 24px;
    transform:rotate(-90deg) translate(0px, 10px);
  }
  .sf-sch-ship--empty .sf-sch-hull { fill:none; stroke:var(--hud-muted, var(--hud-cyan)); stroke-width:1.1; }
  .sf-sch-ship--empty .sf-sch-hull .sx-shipmark__cut,
  .sf-sch-ship--empty .sf-sch-hull .sx-shipmark__battery { stroke-opacity:.45; }
  .sf-sch-ship--fill .sf-sch-hull {
    fill:color-mix(in srgb, var(--hud-cyan, var(--hud-cyan)) 22%, transparent);
    stroke:var(--hud-cyan, var(--hud-cyan)); stroke-width:1.2;
  }
  .sf-sch-ship--fill .sf-sch-hull .sx-shipmark__cut { fill:none; stroke-opacity:.7; }
  .sf-sch-ship--fill .sf-sch-hull .sx-shipmark__battery { fill:var(--hud-cyan, var(--hud-cyan)); stroke:none; }
  .sf-sch-ship--fill .sf-sch-hull .sx-shipmark__sensor { fill:var(--hud-paper, var(--hud-paper)); stroke:none; }
  /* Damage state is carried by the stroke colour of the hull you have left, not by a wash over the
     whole instrument -- the word CRITICAL is already printed alongside for forced-colors. */
  .sf-schematic.sf-sch-warning .sf-sch-ship--fill .sf-sch-hull {
    stroke:var(--hud-amber, var(--hud-amber)); fill:color-mix(in srgb, var(--hud-amber, var(--hud-amber)) 20%, transparent);
  }
  .sf-schematic.sf-sch-critical .sf-sch-ship--fill .sf-sch-hull {
    stroke:var(--k-red); fill:color-mix(in srgb, var(--k-red) 24%, transparent);
  }
  .sf-sch-fill-line {
    position:absolute; left:6%; right:6%; bottom:var(--hull-pct, 100%);
    height:2px; background:var(--hud-cyan);
    transform:translateY(50%); z-index:3;
    transition:bottom .15s ease-out, background-color .22s ease, box-shadow .22s ease;
    pointer-events:none;
  }
  .sf-schematic.sf-sch-critical .sf-sch-ship--fill {
    animation:sf-schpulse 0.8s ease-in-out infinite alternate;
  }
  .sf-schematic.sf-sch-critical .sf-sch-fill-line {
    background:var(--k-red);
  }
  .sf-schematic.sf-sch-warning .sf-sch-fill-line {
    background:var(--hud-amber);
  }
  .sf-schematic.sf-sch-hit .sf-sch-ship-wrap { animation:sf-schhit .34s ease-out; }
  .sf-barrow {
    grid-column:2; width:100%; display:grid; grid-template-columns:36px minmax(56px, 1fr) 30px;
    align-items:center; gap:7px; min-height:17px;
  }
  .sf-barrow__label {
    width:auto; font-family:var(--hud-display); font-size:var(--k-fs-data); font-weight:600;
    color:var(--hud-muted);
  }
  .sf-barrow__num {
    width:auto; font-family:var(--hud-data); font-size:var(--k-fs-data); font-weight:500; color:var(--hud-muted);
    font-variant-numeric:tabular-nums;
  }
  .sf-bar { width:100%; height:3px; background:var(--k-hair); overflow:hidden; }
  .sf-bars .sf-bar { overflow:visible; }  /* only ship-condition gauges let their glow escape */
  /* Vitals gauges join the global palette: one accent for energy, calm amber/red/green by meaning.
     The neon family's glows go too — flat 3px fills, same as the weapon-heat bar below. */
  .sf-bar--energy .sf-bar__fill { background:var(--hud-cyan, var(--hud-cyan)); }
  .sf-bar--boost .sf-bar__fill { background:var(--hud-amber, var(--hud-amber)); }
  .sf-bar--heat .sf-bar__fill { background:var(--hud-amber); }
  .sf-bar--fuel .sf-bar__fill { background:var(--hud-cyan); }
  .sf-wpn-heats {
    position:relative; left:auto; bottom:auto !important; grid-column:1 / -1; width:100%;
    flex-direction:column; gap:3px; padding-top:5px; border-top:1px solid var(--hud-cyan);
  }
  .sf-wpn-heat { display:grid; grid-template-columns:62px minmax(0, 1fr); gap:7px; align-items:center; }
  .sf-wpn-heat__label {
    width:auto; font-family:var(--hud-display); font-size:var(--k-fs-data); font-weight:600;
    color:var(--hud-muted);
  }
  .sf-wpn-heat__bar { width:100%; height:2px; background:var(--k-hair); overflow:hidden; }
  .sf-wpn-heat__fill { background:var(--hud-amber); }

  /* Slim instrument deck: speed/weapons + contextual chips. Permanent binding→action
     keycaps were removed — general keys live in Settings → Controls / Help. */
  .sf-command-deck {
    position:absolute; left:calc(50% + (var(--sf-safe-inset-x, 0px) * 0)); bottom:12px; transform:translateX(-50%); width:min(360px, calc(100vw - 640px));
    min-width:220px; padding:4px 8px 2px;
    background:none; border:none;
  }
  .sf-command-deck::after { display:none; }
  .sf-cluster {
    position:relative; left:auto; bottom:auto; transform:none; max-width:none; min-height:20px;
    display:flex; flex-wrap:wrap; justify-content:center; align-items:baseline; gap:10px 14px;
    margin:0; padding:0;
  }
  .sf-stat { font-family:var(--hud-data); gap:5px; }
  .sf-stat__k { font-family:var(--hud-display); font-size:var(--k-fs-data); font-weight:700; color:var(--hud-muted); }
  .sf-stat__v { font-size:var(--k-fs-data); color:var(--hud-paper); font-variant-numeric:tabular-nums; white-space:nowrap; }
  .sf-stat--speed .sf-stat__v { font-family:var(--hud-display); font-size:var(--k-fs-emph); font-weight:700; }
  /* Massline chips — only while latched; wrap instead of overflowing the deck. */
  .sf-tether-controls {
    display:flex; flex-wrap:wrap; justify-content:center; align-items:center; gap:6px 10px;
    margin:5px 0 0; padding:5px 2px 0; border-top:1px solid var(--hud-cyan);
    max-width:100%;
  }
  .sf-tether-controls[hidden] { display:none !important; }
  .sf-tchip {
    display:inline-flex; flex-wrap:wrap; align-items:center; gap:4px 6px;
    max-width:100%; color:var(--hud-muted);
  }
  .sf-tchip--wide { flex:1 1 100%; justify-content:center; }
  .sf-tchip__bind {
    min-width:22px; padding:2px 5px; text-align:center; font-family:var(--hud-data);
    font-size:var(--k-fs-data); font-weight:600; color:var(--hud-paper);
  }
  .sf-tchip__verb {
    font-family:var(--hud-display); font-size:var(--k-fs-data); font-weight:700;
    color:var(--hud-paper);
  }
  .sf-tchip__hint {
    font-family:var(--hud-data); font-size:var(--k-fs-data); font-weight:500; color:var(--hud-muted); line-height:1.3;
    white-space:normal; text-align:center;
  }

  /* J07 de-box: the left contextual column was three stacked opaque plates. Open telemetry with
     corner brackets and a per-glyph scrim reads at the same distance and spends a fraction of the
     ink budget (SCREENS_A §1.3). Content, hierarchy and padding are unchanged — only the plate. */
  .sf-mission-tracker, .sf-nav-readout, .sf-obj {
    width:100%; max-width:none; border:none;
    background:none;
  }
  .sf-mission-tracker, .sf-nav-readout { ${bracketCss('transparent')} }
  /* J07 comms ribbon: a quiet frequency tape at the head of the left contextual column, replacing
     two detached boxes floating in the top-left corner. The adopted nodes keep their own listeners;
     only their positioning is neutralised, because both were authored as position:absolute chrome
     and would otherwise still be pinned to the viewport corner inside their new parent. */
  .sf-commtape {
    display:flex; align-items:center; gap:9px; width:100%; padding:2px 0 4px;
    border-bottom:1px solid var(--hud-cyan);
  }
  .sf-commtape[hidden] { display:none !important; }
  .sf-commtape__band {
    font-family:var(--hud-display); font-size:var(--k-fs-data); font-weight:700;
    color:var(--hud-muted);
  }
  /* flex-basis 0: the host must share only the tape's free slack. With basis auto the headline's
     own width is the basis, and because BAND/COMMS/HAIL cannot shrink below min-content the host
     absorbed the whole deficit — a headline truncated to "TR…" beside 200px of empty tape. */
  .sf-commtape__news { min-width:0; flex:1 1 0; overflow:hidden; }
  .sf-news-ticker { overflow:hidden; text-overflow:ellipsis; white-space:nowrap;
    font-family:var(--hud-data); font-size:var(--k-fs-data); color:var(--hud-paper); }
  .sf-news-ticker__item--blockade, .sf-news-ticker__item--piracy { color:var(--hud-danger); }
  .sf-news-ticker__item--boom, .sf-news-ticker__item--freight_arrival { color:var(--hud-cyan); }
  .sf-commtape__slots { display:flex; align-items:center; gap:7px; pointer-events:auto; }
  .sf-commtape__tracehost { display:flex; align-items:center; }
  .sf-commtape .sf-fx-comms-trace {
    min-width:118px; padding-left:7px;
    border-inline-start:1px solid var(--hud-cyan);
    --sf-comms-amp:0;
    --sf-comms-density:0;
  }
  .sf-commtape .sf-fx-comms-trace__crest { color:var(--hud-cyan); }
  .sf-commtape .sf-fx-comms-trace__wave {
    font-family:var(--hud-data); font-size:var(--k-fs-data);
    color:var(--hud-cyan);
  }
  .sf-commtape .sf-comm-backlog-btn {
    position:static !important; left:auto !important; top:auto !important; z-index:auto !important;
    width:auto !important; height:auto !important; margin:0 !important;
  }
  /* #sf-contact-hail stays position:relative, not static: it is the containing block for its
     absolute popover panel (anchored at the button), and it needs a real z-index in #hud's
     stacking context. z:auto made the whole hail subtree one flat layer UNDER the adopted
     comms feed (z-index:1050) — the deck painted beneath live feed lines it should cover. */
  .sf-commtape #sf-contact-hail {
    position:relative !important; left:auto !important; top:auto !important; z-index:1055 !important;
    width:auto !important; height:auto !important; margin:0 !important;
  }
  .sf-commtape .sf-comm-backlog-btn {
    padding:2px 8px; background:none; border:none;
    font-family:var(--hud-display); font-size:var(--k-fs-data); font-weight:700;
    color:var(--hud-cyan); cursor:pointer;
  }
  .sf-commtape .sf-comm-backlog-btn:hover { color:var(--hud-paper); }
  .sf-commtape .sf-contact-hail__button {
    padding:2px 8px; background:none; border:none;
    font-family:var(--hud-display); font-size:var(--k-fs-data); font-weight:700;
    color:var(--hud-paper);
  }
  .sf-commtape .sf-contact-hail__button[disabled] { color:var(--hud-muted); }
  /* The hail panel is a popover off the button; keep it anchored to the tape, not the old corner.
     It must also paint ABOVE the adopted comms feed: #sf-comms carries z-index:1050 inside #hud's
     stacking context, which beats every z:auto popover — the deck opened under live feed lines. */
  .sf-commtape .sf-contact-hail__panel { left:0 !important; top:30px !important; z-index:1055; }
  /* The tracker used a 2px amber top border to say "this is the mission". De-boxed, that job goes
     to a single amber rule under the title — one stroke, still the loudest thing in the column. */
  .sf-mission-tracker { padding:8px 10px 9px; }
  .sf-mt-title { border-bottom:1px solid var(--hud-amber); padding-bottom:3px; }
  .sf-mt-title {
    font-family:var(--hud-display) !important; font-size:var(--k-fs-data); font-weight:700;
    color:var(--hud-amber); margin-bottom:4px;
  }
  .sf-mt-obj { font-family:var(--hud-data) !important; font-size:var(--k-fs-data); line-height:1.35; font-weight:500; color:var(--hud-paper); margin-bottom:4px; }
  .sf-mt-time { font-family:var(--hud-data) !important; font-size:var(--k-fs-data); color:var(--hud-amber); }
  .sf-nav-readout { padding:6px 10px; }
  .sf-nav-label { font-family:var(--hud-display); font-size:var(--k-fs-data); font-weight:700; color:var(--hud-cyan); }
  .sf-nav-meta { font-family:var(--hud-data); font-size:var(--k-fs-data); color:var(--hud-muted); }

  /* ===== J07 · Ink on Vacuum — the right dock is ONE column, not three widths =====
     Every surface in the dock is width:100% against a single owner (--sf-dock-w). Before J07
     the roster and target card were hard-coded 232px while the radar was 180px and right-aligned,
     which is what read on screen as a staggered overhang; and .sf-target__bars was a fixed 220px
     inside a 212px content box, so it overhung the card by 9px at every viewport. One number now
     decides the column, and --sf-radar-size is pinned to radar.js COMPACT_SIZE by
     test/j07-hud-contract.test.mjs so the canvas can never drift from its dial again. */
  #hud {
    --sf-dock-w:220px;
    --sf-radar-size:220px;
    --sf-brk-col:var(--hud-cyan);
  }
  .sf-rightdock { right:calc(12px + var(--sf-safe-inset-x, 0px)); bottom:12px; width:var(--sf-dock-w); align-items:stretch; gap:9px; }
  .sf-rightdock > * { flex:0 0 auto; width:100%; }
  /* Back on the standard plate: chromeless brackets lost the row text to the render — a lit gas
     giant or an asteroid trail passes straight through the roster. The dock's material is the
     HUD's own translucent plate, same as the law card above it. */
  .sf-overview {
    width:100%; gap:0; padding:3px 0;
    border:1px solid var(--hud-line);
    font-family:var(--hud-data); font-size:var(--k-fs-data); overflow:hidden;
  }
  /* Roster identity is the rows / collapsed count, not a leftover instrument title. */
  .sf-overview::before { content:none; display:none; }
  .sf-overview-row {
    min-height:26px; padding:3px 8px; background:transparent; border-left:0; border-bottom:1px solid var(--hud-cyan);
  }
  .sf-overview-row:hover { background:var(--k-hair); border-left:0; }
  .sf-overview-row.selected {
    border-left:0;
  }
  .sf-overview-row__name { max-width:92px; color:var(--hud-paper); }
  .sf-overview-row__right { color:var(--hud-muted); }
  .sf-overview-row__detail { color:var(--hud-muted); padding-left:14px; }
  .sf-overview-footer { background:transparent; color:var(--hud-muted); }
  .sf-target {
    width:100%; padding:8px 10px 9px; text-align:left; gap:5px;
    background:none; border:none; border-radius:0; box-shadow:none !important;
    ${bracketCss('transparent')}
  }
  /* The card's identity was a 2px red top border on an opaque plate. De-boxed, that identity moves
     to the threat badge (targetPanel.js) — a shape, not a plate edge. */
  /* The roster sits on a plate now, so it drops the per-glyph ink scrim: the 7px black blur was
     what smeared the 12px ellipsis dots into a fake underscore ('Relief-Freigh_'). The target
     card is still chromeless and keeps it. */
  /* Muted grey was a legible "secondary" against an opaque plate. Against the actual render — a
     lit gas giant fills this corner in the reference sector — it disappears. Captured, not
     assumed: the range readout was unreadable over the planet limb at 1440x900. De-boxing raises
     the floor for every muted token in the dock. */
  .sf-overview-row__right, .sf-overview-row__detail,
  .sf-overview-row__state, .sf-overview-row__tier, .sf-overview-footer,
  .sf-target__meta { color:var(--hud-paper); }
  .sf-overview-row__name, .sf-target__name { color:var(--hud-paper); }
  .sf-target__head, .sf-target__meta { justify-content:space-between; }
  /* J07 threat badge: the card's identity used to be a 2px red plate edge, which said "target" but
     never said "how bad". Tier is carried by the WORD and by the pip count, with colour third, so it
     survives forced-colors and colour-blind play unchanged. */
  .sf-target__threat { display:flex; align-items:center; gap:7px; padding:2px 0 3px; }
  .sf-target__threat[hidden] { display:none !important; }
  .sf-target__threat-pips { font-family:var(--hud-data); font-size:var(--k-fs-data); color:var(--hud-muted); }
  .sf-target__threat-word {
    font-family:var(--hud-display); font-size:var(--k-fs-data); font-weight:700;
    color:var(--hud-paper);
  }
  .sf-target__threat[data-tier]::before {
    content:''; width:3px; align-self:stretch; background:var(--hud-muted);
  }
  /* Tiers are the NUMBERS scanner.js emits (1/2/3), not adjectives. Selecting on words here would
     have matched nothing while looking entirely correct -- pinned by check:hud-j07. */
  .sf-target__threat[data-tier="3"]::before { background:var(--k-red); }
  .sf-target__threat[data-tier="3"] .sf-target__threat-pips { color:var(--k-red); }
  .sf-target__threat[data-tier="2"]::before { background:var(--hud-amber, var(--hud-amber)); }
  .sf-target__threat[data-tier="2"] .sf-target__threat-pips { color:var(--hud-amber, var(--hud-amber)); }
  /* Range as a length. The numeral stays for precision; the bar is what you read at a glance. */
  .sf-target__rangerow { display:flex; align-items:center; gap:8px; }
  .sf-target__rangebar { position:relative; flex:1; height:3px; background:var(--k-hair); overflow:hidden; }
  .sf-target__rangefill {
    display:block; height:100%; width:100%; transform-origin:left center; transform:scaleX(0);
    background:var(--hud-cyan, var(--hud-cyan));
  }
  .sf-target__dist { font-family:var(--hud-data); font-size:var(--k-fs-data); color:var(--hud-paper); }

  /* ===== J07 type floor: nothing on the flight layer below 12px (SCREENS_A 14.2) =====
     The layer was carrying ~100 elements under the floor, bottoming out at 7.5px -- small enough
     that the Power Rail's own slot names were unreadable at arm's length on the very surface whose
     job is to say "here is what you can do". The rule is TYPE NEVER SHRINKS; content is dropped
     instead, so nothing here reflows by making labels smaller.
     Declared last so it beats the three earlier cascade layers that set these sizes, and scoped to
     #hud so station screens (which have their own density budget) are untouched. */
  #hud .sf-barrow__label, #hud .sf-barrow__num,
  #hud .sf-prail__label, #hud .sf-pslot__name, #hud .sf-pslot__key,
  #hud .sf-condition-metrics, #hud .sf-cond-stat, #hud .sf-cond-hull-val, #hud .sf-cond-shd-val,
  #hud .sf-stat__k, #hud .sf-radar-objective-key,
  #hud .sf-comm__tag, #hud .sf-comm__sender,
  #hud .sf-ob-kicker, #hud .sf-ob-count,
  #hud .sf-law__head, #hud .sf-law__meta, #hud .sf-law__jurisdiction,
  #hud .sf-target__meta, #hud .sf-target__range, #hud .sf-target__closing,
  #hud .sf-overview, #hud .sf-overview-row,
  #hud .sf-overview-row__left, #hud .sf-overview-row__name, #hud .sf-overview-row__right,
  #hud .sf-overview-row__state, #hud .sf-overview-row__tier, #hud .sf-overview-row__detail,
  #hud .sf-overview-footer,
  #hud .sf-mt-title, #hud .sf-mt-time, #hud .sf-nav-label, #hud .sf-nav-meta,
  #hud .sf-tri__k, #hud .sf-tchip__hint, #hud .sf-wpn-heat__name {
    font-size:var(--k-fs-data);
  }
  /* The label columns were sized for 7.5-8.5px glyphs and clip at 12px. Widen them to fit the type
     rather than shrink the type to fit them -- measured at 1440x900 and 1280x720. */
  #hud .sf-barrow__label { width:52px; }
  #hud .sf-barrow__num { width:46px; }
  #hud .sf-overview-row__name { max-width:104px; }
  /* Second pass, from a re-measure: these six survived because they are set in their own modules'
     stylesheets rather than in this file. Measuring the rendered layer is the only way to find
     them -- reading any single stylesheet would have declared the job done at the first pass. */
  #hud .sf-ob-kicker, #hud .sf-band-hud__button, #hud .ml2-preview,
  #hud .sf-law__detail, #hud .sf-condition-head { font-size:var(--k-fs-data); }

  /* Raising the type is only half the rule. SCREENS_A: TYPE NEVER SHRINKS, CONTENT IS DROPPED --
     so where 12px no longer fits, the CONTENT gives way. Captured at 1440x900: without these three
     the rail labels ran into each other ("ORDNANCE ORDNANCE ORDNANCE"), the law receipt's headline
     wrapped into the band pill, and the target card's range numeral collided with its band word. */
  #hud .sf-pslot__name {
    /* Slot names are authored to fit now (longest:"Repel"); the old max-width+ellipsis cap is
       what truncated "Repulsor" into "REP_" junk under the rail. The reserved sockets render no
       name at all, so the neighbor collision that motivated the cap cannot return. */
    max-width:none;
  }
  #hud .sf-prail__label { white-space:nowrap; }
  #hud .sf-law__head { flex-wrap:wrap; row-gap:2px; }
  #hud .sf-law__headline { line-height:1.25; }
  #hud .sf-target__meta { gap:10px; margin-top:2px; }
  #hud .sf-target__range { white-space:nowrap; }
  .sf-target__name { font-family:var(--hud-display); font-size:var(--k-fs-data); font-weight:700; color:var(--hud-paper); }
  .sf-target__faction, .sf-target__meta, .sf-target__identity, .sf-target__intent { font-family:var(--hud-data); }
  .sf-target__meta { font-size:var(--k-fs-data); color:var(--hud-muted); }
  .sf-target .sf-bar--sm, .sf-target .sf-bar { height:3px; background:var(--k-hair); }
  /* The radar was 180px and right-aligned inside a 232px column, leaving a 52px notch down the
     left of the dock — the actual visible stagger. It is now the full column width and centred,
     so the dock reads as one edge. */
  .sf-radar-wrap { align-items:center; }
  .sf-radar { width:var(--sf-radar-size); height:var(--sf-radar-size);
    border:1px solid var(--hud-cyan); background:none; }
  .sf-radar-objective-key { width:100%; color:var(--hud-amber); font-family:var(--hud-display); font-weight:700; font-size:var(--k-fs-data); }

  .sf-toast {
    width:100%; padding:2px 0; border:none; background:none;
    color:var(--hud-paper); font-family:var(--hud-data); font-size:var(--k-fs-data); line-height:1.3;
  }
  .sf-ml-instrument { width:100%; margin-top:4px; }
  .sf-ml-instrument[hidden] { display:none !important; }
  .sf-ml-instrument__row { display:flex; align-items:center; gap:8px; }
  .sf-ml-instrument__k { font-family:var(--hud-display); font-size:var(--k-fs-data); color:var(--hud-muted); }
  .sf-ml-instrument__track { flex:1; height:3px; background:var(--k-hair); }
  .sf-ml-instrument__fill { display:block; height:100%; width:100%; transform-origin:left center; background:var(--hud-amber, var(--hud-amber)); }
  .sf-ml-instrument__v { font-size:var(--k-fs-data); color:var(--hud-paper); }
  .sf-ml-instrument__release { text-align:center; font-size:var(--k-fs-data); color:var(--hud-amber, var(--hud-amber)); margin-top:3px; }
  .sf-firstuse {
    position:absolute; left:0; top:0; max-width:240px; padding:2px 0;
    color:var(--hud-paper); font-family:var(--hud-data); font-size:var(--k-fs-data); pointer-events:none; white-space:nowrap;
  }
  .sf-firstuse[hidden] { display:none !important; }
  .sf-toast__icon { font-family:var(--hud-data); color:var(--hud-cyan); }
  .sf-toast--success, .sf-toast--good, .sf-toast--error, .sf-toast--danger, .sf-toast--warn { border-left-width:1px; }
  .sf-alert {
    min-width:220px; justify-content:center; padding:7px 18px;
    font-family:var(--hud-display); font-size:var(--k-fs-data); font-weight:700;
    border:1px solid var(--hud-cyan); border-top-color:var(--hud-cyan);
  }
  .sf-alert--dock { font-size:var(--k-fs-data); padding:9px 24px; }

  @media (max-width:1180px) {
    .sf-command-deck { width:min(320px, calc(100vw - 560px)); min-width:200px; }
  }
  @media (max-width:900px), (max-height:650px) {
    .sf-leftstack { left:calc(10px + var(--sf-safe-inset-x, 0px)); bottom:72px; width:236px; }
    .sf-bars { width:236px; grid-template-columns:80px minmax(0, 1fr); padding:8px 9px 9px; }
    .sf-schematic { width:72px; height:72px; }
    .sf-schematic .sf-sch-ring { inset:0; width:72px; height:72px; }
    .sf-sch-ship-wrap { width:50px; height:60px; }
    .sf-sch-ship { width:50px; height:60px; }
    .sf-sch-ship--fill { width:50px; height:60px; }
    /* One number still owns the column at every breakpoint — the children stay width:100%.
       The canvas is always drawn at COMPACT_SIZE, so any breakpoint that narrows the dial MUST
       scale the canvas with it or the drawing is clipped by the dial's overflow:hidden. Pinned by
       test/j07-hud-contract.test.mjs, which caught exactly that when this rule was first written. */
    #hud { --sf-dock-w:200px; --sf-radar-size:200px; }
    .sf-radar canvas { width:200px !important; height:200px !important; }
    .sf-rightdock { right:calc(10px + var(--sf-safe-inset-x, 0px)); bottom:72px; }
    .sf-overview-row__name { max-width:64px; }
    .sf-command-deck { bottom:8px; width:min(360px, calc(100vw - 24px)); min-width:0; }
    .sf-cluster { position:relative; left:auto; bottom:auto; width:auto; transform:none; }
  }
  @media (max-width:760px) {
    .sf-command-deck { padding:6px 9px; }
    .sf-cluster { margin:0; padding:0; }
    .sf-mission-tracker { max-width:none; }
  }
  @media (prefers-reduced-motion:reduce) {
    .sf-schematic.sf-sch-critical .sf-sch-ship--fill,
    .sf-schematic.sf-sch-hit .sf-sch-ship-wrap,
    .sf-gravity-mark__ring { animation:none; }
    .sf-lockring.sf-lockring--latch { animation:none; }
    .sf-sch-ship-fill-crop, .sf-sch-fill-line, .sf-sch-shield { transition:none; }
  }

  /* ===== dock transition overlay ===== */
  .sf-dock-fade { position:fixed; inset:0; z-index:2500; pointer-events:none;
    opacity:0; transition:opacity 0.4s ease-in-out; }
  .sf-dock-fade[hidden] { display:none!important; }
  .sf-dock-fade.active { opacity:1; }

  /* ===== HUD/scene integration pass =====
     Independent review scored ui_integration 3/5 with "the HUD reads like flat webpage panels placed
     over the render: many rectangular boxes, high cyan strokes... little relationship to scene
     lighting or focal hierarchy". Its fix was to reduce panel opacity and border dominance, align HUD
     brightness to the scene grade, and reserve strong cyan for actionable state.

     Done here as a trailing override rather than by editing the shared tokens in styles/ui.css,
     because those tokens are global and the station screens depend on them. Layout, sizes, positions
     and the authored "holographic-bleak" character are untouched — this only changes how hard the
     surfaces sit on top of the render. Every rule is scoped to a HUD class. */
  /* Panel fills: the render now carries a lifted black floor, so a near-opaque panel reads as a hole
     punched in the frame. Dropping toward half opacity lets the scene sit behind the glass.
     J07: the mission tracker left this set — it is de-boxed above and this trailing rule was
     silently re-plating it. Three stylesheets set that selector; only the last one was visible. */
  /* Borders: keep the edge legible but stop it drawing a hard rectangle around every element. */
  .sf-cargo-panel, .sf-contacts, .sf-weapon-panel {
    border-color:color-mix(in srgb, var(--k-hair) 55%, transparent);
  }
  /* Passive text recedes; strong cyan is reserved for actionable state, which keeps its own rules. */
  .sf-contacts .sf-contact__meta, .sf-cargo-empty { opacity:.82; }

  /* ══ J06 THE POWER RAIL ════════════════════════════════════════════════════════════════════
     Bottom-centre 1-9 rank in three bands. See src/ui/powerRail.js for the band contract.

     The cooldown sweep is a CSS animation on stroke-dashoffset, with its duration written once
     by JS when the cooldown starts. This is deliberate: check:ui-frame-sleep asserts the UI stops
     doing frame work at rest, and nine slots repainting a radial every frame is precisely what
     that check exists to prevent. Nothing here needs a rAF.  */
  @keyframes sf-pslot-sweep { from { stroke-dashoffset:0; } to { stroke-dashoffset:81.68; } }

  /* The rail is the permanent floor of the HUD, so it owns the bottom strip and .sf-command-deck
     sits above it (see the bottom:88px override below). padding-bottom reserves room for the slot
     name labels, which hang 11px BELOW their slot box — without it they render past the viewport
     edge and every slot ships unlabelled. */
  .sf-prail { position:absolute; left:calc(50% + (var(--sf-safe-inset-x, 0px) * 0)); bottom:10px; transform:translateX(-50%);
    display:flex; gap:14px; align-items:flex-end; pointer-events:none; z-index:6;
    padding-bottom:14px; }
  .sf-prail__band { display:flex; flex-direction:column; align-items:center; gap:3px; }
  .sf-prail__label { font-family:var(--hud-display); font-size:var(--k-fs-data);
    color:var(--k-bone-38); opacity:.7; }
  .sf-prail__slots { display:flex; gap:4px; }

  /* The backing is near-opaque on purpose: a near-camera rock renders on the canvas BEHIND this
     DOM chip, and at .55 alpha it shone straight through the key glyph ('7' over an asteroid).
     Same plate material as the rest of the flight HUD. Empty sockets below stay unbacked. */
  .sf-pslot { position:relative; width:38px; height:38px; padding:0; border:1px solid var(--k-hair); color:var(--hud-paper); display:flex; flex-direction:column;
    align-items:center; justify-content:center; cursor:default; }
  .sf-pslot__key { position:absolute; top:1px; left:3px; font-family:var(--hud-data); font-size:var(--k-fs-data);
    line-height:1; color:var(--k-bone-38); }
  .sf-pslot__art { display:flex; align-items:center; justify-content:center; }
  .sf-pslot__art svg { display:block; }
  .sf-pslot__name { position:absolute; bottom:-11px; font-family:var(--hud-data); font-size:var(--k-fs-data); color:var(--k-bone-38); white-space:nowrap; }
  .sf-pslot__sweep { position:absolute; inset:3px; width:calc(100% - 6px); height:calc(100% - 6px);
    transform:rotate(-90deg); pointer-events:none; }
  .sf-pslot__sweep circle { fill:none; stroke:var(--hud-amber); stroke-width:1.6; opacity:0; }

  /* Slot states. Colour is never the only channel — border weight and the name label move too, so
     a locked slot and a ready slot differ under every colourblind mode. */
  .sf-pslot[data-state="ready"] { border-color:var(--k-hair); }
  .sf-pslot[data-state="armed"] { border-color:var(--hud-amber); }
  .sf-pslot[data-state="cooling"] { opacity:.72; }
  .sf-pslot[data-state="cooling"] .sf-pslot__sweep circle { opacity:.95; }
  .sf-pslot[data-state="unaffordable"] { opacity:.45; }
  /* Locked/empty sockets stay visible (a seen gap reads as "fills in later") but they WHISPER:
     solid hairline, low opacity, dimmed glyph — not dashed boxes shouting for attention. */
  .sf-pslot[data-state="locked"] { opacity:.26; border-color:var(--hud-line); }
  .sf-pslot[data-state="locked"] .sf-pslot__art { opacity:.3; }
  .sf-pslot[data-state="locked"] .sf-pslot__key { opacity:.5; }
  .sf-pslot[data-state="empty"] { border-color:var(--hud-line); opacity:.24; background:none; }
  .sf-pslot[data-state="empty"] .sf-pslot__art { opacity:.25; }
  .sf-pslot[data-state="empty"] .sf-pslot__key { opacity:.4; }

  /* Under a FULL claim the rail is answering a prompt, so it stops advertising powers. */
  .sf-prail[data-claimed="FULL"] .sf-prail__label { opacity:.3; }
  .sf-prail[data-claimed] .sf-pslot__name { color:var(--hud-amber); }

  /* Lift the instrument deck clear of the rail. Measured, not guessed: the rail occupies 10-77px
     from the viewport floor at 1280x720, and .sf-command-deck previously sat at bottom:12px — so
     the two overlapped exactly and both became unreadable. This override must stay AFTER the
     .sf-command-deck rule above it; this stylesheet resolves several selectors by source order. */
  .sf-command-deck { bottom:88px; }

  @media (max-width:1180px) {
    .sf-pslot { width:32px; height:32px; }
    .sf-prail { gap:10px; }
    .sf-command-deck { bottom:80px; }
  }
  @media (max-width:900px), (max-height:650px) {
    .sf-command-deck { bottom:76px; }
  }

  /* ===== Task B (PQ-188.00) — the HUD in the kit's faces and tokens (sheet: Flight → The HUD) =====
     Trailing overrides; this stylesheet resolves by source order. No plates anywhere: every
     instrument is text on the world at the edges. Speed is the one hero number. Kit tokens only, so
     the frame goes cold with the kit (bindTemperature → data-k-temp="wanted" turns --k-signal red and
     --k-text-live a degree cooler). */
  /* 2.2 speed — the hero number, bottom-left of the command deck; its label beneath at data size 62 %. */
  .sf-cluster { justify-content:flex-start; align-items:flex-end; gap:6px 18px; }
  .sf-stat { font-family:var(--k-text); gap:4px; }
  .sf-stat--speed { flex-direction:column; align-items:flex-start; gap:0; }
  .sf-stat--speed .sf-stat__v { font-family:var(--k-display); font-weight:800; font-variation-settings:"opsz" 96;
    font-size:var(--k-fs-num); line-height:.9; letter-spacing:-.03em; color:var(--k-text-live); }
  .sf-stat--speed .sf-stat__k { order:2; margin-top:2px; }
  /* the other stats: label at data size 62 %, the value at emph 100 % */
  .sf-stat__k { font-family:var(--k-text); font-size:var(--k-fs-data); font-weight:400; color:var(--k-bone-62); text-transform:none; letter-spacing:0; border-bottom:0; padding-bottom:0; }
  .sf-stat__v { font-family:var(--k-text); font-size:var(--k-fs-emph); font-weight:400; color:var(--k-text-live); }
  .sf-stat--info .sf-stat__k, .sf-stat--info:hover .sf-stat__k { border-bottom:0; color:var(--k-bone-62); }
  .sf-tip { background:none; border:0; color:var(--k-text-live); font-family:var(--k-text); font-size:var(--k-fs-data); padding:0; }
  .sf-tip::after { display:none; }
  .sf-stat__hint { color:var(--k-bone-62); opacity:1; }
  /* vitals: 2 px lines, track 38 %, fill live; heat rides --k-signal so it goes red when wanted */
  .sf-bars { padding:0; gap:3px 10px; grid-template-rows:auto repeat(4, 16px); }
  .sf-bar, .sf-bars .sf-bar, .sf-bar--sm, .sf-target .sf-bar, .sf-target .sf-bar--sm, .sf-wpn-heat__bar, .sf-ml-instrument__track, .sf-target__rangebar, .sf-tri__bar {
    height:2px; background:var(--k-bone-38); overflow:hidden; }
  .sf-bar__fill, .sf-bar--energy .sf-bar__fill, .sf-bar--boost .sf-bar__fill, .sf-bar--fuel .sf-bar__fill, .sf-bar--shield .sf-bar__fill,
  .sf-ml-instrument__fill, .sf-target__rangefill, .sf-tri__fill, .sf-tri.best .sf-tri__fill { background:var(--k-text-live); }
  .sf-bar--heat .sf-bar__fill, .sf-bar--heat.sf-bar--overheated .sf-bar__fill, .sf-bar--heat.sf-bar--venting .sf-bar__fill,
  .sf-barrow.sf-bar--venting .sf-bar--heat .sf-bar__fill, .sf-wpn-heat__fill, .sf-wpn-heat.overheated .sf-wpn-heat__fill,
  .sf-wpn-heats.venting .sf-wpn-heat__fill, .sf-bar--burn .sf-bar__fill { background:var(--k-signal); }
  .sf-bar--hull .sf-bar__fill { background:var(--k-red); }
  .sf-barrow__label, .sf-wpn-heat__label, .sf-ml-instrument__k, .sf-condition-head, .sf-condition-metrics, .sf-cond-stat {
    font-family:var(--k-text); font-size:var(--k-fs-data); font-weight:400; color:var(--k-bone-62); text-transform:none; letter-spacing:0; }
  .sf-barrow__num, .sf-ml-instrument__v, .sf-cond-stat strong { font-family:var(--k-text); font-size:var(--k-fs-data); font-weight:400; color:var(--k-text-live); }
  .sf-wpn-heats { border-top:0; padding-top:4px; }
  .sf-wpn-heats.venting .sf-wpn-heat__label { color:var(--k-signal); }
  /* the ship schematic stays (a drawn silhouette is an object): strokes 62 %, shield ring live */
  .sf-schematic .sf-sch-track { fill:none; stroke:var(--k-bone-38); stroke-width:1.2; }
  .sf-schematic .sf-sch-shield, .sf-schematic.sf-sch-shield-low .sf-sch-shield { stroke:var(--k-text-live); stroke-width:2; }
  .sf-sch-ship--empty .sf-sch-hull { stroke:var(--k-bone-62); }
  .sf-sch-ship--fill .sf-sch-hull { stroke:var(--k-bone-62); fill:color-mix(in srgb, var(--k-bone) 18%, transparent); }
  .sf-sch-ship--fill .sf-sch-hull .sx-shipmark__battery { fill:var(--k-bone-62); }
  .sf-sch-ship--fill .sf-sch-hull .sx-shipmark__sensor { fill:var(--k-text-live); }
  .sf-sch-fill-line { background:var(--k-bone-62); height:1px; }
  .sf-schematic.sf-sch-warning .sf-sch-ship--fill .sf-sch-hull { stroke:var(--k-signal); fill:color-mix(in srgb, var(--k-signal) 18%, transparent); }
  .sf-schematic.sf-sch-warning .sf-sch-fill-line { background:var(--k-signal); }
  .sf-schematic.sf-sch-critical .sf-sch-fill-line { background:var(--k-red); }
  /* ══ THE POWER RAIL AS MACHINED SOCKETS ═══════════════════════════════════════════════════════
     What stood here: .sf-pslot { background:none; border:0 } with __art { display:none } — nine
     powers rendered as three columns of words under a 2 px underline. That was the "slots become
     words" reading of Cinematic Minimal, which FIELD_HARDWARE_PROGRAM §8 voids on aesthetics.

     The kit had already produced the exact hardware this widget is: assets/ui/kit/assets/sockets/
     holds a machined recess in five states plus a 240x72 9-slice band bracket, and the kit's own
     reference sheet says in as many words "a socket is a machined recess that holds a verb icon —
     the action bar is sockets, not buttons". Nothing in the game referenced any of it. The icons
     match too: the produced family carries seed, well, repel, cone, skim and line, which are the
     rail's own verb names and appear nowhere else — see src/ui/views/fhGlyphs.js.

     Sprite per state. The kit ships five recesses for six rail states, so one is deliberate reuse:
       ready         socket.rest      a bay with a verb in it, waiting
       armed         socket.lit       the warm backlit bay — the only state that glows
       cooling       socket.cooling   dimmed bay, with the sweep ring running over it
       unaffordable  socket.rest      rest with the mark dropped: the bay is fine, the magazine is
                                      empty. socket.locked would lie about why the key is dead.
       locked        socket.locked
       empty         socket.empty     an authored gap that still reads as a bay you could fill

     Every sprite is the @2x file drawn at half size, so the rail stays crisp when the media query
     below shrinks it and on high-DPI displays. State is carried by the sprite, so the base block's
     opacity dimming above is reset — stacking both turned a locked bay into a grey smear. */
  .sf-prail {
    --sf-socket:48px; --sf-lip:18px; --sf-socket-gap:6px;
    gap:calc(16px * var(--k-s)); align-items:flex-end; padding-bottom:0;
  }
  /* The band legend is stencilled ON the bracket's top lip rather than floating above it: the lip is
     18 px of machined metal with its own edge light, which is where a real rack prints its legend,
     and it keeps the whole rail one object instead of a label and a frame that happen to line up. */
  .sf-prail__band { position:relative; align-items:stretch; gap:0; }
  .sf-prail__label {
    position:absolute; left:0; right:0; top:0; z-index:2; pointer-events:none;
    height:var(--sf-lip); line-height:var(--sf-lip); text-align:center;
    font-family:var(--k-display, var(--hud-display));
    font-variation-settings:"wght" 700, "wdth" 62;
    font-size:var(--k-fs-fine); letter-spacing:.16em; text-transform:uppercase;
    color:var(--k-signal, var(--hud-amber)); opacity:1;
  }
  .sf-prail__slots {
    box-sizing:border-box; justify-content:center; align-items:flex-end;
    gap:var(--sf-socket-gap); padding:2px var(--sf-socket-gap) 0;
    border-style:solid; border-width:var(--sf-lip);
    border-image-source:url("assets/ui/kit/assets/sockets/socket.bracket@2x.png");
    border-image-slice:36 fill; border-image-width:var(--sf-lip);
  }
  .sf-pslot {
    position:relative; box-sizing:border-box;
    flex:0 0 var(--sf-socket); width:var(--sf-socket); height:var(--sf-socket);
    display:grid; place-items:center; padding:0; border:0; box-shadow:none; opacity:1;
    background:url("assets/ui/kit/assets/sockets/socket.rest@2x.png")
      center / var(--sf-socket) var(--sf-socket) no-repeat;
    color:var(--k-bone-62);
    transition:color var(--k-d-focus) var(--k-ease);
  }
  .sf-pslot::after { display:none; }
  /* The key numeral is engraved on the bay's top-left bezel, clear of the 24 px mark in the middle.
     It stays at 62 % bone in every state including locked: the number is how you find the socket,
     and a key you cannot read is worse than a power you cannot fire. */
  .sf-pslot__key {
    position:absolute; top:1px; left:4px; z-index:1;
    font-family:var(--k-text); font-size:var(--k-fs-fine); line-height:1.1;
    color:var(--k-bone-62); opacity:1;
  }
  .sf-pslot__art { display:grid; place-items:center; }
  .sf-pslot__art .fh-glyph { display:block; }
  /* Verb names sit in the bracket's bottom lip — the same engraving logic as the band legend, and it
     is why this rail is no taller than the word list it replaces despite carrying real hardware. */
  .sf-pslot__name {
    position:absolute; left:50%; transform:translateX(-50%); bottom:calc(2px - var(--sf-lip));
    /* The display face's width axis, not a smaller size: 12 px is the type floor (check-type-floor)
       and the names have to fit a 48 px pitch, so the only axis left is wdth. Condensed also reads
       as the stencilled marking the direction asks for rather than a caption under an icon. */
    font-family:var(--k-display, var(--hud-display));
    font-variation-settings:"wght" 600, "wdth" 62;
    font-size:var(--k-fs-fine); line-height:1.2; letter-spacing:.04em;
    color:var(--k-bone-62); white-space:nowrap;
  }
  .sf-pslot__sweep {
    position:absolute; inset:4px; width:auto; height:auto;
    transform:rotate(-90deg); pointer-events:none; z-index:1;
  }
  .sf-pslot__sweep circle { stroke:var(--k-signal, var(--hud-amber)); stroke-width:2.6; }

  .sf-pslot[data-state="armed"] {
    background-image:url("assets/ui/kit/assets/sockets/socket.lit@2x.png");
    color:var(--k-text-live);
  }
  /* Every produced glyph carries a second .accent path. Lighting only that path is what makes an
     armed socket read as backlit hardware rather than a brighter copy of the resting one. */
  .sf-pslot[data-state="armed"] .fh-glyph .accent { fill:var(--k-signal, var(--hud-amber)); }
  .sf-pslot[data-state="armed"] .sf-pslot__name { color:var(--k-text-live); }
  .sf-pslot[data-state="cooling"] {
    background-image:url("assets/ui/kit/assets/sockets/socket.cooling@2x.png"); opacity:1;
  }
  .sf-pslot[data-state="cooling"] .sf-pslot__art { opacity:.55; }
  .sf-pslot[data-state="unaffordable"] { opacity:1; }
  .sf-pslot[data-state="unaffordable"] .sf-pslot__art { opacity:.38; }
  .sf-pslot[data-state="locked"] {
    background-image:url("assets/ui/kit/assets/sockets/socket.locked@2x.png"); opacity:1;
  }
  .sf-pslot[data-state="locked"] .sf-pslot__art { opacity:.42; }
  .sf-pslot[data-state="locked"] .sf-pslot__key { opacity:1; }
  .sf-pslot[data-state="empty"] {
    background-image:url("assets/ui/kit/assets/sockets/socket.empty@2x.png"); opacity:1;
  }
  .sf-pslot[data-state="empty"] .sf-pslot__art { opacity:.28; }
  .sf-pslot[data-state="empty"] .sf-pslot__key { opacity:1; }
  .sf-pslot[data-state="cooling"] .sf-pslot__name,
  .sf-pslot[data-state="unaffordable"] .sf-pslot__name,
  .sf-pslot[data-state="locked"] .sf-pslot__name { color:var(--k-bone-62); }
  /* an empty socket (no charges, nothing armed) still names its verb, dim: a bare icon under a key says
     nothing. Only a prompt that has borrowed the whole rail blanks the names. */
  .sf-pslot[data-state="empty"] .sf-pslot__name { color:var(--dp-ink-mute, #96948e); }
  .sf-prail[data-claimed="FULL"] .sf-pslot[data-state="empty"] .sf-pslot__name { display:none; }
  .sf-prail[data-claimed] .sf-pslot__name { color:var(--k-signal, var(--hud-amber)); }
  .sf-prail[data-claimed="FULL"] .sf-prail__label { opacity:.5; }

  /* Clearance, measured from the box rather than guessed. The rail is now lip(18) + pad(2) +
     socket(48) + lip(18) = 86 px tall on bottom:10px, so it occupies 10-96. The slot names hang
     into the lower lip rather than below the frame, which is why a rail carrying real hardware ends
     up only ~19 px taller than the word list it replaces — and why .sf-prail needs no
     padding-bottom reserve any more. The instrument deck's 88 px would have dropped the speed gauge
     across the RIG bracket's top lip.

     The breakpoints resize by token: --sf-lip drives border-width AND border-image-width together,
     so the bracket art always scales as a whole. border-image-slice must stay 36 at every size —
     it names the authored corner region of the @2x source, not a display size, and retuning it
     would cut the bracket apart at a seam the artwork never had.

     The socket gap GROWS as the sockets shrink, which looks backwards until you notice what sets
     the pitch: the verb name under each bay is pinned at the 12 px floor and cannot shrink with the
     hardware. Below ~40 px the name, not the socket, is the wide element — at a 4 px gap the
     FIELDWORK band read "SEED WELLREPEL" in the capture. */
  .sf-command-deck { bottom:104px; }
  @media (max-width:1180px) {
    .sf-prail { --sf-socket:40px; --sf-lip:14px; --sf-socket-gap:9px; gap:calc(12px * var(--k-s)); }
    .sf-pslot__art .fh-glyph { width:22px; height:22px; }
    .sf-command-deck { bottom:88px; }
  }
  @media (max-width:900px), (max-height:650px) {
    .sf-prail { --sf-socket:34px; --sf-lip:12px; --sf-socket-gap:12px; }
    .sf-pslot__art .fh-glyph { width:19px; height:19px; }
    .sf-pslot__key { left:3px; }
    .sf-command-deck { bottom:78px; }
  }
  /* target panel: no plate; name emph 100 %, faction and distance data 62 %; tier as a word */
  .sf-target { padding:0; gap:3px; }
  .sf-target__name { font-family:var(--k-text); font-size:var(--k-fs-emph); font-weight:500; color:var(--k-text-live); }
  .sf-target__faction, .sf-target__meta, .sf-target__dist, .sf-target__identity, .sf-target__intent, .sf-target__weak,
  .sf-target__tri-label, .sf-target__tri-layer, .sf-tri__k, .sf-target__threat-pips, .sf-target__threat-word {
    font-family:var(--k-text); font-size:var(--k-fs-data); font-weight:400; color:var(--k-bone-62); }
  .sf-target__weak { color:var(--k-signal); }
  .sf-target__threat-pips { display:none; }
  .sf-target__threat[data-tier]::before { display:none; }
  .sf-target__threat[data-tier="2"] .sf-target__threat-word { color:var(--k-signal); }
  .sf-target__threat[data-tier="3"] .sf-target__threat-word { color:var(--k-red); font-weight:700; }
  .sf-tri.best .sf-tri__k { color:var(--k-text-live); }
  /* contact roster: hairline rows at data size; no leftover instrument title */
  .sf-overview { border:0; font-family:var(--k-text); font-size:var(--k-fs-data); padding:0; }
  .sf-overview::before { content:none; display:none; }
  .sf-overview-row { padding:3px 0; border-bottom:1px solid var(--k-hair); }
  .sf-overview-row:hover { background:none; }
  .sf-overview-row__name { color:var(--k-text-live); }
  .sf-overview-row__right, .sf-overview-row__detail, .sf-overview-row__state, .sf-overview-row__tier, .sf-overview-footer { color:var(--k-bone-62); }
  /* radar: the drawing only */
  .sf-radar { border:0; background:none; }
  /* comms tape: one line at data size 62 %, no band */
  .sf-commtape { border-bottom:0; padding:0; }
  .sf-commtape__band, .sf-commtape .sf-comm-backlog-btn, .sf-commtape .sf-contact-hail__button, .sf-commtape .sf-fx-comms-trace__wave {
    font-family:var(--k-text); font-size:var(--k-fs-data); font-weight:400; color:var(--k-bone-62); letter-spacing:0; text-transform:none; }
  .sf-commtape .sf-fx-comms-trace { border-inline-start:0; padding-left:0; }
  .sf-commtape .sf-fx-comms-trace__crest { color:var(--k-bone-62); }
  /* mission tracker + nav readout: text; the mission title keeps its one signal rule */
  .sf-mission-tracker, .sf-nav-readout { padding:0; border:0; }
  .sf-mt-title { font-family:var(--k-text) !important; font-size:var(--k-fs-data); font-weight:500; color:var(--k-signal); border-bottom:1px solid var(--k-hair); }
  .sf-mt-obj { font-family:var(--k-text) !important; font-size:var(--k-fs-body); color:var(--k-text-live); }
  .sf-mt-time, .sf-mt-time.sf-mt-urgent { font-family:var(--k-text) !important; font-size:var(--k-fs-data); color:var(--k-bone-62); }
  .sf-nav-label { font-family:var(--k-text); font-size:var(--k-fs-data); font-weight:400; color:var(--k-text-live); }
  .sf-nav-meta { font-family:var(--k-text); font-size:var(--k-fs-data); color:var(--k-bone-62); }
  .sf-obj { font-family:var(--k-text); font-size:var(--k-fs-data); color:var(--k-text-live); padding:0; }
  .sf-obj__dot { background:var(--k-signal); }
  /* receipts: text only at body size, live; --in/--out opacity only; the lane rectangle untouched */
  .sf-toast { padding:0; border:0; background:none; box-shadow:none; color:var(--k-text-live); font-family:var(--k-text); font-size:var(--k-fs-body); font-weight:400; }
  .sf-toast--success, .sf-toast--good, .sf-toast--error, .sf-toast--danger, .sf-toast--warn { border:0; }
  .sf-toast__icon { display:none; }
  .sf-toast__count { border:0; padding:0; background:none; color:var(--k-bone-62); font-family:var(--k-text); font-size:var(--k-fs-data); }
  /* one voice: text at emph 100 %, no pill; the wanted text stays; nothing pulses */
  .sf-alert, .sf-alert--info, .sf-alert--warn, .sf-alert--danger, .sf-alert--dock, .sf-alert--floor {
    min-width:0; padding:0; border:0; background:none; box-shadow:none;
    font-family:var(--k-text); font-size:var(--k-fs-emph); font-weight:500; color:var(--k-text-live); animation:none; }
  .sf-alert--warn { color:var(--k-signal); }
  .sf-alert--danger { color:var(--k-red); }
  /* the tether chips, the first-use hint and the massline instrument: words, no boxes */
  .sf-tether-controls { border-top:0; padding-top:4px; margin-top:4px; }
  .sf-tchip__bind { min-width:0; padding:0; border:0; background:none; font-family:var(--k-text); font-size:var(--k-fs-data); font-weight:400; color:var(--k-text-live); }
  .sf-tchip__verb, .sf-tchip__hint, .sf-tchip { font-family:var(--k-text); font-size:var(--k-fs-data); font-weight:400; color:var(--k-bone-62); }
  .sf-firstuse { font-family:var(--k-text); font-size:var(--k-fs-data); color:var(--k-text-live); }
  .sf-ml-instrument__release { font-family:var(--k-text); font-size:var(--k-fs-data); color:var(--k-signal); }
  /* the world-space marks: stroke colours to kit tokens, nothing else */
  .sf-schematic .sf-sch-ship { stroke:var(--k-bone-62); }
  .sf-lockring .sf-lockring__track { stroke:var(--k-bone-38); }
  .sf-lockring .sf-lockring__fill { stroke:var(--k-text-live); }
  .sf-lockring__label { font-family:var(--k-text); font-size:var(--k-fs-data); color:var(--k-text-live); }
  .sf-lockdiamond__inner { border-color:var(--k-text-live); }
  .sf-leadpip__full, .sf-leadpip__arc, .sf-leadpip__tick { stroke:var(--k-text-live); }
  .sf-gravity-mark__ring { border-color:var(--k-text-live); }
  .sf-gravity-mark__core { background:var(--k-text-live); }
  .sf-gravity-mark__label, .sf-momentum-sink__label { font-family:var(--k-text); font-size:var(--k-fs-data); }
  .sf-objarrow--onscreen .sf-objarrow__glyph { border-color:var(--k-text-live); background:var(--k-signal); }
  .sf-objarrow__label { font-family:var(--k-text); font-size:var(--k-fs-data); font-weight:400; color:var(--k-text-live); border-left:0; padding:0 6px; }
  .sf-radar-objective-key { font-family:var(--k-text); font-size:var(--k-fs-data); font-weight:400; color:var(--k-signal); }
  .icon-box { border-color:var(--k-hair); }
  .icon-box svg { stroke:var(--k-bone-62); }
  .icon-box.sf-act-active { border-color:var(--k-text-live); }
  .action-slot .bind { font-family:var(--k-text); font-size:var(--k-fs-fine); color:var(--k-bone-38); }
  .sf-cargo-panel { border:0; font-family:var(--k-text); }
  .sf-cargo-panel__head, .sf-cargo-panel__summary { border-bottom:1px solid var(--k-hair); }
  .sf-cargo-panel__title { color:var(--k-text-live); font-size:var(--k-fs-emph); }
  .sf-cargo-row__qty { color:var(--k-text-live); }
  .sf-cargo-panel__close { border:0; color:var(--k-bone-62); }
  .sf-cargo-panel__close:hover { color:var(--k-text-live); }
  .sf-cap-readout { font-family:var(--k-text); font-size:var(--k-fs-data); color:var(--k-bone-62); }
  /* The instruments other modules mount INTO the HUD's anchors (law card, comms log, band tuner,
     onboarding card, massline marks) keep their behaviour and their own stylesheets; only their
     plates come off here, because they sit on the same windshield and the sheet's HUD has none.
     Scoped under #hud so the station screens are untouched. */
  #hud { --sf-brk-col:transparent; }
  #hud #sf-sector-law { background:none; border:0; box-shadow:none; text-shadow:none; padding:0;
    font-family:var(--k-text); color:var(--k-text-live); }
  #hud .sf-law__head, #hud .sf-law__headline, #hud .sf-law__meta, #hud .sf-law__detail, #hud .sf-law__jurisdiction {
    font-family:var(--k-text); font-size:var(--k-fs-data); font-weight:400; letter-spacing:0; text-transform:none; color:var(--k-bone-62); }
  #hud .sf-law__headline { font-size:var(--k-fs-body); color:var(--k-text-live); }
  #hud #sf-sector-law.sf-law--medium .sf-law__head, #hud #sf-sector-law.sf-law--low .sf-law__head { color:var(--k-signal); }
  #hud #sf-sector-law.sf-law--lawless .sf-law__head, #hud #sf-sector-law.sf-law--danger .sf-law__head { color:var(--k-red); }
  #hud .sf-comm { background:none; border:0; box-shadow:none; text-shadow:none; padding:2px 0; font-family:var(--k-text); font-size:var(--k-fs-data); }
  #hud .sf-comm__tag { background:none; padding:0; font:400 var(--k-fs-data) var(--k-text); letter-spacing:0; color:var(--k-bone-62); }
  #hud .sf-comm__sender { font:400 var(--k-fs-data) var(--k-text); letter-spacing:0; text-transform:none; color:var(--k-bone-62); }
  #hud .sf-comm__body, #hud .sf-comm--personal .sf-comm__body, #hud .sf-comm--late .sf-comm__body, #hud .sf-comm--story .sf-comm__body { color:var(--k-text-live); }
  #hud .sf-band-hud__button { background:none; border:0; box-shadow:none; padding:0; font-family:var(--k-text); font-size:var(--k-fs-data); letter-spacing:0; text-transform:none; color:var(--k-bone-62); }
  #hud .sf-band-hud__button:hover, #hud .sf-band-hud__button:focus-visible { background:none; color:var(--k-text-live); }
  #hud #sf-onboarding .sf-ob-card { background:none; border:0; box-shadow:none; text-shadow:none; padding:0; }
  #hud #sf-onboarding .sf-ob-kicker { font:400 var(--k-fs-fine) var(--k-text); letter-spacing:0.08em; color:var(--k-bone-38); }
  #hud #sf-onboarding .sf-ob-title { font-family:var(--k-text); font-size:var(--k-fs-body); color:var(--k-text-live); }
  #hud #sf-onboarding .sf-ob-hint, #hud #sf-onboarding .sf-ob-flavor, #hud #sf-onboarding .sf-ob-progress {
    font-family:var(--k-text); font-size:var(--k-fs-data); font-style:normal; color:var(--k-bone-62); text-shadow:none; border-top:0; }
  #hud #sf-onboarding .sf-ob-dot { background:var(--k-bone-38); }
  #hud #sf-onboarding .sf-ob-dot.done { background:var(--k-bone-62); }
  #hud #sf-onboarding .sf-ob-dot.curr { background:var(--k-text-live); box-shadow:none; }
  /* massline marks: shapes stay (diamond / circle / dashed carry the state); the text chips lose their
     plates and take the kit's face and tokens. */
  #hud #sf-ml2 { --ml2-c:var(--k-text-live); --ml2-p:var(--k-text-live); }
  #hud #sf-ml2 .ml2-preview, #hud #sf-ml2 .ml2-mark-label, #hud #sf-ml2 .ml2-pill {
    background:none; border:0; box-shadow:none; text-shadow:none; clip-path:none; padding:0;
    font:400 var(--k-fs-data)/1.3 var(--k-text); letter-spacing:0; color:var(--k-text-live); animation:none; }
  #hud #sf-ml2 .ml2-preview.ml2-preview-blocked, #hud #sf-ml2 .ml2-preview.ml2-preview-protected,
  #hud #sf-ml2 .ml2-preview.ml2-preview-out-of-range, #hud #sf-ml2 .ml2-preview.ml2-preview-invalid,
  #hud #sf-ml2 .ml2-preview-mark.ml2-mark-unavailable, #hud #sf-ml2 .ml2-preview-mark.ml2-bridle-target { color:var(--k-signal); }
  #hud #sf-ml2 .ml2-pill .ml2-fill { height:2px; border-radius:0; background:var(--k-bone-38); }
  #hud #sf-ml2 .ml2-pill .ml2-fill i, #hud #sf-ml2 .ml2-pill.ml2-cloak .ml2-fill i { background:var(--k-text-live); }
  #hud #sf-ml2 .ml2-preview-mark i, #hud #sf-ml2 .ml2-throw .ml2-diamond, #hud #sf-ml2 .ml2-preview-mark.ml2-bridle-source i { box-shadow:none; }
  #hud #sf-ml2 .ml2-self { filter:none; }
  #hud #sf-ml2 .ml2-ring circle { stroke:var(--k-bone-62); fill:none; }
  #hud #sf-ml2 .ml2-preview-line { stroke:var(--k-bone-62); }
  #hud #sf-ml2 .ml2-preview-link.ml2-snare-preview .ml2-preview-line { stroke:var(--k-text-live); filter:none; }
  #hud #sf-ml2 .ml2-preview-link.ml2-bridle-preview .ml2-preview-line { stroke:var(--k-signal); filter:none; }
  /* 2.3 arrival: the two centred anchors keep their -50% centring through the kit's settle. */
  .sf-command-deck.k-in, .sf-prail.k-in { transform:translate(calc(-50% + var(--k-in-x, 0px)), var(--k-in-y, 0px)); }
  .sf-command-deck.k-in.k-in--go, .sf-prail.k-in.k-in--go { transform:translateX(-50%); }
  @media (prefers-reduced-motion:reduce) {
    /* The rail's only transition is the socket's text/mark colour as a power arms. The 2 px
       underline this used to guard went with the word-list skin; the sprite swap is instant. */
    .sf-pslot { transition:none; }
  }

  /* ===== Field Hardware instruments — produced bezels/faces, not CSS hairlines ===== */
  .sf-bars {
    width:min(320px, 100%);
    grid-template-columns:88px minmax(0, 1fr);
    grid-template-rows:auto 88px repeat(3, 32px);
    gap:6px 10px;
    align-items:center;
  }
  .sf-barrow {
    grid-template-columns:54px minmax(88px, 1fr) 34px;
    min-height:28px; gap:8px;
  }
  .sf-barrow__label {
    font-family:var(--k-display, var(--hud-display));
    font-variation-settings:"wght" 600, "wdth" 62;
    letter-spacing:.06em; text-transform:uppercase;
    color:color-mix(in srgb, var(--k-signal, var(--hud-amber)) 45%, transparent);
  }
  .sf-bars .sf-bar.sf-kit-bar,
  .sf-kit-bar {
    position:relative; height:28px; min-height:28px; width:100%;
    display:flex; align-items:center; gap:0; padding:0 2px;
    box-sizing:border-box; overflow:visible; background:none;
    border-style:solid; border-width:8px 10px;
    border-image-source:url("assets/ui/kit/assets/gauges/bar.seg.bezel.png");
    border-image-slice:8 10 8 10 fill; border-image-width:8px 10px;
  }
  .sf-kit-bar > .sf-bar__fill {
    position:absolute; inset:6px 10px; width:auto; height:auto; opacity:0; pointer-events:none;
    background:var(--k-signal, var(--hud-amber)); transform-origin:left center;
  }
  .sf-kit-bar:not(:has(.sf-kit-seg.is-on)) > .sf-bar__fill { opacity:1; }
  .sf-kit-seg {
    flex:0 0 12px; width:12px; height:16px;
    background:url("assets/ui/kit/assets/gauges/bar.seg.off.png") center / 12px 16px no-repeat;
  }
  .sf-kit-seg.is-on {
    background-image:url("assets/ui/kit/assets/gauges/bar.seg.on.png");
  }
  .sf-kit-seg.is-hot {
    background-image:url("assets/ui/kit/assets/gauges/bar.seg.hot.png");
  }
  .sf-kit-seg.is-cold,
  html[data-k-temp="wanted"] .sf-kit-seg.is-on {
    background-image:url("assets/ui/kit/assets/gauges/bar.seg.cold.png");
  }

  .sf-command-deck {
    width:min(360px, calc(100vw - 560px)); min-width:240px;
  }
  .sf-cluster {
    flex-direction:column; align-items:stretch; justify-content:flex-end; gap:6px;
  }
  .sf-kit-gauge {
    position:relative; width:360px; height:200px; max-width:100%;
    margin:0 auto; color:var(--k-signal, var(--hud-amber));
    background:url("assets/ui/kit/assets/gauges/gauge.speed.bezel.png") center / contain no-repeat;
    --sf-gauge-deg:-110deg; --sf-gauge-arc:0deg;
  }
  .sf-kit-gauge__arc {
    position:absolute; inset:0; pointer-events:none;
    background:url("assets/ui/kit/assets/gauges/gauge.speed.lit-arc.png") center / contain no-repeat;
    -webkit-mask-image:conic-gradient(from -110deg at 50% 62%, #000 0deg, #000 var(--sf-gauge-arc), transparent var(--sf-gauge-arc));
    mask-image:conic-gradient(from -110deg at 50% 62%, #000 0deg, #000 var(--sf-gauge-arc), transparent var(--sf-gauge-arc));
  }
  .sf-kit-gauge__needle {
    position:absolute; left:50%; top:62%; width:24px; height:100px;
    margin-left:-12px; margin-top:-80px; overflow:visible; pointer-events:none; z-index:2;
    transform-origin:12px 80px; transform:rotate(var(--sf-gauge-deg));
    color:var(--k-signal, var(--hud-amber));
  }
  .sf-kit-gauge__hub { fill:var(--k-ink); }
  .sf-kit-gauge__face {
    position:absolute; left:100px; top:108px; width:160px; height:72px;
    display:grid; place-items:center;
    background:url("assets/ui/kit/assets/gauges/gauge.speed.face.png") center / contain no-repeat;
  }
  .sf-kit-gauge__num {
    font-family:var(--k-display, var(--hud-display));
    font-weight:800; font-variation-settings:"opsz" 96, "wdth" 125;
    font-size:max(40px, calc(64px * var(--k-s, 1))); line-height:.9; letter-spacing:-.03em;
    color:var(--k-text-live, var(--hud-paper));
  }
  .sf-kit-gauge .sf-tip { left:50%; bottom:calc(100% + 8px); }

  .sf-rightdock { contain:layout style; }
  .sf-radar-wrap.sf-kit-radar {
    --sf-kit-radar-rim:28px;
    position:relative;
    width:calc(var(--sf-radar-size, 220px) + var(--sf-kit-radar-rim) * 2);
    min-height:calc(var(--sf-radar-size, 220px) + var(--sf-kit-radar-rim) * 2);
    padding:0; contain:layout style; background:none;
  }
  .sf-kit-radar__bezel,
  .sf-kit-radar__face,
  .sf-kit-radar__n { position:absolute; pointer-events:none; }
  .sf-kit-radar__bezel {
    left:50%; top:0; width:100%; height:calc(var(--sf-radar-size, 220px) + var(--sf-kit-radar-rim) * 2);
    transform:translateX(-50%);
    background:url("assets/ui/kit/assets/radar/radar.bezel.png") center / contain no-repeat;
    z-index:0;
  }
  .sf-kit-radar__face {
    left:50%; top:var(--sf-kit-radar-rim); width:var(--sf-radar-size, 220px); height:var(--sf-radar-size, 220px);
    transform:translateX(-50%); border-radius:50%;
    background:url("assets/ui/kit/assets/radar/radar.face.png") center / contain no-repeat;
    z-index:1;
  }
  html[data-k-temp="wanted"] .sf-kit-radar__face {
    background-image:url("assets/ui/kit/assets/radar/radar.wanted-face.png");
  }
  .sf-kit-radar .sf-radar {
    z-index:2; background:none; margin-top:var(--sf-kit-radar-rim);
  }
  /* The objective key is an in-flow line under the dial, but the bezel and face are absolutely
     positioned over the whole wrap and painted it out: only the two ends of the route readout
     cleared the circle and the middle of the line was erased under the rim. It is the
     instrument's bottom-lip legend, so it takes the dial's layer. */
  .sf-radar-wrap.sf-kit-radar .sf-radar-objective-key { position:relative; z-index:2; }
  .sf-kit-radar__n {
    left:50%; top:8px; width:16px; height:10px; transform:translateX(-50%);
    background:url("assets/ui/kit/assets/radar/radar.n-lit.png") center / contain no-repeat;
    z-index:3;
  }
  .sf-radar-wrap.sf-kit-radar:has(.sf-radar--expanded) {
    --sf-kit-radar-rim:40px;
    width:420px; min-height:420px;
  }
  .sf-radar-wrap.sf-kit-radar:has(.sf-radar--expanded) .sf-kit-radar__bezel { height:420px; }
  .sf-radar-wrap.sf-kit-radar:has(.sf-radar--expanded) .sf-kit-radar__face { width:340px; height:340px; }

  @media (max-width:760px), (max-height:620px) {
    .sf-bars { grid-template-rows:auto 64px repeat(3, 28px); }
  }

  /* ═══ The resting HUD, measured against approved/frames/frame-hud-resting.png ═══════════════
     Boot evidence, default route, 2026-09-12: the speed gauge rendered at 468,396 344x200 at
     1280x800 and 788,654 at 1920x1080 — horizontally dead centre, vertically 50-75 % down the
     screen, i.e. squarely over the player's hull at the chase camera. The frame never does that:
     the gauge is a plate in the BOTTOM band, left of the ORDNANCE bracket (its numeral window at
     471-631 x 950-1034 of 1920x1080), and the hull is large and unobstructed at centre.

     Two independent defects produced it.

     1. .sf-command-deck was centred (left:50% + translateX(-50%)) and then lifted to
        bottom:104px so it would clear the Power Rail. A 200 px instrument on a centred anchor
        that has to clear a 95 px rail can only climb into the middle of the picture.
     2. Nothing in the gauge scaled. The bezel was a hard 360x200 at every viewport while the
        numeral inside it already scaled by --k-s (which resolves to exactly 0.75 / 1 / 1.25 at
        1280x800 / 1920x1080 / 2560x1440). Measured numerals: 43 / 58 / 72 px tall into a window
        that stayed 72 px tall, so at 2560 the hero number filled its own smoked window lip to lip.
        The two px breakpoints that used to resize the bezel (1180 / 760) never fire at 1280 —
        which is why the largest slab of all was the one at the smallest default viewport.

     So: the whole gauge scales by --k-s, and the deck is anchored to the same floor band as the
     rail. left: keeps var(--sf-safe-inset-x) — check-responsive requires every anchored edge to
     carry the token, and it is a genuine anchor now rather than the old centring no-op that
     multiplied the token by zero.

     Why the arrangement changes at 1760 px. Side by side with the rail — the frame's composition —
     needs the numeral window to clear the rail's left edge:
         deckLeft + 260px*--k-s + clearance  <=  50vw - railWidth/2
     The rail is ~640 px wide at every width (nine fixed sockets; its own breakpoints are 1180/900),
     and the left column is a fixed 272 px, so that inequality only holds above about 1760 px.
     Below it the deck takes the bottom-left corner and the left column stacks above it. The hull
     stays clear either way, which is the law the frame is expressing. */
  .sf-command-deck {
    left:calc(var(--sf-safe-inset-x, 0px) + var(--sf-deck-inset, 12px));
    bottom:10px;
    transform:none;
    width:auto; min-width:0; max-width:calc(100vw - 24px);
    padding:0;
  }
  /* Left-aligned under the plate, like the frame's "weapons Pulse Laser S / class Hitch" block. */
  .sf-cluster { align-items:flex-start; }
  /* One factor drives the whole instrument, so the bezel, the smoked window and the needle's pivot
     can never come apart the way they did when only the numeral scaled. --sf-gauge-compact is the
     small-viewport step; --k-s is the kit's own 0.75 / 1 / 1.25. */
  .sf-kit-gauge {
    --sf-gauge-f:calc(var(--k-s, 1) * var(--sf-gauge-compact, 1));
    width:calc(360px * var(--sf-gauge-f)); height:calc(200px * var(--sf-gauge-f));
    margin:0;
  }
  .sf-kit-gauge__face {
    left:calc(100px * var(--sf-gauge-f)); top:calc(108px * var(--sf-gauge-f));
    width:calc(160px * var(--sf-gauge-f)); height:calc(72px * var(--sf-gauge-f));
  }
  .sf-kit-gauge__needle {
    width:calc(24px * var(--sf-gauge-f)); height:calc(100px * var(--sf-gauge-f));
    margin-left:calc(-12px * var(--sf-gauge-f)); margin-top:calc(-80px * var(--sf-gauge-f));
    transform-origin:calc(12px * var(--sf-gauge-f)) calc(80px * var(--sf-gauge-f));
  }
  /* The kit's arrival settle is shared with the rail, which is still centred. A deck that no longer
     carries translateX(-50%) must not inherit the rail's version of the rule or it lands half its
     own width to the left and slides back. */
  .sf-command-deck.k-in { transform:translate(var(--k-in-x, 0px), var(--k-in-y, 0px)); }
  .sf-command-deck.k-in.k-in--go { transform:none; }

  /* Below the side-by-side threshold the deck owns the bottom-left corner, so the left column has
     to end above it. The reserve is the deck's measured box (gauge + the weapon/tether/cargo rows
     under it), not a guess: 289 px at 1280x800, which is 385 px unscaled. */
  @media (max-width:1759px) {
    /* The reserve is the deck's measured box (gauge + the readout under it): 289 px at 1280x800,
       385 px unscaled. Capped against the viewport as well, because --k-s floors at 0.75 and a
       fixed 311 px reserve inside a 600 px-tall window would push the left column off the top. */
    .sf-leftstack { bottom:min(calc(22px + 385px * var(--k-s, 1)), 38vh); }
  }
  /* 2026-09-18: the deck no longer stacks four rows under the gauge — the readouts flow, and the
     weapon readout is a nameplate bolted to the gauge. The 385 px reserve left ~90 px of dead band
     at 1280x720 and pushed the column's top plate off the screen. The reserve is now the deck's
     own parts: the gauge at its own clamp (velocityRailStyles --sv-scale, 116 px tall) plus the
     nameplate + one flowed chip row + one tether row of slack, scaled by the kit factor. */
  @media (max-width:1759px) and (min-height:651px) {
    .sf-leftstack { bottom:min(calc(40px + 116px * clamp(.86, var(--k-s, 1), 1.15) + 70px * var(--k-s, 1)), 38vh); }
  }
  @media (min-width:1760px) {
    /* The frame puts the plate's left edge at 19.3 % of the width (371 px of 1920). Below that it
       must still clear the left column's 284 px right edge. */
    .sf-command-deck { --sf-deck-inset:clamp(296px, 18.6vw, 520px); }
  }

  /* The plate is allowed to tuck its right edge under the rail's left bracket — the frame composes
     exactly that overlap, and the rail sits above on z:6. The READING under it is not: at 1920 the
     weapon/tether/cargo rows ran to 671 against a rail whose bracket starts at 639. Cap the reading
     to the gap that is actually there and let the bezel overhang it. The rail is at most ~660 px
     wide (nine sockets plus three brackets, measured 634-650 across the three default viewports),
     so its left edge never starts before 50vw - 330px. */
  .sf-command-deck {
    max-width:min(calc(320px * var(--k-s, 1)), calc(50vw - 338px - var(--sf-deck-inset, 12px)));
  }
  .sf-kit-gauge { max-width:none; }
  /* Frame: the readout under the plate is two short 12 px lines sitting on the floor. Ours was four
     full-width rows at a 27 px pitch — 108 px of column that lifted the plate back off the floor
     band toward the hull. Same four readings, flowed instead of stacked. */
  .sf-cluster { flex-flow:row wrap; align-items:flex-end; justify-content:flex-start; gap:2px 14px; }
  .sf-cluster > .sf-kit-gauge { flex:0 0 auto; width:calc(360px * var(--sf-gauge-f)); }
  .sf-cluster > .sf-stat { min-height:0; line-height:1.25; }

  /* The vitals rows overflowed their own plate: .sf-barrow budgeted 54 + bar + 34 inside a 174 px
     track while .sf-kit-bar carries a 88 px minimum, so the numeral column was pushed 18 px past
     the left column's right edge and the "80" sat half under whatever was beside it. Give the bar
     the slack and let the ten light wells share whatever width the row really has, so the row is
     correct at any column size instead of only at the one it was authored against. */
  .sf-barrow { grid-template-columns:48px minmax(0, 1fr) 30px; gap:6px; }
  .sf-bars .sf-bar.sf-kit-bar, .sf-kit-bar { min-width:0; }
  .sf-kit-seg { flex:1 1 0; min-width:0; max-width:12px; background-size:contain; }

  /* The kit radar is a 220 px face inside a 28 px machined rim, so its box is 276 px — but the dock
     column it lives in was still the pre-kit 220 px, and the wrap is left-aligned in it. Measured on
     the default route: the bezel's right edge landed at 1964 in a 1920 viewport, so the dial was cut
     off by the screen edge at every default size. The column owns the width (J07), so the column is
     what moves; --sf-radar-size stays pinned to radar.js COMPACT_SIZE. */
  #hud { --sf-dock-w:276px; }
  /* Small viewports. The instrument keeps its whole box — bezel, window, needle pivot — and only
     the factor moves, so nothing can come apart. The reserve the left column has to clear comes
     down with it. These replace the retired 1180/760 breakpoints that resized the bezel alone. */
  @media (max-width:900px), (max-height:650px) {
    #hud { --sf-dock-w:256px; }
    .sf-kit-gauge { --sf-gauge-compact:0.72; }
    .sf-command-deck { max-width:calc(240px * var(--k-s, 1)); }
    .sf-leftstack { bottom:min(calc(18px + 290px * var(--k-s, 1)), 34vh); }
  }
  @media (max-width:760px), (max-height:620px) {
    /* --sf-radar-size is still 200 here: the (max-width:900px) block above declares it and wins on
       source order, so the wrap is 200 + 2x18. Measured at 800x600 before this line, the dial hung
       58px past the right edge. */
    .sf-radar-wrap.sf-kit-radar { --sf-kit-radar-rim:18px; }
    #hud { --sf-dock-w:236px; }
    .sf-kit-gauge { --sf-gauge-compact:0.6; }
    .sf-command-deck { max-width:calc(210px * var(--k-s, 1)); }
    .sf-leftstack { bottom:min(calc(20px + 245px * var(--k-s, 1)), 36vh); }
  }

  /* The Band chip floated at top:150px, unattached, halfway down the sky. The frame keeps it in the
     top band with the rest of the top-edge instruments. */
  /* Top band, and squared to the right instrument column rather than floating 20px + a dock width
     inboard of it — at 1280 that inboard anchor put the chip 33px inside the centred one-voice
     line's own box, so a two-line alert would have landed on it. */
  #hud .sf-band-hud {
    top:calc(62px * var(--k-s, 1));
    right:calc(12px + var(--sf-safe-inset-x, 0px));
  }

  /* The one-voice floor line ("Light ships are ammunition. Swing a rock. Keep the speed.") sat at
     top:13% — 140 px down a 1080 picture, floating in open sky with nothing to belong to. The frame
     runs the same sentence as a header line hard against the top edge. */
  #alerts { top:22px; }
  @media (forced-colors: active) {
    .sf-kit-bar {
      border:1px solid CanvasText; border-image:none; background:Canvas;
      forced-color-adjust:none;
    }
    .sf-kit-seg { background:Canvas; box-shadow:inset 0 0 0 1px GrayText; }
    .sf-kit-seg.is-on { background:Highlight; }
    .sf-kit-gauge { background:Canvas; border:1px solid CanvasText; forced-color-adjust:none; }
    .sf-kit-gauge__arc, .sf-kit-gauge__face { background:none; }
    .sf-kit-gauge__num { color:CanvasText; }
    .sf-kit-gauge__needle { color:CanvasText; }
    .sf-kit-radar__bezel, .sf-kit-radar__face, .sf-kit-radar__n { display:none; }
    .sf-kit-radar .sf-radar { margin-top:0; }
    /* The Power Rail's sockets are PNG recesses, and forced colours repaints the surface behind a
       background image without repainting the image — a bay drawn on Canvas goes invisible or, on a
       light theme, black-on-white. Drop the sprites and redraw the same six states in system
       colours. The verb marks need nothing: they are inline SVG on currentColor, so the UA maps
       them to CanvasText for free (which is why they are inlined rather than mask-images). */
    /* The band legend and the verb names are engraved INTO the bracket's 18 px lips, so dropping the
       border-image would collapse those lips to 1 px and land both on top of the sockets. Give the
       margins back exactly what the border gave up, and the two negative offsets still point at
       empty space. Measured against the forced-colours capture, not assumed. */
    .sf-prail__slots {
      border-image:none; border:1px solid CanvasText; background:Canvas;
      margin:var(--sf-lip) 0; padding:2px var(--sf-socket-gap);
    }
    .sf-prail__label { color:CanvasText; }
    /* Bays are outlined with border, NOT box-shadow: forced colours drops shadows outright, and the
       first pass here lost every socket edge because of it. box-sizing is border-box, so the outline
       costs no width. */
    .sf-pslot {
      background:Canvas; border:1px solid CanvasText; box-shadow:none; color:CanvasText;
    }
    .sf-pslot[data-state="armed"] {
      background:Highlight; border:2px solid Highlight; color:HighlightText;
    }
    .sf-pslot[data-state="cooling"], .sf-pslot[data-state="unaffordable"],
    .sf-pslot[data-state="locked"], .sf-pslot[data-state="empty"] {
      background:Canvas; border:1px solid GrayText;
    }
    .sf-pslot__sweep circle { stroke:CanvasText; }
    /* State must not be opacity alone here: forced colours flattens the palette, so a 28 % mark and
       a 42 % mark become the same grey. The border weight and colour above carry the difference. */
    .sf-pslot .sf-pslot__art { opacity:1; }
    .sf-pslot[data-state="empty"] .sf-pslot__art, .sf-pslot[data-state="locked"] .sf-pslot__art {
      color:GrayText;
    }
    .sf-pslot__key, .sf-pslot__name { color:CanvasText; }
  }

  /* ══ DECKPLATE REGISTER — the 2026-09-18 reset ═══════════════════════════════════════════
     CORRECTED 2026-09-22. This comment used to say the owner's 2026-09-14 words were "the tenth
     generic one-off" and that "the owner never approved a frame". Both halves are wrong about
     what was said. On 2026-09-14 the owner looked at THIS HUD and said the register had "a
     strange wood look that's not visible against the backdrop and also doesn't fit with this
     game; it would have to be more sleek and glass ... maybe some slight neon look", and that the
     speed dial read "like a car dashboard ... anything like that should at least resemble an
     instrument in an advanced spaceship and maintain the illusion." That is the most specific
     direction the flight HUD has ever been given, and it is about the flight HUD.

     What was substituted for it was the owner's 2026-09-18 praise -- which was about the 3D WORLD
     ART ("real rock texture, warm directional light, a physical machine, almost no chrome"), not
     about the HUD. Good words, wrong surface: applied here they produced a gunmetal chassis
     bolted over the live sim, which is exactly the "not visible against the backdrop" complaint
     restated in a different material.

     design/frontend/ONE_PHOTOGRAPH.md sections 4.9 and 5 (P5) answer the 09-14 words: the flight
     layer is LIGHT. Weight 0.05 -- almost nothing on this screen is an object. Readings are
     phosphor that EMITS (cool bone, a cool halo: the "slight neon" asked for, without a hue to
     manage), occlusion is a veil that reaches the frame edge with no inner boundary, and the
     ordnance dock is the only mass in flight.

     Unchanged and deliberately so: the deckplate token vocabulary, the HUD's contract DOM (sf-*
     classes, data-* attrs, aria roles), the --glass-* aliases that promptDeck.js and
     contactHailPrompt.js still consume, no backdrop-filter (flight perf floor), and the
     hull-silhouette dial, which ONE_PHOTOGRAPH section 8 protects as the only drawn instrument in
     the game and the seed of P5.

     The register still assembles from the deckplate design system (src/ui/deckplate/*):
     the ship's own machined hardware — gunmetal plate under one warm key light, etched
     legends, and the ONE accent: the warm lamp (live = filament amber, danger = lamp red).
     The HUD's contract DOM (sf-* classes, data-* attrs, aria roles) is untouched — only the
     paint changes. --glass-* aliases are kept as deckplate synonyms because promptDeck.js /
     contactHailPrompt.js (out of this session's scope) still consume them. No backdrop-filter
     (flight perf floor). */

  /* ── THE FLIGHT VEIL ───────────────────────────────────────────────────────────────────────
     With the plate gone the readings sit straight on the sim, and this sector is lit bright ochre.
     Section 4.1 forbids the obvious answer -- a rectangle of darkening with a visible inner edge --
     and names the replacement: a gradient that reaches the frame edge with no inner boundary. So
     the HUD gets a grade, not a box. It is darkest in the bottom corners where the readings live
     and clears completely through the middle, where the player is actually flying.

     Pointer-events none, painted below every child, and no backdrop-filter (flight perf floor). */
  #hud::before {
    content:""; position:fixed; inset:0; z-index:0; pointer-events:none;
    background:
      radial-gradient(64% 42% at 2% 100%, rgb(3 5 8 / .95), rgb(3 5 8 / .86) 34%, rgb(3 5 8 / .52) 62%,
                      rgb(3 5 8 / .18) 80%, transparent 94%),
      radial-gradient(46% 30% at 100% 100%, rgb(3 5 8 / .86), rgb(3 5 8 / .46) 48%, transparent 82%),
      linear-gradient(0deg, rgb(3 5 8 / .86) 0%, rgb(3 5 8 / .70) 9%, rgb(3 5 8 / .40) 19%,
                             rgb(3 5 8 / .14) 29%, transparent 40%),
      linear-gradient(180deg, rgb(3 5 8 / .72) 0%, rgb(3 5 8 / .30) 7%, transparent 17%);
  }
  @media (forced-colors:active) { #hud::before { display:none; } }

  /* ── PHOSPHOR ──────────────────────────────────────────────────────────────────────────────
     What you READ in flight is a cool emitter with its own halo -- the "slight neon look" the
     owner asked for on 09-14, expressed as light rather than as a second hue to manage. Warm amber
     stays reserved for a lamp that means something is live or dangerous, so the two never blur.
     The halo is a glow, NOT a contrast mechanism: the ink itself is bone-bright over the veil. */
  #hud .sf-cluster-chassis {
    --hud-paper:var(--dp-phos);
    --hud-muted:var(--dp-phos-dim);
  }
  /* The class names here were verified against the live DOM with scripts/ui-contrast.mjs, not
     guessed: an earlier pass wrote .sf-bar__v and .sf-bar__k, which match nothing, so the readings
     silently kept their old dim ink and measured 2.6-3.4:1 on the composited frame. */
  #hud .sf-cluster-chassis :is(.sf-stat__v, .sf-speed__digits, .sf-barrow__num, .sf-fc-v,
                               .sf-schematic__pct, .sf-schematic__state) {
    color:var(--dp-phos);
    text-shadow:0 0 12px var(--dp-phos-halo), 0 1px 0 rgb(0 0 0 / .8);
  }
  /* The label tier is quieter but still has to CLEAR 4.5:1 -- a legend nobody can read is not
     restraint, it is a defect. --dp-phos-dim measured 3.2:1 over the veil, so the flight labels sit
     one step up from it. The hierarchy is carried by weight and tracking, not by making the small
     text too dark to see. */
  #hud .sf-cluster-chassis :is(.sf-stat__k, .sf-barrow__label, .sf-fc-k, .sf-legend, .k-caps),
  #hud .sf-prail__label,
  #hud .sf-pslot__name {
    color:#dfe9f4;
    text-shadow:0 1px 0 rgb(0 0 0 / .75);
  }
  /* Hierarchy between a label and its value is carried by WEIGHT and TRACKING, not by making the
     label too dark to read. Measured: #c4d4e2 sat at 3.1-4.3:1 over the veil and over the power
     rail's plate; one step up clears 4.5:1 and the tiers still read apart. */
  #hud .sf-cluster-chassis :is(.sf-stat__k, .sf-barrow__label, .sf-fc-k),
  #hud .sf-prail__label {
    font-variation-settings:"wght" 560, "wdth" 78;
    letter-spacing:.09em;
  }
  #hud .sf-mt-obj { color:var(--dp-phos); text-shadow:0 0 10px var(--dp-phos-halo), 0 1px 0 rgb(0 0 0 / .8); }
  /* "No lock" / "Idle" / "Clear" are the VALUE side of fire control, not its labels; they were
     mis-tiered into the label group and measured 3.3-3.7:1 on the frame. */
  #hud .sf-fc-v { color:var(--dp-phos); text-shadow:0 0 10px var(--dp-phos-halo), 0 1px 0 rgb(0 0 0 / .8); }

  /* ── THE LEGIBILITY FLOOR ON ABSENT STATES ────────────────────────────────────────────────
     "No lock", "Idle", an empty power slot: these are deliberately quiet, and they should be --
     an absent reading must not shout. But --dp-ink-mute measured 3.37:1 against the composited
     frame (scripts/ui-contrast.mjs), and quiet is not the same as unreadable. WCAG exempts a
     DISABLED control; a live readout saying there is no target is not disabled, it is information
     with a negative value.

     These selectors carry [data-state] and so outrank the tier rules above at (1,2,0); that is why
     the floor has to be restated here rather than fixed upstream. The tier gap survives: the
     absent state is still a step below its live value, just above the floor instead of under it. */
  #hud .sf-fc-row[data-state="none"] .sf-fc-v,
  #hud .sf-fc-row[data-state="idle"] .sf-fc-v,
  #hud .sf-fc-row[data-state="clear"] .sf-fc-v { color:#c2cfdb; text-shadow:0 1px 0 rgb(0 0 0 / .75); }
  #hud .sf-pslot[data-state="empty"] .sf-pslot__name,
  #hud .sf-pslot[data-state="locked"] .sf-pslot__name,
  #hud .sf-pslot[data-state="cooling"] .sf-pslot__name,
  #hud .sf-pslot[data-state="unaffordable"] .sf-pslot__name { color:#c2cfdb; }
  #hud .sf-prail .sf-prail__label,
  #hud .sf-prail[data-claimed] .sf-prail__label { color:#cfdbe6; opacity:1; }

  :root {
    --glass-fill:rgb(18 21 26 / .92);
    --glass-fill-2:rgb(25 29 36 / .88);
    --glass-fill-3:rgb(11 13 16 / .85);
    --glass-edge:rgb(74 81 98 / .5);
    --glass-sheen:radial-gradient(140% 120% at 18% 0%, rgb(255 224 178 / .09) 0%, transparent 58%);
    --glass-drop:0 2px 10px rgb(0 0 0 / .38);
    --glass-inner:inset 0 1px 0 rgb(255 232 190 / .14), inset 0 -1px 0 rgb(0 0 0 / .55);
    --glass-neon:var(--dp-lamp);
    --glass-neon-2:var(--dp-lamp-dim);
    --glass-glow:0 0 14px var(--dp-lamp-bloom);
  }
  /* The readable ink ramp on metal: warm bone ink, the lamp as the live colour. */
  #hud {
    --hud-paper:var(--dp-ink);
    --hud-muted:var(--dp-ink-dim);
    --hud-cyan:var(--dp-lamp);
    --hud-line:var(--dp-metal-4);
  }

  /* --- shared machined surface: every panel that carries text is a dp-plate --- */
  #hud .sf-bars,
  #hud .sf-overview,
  #hud .sf-target,
  #hud .sf-mission-tracker,
  #hud .sf-nav-readout,
  #hud #sf-sector-law,
  #hud .sf-cargo-panel,
  #hud .sf-commtape,
  #hud .sf-objarrow__label,
  .sf-alert,
  .sf-toast {
    box-sizing:border-box;
    background-color:var(--dp-metal-2);
    background-image:var(--dp-plate-img);
    border:0;
    border-radius:var(--dp-r-plate);
    box-shadow:var(--dp-plate-bevel);
    backdrop-filter:none !important;
    -webkit-backdrop-filter:none !important;
  }
  #hud .sf-objarrow__label, .sf-toast { border-radius:var(--dp-r-plate); }
  .sf-alert { border-radius:var(--dp-r-instrument); }

  /* --- left instrument card: hull schematic + vitals, a raised plate --- */
  #hud .sf-bars { width:100%; max-width:288px; padding:10px 12px 11px; gap:5px 10px; border-radius:var(--dp-r-instrument); box-shadow:var(--dp-plate-bevel-raised); }
  #hud .sf-condition-head { color:var(--hud-muted); }
  #hud .sf-condition-state { color:var(--hud-cyan); }
  #hud .sf-cond-stat { color:var(--hud-muted); }
  #hud .sf-cond-stat strong { color:var(--hud-paper); }
  #hud .sf-schematic .sf-sch-track { stroke:var(--glass-edge); }
  #hud .sf-sch-ship--empty .sf-sch-hull { stroke:var(--hud-muted); }
  #hud .sf-sch-ship--fill .sf-sch-hull { stroke:var(--hud-cyan); fill:color-mix(in srgb, var(--glass-neon) 20%, transparent); }
  #hud .sf-sch-fill-line { background:var(--hud-cyan); height:1px; }
  #hud .sf-barrow__label { color:var(--hud-muted); }
  #hud .sf-barrow__num { color:var(--hud-paper); }

  /* --- segmented gauges: the dp-vital channel — wells cut in the plate, lamps inside --- */
  #hud .sf-bars .sf-bar.sf-kit-bar, #hud .sf-kit-bar {
    height:26px; min-height:26px; padding:3px 8px; gap:3px;
    border:0; border-image:none; border-radius:var(--dp-r-plate);
    background-color:var(--dp-metal-0); background-image:var(--dp-channel-img);
    box-shadow:var(--dp-channel-bevel);
  }
  #hud .sf-kit-bar > .sf-bar__fill { inset:6px 8px; background:linear-gradient(180deg, var(--dp-lamp-hot), var(--dp-lamp) 55%, var(--dp-lamp-dim)); opacity:0; }
  #hud .sf-kit-bar:not(:has(.sf-kit-seg.is-on)) > .sf-bar__fill { opacity:1; }
  #hud .sf-kit-seg {
    flex:1 1 0; min-width:0; max-width:12px; height:11px; border-radius:1px;
    background:linear-gradient(180deg, var(--dp-metal-0), var(--dp-metal-1));
    box-shadow:inset 0 1px 1px rgb(0 0 0 / .6);
  }
  #hud .sf-kit-seg.is-on {
    background:linear-gradient(180deg, var(--dp-lamp-hot) 0%, var(--dp-lamp) 55%, var(--dp-lamp-dim) 100%);
    box-shadow:0 0 6px var(--dp-lamp-bloom), inset 0 1px 0 rgb(255 255 255 / .3);
  }
  #hud .sf-kit-seg.is-hot {
    background:linear-gradient(180deg, var(--dp-danger-hot) 0%, var(--dp-danger) 55%, #a8241a 100%);
    box-shadow:0 0 6px var(--dp-danger-bloom), inset 0 1px 0 rgb(255 255 255 / .26);
  }
  #hud .sf-kit-seg.is-cold { background:linear-gradient(180deg, #efe6d2, #b9ae97); box-shadow:none; }
  html[data-k-temp="wanted"] #hud .sf-kit-seg.is-on { background:linear-gradient(180deg, var(--dp-danger-hot), var(--dp-danger) 55%, #a8241a); box-shadow:0 0 7px var(--dp-danger-bloom); }

  /* --- speed instrument: a machined dp-gauge. The 2026-09-14 glass ring is retired with the
         register it belonged to. velocityRailStyles.js owns the instrument's own skin and wins
         by component scoping; these rules only keep the generic dial paint off it. The DOM
         contract, the aria meter and the responsive factor are untouched. --- */
  #hud .sf-kit-gauge {
    filter:none;
    color:var(--dp-lamp);
    background-color:var(--dp-metal-1);
    background-image:var(--dp-plate-img);
    border:0;
    border-radius:var(--dp-r-instrument);
    box-shadow:var(--dp-plate-bevel-raised);
  }
  #hud .sf-kit-gauge__arc {
    background:repeating-conic-gradient(from -110deg at 50% 62%,
        rgb(255 232 190 / .30) 0deg 0.7deg, transparent 0.7deg 22deg),
      conic-gradient(from -110deg at 50% 62%,
        var(--dp-lamp) 0deg var(--sf-gauge-arc, 0deg), transparent var(--sf-gauge-arc, 0deg) 220deg),
      conic-gradient(from -110deg at 50% 62%,
        rgb(255 232 190 / .12) 0deg 220deg, transparent 220deg 360deg);
    -webkit-mask-image:radial-gradient(circle closest-side at 50% 62%, transparent 0 86%, #000 88% 98%, transparent 99%),
      conic-gradient(from -110deg at 50% 62%, #000 0deg 220deg, transparent 220deg 360deg);
    -webkit-mask-composite:source-in;
    mask-image:radial-gradient(circle closest-side at 50% 62%, transparent 0 86%, #000 88% 98%, transparent 99%),
      conic-gradient(from -110deg at 50% 62%, #000 0deg 220deg, transparent 220deg 360deg);
    mask-composite:intersect;
    filter:drop-shadow(0 0 6px var(--dp-lamp-bloom));
  }
  #hud .sf-kit-gauge__needle { color:var(--dp-lamp); }
  #hud .sf-kit-gauge__hub { fill:var(--dp-ink); }
  #hud .sf-kit-gauge__face { background:none; }
  #hud .sf-kit-gauge__num { color:var(--dp-lamp-hot); text-shadow:0 0 12px var(--dp-lamp-bloom); }

  /* --- power rail: machined sockets in a rail plate --- */
  #hud .sf-prail { padding-bottom:0; }
  #hud .sf-prail__label {
    position:static; height:auto; line-height:1.2; padding:0 0 6px;
    font-family:var(--dp-face-etch);
    font-variation-settings:"wght" 700, "wdth" 62;
    font-size:var(--k-fs-fine); letter-spacing:.18em; text-transform:uppercase;
    color:var(--dp-ink-mute); opacity:1; text-shadow:var(--dp-etch-shadow);
  }
  #hud .sf-prail__slots {
    border:0; border-image:none; border-radius:var(--dp-r-instrument);
    background-color:var(--dp-metal-1); background-image:var(--dp-plate-img);
    box-shadow:var(--dp-plate-bevel-raised);
    padding:8px 10px 24px; gap:8px; align-items:flex-end;
  }
  /* dp-socket: the bay cut into the rail. State lives in data-state (powerRail.js), the lamp
     strip on the bay floor carries armed/cooling; the mark dims when the bay is dead. */
  #hud .sf-pslot {
    background:
      radial-gradient(120% 90% at 50% 0%, rgb(255 232 190 / .05), transparent 55%),
      linear-gradient(180deg, rgb(0 0 0 / .62), rgb(0 0 0 / .22) 58%, rgb(255 255 255 / .028));
    border:0; border-radius:var(--dp-r-instrument);
    box-shadow:inset 0 2px 5px rgb(0 0 0 / .78), inset 0 -1px 0 rgb(255 232 190 / .10),
      inset 1px 0 0 rgb(0 0 0 / .4), inset -1px 0 0 rgb(0 0 0 / .4);
    color:var(--dp-ink-dim); opacity:1;
  }
  #hud .sf-pslot__key {
    color:var(--dp-ink-mute); opacity:1; text-shadow:var(--dp-etch-shadow);
    font-family:var(--dp-face-etch); font-variation-settings:"wght" 700, "wdth" 62; letter-spacing:.04em;
    max-width:calc(100% - 6px); overflow:hidden; white-space:nowrap;
  }
  #hud .sf-pslot__name { bottom:-17px; color:var(--dp-ink-mute); text-shadow:var(--dp-etch-shadow); }
  #hud .sf-pslot__sweep circle { stroke:var(--dp-lamp); }
  #hud .sf-pslot[data-state="armed"] {
    background:
      radial-gradient(120% 90% at 50% 0%, rgb(255 217 140 / .16), transparent 55%),
      linear-gradient(180deg, rgb(0 0 0 / .5), rgb(0 0 0 / .16) 58%, rgb(255 217 140 / .06));
    color:var(--dp-lamp-hot);
    box-shadow:inset 0 2px 5px rgb(0 0 0 / .7), inset 0 -1px 0 var(--dp-lamp-bloom),
      inset 1px 0 0 rgb(0 0 0 / .4), inset -1px 0 0 rgb(0 0 0 / .4), 0 0 12px var(--dp-lamp-bloom-soft);
  }
  #hud .sf-pslot[data-state="armed"] .fh-glyph .accent { fill:var(--dp-lamp); }
  #hud .sf-pslot[data-state="armed"] .sf-pslot__name { color:var(--dp-ink); }
  #hud .sf-pslot[data-state="cooling"] { opacity:.86; }
  #hud .sf-pslot[data-state="cooling"] .sf-pslot__art { opacity:.6; }
  #hud .sf-pslot[data-state="unaffordable"] { opacity:.62; }
  #hud .sf-pslot[data-state="unaffordable"] .sf-pslot__art { opacity:.4; }
  #hud .sf-pslot[data-state="locked"] { box-shadow:inset 0 2px 5px rgb(0 0 0 / .78), inset 1px 0 0 rgb(0 0 0 / .4), inset -1px 0 0 rgb(0 0 0 / .4); }
  #hud .sf-pslot[data-state="locked"] .sf-pslot__art { opacity:.36; }
  #hud .sf-pslot[data-state="empty"] { background:var(--dp-metal-0); }
  #hud .sf-pslot[data-state="empty"] .sf-pslot__art { opacity:.22; }
  #hud .sf-prail[data-claimed] .sf-pslot__name { color:var(--dp-lamp); }

  /* --- radar: the instrument binnacle — a machined ring, dark lens, warm rose --- */
  #hud .sf-kit-radar__bezel {
    background:radial-gradient(circle at 50% 34%, var(--dp-metal-3), var(--dp-metal-1) 58%, var(--dp-metal-0) 100%);
    border:0; border-radius:50%;
    box-shadow:var(--dp-plate-bevel-raised);
  }
  #hud .sf-kit-radar__face {
    background:radial-gradient(circle at 50% 38%, rgb(0 0 0 / .24), rgb(0 0 0 / .5) 76%);
    background-image:none; border-radius:50%;
    box-shadow:inset 0 2px 8px rgb(0 0 0 / .7), inset 0 -1px 0 rgb(255 232 190 / .06);
  }
  #hud .sf-kit-radar__n { filter:none; }

  /* --- integrity: quiet while the hull is whole, steps forward the moment it is not. The speed
         reading is the deck's display numeral; a healthy hull must not out-shout it. --- */
  /* Only the figures scale — the legends (HULL, %, STABLE) keep the 12 px type floor. */
  #hud .sf-integrity .sf-integrity__figures {
    transform-origin:0 100%; transition:transform var(--dp-d-settle) var(--dp-ease-snap);
  }
  #hud .sf-integrity[data-hull="stable"] .sf-integrity__figures { transform:scale(.7); fill:var(--dp-ink-dim); }
  #hud .sf-integrity[data-hull="stable"] .sf-integrity__percent { right:auto; left:59%; }
  @media (prefers-reduced-motion:reduce) { #hud .sf-integrity .sf-integrity__figures { transition:none; } }
  html.sf-reduce-motion #hud .sf-integrity .sf-integrity__figures { transition:none; }

  /* --- right dock: roster, target card, sector law --- */
  #hud .sf-overview { overflow:hidden; }
  #hud .sf-radar-objective-key { white-space:pre; overflow:hidden; text-overflow:ellipsis; }
  #hud .sf-overview-row { border-bottom:1px solid var(--dp-metal-3); transition:background var(--dp-d-cut) var(--dp-ease-lamp); }
  #hud .sf-overview-row:hover { background:rgb(242 185 80 / .09); }
  #hud .sf-overview-row__name { color:var(--hud-paper); }
  #hud .sf-overview-row__right, #hud .sf-overview-row__detail,
  #hud .sf-overview-row__state, #hud .sf-overview-row__tier, #hud .sf-overview-footer { color:var(--hud-muted); }
  /* Collapsed roster: the count line (no instrument title — j07 contract). An etched contact
     diamond, the radar's own mark, sits before the reading so "24" reads as a scope count. */
  #hud .sf-overview--count .sf-overview-footer {
    display:flex; align-items:center; justify-content:center; gap:9px; width:100%;
    box-sizing:border-box; padding:0 12px; color:var(--dp-lamp-hot); font-variant-numeric:tabular-nums;
  }
  #hud .sf-overview--count .sf-overview-footer::before {
    content:""; flex:0 0 auto; width:6px; height:6px; transform:rotate(45deg);
    border:1.5px solid var(--dp-ink-dim); box-shadow:0 1px 0 rgb(0 0 0 / .6);
  }
  #hud .sf-target { padding:10px 12px; border-radius:var(--dp-r-instrument); box-shadow:var(--dp-plate-bevel-raised); }
  #hud .sf-target__name { color:var(--hud-paper); text-shadow:0 0 10px var(--dp-lamp-bloom-soft); }
  #hud .sf-target__faction, #hud .sf-target__meta, #hud .sf-target__dist,
  #hud .sf-target__identity, #hud .sf-target__intent, #hud .sf-target__tri-label,
  #hud .sf-target__tri-layer, #hud .sf-tri__k, #hud .sf-target__threat-word { color:var(--hud-muted); }
  #hud .sf-target__dist { color:var(--dp-lamp-hot); }
  #hud .sf-target__rangebar { background-color:var(--dp-metal-0); background-image:var(--dp-channel-img); box-shadow:var(--dp-channel-bevel); border-radius:var(--dp-r-plate); }
  #hud .sf-target__rangefill { background:linear-gradient(180deg, var(--dp-lamp-hot), var(--dp-lamp) 55%, var(--dp-lamp-dim)); box-shadow:0 0 6px var(--dp-lamp-bloom); }
  #hud #sf-sector-law { padding:10px 12px; }
  #hud .sf-law__head, #hud .sf-law__meta, #hud .sf-law__detail, #hud .sf-law__jurisdiction { color:var(--hud-muted); }
  #hud .sf-law__headline { color:var(--hud-paper); }
  #hud #sf-sector-law.sf-law--entry .sf-law__detail { display:none; }
  #hud #sf-sector-law .sf-law__head { font-family:var(--dp-face-etch); font-variation-settings:"wght" 700, "wdth" 62; letter-spacing:.16em; text-shadow:var(--dp-etch-shadow); }

  /* --- left contextual column: mission, nav, comms tape, first-use --- */
  #hud .sf-mission-tracker { padding:8px 12px 9px; border-left:2px solid var(--dp-lamp); }
  #hud .sf-mt-title { border-bottom-color:var(--dp-metal-3); color:var(--dp-lamp); }
  #hud .sf-mt-obj { color:var(--hud-paper); }
  #hud .sf-mt-time { color:var(--hud-muted); }
  #hud .sf-nav-readout { padding:8px 12px; }
  #hud .sf-nav-label { color:var(--hud-paper); }
  #hud .sf-nav-meta { color:var(--hud-muted); }
  #hud .sf-obj { color:var(--hud-paper); }
  #hud .sf-commtape {
    padding:5px 2px 6px; border-bottom:0; border-radius:0;
    background-color:transparent; background-image:none;
    box-shadow:inset 0 -1px 0 var(--dp-metal-4), inset 0 -2px 0 rgb(0 0 0 / .5);
  }
  #hud .sf-commtape__band, #hud .sf-commtape .sf-comm-backlog-btn, #hud .sf-commtape .sf-contact-hail__button {
    font-family:var(--dp-face-etch); font-variation-settings:"wght" 700, "wdth" 62; letter-spacing:.14em;
    text-transform:uppercase; text-shadow:var(--dp-etch-shadow), 0 0 6px rgb(0 0 0 / .8);
  }
  #hud .sf-commtape__band, #hud .sf-commtape .sf-comm-backlog-btn,
  #hud .sf-commtape .sf-contact-hail__button, #hud .sf-commtape .sf-fx-comms-trace__wave {
    color:var(--hud-muted);
  }
  #hud .sf-commtape .sf-comm-backlog-btn:hover, #hud .sf-commtape .sf-contact-hail__button:hover { color:var(--dp-lamp-hot); }
  #hud .sf-news-ticker { color:var(--hud-paper); }
  #hud .sf-firstuse { color:var(--hud-paper); }

  /* --- command deck readouts: etched keys, lamp-lit values --- */
  #hud .sf-stat__k { color:var(--dp-ink-mute); text-shadow:var(--dp-etch-shadow); }
  #hud .sf-stat__v { color:var(--dp-lamp-hot); text-shadow:0 0 10px var(--dp-lamp-bloom-soft); }
  #hud .sf-tchip__verb, #hud .sf-tchip__hint, #hud .sf-tchip { color:var(--hud-muted); }
  #hud .sf-tchip__bind { color:var(--hud-paper); }
  /* The weapon readout is the speed instrument's nameplate: same width, bolted under it, so the
     two read as one unit of hardware instead of a caption floating in space. */
  #hud #sf-wpnstat {
    flex:0 0 calc(284px * clamp(.86, var(--k-s, 1), 1.15)); box-sizing:border-box;
    /* Reading sits beside its legend, not at the far end: the deck's plate is allowed to tuck its
       right edge under the rail's bracket (see .sf-command-deck max-width), and at 2560x1080 a
       right-aligned reading landed exactly under it. */
    justify-content:flex-start; gap:14px; margin-top:0; padding:5px 12px 6px;
    background-color:var(--dp-metal-1); background-image:var(--dp-plate-img);
    border-radius:0 0 var(--dp-r-instrument) var(--dp-r-instrument); box-shadow:var(--dp-plate-bevel);
  }
  #hud #sf-wpnstat .sf-stat__k {
    font-family:var(--dp-face-etch); font-variation-settings:"wght" 700, "wdth" 62;
    font-size:var(--dp-fs-etch); letter-spacing:.18em; text-transform:uppercase;
  }
  #hud #sf-wpnstat .sf-stat__v { font-size:var(--dp-fs-data); font-weight:700; letter-spacing:.06em; text-transform:uppercase; }

  /* --- comms band key: a raised machined key, not a caption --- */
  #hud .sf-band-hud__button {
    background-color:var(--dp-metal-2); background-image:var(--dp-plate-img);
    border:0; border-radius:var(--dp-r-instrument); box-shadow:var(--dp-plate-bevel-raised);
    min-width:0; padding:7px 14px;
    font-family:var(--dp-face-etch); font-variation-settings:"wght" 700, "wdth" 62;
    letter-spacing:.16em; color:var(--dp-ink-dim); text-shadow:var(--dp-etch-shadow);
    transition:color var(--dp-d-cut) var(--dp-ease-lamp), box-shadow var(--dp-d-cut) var(--dp-ease-lamp);
  }
  #hud .sf-band-hud__button[data-off="true"] { color:var(--dp-ink-mute); }
  #hud .sf-band-hud__button:hover, #hud .sf-band-hud__button:focus-visible {
    color:var(--dp-lamp-hot); background-color:var(--dp-metal-2);
    box-shadow:var(--dp-plate-bevel-raised), 0 0 0 2px var(--dp-lamp);
  }

  /* --- onboarding card lives in a stylesheet injected later; the plate re-stated at ID weight --- */
  #hud #sf-onboarding .sf-ob-card,
  #sf-onboarding .sf-ob-card {
    box-sizing:border-box;
    background-color:var(--dp-metal-1) !important;
    background-image:var(--dp-plate-img) !important;
    border:0 !important;
    border-radius:var(--dp-r-instrument) !important;
    box-shadow:var(--dp-plate-bevel-raised) !important;
    padding:10px 12px !important;
  }
  #hud #sf-onboarding .sf-ob-title { color:var(--hud-paper); }
  #hud #sf-onboarding .sf-ob-hint, #hud #sf-onboarding .sf-ob-flavor { color:var(--hud-muted); }
  #hud #sf-onboarding .sf-ob-progress { color:var(--dp-lamp); }

  /* --- aim reticle: the gunsight is the lamp, not a stray blue. CSS paint outranks the SVG's
         presentation attributes (uiRoot.js RETICLE_SVG), so the art stays one shared source.
         Hit confirm keeps its three distinct scales (styles/ui.css) and moves onto the ramp:
         shield = bone ink (deflected), hull = the lamp driven red, kill = the filament core. --- */
  #aim-reticle .sf-reticle-shape { stroke:var(--dp-lamp); }
  #aim-reticle > svg > circle { fill:var(--dp-lamp-hot); }
  #aim-reticle > svg { filter:drop-shadow(0 0 3px var(--dp-lamp-bloom-soft)); }
  #aim-reticle[data-hit="shield"] .sf-reticle-hit-ticks { stroke:var(--dp-ink); filter:drop-shadow(0 0 3px rgb(232 226 212 / .4)); }
  #aim-reticle[data-hit="hull"] .sf-reticle-hit-ticks { stroke:var(--dp-danger); filter:drop-shadow(0 0 4px var(--dp-danger-bloom)); }
  #aim-reticle[data-hit="kill"] .sf-reticle-hit-ticks { stroke:var(--dp-lamp-hot); filter:drop-shadow(0 0 7px var(--dp-lamp-bloom)); }
  #aim-reticle[data-hit="kill"] > svg > circle:last-of-type { fill:var(--dp-lamp-hot); }

  /* --- world marks near the reticle ride the lamp ramp --- */
  #hud .sf-lockring .sf-lockring__fill { stroke:var(--dp-lamp); }
  #hud .sf-lockring .sf-lockring__track { stroke:var(--dp-metal-4); }
  #hud .sf-lockring__label { color:var(--hud-paper); }
  #hud .sf-lockdiamond__inner { border-color:var(--dp-lamp); }
  #hud .sf-leadpip__full, #hud .sf-leadpip__arc, #hud .sf-leadpip__tick { stroke:var(--dp-lamp); }
  #hud .sf-gravity-mark__ring { border-color:var(--hud-paper); }
  #hud .sf-gravity-mark__core { background:var(--hud-paper); }
  #hud .sf-gravity-mark__label, #hud .sf-momentum-sink__label { color:var(--hud-paper); }
  #hud .sf-objarrow--onscreen .sf-objarrow__glyph { border-color:var(--hud-paper); background:var(--k-signal); }
  #hud .sf-objarrow__label { padding:4px 9px; }

  /* --- alerts and receipts: one machined strip each (the annunciator's plate) --- */
  .sf-alert { padding:7px 18px; }
  .sf-alert.sf-alert--floor {
    padding:4px 14px; font-size:var(--dp-fs-data); font-weight:500; letter-spacing:.02em;
    color:var(--dp-ink-dim); background-color:var(--dp-metal-1); box-shadow:var(--dp-plate-bevel);
  }
  .sf-alert--dock { padding:9px 24px; }
  .sf-toast { padding:6px 10px; }

  /* ══ WAVE 1 STRUCTURE (FRONTEND_PROGRAM 2026-09-19) — fewer, bigger instruments ═════════════
     Both independent critics asked for the same three things: one instrument cluster instead of
     eight boxes, a channel reserved for threat, and material that differs by function. The
     cluster is a heavy machined chassis (deckplate hardware: bezel.svg + brushed gunmetal) whose
     instruments are glass windows; the comms column is ONE glass strip, top-left; the threat lamp
     is a lens set into the chassis. Amber (the lamp) stays on what the pilot acts on — speed,
     objective, aim, armed sockets; information reads in bone; red is threat only. ════════════ */

  /* the instrument cluster: bottom-left anchor, one chassis, one baseline */
  html #hud:has(.sf-cluster-chassis) > .sf-leftstack {
    width:auto; max-width:none;
    left:calc(14px * var(--k-s, 1) + var(--sf-safe-inset-x, 0px));
    bottom:calc(14px * var(--k-s, 1));
  }
  /* THE CLUSTER PLATE IS DEAD (ONE_PHOTOGRAPH section 4.9 -- "the object the owner named twice").
     It was a 624x360 bezelled slab of opaque gunmetal bolted over the live sim: the single
     largest object on the screen the player looks at most, and it was furniture, not information.
     Nothing in it changes the world, so by section 4.2 none of it is mass. The chassis survives
     only as a layout container -- same children, same order, same geometry -- with no face. */
  #hud .sf-cluster-chassis {
    position:relative; display:flex; align-items:stretch; gap:calc(14px * var(--k-s, 1));
    box-sizing:border-box; width:max-content; max-width:calc(100vw - 28px);
    border:0; background:none; box-shadow:none;
    padding:0; pointer-events:auto;
  }
  @media (max-width:1759px) {
    #hud .sf-cluster-chassis { flex-direction:column; }
  }
  /* Instruments are LIGHT now, not glass windows seated in a chassis. A card around a reading is
     a smaller version of the plate that just died. */
  #hud .sf-cluster-chassis > .sf-bars {
    margin:0; max-width:272px; border-radius:0;
    background:none; box-shadow:none;
  }
  #hud .sf-cluster-chassis > .sf-command-deck {
    position:static; left:auto; right:auto; bottom:auto; transform:none;
    flex:0 0 auto; width:calc(284px * clamp(.86, var(--k-s, 1), 1.15)); max-width:none; min-width:0;
    margin:0; padding:0; align-self:stretch;
    display:flex; flex-direction:column; justify-content:flex-end;
  }
  /* Contextual chips (cargo, credits, class) are invisible at rest but used to hold their width,
     which stretched the chassis across the screen; inside the cluster they leave layout until shown. */
  #hud .sf-cluster-chassis .sf-stat--chip:not(.sf-chip-show) { display:none; }
  #hud .sf-cluster-chassis .sf-kit-gauge.sf-speed {
    background:none; box-shadow:none; border-radius:0;
  }
  #hud .sf-cluster-chassis .sf-cluster { justify-content:flex-start; }

  /* the threat lamp: a lens set into the chassis's top ring, legend etched beside it.
     clear = a dark lens; contact = the lamp driven red, dim and steady; near = full red, beating.
     Brightness differs at every step, so the state never rests on hue alone. */
  #hud .sf-threat-lamp {
    position:absolute; top:-12px; right:18px; display:flex; align-items:center; gap:7px; pointer-events:none;
  }
  #hud .sf-threat-lamp::after {
    content:"THREAT"; font-family:var(--dp-face-etch); font-variation-settings:"wght" 750, "wdth" 62;
    font-size:12px; letter-spacing:.2em; color:var(--dp-ink-mute); text-shadow:var(--dp-etch-shadow);
  }
  #hud .sf-threat-lamp__lens {
    display:block; width:10px; height:10px; border-radius:50%;
    background:radial-gradient(circle at 40% 35%, #3a1a15, #140807 70%);
    box-shadow:inset 0 1px 2px rgb(0 0 0 / .8), 0 0 0 1.5px #06080a, 0 1px 0 1.5px rgb(255 236 204 / .12);
  }
  #hud[data-threat="contact"] .sf-threat-lamp__lens {
    background:radial-gradient(circle at 40% 35%, var(--dp-danger-hot), var(--dp-danger) 45%, #5c140c);
    box-shadow:0 0 6px rgb(255 80 56 / .3), 0 0 0 1.5px #06080a;
  }
  #hud[data-threat="contact"] .sf-threat-lamp::after { color:var(--dp-ink-dim); }
  #hud[data-threat="near"] .sf-threat-lamp__lens {
    background:radial-gradient(circle at 40% 35%, #fff1ea, var(--dp-danger-hot) 30%, var(--dp-danger) 70%);
    box-shadow:0 0 10px var(--dp-danger-bloom), 0 0 22px rgb(255 80 56 / .3), 0 0 0 1.5px #06080a;
    animation:sf-threat-beat 1.1s steps(1, end) infinite;
  }
  #hud[data-threat="near"] .sf-threat-lamp::after { color:var(--dp-danger-hot); }
  @keyframes sf-threat-beat { 0%, 60% { opacity:1; } 61%, 100% { opacity:.45; } }
  @media (prefers-reduced-motion:reduce) { #hud[data-threat="near"] .sf-threat-lamp__lens { animation:none; } }
  html.sf-reduce-motion #hud[data-threat="near"] .sf-threat-lamp__lens { animation:none; }

  /* the expanded roster: rows on glass; hover and selection are an edge light, never a wash */
  #hud .sf-overview-row {
    position:relative; border-bottom:1px solid rgb(255 255 255 / .04); border-left:0;
    padding-left:14px; background:none;
  }
  #hud .sf-overview-row:hover { background:linear-gradient(90deg, rgb(255 255 255 / .05), transparent 70%); }
  #hud .sf-overview-row.selected {
    background:linear-gradient(90deg, rgb(255 255 255 / .05), transparent 70%);
    box-shadow:inset 3px 0 0 var(--dp-lamp), 0 8px 14px -12px var(--dp-lamp-bloom);
  }
  #hud .sf-overview-row__name { color:var(--dp-ink); font-weight:600; }
  #hud .sf-overview-row.selected .sf-overview-row__name { color:var(--dp-lamp-hot); text-shadow:var(--dp-emit-lamp); }
  #hud .sf-overview-row__detail { color:var(--dp-ink-mute); font-style:normal; letter-spacing:.04em; }
  #hud .sf-overview-row.unscanned .sf-overview-row__name { color:var(--dp-ink-dim); }

  /* the world-anchored tow mark stays (it names WHICH body the line would take), but quietly:
     the tether's state now lives in the cluster's fire-control strip */
  #sf-ml2 .ml2-preview-mark { color:var(--dp-lamp); }
  #sf-ml2 .ml2-preview { color:var(--dp-ink-dim); border-color:rgb(242 185 80 / .35); }

  /* the threat ring: red bearing arcs around the ship, visible only while a hostile is near */
  #hud .sf-threat-ring {
    position:absolute; left:50%; top:50%; width:120px; height:120px; margin:-60px 0 0 -60px;
    pointer-events:none; opacity:0; transition:opacity var(--dp-d-settle) var(--dp-ease-lamp);
  }
  #hud[data-threat="near"] .sf-threat-ring { opacity:1; }
  #hud .sf-threat-ring svg { display:block; width:100%; height:100%; overflow:visible; }
  #hud .sf-threat-ring__arc {
    fill:none; stroke:var(--dp-danger); stroke-width:3.5; stroke-linecap:round;
    filter:drop-shadow(0 0 4px rgb(255 80 56 / .6));
  }
  @media (prefers-reduced-motion:reduce) { #hud .sf-threat-ring { transition:none; } }
  @media (forced-colors:active) { #hud .sf-threat-ring__arc { stroke:CanvasText; filter:none; } }

  /* the comms strip: ONE glass panel, top-left; it disappears when every section is hidden */
  #hud > .sf-leftcontext {
    position:absolute; left:calc(14px * var(--k-s, 1) + var(--sf-safe-inset-x, 0px)); top:calc(18px * var(--k-s, 1));
    width:calc(292px * clamp(.9, var(--k-s, 1), 1.15)); max-width:calc(100vw - 28px);
    display:flex; flex-direction:column; gap:0; box-sizing:border-box; pointer-events:auto;
    box-shadow:0 10px 24px rgb(0 0 0 / .45), var(--dp-glass-depth);
    padding:4px 0;
  }
  #hud > .sf-leftcontext:not(:has(> :not([hidden], [style*="display: none"], [style*="display:none"]))) { display:none; }
  /* sections inside the strip are not plates: flush, separated by an etched hairline */
  #hud > .sf-leftcontext > *,
  #hud > .sf-leftcontext #sf-onboarding .sf-ob-card {
    background:none !important; background-image:none !important; box-shadow:none !important;
    border:0 !important; border-radius:0 !important; margin:0 !important; max-width:none !important;
  }
  #hud > .sf-leftcontext > * { padding:8px 12px !important; }
  #hud > .sf-leftcontext > * + * { border-top:1px solid rgb(255 255 255 / .045) !important; box-shadow:inset 0 1px 0 rgb(0 0 0 / .55) !important; }
  #hud > .sf-leftcontext #sf-onboarding .sf-ob-card { padding:0 !important; }
  #hud > .sf-leftcontext > .sf-mission-tracker { border-left:0 !important; position:relative; padding-left:18px !important; }
  #hud > .sf-leftcontext > .sf-mission-tracker::before {
    content:""; position:absolute; left:6px; top:10px; bottom:10px; width:3px; border-radius:1px;
    background:var(--dp-lamp); box-shadow:0 0 8px var(--dp-lamp-bloom);
  }

  /* the speed column starts level with integrity: fire control on top, speed, the nameplate */
  #hud .sf-cluster-chassis > .sf-command-deck { justify-content:flex-start; gap:6px; }
  /* the speed reading keeps its size, not the lamp: it is information, so it glows cool bone */
  #hud .sf-cluster-chassis .sf-speed .sf-speed__digits { color:var(--dp-ink); filter:drop-shadow(0 0 8px rgb(205 222 255 / .2)); }

  /* fire control: TARGET and TETHER rows on glass, each with its LED */
  #hud .sf-fc-strip {
    display:flex; flex-direction:column; gap:1px; padding:5px 10px 6px; border-radius:2px;
    background:none;  }
  #hud .sf-fc-row { display:grid; grid-template-columns:7px auto minmax(0, 1fr) auto; align-items:center; gap:8px; min-height:22px; }
  #hud .sf-fc-led {
    display:block; width:7px; height:7px; border-radius:50%;
    background:radial-gradient(circle at 42% 36%, #3b352c, #17140f 70%);
    box-shadow:inset 0 1px 1.5px rgb(0 0 0 / .85), 0 0 0 1px rgb(0 0 0 / .6);
  }
  #hud .sf-fc-k {
    font-family:var(--dp-face-etch); font-variation-settings:"wght" 720, "wdth" 62; font-size:12px;
    letter-spacing:.18em; text-transform:uppercase; color:var(--dp-ink-mute); text-shadow:var(--dp-etch-shadow);
  }
  #hud .sf-fc-v {
    min-width:0; overflow:hidden; text-overflow:ellipsis; white-space:nowrap;
    font-family:var(--dp-face-read); font-size:13px; font-weight:650; color:var(--dp-ink); text-shadow:var(--dp-emit);
  }
  #hud .sf-fc-r { font-family:var(--dp-face-read); font-variant-numeric:tabular-nums; font-size:12px; color:var(--dp-ink-dim); }
  /* An absent reading is QUIET, not invisible: --dp-ink-mute measured 3.37:1 against the
     composited frame. Floor raised, tier gap kept (scripts/ui-contrast.mjs). */
  #hud .sf-fc-row[data-state="none"] .sf-fc-v, #hud .sf-fc-row[data-state="idle"] .sf-fc-v,
  #hud .sf-fc-row[data-state="clear"] .sf-fc-v,
  #hud .sf-fc-row[data-state="blocked"] .sf-fc-v { color:#c2cfdb; font-weight:500; text-shadow:0 1px 0 rgb(0 0 0 / .75); }
  #hud .sf-fc-row:is([data-state="locked"], [data-state="ready"], [data-state="latched"]) .sf-fc-led {
    background:radial-gradient(circle at 42% 34%, #fff6df 0%, var(--dp-lamp-hot) 22%, var(--dp-lamp) 55%, var(--dp-lamp-dim) 100%);
    box-shadow:0 0 6px var(--dp-lamp-bloom), 0 0 14px var(--dp-lamp-bloom-soft);
  }
  #hud .sf-fc-row[data-state="latched"] .sf-fc-v { color:var(--dp-lamp-hot); text-shadow:var(--dp-emit-lamp); }
  #hud .sf-fc-row:is([data-state="hostile"], [data-state="strain"]) .sf-fc-led {
    background:radial-gradient(circle at 42% 34%, #fff1ea, var(--dp-danger-hot) 26%, var(--dp-danger) 60%, #6b1a10);
    box-shadow:0 0 8px var(--dp-danger-bloom);
  }
  #hud .sf-fc-row:is([data-state="hostile"], [data-state="strain"]) .sf-fc-v { color:var(--dp-danger-hot); text-shadow:0 0 10px var(--dp-danger-bloom); }

  /* integrity: bone while whole — the shield ring, shield rail, state word and the hull glyph are
     information. The glyph warms to the lamp when damaged and burns red when critical, so the
     Kestrel silhouette IS the damage display. The decorative chevrons carried no reading. */
  html #hud .sf-schematic.sf-integrity { --si-signal:var(--dp-ink); --si-blue:var(--dp-ink-dim); }
  /* ...but the state word and the big figure are the state, and they step forward the moment the
     hull goes critical: quiet-while-whole must not mute the alarm itself. The offline word shares
     the amber the break marks on the envelope already carry. */
  html #hud .sf-schematic.sf-integrity:is([data-hull="critical"], [data-hull="destroyed"]) { --si-signal:var(--dp-danger-hot); }
  #hud .sf-integrity .sf-integrity__gradient-edge { stop-color:#6f6a5f; }
  #hud .sf-integrity .sf-integrity__gradient-core { stop-color:#e9e2d2; }
  #hud .sf-integrity[data-hull="damaged"] .sf-integrity__gradient-edge { stop-color:var(--dp-lamp-dim); }
  #hud .sf-integrity[data-hull="damaged"] .sf-integrity__gradient-core { stop-color:var(--dp-lamp-hot); }
  #hud .sf-integrity:is([data-hull="critical"], [data-hull="destroyed"]) .sf-integrity__gradient-edge { stop-color:var(--dp-danger); }
  #hud .sf-integrity:is([data-hull="critical"], [data-hull="destroyed"]) .sf-integrity__gradient-core { stop-color:var(--dp-danger-hot); }
  /* the radar's north mark was the brightest mark on the scope; it is a bearing, not a signal */
  #hud .sf-kit-radar__n { opacity:.55; filter:sepia(.5) saturate(.6); }

  /* the right dock's readouts are the same glass as the comms strip (the radar keeps its round
     binnacle): one material per function, left and right */
  #hud #sf-sector-law, #hud .sf-overview, #hud .sf-target, #hud .sf-cargo-panel {
    box-shadow:0 10px 24px rgb(0 0 0 / .45), var(--dp-glass-depth);
    border-radius:0;
  }
  /* An instrument with no reading is not a hole in the deck. These four wear a bezel and a glass
     face, and the bezel drew whether or not anything was behind it — so with no contacts the
     overview strip sat on the flight deck as a 276x40 empty black bar, which the bench reports as
     EMPTY BOX and a player reads as something broken. An empty instrument leaves the deck. */
  #hud :is(#sf-sector-law, .sf-overview, .sf-target, .sf-cargo-panel):empty { display:none; }
  #hud .sf-overview--count { padding:6px 10px; }

  /* option B: information reads in bone; the lamp stays on what the pilot acts on */
  #hud .sf-kit-seg.is-on {
    background:linear-gradient(180deg, #f3eee2 0%, #d2c9b5 55%, #948c7b 100%);
    box-shadow:0 0 5px rgb(232 226 212 / .22), inset 0 1px 0 rgb(255 255 255 / .45);
  }
  #hud .sf-kit-bar > .sf-bar__fill { background:linear-gradient(180deg, #f3eee2, #d2c9b5 55%, #948c7b); }
  #hud .sf-integrity { --si-signal:var(--dp-ink); }
  #hud #sf-wpnstat .sf-stat__v { color:var(--dp-ink); text-shadow:none; }
  #hud .sf-overview--count .sf-overview-footer { color:var(--dp-ink); }
  #hud .sf-overview--count .sf-overview-footer[data-hostile="true"] { color:var(--dp-danger-hot); text-shadow:0 0 10px var(--dp-danger-bloom); }
  #hud .sf-overview--count .sf-overview-footer[data-hostile="true"]::before { border-color:var(--dp-danger); }

  /* ══ HUD PASS 5 — sleek glass in flight (critic, 2026-09-19): the flight layer loses the
     fasteners and scratches the menus keep; wells are smoked glass with a lit rim; the area
     around the ship is the glance instrument (threat arcs + the tether arc); no plate touches an
     edge; one legend voice in every instrument. ══ */
  /* (was the SECOND of three stacked chassis paints -- a thin bezel over brushed metal. The
     cluster plate is dead; see the register note above. Section 4.9.) */
  #hud .sf-threat-lamp { top:-11px; }
  #hud > .sf-leftcontext, #hud #sf-sector-law, #hud .sf-overview, #hud .sf-target, #hud .sf-cargo-panel {
  }
  /* the threat row: dark lens when clear, the lamp driven red with contacts, bright when near */
  #hud .sf-fc-row[data-state="contact"] .sf-fc-led { background:radial-gradient(circle at 42% 34%, var(--dp-danger-hot), var(--dp-danger) 45%, #5c140c); box-shadow:0 0 5px rgb(255 80 56 / .3); }
  #hud .sf-fc-row[data-state="near"] .sf-fc-led {
    background:radial-gradient(circle at 42% 34%, #fff1ea, var(--dp-danger-hot) 26%, var(--dp-danger) 60%, #6b1a10);
    box-shadow:0 0 8px var(--dp-danger-bloom), 0 0 16px rgb(255 80 56 / .3);
  }
  #hud .sf-fc-row[data-state="clear"] .sf-fc-v { color:var(--dp-ink-mute); font-weight:500; text-shadow:none; }
  #hud .sf-fc-row:is([data-state="contact"], [data-state="near"]) .sf-fc-v { color:var(--dp-danger-hot); text-shadow:0 0 10px var(--dp-danger-bloom); }
  #hud .sf-cluster-chassis .sf-kit-gauge.sf-speed { flex:0 0 auto; }
  #hud .sf-cluster-chassis .sf-fc-strip { flex:1 1 auto; justify-content:space-evenly; }
  /* The approach tape is invisible between approaches but held ~48px of the column open; it
     leaves layout until it lights. Stacked (narrow) clusters float it beside the chassis, so it
     lighting never grows the column into the comms strip. */
  #hud .sf-cluster-chassis .sf-vtape:not(.sf-vtape--on) { display:none; }
  @media (max-width:1759px) {
    #hud .sf-cluster-chassis .sf-vtape { position:absolute; left:calc(100% + 12px); bottom:calc(120px * var(--k-s, 1)); width:min(300px, 36vw); margin:0; }
  }
  /* contextual chips (cargo, credits, class) surface as nameplate rows under the weapon plate,
     in the same legend voice - never a loose caption in amber display type */
  #hud .sf-cluster-chassis .sf-stat--chip.sf-chip-show {
    display:flex; align-items:baseline; gap:14px; box-sizing:border-box; width:100%; min-width:0;
    padding:5px 12px 6px; margin:4px 0 0; border-radius:2px;
    background:none;  }
  #hud .sf-cluster-chassis .sf-stat--chip .sf-stat__k {
    font-family:var(--dp-face-etch); font-variation-settings:"wght" 700, "wdth" 62; font-size:12px;
    letter-spacing:.18em; text-transform:uppercase; color:var(--dp-ink-mute);
  }
  #hud .sf-cluster-chassis .sf-stat--chip .sf-stat__v {
    font-family:var(--dp-face-read); font-size:13px; font-weight:650; color:var(--dp-ink); text-shadow:none;
    min-width:0; overflow:hidden; text-overflow:ellipsis; white-space:nowrap;
  }
  /* the ring around the ship: a faint track, the tether's load filling in amber along the bottom */
  /* The ring circles the hull, not the reticle: the chase view draws the ship at a fixed share of
     the viewport height, so the ring is sized in vmin to clear the silhouette at every resolution.
     Strokes are in the 120-unit viewBox (x ~2.5 on screen). */
  #hud .sf-threat-ring {
    width:clamp(220px, 30vmin, 420px); height:clamp(220px, 30vmin, 420px); margin:0; transform:translate(-50%, -50%);
  }
  #hud .sf-threat-ring__arc { stroke-width:1.6; }
  #hud:is([data-tether="ready"], [data-tether="latched"], [data-tether="strain"]) .sf-threat-ring { opacity:1; }
  /* the halo: a hairline ring with four bearing ticks, so the arcs read as marks on one instrument */
  #hud .sf-threat-ring__halo { fill:none; stroke:rgb(232 226 212 / .09); stroke-width:.6; }
  #hud .sf-threat-ring__ticks { fill:none; stroke:rgb(232 226 212 / .24); stroke-width:.8; stroke-linecap:round; }
  #hud .sf-threat-ring__track { fill:none; stroke:rgb(232 226 212 / .14); stroke-width:1.1; stroke-linecap:round; opacity:0; }
  #hud:is([data-tether="ready"], [data-tether="latched"], [data-tether="strain"]) .sf-threat-ring__track { opacity:1; }
  #hud[data-tether="ready"] .sf-threat-ring__track { stroke:rgb(242 185 80 / .35); }
  #hud .sf-threat-ring__tether { fill:none; stroke:var(--dp-lamp); stroke-width:1.6; stroke-linecap:round; filter:drop-shadow(0 0 4px var(--dp-lamp-bloom)); }
  #hud[data-tether="strain"] .sf-threat-ring__tether { stroke:var(--dp-danger); filter:drop-shadow(0 0 4px var(--dp-danger-bloom)); }
  /* the contact count is engraved on the radar bezel, not a plate of its own */
  #hud .sf-overview.sf-overview--count {
    border:0; border-image:none; background:none; box-shadow:none; padding:0; margin-bottom:-22px; position:relative; z-index:3;
  }
  #hud .sf-overview--count .sf-overview-footer {
    font-family:var(--dp-face-etch); font-variation-settings:"wght" 760, "wdth" 70; font-size:12px; letter-spacing:.18em;
    text-transform:uppercase; text-shadow:var(--dp-etch-shadow);
  }
  /* no plate touches the screen edge: the dock and its radar caption stand off the bottom */
  #hud .sf-rightdock { padding-bottom:calc(10px * var(--k-s, 1)); }
  #hud .sf-radar-objective-key { margin-top:6px; position:relative; z-index:2; }
  /* the law card's jurisdiction line sets on one line in the condensed legend voice */
  #hud #sf-sector-law .sf-law__meta {
    font-family:var(--dp-face-etch); font-variation-settings:"wght" 650, "wdth" 68; letter-spacing:.06em;
  }
  /* one legend voice inside the speed instrument: condensed etched caps, readings in bone */
  #hud .sf-speed :is(.sf-speed__label, .sf-speed__reference, .sf-speed__unit, .sf-speed__extent, .sf-speed__zero) {
    font-family:var(--dp-face-etch); font-variation-settings:"wght" 720, "wdth" 68; letter-spacing:.14em;
    text-transform:uppercase; color:var(--dp-ink-mute);
  }
  #hud .sf-speed .sf-speed__reference b { color:var(--dp-ink); }
  /* at 1280 the comms strip must stop short of the stacked cluster, whatever the log holds */
  #hud > .sf-leftcontext {
    max-height:calc(100vh - var(--sf-cluster-h, 0px) - 44px * var(--k-s, 1)); overflow:hidden; padding-top:0;
  }
  /* what to do now reads first: the tracked objective and its nav line head the strip, the
     status, band and log follow (a short screen clips the log, never the objective) */
  #hud > .sf-leftcontext > :is(.sf-mission-tracker, .sf-objectives, .sf-nav-readout) { order:-1; }
  #hud > .sf-leftcontext > * { border-top:1px solid rgb(255 255 255 / .045) !important; box-shadow:inset 0 1px 0 rgb(0 0 0 / .55) !important; }
  /* a short, narrow screen stacks the cluster: tighten it so it and the strip both fit 720 */
  @media (max-width:1759px) and (max-height:820px) {
    #hud .sf-cluster-chassis { gap:5px; }
    #hud .sf-cluster-chassis > .sf-bars { max-width:236px; }
    #hud .sf-cluster-chassis > .sf-command-deck { gap:4px; }
    #hud .sf-cluster-chassis .sf-fc-row { min-height:20px; }
    #hud .sf-cluster-chassis .sf-fc-strip { padding:3px 10px 4px; }
  }
  /* the world tow tag names WHICH body; mass keeps its unit case, READY lights amber */
  html #sf-ml2 .ml2-preview { text-transform:none; letter-spacing:.06em; background:rgb(8 11 16 / .84); border-color:rgb(232 226 212 / .16); }
  html #sf-ml2 .ml2-preview.ml2-preview-ready { color:var(--dp-lamp-hot); border-color:rgb(242 185 80 / .6); }

  /* ══ PQ-210.05 — hardware, not a web page (2026-09-20)
     PASS 6 remapped every glass face onto translucent smoke and hid the threat lamp, so the
     cluster read as a CSS overlay. Structure is machined metal (bezel.svg + brushed gunmetal);
     displays are smoked-glass windows seated in it; amber marks what the pilot acts on; red is
     threat only. No backdrop-filter in flight. ══ */
  #hud { --sf-hud-edge:clamp(16px, 2.4vh, 32px); }
  /* THE THIRD stacked chassis paint, and the one that actually won the cascade: a dark well in a
     fastened ring, with screws. Three different slabs were declared for this one element in this
     one file -- each pass adding a fourth prototype instead of finishing the third. All three are
     gone. The chassis is a layout container; the readings are light (section 4.9). */
  #hud .sf-cluster-chassis {
    --sf-cluster-ring:0px;
    overflow:visible;
    border:0;
    background:none;
    box-shadow:none;
    padding:0;
  }
  #hud .sf-threat-lamp { display:flex; top:-14px; right:28px; gap:8px; z-index:2; }
  #hud .sf-threat-lamp__lens { width:12px; height:12px; }
  #hud .sf-cluster-chassis > .sf-bars,
  #hud .sf-cluster-chassis .sf-kit-gauge.sf-speed,
  #hud .sf-cluster-chassis .sf-fc-strip,
  #hud .sf-cluster-chassis .sf-stat--chip.sf-chip-show {
    background:none;  }
  #hud > .sf-leftcontext, #hud #sf-sector-law, #hud .sf-overview, #hud .sf-target, #hud .sf-cargo-panel {
  }
  /* Side readouts were still the thin bezel that reads as a CSS card next to the cluster.
     They take the same fastened ring as the instrument chassis. The contact count stays
     engraved on the scope and does not grow a second plate. */
  #hud > .sf-leftcontext,
  #hud #sf-sector-law,
  #hud .sf-target,
  #hud .sf-cargo-panel,
  #hud .sf-overview:not(.sf-overview--count) {
    border-radius:0;
  }
  #hud > .sf-leftcontext > :first-child {
    border-top:0 !important;
    box-shadow:none !important;
  }
  #hud #sf-wpnstat { background:none; box-shadow:none; }
  html #hud:has(.sf-cluster-chassis) > .sf-leftstack { left:calc(var(--sf-hud-edge) + var(--sf-safe-inset-x, 0px)); bottom:var(--sf-hud-edge); }
  #hud > .sf-leftcontext {
    left:calc(var(--sf-hud-edge) + var(--sf-safe-inset-x, 0px)); top:var(--sf-hud-edge);
    max-height:calc(100vh - var(--sf-cluster-h, 0px) - var(--sf-hud-edge) * 3);
  }
  #hud > .sf-leftcontext:has(> .sf-crun:not([hidden])) { display:flex !important; }
  #hud .sf-rightdock { right:calc(var(--sf-hud-edge) + var(--sf-safe-inset-x, 0px)); bottom:var(--sf-hud-edge); padding-bottom:0; }
  #hud .sf-prail { bottom:var(--sf-hud-edge); }
  #hud .sf-band-hud { top:var(--sf-hud-edge); right:calc(var(--sf-hud-edge) + var(--sf-safe-inset-x, 0px)); }
  /* a stacked (narrow) cluster is one column: every instrument takes the column's width */
  @media (max-width:1759px) {
    #hud .sf-cluster-chassis { width:calc(284px * clamp(.86, var(--k-s, 1), 1.15) + 42px); }
    #hud .sf-cluster-chassis > .sf-bars { max-width:none; width:auto; }
    #hud .sf-cluster-chassis > .sf-command-deck { width:auto; }
    #hud .sf-cluster-chassis .sf-schematic.sf-integrity { max-width:none; }
  }
  /* the contact count sits above the scope, clear of its north notch */
  #hud .sf-overview.sf-overview--count { margin-bottom:2px; }
  /* the power rail is a machined plate; the wells cut into it are the glass. A ready power's
     mark is bone (information); amber is what is armed or chosen. */
  #hud .sf-prail__slots {
    border:8px solid transparent;
    border-image:url("/assets/ui/deckplate/hw/bezel-thin.svg") 12 / 12px / 0 stretch;
    background:var(--dp-metal-layers), var(--dp-metal-1);
    box-shadow:var(--dp-plate-bevel-raised);
  }
  #hud .sf-pslot { background:linear-gradient(180deg, rgb(0 0 0 / .5), rgb(0 0 0 / .18) 60%, rgb(255 255 255 / .03)); }
  #hud .sf-kit-radar__bezel {
    border:14px solid var(--dp-metal-2);
    box-shadow:var(--dp-stand-off), inset 0 2px 0 rgb(255 236 204 / .16), inset 0 -3px 0 rgb(0 0 0 / .55);
  }
  /* a ready power is information (bone); amber is kept for what is armed or chosen, so the rail no
     longer lights a dozen amber marks at rest (critic round 3) */
  #hud .sf-pslot[data-state="ready"] .sf-pslot__art { color:var(--dp-ink); }
  #hud .sf-pslot[data-state="ready"] .sf-pslot__name { color:#cfdbe6; }
  #hud .sf-pslot__name { letter-spacing:.06em; }
  /* the radar's north mark is a small machined pointer on the rim, not a grey sprite pill */
  #hud .sf-kit-radar__n {
    width:0; height:0; top:10px; background:none;
    border-left:5px solid transparent; border-right:5px solid transparent; border-top:7px solid var(--dp-ink-dim);
  }
  /* every label on the flight glass is an etched legend at reading contrast */
  #hud .sf-ob-kicker > span:first-child, #hud .sf-comm__tag {
    font-family:var(--dp-face-etch); font-variation-settings:"wght" 720, "wdth" 72; letter-spacing:.16em; text-transform:uppercase; color:var(--dp-ink-dim);
  }
  /* the band key carries its lamp: dark when the band is off, lit when it is on; hover lights the
     legend, never an outer ring */
  #hud .sf-band-hud__button {
    padding-left:28px;
    background-image:radial-gradient(circle at 14px 50%, #3b352c 0, #17140f 3.5px, rgb(0 0 0 / .7) 4.5px, transparent 5px), var(--dp-plate-img);
  }
  #hud .sf-band-hud__button:not([data-off="true"]) {
    color:var(--dp-ink);
    background-image:radial-gradient(circle at 14px 50%, #fff6df 0, var(--dp-lamp-hot) 1.5px, var(--dp-lamp) 3.5px, rgb(242 185 80 / .35) 5px, rgb(242 185 80 / .12) 9px, transparent 12px), var(--dp-plate-img);
  }
  #hud .sf-band-hud__button:hover, #hud .sf-band-hud__button:focus-visible {
    box-shadow:var(--dp-plate-bevel-raised), 0 8px 16px -10px var(--dp-lamp-bloom); outline:0 solid transparent !important;
  }
  @media (forced-colors:active) { #hud .sf-band-hud__button:focus-visible { outline:2px solid Highlight !important; } }
  #hud .sf-pslot[data-state="ready"] .fh-glyph .accent { fill:var(--dp-lamp-hot); }
  #hud .sf-pslot:is([data-state="cooling"], [data-state="unaffordable"], [data-state="locked"], [data-state="empty"]) .sf-pslot__art { color:var(--dp-ink-dim); }
  /* alerts, toasts, the edge-arrow caption: the same flight glass, one lit rim */
  html .sf-alert, html .sf-alert.sf-alert--floor, html .sf-toast, html #hud .sf-objarrow__label, html #hud .sf-commtape {
    background:var(--dp-glass-flight); background-color:transparent;
    box-shadow:var(--dp-glass-depth), 0 10px 22px rgb(0 0 0 / .32);
  }
  /* an information line lights a bone lens; amber is for a warning the pilot must act on */
  html .sf-alert--info .dp-annunc__lens {
    background:radial-gradient(circle at 42% 34%, #fffaf0 0%, #d8d2c4 38%, transparent 72%);
    box-shadow:0 0 5px rgb(232 226 212 / .22), inset 0 -1px 1px rgb(0 0 0 / .35);
  }

  /* --- high contrast: the token remap (deckplate/tokens.js) flattens the plates; keep the
         surfaces opaque so the remapped ink keeps its ratio --- */
  html.sf-high-contrast #hud .sf-bars, html.sf-high-contrast #hud .sf-overview,
  html.sf-high-contrast #hud .sf-target, html.sf-high-contrast #hud .sf-mission-tracker,
  html.sf-high-contrast #hud .sf-nav-readout,   html.sf-high-contrast #hud #sf-sector-law,
  html.sf-high-contrast #hud .sf-commtape, html.sf-high-contrast #hud .sf-prail__slots,
  html.sf-high-contrast #hud .sf-pslot, html.sf-high-contrast #hud .sf-kit-gauge,
  html.sf-high-contrast #hud #sf-wpnstat, html.sf-high-contrast #hud .sf-band-hud__button,
  html.sf-high-contrast #hud .sf-cluster-chassis, html.sf-high-contrast #hud > .sf-leftcontext,
  html.sf-high-contrast .sf-alert, html.sf-high-contrast .sf-toast {
    background:rgb(0 0 0 / .95); background-image:none;
    border-color:rgb(255 255 255 / .85); box-shadow:none;
  }

  /* --- forced colours: the system palette owns the surface again --- */
  @media (forced-colors: active) {
    #hud .sf-bars, #hud .sf-overview, #hud .sf-target, #hud .sf-mission-tracker,
    #hud .sf-nav-readout, #hud #sf-sector-law, #hud .sf-cargo-panel, #hud .sf-commtape,
    #hud .sf-objarrow__label, #hud #sf-onboarding .sf-ob-card, #hud .sf-cluster-chassis,
    #hud > .sf-leftcontext, .sf-alert, .sf-toast {
      background:Canvas; background-image:none; border:1px solid CanvasText;
      box-shadow:none; border-radius:0; forced-color-adjust:none;
    }
    #hud .sf-prail__slots, #hud .sf-pslot, #hud .sf-bars .sf-bar.sf-kit-bar, #hud .sf-kit-bar {
      background:Canvas; background-image:none; border:1px solid CanvasText;
      box-shadow:none; forced-color-adjust:none;
    }
    #hud .sf-pslot[data-state="armed"] { background:Highlight; border:2px solid Highlight; }
    #hud .sf-kit-seg { background-color:Canvas; background-image:none; box-shadow:inset 0 0 0 1px GrayText; }
    #hud .sf-kit-seg.is-on { background-color:Highlight; box-shadow:none; }
    #hud .sf-kit-radar__bezel, #hud .sf-kit-radar__face {
      background:Canvas; border:1px solid CanvasText; box-shadow:none; filter:none; forced-color-adjust:none;
    }
    #hud .sf-kit-radar__n { display:none; }
    #hud .sf-kit-gauge {
      background:Canvas; border:1px solid CanvasText; box-shadow:none; border-radius:0;
      filter:none; forced-color-adjust:none;
    }
    #hud .sf-kit-gauge__arc { background:none; filter:none; -webkit-mask-image:none; mask-image:none; }
    #hud .sf-kit-gauge__needle, #hud .sf-kit-gauge__num { color:CanvasText; text-shadow:none; }
    #hud .sf-sch-ship--fill .sf-sch-hull { fill:none; }
    #hud #sf-wpnstat { background:Canvas; background-image:none; border:1px solid CanvasText; box-shadow:none; forced-color-adjust:none; }
    #hud .sf-band-hud__button { background:ButtonFace; background-image:none; color:ButtonText; border:1px solid ButtonText; box-shadow:none; }
    #hud .sf-band-hud__button:focus-visible { outline:2px solid Highlight; outline-offset:2px; }
    #aim-reticle .sf-reticle-shape { stroke:CanvasText; }
    #aim-reticle > svg > circle { fill:CanvasText; }
  }
  `;
  document.head.appendChild(s);
}
