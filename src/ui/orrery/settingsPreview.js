// ORRERY settings preview (design/frontend/ORRERY.md §6 Meta: "Settings: every change previews live in a
// miniature Cluster/HUD beside the list").
//
// One instrument beside the settings list that shows what the row being worked DRIVES, live, and a band
// of light (the beam) from that row to the exact part of the instrument it moves:
//   · AUDIO    — a mixer: every channel a ring of light round one pivot. The lit arc is what reaches the
//                speakers (master x channel); the band beyond it, up to the channel's own notch, is what
//                the master is holding back; Mute all drops every ring to that held band. The beam
//                enters the channel's ring and the ring carries the light; the output rolls at the hub.
//   · VIDEO / GAMEPLAY / ACCESS — the flight Cluster itself (flightCluster.js, the live HUD's
//                instrument), in miniature, reacting where a setting is TRUE of the HUD: UI scale, bloom,
//                high contrast, the readable font, reduced motion, screen shake, damage numbers, tutorial
//                hints, captions, the flight model, FOV. The beam lands on the part that moved. A setting
//                that changes the world and not the HUD (shadows, render scale, frame cap) lands on the
//                legend, which says what it does — never on a number repeating the row.
//   · CONTROLS — a bind dial with body (a glass disc inside a lit annulus): the verb's key huge and thin
//                at its centre; while a row listens the annulus runs ice; the stick deadzone lights a disc.
// Over the instrument the LEGEND names the row and says, in a line, what it does. The Cluster's own amber
// is re-toned to bone here: the one Hand on this screen is the settings Hand, not the miniature's.
//
// The preview is decoration for sighted players: aria-hidden and inert (the Cluster's verb sockets are
// focusable in flight and must not join the settings tab order). It stands down where the document has
// no SVG (test shims), and loads the Cluster lazily so a broken Cluster never blanks Settings.
import { svg, arcD, polar, ticksD, circularText } from './svg.js';
import { createSpring, reducedMotion } from './motion.js';
import { injectOrrery } from './tokens.js';
import { createCounter } from './text.js';

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

const CATEGORY_LINES = Object.freeze({
  Audio: 'Seven channels under one master. Ride a level and watch what reaches the speakers.',
  Video: 'How the world is drawn and how the flight HUD glows. The miniature is the HUD you fly with.',
  Gameplay: 'How the ship flies, how hard the sector fights back, and what the HUD tells you.',
  Access: 'Contrast, motion, type and captions. Each one shows on the HUD as you set it.',
  Controls: 'Every flight verb and the key it answers to. Pick a row, then press the new key.',
});

/** One line per setting: what it does (the legend). Numbers the row does not show are derived here. */
export function settingEffect(label, value = '', settings = {}) {
  const k = String(label || '').toLowerCase().trim();
  const v = String(value || '').trim();
  const num = parseFloat(v);
  const lines = {
    'mute all': 'Silences every channel at once; the levels you set are kept.',
    master: 'Scales every channel below it.',
    sfx: 'Impacts, pickups and the ship’s machinery.',
    music: 'The score.',
    engine: 'Your engines and thrusters.',
    ambient: 'The sector around you: stations, traffic, the void.',
    combat: 'Weapons fire and hits.',
    ui: 'Menu and HUD sounds.',
    comms: 'Voices on the radio.',
    'quality preset': 'Sets render scale, particles and the render graph in one move.',
    bloom: 'Bright light spills into a soft glow round it.',
    'sun shadows (ships/rocks/stations)': 'Nearby ships, rocks and stations darken each other.',
    'bloom strength': 'How far bright light spills.',
    'hdr energy materials': 'Plumes and the Massline burn brighter than white.',
    'render graph (gtao + bloom)': 'Contact shading and a finer glow; falls back on weaker GPUs.',
    'emergency dynamic resolution': 'Drops resolution only when a frame runs long.',
    fov: 'How wide the camera sees.',
    'particle quality': 'How much dust, spark and debris the world throws.',
    'engine trails': 'Ships draw a trail of light behind their engines.',
    vsync: 'Frames wait for the display, so the picture never tears.',
    'motion effects': 'Camera shake, FOV punch and hit-stop — or none of them.',
    'screen shake': 'How hard the camera kicks on a hit.',
    'ui scale': 'The size of every HUD instrument and menu.',
    difficulty: 'How hard the sector fights back.',
    'stunt moments': 'A big throw slows time for a beat, or play runs on.',
    'flight model': 'Assisted settles to rest; Drift carries on; Newtonian keeps every push.',
    'massline orbit assist': 'How firmly the Massline holds a mass in orbit round you.',
    'massline release assist': 'When a swung mass lets go of the line.',
    'tutorial hints': 'Short hints on the HUD while you learn.',
    'damage numbers': 'Hits show their damage as numbers.',
    language: 'Every screen switches at once.',
    'colorblind palette': 'Radar and bars take a palette you can tell apart, with shapes as well.',
    'high contrast': 'Lines and labels brighten.',
    'reduce flashing': 'Strobes and hit flashes soften.',
    'readable font': 'A more legible face with looser spacing.',
    'gameplay captions': 'Every voiced line is written on screen.',
    'audio cues': 'Key events also play a sound.',
    'caption size': 'The size of caption text.',
    'solid caption backing': 'A dark backing behind captions, for any background.',
    'control scheme': 'Which keys steer and what the mouse does.',
    'gamepad enabled': 'Whether a pad is read at all.',
    'stick deadzone': 'How far a stick moves before the ship answers.',
    'invert right-stick y': 'Push up to aim down.',
    'touch controls': 'On-screen sticks and buttons.',
  };
  if (k === 'render scale' && Number.isFinite(num)) {
    const w = Math.round((globalThis.screen?.width || 1920) * (globalThis.devicePixelRatio || 1) * num);
    const h = Math.round((globalThis.screen?.height || 1080) * (globalThis.devicePixelRatio || 1) * num);
    return `Draws the world at ${w} × ${h} on this display.`;
  }
  if (k === 'frame cap') {
    if (!Number.isFinite(num)) return 'No cap beyond the display’s own refresh.';
    return `One frame every ${(1000 / num).toFixed(1)} ms at most.`;
  }
  if (k === 'autosave') {
    if (!Number.isFinite(num) || num <= 0) return 'Only the saves you make yourself.';
    return num >= 120 ? `Saves every ${Math.round(num / 60)} minutes.` : num === 60 ? 'Saves every minute.' : `Saves every ${num} seconds.`;
  }
  return lines[k] || '';
}

const CSS = `
.orr-set-preview { position:relative; min-width:0; min-height:0; display:grid; grid-template-rows:auto minmax(0, 1fr) auto; row-gap:14px;
  color:rgb(${BONE}); pointer-events:none; }
.orr-set-preview::before { content:""; position:absolute; inset:-6% -8% -4% -10%; z-index:-1; pointer-events:none;
  background:radial-gradient(closest-side, rgb(4 6 9 / .74), rgb(4 6 9 / .5) 58%, rgb(4 6 9 / 0)); }
/* the legend: the row being worked, and what it does */
.orr-set-read { display:flex; flex-direction:column; gap:10px; min-height:96px; }
.orr-set-read__kicker { ${LABEL} font-size:10.5px; letter-spacing:.24em; color:rgb(${BONE} / .64); display:flex; align-items:center; gap:12px; }
.orr-set-read__kicker::after { content:""; flex:0 0 56px; height:1px; background:linear-gradient(90deg, rgb(${BONE} / .4), rgb(${BONE} / 0)); }
.orr-set-read__name { ${LABEL} font-size:15px; letter-spacing:.2em; color:rgb(248 244 234); display:inline-flex; align-self:flex-start; align-items:center; gap:14px;
  transition:color .5s var(--dp-ease-out, ease-out), text-shadow .5s var(--dp-ease-out, ease-out); }
.orr-set-read__name.is-flash { color:var(--dp-ice, #8fcbff); text-shadow:0 0 14px rgb(143 203 255 / .4); transition:none; }
.orr-set-read__line { font-family:var(--dp-face-read, "Instrument Sans"); font-size:15.5px; line-height:1.45; color:rgb(${BONE} / .82); max-width:46ch; min-height:1.45em; }
/* the stage holds one instrument at a time */
.orr-set-stage { position:relative; min-height:0; }
.orr-set-stage > * { position:absolute; inset:0; }
.orr-set-preview:not([data-mode="mixer"]) .orr-set-mixer,
.orr-set-preview:not([data-mode="hud"]) .orr-set-hud,
.orr-set-preview:not([data-mode="dial"]) .orr-set-dial { display:none; }
.orr-set-mixer svg, .orr-set-dial svg { position:absolute; left:50%; top:50%; transform:translate(-50%, -50%); width:min(100%, var(--orr-set-side, 560px)); height:auto; aspect-ratio:1; overflow:visible; }
.orr-set-preview .orr-svg text { font-family:var(--dp-face-label, "Archivo"); }
/* one geometry for every stroke in the preview: a pathLength dash under non-scaling-stroke is measured in
   screen pixels and over-fills any drawing smaller than its viewBox, so here strokes scale with their drawing */
.orr-set-preview .orr-svg :is(.orr-core, .orr-bloom), .orr-set-preview .orr-svg path, .orr-set-preview .orr-svg circle { vector-effect:none !important; }
/* the mixer */
.orr-set-mixer .orr-set-mixer__lab { font-size:calc(10.5px * var(--orr-set-k, 1)); letter-spacing:.18em; fill:rgb(${BONE} / .7); text-anchor:end; font-weight:650; }
.orr-set-mixer .orr-set-mixer__lab.is-focus { fill:rgb(248 244 234); }
.orr-set-mixer .orr-set-mixer__grad { font-size:calc(9.5px * var(--orr-set-k, 1)); letter-spacing:.12em; fill:rgb(${BONE} / .66); text-anchor:middle; font-weight:600; }
.orr-set-mixer .orr-set-mixer__groove { stroke:rgb(${BONE} / .08); }
.orr-set-mixer .orr-set-mixer__held { stroke:rgb(${BONE} / .3); transition:stroke .2s linear; }
.orr-set-mixer .orr-set-mixer__fill { transition:opacity .2s linear; }
.orr-set-mixer .orr-set-ch:not(.is-focus) .orr-set-mixer__fill.orr-core { opacity:.78; }
.orr-set-mixer .orr-set-ch:not(.is-focus) .orr-set-mixer__fill.orr-bloom { opacity:.14; }
.orr-set-mixer .orr-set-ch.is-focus .orr-set-mixer__fill.orr-bloom { opacity:.4; }
.orr-set-mixer .orr-set-ch.is-focus .orr-set-mixer__held { stroke:rgb(${BONE} / .4); }
/* ridden: the ring carries the beam's light */
.orr-set-mixer .orr-set-ch.is-live .orr-set-mixer__fill.orr-bloom { opacity:.7; stroke:var(--dp-ice, #8fcbff); }
.orr-set-mixer .orr-set-ch.is-live .orr-set-mixer__fill.orr-core { stroke:rgb(236 246 255); }
.orr-set-mixer.is-muted .orr-set-mixer__fill { opacity:0 !important; }
.orr-set-mixer__hub { position:absolute; left:50%; top:50%; transform:translate(-50%, -50%); display:flex; flex-direction:column; align-items:center; gap:7px; }
.orr-set-mixer__out { display:inline-flex; align-items:baseline; font-family:var(--dp-face-numeral, "Archivo"); font-variation-settings:"wdth" 100, "wght" 260; font-weight:260;
  font-size:46px; line-height:1; font-variant-numeric:tabular-nums; color:var(--dp-phos, #dfeeff); letter-spacing:-.02em; }
.orr-set-mixer__out .orr-counter { height:1em; }
.orr-set-mixer__out .orr-counter__digit { width:.56em; }
.orr-set-mixer__out small { font-size:.42em; margin-left:3px; color:rgb(${BONE} / .7); }
.orr-set-mixer.is-muted .orr-set-mixer__out { font-size:22px; font-variation-settings:"wdth" 112, "wght" 650; letter-spacing:.24em; text-transform:uppercase; color:rgb(248 244 234); }
.orr-set-mixer__outlab { ${LABEL} font-size:9.5px; letter-spacing:.2em; color:rgb(${BONE} / .7); white-space:nowrap; }
/* the miniature HUD */
.orr-set-hud { --dp-hand:rgb(${BONE}); --dp-hand-hot:rgb(248 244 234); --dp-lamp:rgb(${BONE}); --dp-lamp-hot:rgb(248 244 234); overflow:visible; }
.orr-set-hud__frame { position:absolute; left:0; top:0; width:760px; height:540px; transform-origin:0 0; }
.orr-set-hud__frame > .orr-cluster { position:absolute !important; left:0; bottom:0; }
.orr-set-hud.is-bloomless .orr-bloom { opacity:0 !important; }
.orr-set-hud { --dp-bloom-a:var(--orr-set-bloom, .22); }
/* in miniature the Cluster's strokes scale down with it: its rest light rises so no line goes to a hairline */
.orr-set-hud.is-small { --dp-line:rgb(${BONE} / .5); --dp-line-faint:rgb(${BONE} / .28); --dp-line-hi:rgb(${BONE} / .86); }
/* a narrow stage keeps the ring stack large and lets the verb names go (the keys stay) */
.orr-set-hud.is-compact .orr-cluster__keytag { display:none !important; }
.orr-set-hud.is-hc { --dp-line:rgb(${BONE} / .6); --dp-line-faint:rgb(${BONE} / .34); --dp-line-hi:rgb(${BONE} / .92); --dp-ink-dim:rgb(248 244 234); }
.orr-set-hud.is-hc .orr-label { color:rgb(248 244 234) !important; }
.orr-set-hud.is-readable .orr-label, .orr-set-hud.is-readable .orr-value, .orr-set-hud.is-readable .orr-set-hud__cap, .orr-set-hud.is-readable .orr-set-hud__hint {
  font-family:"OpenDyslexic", "Atkinson Hyperlegible", "Verdana", system-ui, sans-serif !important; letter-spacing:.04em; }
.orr-set-hud.is-still *, .orr-set-hud.is-still *::before, .orr-set-hud.is-still *::after { animation:none !important; }
/* the 1.00x footprint when the scale is not 1: two cut corners and the scale that rolls */
.orr-set-hud__foot { position:absolute; pointer-events:none; opacity:0; transition:opacity .2s linear; }
.orr-set-hud__foot.is-on { opacity:1; }
.orr-set-hud__foot::before, .orr-set-hud__foot::after { content:""; position:absolute; width:16px; height:16px; border-color:rgb(${BONE} / .6); border-style:solid; }
.orr-set-hud__foot::before { right:0; top:0; border-width:2px 2px 0 0; }
.orr-set-hud__foot::after { left:0; top:0; border-width:2px 0 0 2px; }
.orr-set-hud__scale { position:absolute; left:0; top:-30px; display:inline-flex; align-items:baseline; gap:8px; pointer-events:none; opacity:0; transition:opacity .2s linear; }
.orr-set-hud__scale.is-on { opacity:1; }
.orr-set-hud__scale b .orr-counter { height:1em; }
.orr-set-hud__scale b .orr-counter__digit { width:.56em; }
.orr-set-hud__scale b { display:inline-flex; font-family:var(--dp-face-numeral, "Archivo"); font-variation-settings:"wdth" 100, "wght" 300; font-weight:300; font-size:24px; line-height:1; color:rgb(248 244 234);
  font-variant-numeric:tabular-nums; }
.orr-set-hud__scale > i { font-style:normal; ${LABEL} font-size:10px; letter-spacing:.2em; color:rgb(${BONE} / .72); }
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
.orr-set-hud__fov { position:absolute; right:0; top:0; width:200px; height:150px; overflow:visible; opacity:0; transition:opacity .2s linear; }
.orr-set-hud__fov.is-on { opacity:1; }
.orr-set-hud__fovread { position:absolute; right:0; top:156px; width:200px; display:flex; justify-content:center; align-items:baseline; gap:8px; opacity:0; transition:opacity .2s linear; }
.orr-set-hud__fovread.is-on { opacity:1; }
/* a narrow stage: the fan tucks into the top-right corner, over the keys */
.orr-set-hud.is-compact .orr-set-hud__fov { width:112px; height:84px; }
.orr-set-hud.is-compact .orr-set-hud__fovread { top:54px; right:118px; width:auto; }
.orr-set-hud.is-compact .orr-set-hud__fovread b { font-size:22px; }
.orr-set-hud__fovread b { font-family:var(--dp-face-numeral, "Archivo"); font-variation-settings:"wdth" 100, "wght" 300; font-weight:300; font-size:26px; line-height:1; color:rgb(248 244 234);
  display:inline-flex; font-variant-numeric:tabular-nums; }
.orr-set-hud__fovread b .orr-counter { height:1em; }
.orr-set-hud__fovread b .orr-counter__digit { width:.56em; }
.orr-set-hud__fovread > i { font-style:normal; ${LABEL} font-size:10px; letter-spacing:.22em; color:rgb(${BONE} / .72); }
/* the bind dial: a glass disc inside a lit annulus, the key at its centre */
.orr-set-dial__key { position:absolute; left:50%; top:50%; transform:translate(-50%, -58%); max-width:52%; text-align:center;
  font-family:var(--dp-face-numeral, "Archivo"); font-variation-settings:"wdth" 100, "wght" 250; font-weight:250; font-size:92px; line-height:.9;
  color:rgb(248 244 234); letter-spacing:-.01em; white-space:nowrap; text-shadow:0 0 22px rgb(0 0 0 / .5); }
.orr-set-dial__key.is-mid { font-size:58px; }
.orr-set-dial__key.is-long { font-size:34px; white-space:normal; line-height:1.05; }
.orr-set-dial__verb { position:absolute; left:50%; top:50%; transform:translate(-50%, 0); margin-top:calc(var(--orr-set-side, 420px) * .11); ${LABEL} font-size:11px; letter-spacing:.2em;
  color:rgb(${BONE} / .76); white-space:nowrap; text-align:center; max-width:46%; overflow:hidden; text-overflow:ellipsis; }
.orr-set-dial .orr-set-dial__band { stroke:rgb(${BONE} / .26); transition:stroke .2s linear; }
.orr-set-dial.is-live .orr-set-dial__band { stroke:rgb(${BONE} / .38); }
.orr-set-dial.is-listening .orr-set-dial__key { color:var(--dp-ice, #8fcbff); }
.orr-set-dial .orr-set-dial__listen { opacity:0; }
.orr-set-dial.is-listening .orr-set-dial__listen { opacity:1; animation:orr-set-listen 1.6s linear infinite; transform-box:view-box; transform-origin:50% 50%; }
@keyframes orr-set-listen { to { transform:rotate(360deg); } }
.orr-set-dial .orr-set-dial__dz { opacity:0; transition:opacity .2s linear; }
.orr-set-dial.is-dz .orr-set-dial__dz { opacity:1; }
.orr-set-dial.is-dz .orr-set-dial__key { transform:translate(-50%, -50%); }
.orr-set-dial.is-dz .orr-set-dial__verb { margin-top:calc(var(--orr-set-side, 420px) * .24); }
.orr-set-dial .orr-set-dial__rim text { font-size:calc(9.5px * var(--orr-set-kd, 1)); letter-spacing:.3em; fill:rgb(${BONE} / .7); font-weight:650; }
/* the foot line: what the preview is */
.orr-set-foot { ${LABEL} font-size:10px; letter-spacing:.22em; color:rgb(${BONE} / .66); display:flex; gap:10px; align-items:center; }
.orr-set-foot::before { content:""; width:6px; height:6px; border-radius:50%; background:var(--dp-phos, #dfeeff); box-shadow:0 0 6px rgb(223 238 255 / .6); animation:orr-set-live 2.4s ease-in-out infinite; }
@keyframes orr-set-live { 50% { opacity:.35; } }
html.sf-reduce-motion .orr-set-preview *, html.sf-reduce-motion .orr-set-preview *::before { animation:none !important; transition:none !important; }
/* the beam: a band of light from the row being worked to the part of the instrument it drives */
.orr-set-beam { position:absolute; left:0; top:0; width:100%; height:100%; pointer-events:none; z-index:2; overflow:visible; opacity:0; transition:opacity .22s linear; }
.orr-set-beam.is-on { opacity:1; }
.orr-set-beam path, .orr-set-beam circle { vector-effect:none !important; }
.orr-set-beam .orr-set-beam__core { stroke:rgb(${BONE} / .85); transition:stroke .2s linear; }
.orr-set-beam .orr-set-beam__glow { stroke:rgb(${BONE} / .36); transition:stroke .2s linear; }
.orr-set-beam .orr-set-beam__pulse { stroke:rgb(255 253 248); stroke-dasharray:.06 1; stroke-dashoffset:.06; opacity:0; }
.orr-set-beam.is-on .orr-set-beam__pulse { opacity:.9; animation:orr-set-beam-run 3.2s linear infinite; }
.orr-set-beam.is-live .orr-set-beam__core { stroke:rgb(214 236 255 / .98); }
.orr-set-beam.is-live .orr-set-beam__glow { stroke:rgb(143 203 255 / .48); }
.orr-set-beam.is-live .orr-set-beam__pulse { stroke:rgb(255 255 255); stroke-dasharray:.14 1; opacity:1; animation:orr-set-beam-run 700ms linear infinite; }
.orr-set-beam .orr-set-beam__end { fill:rgb(248 244 234); }
.orr-set-beam .orr-set-beam__halo { fill:rgb(${BONE} / .18); }
.orr-set-beam.is-live .orr-set-beam__end { fill:rgb(236 246 255); }
.orr-set-beam.is-live .orr-set-beam__halo { fill:rgb(143 203 255 / .3); }
@keyframes orr-set-beam-run { from { stroke-dashoffset:.06; } to { stroke-dashoffset:-1; } }
html.sf-reduce-motion .orr-set-beam .orr-set-beam__pulse { animation:none !important; opacity:0 !important; }
@media (forced-colors: active) { .orr-set-beam { display:none; } }
@media (max-height:800px) {
  .orr-set-preview { row-gap:8px; grid-template-rows:auto minmax(0, 1fr) 0; }
  .orr-set-read { min-height:70px; gap:7px; }
  .orr-set-read__name { font-size:13px; }
  .orr-set-read__line { font-size:13.5px; }
  .orr-set-foot { display:none; }
  .orr-set-hud__fov { width:150px; height:112px; }
  .orr-set-hud__fovread { top:116px; width:150px; }
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

/** A point in an SVG's user space, in client pixels (its viewBox scale and any page zoom included). */
function svgPointToClient(svgEl, x, y) {
  if (!svgEl || typeof svgEl.getBoundingClientRect !== 'function') return null;
  const r = svgEl.getBoundingClientRect();
  const vb = svgEl.viewBox && svgEl.viewBox.baseVal;
  if (!vb || !vb.width || !r.width) return null;
  return { x: r.left + ((x - vb.x) / vb.width) * r.width, y: r.top + ((y - vb.y) / vb.height) * r.height };
}

// ---- the mixer -----------------------------------------------------------------------------------
const MX = Object.freeze({ side: 560, c: 280, master: 244, first: 212, step: 22, span: 270 });

function buildMixer(doc) {
  const host = doc.createElement('div');
  host.className = 'orr-set-mixer';
  const s = svg('svg', { class: 'orr-svg', viewBox: `0 0 ${MX.side} ${MX.side}`, 'aria-hidden': 'true' });
  host.appendChild(s);
  const { c } = MX;
  // the graduated scale outside the master ring: every 5 %, majors at the quarters, a drift ring inside
  s.appendChild(svg('path', { d: ticksD(c, c, MX.master + 8, 20, { from: 0, to: MX.span, len: 4, major: 5, majorLen: 9, inward: false }), class: 'orr-core orr-rest', 'stroke-width': 1.2, 'stroke-linecap': 'butt' }));
  [0, 25, 50, 75, 100].forEach((v, i) => {
    const [x, y] = polar(c, c, MX.master + 28, (MX.span * i) / 4);
    const t = svg('text', { x: f1(x), y: f1(y + 3.5), class: 'orr-set-mixer__grad' });
    t.textContent = String(v);
    s.appendChild(t);
  });
  const drift = svg('g', { class: 'orr-drift', style: `transform-origin:${c}px ${c}px; --orr-drift-s:600s` });
  drift.appendChild(svg('path', { d: ticksD(c, c, 62, 48, { len: 3, major: 4, majorLen: 7 }), class: 'orr-core orr-faint', 'stroke-width': 1, 'stroke-linecap': 'butt' }));
  s.appendChild(drift);
  s.appendChild(svg('circle', { cx: c, cy: c, r: 54, fill: 'rgb(8 11 16 / .7)', class: 'orr-core orr-rest', 'stroke-width': 1.5 }));

  const channels = MIXER_CHANNELS.map((ch, i) => {
    const r = i === 0 ? MX.master : MX.first - (i - 1) * MX.step;
    const w = i === 0 ? 5 : 3.6;
    const g = svg('g', { class: 'orr-set-ch' });
    const d = arcD(c, c, r, 0, MX.span);
    g.appendChild(svg('path', { d, class: 'orr-set-mixer__groove', fill: 'none', 'stroke-width': w, 'stroke-linecap': 'butt' }));
    // what the master holds back: from the lit head to the channel's own notch, at rest light, full width
    const held = svg('path', { d, class: 'orr-set-mixer__held', fill: 'none', 'stroke-width': w, 'stroke-linecap': 'butt', pathLength: 1, 'stroke-dasharray': '0 1' });
    const bloom = svg('path', { d, class: 'orr-bloom orr-phos orr-set-mixer__fill', 'stroke-width': w + 6, 'stroke-linecap': 'butt', pathLength: 1, 'stroke-dasharray': '0 1' });
    const fill = svg('path', { d, class: 'orr-core orr-phos orr-set-mixer__fill', 'stroke-width': w, 'stroke-linecap': 'butt', pathLength: 1, 'stroke-dasharray': '0 1' });
    const tick = svg('path', { d: '', class: 'orr-core orr-hi orr-set-mixer__mark', 'stroke-width': 2, 'stroke-linecap': 'butt' });
    g.append(held, bloom, fill, tick);
    const [lx, ly] = polar(c, c, r, 0);
    const lab = svg('text', { x: f1(lx - 14), y: f1(ly + 3.8), class: 'orr-set-mixer__lab' });
    lab.textContent = ch.label.toUpperCase();
    g.appendChild(lab);
    s.appendChild(g);
    let outNow = 0;
    let rawNow = 0;
    let muted = false;
    const paintHeld = () => {
      const a = muted ? 0 : clamp01(outNow);
      const b = clamp01(Math.max(a, rawNow));
      held.setAttribute('stroke-dasharray', `0 ${a.toFixed(4)} ${(b - a).toFixed(4)} 2`);
    };
    const paintFill = (v) => { outNow = v; const dash = `${clamp01(v)} 1`; fill.setAttribute('stroke-dasharray', dash); bloom.setAttribute('stroke-dasharray', dash); paintHeld(); };
    const paintTick = (v) => {
      rawNow = v;
      const a = MX.span * clamp01(v);
      const [x0, y0] = polar(c, c, r + w / 2 + 1, a);
      const [x1, y1] = polar(c, c, r + w / 2 + 7, a);
      tick.setAttribute('d', `M ${f1(x0)} ${f1(y0)} L ${f1(x1)} ${f1(y1)}`);
      paintHeld();
    };
    const fillSpring = createSpring({ value: 0, preset: 'settle', onUpdate: paintFill });
    const tickSpring = createSpring({ value: 0, preset: 'settle', onUpdate: paintTick });
    paintFill(0); paintTick(0);
    return { ...ch, r, g, lab, fillSpring, tickSpring, setMuted(m) { muted = m; paintHeld(); } };
  });

  const hub = doc.createElement('div');
  hub.className = 'orr-set-mixer__hub';
  const out = doc.createElement('b');
  out.className = 'orr-set-mixer__out';
  const outNum = doc.createElement('span');
  const outUnit = doc.createElement('small');
  outUnit.textContent = '%';
  out.append(outNum, outUnit);
  const outLab = doc.createElement('span');
  outLab.className = 'orr-set-mixer__outlab';
  hub.append(out, outLab);
  host.appendChild(hub);
  let counter = null;
  let pctNow = 0;

  let focusKey = 'master';
  let audioNow = {};
  let first = true;
  const paintHub = () => {
    if (audioNow.muted) {
      counter = null;
      outNum.className = '';
      outNum.textContent = 'Muted';
      outUnit.hidden = true;
      outLab.textContent = 'All held';
      return;
    }
    outUnit.hidden = false;
    pctNow = Math.round(channelOutput(audioNow, focusKey) * 100);
    if (!counter) counter = createCounter(outNum, { format: (n) => String(Math.round(n)) });
    counter.set(pctNow);
    const ch = MIXER_CHANNELS.find((c0) => c0.key === focusKey);
    outLab.textContent = `${ch ? ch.label : 'Master'} · out`;
  };
  let liveTimer = 0;
  return {
    el: host,
    set(audio = {}) {
      audioNow = audio || {};
      const muted = !!audioNow.muted;
      host.classList.toggle('is-muted', muted);
      const instant = first;
      for (const ch of channels) {
        const raw = ch.key === 'master' ? (audioNow.master == null ? 1 : audioNow.master) : (audioNow[ch.key] == null ? 0.7 : audioNow[ch.key]);
        ch.setMuted(muted);
        ch.fillSpring.set(channelOutput({ ...audioNow, muted: false }, ch.key), { instant });
        ch.tickSpring.set(clamp01(Number(raw)), { instant });
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
    live(key) {
      if (reducedMotion()) return;
      for (const ch of channels) ch.g.classList.toggle('is-live', ch.key === key);
      clearTimeout(liveTimer);
      liveTimer = setTimeout(() => { for (const ch of channels) ch.g.classList.remove('is-live'); }, 1100);
    },
    /** Where the beam enters a channel: at its engraved name, the head of its ring (the ring carries the light on). */
    terminus(key) {
      const ch = channels.find((c0) => c0.key === key);
      if (!ch) return key === 'mute' ? svgPointToClient(s, c - 54, c) : null;
      let len = 48;
      try { len = ch.lab.getComputedTextLength() || len; } catch (e) { /* no layout */ }
      return svgPointToClient(s, c - 14 - len - 8, c - ch.r);
    },
    dispose() { clearTimeout(liveTimer); for (const ch of channels) { ch.fillSpring.stop(); ch.tickSpring.stop(); } },
  };
}

// ---- the bind dial -------------------------------------------------------------------------------
const DL = Object.freeze({ side: 420, c: 210, rim: 150, band: 16 });

function buildDial(doc) {
  const host = doc.createElement('div');
  host.className = 'orr-set-dial';
  const s = svg('svg', { class: 'orr-svg', viewBox: `0 0 ${DL.side} ${DL.side}`, 'aria-hidden': 'true' });
  host.appendChild(s);
  const { c, rim, band } = DL;
  const drift = svg('g', { class: 'orr-drift', style: `transform-origin:${c}px ${c}px; --orr-drift-s:720s` });
  drift.appendChild(svg('path', { d: ticksD(c, c, 196, 96, { len: 3, major: 8, majorLen: 8 }), class: 'orr-core orr-rest', 'stroke-width': 1.2, 'stroke-linecap': 'butt' }));
  s.appendChild(drift);
  // the body: a disc of deep glass, an annulus of light inward from the rim with its ticks cut through it,
  // the rim itself a 2.5 px core over its bloom, and the inner edge of the band
  s.appendChild(svg('circle', { cx: c, cy: c, r: rim, fill: 'rgb(8 11 16 / .84)' }));
  s.appendChild(svg('circle', { cx: c, cy: c, r: rim - band / 2, fill: 'none', class: 'orr-set-dial__band', 'stroke-width': band }));
  s.appendChild(svg('path', { d: ticksD(c, c, rim, 48, { len: band, major: 0 }), stroke: 'rgb(8 11 16)', 'stroke-width': 2, fill: 'none', 'stroke-linecap': 'butt' }));
  s.appendChild(svg('path', { d: ticksD(c, c, rim - 2, 8, { len: band - 4, major: 0 }), class: 'orr-core orr-hi', 'stroke-width': 2, 'stroke-linecap': 'butt' }));
  s.appendChild(svg('circle', { cx: c, cy: c, r: rim, fill: 'none', class: 'orr-bloom orr-hi', 'stroke-width': 9, opacity: '.14' }));
  s.appendChild(svg('circle', { cx: c, cy: c, r: rim, fill: 'none', stroke: 'rgb(236 230 216 / .8)', 'stroke-width': 2.5 }));
  s.appendChild(svg('circle', { cx: c, cy: c, r: rim - band, fill: 'none', stroke: 'rgb(236 230 216 / .34)', 'stroke-width': 1.5 }));
  // the stick's deadzone: a lit disc whose radius is the setting (0-50 % of the stick's throw)
  const dzR = rim - band - 6;
  const dz = svg('g', { class: 'orr-set-dial__dz' });
  const dzFill = svg('circle', { cx: c, cy: c, r: 0, fill: 'rgb(223 238 255 / .09)' });
  const dzRing = svg('circle', { cx: c, cy: c, r: 0, fill: 'none', class: 'orr-core orr-phos', 'stroke-width': 2.5 });
  const dzBloom = svg('circle', { cx: c, cy: c, r: 0, fill: 'none', class: 'orr-bloom orr-phos', 'stroke-width': 8, opacity: '.22' });
  dz.append(dzFill, dzBloom, dzRing, svg('path', { d: ticksD(c, c, dzR, 20, { len: 4, major: 5, majorLen: 9 }), class: 'orr-core orr-rest', 'stroke-width': 1.2, 'stroke-linecap': 'butt' }));
  s.appendChild(dz);
  const dzSpring = createSpring({ value: 0, preset: 'settle', onUpdate: (v) => {
    const r = Math.max(0, dzR * 2 * v);
    for (const n of [dzFill, dzRing, dzBloom]) n.setAttribute('r', r.toFixed(1));
  } });
  // listening: an ice arc riding the annulus (data in motion) — hidden at rest
  const listen = svg('g', { class: 'orr-set-dial__listen' });
  listen.appendChild(svg('path', { d: arcD(c, c, rim - band / 2, 0, 110), class: 'orr-bloom orr-ice', 'stroke-width': band + 6, opacity: '.3', 'stroke-linecap': 'butt' }));
  listen.appendChild(svg('path', { d: arcD(c, c, rim - band / 2, 0, 110), stroke: 'rgb(143 203 255 / .62)', fill: 'none', 'stroke-width': band, 'stroke-linecap': 'butt' }));
  listen.appendChild(svg('path', { d: arcD(c, c, rim, 0, 110), class: 'orr-core orr-ice', 'stroke-width': 2.5, 'stroke-linecap': 'butt' }));
  s.appendChild(listen);
  const rimG = svg('g', { class: 'orr-set-dial__rim' });
  s.appendChild(rimG);
  const key = doc.createElement('b');
  key.className = 'orr-set-dial__key';
  const verb = doc.createElement('span');
  verb.className = 'orr-set-dial__verb';
  host.append(key, verb);
  let rimText = '';
  let liveTimer = 0;
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
        rimG.textContent = '';
        if (rt) rimG.appendChild(circularText(c, c, 170, rt, { startDeg: 0 - 90, size: 9.5, anchor: 'middle' }));
      }
    },
    listen(on) { host.classList.toggle('is-listening', !!on); },
    live() {
      if (reducedMotion()) return;
      host.classList.add('is-live');
      clearTimeout(liveTimer);
      liveTimer = setTimeout(() => host.classList.remove('is-live'), 1100);
    },
    deadzone(v) {
      const on = Number.isFinite(v);
      host.classList.toggle('is-dz', on);
      if (on) dzSpring.set(Math.max(0, Math.min(0.5, v)));
    },
    /** Where the beam lands: the key (its left edge), the deadzone's rim, or the scheme on the rim. */
    terminus(kind) {
      if (kind === 'dz') {
        const v = Math.max(0.02, Math.min(0.5, dzSpring.target));
        return svgPointToClient(s, c - dzR * 2 * v, c);
      }
      if (kind === 'scheme') return svgPointToClient(s, c - rim, c);
      const r = key.getBoundingClientRect ? key.getBoundingClientRect() : null;
      return r && r.width ? { x: r.left, y: r.top + r.height / 2 } : null;
    },
    dispose() { dzSpring.stop(); clearTimeout(liveTimer); },
  };
}

// ---- the miniature HUD ---------------------------------------------------------------------------
const CL = Object.freeze({ W: 760, H: 540, compactW: 560 });
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
// which part of the HUD each row drives: a point in the Cluster's own coordinates, or a named overlay
const HUD_TARGET = Object.freeze({
  fov: 'fov',
  bloom: [250, 227], 'bloom strength': [250, 227],
  'ui scale': 'scale',
  'damage numbers': 'dmg', 'tutorial hints': 'hint',
  'gameplay captions': 'cap', 'caption size': 'cap', 'solid caption backing': 'cap',
  'high contrast': 'speedfoot', 'readable font': 'speedfoot',
  'motion effects': [105, 350], 'screen shake': [250, 350],
  'flight model': 'drift',
});

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
  const scaleRead = doc.createElement('span');
  scaleRead.className = 'orr-set-hud__scale';
  const scaleNum = doc.createElement('b');
  const scaleLab = doc.createElement('i');
  scaleLab.textContent = 'UI scale';
  scaleRead.append(scaleNum, scaleLab);
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
  // FOV: a view fan seen from above, its angle the setting, its degrees rolling under it
  const fov = svg('svg', { class: 'orr-svg orr-set-hud__fov', viewBox: '0 0 200 150', 'aria-hidden': 'true' });
  const FX = 100;
  const FY = 142;
  const FR = 124;
  const fovArc = svg('path', { d: '', class: 'orr-core orr-phos', 'stroke-width': 3 });
  const fovArcBloom = svg('path', { d: '', class: 'orr-bloom orr-phos', 'stroke-width': 10 });
  const fovEdges = svg('path', { d: '', stroke: 'rgb(236 230 216 / .7)', fill: 'none', 'stroke-width': 2 });
  const fovFill = svg('path', { d: '', fill: 'rgb(223 238 255 / .1)', stroke: 'none' });
  fov.append(
    svg('path', { d: arcD(FX, FY, FR - 8, -70, 70), stroke: 'rgb(236 230 216 / .1)', fill: 'none', 'stroke-width': 14, 'stroke-linecap': 'butt' }),
    svg('path', { d: ticksD(FX, FY, FR + 4, 14, { from: -70, to: 70, len: 4, major: 7, majorLen: 9, inward: false }), class: 'orr-core orr-rest', 'stroke-width': 1.2, 'stroke-linecap': 'butt' }),
    fovFill, fovEdges, fovArcBloom, fovArc,
  );
  const fovRead = doc.createElement('span');
  fovRead.className = 'orr-set-hud__fovread';
  const fovNum = doc.createElement('b');
  const fovLab = doc.createElement('i');
  fovLab.textContent = 'FOV';
  fovRead.append(fovNum, fovLab);
  host.append(hint, foot, scaleRead, frame, dmg, cap, fov, fovRead);
  const fovCounter = createCounter(fovNum, { format: (n) => `${Math.round(n)}°` });
  const scaleCounter = createCounter(scaleNum, { format: (n) => `${(n / 100).toFixed(2)}×` });

  let cluster = null;
  let clusterFailed = false;
  let loading = null;
  let scaleSpring = null;
  let box = { w: 0, h: 0 };
  let uiScale = 1;
  let still = false;
  let flightModel = 'assisted';
  let fovDeg = 60;
  let tabNow = '';
  let focusScale = false;

  const compact = () => box.w > 0 && box.w < 620;
  const layout = (s) => {
    // the Cluster is set in the stage the way the HUD sets it on the screen; the hint rides above it,
    // the caption across the bottom
    const capH = reserveCap();
    const hintH = reserveHint();
    const effW = compact() ? CL.compactW : CL.W;
    const w = CL.W * s;
    const h = CL.H * s;
    const left = Math.max(0, (box.w - effW * s) / 2);
    const top = Math.max(hintH, hintH + (box.h - capH - hintH - h) / 2);
    frame.style.transform = `translate(${f1(left)}px, ${f1(top)}px)`;
    frame.style.width = `${f1(w)}px`;
    frame.style.height = `${f1(h)}px`;
    frame.style.setProperty('--orr-cluster-scale', String(Math.round(s * 1000) / 1000));
    host.classList.toggle('is-small', s < 0.72);
    host.classList.toggle('is-compact', compact());
    hint.style.top = `${f1(Math.max(0, top - hintH))}px`;
    hint.style.left = `${f1(left + 22 * s)}px`;
    hint.style.right = 'auto';
    dmg.style.left = `${f1(left + 296 * s)}px`;
    dmg.style.top = `${f1(top + 70 * s)}px`;
    // the 1.00x footprint: the Cluster's size at scale 1 on this stage
    const unit = s / Math.max(0.1, uiScale);
    const fl = left;
    const ft = top + h - CL.H * unit;
    foot.style.left = `${f1(fl)}px`;
    foot.style.top = `${f1(ft)}px`;
    foot.style.width = `${f1(effW * unit)}px`;
    foot.style.height = `${f1(CL.H * unit)}px`;
    const scaled = Math.abs(uiScale - 1) > 0.01;
    foot.classList.toggle('is-on', scaled);
    scaleRead.classList.toggle('is-on', scaled || focusScale);
    scaleRead.style.left = `${f1(left)}px`;
    scaleRead.style.top = `${f1(Math.min(top, ft) - 34)}px`;
  };
  const fit = () => Math.max(0.2, Math.min(box.w / (compact() ? CL.compactW : CL.W), (box.h - reserveCap() - reserveHint()) / CL.H));
  // room over and under the Cluster only on the tab that draws the hint (Gameplay) or the caption (Access)
  function reserveHint() { return tabNow === 'Gameplay' ? RESERVE.hint : 6; }
  function reserveCap() { return tabNow === 'Access' ? RESERVE.cap : 6; }
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
    }).catch((error) => { clusterFailed = true; console.warn('[settings preview] the Cluster is unavailable', error); });
  };

  const clusterPoint = (x, y) => {
    const r = frame.getBoundingClientRect();
    if (!r.width) return null;
    return { x: r.left + (x / CL.W) * r.width, y: r.top + (y / CL.H) * r.height };
  };
  const leftMid = (node) => {
    const r = node && node.getBoundingClientRect ? node.getBoundingClientRect() : null;
    return r && r.width ? { x: r.left, y: r.top + r.height / 2 } : null;
  };

  return {
    el: host,
    show() { ensureCluster(); relayout(true); },
    resize(w, h) { box = { w, h }; relayout(true); },
    set(settings = {}, { tab = '' } = {}) {
      tabNow = tab;
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
      scaleCounter.set(Math.round(uiScale * 100));
      const bloomOn = vd.bloom !== false;
      const strength = vd.bloomStrength != null ? Math.max(0, Math.min(1, vd.bloomStrength > 1 ? vd.bloomStrength * 0.5 : vd.bloomStrength)) : 0.5;
      host.classList.toggle('is-bloomless', !bloomOn);
      host.style.setProperty('--orr-set-bloom', String(Math.round((0.06 + 0.42 * strength) * 100) / 100));
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
      // FOV fan (video only: a camera fact, not a HUD element)
      fovDeg = Math.max(20, Math.min(120, Number(vd.fov) || 60));
      const half = Math.min(70, fovDeg / 2);
      const [ax, ay] = polar(FX, FY, FR, -half);
      const [bx, by] = polar(FX, FY, FR, half);
      const arc = arcD(FX, FY, FR, -half, half);
      fovArc.setAttribute('d', arc);
      fovArcBloom.setAttribute('d', arc);
      fovEdges.setAttribute('d', `M ${f1(ax)} ${f1(ay)} L ${FX} ${FY} L ${f1(bx)} ${f1(by)}`);
      fovFill.setAttribute('d', `M ${FX} ${FY} L ${f1(ax)} ${f1(ay)} ${arc.replace(/^M [^A]+/, '')} Z`);
      fovCounter.set(fovDeg);
      fov.classList.toggle('is-on', tab === 'Video');
      fovRead.classList.toggle('is-on', tab === 'Video');
      if (scaleChanged) relayout(false); else relayout(true);
      host.classList.toggle('is-video', tab === 'Video');
    },
    /** The row being worked: the UI scale reading stands only for its own row (or a scale that is not 1). */
    focusLabel(label) {
      const next = /^ui scale$/i.test(String(label || '').trim());
      if (next === focusScale) return;
      focusScale = next;
      relayout(true);
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
    /** The part of the HUD a row drives, in client pixels, or null when it drives none. */
    terminus(label) {
      const t = HUD_TARGET[String(label || '').toLowerCase().trim()];
      if (!t) return null;
      if (Array.isArray(t)) return cluster ? clusterPoint(t[0], t[1]) : null;
      if (t === 'fov') {
        const half = Math.min(70, fovDeg / 2);
        const [x, y] = polar(FX, FY, FR, -half);
        return svgPointToClient(fov, x, y);
      }
      if (t === 'scale') return leftMid(scaleRead);
      if (t === 'drift') {
        // the velocity pip on the heading track, where the flight model has swung it
        const [x, y] = polar(250, 350, 154, Math.max(-40, Math.min(40, DRIFT_BY_MODEL[flightModel] || 0)));
        return cluster ? clusterPoint(x, y) : null;
      }
      if (t === 'dmg') return dmg.classList.contains('is-on') ? leftMid(dmg) : clusterPoint(296, 80);
      if (t === 'hint') return hint.classList.contains('is-on') ? leftMid(hint) : null;
      if (t === 'cap') return cap.classList.contains('is-on') ? leftMid(capSpan) : null;
      if (t === 'speedfoot') return leftMid(frame.querySelector('.orr-cluster__speedfoot')) || (cluster ? clusterPoint(22, 118) : null);
      return null;
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
  const name = doc.createElement('span');
  name.className = 'orr-set-read__name';
  const line = doc.createElement('p');
  line.className = 'orr-set-read__line';
  read.append(kicker, name, line);

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

  // ---- the beam ----------------------------------------------------------------------------------
  const beam = svg('svg', { class: 'orr-svg orr-set-beam', 'aria-hidden': 'true' });
  const beamGlow = svg('path', { d: '', class: 'orr-set-beam__glow', fill: 'none', 'stroke-width': 12, 'stroke-linejoin': 'round', 'stroke-linecap': 'round' });
  const beamCore = svg('path', { d: '', class: 'orr-set-beam__core', fill: 'none', 'stroke-width': 3, 'stroke-linejoin': 'round', 'stroke-linecap': 'round' });
  const beamPulse = svg('path', { d: '', class: 'orr-set-beam__pulse', fill: 'none', 'stroke-width': 4, 'stroke-linecap': 'round', pathLength: 1 });
  const beamHaloA = svg('circle', { r: 7, class: 'orr-set-beam__halo' });
  const beamA = svg('circle', { r: 3.5, class: 'orr-set-beam__end' });
  const beamHaloB = svg('circle', { r: 9, class: 'orr-set-beam__halo' });
  const beamB = svg('circle', { r: 4.5, class: 'orr-set-beam__end' });
  beam.append(beamGlow, beamCore, beamPulse, beamHaloA, beamA, beamHaloB, beamB);
  let beamRow = null;
  let beamFrame = 0;
  let liveTimer = 0;
  const hideBeam = () => beam.classList.remove('is-on');

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
    return { label, val: String(val || '').trim(), sub, bind: !!bind, range: !!range };
  };

  const channelOfRow = (row) => {
    const parts = rowParts(row);
    if (!parts) return null;
    if (/^mute all$/i.test(parts.label)) return 'mute';
    const hit = MIXER_CHANNELS.find((ch) => ch.label.toLowerCase() === parts.label.toLowerCase());
    return hit ? hit.key : null;
  };

  // the point of the instrument this row drives, in client pixels (null: the legend takes the beam)
  const terminusOf = (row) => {
    const parts = rowParts(row);
    if (!parts) return null;
    if (tab === 'Audio') return mixer.terminus(channelOfRow(row));
    if (tab === 'Controls') {
      if (/deadzone/i.test(parts.label)) return dial.terminus('dz');
      if (/control scheme/i.test(parts.label)) return dial.terminus('scheme');
      if (parts.bind || (row.querySelector && row.querySelector(':scope > .k-t-emph'))) return dial.terminus('key');
      return null;
    }
    return hud.terminus(parts.label);
  };

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
    const src = beamRow.querySelector(':scope > div.k-words--row > span')
      || beamRow.querySelector(':scope > .k-words--row') || beamRow.querySelector('.sf-bind-btn')
      || beamRow.querySelector(':scope > .k-t-emph') || beamRow.querySelector('select');
    if (!src) { hideBeam(); return; }
    let tp = terminusOf(beamRow);
    if (!tp) {
      const nr = name.getBoundingClientRect();
      if (!nr.width) { hideBeam(); return; }
      tp = { x: nr.left, y: nr.top + nr.height / 2 };
    }
    const sr = src.getBoundingClientRect();
    const [sx0, sy] = at(sr.right, rowR.top + rowR.height / 2);
    const [tx0, ty] = at(tp.x, tp.y);
    const [paneRight] = at(pr.right, 0);
    const sx = sx0 + 18;
    const tx = tx0 - 10;
    if (tx - sx < 40) { hideBeam(); return; }
    // a trace: out of the row, along the gutter between the list and the preview, into the part it drives,
    // its corners cut at 45 degrees like every leader in ORRERY
    const bx = Math.max(sx + 14, Math.min(tx - 14, paneRight + 12));
    const dy = ty - sy;
    const cut = Math.min(14, Math.abs(dy) / 2);
    const sg = Math.sign(dy) || 1;
    const r1 = (n) => Math.round(n * 10) / 10;
    const d = Math.abs(dy) < 2
      ? `M ${r1(sx)} ${r1(sy)} H ${r1(tx)}`
      : `M ${r1(sx)} ${r1(sy)} H ${r1(bx - cut)} L ${r1(bx)} ${r1(sy + sg * cut)} V ${r1(ty - sg * cut)} L ${r1(bx + cut)} ${r1(ty)} H ${r1(tx)}`;
    for (const p of [beamGlow, beamCore, beamPulse]) p.setAttribute('d', d);
    for (const [n, x, y] of [[beamHaloA, sx, sy], [beamA, sx, sy], [beamHaloB, tx, ty], [beamB, tx, ty]]) { n.setAttribute('cx', r1(x)); n.setAttribute('cy', r1(y)); }
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
    queueBeam();
  };
  let ro = null;
  if (typeof ResizeObserver === 'function') { ro = new ResizeObserver(sizeStage); ro.observe(stage); }

  const paintRead = (parts, { flash = false } = {}) => {
    if (!parts || !parts.label) return;
    name.textContent = parts.label;
    const effect = settingEffect(parts.label, parts.val, settingsNow) || (parts.sub ? parts.sub : '')
      || (parts.bind ? 'Press the row, then the new key. Backspace puts the default back.' : '');
    line.textContent = effect;
    if (flash && !reducedMotion()) {
      clearTimeout(flashTimer);
      name.classList.add('is-flash');
      flashTimer = setTimeout(() => name.classList.remove('is-flash'), 60);
    }
  };
  // the stick row in Controls shows its deadzone on the dial as the slider is ridden
  const deadzoneOf = (row) => {
    const range = row && row.querySelector ? row.querySelector('input.k-range') : null;
    const parts = range ? rowParts(row) : null;
    return parts && /deadzone/i.test(parts.label) ? Number(range.value) : NaN;
  };

  const paintDial = (row) => {
    const parts = row ? rowParts(row) : null;
    const scheme = SCHEME_NAMES[(settingsNow.gameplay && settingsNow.gameplay.controlScheme) || 'pilot'] || '';
    if (parts && (parts.bind || parts.range || (row && row.querySelector(':scope > .k-t-emph')))) {
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
      name.textContent = tab;
      line.textContent = CATEGORY_LINES[tab] || '';
      if (row) {
        const first = rowParts(row);
        paintRead(first);
        hud.focusLabel(first && first.label);
        if (tab === 'Audio') { const k = channelOfRow(row); mixer.focus(k && k !== 'mute' ? k : 'master'); }
      } else if (tab === 'Audio') mixer.focus('master');
      paintDial(tab === 'Controls' ? row : null);
      sizeStage();
      const raf = globalThis.requestAnimationFrame;
      if (typeof raf === 'function') raf(() => { sizeStage(); queueBeam(); });
      // the category arrives row by row: the beam follows once the rows have landed
      setTimeout(queueBeam, 520);
      setTimeout(queueBeam, 1250);
    },
    focusRow(row) {
      if (!row || row === focusedRow) return;
      const parts = rowParts(row);
      if (!parts || !parts.label) return;
      focusedRow = row;
      beamRow = row;
      paintRead(parts);
      hud.focusLabel(parts.label);
      if (tab === 'Audio') { const k = channelOfRow(row); if (k && k !== 'mute') mixer.focus(k); }
      if (tab === 'Controls') { paintDial(row); dial.deadzone(deadzoneOf(row)); }
      queueBeam();
    },
    refreshRow(row) {
      const parts = rowParts(row);
      if (!parts || !parts.label) return;
      focusedRow = row;
      beamRow = row;
      paintRead(parts, { flash: true });
      hud.focusLabel(parts.label);
      if (tab === 'Audio') { const k = channelOfRow(row); if (k && k !== 'mute') mixer.live(k); }
      if (tab === 'Controls') { paintDial(row); dial.deadzone(deadzoneOf(row)); dial.live(); }
      liveBeam();
      queueBeam();
      setTimeout(queueBeam, 420);
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
