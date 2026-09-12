// The production flight stylesheet, isolated from system imports for genuine presentation tests.
// uiRoot invokes this same one-time style owner; no copied CSS or substitute runtime.
import { bracketCss } from '../hudBrackets.js';
const HUD_STYLE_ID = 'sf-hud-style';

export function injectHudCss() {
  if (document.getElementById(HUD_STYLE_ID)) return;
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
    pointer-events:none; z-index:14; opacity:0;
    transition:opacity .15s ease; }
  .sf-lockring.active { display:block; opacity:1; }
  .sf-lockring.sf-lockring--latch { animation:sf-lockring-latch 160ms cubic-bezier(.2,.7,.2,1) 1; }
  .sf-lockring .sf-lockring__track { fill:none; stroke:var(--k-hair); stroke-width:2.5; }
  .sf-lockring .sf-lockring__fill { fill:none; stroke:var(--hud-cyan); stroke-width:3;
    stroke-linecap:round; transition:stroke .15s ease; }
  .sf-lockring.locked .sf-lockring__fill { stroke:var(--k-red); }
  .sf-lockring__label { position:absolute; left:50%; bottom:-2px; transform:translateX(-50%);
    font-family:var(--hud-data); font-size:var(--k-fs-data); color:var(--hud-cyan); white-space:nowrap; }
  .sf-lockring.locked .sf-lockring__label { color:var(--k-red); }
  @keyframes sf-lockring-latch {
    0% { transform:translate(-50%,-50%) scale(1); }
    50% { transform:translate(-50%,-50%) scale(1.16); }
    100% { transform:translate(-50%,-50%) scale(1); }
  }

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
    transform:rotate(45deg);
    border:2px solid var(--hud-cyan);
    animation:sf-diamondpulse 1s ease-in-out infinite alternate; }
  @keyframes sf-diamondpulse {
    from { transform:rotate(45deg) scale(.92); }
    to { transform:rotate(45deg) scale(1.04); } }

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
    width:22px; height:22px; display:block; color:var(--k-red);
  }
  .sf-threat-halo__slot--missile .sf-threat-halo__chev path {
    fill:none; stroke:currentColor; stroke-width:2.2; stroke-linecap:round; stroke-linejoin:round;
  }
  .sf-threat-halo__slot--missile[data-edge="right"] .sf-threat-halo__chev { transform:rotate(90deg); }
  .sf-threat-halo__slot--missile[data-edge="bottom"] .sf-threat-halo__chev { transform:rotate(180deg); }
  .sf-threat-halo__slot--missile[data-edge="left"] .sf-threat-halo__chev { transform:rotate(-90deg); }
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
  @media (forced-colors: active) {
    .sf-leadpip__svg { filter:none; }
    .sf-leadpip__full, .sf-leadpip__arc, .sf-leadpip__tick { stroke:CanvasText; }
    .sf-threat-halo__slot--arc .sf-threat-halo__arc {
      border-color:CanvasText; forced-color-adjust:none;
    }
    .sf-threat-halo__slot--missile .sf-threat-halo__chev path {
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
  .sf-commtape .sf-comm-backlog-btn,
  .sf-commtape #sf-contact-hail {
    position:static !important; left:auto !important; top:auto !important; z-index:auto !important;
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
  /* The hail panel is a popover off the button; keep it anchored to the tape, not the old corner. */
  .sf-commtape .sf-contact-hail__panel { left:0 !important; top:30px !important; }
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
  /* the Power Rail: slots become words. Key glyph at fine 38 % before the word; armed = live word with
     a 2 px signal rule beneath (as .k-word); ready 62 %; cooling/unaffordable/locked 38 %; empty hides
     its name; the sweep ring stays as the one permitted animation; band labels as .k-caps. */
  .sf-prail { gap:calc(28px * var(--k-s)); align-items:flex-end; padding-bottom:0; }
  .sf-prail__band { align-items:flex-start; gap:4px; }
  .sf-prail__label { font-family:var(--k-text); font-size:var(--k-fs-fine); font-weight:400; text-transform:uppercase; letter-spacing:0.08em; color:var(--k-bone-38); opacity:1; }
  .sf-prail__slots { gap:calc(14px * var(--k-s)); align-items:baseline; }
  .sf-pslot { width:auto; height:auto; background:none; border:0; box-shadow:none; padding:0 0 .15em; position:relative;
    display:inline-flex; flex-direction:row; align-items:baseline; gap:.4em; opacity:1; }
  .sf-pslot::after { content:''; position:absolute; left:0; bottom:0; height:2px; width:2.5em; background:var(--k-signal); transform:scaleX(0); transform-origin:left; transition:transform var(--k-d-focus) var(--k-ease), background-color var(--k-d-temp) var(--k-ease); }
  .sf-pslot__key { position:static; font-family:var(--k-text); font-size:var(--k-fs-fine); line-height:1; color:var(--k-bone-38); opacity:1; }
  .sf-pslot__art { display:none; }
  .sf-pslot__name { position:static; bottom:auto; font:500 var(--k-fs-body) var(--k-text); color:var(--k-bone-62); white-space:nowrap; }
  .sf-pslot__sweep { position:static; inset:auto; width:10px; height:10px; align-self:center; transform:rotate(-90deg); }
  .sf-pslot__sweep circle { stroke:var(--k-signal); stroke-width:3; }
  .sf-pslot[data-state="ready"] .sf-pslot__name { color:var(--k-bone-62); }
  .sf-pslot[data-state="armed"] { border-color:transparent; }
  .sf-pslot[data-state="armed"] .sf-pslot__name { color:var(--k-text-live); }
  .sf-pslot[data-state="armed"]::after { transform:scaleX(1); }
  .sf-pslot[data-state="cooling"], .sf-pslot[data-state="unaffordable"], .sf-pslot[data-state="locked"] { opacity:1; border-color:transparent; }
  .sf-pslot[data-state="cooling"] .sf-pslot__name, .sf-pslot[data-state="unaffordable"] .sf-pslot__name, .sf-pslot[data-state="locked"] .sf-pslot__name { color:var(--k-bone-38); }
  .sf-pslot[data-state="locked"] .sf-pslot__key, .sf-pslot[data-state="empty"] .sf-pslot__key { opacity:1; }
  .sf-pslot[data-state="empty"] { opacity:1; border-color:transparent; }
  .sf-pslot[data-state="empty"] .sf-pslot__name { display:none; }
  .sf-prail[data-claimed] .sf-pslot__name { color:var(--k-signal); }
  .sf-prail[data-claimed="FULL"] .sf-prail__label { opacity:.5; }
  @media (max-width:1180px) { .sf-pslot { width:auto; height:auto; } }
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
    .sf-pslot::after { transition:none; }
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

  @media (max-width:1180px), (max-height:700px) {
    .sf-kit-gauge { width:270px; height:150px; }
    .sf-kit-gauge__face { left:75px; top:81px; width:120px; height:54px; }
    .sf-kit-gauge__num { font-size:max(36px, calc(48px * var(--k-s, 1))); }
    .sf-command-deck { width:min(270px, calc(100vw - 24px)); min-width:0; }
  }
  @media (max-width:760px), (max-height:620px) {
    .sf-bars { grid-template-rows:auto 64px repeat(3, 28px); }
    .sf-kit-gauge { width:220px; height:122px; }
    .sf-kit-gauge__face { left:61px; top:66px; width:98px; height:44px; }
  }
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
  }
  `;
  document.head.appendChild(s);
}

