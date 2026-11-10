import { svg, lightPath } from './svg.js';
import { reducedMotion } from './motion.js';
import { KITE_CORNER_PROGRAM as PROGRAM, kiteCornerAvailable, kiteCornerDuration,
  kiteCornerMoment, kiteCornerPassSeconds, KITE_CORNER_INTRO_SECONDS } from '../../data/kiteCornerProgram.js';

const seconds = ticks => (ticks / 60).toFixed(2);
const COPY = {
  course: ['The falling corner', 'Ceres crews have a name for this one. Same Hornet, same handoff. Watch where the turn starts.'],
  wide: ['Left it late', 'Past the gate, still straight. There goes the short way round.'],
  cleaner: ['Make the handoff', 'Same approach. This turn starts at the handoff, not beyond it.'],
  end: ['See you at the buoy', 'The timing buoy is out there when you feel like flying. No need to hurry your service.'],
};

// A single authored programme on the existing station workspace. No simulation,
// canvas/WebGL context, media stream, campaign mutation or persistent visit state.
export function createKiteCornerScreen(ctx, { onReturn = () => {},
  requestFrame = cb => requestAnimationFrame(cb), cancelFrame = id => cancelAnimationFrame(id),
  motionReduced = reducedMotion } = {}) {
  const doc = globalThis.document;
  const root = doc.createElement('section'); root.className = 'dp-work__stage dp-frame__scroll sx-kite-corner';
  root.setAttribute('aria-label', 'Kite’s Corner public programme'); root.style.width = '100%';
  const add = (tag, className, text) => {
    const node = doc.createElement(tag); node.className = className; node.textContent = text; root.appendChild(node); return node;
  };
  add('h2', 'k-caps', 'Kite’s Corner');
  add('p', 'k-sentence', 'Ceres Refinery · service-room programme · Hornet / medium');
  add('p', 'k-sentence', 'Authored flight demonstration. Recorded native poses, shown as a course diagram. Not live footage or a race record.');
  const title = add('h3', 'k-caps', COPY.course[0]);
  const caption = add('p', 'k-sentence', COPY.course[1]);
  const graphic = svg('svg', { viewBox: '0 0 600 560', width: '100%', height: 340,
    class: 'orr-svg', role: 'img', 'aria-label': 'Recorded Hornet paths through the falling corner' });
  graphic.style.maxWidth = '640px'; root.appendChild(graphic);
  add('p', 'k-sentence', 'Bottom: entry. Centre: falling-corner gate. Upper right: exit toward the outside handoff.');
  const result = add('p', 'k-sentence', 'One corner, not a whole-course time.');
  const controls = add('div', 'k-words k-words--row', '');
  const makeButton = (text, action) => {
    const b = doc.createElement('button'); b.type = 'button'; b.className = 'k-word'; b.textContent = text;
    b.addEventListener('click', action); controls.appendChild(b); return b;
  };
  let time = 0, playing = false, visible = false, disposed = false, frame = null, origin = null, lastDraw = '';
  const duration = kiteCornerDuration();
  const stillHere = () => !disposed && visible && ctx.state?.ui?.docked === true
    && ctx.state.ui.dockedStationId === 'station_ceres';
  const reduced = () => !!motionReduced();
  function stop() { playing = false; origin = null; if (frame !== null) cancelFrame(frame); frame = null; if (play) play.textContent = 'Play'; }
  const play = makeButton('Play', () => {
    if (!stillHere() || !kiteCornerAvailable() || reduced()) return;
    if (playing) { stop(); return; }
    if (time >= duration) time = 0;
    playing = true; origin = null; play.textContent = 'Pause'; schedule();
  });
  makeButton('From the top', () => { stop(); time = 0; draw(true); });
  makeButton('Wide pass', () => { stop(); time = KITE_CORNER_INTRO_SECONDS + kiteCornerPassSeconds(PROGRAM.passes[0]) - .001; draw(true); });
  makeButton('Cleaner pass', () => { stop(); time = duration - 3 - .001; draw(true); });
  makeButton('Return to services', () => { stop(); onReturn(); });
  const sliderLabel = add('label', 'k-sentence', 'Programme position ');
  const slider = doc.createElement('input'); slider.type = 'range'; slider.min = '0'; slider.max = String(duration); slider.step = '0.1';
  slider.value = '0'; slider.setAttribute('aria-label', 'Programme position in seconds'); sliderLabel.appendChild(slider);
  slider.style.width = 'min(100%, 28rem)';
  slider.addEventListener('input', () => { stop(); time = Math.max(0, Math.min(duration, Number(slider.value) || 0)); draw(true); });
  const motionNote = add('p', 'k-sentence', '');
  root.addEventListener('keydown', event => {
    // Buttons and the native range retain their normal keyboard semantics. Escape
    // remains the station exit owner’s key, not a second programme-level trap.
    if (event.target === slider && ['ArrowLeft', 'ArrowRight', 'ArrowUp', 'ArrowDown', 'PageUp', 'PageDown', 'Home', 'End'].includes(event.key)) event.stopPropagation();
  });

  const gate = PROGRAM.gate.pos, incoming = PROGRAM.incoming, outgoing = PROGRAM.outgoing;
  const project = (x, z) => [220 + (x - gate.x) * .65, 280 + (z - gate.z) * .65];
  const point = (normal, offset) => ({ x: gate.x + normal.nx * offset, z: gate.z + normal.nz * offset });
  const pathOf = poses => poses.map((p, i) => `${i ? 'L' : 'M'} ${project(p[1], p[2]).join(' ')}`).join(' ');
  function draw(force = false) {
    if (!kiteCornerAvailable()) {
      stop(); graphic.replaceChildren(); title.textContent = 'This reel is off the screen';
      caption.textContent = 'The course has changed since this demonstration was recorded. Station services are still available.';
      result.textContent = ''; play.disabled = true; slider.disabled = true; return;
    }
    const moment = kiteCornerMoment(time), key = `${moment.beat}:${moment.poseIndex ?? ''}`;
    slider.value = String(time); slider.setAttribute('aria-valuetext', `${time.toFixed(1)} of ${duration.toFixed(1)} seconds`);
    play.disabled = reduced(); motionNote.textContent = reduced() ? 'Reduced motion: use Wide pass, Cleaner pass or the position control to inspect stills.' : '';
    if (!force && key === lastDraw) return; lastDraw = key;
    title.textContent = COPY[moment.beat][0]; caption.textContent = COPY[moment.beat][1];
    graphic.replaceChildren();
    for (const [normal, from, to] of [[incoming, -360, 0], [outgoing, 0, 520]]) {
      const a = point(normal, from), b = point(normal, to);
      graphic.appendChild(lightPath(`M ${project(a.x, a.z).join(' ')} L ${project(b.x, b.z).join(' ')}`, { tone: 'rest', width: 1, bloom: 0 }));
    }
    for (const [normal, offset, width] of [[incoming, -300, 145], [incoming, 0, 70], [outgoing, 350, 145]]) {
      const c = point(normal, offset), a = project(c.x - normal.nz * width, c.z + normal.nx * width), b = project(c.x + normal.nz * width, c.z - normal.nx * width);
      graphic.appendChild(lightPath(`M ${a.join(' ')} L ${b.join(' ')}`, { tone: offset ? 'rest' : 'hand', width: offset ? 1 : 2, bloom: 0 }));
    }
    const shown = moment.beat === 'end' ? [0, 1] : moment.index == null ? [] : [moment.index];
    for (const index of shown) {
      const pass = PROGRAM.passes[index], poses = moment.beat === 'end' ? pass.poses : pass.poses.slice(0, moment.poseIndex + 1);
      const tone = index ? 'hand' : 'rest';
      graphic.appendChild(lightPath(pathOf(poses), { tone, width: 2.5, bloom: 3 }));
      const pose = poses.at(-1), [x, y] = project(pose[1], pose[2]);
      // The Hornet mark’s heading and location are the stored native sample, not
      // an invented render or a spline that might hide the actual late turn.
      graphic.appendChild(svg('path', { d: 'M 8 0 L -6 -5 L -3 0 L -6 5 Z',
        transform: `translate(${x} ${y}) rotate(${pose[3] * 180 / Math.PI})`, class: `orr-${tone}`, fill: 'currentColor' }));
    }
    result.textContent = moment.beat === 'end'
      ? `Wide ${seconds(PROGRAM.passes[0].elapsedTicks)} s · Cleaner ${seconds(PROGRAM.passes[1].elapsedTicks)} s. Same recorded section, not whole-course records.`
      : moment.index == null ? 'Entry → falling corner → exit. No viewing reward or job to accept.'
        : `${moment.index ? 'Cleaner' : 'Wide'} pass · ${seconds(PROGRAM.passes[moment.index].elapsedTicks)} s recorded section elapsed.`;
  }
  function schedule() { if (frame === null && playing && stillHere()) frame = requestFrame(tick); }
  function tick(now) {
    frame = null;
    if (!stillHere() || doc.hidden) { stop(); return; }
    if (reduced()) { stop(); draw(true); return; }
    if (origin === null) origin = now - time * 1000;
    time = Math.min(duration, (now - origin) / 1000); draw();
    if (time >= duration) stop(); else schedule();
  }
  const visibility = () => { if (doc.hidden) stop(); };
  const events = ['dock:undocked', 'save:restoring', 'game:new', 'game:newGame'];
  let listening = false;
  function listen() {
    if (listening) return; listening = true;
    doc.addEventListener('visibilitychange', visibility);
    events.forEach(event => ctx.bus?.on?.(event, hide));
  }
  function hide() {
    visible = false; stop();
    if (!listening) return; listening = false;
    doc.removeEventListener('visibilitychange', visibility);
    events.forEach(event => ctx.bus?.off?.(event, hide));
  }
  return {
    el: root,
    onShow() { visible = true; if (!stillHere()) { hide(); return; } listen(); draw(true);
      if (!reduced() && kiteCornerAvailable() && time < duration) { playing = true; play.textContent = 'Pause'; schedule(); } },
    refresh() { if (!stillHere()) { hide(); return; } if (reduced()) stop(); draw(); },
    onHide: hide,
    dispose() { if (disposed) return; hide(); disposed = true; root.remove(); },
  };
}
