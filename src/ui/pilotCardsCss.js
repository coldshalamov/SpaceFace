// OVH-01b — the Pilot Tree cards' stylesheet. Owned by src/ui/pilotCards.js; every selector is
// `.pc-*` so nothing here can reach another screen. Surfaces follow the console standard's lit
// elevations (a key-light pool from the card's own top corner, a vertical ramp, a machined rim) —
// no backdrop blur, no glow filter, no live shadow on a moving value.
export const PILOT_CARDS_STYLE_ID = 'sf-pilot-cards-css';

export const PILOT_CARDS_CSS = `
.pc { --pc-ink:#f4f5f7; --pc-mute:#9a9da4; --pc-dim:#a3a6ad;
  --pc-lamp:var(--dp-lamp, #f2b950); --pc-rule:rgb(255 255 255 / .12);
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
.pc__kicker { font-family:var(--dp-face-read, "Instrument Sans", sans-serif);
  font-weight:600; font-size:14px; letter-spacing:0; text-transform:none; color:var(--pc-lamp); }
.pc__title { margin:0; font-family:var(--dp-face-display, "Archivo", sans-serif);
  font-weight:800; font-size:clamp(26px, 4.4vh, 40px); line-height:1.05; letter-spacing:-.01em; text-transform:none; color:var(--pc-ink); }
.pc__sub { margin:0; font-size:15px; color:var(--pc-dim); }

.pc__hand { display:flex; justify-content:center; align-items:stretch; gap:clamp(12px, 1.6vw, 22px); width:100%; max-width:1080px; }
.pc__card { --pc:#f2b950; --pc-bar:var(--pc);
  position:relative; box-sizing:border-box; flex:1 1 0; min-width:0; max-width:340px; min-height:clamp(250px, 38vh, 310px);
  display:grid; grid-template-rows:auto auto 1fr auto; row-gap:10px; justify-items:start; text-align:left;
  padding:16px 18px 14px; cursor:pointer; color:inherit; font:inherit; border:1px solid rgb(255 255 255 / .1); border-radius:10px;
  background:#16161a;
  box-shadow:none;
  transition:border-color 140ms ease-out, background-color 140ms ease-out;
  animation:pc-rise .46s cubic-bezier(.2,.8,.24,1) both; animation-delay:calc(var(--pc-i, 0) * 70ms); }
.pc__card:hover { background:#1c1c20; border-color:rgb(255 255 255 / .26); }
.pc__card:focus-visible { outline:2px solid var(--pc-lamp); outline-offset:2px; }
.pc__card:active { transform:translateY(1px); }
.pc__card[aria-disabled="true"] { cursor:default; }

/* The rare variants speak with a gold top bar and a lit edge — the same card, dressed up. The old
   clip-path corners cut the card's own focus ring off, so a keyboard player could not see focus
   land on a capstone card at all. */
.pc__card[data-frame="capstone"] { border-color:rgb(242 185 80 / .55); }
.pc__card[data-frame="capstone"]::before { content:""; position:absolute; inset:0 0 auto 0; height:3px;
  border-radius:10px 10px 0 0; background:var(--pc-bar); }
.pc__card[data-frame="evolution"] { --pc-bar:linear-gradient(90deg, var(--pc), var(--pc2, var(--pc)));
  border-color:rgb(242 185 80 / .55); }
.pc__card[data-frame="evolution"]::before { content:""; position:absolute; inset:0 0 auto 0; height:3px;
  border-radius:10px 10px 0 0; background:var(--pc-bar); }

.pc__top { display:flex; align-items:center; gap:12px; width:100%; }
.pc__icon { flex:0 0 auto; display:grid; place-items:center; width:48px; height:48px; color:var(--pc);
  background:#1e1e23; box-shadow:inset 0 0 0 1px rgb(242 185 80 / .4); border-radius:8px; }
.pc__icon .dp-icon { display:block; }
.pc__where { display:flex; flex-direction:column; gap:3px; min-width:0; }
.pc__branch { font-family:var(--dp-face-read, "Instrument Sans", sans-serif);
  font-weight:600; font-size:13px; letter-spacing:0; text-transform:none; color:var(--pc); white-space:nowrap; }
.pc__branch b { font-variant-numeric:tabular-nums; font-weight:700; color:var(--pc-ink); margin-left:.4em; }
.pc__pips { display:flex; gap:4px; }
.pc__pip { width:14px; height:4px; border-radius:2px; background:rgb(255 255 255 / .16); }
.pc__pip[data-held="1"] { background:var(--pc); }
.pc__pip[data-next="1"] { background:transparent; box-shadow:inset 0 0 0 1px var(--pc); }
/* every variant tag is the same chip; only the rare cards' bar fills it gold */
.pc__tag { margin-left:auto; align-self:start; font-family:var(--dp-face-read, "Instrument Sans", sans-serif); font-weight:600;
  font-size:12px; letter-spacing:0; text-transform:none; color:var(--pc-mute);
  padding:3px 8px; border-radius:6px; background:rgb(255 255 255 / .08); white-space:nowrap; }
.pc__card[data-frame="capstone"] .pc__tag, .pc__card[data-frame="evolution"] .pc__tag { color:#16130b; background:var(--pc-bar); padding:3px 8px; }
.pc__name { font-family:var(--dp-face-display, "Archivo", sans-serif);
  font-weight:800; font-size:clamp(22px, 3.2vh, 28px); line-height:1.08; letter-spacing:-.01em; text-transform:none; color:var(--pc-ink); }
.pc__text { font-size:15px; line-height:1.45; letter-spacing:0; text-transform:none; font-weight:400; color:var(--pc-dim); align-self:start; }
.pc__foot { display:flex; align-items:center; gap:10px; width:100%; margin-top:2px; }
.pc__key { display:inline-grid; place-items:center; min-width:30px; height:30px; padding:0 6px; box-sizing:border-box;
  font-family:var(--dp-face-read, "Instrument Sans", sans-serif); font-weight:700; font-size:15px; font-variant-numeric:tabular-nums;
  color:var(--pc-ink); background:#1e1e23; box-shadow:inset 0 0 0 1px rgb(242 185 80 / .55); border-radius:6px; }
.pc__take { font-family:var(--dp-face-read, "Instrument Sans", sans-serif); font-weight:600;
  font-size:13px; letter-spacing:0; text-transform:none; color:var(--pc-mute); }
.pc__card:hover .pc__take, .pc__card:focus-visible .pc__take { color:var(--pc); }

.pc__bar { display:flex; align-items:center; justify-content:center; flex-wrap:wrap; gap:14px 22px; width:100%; max-width:1080px; }
.pc__key2 { display:inline-flex; align-items:center; gap:10px; min-height:44px; padding:0 18px; box-sizing:border-box; cursor:pointer;
  font-family:var(--dp-face-etch, var(--sf-subhead-face, inherit)); font-weight:700; font-variation-settings:"wght" 740, "wdth" 66;
  font-size:14px; letter-spacing:0; text-transform:none; color:var(--pc-ink); border:1px solid rgb(255 255 255 / .14); border-radius:8px;
  background:#1a1a1d; box-shadow:none; }
.pc__key2:hover { background:#242428; border-color:rgb(255 255 255 / .3); }
.pc__key2:focus-visible { outline:2px solid var(--pc-lamp); outline-offset:2px; }
.pc__key2[aria-disabled="true"] { color:var(--pc-mute); cursor:not-allowed; background:#16161a;
  border-color:rgb(255 255 255 / .08); }
.pc__key2 kbd { font:inherit; font-size:13px; padding:2px 6px; background:rgb(0 0 0 / .25); box-shadow:none; border-radius:6px; }
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
  /* A phone stacks the hand in its own scroll well between the head and the bar: every card keeps
     its own height (flex-basis 0 in a column collapsed them onto each other), and no card ever
     sits under Re-roll and Later, whatever the phone's height. */
  .pc { justify-content:flex-start; overflow:hidden; gap:12px; padding:16px 16px 0; }
  .pc__head, .pc__bar, .pc__status { flex:0 0 auto; }
  .pc__head { gap:4px; }
  /* The well starts at the top: the desktop row centres the hand, and a centred column that
     overflows clips card 1's head where no scroll can reach it. */
  .pc__hand { flex:1 1 auto; min-height:0; overflow-y:auto; overscroll-behavior:contain;
    flex-direction:column; justify-content:flex-start; align-items:stretch; gap:12px; max-width:428px; overflow-anchor:none;
    padding:6px 6px 12px; margin:-6px 0 0; box-sizing:border-box; scroll-padding:8px 0 12px; }
  .pc__card { flex:0 0 auto; max-width:none; min-height:0; row-gap:8px; padding:14px 16px 12px; }
  .pc__icon { width:44px; height:44px; }
  .pc__name { font-size:22px; }
  .pc__text { font-size:16px; }
  /* Re-roll and Later sit on a solid foot under the well: the purse is one quiet line above the
     two keys, and a short shadow on the foot's top edge says the hand runs on below it. */
  .pc__bar { position:relative; z-index:1; gap:8px 12px; width:calc(100% + 32px); max-width:none; margin:0 -16px;
    padding:12px 16px calc(16px + env(safe-area-inset-bottom, 0px)); box-sizing:border-box;
    background:rgb(5 6 9); box-shadow:0 -1px 0 rgb(232 226 212 / .12), 0 -14px 18px rgb(3 4 7 / .78); }
  .pc__purse { order:-1; flex:0 0 100%; text-align:center; font-size:13px; }
  .pc__key2 { padding:0 12px; gap:8px; }
  .pc__status:empty { display:none; }
}
@media (forced-colors: active) {
  .pc__card { border:1px solid CanvasText; background:Canvas; forced-color-adjust:none; color:CanvasText; box-shadow:none; }
  .pc__card:focus-visible { outline:3px solid Highlight; }
  .pc__fill { background:Highlight; }
}
`;
