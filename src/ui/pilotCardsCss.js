// OVH-01b — the Pilot Tree cards' stylesheet. Owned by src/ui/pilotCards.js; every selector is
// `.pc-*` so nothing here can reach another screen. Surfaces follow the console standard's lit
// elevations (a key-light pool from the card's own top corner, a vertical ramp, a machined rim) —
// no backdrop blur, no glow filter, no live shadow on a moving value.
export const PILOT_CARDS_STYLE_ID = 'sf-pilot-cards-css';

export const PILOT_CARDS_CSS = `
.pc { --pc-ink:var(--dp-ink, #ece6d6); --pc-mute:var(--dp-ink-mute, #a39d8f); --pc-dim:var(--dp-ink-dim, #c8c2b2);
  --pc-lamp:var(--dp-lamp, #f2b950); --pc-rule:var(--dp-rule-hi, rgb(232 226 212 / .22));
  position:relative; box-sizing:border-box; display:flex; flex-direction:column; align-items:center; justify-content:center;
  gap:clamp(14px, 3vh, 26px); width:100%; height:100%; padding:clamp(18px, 4vh, 44px) 24px;
  color:var(--pc-ink); font-family:var(--dp-face-read, var(--sf-data-face, system-ui, sans-serif)); }
.pc-screen { flex:1 1 auto; align-self:stretch; width:100%; height:100%; }
.pc--screen { background:
  radial-gradient(ellipse 72% 62% at 50% 52%, rgb(8 10 14 / .30), rgb(3 4 7 / .72) 80%),
  linear-gradient(180deg, rgb(3 4 7 / .45), rgb(3 4 7 / .7)); }
.pc--overlay { position:fixed; inset:0; z-index:60; height:auto; background:
  radial-gradient(ellipse 72% 62% at 50% 54%, rgb(8 10 14 / .30), rgb(3 4 7 / .72) 80%); }

.pc__head { display:flex; flex-direction:column; align-items:center; gap:6px; text-align:center; }
.pc__kicker { font-family:var(--dp-face-etch, var(--sf-subhead-face, inherit)); font-variation-settings:"wght" 720, "wdth" 66;
  font-weight:700; font-size:14px; letter-spacing:.14em; text-transform:uppercase; color:var(--pc-lamp); }
.pc__title { margin:0; font-family:var(--dp-face-etch, var(--sf-data-face, inherit)); font-variation-settings:"wght" 820, "wdth" 78;
  font-weight:700; font-size:clamp(26px, 4.4vh, 40px); line-height:1.05; letter-spacing:.04em; text-transform:uppercase; color:var(--pc-ink); }
.pc__sub { margin:0; font-size:15px; color:var(--pc-dim); }

.pc__hand { display:flex; justify-content:center; align-items:stretch; gap:clamp(12px, 1.6vw, 22px); width:100%; max-width:1080px; }
.pc__card { --pc:#f2b950; --pc-bar:var(--pc);
  position:relative; box-sizing:border-box; flex:1 1 0; min-width:0; max-width:340px; min-height:clamp(250px, 38vh, 310px);
  display:grid; grid-template-rows:auto auto 1fr auto; row-gap:10px; justify-items:start; text-align:left;
  padding:16px 18px 14px; cursor:pointer; color:inherit; font:inherit; border:0; border-radius:2px;
  background:
    radial-gradient(120% 70% at 12% 0%, color-mix(in srgb, var(--pc) 17%, transparent), transparent 62%),
    linear-gradient(180deg, rgb(26 29 36 / .98), rgb(12 14 19 / .99));
  box-shadow:
    inset 0 2px 0 var(--pc),
    inset 0 0 0 1px rgb(232 226 212 / .14),
    inset 0 -2px 0 rgb(0 0 0 / .55),
    0 18px 38px rgb(0 0 0 / .55), 0 2px 5px rgb(0 0 0 / .6);
  animation:pc-rise .46s cubic-bezier(.2,.8,.24,1) both; animation-delay:calc(var(--pc-i, 0) * 70ms); }
.pc__card:hover { background:
    radial-gradient(120% 70% at 12% 0%, color-mix(in srgb, var(--pc) 28%, transparent), transparent 66%),
    linear-gradient(180deg, rgb(32 36 44 / .98), rgb(15 17 23 / .99)); }
.pc__card:focus-visible { outline:2px solid var(--pc-lamp); outline-offset:3px; }
.pc__card:active { transform:translateY(1px); }
.pc__card[aria-disabled="true"] { cursor:default; }

.pc__card[data-frame="capstone"] { clip-path:polygon(14px 0, calc(100% - 14px) 0, 100% 14px, 100% calc(100% - 14px), calc(100% - 14px) 100%, 14px 100%, 0 calc(100% - 14px), 0 14px);
  box-shadow:
    inset 0 4px 0 var(--pc), inset 0 0 0 1px color-mix(in srgb, var(--pc) 70%, transparent),
    inset 0 0 0 5px rgb(10 12 16 / .96), inset 0 0 0 6px color-mix(in srgb, var(--pc) 42%, transparent),
    inset 0 -2px 0 rgb(0 0 0 / .55); }
.pc__card[data-frame="evolution"] { --pc-bar:linear-gradient(90deg, var(--pc), var(--pc2, var(--pc)));
  clip-path:polygon(0 0, calc(100% - 20px) 0, 100% 20px, 100% 100%, 20px 100%, 0 calc(100% - 20px));
  box-shadow:
    inset 0 4px 0 var(--pc), inset 0 0 0 1px color-mix(in srgb, var(--pc2, var(--pc)) 70%, transparent),
    inset 0 0 0 5px rgb(10 12 16 / .96), inset 0 0 0 6px color-mix(in srgb, var(--pc2, var(--pc)) 45%, transparent),
    inset 0 -4px 0 var(--pc2, var(--pc)); }
.pc__card[data-frame="evolution"]::before { content:""; position:absolute; inset:0 0 auto 0; height:4px; background:var(--pc-bar); }

.pc__top { display:flex; align-items:center; gap:12px; width:100%; }
.pc__icon { flex:0 0 auto; display:grid; place-items:center; width:56px; height:56px; color:var(--pc);
  background:radial-gradient(circle at 50% 38%, color-mix(in srgb, var(--pc) 24%, transparent), rgb(8 10 14 / .9) 72%);
  box-shadow:inset 0 0 0 1px color-mix(in srgb, var(--pc) 55%, transparent); border-radius:50%; }
.pc__icon .dp-icon { display:block; }
.pc__where { display:flex; flex-direction:column; gap:3px; min-width:0; }
.pc__branch { font-family:var(--dp-face-etch, var(--sf-subhead-face, inherit)); font-variation-settings:"wght" 740, "wdth" 66;
  font-weight:700; font-size:14px; letter-spacing:.1em; text-transform:uppercase; color:var(--pc); white-space:nowrap; }
.pc__branch b { font-variant-numeric:tabular-nums; font-weight:800; color:var(--pc-ink); margin-left:.4em; }
.pc__pips { display:flex; gap:4px; }
.pc__pip { width:14px; height:5px; background:rgb(232 226 212 / .16); }
.pc__pip[data-held="1"] { background:var(--pc); }
.pc__pip[data-next="1"] { background:transparent; box-shadow:inset 0 0 0 1px var(--pc); }
.pc__tag { margin-left:auto; align-self:start; font-family:var(--dp-face-etch, var(--sf-subhead-face, inherit)); font-weight:700;
  font-variation-settings:"wght" 740, "wdth" 64; font-size:12px; letter-spacing:.12em; text-transform:uppercase; color:var(--pc-mute);
  white-space:nowrap; }
.pc__card[data-frame="capstone"] .pc__tag, .pc__card[data-frame="evolution"] .pc__tag { color:#16130b; background:var(--pc-bar); padding:3px 7px 2px; }
.pc__name { font-family:var(--dp-face-etch, var(--sf-data-face, inherit)); font-variation-settings:"wght" 800, "wdth" 80; font-weight:700;
  font-size:clamp(22px, 3.2vh, 28px); line-height:1.08; letter-spacing:.03em; text-transform:uppercase; color:var(--pc-ink); }
.pc__text { font-size:17px; line-height:1.4; letter-spacing:0; text-transform:none; font-weight:500; color:var(--pc-dim); align-self:start; }
.pc__foot { display:flex; align-items:center; gap:10px; width:100%; margin-top:2px; }
.pc__key { display:inline-grid; place-items:center; min-width:30px; height:30px; padding:0 6px; box-sizing:border-box;
  font-family:var(--dp-face-read, var(--sf-data-face, monospace)); font-weight:700; font-size:16px; font-variant-numeric:tabular-nums;
  color:var(--pc-ink); background:rgb(8 10 14 / .9); box-shadow:inset 0 0 0 1px var(--pc), inset 0 -2px 0 rgb(0 0 0 / .55); border-radius:2px; }
.pc__take { font-family:var(--dp-face-etch, var(--sf-subhead-face, inherit)); font-weight:700; font-variation-settings:"wght" 720, "wdth" 64;
  font-size:13px; letter-spacing:.12em; text-transform:uppercase; color:var(--pc-mute); }
.pc__card:hover .pc__take, .pc__card:focus-visible .pc__take { color:var(--pc); }

.pc__bar { display:flex; align-items:center; justify-content:center; flex-wrap:wrap; gap:14px 22px; width:100%; max-width:1080px; }
.pc__key2 { display:inline-flex; align-items:center; gap:10px; min-height:44px; padding:0 18px; box-sizing:border-box; cursor:pointer;
  font-family:var(--dp-face-etch, var(--sf-subhead-face, inherit)); font-weight:700; font-variation-settings:"wght" 740, "wdth" 66;
  font-size:14px; letter-spacing:.1em; text-transform:uppercase; color:var(--pc-ink); border:0; border-radius:2px;
  background:linear-gradient(180deg, rgb(36 40 48 / .98), rgb(18 20 26 / .99));
  box-shadow:inset 0 1px 0 rgb(232 226 212 / .22), inset 0 0 0 1px rgb(232 226 212 / .14), inset 0 -2px 0 rgb(0 0 0 / .55); }
.pc__key2:hover { background:linear-gradient(180deg, rgb(46 50 60 / .98), rgb(22 25 32 / .99)); }
.pc__key2:focus-visible { outline:2px solid var(--pc-lamp); outline-offset:3px; }
.pc__key2[aria-disabled="true"] { color:var(--pc-mute); cursor:not-allowed; background:rgb(14 16 21 / .9);
  box-shadow:inset 0 0 0 1px rgb(232 226 212 / .1); }
.pc__key2 kbd { font:inherit; font-size:13px; padding:2px 6px; background:rgb(8 10 14 / .9); box-shadow:inset 0 0 0 1px rgb(232 226 212 / .28); border-radius:2px; }
.pc__price { font-variant-numeric:tabular-nums; color:var(--pc-lamp); }
.pc__key2[aria-disabled="true"] .pc__price { color:var(--pc-mute); }
.pc__purse { font-size:14px; color:var(--pc-mute); font-variant-numeric:tabular-nums; }
.pc__purse--short { color:var(--dp-danger-hot, #ff7a5c); }
.pc__timer { display:flex; align-items:center; gap:10px; min-width:200px; font-size:14px; color:var(--pc-mute); font-variant-numeric:tabular-nums; }
.pc__track { position:relative; flex:1 1 auto; height:4px; min-width:96px; background:var(--pc-rule); }
.pc__fill { position:absolute; inset:0 auto 0 0; width:100%; background:var(--pc-lamp); }
.pc__status { min-height:20px; margin:0; font-size:15px; color:var(--dp-danger-hot, #ff7a5c); text-align:center; }

@keyframes pc-rise { from { opacity:0; transform:translateY(34px); } to { opacity:1; transform:none; } }
html.sf-reduce-motion .pc__card, .sf-reduce-motion .pc__card { animation:none; }
@media (prefers-reduced-motion: reduce) { .pc__card { animation:none; } }
@media (max-width: 760px) {
  /* A phone stacks the hand and scrolls the overlay: every card keeps its own height (flex-basis
     0 in a column collapsed them onto each other and under the re-roll bar). */
  .pc { justify-content:flex-start; overflow-y:auto; gap:16px; padding:20px 16px 24px; }
  .pc__head, .pc__hand, .pc__bar, .pc__status { flex:0 0 auto; }
  .pc__hand { flex-direction:column; align-items:stretch; gap:12px; max-width:420px; }
  .pc__card { flex:0 0 auto; max-width:none; min-height:0; row-gap:8px; padding:14px 16px 12px; }
  .pc__icon { width:44px; height:44px; }
  .pc__name { font-size:22px; }
  .pc__text { font-size:16px; }
  /* Re-roll and Later stay on screen while the hand scrolls under them. */
  .pc__bar { gap:12px 16px; position:sticky; bottom:-24px; z-index:1; margin-top:auto;
    padding:16px 0 calc(16px + env(safe-area-inset-bottom, 0px));
    background:linear-gradient(180deg, rgb(3 4 7 / 0), rgb(3 4 7 / .94) 28%); }
  .pc__status:empty { display:none; }
}
@media (forced-colors: active) {
  .pc__card { border:1px solid CanvasText; background:Canvas; forced-color-adjust:none; color:CanvasText; box-shadow:none; }
  .pc__card:focus-visible { outline:3px solid Highlight; }
  .pc__fill { background:Highlight; }
}
`;
