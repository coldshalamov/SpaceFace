// Mobile flight placement has one owner. The HUD readability pass and touch deck previously
// competed for the dock's anchor: the .75 radar landed over objectives in portrait and the
// camera/Circuits rail in landscape. These rules move instruments, never shrink the HUD root.
const FLIGHT = ':root[data-sf-mobile="1"][data-sf-mobile-flight="1"]';

export const MOBILE_FLIGHT_LAYOUT_CSS = `
/* The mobile information lanes are viewport seats, not a translated desktop alert stack. */
${FLIGHT} #alerts { transform:none!important; }
/* The law presenter shares the HUD's measured caption bands on mobile, outside the
   radar dock's flow. Long notices scroll inside the allocated band. */
${FLIGHT} #ui-root > #sf-sector-law {
  position:fixed !important;
  box-sizing:border-box;
  overscroll-behavior:contain;
  backdrop-filter:none !important;
  -webkit-backdrop-filter:none !important;
}
:root[data-sf-mobile="1"] body:is(.ui-modal-open,.ui-live-screen) #sf-sector-law {
  display:none!important;
}
/* A critical notice may temporarily occupy the decorative teaching ghost's space. */
${FLIGHT} #sf-touch-overlay.mf-notice-priority .mf-ghost { visibility:hidden; }
/* Expanded navigation owns this space; hidden task controls must not intercept radar taps. */
${FLIGHT} #hud:has(.sf-radar-wrap--expanded) :is(.sf-leftcontext,.sf-leftcontext *) {
  visibility:hidden!important; pointer-events:none!important;
}
/* Expansion reparents the dial from the interactive right dock into #hud, whose children
   default to pointer-through. A live navigation surface also survives informational receipt
   yielding; Pause and Powers retain their own visibility/input ownership. */
${FLIGHT}:not([data-sf-mobile-wheel="1"]) body:not(.ui-modal-open) #hud > .sf-radar-wrap--expanded {
  pointer-events:auto!important; visibility:visible!important;
}
@media (orientation:portrait) and (max-width:959px) {
  /* The same Powers button joins Pause in the top navigation lane. Its old 110px side
     handle could not fit between the radar caption and the action cluster on short phones.
     Use the actual scaled Pause width, not a fixed assumption; both hands share this row. */
  ${FLIGHT} #sf-touch-overlay .mf-edge {
    top:calc(14px + var(--sf-safe-top,0px)); bottom:auto; left:auto;
    right:calc(20px + max(44px,52px * var(--mf-scale)) + var(--sf-safe-right,0px));
    width:68px; height:44px; min-width:44px; min-height:44px;
    box-sizing:border-box; border-bottom:1px solid rgb(var(--mf-bone) / .36);
  }
  ${FLIGHT} #sf-touch-overlay .mf-edge::before { content:none; }
  ${FLIGHT} #sf-touch-overlay .mf-edge-art { display:none; }
  ${FLIGHT} #sf-touch-overlay .mf-edge-word {
    position:static; writing-mode:horizontal-tb; transform:none;
    left:auto; right:auto; top:auto; letter-spacing:.08em;
  }
  ${FLIGHT} #sf-touch-overlay .mf-edge[aria-expanded="true"] {
    border-bottom-color:var(--mf-hand);
  }
  /* MOB-02: the status strip is one ~30px row of thin labelled bars beside a small speed
     numeral — cap its reach so the Powers/Pause lane stays clear. */
  ${FLIGHT} #sf-touch-overlay .mf-status {
    max-width:calc(100vw - 74px - max(44px,52px * var(--mf-scale)) - var(--sf-safe-left,0px) - var(--sf-safe-right,0px));
    min-width:0;
  }
  /* Stack the transient lines: alerts band ~146-170, then the tutorial card, then the
     objective. The card's injected top:18% (~152) sat inside the alerts band and over the
     leftcontext block's top corner. */
  ${FLIGHT} .sf-tutorial-flight-card { top:calc(178px + var(--sf-safe-top,0px))!important; }
  /* Danger and warning lines take the clear seat under Powers/Pause, right of the objective line: centred at the
     top they printed behind the vitals strip (lead look 2026-11-11). */
  ${FLIGHT} #alerts .sf-alert--floor:not(.sf-alert--info) {
    position:fixed!important; left:auto!important; right:calc(8px + var(--sf-safe-right,0px))!important;
    top:calc(64px + var(--sf-safe-top,0px))!important; bottom:auto!important; transform:none!important;
    max-width:calc(100vw - 270px - var(--sf-safe-left,0px) - var(--sf-safe-right,0px))!important; white-space:normal;
  }

  /* The two-line flight hint sits under the smaller first-run ring. */
  ${FLIGHT} #sf-touch-overlay .mf-ghost-label { top:50px; }
}

/* One small task instrument and one radar: disclosure, rather than desktop prose at phone size. */
@media (max-width:959px), (max-height:599px) {
  ${FLIGHT} #hud { --sf-radar-size:96px; }
  ${FLIGHT} #sf-touch-overlay .mf-status { width:auto!important; gap:6px; }
  ${FLIGHT} #sf-touch-overlay .mf-speed b { font-size:20px; }
  ${FLIGHT} #hud .sf-rightdock {
    top:calc(112px + var(--sf-safe-top,0px))!important;
    right:calc(8px + var(--sf-safe-right,0px))!important;
    bottom:auto!important; width:120px!important; align-items:flex-end;
    transform:none!important; max-height:none!important; overflow:visible!important;
  }
  ${FLIGHT} #hud .sf-radar-wrap:not(.sf-radar-wrap--expanded) {
    position:relative!important; inset:auto!important; width:120px!important;
    --sf-kit-radar-rim:12px; transform:none!important; pointer-events:auto!important;
  }
  ${FLIGHT} #hud .sf-radar-wrap:not(.sf-radar-wrap--expanded) .sf-radar {
    width:96px!important; height:96px!important; overflow:visible;
  }
  ${FLIGHT} #hud .sf-radar-wrap:not(.sf-radar-wrap--expanded) .sf-radar canvas { width:96px!important; height:96px!important; }
  ${FLIGHT} #hud .sf-radar-wrap:not(.sf-radar-wrap--expanded) .sf-radar-orrery text { font-size:12px!important; }
  /* MOB-02: the mini dial is a glance instrument; its legend plate returns on the expanded scope. */
  ${FLIGHT} #hud .sf-radar-wrap:not(.sf-radar-wrap--expanded) .sf-radar-objective-key { display:none!important; }
  ${FLIGHT} #hud .sf-radar-wrap:not(.sf-radar-wrap--expanded) .sf-radar-orrery .orr-micro--hi { display:none!important; }
  ${FLIGHT} #hud .sf-radar-wrap--expanded .sf-radar { flex-shrink:0; }
  ${FLIGHT} #hud .sf-radar-wrap--expanded .sf-radar canvas { width:290px!important; height:290px!important; }
  ${FLIGHT} #hud .sf-radar-objective-key { margin-top:12px!important; font-size:12px!important; line-height:1.25; letter-spacing:normal; overflow-wrap:anywhere; }
  ${FLIGHT} #hud .sf-radar-wrap--expanded {
    position:fixed!important; top:calc(112px + var(--sf-safe-top,0px))!important;
    left:clamp(calc(8px + var(--sf-safe-left,0px)),calc(50vw - 179px),calc(100vw - 366px - var(--sf-safe-right,0px)))!important;
    right:auto!important; bottom:auto!important;
    width:min(358px,calc(100vw - 16px - var(--sf-safe-left,0px) - var(--sf-safe-right,0px)))!important;
    max-height:calc(100dvh - 120px - var(--sf-safe-top,0px) - var(--sf-safe-bottom,0px));
    min-height:0!important; overflow-y:auto!important; transform:none!important; z-index:200;
  }
  ${FLIGHT} #hud > .sf-leftcontext {
    top:calc(46px + var(--sf-safe-top,0px))!important;
    left:calc(8px + var(--sf-safe-left,0px))!important; bottom:auto!important;
    width:min(320px,calc(100vw - 144px - var(--sf-safe-left,0px) - var(--sf-safe-right,0px)))!important;
    max-width:none!important; transform:none!important; overflow:visible!important; contain:style!important;
    padding:0!important; border:0!important; background:none!important; box-shadow:none!important;
  }
  /* MOB-02: the tracker is one ellipsized line — act title (when present) plus the objective's
     first line — and the whole line is the disclosure target. hud.js toggles the card with an
     inline display, so the line is built from inline children instead of a flex row: the card's
     own line box carries the one shared ellipsis. The DETAILS button itself is stretched
     invisible over the card so it keeps its name, focus and expanded state. */
  ${FLIGHT} #hud > .sf-leftcontext > .sf-mission-tracker {
    box-sizing:border-box; width:100%; max-width:100%; padding:5px 8px!important;
    white-space:nowrap; overflow:hidden; text-overflow:ellipsis;
    contain:style!important; background:var(--dp-glass-flight,rgb(5 7 10 / .88))!important;
    border:1px solid var(--dp-line-faint,rgb(232 226 212 / .14)); border-radius:4px;
    pointer-events:none!important;
  }
  ${FLIGHT} #hud .sf-mission-tracker .sf-mt-dial { display:none!important; }
  /* G19-02 hold line on a phone: one compact line under the objective, only while carrying something. */
  ${FLIGHT} #hud .sf-cargo-bar { margin-top:4px; padding:3px 8px!important; font-size:12px!important; line-height:1.3; }
  ${FLIGHT} #hud .sf-mission-tracker::before { display:none!important; }
  ${FLIGHT} #hud .sf-mt-obj { display:none!important; }
  /* The line is the objective: the chapter name ("ACT I - THE PIT") cut the instruction to "Recover the 47-…"
     on the real route (lead look). The chapter stays in the details sheet the line opens. */
  ${FLIGHT} #hud .sf-mt-title { display:none!important; }
  ${FLIGHT} #hud .sf-mt-compact { display:contents; font:500 14px/1.3 var(--dp-face-body,system-ui,sans-serif); color:var(--dp-ink,#e8e2d4); }
  ${FLIGHT} #hud .sf-mt-compact-action { display:block; overflow:hidden; text-overflow:ellipsis; }
  ${FLIGHT} #hud .sf-mt-compact-readings { display:none!important; }
  /* The full objective AND this tutorial caption already live in the existing Details panel. */
  ${FLIGHT} #hud .sf-mt-time { display:none!important; }
  ${FLIGHT} #hud .sf-mt-details-button, ${FLIGHT} #hud .sf-mt-details-close,
  ${FLIGHT} #race-tape .race-tape-options-trigger, ${FLIGHT} #race-tape .race-tape-options-close {
    display:block!important; box-sizing:border-box; min-width:44px; min-height:44px; padding:6px 10px;
    color:var(--dp-ink,#e8e2d4); background:var(--dp-void,#05070a); border:1px solid var(--dp-metal-hi,#777);
    font:500 12px/1.3 var(--dp-face-body,system-ui,sans-serif); pointer-events:auto;
  }
  ${FLIGHT} #hud :is(.sf-mt-details-button,.sf-mt-details-close):focus-visible,
  ${FLIGHT} #race-tape :is(.race-tape-options-trigger,.k-word):focus-visible { outline:2px solid var(--dp-lamp,#f2b950); outline-offset:2px; }
  ${FLIGHT} #hud .sf-mt-details[hidden] { display:none!important; }
  /* The fixed panel is bounded independently of the tracker height. Its copy alone scrolls,
     leaving Close visible even when a long objective or tutorial fills the available space. */
  ${FLIGHT} #hud .sf-mt-details:not([hidden]) {
    display:flex; flex-direction:column; position:fixed; z-index:30;
    left:calc(8px + var(--sf-safe-left,0px)); top:calc(46px + var(--sf-safe-top,0px));
    box-sizing:border-box; width:min(280px,calc(100vw - 16px - var(--sf-safe-left,0px) - var(--sf-safe-right,0px)));
    max-height:calc(100dvh - 120px - var(--sf-safe-top,0px) - var(--sf-safe-bottom,0px));
    padding:10px; color:var(--dp-ink,#e8e2d4); background:var(--dp-void,#05070a); border:1px solid var(--dp-metal-hi,#777);
    font:14px/1.4 var(--dp-face-body,system-ui,sans-serif); pointer-events:auto;
  }
  @media (orientation:portrait) {
    ${FLIGHT} #hud .sf-mt-details:not([hidden]) {
      top:calc(54px + var(--sf-safe-top,0px));
      width:min(246px,calc(63vw - var(--sf-safe-left,0px)));
    }
  }
  ${FLIGHT} #hud .sf-mt-details-text {
    min-height:0; flex:0 1 auto; overflow-y:auto; overscroll-behavior:contain;
    touch-action:pan-y; -webkit-overflow-scrolling:touch;
    white-space:pre-line; overflow-wrap:anywhere;
  }
  ${FLIGHT} #hud .sf-mt-details-close { flex:none; align-self:flex-end; margin-bottom:8px; }
  /* MOB-02: the DETAILS chip is gone from sight; it stretches invisible across the one-line
     tracker so a tap anywhere on the objective line (and the existing keyboard focus) keeps
     opening the same details sheet. */
  ${FLIGHT} #hud .sf-mt-details-button {
    position:absolute; inset:0; width:auto; height:auto;
    padding:0; border:0; color:transparent; background:transparent; font-size:0;
  }
  /* MOB-02: ordinary flight's "View & circuits" chip leaves the flight HUD — Circuits stays on
     the menu reach (pause / title) instead of a plate over the world. The authored-race
     instrument (data-compact="false") keeps its seat. */
  ${FLIGHT} #race-tape[data-compact="true"] {
    display:none!important;
    position:absolute!important; top:-48px!important; right:0!important; left:auto!important; bottom:auto!important;
    width:120px!important; padding:0!important; background:none!important; transform:none!important;
    overflow:visible!important;
  }
  ${FLIGHT} #race-tape[data-compact="true"] .race-tape-options-trigger { width:100%; }
  ${FLIGHT} #race-tape[data-compact="true"][data-options-open="false"] .race-tape-actions { display:none!important; }
  ${FLIGHT} #race-tape[data-compact="true"][data-options-open="true"] .race-tape-actions {
    position:absolute; top:44px; right:0; z-index:25; display:grid!important; grid-template-columns:1fr!important;
    width:190px; padding:4px; box-sizing:border-box; background:var(--dp-void,#05070a);
    border:1px solid var(--dp-metal-hi,#777); gap:0;
  }
  ${FLIGHT} #race-tape[data-compact="true"] .race-tape-actions .k-word { min-height:44px; width:100%; text-align:left; font-size:12px; }
  ${FLIGHT} #race-tape[data-compact="false"] :is(.race-tape-options-trigger,.race-tape-options-close) { display:none!important; }

  /* Facts share one edge lane with the low-priority teaching voice. Never print both over the
     ship. The receipt owner retains its queue, full announcements, counts, actions and expiry. */
  ${FLIGHT} body #hud #toasts,
  ${FLIGHT} #alerts .sf-alert--floor.sf-alert--info {
    position:fixed!important; left:calc(8px + var(--sf-safe-left,0px))!important; right:auto!important;
    top:calc(208px + var(--sf-safe-top,0px))!important; bottom:auto!important;
    width:min(320px,calc(100vw - 144px - var(--sf-safe-left,0px) - var(--sf-safe-right,0px)))!important;
    box-sizing:border-box; transform:none!important; text-align:left!important;
    font:400 13px/1.35 var(--dp-face-body,system-ui,sans-serif);
  }
  /* Important results wrap in full; a pointer-through feed must never require a hidden scroll. */
  ${FLIGHT} body #hud #toasts { max-height:none!important; overflow:visible!important; gap:5px; }
  ${FLIGHT} #toasts .sf-stage__flow { width:100%; min-width:0; align-items:stretch; }
  ${FLIGHT} #toasts .sf-toast { box-sizing:border-box; width:100%; max-width:100%; font:inherit; min-width:0; padding:3px 0; }
  ${FLIGHT} #toasts .sf-toast__text { min-width:0; flex:1; white-space:normal; overflow-wrap:anywhere; }
  ${FLIGHT} #toasts .sf-toast:not(.sf-toast--info) .sf-toast__text { white-space:normal; overflow:visible; text-overflow:clip; }
  ${FLIGHT} #alerts .sf-alert--floor.sf-alert--info .sf-alert__text { display:-webkit-box; -webkit-box-orient:vertical; -webkit-line-clamp:2; overflow:hidden; }
  ${FLIGHT}:has(#toasts .sf-toast:not(.sf-toast--out)) #alerts .sf-alert--floor.sf-alert--info { visibility:hidden!important; }

  /* The diamond stays on its body. Its words belong above the touch actions, not on top of
     that body, a receipt, or the pilot's own ship. Inline display remains the live owner's. */
  ${FLIGHT} #sf-ml2 .ml2-preview {
    position:fixed!important; left:calc(8px + var(--sf-safe-left,0px))!important; right:auto!important;
    top:auto!important; bottom:calc(196px + var(--sf-safe-bottom,0px))!important; transform:none!important;
    box-sizing:border-box; width:max-content; max-width:min(280px,calc(100vw - 32px - var(--sf-safe-left,0px) - var(--sf-safe-right,0px)))!important;
    white-space:normal!important; font-size:12px; line-height:1.35; letter-spacing:.03em;
  }
  ${FLIGHT}[data-sf-mobile-lefty="1"] #sf-ml2 .ml2-preview { left:auto!important; right:calc(8px + var(--sf-safe-right,0px))!important; }
}
@media (max-height:599px) and (orientation:landscape) {
  /* The left-hand wheel occupies the usual status seat. Put the existing status
     above its mirrored tabs, beside (not under) Pause; the top row already owns
     the viewport safe insets. The normal flight and right-hand seats stay put. */
  ${FLIGHT}[data-sf-mobile-lefty="1"][data-sf-mobile-wheel="1"] #sf-touch-overlay .mf-top > .mf-status {
    position:absolute; left:auto; top:0;
    right:calc(max(44px,52px * var(--mf-scale)) + 8px);
  }
}
/* Landscape keeps the Powers side handle (portrait moves it into the top Pause row).
   Compact radar densify (max-height:599 / max-width:959 above) parks .sf-rightdock at
   right:8, which slides HOSTILE / GATE / HAULER under Powers at 960×540 and the same
   mash persists on taller landscape (1280×720) whenever the dock hugs the right edge.
   Keep the Powers-clearing inset for every landscape mobile-flight seat; the ≤500 block
   below still owns the taller-seat toast / leftcontext / race-tape moves. */
@media (orientation:landscape) {
  ${FLIGHT} #hud .sf-rightdock {
    right:calc(84px + var(--sf-safe-right,0px))!important;
  }
}
@media (max-height:500px) and (orientation:landscape) {
  ${FLIGHT} #hud .sf-radar-wrap--expanded { top:calc(8px + var(--sf-safe-top,0px))!important; max-height:calc(100dvh - 16px - var(--sf-safe-top,0px) - var(--sf-safe-bottom,0px)); }
  ${FLIGHT} #hud .sf-rightdock { top:calc(95px + var(--sf-safe-top,0px))!important; right:calc(84px + var(--sf-safe-right,0px))!important; }
  ${FLIGHT} #hud > .sf-leftcontext { top:calc(44px + var(--sf-safe-top,0px))!important; width:236px!important; }
  /* Use landscape's width: results at the upper edge, context at the lower edge, with the
     central ship between them. These seats also clear the mirrored left-hand action cluster. */
  ${FLIGHT} body #hud #toasts,
  ${FLIGHT} #alerts .sf-alert--floor.sf-alert--info {
    left:calc(252px + var(--sf-safe-left,0px))!important;
    width:calc(100vw - 390px - var(--sf-safe-left,0px) - var(--sf-safe-right,0px))!important;
    top:calc(10px + var(--sf-safe-top,0px))!important;
  }
  ${FLIGHT} #sf-ml2 .ml2-preview,
  ${FLIGHT}[data-sf-mobile-lefty="1"] #sf-ml2 .ml2-preview {
    left:calc(252px + var(--sf-safe-left,0px))!important; right:auto!important;
    bottom:calc(12px + var(--sf-safe-bottom,0px))!important;
    max-width:calc(100vw - 390px - var(--sf-safe-left,0px) - var(--sf-safe-right,0px))!important;
  }
  ${FLIGHT} #race-tape[data-compact="true"] {
    top:-87px!important; right:auto!important;
    left:calc(400px - 100vw + var(--sf-safe-left,0px) + var(--sf-safe-right,0px))!important;
  }
  ${FLIGHT} #race-tape[data-compact="true"][data-options-open="true"] .race-tape-actions { right:auto; left:80px; }
}
/* The dock's ◆ BEACON key ends 91px from the right edge and the Gun key starts 78-98px from it, so
   the dock sits 14px further in (the race rail's offset grows 14px to stay put). On a 320-tall
   window the Tether ring rises into the key's row, so the dock lifts 17px (the rail's offset
   shrinks 17px to stay put). */
@media (max-height:340px) and (orientation:landscape) {
  ${FLIGHT} #hud .sf-rightdock { top:calc(78px + var(--sf-safe-top,0px))!important; }
  ${FLIGHT} #race-tape[data-compact="true"] { top:-70px!important; }
}
`;
