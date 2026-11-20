const S = 'body[data-hud-skin="orrery"]';
const CARGO_MARK = "data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' viewBox='0 0 36 42'%3E%3Cpath d='M18 2 34 10V32L18 40 2 32V10ZM2 10l16 8 16-8M18 18v22M10 6l16 8' fill='none' stroke='%23000' stroke-width='2.1' stroke-linejoin='round'/%3E%3Cpath d='M6 15v15l9 5V20zm15 5v15l9-5V15z' fill='%23000'/%3E%3C/svg%3E";
const PLACE_MARK = "data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' viewBox='0 0 20 24'%3E%3Cpath d='M10 24C9 21 1 13 1 9a9 9 0 1 1 18 0c0 4-8 12-9 15ZM10 5a4 4 0 1 0 0 8 4 4 0 0 0 0-8Z' fill='%23000' fill-rule='evenodd'/%3E%3C/svg%3E";

export const VISOR_HUD_CSS = `
${S} {
  --visor-rule:rgb(211 232 235 / .72);
  --visor-ice:#a9edf4;
  --visor-copy:#f0f2ef;
  --visor-font:var(--dp-face-read, "Instrument Sans", Arial, sans-serif);
  --visor-glass:linear-gradient(153deg, rgb(13 30 41 / .94), rgb(8 19 27 / .91));
  --visor-cut:polygon(10px 0, calc(100% - 10px) 0, 100% 10px, 100% calc(100% - 10px), calc(100% - 10px) 100%, 10px 100%, 0 calc(100% - 10px), 0 10px);
  --visor-panel-cut:polygon(14px 0,calc(100% - 14px) 0,100% 14px,100% calc(100% - 14px),calc(100% - 14px) 100%,14px 100%,0 calc(100% - 14px),0 14px);
  --visor-panel-rim:polygon(evenodd,14px 0,calc(100% - 14px) 0,100% 14px,100% calc(100% - 14px),
    calc(100% - 14px) 100%,14px 100%,0 calc(100% - 14px),0 14px,14px 0,
    14.4px 1px,1px 14.4px,1px calc(100% - 14.4px),14.4px calc(100% - 1px),
    calc(100% - 14.4px) calc(100% - 1px),calc(100% - 1px) calc(100% - 14.4px),
    calc(100% - 1px) 14.4px,calc(100% - 14.4px) 1px,14.4px 1px);
  --visor-chip-cut:polygon(7px 0,calc(100% - 7px) 0,100% 7px,100% calc(100% - 7px),calc(100% - 7px) 100%,7px 100%,0 calc(100% - 7px),0 7px);
  --visor-chip-rim:polygon(evenodd,7px 0,calc(100% - 7px) 0,100% 7px,100% calc(100% - 7px),
    calc(100% - 7px) 100%,7px 100%,0 calc(100% - 7px),0 7px,7px 0,
    7.5px 1px,1px 7.5px,1px calc(100% - 7.5px),7.5px calc(100% - 1px),calc(100% - 7.5px) calc(100% - 1px),
    calc(100% - 1px) calc(100% - 7.5px),calc(100% - 1px) 7.5px,calc(100% - 7.5px) 1px,7.5px 1px);
  --sf-pop-glass:var(--visor-glass);
  --sf-pop-seam:var(--visor-rule);
}

@media (min-width:761px) {
  :root:not([data-sf-mobile-flight="1"]) ${S} #hud[data-hud="orrery"]:has(.orr-cluster--visor)::before {
    background:none;
  }
}

/* Unified tactical minimap frame for both Adventure and Swarm, matched to the visor gauges beside it. */
${S} #hud .sf-rightdock:has(.sf-radar-wrap--chart) {
  --visor-chart-width:min(clamp(276px, 24.8vw, 412px), calc((100vw - 2 * var(--sf-safe-inset-x, 0px)) * .32));
  width:var(--visor-chart-width); align-items:flex-end; transform:none; z-index:14;
  right:calc(clamp(12px,1.2vw,20px) + var(--sf-safe-inset-x, 0px));
  bottom:clamp(14px,3.2vh,30px);
}
${S} #hud .sf-radar-wrap--chart { --sf-kit-radar-rim:0px; width:var(--visor-chart-width); min-height:0; gap:0; padding:0; }
${S} #hud .sf-radar-wrap--chart .sf-radar {
  display:block; width:100% !important; height:clamp(164px, 14.6vw, 232px) !important; max-width:none; max-height:none;
  border:0; border-radius:0; background:none; box-shadow:none; cursor:pointer;
  overflow:visible; transition:filter 150ms ease;
}
${S} #hud .sf-radar-wrap--chart .sf-radar::before,
${S} #hud .sf-radar-wrap--chart .sf-radar > :not(.sf-flight-chart) { display:none !important; }
${S} #hud .sf-radar-wrap--chart .sf-radar .sf-flight-chart {
  display:block; position:relative; inset:auto; width:100% !important; height:100% !important; border:0; border-radius:0; clip-path:none !important; transform:none;
  animation:sf-visor-chart-in 170ms ease-out both;
}
@keyframes sf-visor-chart-in { from { opacity:.62; } to { opacity:1; } }
${S} #hud .sf-radar-wrap--chart .sf-radar:hover { filter:brightness(1.08); }
${S} #hud .sf-radar-wrap--chart .sf-radar:focus-visible { outline:2px solid var(--visor-ice); outline-offset:3px; }
${S} #hud .sf-radar-wrap--chart .sf-radar-objective-key {
  clip-path:inset(50%); height:1px; width:1px; position:absolute; overflow:hidden; margin:0;
}
${S} #hud .sf-radar-wrap--chart .sf-radar-objective-key[data-mode="legend"] { display:none; }
/* The instrument's foot: one hairline from the frame's left edge into two keys seated at its right
   edge, a clear 9px below the bezel, so nothing touches the frame. */
.sf-flight-chart__footer { display:flex; width:100%; justify-content:flex-end; align-items:center; gap:6px; margin-top:9px; }
.sf-flight-chart__footer[hidden], .sf-flight-chart[hidden] { display:none !important; }
.sf-flight-chart__footer::before { content:""; height:1px; flex:1 1 12px; margin-right:4px; background:var(--visor-rule); opacity:.55; }
.sf-flight-chart__open, .sf-flight-chart__range {
  display:inline-flex; align-items:center; gap:6px; min-height:26px; padding:3px 9px;
  border:1px solid rgb(188 222 234 / .38); border-radius:3px;
  background:rgb(7 17 26 / .84); color:var(--visor-copy); cursor:pointer; pointer-events:auto;
  font:560 12px/1.15 var(--visor-font); white-space:nowrap; text-transform:none; letter-spacing:.01em;
  text-shadow:0 1px 2px rgb(3 8 12 / .85);
}
.sf-flight-chart__open:hover, .sf-flight-chart__range:hover {
  border-color:var(--visor-ice); color:var(--visor-ice); background:rgb(12 28 40 / .92);
}
.sf-flight-chart__open:focus-visible, .sf-flight-chart__range:focus-visible { outline:2px solid var(--visor-ice); outline-offset:2px; border-radius:3px; }
.sf-flight-chart__open kbd {
  min-width:20px; text-align:center;
  padding:1px 5px; border:1px solid rgb(211 232 235 / .56); border-radius:3px;
  background:rgb(16 34 46 / .86); color:#f2f8fa;
  font:700 12px/1.1 var(--visor-font);
}
.sf-flight-chart__sep { display:none; }
.sf-flight-chart__range {
  color:#d8eef4;
}
.sf-flight-chart__range[aria-pressed="true"] {
  border-color:var(--visor-ice); color:var(--visor-ice); background:rgb(18 48 64 / .90);
}

${S} #hud .sf-ft.sf-ft--world-receipt, ${S} .sf-woi[data-visor-anchor="1"] {
  --visor-edge:rgb(191 228 236 / .76);
  isolation:isolate; padding:7px 13px 8px; color:var(--visor-copy);
  font:560 16px/1.22 var(--dp-face-read,sans-serif); letter-spacing:0; text-shadow:0 1px 2px #070d13;
}
${S} #hud .sf-ft--world-receipt:is(.sf-ft--credits,.sf-ft--rights) { --visor-edge:#dac28a; color:#ffe3a9; }
${S} :is(.sf-ft--world-receipt,.sf-woi[data-visor-anchor="1"])::before,
${S} :is(.sf-ft--world-receipt,.sf-woi[data-visor-anchor="1"])::after {
  content:""; position:absolute; pointer-events:none; clip-path:var(--visor-chip-cut);
}
${S} :is(.sf-ft--world-receipt,.sf-woi[data-visor-anchor="1"])::before {
  inset:0; z-index:-1; background:var(--visor-edge); clip-path:var(--visor-chip-rim);
}
${S} :is(.sf-ft--world-receipt,.sf-woi[data-visor-anchor="1"])::after {
  inset:0; z-index:-2; background:linear-gradient(140deg,rgb(12 29 41 / .84),rgb(10 23 34 / .66));
}
${S} #hud .sf-ft--world-receipt .sf-ft-mark {
  position:absolute; z-index:-3; display:block; visibility:var(--stem-visibility,hidden); height:1px;
  left:var(--stem-x,0); top:var(--stem-y,0); width:var(--stem-length,0);
  transform-origin:0 center; transform:rotate(var(--stem-angle,0rad)); background:var(--visor-edge);
}
${S} #hud .sf-ft--world-receipt .sf-ft-mark::after {
  content:""; position:absolute; right:-3px; top:50%; transform:translateY(-50%);
  width:6px; height:6px; border-radius:50%; border:1px solid var(--visor-edge); background:#132531;
}
${S} #hud .sf-ft--world-receipt .sf-ft-mark svg { display:none; }
${S} .sf-woi[data-visor-anchor="1"] :is(.sf-woi__name,.sf-woi__meta,.sf-woi__hint) {
  font-family:var(--dp-face-read,sans-serif); letter-spacing:.01em; font-stretch:normal;
}
${S} .sf-woi[data-visor-anchor="1"] .sf-woi__name { font-size:16px; }
${S} .sf-woi[data-visor-anchor="1"] { max-width:280px !important; }
${S} .sf-woi[data-visor-anchor="1"] .sf-woi__meta { text-transform:none; }
${S} .sf-woi[data-visor-anchor="1"] .sf-woi__leader { color:var(--visor-edge); }
${S} .sf-woi[data-visor-anchor="1"][data-relation="hostile"] { --visor-edge:#ff977d; }
${S} #sf-floorpads .sf-fp:not(.sf-fp--far) {
  --visor-pad-edge:rgb(240 205 145 / .55);
  isolation:isolate; clip-path:var(--visor-chip-cut);
  color:#eed4a1; background:var(--visor-glass); border:0; border-radius:0; box-shadow:none;
  font:600 13px/1.22 var(--visor-font);
}
${S} #sf-floorpads .sf-fp:not(.sf-fp--far)::before {
  content:""; position:absolute; inset:0; z-index:-1; clip-path:var(--visor-chip-rim); background:var(--visor-pad-edge);
}
${S} #sf-floorpads .sf-fp.sf-fp--deny:not(.sf-fp--far) {
  --visor-pad-edge:var(--dp-danger-hot, #ff806b); color:var(--dp-danger-hot, #ff806b);
}
${S} #hud .sf-rightdock:has(.sf-radar-wrap--chart) .race-tape[data-compact="true"] {
  align-self:flex-end; margin:0 6px 4px 0;
}
${S} #hud .sf-rightdock:has(.sf-radar-wrap--chart) .race-tape-actions {
  border:0; border-radius:0; background:linear-gradient(90deg, transparent, rgb(12 27 39 / .85));
}
${S} #hud .sf-rightdock:has(.sf-radar-wrap--chart) .race-tape-actions button {
  border:0; border-radius:0; background:none; color:#c4d5dc;
}
${S} #hud .sf-rightdock:has(.sf-radar-wrap--chart) .race-tape-actions button:enabled:is(:hover,:focus-visible) {
  color:var(--visor-ice); background:rgb(172 213 230 / .1);
}

/* A mission is a small ruled readout on the glass. Comms and cargo keep their own rows. */
${S} #hud > .sf-leftcontext {
  border:0 !important; border-radius:0 !important; padding:0 !important; box-shadow:none !important;
  background:none !important; z-index:14; overflow:visible;
}
${S} #hud > .sf-leftcontext > .sf-mission-tracker {
  background:linear-gradient(90deg, var(--visor-ice) 31px, rgb(146 209 225 / .36) 31px, transparent) top left / 100% 1px no-repeat,
    linear-gradient(90deg, rgb(146 209 225 / .65), transparent) bottom left / 100% 1px no-repeat,
    linear-gradient(90deg, rgb(7 18 27 / .93) 12%, rgb(7 18 27 / .77) 76%, rgb(7 18 27 / .08)) !important;
  padding-block:12px !important; padding-right:10px !important;
}
${S} #hud > .sf-leftcontext > :not(.sf-mission-tracker) { background:linear-gradient(90deg,rgb(7 18 27 / .91),rgb(7 18 27 / .23)) !important; }
${S} #hud > .sf-leftcontext > .sf-commtape {
  padding:5px 9px; row-gap:3px; background:linear-gradient(90deg,rgb(7 18 27 / .74),rgb(7 18 27 / .09)) !important;
}
${S} #hud .sf-commtape__news { padding-top:3px; min-width:0; }
${S} #hud .sf-news-ticker__item { white-space:nowrap; overflow:hidden; text-overflow:ellipsis; }
${S} #hud > .sf-leftcontext:has(.sf-mt--delivery) { width:min(306px, 32vw); max-width:none; }
@media (min-width:761px) {
  :root:not([data-sf-mobile-flight="1"]) ${S} #hud > .sf-leftcontext {
    transform:none; width:min(306px, 32vw); max-width:none;
    left:calc(clamp(18px,2.33vw,39px) + var(--sf-safe-inset-x, 0px));
    top:calc(27px + var(--sf-safe-inset-top, 0px));
  }
  :root:not([data-sf-mobile-flight="1"]) ${S} #hud > .sf-leftcontext > .sf-mission-tracker {
    padding-left:clamp(48px,3.88vw,65px) !important;
  }
  :root:not([data-sf-mobile-flight="1"]) ${S} .sf-mission-tracker .sf-mt-dial { left:8px; width:32px; height:32px; }
  :root:not([data-sf-mobile-flight="1"]) ${S} .sf-mission-tracker:not(.sf-mt--delivery) { padding-right:38px !important; }
  :root:not([data-sf-mobile-flight="1"]) ${S} .sf-mission-tracker :is(.sf-mt-obj,.sf-mt-time) { display:none !important; }
  :root:not([data-sf-mobile-flight="1"]) ${S} .sf-mission-tracker:not(.sf-mt--delivery) .sf-mt-compact { display:block; }
  :root:not([data-sf-mobile-flight="1"]) ${S} .sf-mt-compact-readings {
    color:#bfdae2; font:400 14px/1.4 var(--visor-font); white-space:nowrap; text-overflow:ellipsis; overflow:hidden;
  }
  :root:not([data-sf-mobile-flight="1"]) ${S} .sf-mission-tracker:not(.sf-mt--caption-only):is(:not(.sf-mt--delivery),.sf-mt--has-caption) .sf-mt-details-button {
    display:grid; place-items:center; position:absolute; top:10px; right:9px; width:25px; height:25px;
    border:1px solid transparent; color:#b9e6ec; background:none; cursor:pointer; font-size:0; border-radius:3px;
  }
  :root:not([data-sf-mobile-flight="1"]) ${S} .sf-mt--delivery.sf-mt--has-caption .sf-mt-details-button {
    inset:66px auto auto 9px;
  }
  :root:not([data-sf-mobile-flight="1"]) ${S} .sf-mt-details-button::after {
    content:""; width:6px; height:6px; border:solid currentColor; border-width:0 1.5px 1.5px 0;
    transform:translateY(-2px) rotate(45deg); transition:transform 140ms ease-out;
  }
  :root:not([data-sf-mobile-flight="1"]) ${S} .sf-mt-details-button[aria-expanded="true"]::after {
    transform:translateY(2px) rotate(225deg);
  }
  :root:not([data-sf-mobile-flight="1"]) ${S} .sf-mt-details-button:is(:hover,:focus-visible) { border-color:var(--visor-rule); }
  :root:not([data-sf-mobile-flight="1"]) ${S} .sf-mt-details:not([hidden]) {
    display:flex; flex-direction:column; position:absolute; z-index:2; inset:calc(100% + 8px) 0 auto;
    padding:12px; max-height:40dvh; border:1px solid var(--visor-rule); border-top-color:var(--visor-ice);
    background:var(--visor-glass); color:var(--visor-copy); font:400 15px/1.42 var(--visor-font);
  }
  :root:not([data-sf-mobile-flight="1"]) ${S} .sf-mt-details-close {
    align-self:end; margin-bottom:6px; padding:4px 7px; color:var(--visor-copy); background:none;
    border:1px solid var(--visor-rule); cursor:pointer;
  }
  :root:not([data-sf-mobile-flight="1"]) ${S} .sf-mt-details-text { min-height:0; overflow:auto; white-space:pre-line; }
  :root:not([data-sf-mobile-flight="1"]) ${S} .sf-mt--caption-only .sf-mt-time {
    display:block !important; color:#c3dce3; font:400 14px/1.35 var(--visor-font);
  }
}
@media (min-width:1100px) and (min-height:580px) {
  :root:not([data-sf-mobile-flight="1"]) ${S} #hud > .sf-leftcontext > .sf-commtape:not([hidden]) {
    display:contents; background:none !important;
  }
  :root:not([data-sf-mobile-flight="1"]) ${S} #hud .sf-band-hud {
    top:calc(24px + var(--sf-safe-inset-top,0px));
    right:calc(18px + var(--sf-safe-inset-x,0px));
  }
  :root:not([data-sf-mobile-flight="1"]) ${S} #hud .sf-commtape__slots {
    position:fixed; z-index:15; top:calc(24px + var(--sf-safe-inset-top,0px));
    right:calc(134px + var(--sf-safe-inset-x,0px)); gap:6px; padding:0;
  }
  :root:not([data-sf-mobile-flight="1"]) ${S} #hud .sf-commtape__news:not([hidden]) {
    display:block; padding:4px 7px; margin-top:4px;
    background:linear-gradient(90deg,rgb(7 18 27 / .87),transparent);
  }
}
${S} #hud .sf-commtape .sf-commtape__band { display:none; }
${S} #hud .sf-commtape .sf-comm-backlog-btn,
${S} #hud .sf-commtape .sf-contact-hail__button {
  display:inline-flex; align-items:center; justify-content:center;
  min-height:30px; padding:4px 10px; box-sizing:border-box; line-height:1.2;
  box-shadow:none !important; border-radius:0 !important; background:var(--visor-glass) !important;
  color:#d9ebf0; border:1px solid rgb(165 209 224 / .38) !important;
}
${S} #hud .sf-commtape .sf-contact-hail__button[disabled] { opacity:.38; border-color:transparent !important; }
${S} #hud > .sf-leftcontext > .sf-mission-tracker.sf-mt--delivery {
  padding:11px 12px 12px clamp(49px,3.88vw,65px) !important;
  background:linear-gradient(#93aab0aa,#93aab031) clamp(38px,3.1vw,51px) 15px / 1px 48px no-repeat,
    linear-gradient(90deg,#a5e6ed 0 53px,rgb(169 210 222 / .53) 53px,transparent) bottom left / 100% 1px no-repeat,
    linear-gradient(90deg,rgb(8 25 36 / .9) 35%,rgb(8 25 36 / .72) 80%,rgb(8 25 36 / .12)) !important;
}
${S} #hud .sf-mt--delivery :is(.sf-mt-dial,.sf-mt-title,.sf-mt-obj,.sf-mt-compact) { display:none !important; }
${S} #hud > .sf-leftcontext > .sf-mission-tracker.sf-mt--delivery::before {
  display:block; content:""; position:absolute; width:35px; height:39px; left:5px; top:17px;
  background:#ffd060; transform:none; box-shadow:none; mask:url("${CARGO_MARK}") center / contain no-repeat;
}
${S} #hud > .sf-leftcontext > .sf-mission-tracker.sf-mt--delivery::after {
  content:""; position:absolute; inset:0 0 auto; height:4px;
  background:linear-gradient(90deg,transparent 5px,#a3eef4 5px 54px,transparent 54px 56px,#a3eef4 56px 81px,transparent 81px) top left / 100% 4px no-repeat,
    linear-gradient(90deg,#adc9d2,transparent 98%) center left / 100% 1px no-repeat;
  clip-path:polygon(2px 0,100% 0,100% 100%,0 100%);
}
.sf-mt-delivery { display:grid; gap:3px; color:var(--visor-copy); font:460 clamp(13px,1.09vw,18px)/1.17 var(--visor-font); }
.sf-mt-delivery[hidden] { display:none; }
.sf-mt-delivery b { font:670 clamp(15px,1.44vw,24px)/1.12 var(--visor-font); }
.sf-mt-delivery b + span { display:flex; align-items:center; gap:9px; }
.sf-mt-delivery b + span::before { content:""; display:block; flex:none; width:14px; height:17px; background:#ffcb63; mask:url("${PLACE_MARK}") center / contain no-repeat; }
.sf-mt-delivery__step { display:flex; align-items:center; gap:11px; margin:3px 0 0 -24px; padding-top:7px; border-top:1px solid rgb(169 210 222 / .32); }
.sf-mt-delivery__step::before { content:""; width:20px; height:17px; flex:none; border:1px solid var(--visor-rule); border-radius:3px; }
${S} #hud > .sf-leftcontext > .sf-mission-tracker .sf-mt-title { color:var(--visor-ice); letter-spacing:.04em; font-weight:630; }
${S} #hud > .sf-leftcontext > .sf-mission-tracker :is(.sf-mt-obj,.sf-mt-compact-action) {
  color:var(--visor-copy) !important; font-size:clamp(13px, 1.12vw, 18px) !important; font-weight:650 !important;
  line-height:1.24 !important; letter-spacing:0 !important; word-spacing:normal !important;
}
${S} #hud > .sf-leftcontext > .sf-mission-tracker .sf-mt-dial__ring { fill:rgb(9 22 31 / .45); stroke:var(--visor-rule); }

/* The deck owns choice routing, focus and expiry. The visor finish does not intercept any of them. */
@media (min-width:1100px) and (min-height:580px) {
  ${S} #sf-prompt-deck { right:calc(20px + var(--sf-safe-inset-x, 0px));
    top:calc(61px + var(--sf-safe-inset-top, 0px)); width:clamp(334px, 24.4vw, 405px); max-height:min(51vh, 480px); }
}
@media (min-width:1400px) and (min-height:780px) {
  ${S} #sf-prompt-deck { top:calc(26px + var(--sf-safe-inset-top, 0px)); }
  ${S}:has(#sf-prompt-deck:not([hidden]) .sf-prompt) #hud .sf-band-hud { right:calc(clamp(334px,24.4vw,405px) + 42px + var(--sf-safe-inset-x, 0px)); }
  :root:not([data-sf-mobile-flight="1"]) ${S}:has(#sf-prompt-deck:not([hidden]) .sf-prompt) #hud .sf-commtape__slots {
    right:calc(clamp(334px,24.4vw,405px) + 160px + var(--sf-safe-inset-x,0px));
  }
  ${S}:has(#sf-prompt-deck:not([hidden]) .sf-prompt) .fb-pill-btn { right:calc(clamp(334px,24.4vw,405px) + 300px + var(--sf-safe-inset-x, 0px)); }
}
@media (min-width:1100px) and (min-height:580px) {
  ${S} .fb-pill-btn {
    position:fixed; left:auto; right:calc(294px + var(--sf-safe-inset-x,0px));
    top:calc(24px + var(--sf-safe-inset-top,0px)); z-index:15;
    display:inline-flex; align-items:center; gap:7px; min-height:30px; padding:4px 10px; box-sizing:border-box;
    border:1px solid var(--visor-rule); border-radius:0; background:var(--visor-glass); color:var(--visor-copy);
    font:540 12px/1.2 var(--visor-font); letter-spacing:.02em; text-transform:none;
    box-shadow:none; cursor:pointer; pointer-events:auto; white-space:nowrap;
  }
  ${S} .fb-pill-btn .fb-pill-key {
    padding:1px 5px; border:1px solid rgb(230 239 240 / .55); border-radius:3px;
    background:rgb(8 18 26 / .58); color:var(--visor-ice); font:650 12px/1.15 var(--visor-font);
  }
  ${S} .fb-pill-btn:is(:hover,:focus-visible) { border-color:var(--visor-ice); color:#ffffff; }
}
${S} #sf-prompt-deck .sf-prompt {
  --visor-prompt-edge:var(--visor-rule);
  position:relative; isolation:isolate; padding:13px 15px 15px; border:0; border-radius:0; border-image:none;
  background:none; box-shadow:none; color:var(--visor-copy); font-variation-settings:normal;
}
${S} #sf-prompt-deck .sf-prompt::before, ${S} #sf-prompt-deck .sf-prompt::after {
  content:""; position:absolute; inset:0; pointer-events:none;
}
${S} #sf-prompt-deck .sf-prompt::before {
  z-index:-1; background:var(--visor-prompt-edge); clip-path:var(--visor-panel-rim);
}
${S} #sf-prompt-deck .sf-prompt::after {
  z-index:-2; clip-path:var(--visor-panel-cut); background:var(--visor-glass);
}
${S} #sf-prompt-deck .sf-prompt--warn { --visor-prompt-edge:rgb(245 208 133 / .62); }
${S} #sf-prompt-deck .sf-prompt--danger { --visor-prompt-edge:var(--dp-danger-hot); }
${S} #sf-prompt-deck .sf-prompt__head { color:var(--visor-ice); border-bottom-color:rgb(172 213 230 / .25);
  font:400 clamp(12px,1.075vw,18px)/1.15 var(--visor-font); letter-spacing:.012em; gap:14px; padding:0 0 6px 4px; margin-bottom:8px; }
${S} #sf-prompt-deck .sf-prompt__head::after {
  content:""; position:absolute; z-index:1; pointer-events:none; top:0; left:0; width:47px; height:18px;
  background:var(--visor-ice); clip-path:polygon(0 85%,31% 0,100% 0,100% 2px,34% 2px,0 100%);
}
${S} #sf-prompt-deck [data-deck-id="black-flag:opportunity"] .sf-prompt__head::before {
  background:var(--visor-ice); width:36px; height:26px;
  mask:url("data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' width='30' height='24' viewBox='0 0 30 24'%3E%3Cpath d='M6 3Q-1 12 6 21M10 7Q6 12 10 17M20 7Q24 12 20 17M24 3Q31 12 24 21' fill='none' stroke='black' stroke-width='1.7' stroke-linecap='round'/%3E%3Ccircle cx='15' cy='12' r='2.7'/%3E%3C/svg%3E") center / contain no-repeat;
}
${S} #sf-prompt-deck .sf-prompt__headline { font:650 clamp(17px,1.49vw,25px)/1.12 var(--visor-font); }
${S} #sf-prompt-deck :is(.sf-prompt__detail,.sf-prompt__content) {
  font:400 clamp(13px,1.085vw,18px)/1.33 var(--visor-font); color:var(--visor-copy); text-shadow:none;
}
${S} #sf-prompt-deck .sf-prompt__choices { margin-top:17px; gap:4px; }
@media (min-width:1200px) {
  ${S} #sf-prompt-deck :is(.sf-prompt__head,.sf-prompt__headline) { margin-inline:9px; }
  ${S} #sf-prompt-deck .sf-prompt__detail { margin-inline:9px 0; letter-spacing:-.18px; }
}
${S} #sf-prompt-deck .sf-prompt__choice {
  --visor-choice-edge:rgb(172 213 230 / .19);
  display:grid; grid-template-columns:auto minmax(0,1fr); text-align:left; gap:18px; align-items:center;
  position:relative; isolation:isolate; min-height:41px; padding:4px 18px; border:0; border-radius:0;
  background:rgb(21 41 54 / .18); box-shadow:none; color:var(--visor-copy);
  font:500 clamp(13px, 1.135vw, 19px)/1.18 var(--visor-font); clip-path:var(--visor-chip-cut);
}
${S} #sf-prompt-deck .sf-prompt__choice::before {
  content:""; position:absolute; inset:0; z-index:-1; pointer-events:none;
  background:var(--visor-choice-edge); clip-path:var(--visor-chip-rim);
}
${S} #sf-prompt-deck .sf-prompt__choice span { white-space:normal; overflow-wrap:anywhere; text-overflow:clip; }
${S} #sf-prompt-deck .sf-prompt__choice b {
  min-width:32px; min-height:27px; border:1px solid var(--visor-rule); border-radius:4px; background:rgb(12 22 30 / .56);
  font:700 clamp(14px,1.21vw,20px)/1.12 var(--visor-font);
}
${S} #sf-prompt-deck .sf-prompt__choice:not(:disabled):is(:hover,:focus-visible,.is-highlight) {
  --visor-choice-edge:#f9e5b1;
  background:linear-gradient(90deg,rgb(245 209 145 / .18),rgb(224 181 94 / .10));
  color:#fff7e6; box-shadow:inset 0 0 10px rgb(237 195 127 / .32), inset 0 0 2px #ffe7ac99;
}
${S} #sf-prompt-deck .sf-prompt__choice:not(:disabled)::after {
  content:""; position:absolute; right:15px; top:50%; width:11px; height:6px;
  border:solid #fff1cf; border-width:0 0 2px 2px; transform:translate(2px,-70%) rotate(-45deg); opacity:0;
  transition:opacity 120ms ease, transform 120ms ease;
}
${S} #sf-prompt-deck .sf-prompt__choice:not(:disabled):is(:hover,:focus-visible,.is-highlight)::after { opacity:1; transform:translate(0,-70%) rotate(-45deg); }
${S} #sf-prompt-deck .sf-prompt__choice:not(:disabled):is(:hover,:focus-visible,.is-highlight) span { padding-inline-end:15px; font-weight:620; }
${S} #sf-prompt-deck .sf-prompt__choice:active:not(:disabled) { background:rgb(224 181 94 / .23); }
${S} #sf-prompt-deck .sf-prompt__choice:not(:disabled):is(:hover,:focus-visible,.is-highlight) b {
  border-color:#ded4b9; background:#202a2e; color:#fff6db;
}
${S} #sf-prompt-deck .sf-prompt__choice:focus-visible { outline:1px solid #fff1cf; outline-offset:2px; }
@media (max-width:1100px) {
  ${S} #sf-prompt-deck .sf-prompt__choice { gap:10px; padding-inline:10px; }
  ${S} #sf-prompt-deck .sf-prompt__choice b { min-width:24px; min-height:21px; }
}

/* Receipts sit on a shallow sloped strip, with a severity edge and the real expiry rail. */
${S} #hud .sf-toast, ${S} #sf-stage-feed .sf-toast {
  background:linear-gradient(100deg,rgb(8 25 35 / .96) 32%,rgb(10 23 34 / .87)) !important;
  padding:8px 17px 9px 12px; min-height:33px; gap:8px;
  border:0 !important; border-block-start:1px solid color-mix(in srgb,var(--receipt-mark, var(--visor-ice)) 65%,transparent) !important;
  border-radius:0 !important; clip-path:polygon(0 0,calc(100% - 10px) 0,100% 10px,100% 100%,9px 100%,0 calc(100% - 9px));
  color:var(--visor-copy); box-shadow:none !important;
}
${S} #hud .sf-toast__icon { color:var(--receipt-mark, var(--visor-ice)); }
${S} #hud .sf-toast__decay { opacity:.72; }
${S} #hud .sf-toast:focus-visible, ${S} #sf-stage-feed .sf-toast:focus-visible { outline:1px solid var(--visor-ice); outline-offset:-2px; }
${S} #hud .sf-field-pill {
  background:linear-gradient(90deg,rgb(9 26 38 / .94),rgb(9 26 38 / .76)); border-radius:0;
  clip-path:polygon(0 0,calc(100% - 7px) 0,100% 7px,100% 100%,0 100%);
  font-family:var(--dp-face-read,sans-serif); font-variation-settings:normal; letter-spacing:.055em;
}
${S} :is(#alerts,#sf-stage-banner) .sf-alert:not(.sf-alert--dock) {
  border:0 !important; border-block-start:1px solid var(--visor-rule) !important; border-radius:0 !important;
  background:linear-gradient(90deg,transparent,rgb(8 21 31 / .9) 18%,rgb(8 21 31 / .9) 82%,transparent) !important;
  color:var(--visor-copy); box-shadow:none !important;
}
${S} .sf-alert.sf-alert--dock {
  padding-inline:10px; color:#fff1cf; border:1px solid rgb(245 213 151 / .75) !important;
  border-radius:0 !important; background:rgb(16 24 30 / .90) !important;
}
${S} .sf-alert--dock::before { display:none; }
${S} .sf-alert--dock .sf-alert__text { font-family:var(--dp-face-read, sans-serif); font-weight:660; }
.sf-visor-dock-guide { position:absolute; inset:0; width:100%; height:100%; overflow:visible; pointer-events:none; z-index:2; }
.sf-visor-dock-guide__leader { fill:none; stroke:#f5e8c9; stroke-width:1.5; }
.sf-visor-dock-guide__course { fill:none; stroke:#ecf07e; stroke-opacity:.91; stroke-width:2; stroke-dasharray:8 6; }
.sf-visor-dock-guide__ticks { fill:none; stroke:#ecf07e; stroke-opacity:.87; stroke-width:1.65; stroke-linecap:round; }
.sf-visor-dock-guide__pin { fill:#19262e; stroke:#fff2d5; stroke-width:1.35; }
.sf-alert__dock-chip { display:none; }
${S} .sf-alert.sf-alert--dock[data-visor-anchored] {
  --dock-cut:var(--visor-chip-cut);
  display:flex; justify-content:center; align-items:center; isolation:isolate;
  border:0 !important; background:none !important;
}
${S} .sf-alert--dock[data-visor-anchored] .sf-alert__text {
  position:absolute; width:1px; height:1px; overflow:hidden; clip-path:inset(50%); white-space:nowrap;
}
${S} .sf-alert--dock[data-visor-anchored] .dp-annunc__lens { display:none !important; }
${S} .sf-alert.sf-alert--dock[data-visor-anchored]::before,
${S} .sf-alert.sf-alert--dock[data-visor-anchored]::after {
  content:""; position:absolute; display:block; pointer-events:none; clip-path:var(--dock-cut); border:0; box-shadow:none;
  filter:none; opacity:1; border-radius:0;
}
${S} .sf-alert.sf-alert--dock[data-visor-anchored]::before { inset:0; background:#e8d3a4; z-index:-1; clip-path:var(--visor-chip-rim); }
${S} .sf-alert.sf-alert--dock[data-visor-anchored]::after { inset:0; background:linear-gradient(145deg,rgb(17 29 35 / .93),rgb(10 21 28 / .85)); z-index:-2; }
${S} .sf-alert--dock[data-visor-anchored] .sf-alert__dock-chip {
  display:flex !important; gap:13px; align-items:center; font:600 clamp(17px,1.4vw,23px)/1 var(--visor-font);
}
${S} .sf-alert__dock-chip kbd {
  display:grid; place-items:center; min-width:31px; min-height:24px; padding:2px 5px; background:#faf0d0; color:#15202b; border-radius:4px;
  font:700 clamp(15px,1.18vw,20px)/1.05 var(--visor-font); text-shadow:none; text-align:center;
}
${S} .sf-alert__dock-chip kbd:empty { display:none; }
${S} #hud #sf-ml2 .ml2-preview:not(.ml2-preview-verdict), ${S} #hud .sf-first-use-hint {
  border-color:var(--visor-rule); border-radius:0; background:var(--visor-glass); color:var(--visor-copy);
  box-shadow:none; font-family:var(--dp-face-read, sans-serif);
}
@media (min-width:840px) {
  ${S} #hud #sf-ml2 .ml2-preview.ml2-visor-latch {
    isolation:isolate; min-width:116px; min-height:34px; padding:5px 12px; text-align:center; letter-spacing:0; animation:none;
    color:var(--visor-copy); background:none; border:0; font:600 clamp(17px,1.4vw,23px)/1.16 var(--visor-font);
  }
  ${S} #hud #sf-ml2 .ml2-visor-latch::before, ${S} #hud #sf-ml2 .ml2-visor-latch::after {
    content:""; position:absolute; pointer-events:none; clip-path:var(--visor-chip-cut);
  }
  ${S} #hud #sf-ml2 .ml2-visor-latch::before { inset:0; z-index:-1; background:rgb(204 228 236 / .82); clip-path:var(--visor-chip-rim); }
  ${S} #hud #sf-ml2 .ml2-visor-latch::after { inset:0; z-index:-2; background:rgb(13 29 39 / .86); }
  ${S} #hud #sf-ml2 .ml2-visor-latch kbd {
    display:inline-block; min-width:30px; background:#bcd5df; color:#152431; border-radius:4px; padding:2px 5px; margin-right:12px;
    font:700 clamp(15px,1.18vw,20px)/1.05 var(--visor-font); text-shadow:none;
  }
  ${S} #hud #sf-ml2 .ml2-visor-latch .ml2-visor-verb { display:inline-block; text-transform:lowercase; }
  ${S} #hud #sf-ml2 .ml2-visor-latch .ml2-visor-verb::first-letter { text-transform:uppercase; }
  ${S} #hud #sf-ml2 .ml2-visor-separator {
    position:absolute; width:1px; height:1px; overflow:hidden; clip-path:inset(50%);
  }
  :root:not([data-sf-mobile-flight="1"]) ${S} #sf-ml2 .ml2-preview-link:not(.ml2-snare-preview,.ml2-bridle-preview) .ml2-preview-line {
    stroke:#c1e1ed; stroke-width:1.15; stroke-dasharray:none;
  }
  ${S} #sf-ml2 .ml2-preview-mark.ml2-visor-latch-pin i {
    inset:calc(50% - 5px); border:1.5px solid #d4ebf3; border-radius:50%; box-shadow:none; background:#172631; transform:none;
  }
}
@media (min-width:1400px) and (min-height:680px) {
  ${S} #hud #sf-ml2 .ml2-preview.ml2-visor-latch { min-width:138px; min-height:38px; }
}
${S} #hud .sf-band-hud__button, ${S} .sf-comm-backlog, ${S} .sf-speaker {
  border-radius:0 !important; border-color:var(--visor-rule) !important; background:var(--visor-glass) !important; box-shadow:none !important;
}
${S} #hud .sf-band-hud__button {
  min-height:30px; padding:4px 10px 4px 12px; box-sizing:border-box;
  border:1px solid var(--visor-rule) !important; color:var(--visor-copy);
  font:540 12px/1.2 var(--visor-font); white-space:nowrap;
}
${S} .sf-comm-backlog {
  isolation:isolate; overflow:hidden; background:none !important; border:0 !important;
}
${S} .sf-comm-backlog::before, ${S} .sf-comm-backlog::after {
  content:""; position:absolute; inset:0; pointer-events:none;
}
${S} .sf-comm-backlog::before { z-index:-1; clip-path:var(--visor-panel-rim); background:var(--visor-rule); }
${S} .sf-comm-backlog::after {
  z-index:-2; clip-path:var(--visor-panel-cut); background:var(--visor-glass);
}
@media (min-width:1100px) and (min-height:580px) {
  ${S} .sf-comm-backlog {
    left:auto; right:calc(20px + var(--sf-safe-inset-x,0px)); top:70px;
    transform:none; width:clamp(340px,26vw,430px); max-height:49dvh;
  }
}
${S} .sf-comm-backlog__head { margin:0 16px; padding:12px 5px 8px; border-color:rgb(172 213 230 / .26); }
${S} .sf-comm-backlog__list {
  margin:0 4px 9px; scrollbar-color:#4e7283 transparent;
  mask-image:linear-gradient(#000 calc(100% - 12px),transparent);
}
${S} .sf-comm-backlog__title { color:var(--visor-ice); font:500 18px/1.15 var(--visor-font); }
${S} .sf-comm-backlog__close { border-radius:2px; color:var(--visor-copy); background:transparent; min-height:32px; }
${S} .sf-comm-backlog__sender { color:var(--visor-copy); font:600 15px/1.3 var(--visor-font); }
${S} .sf-comm-backlog__preview {
  display:-webkit-box; -webkit-line-clamp:2; -webkit-box-orient:vertical; overflow:hidden;
  color:#bed1d9; font:400 14px/1.35 var(--visor-font);
}
${S} .sf-comm-backlog__row[open] .sf-comm-backlog__preview { display:none; }
${S} .sf-comm-backlog__text { font:400 15px/1.4 var(--visor-font); }
${S} .sf-comm-backlog__close:hover { border-color:var(--visor-ice); background:rgb(145 208 227 / .08); }
${S} .fb-pill-btn { border-radius:0; border-color:var(--visor-rule); background:var(--visor-glass); box-shadow:none; }
${S} .sf-comm-backlog :is(button,summary):focus-visible { outline:1px solid var(--visor-ice); outline-offset:2px; }
${S} .sf-confirm, ${S} #hud .sf-cargo-panel { border-radius:0; border-color:var(--visor-rule); }
${S} .sf-confirm.sf-confirm--danger { border-top-color:var(--dp-danger-hot); }
${S} .sf-confirm :is(button,[role="button"]):focus-visible { outline:1px solid var(--visor-ice); outline-offset:2px; }
${S} #sf-why-tip { border-radius:0; border-color:var(--visor-rule); background:var(--visor-glass); color:var(--visor-copy); }
${S} #sf-why-tip[data-visor-tip] {
  max-width:min(250px,calc(100vw - 24px)); padding:7px 13px 8px; line-height:1.34;
  border-color:rgb(172 213 230 / .3); border-top-color:var(--visor-ice);
  clip-path:polygon(0 0,calc(100% - 8px) 0,100% 8px,100% 100%,7px 100%,0 calc(100% - 7px));
  color:#cbdde6; box-shadow:none;
}
${S} #sf-why-tip[data-visor-tip]::first-line { font-weight:700; color:#f1f5f3; }

${S} #hud[data-hud="orrery"] > .sf-vtape { display:none !important; }
${S}:has(.orr-cluster--visor [data-power="rig"].is-active) .sf-field-pill.field-cone-projecting {
  display:none !important;
}
@media (prefers-reduced-motion:reduce) {
  ${S} #hud .sf-radar-wrap--chart :is(.sf-radar,.sf-flight-chart), ${S} #sf-prompt-deck .sf-prompt__choice::after { animation:none !important; transition:none !important; }
}
html.sf-reduce-motion ${S} #hud .sf-radar-wrap--chart :is(.sf-radar,.sf-flight-chart),
html.sf-reduce-motion ${S} #sf-prompt-deck .sf-prompt__choice::after { animation:none !important; transition:none !important; }
`;
