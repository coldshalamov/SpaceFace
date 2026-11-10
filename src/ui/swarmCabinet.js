// Cabinet presentation consumes copied poses and record metadata. It never steps a live run.
import { cabinetBoardRows, loadCrucibleMeta, submitCabinetInitials, roundProgress,
  utcDateKeyNow, dailySeedForDateKey } from '../systems/survivalRecords.js';
import { survivalArenaById } from '../data/survivalArenas.js';
import { EQUIPMENT_GLYPHS } from './orrery/equipmentGlyphs.js';

const quantize = (value, scale) => Math.round((Number(value) || 0) * scale) / scale || 0;
const pose = entity => ({ id: entity.id, x: quantize(entity.pos?.x, 10), z: quantize(entity.pos?.z, 10),
  yaw: quantize(entity.rot, 1000) });

export function cabinetDailySnapshot() {
  const dateKey = utcDateKeyNow();
  return { dateKey, seed: dailySeedForDateKey(dateKey) };
}

export function extractCabinetFrame(state, receipts = []) {
  const player = state.entities.get(state.playerId);
  const entities = [...state.entities.values()].filter(e => e.alive !== false && e.pos)
    .sort((a, b) => a.id - b.id);
  const brood = [];
  const view = state.swarmBrood;
  for (let slot = 0; slot < (view?.cap || 0) && brood.length < 128; slot += 1) {
    if (!view.alive[slot]) continue;
    brood.push({ id: slot, x: quantize(view.px[slot], 10), z: quantize(view.pz[slot], 10),
      yaw: quantize(view.heading[slot], 1000), family: view.family[slot], phase: view.phase[slot] });
  }
  return { tick: state.tick, player: pose(player || {}), round: state.run.wave, score: state.run.score || 0,
    ships: entities.filter(e => e.type === 'ship' && e.id !== state.playerId).slice(0, 16).map(pose),
    projectiles: entities.filter(e => e.type === 'projectile').slice(0, 32).map(pose),
    props: entities.filter(e => ['asteroid', 'wreck', 'debris'].includes(e.type)
      && Math.hypot(e.pos.x - (player?.pos.x || 0), e.pos.z - (player?.pos.z || 0)) <= 650)
      .slice(0, 16).map(pose), brood, receipts: receipts.slice() };
}

export function frameAtElapsed(tape, seconds) {
  const frames = tape?.frames;
  if (!frames?.length) return null;
  const index = Math.floor(Math.max(0, Number(seconds) || 0) * (tape.sampleHz || 10)) % frames.length;
  return frames[index];
}

export function drawCabinetFrame(ctx, canvas, frame, { Path = globalThis.Path2D, colors = {} } = {}) {
  if (!frame) return;
  const ink = colors.ink || '#E8E2D4', danger = colors.danger || '#FF5038', ice = colors.ice || '#8FCBFF';
  const w = canvas.width, h = canvas.height;
  ctx.clearRect(0, 0, w, h);
  ctx.save(); ctx.translate(w / 2, h / 2); ctx.scale(Math.min(w, h) / 1100, Math.min(w, h) / 1100);
  ctx.translate(-(frame.player?.x || 0), -(frame.player?.z || 0));
  const glyph = (point, kind, size, color) => {
    ctx.save(); ctx.translate(point.x, point.z); ctx.rotate(point.yaw + Math.PI / 2);
    ctx.strokeStyle = color; ctx.fillStyle = color;
    if (Path) {
      ctx.scale(size / 128, size / 128); ctx.translate(-64, -64); ctx.lineWidth = 4;
      for (const shape of EQUIPMENT_GLYPHS[kind]) {
        if (shape.tag === 'path') ctx.stroke(new Path(shape.d));
        else { ctx.beginPath(); ctx.arc(shape.cx, shape.cy, shape.r, 0, Math.PI * 2); ctx.stroke(); }
      }
    } else {
      ctx.beginPath(); ctx.moveTo(0, -size / 2); ctx.lineTo(size / 3, size / 2);
      ctx.lineTo(0, size / 3); ctx.lineTo(-size / 3, size / 2); ctx.closePath(); ctx.stroke();
    }
    ctx.restore();
  };
  for (const p of frame.props) glyph(p, 'cargo', 22, ink);
  for (const p of frame.ships) glyph(p, 'hull', 28, danger);
  for (const p of frame.brood) glyph(p, 'swarm', p.phase ? 20 : 16, danger);
  for (const p of frame.projectiles) {
    ctx.strokeStyle = ice; ctx.beginPath(); ctx.moveTo(p.x, p.z);
    ctx.lineTo(p.x - Math.cos(p.yaw) * 8, p.z - Math.sin(p.yaw) * 8); ctx.stroke();
  }
  glyph(frame.player, 'hull', 38, ink);
  ctx.restore();
}

/** Lifecycle is armed by the visible door, then waits eight input-free seconds. */
export function createCabinetAttract({ host, tape, doc = host?.ownerDocument,
  now = () => performance.now(), schedule = (fn, delay) => setTimeout(fn, delay), cancel = id => clearTimeout(id),
  requestFrame = fn => requestAnimationFrame(fn), cancelFrame = id => cancelAnimationFrame(id),
  reducedMotion = () => false } = {}) {
  let canvas, ctx;
  try { canvas = doc.createElement('canvas'); ctx = canvas.getContext('2d'); } catch { /* optional preview */ }
  if (!host || !ctx) return { start() {}, stop() {}, setVisible() {}, dispose() {} };
  canvas.width = 480; canvas.height = 270; canvas.className = 'orr-cabinet-canvas';
  const seed = tape?.seed ?? 'demo';
  canvas.setAttribute('aria-label', `Recorded Swarm demo, seed ${seed}`);
  const label = doc.createElement('p'); label.className = 'orr-label'; label.textContent = `Swarm · demo · seed ${seed}`;
  host.appendChild(canvas); host.appendChild(label); host.hidden = true;
  const style = doc.defaultView?.getComputedStyle?.(host);
  const colors = Object.fromEntries([['ink', '--dp-ink'], ['danger', '--dp-danger'], ['ice', '--dp-ice']]
    .map(([key, token]) => [key, style?.getPropertyValue(token)?.trim() || undefined]));
  let armed = false, visible = true, disposed = false, idle = null, raf = null, startedAt = 0, pointer = null, lastDrawn = null;
  const clear = () => {
    if (idle !== null) cancel(idle);
    if (raf !== null) cancelFrame(raf);
    idle = raf = null; lastDrawn = null; host.hidden = true;
  };
  const draw = seconds => {
    const frame = frameAtElapsed(tape, seconds);
    if (!frame) return false;
    try {
      if (frame !== lastDrawn) drawCabinetFrame(ctx, canvas, frame, { colors });
      lastDrawn = frame;
    }
    catch { clear(); return false; }
    return true;
  };
  const animate = () => {
    raf = null;
    if (!armed || !visible || doc.hidden || disposed) return;
    if (reducedMotion()) { draw(((tape?.frames?.length || 0) / (tape?.sampleHz || 10)) / 2); return; }
    if (draw((now() - startedAt) / 1000)) raf = requestFrame(animate);
  };
  const resetIdle = () => {
    clear();
    if (!armed || !visible || doc.hidden || disposed) return;
    idle = schedule(() => {
      idle = null;
      if (!armed || !visible || doc.hidden || disposed) return;
      const midElapsed = ((tape?.frames?.length || 0) / (tape?.sampleHz || 10)) / 2;
      if (!frameAtElapsed(tape, reducedMotion() ? midElapsed : 0)) return;
      host.hidden = false; startedAt = now();
      if (reducedMotion()) { if (!draw(midElapsed)) host.hidden = true; }
      else animate();
    }, 8000);
  };
  const input = event => {
    if (event.type === 'pointermove') {
      const next = [event.clientX || 0, event.clientY || 0];
      if (pointer && Math.hypot(next[0] - pointer[0], next[1] - pointer[1]) < 4) return;
      pointer = next;
    }
    resetIdle();
  };
  const visibility = () => resetIdle();
  // Gamepad navigation surfaces as focusin + programmatic click, not key/pointer events.
  const events = ['keydown', 'pointerdown', 'pointermove', 'focusin', 'click'];
  const stop = () => {
    armed = false; clear(); pointer = null;
    for (const name of events) doc.removeEventListener(name, input, true);
    doc.removeEventListener('visibilitychange', visibility);
  };
  return {
    start() {
      if (armed || disposed) return;
      armed = true;
      for (const name of events) doc.addEventListener(name, input, { passive: true, capture: true });
      doc.addEventListener('visibilitychange', visibility); resetIdle();
    },
    stop,
    setVisible(value) { if (visible !== !!value) { visible = !!value; resetIdle(); } },
    dispose() { stop(); disposed = true; canvas.remove?.(); label.remove?.(); },
  };
}

const node = (doc, tag, cls, text) => {
  const n = doc.createElement(tag); n.className = cls;
  if (text !== undefined) n.textContent = text;
  return n;
};

export function renderCabinetBoard(doc, profile, options = {}) {
  const band = node(doc, 'section', 'sf-crres__band sf-cabinet-board');
  band.appendChild(node(doc, 'h2', 'k-caps', 'Local board'));
  const rows = cabinetBoardRows(profile, options);
  if (!rows.length) band.appendChild(node(doc, 'p', 'k-t-fine', 'Finish a Swarm run to start this local board.'));
  let group = null, list;
  for (const row of rows) {
    if (row.group !== group) {
      group = row.group;
      const res = row.result;
      band.appendChild(node(doc, 'p', 'k-t-fine', `${survivalArenaById(res.arenaId)?.label || 'Arena'}${res.dailyDateKey ? ` · Daily ${res.dailyDateKey}` : ' · Free play'} · ${res.recordRules.difficulty}`));
      list = node(doc, 'ul', 'k-rows'); band.appendChild(list);
    }
    const p = roundProgress(row.result);
    const progress = row.rank === null ? 'Progress unknown' : `${p.roundThreatResolved}/${p.roundThreatBudget}`;
    const li = node(doc, 'li', 'k-row', `${row.rank === null ? '—' : row.rank} · ${row.initials || '—'} · Round ${p.highestRoundEntered ?? '?'} · ${progress} · ${row.result.score} points`);
    li.dataset.entryId = row.id; list.appendChild(li);
  }
  return band;
}

export function createCabinetEntryBand({ doc, result, onSaved = () => {} }) {
  const profile = loadCrucibleMeta();
  const entry = profile.cabinet.entries.find(row => row.id === result?.cabinetEntryId);
  if (!entry) return null;
  const band = node(doc, 'section', 'sf-crres__band sf-cabinet-entry');
  band.appendChild(node(doc, 'h2', 'k-caps', 'Enter your initials.'));
  const label = node(doc, 'label', 'k-t-fine', 'Three letters or digits');
  const input = node(doc, 'input', 'k-input'); input.type = 'text'; input.maxLength = 3;
  input.setAttribute('maxlength', '3'); input.setAttribute('aria-label', 'Your initials');
  input.value = entry.initials || ''; input.autocomplete = 'off'; label.appendChild(input); band.appendChild(label);
  const actions = node(doc, 'div', 'k-words k-words--row');
  const save = node(doc, 'button', 'k-word', 'Save initials'); save.type = 'button';
  const skip = node(doc, 'button', 'k-word', 'Skip'); skip.type = 'button';
  actions.appendChild(save); actions.appendChild(skip); band.appendChild(actions);
  const status = node(doc, 'p', 'k-t-fine'); status.setAttribute('role', 'status'); status.setAttribute('aria-live', 'polite');
  band.appendChild(status);
  let board = renderCabinetBoard(doc, profile, { recordRules: entry.result.recordRules, dailyDateKey: entry.result.dailyDateKey || null });
  band.appendChild(board);
  save.addEventListener('click', () => {
    const saved = submitCabinetInitials(entry.id, input.value);
    status.textContent = saved.ok ? `Saved as ${saved.initials}.` : saved.reason;
    if (!saved.ok) return;
    input.value = saved.initials;
    const replacement = renderCabinetBoard(doc, saved.profile, { recordRules: entry.result.recordRules, dailyDateKey: entry.result.dailyDateKey || null });
    band.removeChild(board); board = replacement; band.appendChild(board); onSaved(saved.initials);
  });
  skip.addEventListener('click', () => { status.textContent = 'Skipped. Retry or return whenever you are ready.'; });
  return band;
}
