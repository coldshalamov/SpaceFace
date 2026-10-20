// Mobile flight placement has one owner. The HUD readability pass and touch deck previously
// competed for the dock's anchor: the .75 radar landed over objectives in portrait and the
// camera/Circuits rail in landscape. These rules move instruments, never shrink the HUD root.
const FLIGHT = ':root[data-sf-mobile="1"][data-sf-mobile-flight="1"]';

export const MOBILE_FLIGHT_LAYOUT_CSS = `
@media (max-width:959px), (max-height:599px) {
  ${FLIGHT} #hud .sf-rightdock {
    top:calc(196px + var(--sf-safe-top,0px))!important;
    right:calc(12px + var(--sf-safe-right,0px))!important;
    bottom:auto!important; width:min(236px,58vw)!important; align-items:flex-end;
    transform:none!important; max-height:none!important; overflow:visible!important;
  }
  ${FLIGHT} #hud .sf-radar-wrap {
    position:relative!important; top:auto!important; right:auto!important;
    bottom:auto!important; left:auto!important; flex-shrink:0;
    width:204px!important; transform:scale(.75)!important;
    transform-origin:top right!important; pointer-events:auto!important;
  }
  /* Expansion is a deliberately larger tactical overlay, not a second compact dial. Keep its
     authored 290px face / 358px envelope and range-toggle hit testing intact. Its full portrait
     composition is separate from the ordinary-flight collision correction below. */
  ${FLIGHT} #hud .sf-radar-wrap.sf-radar-wrap--expanded { width:358px!important; }
  /* Law/contact cards retain their existing column width. The right-aligned radar owns its
     narrower visual footprint independently; do not squeeze incident text into 153px. */
  /* The objective keeps its existing .75 edge fit. Reserve the radar's 153px rendered width,
     both screen margins and a 13px gutter; long objectives wrap rather than cross the dial. */
  ${FLIGHT} #hud > .sf-leftcontext {
    top:calc(186px + var(--sf-safe-top,0px))!important;
    max-width:min(250px,calc((100vw - 192px - var(--sf-safe-left,0px) - var(--sf-safe-right,0px)) * 1.333333))!important;
  }
  ${FLIGHT} #race-tape[data-compact="true"] {
    top:calc(70px + var(--sf-safe-top,0px));
    right:calc(12px + var(--sf-safe-right,0px));
    width:min(128px,calc(100vw - 202px - var(--sf-safe-left,0px) - var(--sf-safe-right,0px)));
  }
}
@media (max-height:500px) and (orientation:landscape) {
  ${FLIGHT} #hud .sf-rightdock {
    top:calc(80px + var(--sf-safe-top,0px))!important;
    right:calc(90px + var(--sf-safe-right,0px))!important;
    width:min(236px,32vw)!important;
  }
  /* The 44px touch keys use the top-centre lane, between the status strip and Pause.
     They finish before the radar begins instead of sitting across its compass and contacts. */
  ${FLIGHT} #race-tape[data-compact="true"] {
    top:calc(10px + var(--sf-safe-top,0px));
    left:auto; right:calc(84px + var(--sf-safe-right,0px));
    width:180px; transform:none;
  }
  ${FLIGHT} #hud > .sf-leftcontext { max-width:min(250px,64vw)!important; }
}
`;
