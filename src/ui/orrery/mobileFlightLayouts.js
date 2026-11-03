// Mobile flight placement has one owner. The HUD readability pass and touch deck previously
// competed for the dock's anchor: the .75 radar landed over objectives in portrait and the
// camera/Circuits rail in landscape. These rules move instruments, never shrink the HUD root.
const FLIGHT = ':root[data-sf-mobile="1"][data-sf-mobile-flight="1"]';

export const MOBILE_FLIGHT_LAYOUT_CSS = `
/* Fallback only until the HUD measures a safe band for the live voice/status lane. */
${FLIGHT} #alerts { transform:translateY(calc(124px + var(--sf-safe-top,0px))); }
/* The law presenter shares the HUD's measured caption bands on mobile, outside the
   radar dock's flow. Long notices scroll inside the allocated band. */
${FLIGHT} #ui-root > #sf-sector-law {
  position:fixed !important;
  box-sizing:border-box;
  overscroll-behavior:contain;
  backdrop-filter:none !important;
  -webkit-backdrop-filter:none !important;
}
/* A critical notice may temporarily occupy the decorative teaching ghost's space. */
${FLIGHT} #sf-touch-overlay.mf-notice-priority .mf-ghost { visibility:hidden; }
/* Portrait receipts share the objective's left lane, not the radar caption's right lane.
   Keep the existing bottom/cluster reservation and information semantics; critical receipts
   can still wrap, while informational receipts retain their existing full-text announcement. */
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
  ${FLIGHT} #sf-touch-overlay .mf-status {
    width:min(176px,calc(100vw - 114px - max(44px,52px * var(--mf-scale)) - var(--sf-safe-left,0px) - var(--sf-safe-right,0px)));
    min-width:0;
  }
  /* Stack the transient lines: alerts band ~146-170, then the tutorial card, then the
     objective. The card's injected top:18% (~152) sat inside the alerts band and over the
     leftcontext block's top corner. */
  ${FLIGHT} .sf-tutorial-flight-card { top:calc(178px + var(--sf-safe-top,0px))!important; }

  ${FLIGHT} #sf-touch-overlay .mf-speed { flex-wrap:wrap; row-gap:2px; }
  /* The two-line flight hint must clear the bottom safe edge on short portrait screens. */
  ${FLIGHT} #sf-touch-overlay .mf-ghost-label { top:82px; }
  ${FLIGHT} #toasts,
  ${FLIGHT}[data-sf-mobile-lefty="1"] #toasts {
    left:calc(14px + var(--sf-safe-left,0px)); right:auto;
    width:min(320px,calc(100vw - 26px - max(166px,var(--mf-cluster-w,196px) * .25) - var(--sf-safe-left,0px) - var(--sf-safe-right,0px)));
  }
}

/* Actual phone-sized instruments: the canvas and SVG use the same 116px coordinate space. */
@media (max-width:959px), (max-height:599px) {
  ${FLIGHT} #hud { --sf-radar-size:116px; }
  ${FLIGHT} #sf-touch-overlay .mf-status { width:150px!important; gap:3px; }
  ${FLIGHT} #sf-touch-overlay .mf-speed b { font-size:32px; }
  ${FLIGHT} #hud .sf-rightdock {
    top:calc(112px + var(--sf-safe-top,0px))!important;
    right:calc(8px + var(--sf-safe-right,0px))!important;
    bottom:auto!important; width:148px!important; align-items:flex-end;
    transform:none!important; max-height:none!important; overflow:visible!important;
  }
  ${FLIGHT} #hud .sf-radar-wrap:not(.sf-radar-wrap--expanded) {
    position:relative!important; inset:auto!important; width:148px!important;
    --sf-kit-radar-rim:16px; transform:none!important; pointer-events:auto!important;
  }
  ${FLIGHT} #hud .sf-radar-wrap:not(.sf-radar-wrap--expanded) .sf-radar {
    width:116px!important; height:116px!important; overflow:visible;
  }
  ${FLIGHT} #hud .sf-radar-wrap:not(.sf-radar-wrap--expanded) .sf-radar canvas { width:116px!important; height:116px!important; }
  ${FLIGHT} #hud .sf-radar-wrap--expanded .sf-radar { flex-shrink:0; }
  ${FLIGHT} #hud .sf-radar-wrap--expanded .sf-radar canvas { width:290px!important; height:290px!important; }
  ${FLIGHT} #hud .sf-radar-objective-key { font-size:12px!important; line-height:1.25; letter-spacing:normal; }
  ${FLIGHT} #hud .sf-radar-wrap--expanded {
    position:fixed!important; top:calc(112px + var(--sf-safe-top,0px))!important;
    left:clamp(calc(8px + var(--sf-safe-left,0px)),calc(50vw - 179px),calc(100vw - 366px - var(--sf-safe-right,0px)))!important;
    right:auto!important; bottom:auto!important;
    width:min(358px,calc(100vw - 16px - var(--sf-safe-left,0px) - var(--sf-safe-right,0px)))!important;
    max-height:calc(100dvh - 120px - var(--sf-safe-top,0px) - var(--sf-safe-bottom,0px));
    min-height:0!important; overflow-y:auto!important; transform:none!important; z-index:200;
  }
  ${FLIGHT} #hud > .sf-leftcontext {
    top:calc(112px + var(--sf-safe-top,0px))!important;
    left:calc(8px + var(--sf-safe-left,0px))!important; bottom:auto!important;
    width:min(205px,calc(100vw - 172px - var(--sf-safe-left,0px) - var(--sf-safe-right,0px)))!important;
    max-width:none!important; transform:none!important; overflow:visible!important; contain:style!important;
  }
  ${FLIGHT} #hud > .sf-leftcontext > .sf-mission-tracker {
    box-sizing:border-box; width:100%; max-width:100%; padding:6px 8px!important;
    contain:style!important; background:rgb(5 7 10 / .88)!important; overflow:visible;
  }
  ${FLIGHT} #hud .sf-mission-tracker .sf-mt-dial { display:none!important; }
  ${FLIGHT} #hud .sf-mission-tracker::before { display:none!important; }
  ${FLIGHT} #hud .sf-mt-obj { display:none!important; }
  ${FLIGHT} #hud .sf-mt-compact { display:block; font:500 14px/1.3 var(--dp-face-body,system-ui,sans-serif); color:var(--dp-ink,#e8e2d4); }
  ${FLIGHT} #hud .sf-mt-compact-action { display:-webkit-box; -webkit-box-orient:vertical; -webkit-line-clamp:3; overflow:hidden; overflow-wrap:anywhere; }
  ${FLIGHT} #hud .sf-mt-compact-readings { white-space:pre-line; overflow-wrap:anywhere; color:var(--dp-lamp,#f2b950); }
  ${FLIGHT} #hud .sf-mt-time { font-size:12px!important; line-height:1.3; }
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
    left:calc(8px + var(--sf-safe-left,0px)); top:calc(112px + var(--sf-safe-top,0px));
    box-sizing:border-box; width:min(280px,calc(100vw - 16px - var(--sf-safe-left,0px) - var(--sf-safe-right,0px)));
    max-height:calc(100dvh - 120px - var(--sf-safe-top,0px) - var(--sf-safe-bottom,0px));
    padding:10px; color:var(--dp-ink,#e8e2d4); background:var(--dp-void,#05070a); border:1px solid var(--dp-metal-hi,#777);
    font:14px/1.4 var(--dp-face-body,system-ui,sans-serif); pointer-events:auto;
  }
  ${FLIGHT} #hud .sf-mt-details-text {
    min-height:0; flex:0 1 auto; overflow-y:auto; overscroll-behavior:contain;
    touch-action:pan-y; -webkit-overflow-scrolling:touch;
    white-space:pre-line; overflow-wrap:anywhere;
  }
  ${FLIGHT} #hud .sf-mt-details-close { flex:none; align-self:flex-end; margin-bottom:8px; }
  ${FLIGHT} #race-tape[data-compact="true"] {
    position:absolute!important; top:-48px!important; right:0!important; left:auto!important; bottom:auto!important;
    width:148px!important; padding:0!important; background:none!important; transform:none!important;
    display:block; overflow:visible!important;
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
}
@media (max-height:500px) and (orientation:landscape) {
  ${FLIGHT} #alerts { transform:none; }
  ${FLIGHT} #hud .sf-radar-wrap--expanded { top:calc(8px + var(--sf-safe-top,0px))!important; max-height:calc(100dvh - 16px - var(--sf-safe-top,0px) - var(--sf-safe-bottom,0px)); }
  ${FLIGHT} #hud .sf-rightdock { top:calc(95px + var(--sf-safe-top,0px))!important; right:calc(70px + var(--sf-safe-right,0px))!important; }
  ${FLIGHT} #hud > .sf-leftcontext { top:calc(100px + var(--sf-safe-top,0px))!important; width:230px!important; }
  ${FLIGHT} #race-tape[data-compact="true"] {
    top:-87px!important; right:auto!important;
    left:calc(386px - 100vw + var(--sf-safe-left,0px) + var(--sf-safe-right,0px))!important;
  }
  ${FLIGHT} #race-tape[data-compact="true"][data-options-open="true"] .race-tape-actions { right:auto; left:80px; }
}
@media (orientation:portrait) and (max-width:350px) {
  ${FLIGHT} #hud > .sf-leftcontext { width:calc(100vw - 16px - var(--sf-safe-left,0px) - var(--sf-safe-right,0px))!important; }
  ${FLIGHT} #hud .sf-rightdock { top:calc(270px + var(--sf-safe-top,0px))!important; }
  ${FLIGHT} #race-tape[data-compact="true"] { top:-206px!important; }
}
`;
