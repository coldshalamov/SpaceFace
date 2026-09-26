// ORRERY settings preview (design/frontend/ORRERY.md §6 Meta: "Settings: every change previews live in a
// miniature Cluster/HUD beside the list").
//
// One instrument beside the settings list that shows what the focused row changes, live:
//   · AUDIO    — a mixer: every channel an arc of light round one pivot. The lit arc is what reaches
//                the speakers (master x channel), the bone tick on each ring is the channel's own
//                setting, Mute all drops the arcs to ghosts. The focused channel carries the bloom and
//                its output reads as a thin numeral at the hub.
//   · VIDEO / GAMEPLAY / ACCESS — the flight Cluster itself (flightCluster.js, the live HUD's
//                instrument), in miniature, reacting where a setting is TRUE of the HUD: UI scale
//                (the Cluster grows against a bracket of its 1.00x footprint), bloom (its glow),
//                high contrast, the readable font, reduced motion (it stills), screen shake (it
//                shakes on change), damage numbers, tutorial hints, captions (size and backing), the
//                flight model (the drift pip), FOV (a view wedge). Settings no DOM can show (shadows,
//                render scale, frame cap) are read out, never faked.
//   · CONTROLS — a bind dial: the focused verb's key, huge and thin inside a ring, the scheme lettered
//                round the rim; while a row listens for a key the ring runs ice (data in motion).
// Every tab also carries the READING: the focused row's name and its value, the value flashing ice
// when it changes. The Cluster's own amber is re-toned to bone here: the one Hand on this screen is
// the settings Hand, not the miniature's.
//
// The preview is decoration for sighted players: aria-hidden and inert (the Cluster's verb sockets are
// focusable in flight and must not join the settings tab order). It stands down where the document has
// no SVG (test shims), and loads the Cluster lazily so a broken Cluster never blanks Settings.
import { svg, arcD, polar, ticksD, circularText } from './svg.js';
import { createSpring, reducedMotion } from './motion.js';
import { injectOrrery } from './tokens.js';
import { createCounter, decrypt } from './text.js';

const STYLE_ID = 'sf-orrery-settings-preview';
const BONE = '236 230 216';
const LABEL = 'font-family:var(--dp-face-label, "Archivo"); font-stretch:112%; font-variation-settings:"wdth" 112, "wght" 650; font-weight:650; text-transform:uppercase;';

/** The mixer's channels, outermost first. Keys are settings.audio keys; labels match the rows. */
export const MIXER_CHANNELS = Object.freeze([
  Object.freeze({ key: 'master', label: 'Master' }),
  Object.freeze({ key: 'sfx', label: 'SFX' }),
  Object.freeze({ key: 'music', label: 'Music' }),
  Object.freeze({ key: 'engine', label: 'Engine' }),
  Object.freeze({ key: 'ambient', label: 'Ambient' }),
  Object.freeze({ key: 'combat', label: 'Combat' }),
  Object.freeze({ key: 'ui', label: 'UI' }),
  Object.freeze({ key: 'comms', label: 'Comms' }),
]);

/** What reaches the speakers for one channel: master x channel, zero when muted. Pure. */
export function channelOutput(audio = {}, key = 'master') {
  const lvl = (k) => {
    const v = audio && audio[k];
    if (v == null) return k === 'master' ? 1 : 0.7;
    return Math.max(0, Math.min(1, Number(v) || 0));
  };
  if (audio && audio.muted) return 0;
  return key === 'master' ? lvl('master') : lvl('master') * lvl(key);
}

const CSS = `
.orr-set-preview { position:relative; min-width:0; min-height:0; display:grid; grid-template-rows:auto minmax(0, 1fr) auto; row-gap:14px;
  color:rgb(${BONE}); pointer-events:none; }
.orr-set-preview::before { content:""; position:absolute; inset:-6% -8% -4% -10%; z-index:-1; pointer-events:none;
  background:radial-gradient(closest-side, rgb(4 6 9 / .74), rgb(4 6 9 / .5) 58%, rgb(4 6 9 / 0)); }
/* the reading: the focused row's name and value */
.orr-set-read { display:grid; grid-template-columns:auto minmax(0, 1fr); column-gap:22px; align-items:end; min-height:92px; }
.orr-set-read__kicker { grid-column:1 / -1; ${LABEL} font-size:10.5px; letter-spacing:.24em; color:rgb(${BONE} / .6); margin-bottom:12px;
  display:flex; align-items:center; gap:12px; }
.orr-set-read__kicker::after { content:""; flex:0 0 56px; height:1px; background:linear-gradient(90deg, rgb(${BONE} / .4), rgb(${BONE} / 0)); }
.orr-set-read__value { grid-column:1; font-family:var(--dp-face-numeral, "Archivo"); font-stretch:100%; font-variation-settings:"wdth" 100, "wght" 250; font-weight:250;
  font-size:72px; line-height:.84; letter-spacing:-.02em; font-variant-numeric:tabular-nums lining-nums; color:rgb(248 244 234); white-space:nowrap;
  text-shadow:0 0 22px rgb(0 0 0 / .5); transition:color 900ms var(--dp-ease-out, ease-out), text-shadow 900ms var(--dp-ease-out, ease-out); }
.orr-set-read__value.is-word { font-size:40px; line-height:1; letter-spacing:-.005em; font-variation-settings:"wdth" 100, "wght" 300; font-weight:300; }
.orr-set-read__value.is-long { font-size:28px; }
/* the counter rolls one em per digit: its box keeps line-height 1 */
.orr-set-read__value.orr-counter { display:inline-flex; height:1em; line-height:1; overflow:hidden; }
.orr-set-read__value.orr-counter .orr-counter__digit { width:.55em; }
.orr-set-read__value.orr-counter .orr-counter__digit > span { transition-duration:420ms; }
.orr-set-read__value.is-flash { color:var(--dp-ice, #8fcbff); text-shadow:0 0 18px rgb(143 203 255 / .35); transition:none; }
.orr-set-read__name { grid-column:2; align-self:end; padding-bottom:6px; ${LABEL} font-size:12px; letter-spacing:.2em; color:rgb(248 244 234 / .92);
  overflow:hidden; text-overflow:ellipsis; white-space:nowrap; }
.orr-set-preview[data-mode="dial"] .orr-set-read { min-height:0; }
.orr-set-preview[data-mode="dial"] :is(.orr-set-read__value, .orr-set-read__name) { display:none; }
.orr-set-read__name small { display:block; margin-top:6px; font-size:10px; letter-spacing:.2em; color:rgb(${BONE} / .56); }
/* the stage holds one instrument at a time */
.orr-set-stage { position:relative; min-height:0; }
.orr-set-stage > * { position:absolute; inset:0; }
.orr-set-preview:not([data-mode="mixer"]) .orr-set-mixer,
.orr-set-preview:not([data-mode="hud"]) .orr-set-hud,
.orr-set-preview:not([data-mode="dial"]) .orr-set-dial { display:none; }
.orr-set-mixer svg, .orr-set-dial svg { position:absolute; left:50%; top:50%; transform:translate(-50%, -50%); width:min(100%, var(--orr-set-side, 560px)); height:auto; aspect-ratio:1; overflow:visible; }
.orr-set-preview .orr-svg text { font-family:var(--dp-face-label, "Archivo"); }
.orr-set-preview .orr-svg :is(.orr-core, .orr-bloom), .orr-set-preview .orr-svg path, .orr-set-preview .orr-svg circle { vector-effect:none !important; }
.orr-set-mixer .orr-set-mixer__lab { font-size:calc(10.5px * var(--orr-set-k, 1)); letter-spacing:.18em; fill:rgb(${BONE} / .66); text-anchor:end; font-weight:650; }
.orr-set-mixer .orr-set-mixer__lab.is-focus { fill:rgb(248 244 234); }
.orr-set-mixer .orr-set-mixer__grad { font-size:calc(9.5px * var(--orr-set-k, 1)); letter-spacing:.12em; fill:rgb(${BONE} / .66); text-anchor:middle; font-weight:600; }
.orr-set-mixer .orr-set-mixer__fill { transition:opacity .2s linear; }
.orr-set-mixer .orr-set-ch:not(.is-focus) .orr-set-mixer__fill.orr-core { opacity:.72; }
.orr-set-mixer .orr-set-ch:not(.is-focus) .orr-set-mixer__fill.orr-bloom { opacity:.14; }
.orr-set-mixer .orr-set-ch.is-focus .orr-set-mixer__fill.orr-bloom { opacity:.38; }
.orr-set-mixer.is-muted .orr-set-mixer__fill { opacity:0 !important; }
.orr-set-mixer .orr-set-mixer__ghost { opacity:0; transition:opacity .2s linear; }
.orr-set-mixer.is-muted .orr-set-mixer__ghost { opacity:1; }
.orr-set-mixer__hub { position:absolute; left:50%; top:50%; transform:translate(-50%, -50%); display:flex; flex-direction:column; align-items:center; gap:7px; }
.orr-set-mixer__out { font-family:var(--dp-face-numeral, "Archivo"); font-variation-settings:"wdth" 100, "wght" 260; font-weight:260; font-size:46px; line-height:.86;
  font-variant-numeric:tabular-nums; color:var(--dp-phos, #dfeeff); letter-spacing:-.02em; }
.orr-set-mixer__out small { font-size:.42em; margin-left:2px; color:rgb(${BONE} / .7); }
.orr-set-mixer.is-muted .orr-set-mixer__out { font-size:22px; font-variation-settings:"wdth" 112, "wght" 650; letter-spacing:.24em; text-transform:uppercase; color:rgb(248 244 234); }
.orr-set-mixer__outlab { ${LABEL} font-size:9.5px; letter-spacing:.2em; color:rgb(${BONE} / .66); white-space:nowrap; }
/* the miniature HUD */
.orr-set-hud { --dp-hand:rgb(${BONE}); --dp-hand-hot:rgb(248 244 234); --dp-lamp:rgb(${BONE}); --dp-lamp-hot:rgb(248 244 234); overflow:visible; }
.orr-set-hud__frame { position:absolute; left:0; top:0; width:760px; height:540px; transform-origin:0 0; }
.orr-set-hud__frame > .orr-cluster { position:absolute !important; left:0; bottom:0; }
.orr-set-hud.is-bloomless .orr-bloom { opacity:0 !important; }
.orr-set-hud { --dp-bloom-a:var(--orr-set-bloom, .22); }
.orr-set-hud.is-hc { --dp-line:rgb(${BONE} / .6); --dp-line-faint:rgb(${BONE} / .34); --dp-line-hi:rgb(${BONE} / .92); --dp-ink-dim:rgb(248 244 234); }
.orr-set-hud.is-hc .orr-label { color:rgb(248 244 234) !important; }
.orr-set-hud.is-readable .orr-label, .orr-set-hud.is-readable .orr-value, .orr-set-hud.is-readable .orr-set-hud__cap, .orr-set-hud.is-readable .orr-set-hud__hint {
  font-family:"OpenDyslexic", "Atkinson Hyperlegible", "Verdana", system-ui, sans-serif !important; letter-spacing:.04em; }
.orr-set-hud.is-still *, .orr-set-hud.is-still *::before, .orr-set-hud.is-still *::after { animation:none !important; }
/* the 1.00x footprint when the scale is not 1 */
.orr-set-hud__foot { position:absolute; pointer-events:none; opacity:0; transition:opacity .2s linear; }
.orr-set-hud__foot.is-on { opacity:1; }
.orr-set-hud__foot::before, .orr-set-hud__foot::after { content:""; position:absolute; width:14px; height:14px; border-color:rgb(${BONE} / .5); border-style:solid; }
.orr-set-hud__foot::before { right:0; top:0; border-width:1px 1px 0 0; }
.orr-set-hud__foot::after { left:0; top:0; border-width:1px 0 0 1px; }
.orr-set-hud__foot > i { position:absolute; left:0; top:-18px; font-style:normal; ${LABEL} font-size:10px; letter-spacing:.2em; color:rgb(${BONE} / .7); }
/* overlays the HUD really draws: a damage number, a hint, a caption */
.orr-set-hud__dmg { position:absolute; font-family:var(--dp-face-numeral, "Archivo"); font-variation-settings:"wdth" 100, "wght" 420; font-weight:420; font-size:22px;
  color:rgb(248 244 234); text-shadow:0 0 2px rgb(3 4 7), 0 0 8px rgb(3 4 7 / .8); opacity:0; transition:opacity .2s linear; white-space:nowrap; }
.orr-set-hud__dmg.is-on { opacity:1; }
.orr-set-hud__hint { position:absolute; left:0; right:0; top:0; ${LABEL} font-size:11px; letter-spacing:.18em; color:rgb(248 244 234 / .9);
  text-shadow:0 0 2px rgb(3 4 7), 0 0 8px rgb(3 4 7 / .8); opacity:0; transition:opacity .2s linear; white-space:nowrap; }
.orr-set-hud__hint.is-on { opacity:1; }
.orr-set-hud__hint b { font-weight:800; color:rgb(248 244 234); margin:0 .3em; }
.orr-set-hud__cap { position:absolute; left:0; right:0; bottom:0; text-align:center; font-family:var(--dp-face-read, "Instrument Sans"); font-size:15px; line-height:1.4;
  color:rgb(248 244 234); text-shadow:0 0 2px rgb(3 4 7), 0 0 8px rgb(3 4 7 / .85); opacity:0; transition:opacity .2s linear; }
.orr-set-hud__cap.is-on { opacity:1; }
.orr-set-hud__cap span { padding:3px 10px; box-decoration-break:clone; -webkit-box-decoration-break:clone; }
.orr-set-hud__cap.is-backed span { background:rgb(3 4 7 / .78); text-shadow:none; }
.orr-set-hud__cap.is-small { font-size:13px; }
.orr-set-hud__cap.is-large { font-size:19px; }
.orr-set-hud__cap b { ${LABEL} font-size:.72em; letter-spacing:.18em; margin-right:10px; color:rgb(${BONE} / .8); }
.orr-set-hud__fov { position:absolute; right:0; top:0; width:170px; height:120px; overflow:visible; opacity:0; transition:opacity .2s linear; }
.orr-set-hud__fov.is-on { opacity:1; }
.orr-set-hud__fov text { font-size:9.5px; letter-spacing:.2em; fill:rgb(${BONE} / .7); font-weight:650; }
/* the bind dial */
.orr-set-dial__key { position:absolute; left:50%; top:50%; transform:translate(-50%, -58%); max-width:62%; text-align:center;
  font-family:var(--dp-face-numeral, "Archivo"); font-variation-settings:"wdth" 100, "wght" 250; font-weight:250; font-size:92px; line-height:.9;
  color:rgb(248 244 234); letter-spacing:-.01em; white-space:nowrap; text-shadow:0 0 22px rgb(0 0 0 / .5); }
.orr-set-dial__key.is-mid { font-size:58px; }
.orr-set-dial__key.is-long { font-size:34px; white-space:normal; line-height:1.05; }
.orr-set-dial__verb { position:absolute; left:50%; top:50%; transform:translate(-50%, 0); margin-top:calc(var(--orr-set-side, 420px) * .11); ${LABEL} font-size:11px; letter-spacing:.2em;
  color:rgb(${BONE} / .72); white-space:nowrap; text-align:center; }
.orr-set-dial.is-listening .orr-set-dial__key { color:var(--dp-ice, #8fcbff); }
.orr-set-dial .orr-set-dial__listen { opacity:0; }
.orr-set-dial.is-listening .orr-set-dial__listen { opacity:1; animation:orr-set-listen 1.6s linear infinite; transform-box:view-box; transform-origin:50% 50%; }
@keyframes orr-set-listen { to { transform:rotate(360deg); } }
.orr-set-dial .orr-set-dial__dz { opacity:0; transition:opacity .2s linear; }
.orr-set-dial.is-dz .orr-set-dial__dz { opacity:1; }
.orr-set-dial.is-dz .orr-set-dial__key { transform:translate(-50%, -50%); }
.orr-set-dial .orr-set-dial__rim text { font-size:calc(9.5px * var(--orr-set-kd, 1)); letter-spacing:.3em; fill:rgb(${BONE} / .66); font-weight:650; }
/* the foot line: what the preview is */
.orr-set-foot { ${LABEL} font-size:10px; letter-spacing:.22em; color:rgb(${BONE} / .66); display:flex; gap:10px; align-items:center; }
.orr-set-foot::before { content:""; width:6px; height:6px; border-radius:50%; background:var(--dp-phos, #dfeeff); box-shadow:0 0 6px rgb(223 238 255 / .6); animation:orr-set-live 2.4s ease-in-out infinite; }
@keyframes orr-set-live { 50% { opacity:.35; } }
html.sf-reduce-motion .orr-set-preview *, html.sf-reduce-motion .orr-set-preview *::before { animation:none !important; transition:none !important; }
/* the beam: a line of light from the row being ridden to the reading it moves */
.orr-set-beam { position:absolute; left:0; top:0; width:100%; height:100%; pointer-events:none; z-index:2; overflow:visible; opacity:0; transition:opacity .22s linear; }
.orr-set-beam.is-on { opacity:1; }
.orr-set-beam path, .orr-set-beam circle { vector-effect:none !important; }
.orr-set-beam .orr-set-beam__core { stroke:rgb(${BONE} / .5); }
.orr-set-beam .orr-set-beam__glow { stroke:rgb(${BONE} / .1); }
.orr-set-beam .orr-set-beam__pulse { stroke:rgb(248 244 234 / .8); stroke-dasharray:.08 1; stroke-dashoffset:.08; opacity:0; }
.orr-set-beam.is-on .orr-set-beam__pulse { opacity:.8; animation:orr-set-beam-run 3.2s linear infinite; }
.orr-set-beam.is-live .orr-set-beam__pulse { stroke:var(--dp-ice, #8fcbff); stroke-dasharray:.16 1; opacity:1; animation:orr-set-beam-run 760ms linear infinite; }
.orr-set-beam.is-live .orr-set-beam__core { stroke:rgb(143 203 255 / .62); }
.orr-set-beam .orr-set-beam__end { fill:rgb(248 244 234); }
@keyframes orr-set-beam-run { from { stroke-dashoffset:.08; } to { stroke-dashoffset:-1; } }
html.sf-reduce-motion .orr-set-beam .orr-set-beam__pulse { animation:none !important; opacity:0 !important; }
@media (forced-colors: active) { .orr-set-beam { display:none; } }
@media (max-height:800px) {
  .orr-set-preview { row-gap:8px; grid-template-rows:auto minmax(0, 1fr) 0; }
  .orr-set-read { min-height:58px; }
  .orr-set-read__value { font-size:46px; }
  .orr-set-read__value.is-word { font-size:26px; }
  .orr-set-read__value.is-long { font-size:19px; }
  .orr-set-read__name { padding-bottom:3px; }
  .orr-set-read__kicker { margin-bottom:8px; }
  .orr-set-foot { display:none; }
  .orr-set-hud__fov { width:130px; height:92px; }
}
@media (forced-colors: active) { .orr-set-preview { display:none; } }
`;

function injectStyle(doc) {
  if (!doc?.head || doc.getElementById(STYLE_ID)) return;
  const style = doc.createElement('style');
  style.id = STYLE_ID;
  style.textContent = CSS;
  doc.head.appendChild(style);
}

const f1 = (n) => Math.round(n * 10) / 10;
const clamp01 = (n) => Math.max(0, Math.min(1, Number.isFinite(n) ? n : 0));

// ---- the mixer -----------------------------------------------------------------------------------
const MX = Object.freeze({ side: 560, c: 280, master: 244, first: 212, step: 22, span: 270 });

function buildMixer(doc) {
  const host = doc.createElement('div');
  host.className = 'orr-set-mixer';
  const s = svg('svg', { class: 'orr-svg', viewBox: `0 0 ${MX.side} ${MX.side}`, 'aria-hidden': 'true' });
  host.appendChild(s);
  const { c } = MX;
  // the graduated scale outside the master ring: every 5 %, majors at the quarters, a drift ring inside
  s.appendChild(svg('path', { d: ticksD(c, c, MX.master + 8, 20, { from: 0, to: MX.span, len: 4, major: 5, majorLen: 9, inward: false }), class: 'orr-core orr-rest', 'stroke-width': 1, 'stroke-linecap': 'butt' }));
  [0, 25, 50, 75, 100].forEach((v, i) => {
    const [x, y] = polar(c, c, MX.master + 28, (MX.span * i) / 4);
    const t = svg('text', { x: f1(x), y: f1(y + 3.5), class: 'orr-set-mixer__grad' });
    t.textContent = String(v);
    s.appendChild(t);
  });
  const drift = svg('g', { class: 'orr-drift', style: `transform-origin:${c}px ${c}px; --orr-drift-s:600s` });
  drift.appendChild(svg('path', { d: ticksD(c, c, 62, 48, { len: 3, major: 4, majorLen: 7 }), class: 'orr-core orr-faint', 'stroke-width': 1, 'stroke-linecap': 'butt' }));
  s.appendChild(drift);
  s.appendChild(svg('path', { d: arcD(c, c, 54, 0, 360), class: 'orr-core orr-faint', 'stroke-width': 1 }));

  const channels = MIXER_CHANNELS.map((ch, i) => {
    const r = i === 0 ? MX.master : MX.first - (i - 1) * MX.step;
    const w = i === 0 ? 4.2 : 3;
    const g = svg('g', { class: 'orr-set-ch' });
    const d = arcD(c, c, r, 0, MX.span);
    g.appendChild(svg('path', { d, class: 'orr-core orr-faint', 'stroke-width': w, 'stroke-linecap': 'butt' }));
    const ghost = svg('path', { d, class: 'orr-core orr-rest orr-set-mixer__ghost', 'stroke-width': w, 'stroke-linecap': 'butt', pathLength: 1, 'stroke-dasharray': '0 1' });
    const bloom = svg('path', { d, class: 'orr-bloom orr-phos orr-set-mixer__fill', 'stroke-width': w + 5, 'stroke-linecap': 'butt', pathLength: 1, 'stroke-dasharray': '0 1' });
    const fill = svg('path', { d, class: 'orr-core orr-phos orr-set-mixer__fill', 'stroke-width': w, 'stroke-linecap': 'butt', pathLength: 1, 'stroke-dasharray': '0 1' });
    const tick = svg('path', { d: '', class: 'orr-core orr-hi orr-set-mixer__mark', 'stroke-width': 1.6, 'stroke-linecap': 'butt' });
    g.append(ghost, bloom, fill, tick);
    const [lx, ly] = polar(c, c, r, 0);
    const lab = svg('text', { x: f1(lx - 12), y: f1(ly + 3.8), class: 'orr-set-mixer__lab' });
    lab.textContent = ch.label.toUpperCase();
    g.appendChild(lab);
    s.appendChild(g);
    const paintFill = (v) => { const dash = `${clamp01(v)} 1`; fill.setAttribute('stroke-dasharray', dash); bloom.setAttribute('stroke-dasharray', dash); };
    const paintTick = (v) => {
      const a = MX.span * clamp01(v);
      const [x0, y0] = polar(c, c, r + w / 2 + 1, a);
      const [x1, y1] = polar(c, c, r + w / 2 + 6, a);
      tick.setAttribute('d', `M ${f1(x0)} ${f1(y0)} L ${f1(x1)} ${f1(y1)}`);
    };
    const fillSpring = createSpring({ value: 0, preset: 'settle', onUpdate: paintFill });
    const tickSpring = createSpring({ value: 0, preset: 'settle', onUpdate: paintTick });
    paintFill(0); paintTick(0);
    return { ...ch, g, lab, ghost, fillSpring, tickSpring };
  });

  const hub = doc.createElement('div');
  hub.className = 'orr-set-mixer__hub';
  const out = doc.createElement('b');
  out.className = 'orr-set-mixer__out';
  const outLab = doc.createElement('span');
  outLab.className = 'orr-set-mixer__outlab';
  hub.append(out, outLab);
  host.appendChild(hub);

  let focusKey = 'master';
  let audioNow = {};
  let first = true;
  const paintHub = () => {
    if (audioNow.muted) { out.textContent = 'Muted'; outLab.textContent = 'All held'; return; }
    const pct = Math.round(channelOutput(audioNow, focusKey) * 100);
    out.textContent = String(pct);
    const unit = doc.createElement('small');
    unit.textContent = '%';
    out.appendChild(unit);
    const ch = MIXER_CHANNELS.find((c0) => c0.key === focusKey);
    outLab.textContent = `${ch ? ch.label : 'Master'} · out`;
  };
  return {
    el: host,
    set(audio = {}) {
      audioNow = audio || {};
      host.classList.toggle('is-muted', !!audioNow.muted);
      const instant = first;
      for (const ch of channels) {
        const raw = ch.key === 'master' ? (audioNow.master == null ? 1 : audioNow.master) : (audioNow[ch.key] == null ? 0.7 : audioNow[ch.key]);
        const outV = channelOutput({ ...audioNow, muted: false }, ch.key);
        ch.fillSpring.set(outV, { instant });
        ch.tickSpring.set(clamp01(Number(raw)), { instant });
        ch.ghost.setAttribute('stroke-dasharray', `${clamp01(outV)} 1`);
      }
      first = false;
      paintHub();
    },
    focus(key) {
      if (!MIXER_CHANNELS.some((c0) => c0.key === key)) return;
      focusKey = key;
      for (const ch of channels) {
        const on = ch.key === key;
        ch.g.classList.toggle('is-focus', on);
        ch.lab.classList.toggle('is-focus', on);
      }
      paintHub();
    },
    dispose() { for (const ch of channels) { ch.fillSpring.stop(); ch.tickSpring.stop(); } },
  };
}

// ---- the bind dial -------------------------------------------------------------------------------
const DL = Object.freeze({ side: 420, c: 210 });

function buildDial(doc) {
  const host = doc.createElement('div');
  host.className = 'orr-set-dial';
  const s = svg('svg', { class: 'orr-svg', viewBox: `0 0 ${DL.side} ${DL.side}`, 'aria-hidden': 'true' });
  host.appendChild(s);
  const { c } = DL;
  const drift = svg('g', { class: 'orr-drift', style: `transform-origin:${c}px ${c}px; --orr-drift-s:720s` });
  drift.appendChild(svg('path', { d: ticksD(c, c, 196, 96, { len: 3, major: 8, majorLen: 8 }), class: 'orr-core orr-rest', 'stroke-width': 1, 'stroke-linecap': 'butt' }));
  s.appendChild(drift);
  s.appendChild(svg('path', { d: arcD(c, c, 150, 0, 360), class: 'orr-bloom orr-hi', 'stroke-width': 5, opacity: '.1' }));
  s.appendChild(svg('path', { d: arcD(c, c, 150, 0, 360), class: 'orr-core orr-hi', 'stroke-width': 2 }));
  s.appendChild(svg('path', { d: arcD(c, c, 138, 0, 360), class: 'orr-core orr-faint', 'stroke-width': 1.5 }));
  // the stick's deadzone: a lit disc whose radius is the setting (0-50 % of the stick's throw)
  const dz = svg('g', { class: 'orr-set-dial__dz' });
  const dzFill = svg('circle', { cx: c, cy: c, r: 0, fill: 'rgb(223 238 255 / .08)' });
  const dzRing = svg('circle', { cx: c, cy: c, r: 0, fill: 'none', class: 'orr-core orr-phos', 'stroke-width': 2 });
  const dzBloom = svg('circle', { cx: c, cy: c, r: 0, fill: 'none', class: 'orr-bloom orr-phos', 'stroke-width': 7, opacity: '.2' });
  dz.append(dzFill, dzBloom, dzRing, svg('path', { d: ticksD(c, c, 128, 20, { len: 4, major: 5, majorLen: 9 }), class: 'orr-core orr-rest', 'stroke-width': 1, 'stroke-linecap': 'butt' }));
  s.appendChild(dz);
  const dzSpring = createSpring({ value: 0, preset: 'settle', onUpdate: (v) => {
    const r = Math.max(0, 128 * 2 * v);
    for (const n of [dzFill, dzRing, dzBloom]) n.setAttribute('r', r.toFixed(1));
  } });
  // listening: an ice arc chasing round the ring (data in motion) — hidden at rest
  const listen = svg('g', { class: 'orr-set-dial__listen' });
  listen.appendChild(svg('path', { d: arcD(c, c, 150, 0, 110), class: 'orr-bloom orr-ice', 'stroke-width': 7, opacity: '.3' }));
  listen.appendChild(svg('path', { d: arcD(c, c, 150, 0, 110), class: 'orr-core orr-ice', 'stroke-width': 2 }));
  s.appendChild(listen);
  const rim = svg('g', { class: 'orr-set-dial__rim' });
  s.appendChild(rim);
  const key = doc.createElement('b');
  key.className = 'orr-set-dial__key';
  const verb = doc.createElement('span');
  verb.className = 'orr-set-dial__verb';
  host.append(key, verb);
  let rimText = '';
  return {
    el: host,
    set({ keyText = '', verbText = '', scheme = '' } = {}) {
      const k = String(keyText || '—').trim();
      key.textContent = k;
      key.classList.toggle('is-mid', k.length > 3 && k.length <= 9);
      key.classList.toggle('is-long', k.length > 9);
      verb.textContent = verbText;
      const rt = String(scheme || '').toUpperCase();
      if (rt !== rimText) {
        rimText = rt;
        rim.textContent = '';
        if (rt) rim.appendChild(circularText(c, c, 168, rt, { startDeg: 0 - 90, size: 9.5, anchor: 'middle' }));
      }
    },
    listen(on) { host.classList.toggle('is-listening', !!on); },
    deadzone(v) {
      const on = Number.isFinite(v);
      host.classList.toggle('is-dz', on);
      if (on) dzSpring.set(Math.max(0, Math.min(0.5, v)));
    },
    dispose() { dzSpring.stop(); },
  };
}

// ---- the miniature HUD ---------------------------------------------------------------------------
const CL = Object.freeze({ W: 760, H: 540 });
const DEMO = Object.freeze({
  hull: 86, hullMax: 100, shield: 64, shieldMax: 100, armor: 20, armorMax: 30,
  energy: 80, energyMax: 100, heat: 0.22, speed: 149, speedRef: 180, boost: 0.7, drift: 0,
});
const DEMO_GROUPS = Object.freeze([
  { name: 'Ordnance', icon: 'weapon', slots: [
    { id: '1', key: '1', name: 'Charge', icon: 'munitions' },
    { id: '2', key: '2', name: 'Blast', icon: 'fire' },
    { id: '3', key: '3', name: 'Line', icon: 'line' },
  ] },
  { name: 'Fieldwork', icon: 'well', slots: [
    { id: '4', key: '4', name: 'Seed', icon: 'seed' },
    { id: '5', key: '5', name: 'Well', icon: 'well' },
    { id: '6', key: '6', name: 'Repel', icon: 'repel' },
  ] },
  { name: 'Rig', icon: 'cone', slots: [
    { id: '7', key: '7', name: 'Cone', icon: 'cone' },
    { id: '8', key: '8', name: 'Skim', icon: 'skim' },
  ] },
]);
const DEMO_ORDNANCE = Object.freeze({
  1: { state: 'ready', count: 3 }, 2: { state: 'cooldown', cooldown: 0.55 }, 3: { state: 'ready' },
  4: { state: 'ready' }, 5: { state: 'cooldown', cooldown: 0.3 }, 6: { state: 'ready' }, 7: { state: 'ready' }, 8: { state: 'locked' },
});
const DRIFT_BY_MODEL = Object.freeze({ assisted: 0, drift: 18, newtonian: 32 });
// the room kept over and under the Cluster for the hint and the caption
const RESERVE = Object.freeze({ hint: 26, cap: 40 });

function buildHud(doc) {
  const host = doc.createElement('div');
  host.className = 'orr-set-hud';
  const hint = doc.createElement('p');
  hint.className = 'orr-set-hud__hint';
  hint.innerHTML = '› Hold <b>Space</b> to latch the Massline';
  const frame = doc.createElement('div');
  frame.className = 'orr-set-hud__frame';
  const foot = doc.createElement('div');
  foot.className = 'orr-set-hud__foot';
  const footLab = doc.createElement('i');
  footLab.textContent = '1.00×';
  foot.appendChild(footLab);
  const dmg = doc.createElement('span');
  dmg.className = 'orr-set-hud__dmg';
  dmg.textContent = '−24';
  const cap = doc.createElement('p');
  cap.className = 'orr-set-hud__cap';
  const capSpan = doc.createElement('span');
  const capWho = doc.createElement('b');
  capWho.textContent = 'Helios control';
  capSpan.append(capWho, doc.createTextNode('Hitch, you are clear to undock.'));
  cap.appendChild(capSpan);
  // FOV: a view wedge seen from above, its angle the setting
  const fov = svg('svg', { class: 'orr-svg orr-set-hud__fov', viewBox: '0 0 170 120', 'aria-hidden': 'true' });
  const fovArc = svg('path', { d: '', class: 'orr-core orr-phos', 'stroke-width': 1.6 });
  const fovArcBloom = svg('path', { d: '', class: 'orr-bloom orr-phos', 'stroke-width': 6 });
  const fovEdges = svg('path', { d: '', class: 'orr-core orr-hi', 'stroke-width': 1 });
  const fovFill = svg('path', { d: '', fill: 'rgb(223 238 255 / .035)', stroke: 'none' });
  const fovText = svg('text', { x: 85, y: 118, 'text-anchor': 'middle' });
  fov.append(fovFill, fovEdges, fovArcBloom, fovArc,
    svg('path', { d: ticksD(85, 104, 92, 18, { from: -90, to: 90, len: 3, major: 3, majorLen: 6, inward: false }), class: 'orr-core orr-faint', 'stroke-width': 1, 'stroke-linecap': 'butt' }),
    fovText);
  host.append(hint, foot, frame, dmg, cap, fov);

  let cluster = null;
  let clusterFailed = false;
  let loading = null;
  let scaleSpring = null;
  let box = { w: 0, h: 0 };
  let uiScale = 1;
  let shownScale = 0;
  let bloomNow = { on: true, strength: 0.5 };
  let still = false;
  let flightModel = 'assisted';

  const layout = (s) => {
    shownScale = s;
    // the Cluster is set in the lower-left of the stage the way the HUD sets it on the screen; the hint
    // rides above it, the caption across the bottom, the damage number off the hull's upper right
    const capH = RESERVE.cap;
    const hintH = RESERVE.hint;
    const w = CL.W * s;
    const h = CL.H * s;
    const left = Math.max(0, (box.w - w) / 2);
    const top = Math.max(hintH, hintH + (box.h - capH - hintH - h) / 2);
    frame.style.transform = `translate(${f1(left)}px, ${f1(top)}px)`;
    frame.style.width = `${f1(w)}px`;
    frame.style.height = `${f1(h)}px`;
    frame.style.setProperty('--orr-cluster-scale', String(Math.round(s * 1000) / 1000));
    hint.style.top = `${f1(Math.max(0, top - hintH))}px`;
    hint.style.left = `${f1(left + 22 * s)}px`;
    hint.style.right = 'auto';
    dmg.style.left = `${f1(left + 296 * s)}px`;
    dmg.style.top = `${f1(top + 70 * s)}px`;
    // the 1.00x footprint: the Cluster's size at scale 1 on this stage
    const unit = s / Math.max(0.1, uiScale);
    foot.style.left = `${f1(left)}px`;
    foot.style.top = `${f1(top + h - CL.H * unit)}px`;
    foot.style.width = `${f1(CL.W * unit)}px`;
    foot.style.height = `${f1(CL.H * unit)}px`;
    foot.classList.toggle('is-on', Math.abs(uiScale - 1) > 0.01);
  };
  const fit = () => Math.max(0.2, Math.min((box.w) / CL.W, (box.h - RESERVE.cap - RESERVE.hint) / CL.H));
  // UI scale 1.10 fills the stage; 1.00 is 91 % of it; above 1.10 the Cluster holds the stage and the
  // 1.00x footprint shrinks instead, so the relation stays true without the miniature leaving its box
  const target = () => fit() * Math.min(1, uiScale / 1.1);
  const relayout = (instant = false) => {
    if (!box.w || !box.h) return;
    if (!scaleSpring) scaleSpring = createSpring({ value: target(), preset: 'settle', onUpdate: layout });
    scaleSpring.set(target(), { instant: instant || still });
  };

  const ensureCluster = () => {
    if (cluster || clusterFailed || loading) return;
    loading = import('./flightCluster.js').then((mod) => {
      if (!mod || typeof mod.createFlightCluster !== 'function') throw new Error('no cluster');
      cluster = mod.createFlightCluster({ shipId: 'ship_kestrel', name: 'Hitch', classLine: 'Kestrel class · starter', groups: DEMO_GROUPS, restSlot: '1' });
      frame.appendChild(cluster.el);
      cluster.update({ ...DEMO, drift: DRIFT_BY_MODEL[flightModel] || 0, ordnance: DEMO_ORDNANCE });
      relayout(true);
    }).catch((error) => { clusterFailed = true; globalThis.__orrSetClusterError = String(error && error.stack || error); console.warn('[settings preview] the Cluster is unavailable', error); });
  };

  return {
    el: host,
    show() { ensureCluster(); relayout(true); },
    resize(w, h) { box = { w, h }; relayout(true); },
    set(settings = {}, { tab = '' } = {}) {
      const vd = settings.video || {};
      const ac = settings.accessibility || {};
      const g = settings.gameplay || {};
      const ctl = settings.controls || {};
      const pref = ac.motionPreference || (vd.motionReduce ? 'reduce' : 'full');
      still = pref === 'reduce' || reducedMotion();
      host.classList.toggle('is-still', still);
      const nextScale = Number(settings.uiScale) > 0 ? Number(settings.uiScale) : 1;
      const scaleChanged = Math.abs(nextScale - uiScale) > 1e-4;
      uiScale = nextScale;
      bloomNow = { on: vd.bloom !== false, strength: vd.bloomStrength != null ? Math.max(0, Math.min(1, vd.bloomStrength > 1 ? vd.bloomStrength * 0.5 : vd.bloomStrength)) : 0.5 };
      host.classList.toggle('is-bloomless', !bloomNow.on);
      host.style.setProperty('--orr-set-bloom', String(Math.round((0.06 + 0.42 * bloomNow.strength) * 100) / 100));
      host.classList.toggle('is-hc', !!ac.highContrast);
      host.classList.toggle('is-readable', !!ac.dyslexiaFont);
      dmg.classList.toggle('is-on', !!g.damageNumbers && tab === 'Gameplay');
      hint.classList.toggle('is-on', g.tutorialHints !== false && tab === 'Gameplay');
      const captions = ac.captions !== false;
      cap.classList.toggle('is-on', captions && tab === 'Access');
      cap.classList.toggle('is-backed', ac.captionBackground !== false);
      cap.classList.toggle('is-small', ac.captionSize === 'small');
      cap.classList.toggle('is-large', ac.captionSize === 'large');
      flightModel = ctl.flightMode || 'assisted';
      if (cluster) cluster.update({ ...DEMO, drift: DRIFT_BY_MODEL[flightModel] || 0, ordnance: DEMO_ORDNANCE });
      // FOV wedge (video only: a camera fact, not a HUD element)
      const fovDeg = Math.max(20, Math.min(120, Number(vd.fov) || 60));
      const cx = 85; const cy = 104; const r = 92;
      const [ax, ay] = polar(cx, cy, r, -fovDeg / 2);
      const [bx, by] = polar(cx, cy, r, fovDeg / 2);
      fovArc.setAttribute('d', arcD(cx, cy, r, -fovDeg / 2, fovDeg / 2));
      fovArcBloom.setAttribute('d', arcD(cx, cy, r, -fovDeg / 2, fovDeg / 2));
      fovEdges.setAttribute('d', `M ${f1(ax)} ${f1(ay)} L ${cx} ${cy} L ${f1(bx)} ${f1(by)}`);
      fovFill.setAttribute('d', `M ${cx} ${cy} L ${f1(ax)} ${f1(ay)} ${arcD(cx, cy, r, -fovDeg / 2, fovDeg / 2).replace(/^M [^A]+/, '')} Z`);
      fovText.textContent = `FOV ${Math.round(fovDeg)}°`;
      fov.classList.toggle('is-on', tab === 'Video');
      if (scaleChanged) relayout(false);
    },
    shake(amount = 1) {
      if (still || reducedMotion() || typeof frame.animate !== 'function') return;
      const a = Math.max(0, Math.min(1, amount)) * 7;
      if (a < 0.5) return;
      const base = frame.style.transform || '';
      frame.animate([
        { transform: `${base} translate(0, 0)` },
        { transform: `${base} translate(${f1(a)}px, ${f1(-a * 0.6)}px)` },
        { transform: `${base} translate(${f1(-a * 0.8)}px, ${f1(a * 0.5)}px)` },
        { transform: `${base} translate(${f1(a * 0.5)}px, ${f1(a * 0.3)}px)` },
        { transform: `${base} translate(${f1(-a * 0.2)}px, ${f1(-a * 0.2)}px)` },
        { transform: `${base} translate(0, 0)` },
      ], { duration: 360, easing: 'ease-out' });
    },
    dispose() { scaleSpring?.stop(); cluster?.dispose?.(); },
  };
}

// ---- the preview ---------------------------------------------------------------------------------
const MODE_BY_TAB = Object.freeze({ Audio: 'mixer', Video: 'hud', Gameplay: 'hud', Access: 'hud', Controls: 'dial' });
const FOOT_BY_TAB = Object.freeze({
  Audio: 'Live · the mix as it reaches the speakers',
  Video: 'Live · the flight HUD as these settings draw it',
  Gameplay: 'Live · the flight HUD as these settings draw it',
  Access: 'Live · the flight HUD as these settings draw it',
  Controls: 'Live · the key each verb answers to',
});
const SCHEME_NAMES = Object.freeze({ pilot: 'Pilot scheme · keyboard steers · mouse aims', 'helm-assist': 'Helm assist · mouse steering', classic: 'Classic throttle' });

function looksNumeric(text) { return /^[−\-+]?\d/.test(String(text || '').trim()); }

/**
 * @returns {null | { el:HTMLElement, show(tab:string, settings:object):void, focusRow(row:HTMLElement):void,
 *   refreshRow(row:HTMLElement):void, changed(section:string|null, key:string, settings:object):void,
 *   listen(on:boolean, row?:HTMLElement):void, dispose():void }}
 */
export function createSettingsPreview(doc = globalThis.document) {
  if (!doc || typeof doc.createElementNS !== 'function' || typeof doc.createElement !== 'function' || !doc.head) return null;
  injectOrrery(doc);
  injectStyle(doc);
  const el = doc.createElement('section');
  el.className = 'orr-set-preview';
  el.setAttribute('aria-hidden', 'true');
  el.inert = true;
  el.setAttribute('inert', '');

  const read = doc.createElement('header');
  read.className = 'orr-set-read';
  const kicker = doc.createElement('span');
  kicker.className = 'orr-set-read__kicker';
  const value = doc.createElement('b');
  value.className = 'orr-set-read__value';
  const name = doc.createElement('span');
  name.className = 'orr-set-read__name';
  read.append(kicker, value, name);

  const stage = doc.createElement('div');
  stage.className = 'orr-set-stage';
  const mixer = buildMixer(doc);
  const hud = buildHud(doc);
  const dial = buildDial(doc);
  stage.append(mixer.el, hud.el, dial.el);

  const foot = doc.createElement('p');
  foot.className = 'orr-set-foot';
  el.append(read, stage, foot);

  let tab = 'Audio';
  let settingsNow = {};
  let focusedRow = null;
  let flashTimer = 0;
  let counter = null;
  let counterText = '';
  let wordText = '';

  // ---- the beam ----------------------------------------------------------------------------------
  const beam = svg('svg', { class: 'orr-svg orr-set-beam', 'aria-hidden': 'true' });
  const beamGlow = svg('path', { d: '', class: 'orr-set-beam__glow', fill: 'none', 'stroke-width': 6, 'stroke-linejoin': 'round' });
  const beamCore = svg('path', { d: '', class: 'orr-set-beam__core', fill: 'none', 'stroke-width': 1.5, 'stroke-linejoin': 'round' });
  const beamPulse = svg('path', { d: '', class: 'orr-set-beam__pulse', fill: 'none', 'stroke-width': 2.4, 'stroke-linecap': 'round', pathLength: 1 });
  const beamA = svg('circle', { r: 2.6, class: 'orr-set-beam__end' });
  const beamB = svg('circle', { r: 3.2, class: 'orr-set-beam__end' });
  beam.append(beamGlow, beamCore, beamPulse, beamA, beamB);
  let beamRow = null;
  let beamFrame = 0;
  let liveTimer = 0;
  const hideBeam = () => beam.classList.remove('is-on');
  const routeBeam = () => {
    beamFrame = 0;
    const root = el.parentElement;
    if (!root || !beamRow || !beamRow.isConnected || typeof root.getBoundingClientRect !== 'function') { hideBeam(); return; }
    if (beam.parentElement !== root) root.appendChild(beam);
    const rr = root.getBoundingClientRect();
    const zoom = root.offsetWidth ? rr.width / root.offsetWidth : 1;
    const at = (x, y) => [(x - rr.left) / (zoom || 1), (y - rr.top) / (zoom || 1)];
    const pane = root.querySelector('#sf-settings-pane');
    const pr = pane ? pane.getBoundingClientRect() : rr;
    const rowR = beamRow.getBoundingClientRect();
    if (!rowR.height || rowR.bottom < pr.top + 10 || rowR.top > pr.bottom - 30) { hideBeam(); return; }
    const src = beamRow.querySelector(':scope > div.k-words--row > span') || beamRow.querySelector('.orr-set-choice')
      || beamRow.querySelector(':scope > .k-words--row') || beamRow.querySelector('.sf-bind-btn')
      || beamRow.querySelector(':scope > .k-t-emph') || beamRow.querySelector('select:not([hidden])');
    const target = el.dataset.mode === 'dial' ? dial.el.querySelector('.orr-set-dial__key') : value;
    if (!src || !target) { hideBeam(); return; }
    const sr = src.getBoundingClientRect();
    const tr = target.getBoundingClientRect();
    if (!tr.width) { hideBeam(); return; }
    const [sx0, sy] = at(sr.right, rowR.top + rowR.height / 2);
    const [tx0, ty] = at(tr.left, tr.top + tr.height / 2);
    const [paneRight] = at(pr.right, 0);
    const sx = sx0 + 20;
    const tx = tx0 - 16;
    if (tx - sx < 40) { hideBeam(); return; }
    // a trace: out of the row, up (or down) the gutter between the list and the preview, into the reading,
    // its corners cut at 45 degrees like every leader in ORRERY
    const bx = Math.max(sx + 14, Math.min(tx - 14, (paneRight + tx) / 2));
    const dy = ty - sy;
    const cut = Math.min(12, Math.abs(dy) / 2);
    const s = Math.sign(dy) || 1;
    const r1 = (n) => Math.round(n * 10) / 10;
    const d = Math.abs(dy) < 2
      ? `M ${r1(sx)} ${r1(sy)} H ${r1(tx)}`
      : `M ${r1(sx)} ${r1(sy)} H ${r1(bx - cut)} L ${r1(bx)} ${r1(sy + s * cut)} V ${r1(ty - s * cut)} L ${r1(bx + cut)} ${r1(ty)} H ${r1(tx)}`;
    for (const p of [beamGlow, beamCore, beamPulse]) p.setAttribute('d', d);
    beamA.setAttribute('cx', r1(sx)); beamA.setAttribute('cy', r1(sy));
    beamB.setAttribute('cx', r1(tx)); beamB.setAttribute('cy', r1(ty));
    beam.classList.add('is-on');
  };
  const queueBeam = () => {
    if (beamFrame) return;
    if (typeof requestAnimationFrame === 'function') beamFrame = requestAnimationFrame(routeBeam); else routeBeam();
  };
  const liveBeam = () => {
    if (reducedMotion()) return;
    beam.classList.add('is-live');
    clearTimeout(liveTimer);
    liveTimer = setTimeout(() => beam.classList.remove('is-live'), 1100);
  };
  let paneBound = null;
  let rootRo = null;
  const bindPane = () => {
    const root = el.parentElement;
    const pane = root && root.querySelector ? root.querySelector('#sf-settings-pane') : null;
    if (!pane || pane === paneBound || typeof pane.addEventListener !== 'function') return;
    paneBound = pane;
    pane.addEventListener('scroll', queueBeam, { passive: true });
    if (typeof ResizeObserver === 'function' && !rootRo) { rootRo = new ResizeObserver(queueBeam); rootRo.observe(root); }
  };

  const sizeStage = () => {
    // layout pixels, not the screen's: under the 1440p zoom a client rect is 1.25x the space the Cluster lays out in
    const r = { width: stage.offsetWidth || 0, height: stage.offsetHeight || 0 };
    if (!r.width || !r.height) return;
    const side = Math.max(200, Math.min(r.width, r.height));
    stage.style.setProperty('--orr-set-side', `${Math.round(side)}px`);
    stage.style.setProperty('--orr-set-k', String(Math.round((MX.side / Math.min(MX.side, side)) * 100) / 100));
    stage.style.setProperty('--orr-set-kd', String(Math.round((DL.side / Math.min(DL.side, side)) * 100) / 100));
    el.style.setProperty('--orr-set-side', `${Math.round(side)}px`);
    hud.resize(r.width, r.height);
  };
  let ro = null;
  if (typeof ResizeObserver === 'function') { ro = new ResizeObserver(sizeStage); ro.observe(stage); }

  const rowParts = (row) => {
    if (!row || typeof row.querySelector !== 'function') return null;
    const labelEl = row.querySelector(':scope > label, :scope > span.k-t-body, :scope > div > .k-row__name');
    const label = labelEl ? String(labelEl.textContent || '').trim() : '';
    let val = '';
    let sub = '';
    const range = row.querySelector('input.k-range');
    const sel = row.querySelector('select');
    const pressed = row.querySelector('.k-words--row [aria-pressed="true"]');
    const bind = row.querySelector('.sf-bind-btn');
    if (range) {
      const out = range.parentElement && range.parentElement.querySelector(':scope > span');
      val = out ? out.textContent : range.value;
    } else if (sel) {
      const opt = sel.options && sel.options[sel.selectedIndex];
      val = opt ? opt.textContent : sel.value;
    } else if (pressed) {
      val = pressed.textContent;
    } else if (bind) {
      val = bind.textContent;
    } else {
      const keyEl = row.querySelector(':scope > .k-t-emph');
      val = keyEl ? keyEl.textContent : '';
      const subEl = row.querySelector('.k-row__sub');
      sub = subEl ? subEl.textContent : '';
    }
    return { label, val: String(val || '').trim(), sub, bind: !!bind };
  };

  const paintRead = (parts, { flash = false } = {}) => {
    if (!parts || !parts.label) return;
    const v = parts.val || '—';
    const numeric = looksNumeric(v);
    if (numeric) {
      // one counter for the reading: a number on the same shape rolls digit by digit to its new value
      if (!counter) { counter = createCounter(value, { format: () => counterText }); }
      counterText = v;
      wordText = '';
      counter.set(0);
    } else {
      if (counter) { counter = null; counterText = ''; value.classList.remove('orr-counter'); value.removeAttribute('aria-label'); }
      if (flash && wordText && wordText !== v) decrypt(value, v, { duration: 280 });
      else value.textContent = v;
      wordText = v;
    }
    value.classList.toggle('is-word', !numeric);
    value.classList.toggle('is-long', !numeric && v.length > 14);
    name.textContent = parts.label;
    if (parts.sub) {
      const small = doc.createElement('small');
      small.textContent = parts.sub.length > 60 ? `${parts.sub.slice(0, 58)}…` : parts.sub;
      name.appendChild(small);
    }
    if (flash && !reducedMotion()) {
      clearTimeout(flashTimer);
      value.classList.add('is-flash');
      flashTimer = setTimeout(() => value.classList.remove('is-flash'), 60);
    }
  };
  // the stick row in Controls shows its deadzone on the dial as the slider is ridden
  const deadzoneOf = (row) => {
    const range = row && row.querySelector ? row.querySelector('input.k-range') : null;
    const parts = range ? rowParts(row) : null;
    return parts && /deadzone/i.test(parts.label) ? Number(range.value) : NaN;
  };

  const channelOfRow = (row) => {
    const parts = rowParts(row);
    if (!parts) return null;
    const hit = MIXER_CHANNELS.find((ch) => ch.label.toLowerCase() === parts.label.toLowerCase());
    return hit ? hit.key : null;
  };

  const paintDial = (row) => {
    const parts = row ? rowParts(row) : null;
    const scheme = SCHEME_NAMES[(settingsNow.gameplay && settingsNow.gameplay.controlScheme) || 'pilot'] || '';
    if (parts && (parts.bind || (row && row.querySelector(':scope > .k-t-emph, input.k-range')))) {
      dial.set({ keyText: parts.val, verbText: parts.label, scheme });
    } else {
      dial.set({ keyText: '·', verbText: 'Choose a verb to see its key', scheme });
    }
  };

  const firstRow = () => {
    const host = el.parentElement;
    const pane = host && host.querySelector ? host.querySelector('#sf-settings-pane') : null;
    if (!pane) return null;
    const any = pane.querySelector('.k-row:not(:has(> .k-caps))');
    if (tab === 'Controls') return pane.querySelector('.k-row:has(.sf-bind-btn)') || any;
    return pane.querySelector('.k-row:has(input.k-range)') || any;
  };

  return {
    el,
    show(nextTab, settings = {}) {
      tab = MODE_BY_TAB[nextTab] ? nextTab : 'Audio';
      settingsNow = settings || {};
      el.dataset.mode = MODE_BY_TAB[tab];
      el.dataset.tab = tab.toLowerCase();
      kicker.textContent = `${tab} · applies live`;
      foot.textContent = FOOT_BY_TAB[tab];
      mixer.set(settingsNow.audio || {});
      hud.set(settingsNow, { tab });
      if (MODE_BY_TAB[tab] === 'hud') hud.show();
      focusedRow = null;
      bindPane();
      const row = firstRow();
      beamRow = row;
      dial.deadzone(NaN);
      if (row) { paintRead(rowParts(row)); if (tab === 'Audio') mixer.focus(channelOfRow(row) || 'master'); }
      if (tab === 'Audio' && (!row || !channelOfRow(row))) mixer.focus('master');
      paintDial(tab === 'Controls' ? row : null);
      sizeStage();
      const raf = globalThis.requestAnimationFrame;
      if (typeof raf === 'function') raf(() => { sizeStage(); queueBeam(); });
      // the category arrives row by row: the beam follows once the rows have landed
      setTimeout(queueBeam, 520);
    },
    focusRow(row) {
      if (!row || row === focusedRow) return;
      const parts = rowParts(row);
      if (!parts || !parts.label) return;
      focusedRow = row;
      beamRow = row;
      paintRead(parts);
      if (tab === 'Audio') { const k = channelOfRow(row); if (k) mixer.focus(k); }
      if (tab === 'Controls') { paintDial(row); dial.deadzone(deadzoneOf(row)); }
      queueBeam();
    },
    refreshRow(row) {
      const parts = rowParts(row);
      if (!parts || !parts.label) return;
      focusedRow = row;
      beamRow = row;
      paintRead(parts, { flash: true });
      if (tab === 'Controls') { paintDial(row); dial.deadzone(deadzoneOf(row)); }
      liveBeam();
      queueBeam();
    },
    changed(section, key, settings = {}) {
      settingsNow = settings || settingsNow;
      if (section === 'audio') mixer.set(settingsNow.audio || {});
      hud.set(settingsNow, { tab });
      if (section === 'video' && key === 'screenShake') hud.shake(Number((settingsNow.video || {}).screenShake) / 100);
    },
    listen(on, row) {
      dial.listen(on);
      if (row && on) { const parts = rowParts(row); if (parts) dial.set({ keyText: 'Press', verbText: parts.label, scheme: SCHEME_NAMES[(settingsNow.gameplay && settingsNow.gameplay.controlScheme) || 'pilot'] || '' }); }
      if (!on && focusedRow) paintDial(focusedRow);
    },
    dispose() {
      clearTimeout(flashTimer);
      clearTimeout(liveTimer);
      if (beamFrame && typeof cancelAnimationFrame === 'function') cancelAnimationFrame(beamFrame);
      beam.remove();
      rootRo?.disconnect?.();
      ro?.disconnect?.();
      mixer.dispose(); hud.dispose(); dial.dispose();
    },
  };
}
