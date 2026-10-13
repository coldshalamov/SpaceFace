// Public-input player. Keyboard and mouse only, through Playwright's trusted input (the same
// events a person produces). Observing window.SF to decide where to aim is allowed — a player
// sees the enemies on screen — but nothing here writes game state or calls a game service.

/** A wedged SwiftShader page used to sit inside `page.evaluate` until the reader heap died. */
export const PAGE_STALL_MS = 20000;

export function isPageGone(err) {
  return /has been closed|Target closed|page closed|browser has been closed|Execution context was destroyed|frame was detached/i.test(String(err && err.message || err || ''));
}

/**
 * `page.evaluate` has no timeout of its own. Race one, and turn a closed page into
 * `player-truth: page closed` so the fight loop does not keep sampling a dead browser.
 * `stallMs` is for tests; the harness uses PAGE_STALL_MS.
 */
export async function evalPage(page, fn, arg, stallMs = PAGE_STALL_MS) {
  if (typeof page.isClosed === 'function' && page.isClosed()) throw new Error('player-truth: page closed');
  let work;
  try {
    work = arg === undefined ? page.evaluate(fn) : page.evaluate(fn, arg);
  } catch (err) {
    if (isPageGone(err) || (typeof page.isClosed === 'function' && page.isClosed())) throw new Error('player-truth: page closed');
    throw err;
  }
  let timer;
  const stall = new Promise((_, reject) => {
    timer = setTimeout(() => reject(new Error('player-truth: page stalled')), stallMs);
  });
  try {
    return await Promise.race([work, stall]);
  } catch (err) {
    if (isPageGone(err) || (typeof page.isClosed === 'function' && page.isClosed())) throw new Error('player-truth: page closed');
    throw err;
  } finally {
    clearTimeout(timer);
    work.catch(() => {});
  }
}

export const simNow = (page) => evalPage(page, () => (window.SF && window.SF.state ? window.SF.state.simTime : 0));
export const wallNow = (page) => evalPage(page, () => performance.now());

/** Wait until sim time advances by `seconds`, or a predicate (in page) becomes true, or wall cap. */
export async function waitSim(page, seconds, { maxWallMs = 120000, until = null, arg = null } = {}) {
  const start = await simNow(page); const t0 = Date.now();
  while (Date.now() - t0 < maxWallMs) {
    if (typeof page.isClosed === 'function' && page.isClosed()) throw new Error('player-truth: page closed');
    const r = await evalPage(page, ([want, src, a]) => {
      const st = window.SF.state; const done = st.simTime - want.start >= want.s;
      // eslint-disable-next-line no-new-func
      const stop = src ? Function('st', 'a', `return (${src})(st, a);`)(st, a) : false;
      return { done, stop, sim: st.simTime };
    }, [{ start, s: seconds }, until ? until.toString() : null, arg]);
    if (r.done || r.stop) return r;
    await page.waitForTimeout(150);
  }
  return { done: false, timeout: true };
}

export async function holdKey(page, code, seconds, label, probes) {
  const startSim = await simNow(page); const startT = await wallNow(page);
  await page.keyboard.down(code);
  try { await waitSim(page, seconds, { maxWallMs: 90000 }); } finally { await page.keyboard.up(code); }
  const endSim = await simNow(page); const endT = await wallNow(page);
  const rec = { label, key: code, kind: code === 'KeyW' ? 'thrust' : 'yaw', startSim, endSim, startT, endT };
  if (probes) probes.push(rec);
  return rec;
}

/** Thrust and yaw probes: the "can I move at all" question, asked at every spawn/round start. */
export async function controlProbes(page, tag, probes) {
  await holdKey(page, 'KeyW', 1.2, `${tag} thrust`, probes);
  await holdKey(page, 'KeyD', 0.8, `${tag} yaw`, probes);
}

function readTarget() {
  const st = window.SF.state; const cam = st.render && st.render.camera; const THREE = window.SF.THREE;
  const me = st.entityList.find((e) => e.id === st.playerId);
  if (!me || !cam) return null;
  let best = null; let bd = Infinity;
  for (const e of st.entityList) {
    if (!e.alive || e.id === me.id || !(e.type === 'ship' || e.type === 'drone')) continue;
    const d = e.data || {};
    if (!(d.runRole || (d.ai && (d.ai.huntPlayer || d.ai.forcePlayerTarget)) || (e.team !== me.team && e.team !== 0 && e.team !== 2))) continue;
    const dist = Math.hypot(e.pos.x - me.pos.x, e.pos.z - me.pos.z);
    if (dist < bd) { bd = dist; best = e; }
  }
  let cx = 0; let cz = 0; let near = 0;
  for (const e of st.entityList) {
    if (!e.alive || e.id === me.id || !(e.type === 'ship' || e.type === 'drone')) continue;
    if (Math.hypot(e.pos.x - me.pos.x, e.pos.z - me.pos.z) > 700) continue;
    const d = e.data || {}; if (!(d.runRole || (d.ai && (d.ai.huntPlayer || d.ai.forcePlayerTarget)) || (e.team !== me.team && e.team !== 0 && e.team !== 2))) continue;
    cx += e.pos.x; cz += e.pos.z; near++;
  }
  let away = null; const packDist = near ? Math.hypot(me.pos.x - cx / near, me.pos.z - cz / near) : Infinity;
  if (near) { const a = Math.atan2(me.pos.z - cz / near, me.pos.x - cx / near); away = a - me.rot; while (away > Math.PI) away -= 2 * Math.PI; while (away < -Math.PI) away += 2 * Math.PI; }
  const hull = me.hullMax ? me.hull / me.hullMax : 1;
  const canvas = st.render.renderer.domElement; const r = canvas.getBoundingClientRect();
  const v = new THREE.Vector3();
  if (!best) return { none: true, hull, cx: r.left + r.width / 2, cy: r.top + r.height / 2 };
  v.set(best.pos.x, best.pos.y || 0, best.pos.z).project(cam);
  // The hull's nose is (cos rot, sin rot) on XZ (src/core/flightDynamics.js localAxesInto).
  const ang = Math.atan2(best.pos.z - me.pos.z, best.pos.x - me.pos.x);
  let rel = ang - me.rot; while (rel > Math.PI) rel -= 2 * Math.PI; while (rel < -Math.PI) rel += 2 * Math.PI;
  return { x: r.left + (v.x * 0.5 + 0.5) * r.width, y: r.top + (-v.y * 0.5 + 0.5) * r.height, dist: bd, rel, away, near, packDist, hull, cx: r.left + r.width / 2, cy: r.top + r.height / 2 };
}

const AIM_RETREAT = 0.35;
const AIM_RETREAT_STEPS = 8;

/** One step from an aim point toward the canvas center. Shared by the page loop and tests. */
export function nudgeAimTowardCenter(x, y, cx, cy) {
  return { x: x + (cx - x) * AIM_RETREAT, y: y + (cy - y) * AIM_RETREAT };
}

/**
 * Walk an aim point off a HUD control. `isControl(x, y)` is the hit test.
 * Eight blocked steps fall back to the canvas center. The caller still has to
 * refuse that point when it is a control: the flight tape's Circuits button
 * used to take the click, open the race board, and the reader then ran until
 * the heap died.
 */
export function retreatAim(x, y, cx, cy, isControl) {
  let ax = x;
  let ay = y;
  for (let i = 0; i < AIM_RETREAT_STEPS; i++) {
    if (!isControl(ax, ay)) return { x: ax, y: ay };
    ({ x: ax, y: ay } = nudgeAimTowardCenter(ax, ay, cx, cy));
  }
  return { x: cx, y: cy };
}

/** Stable refusal when a fight click or Space would land on a HUD control. Null when the hit is clear. */
export function fightAimRefusal(hit) {
  if (!hit || !hit.control) return null;
  const label = String(hit.label || 'control').replace(/\s+/g, ' ').trim().slice(0, 40) || 'control';
  return `player-truth: fightBeat hit a HUD control (${label})`;
}

const HUD_CONTROL_PROBE = 'button, a, input, select, textarea, [role="button"]';

async function aimClearOfHud(page, x, y, cx, cy) {
  let ax = x;
  let ay = y;
  for (let i = 0; i < AIM_RETREAT_STEPS; i++) {
    const blocked = await evalPage(page, ([px, py, sel]) => {
      const hit = document.elementFromPoint(Math.round(px), Math.round(py));
      return !!(hit && hit.closest(sel));
    }, [ax, ay, HUD_CONTROL_PROBE]);
    if (!blocked) return { x: ax, y: ay };
    ({ x: ax, y: ay } = nudgeAimTowardCenter(ax, ay, cx, cy));
  }
  return { x: cx, y: cy };
}

async function hudHitAt(page, x, y) {
  return evalPage(page, ([px, py, sel]) => {
    const el = document.elementFromPoint(Math.round(px), Math.round(py));
    if (!el || el.tagName === 'CANVAS' || typeof el.closest !== 'function') return { control: false, label: '' };
    const control = el.closest(sel);
    if (!control) return { control: false, label: '' };
    const raw = control.innerText || control.getAttribute('aria-label') || control.tagName || 'control';
    return { control: true, label: String(raw).replace(/\s+/g, ' ').trim().slice(0, 40) };
  }, [x, y, HUD_CONTROL_PROBE]);
}

async function focusedHud(page) {
  return evalPage(page, (sel) => {
    const el = document.activeElement;
    if (!el || el.tagName === 'CANVAS' || typeof el.closest !== 'function') return { control: false, label: '' };
    const control = el.closest(sel);
    // A focused #screens button is the route (Launch, a dialogue). Space may answer it.
    // Circuits sits on #race-tape, outside #screens, and Space must not activate it.
    if (!control || control.closest('#screens')) return { control: false, label: '' };
    const raw = control.innerText || control.getAttribute('aria-label') || control.tagName || 'control';
    return { control: true, label: String(raw).replace(/\s+/g, ' ').trim().slice(0, 40) };
  }, HUD_CONTROL_PROBE);
}

const fighterMemory = { hull: null, breakBeats: 0 };

// Ricochet runner guns: Bank Stream 280, concussion cannon 260. A 230–400 hold,
// plus a break whenever 3 hostiles sat inside 450, parked the bot outside both
// guns for a 10-ship wave. rounds_reached never left round 1.
export const SWARM_KITE_NEAR = 150;
export const SWARM_KITE_FAR = 250;
const SWARM_PACK_BREAK_COUNT = 4;
const SWARM_PACK_BREAK_DIST = 160;
const SWARM_HURT_BREAK_DIST = 220;

/** True when the bot should stop trading and burn out of the pack. */
export function swarmBreakWanted(tg, lost) {
  if (!tg || tg.none) return false;
  if (lost > 0.04) return true;
  if (tg.near >= SWARM_PACK_BREAK_COUNT && tg.packDist < SWARM_PACK_BREAK_DIST) return true;
  if (tg.hull < 0.5 && tg.near >= 2 && tg.packDist < SWARM_HURT_BREAK_DIST) return true;
  return false;
}

/** 'KeyW' closes or escapes, 'KeyS' brakes, null coasts inside the gun band. */
export function swarmKiteKey(dist, beat, breaking) {
  if (breaking) return 'KeyW';
  if (dist < SWARM_KITE_NEAR) return 'KeyS';
  if (dist > SWARM_KITE_FAR || beat % 3 !== 2) return 'KeyW';
  return null;
}

/**
 * One beat of a kiting fighter (public input only): aim the mouse at the nearest hostile and fire,
 * hold a 150–250 u standoff inside the 260 u guns, and break off — turn away from the pack and
 * burn — only when 4+ hostiles sit inside 160 u, when hit, or when low and close. Latch (Space)
 * every 7th beat. An aim point or a focused flight-tape control that is still a HUD button
 * throws instead of clicking; a closed or stalled page throws rather than sampling on.
 */
export async function fightBeat(page, beat) {
  if (typeof page.isClosed === 'function' && page.isClosed()) throw new Error('player-truth: page closed');
  const tg = await evalPage(page, readTarget);
  if (!tg) { await page.waitForTimeout(300); return; }
  const lost = fighterMemory.hull != null ? fighterMemory.hull - tg.hull : 0;
  fighterMemory.hull = tg.hull;
  if (swarmBreakWanted(tg, lost)) fighterMemory.breakBeats = Math.max(fighterMemory.breakBeats, 4);
  if (tg.none) {
    await holdKey(page, 'KeyW', 0.6, null, null);
    if (beat % 3 === 0) await holdKey(page, 'KeyA', 0.4, null, null);
    return;
  }
  const aim = await aimClearOfHud(page, tg.x, tg.y, tg.cx, tg.cy);
  const refusal = fightAimRefusal(await hudHitAt(page, aim.x, aim.y));
  if (refusal) throw new Error(refusal);
  await page.mouse.move(Math.round(aim.x), Math.round(aim.y), { steps: 2 });
  await page.mouse.down();
  // Turn by tapping: hold the turn key only as long as the bearing error needs (the hull turns
  // ~5 rad/s; holding it for a whole beat overshoots and the ship spins in place under fire).
  const keys = []; let turn = null; let err = 0;
  const breaking = fighterMemory.breakBeats > 0 && tg.away != null;
  if (breaking) {
    fighterMemory.breakBeats--;
    err = tg.away;
  } else {
    err = tg.rel;
  }
  const thrust = swarmKiteKey(tg.dist, beat, breaking);
  if (thrust) keys.push(thrust);
  if (Math.abs(err) > 0.12) turn = err > 0 ? 'KeyA' : 'KeyD'; // KeyD lowers rot (measured by the yaw probes)
  for (const k of keys) await page.keyboard.down(k);
  const turnS = turn ? Math.min(0.6, Math.abs(err) / 4.5) : 0;
  if (turn) { await page.keyboard.down(turn); await waitSim(page, turnS, { maxWallMs: 30000 }); await page.keyboard.up(turn); }
  await waitSim(page, Math.max(0.05, 0.6 - turnS), { maxWallMs: 30000 });
  for (const k of ['KeyW', 'KeyS', 'KeyA', 'KeyD']) await page.keyboard.up(k);
  await page.mouse.up();
  if (beat % 7 === 3) {
    // Space activates a focused button. Circuits on the flight tape is one.
    const latchRefusal = fightAimRefusal(await focusedHud(page));
    if (latchRefusal) throw new Error(latchRefusal);
    await page.keyboard.press('Space');
  }
}

/** A non-combat flyer for Adventure / racing: thrust bursts and gentle turns, never idle long. */
export async function cruiseBeat(page, beat) {
  await holdKey(page, 'KeyW', 0.8, null, null);
  if (beat % 4 === 1) await holdKey(page, beat % 8 === 1 ? 'KeyA' : 'KeyD', 0.4, null, null);
}
