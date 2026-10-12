// Public-input player. Keyboard and mouse only, through Playwright's trusted input (the same
// events a person produces). Observing window.SF to decide where to aim is allowed — a player
// sees the enemies on screen — but nothing here writes game state or calls a game service.

export const simNow = (page) => page.evaluate(() => (window.SF && window.SF.state ? window.SF.state.simTime : 0));
export const wallNow = (page) => page.evaluate(() => performance.now());

/** Wait until sim time advances by `seconds`, or a predicate (in page) becomes true, or wall cap. */
export async function waitSim(page, seconds, { maxWallMs = 120000, until = null, arg = null } = {}) {
  const start = await simNow(page); const t0 = Date.now();
  while (Date.now() - t0 < maxWallMs) {
    const r = await page.evaluate(([want, src, a]) => {
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

const fighterMemory = { hull: null, breakBeats: 0 };

/**
 * One beat of a kiting fighter (public input only): aim the mouse at the nearest hostile and fire,
 * hold a 230–400 u standoff, and break off — turn away from the pack and burn — when 3+ hostiles
 * close inside 450 u, when hit, or when low, instead of trading hits. Latch (Space) every 7th beat.
 */
export async function fightBeat(page, beat) {
  const tg = await page.evaluate(readTarget).catch(() => null);
  if (!tg) { await page.waitForTimeout(300); return; }
  const lost = fighterMemory.hull != null ? fighterMemory.hull - tg.hull : 0;
  fighterMemory.hull = tg.hull;
  // Kite: never sit inside a pack. Burn away when 3+ hostiles close in, when hit, or when low.
  if ((tg.near >= 3 && tg.packDist < 450) || lost > 0.04 || (tg.hull < 0.5 && tg.near >= 2 && tg.packDist < 600)) fighterMemory.breakBeats = Math.max(fighterMemory.breakBeats, 4);
  if (tg.none) {
    await holdKey(page, 'KeyW', 0.6, null, null);
    if (beat % 3 === 0) await holdKey(page, 'KeyA', 0.4, null, null);
    return;
  }
  await page.mouse.move(Math.round(tg.x), Math.round(tg.y), { steps: 2 });
  await page.mouse.down();
  // Turn by tapping: hold the turn key only as long as the bearing error needs (the hull turns
  // ~5 rad/s; holding it for a whole beat overshoots and the ship spins in place under fire).
  const keys = []; let turn = null; let err = 0;
  if (fighterMemory.breakBeats > 0 && tg.away != null) {
    fighterMemory.breakBeats--;
    err = tg.away; keys.push('KeyW');
  } else {
    err = tg.rel;
    if (tg.dist < 230) keys.push('KeyS');
    else if (tg.dist > 400 || beat % 3 !== 2) keys.push('KeyW');
  }
  if (Math.abs(err) > 0.12) turn = err > 0 ? 'KeyA' : 'KeyD'; // KeyD lowers rot (measured by the yaw probes)
  for (const k of keys) await page.keyboard.down(k);
  const turnS = turn ? Math.min(0.6, Math.abs(err) / 4.5) : 0;
  if (turn) { await page.keyboard.down(turn); await waitSim(page, turnS, { maxWallMs: 30000 }); await page.keyboard.up(turn); }
  await waitSim(page, Math.max(0.05, 0.6 - turnS), { maxWallMs: 30000 });
  for (const k of ['KeyW', 'KeyS', 'KeyA', 'KeyD']) await page.keyboard.up(k);
  await page.mouse.up();
  if (beat % 7 === 3) { await page.keyboard.press('Space'); }
}

/** A non-combat flyer for Adventure / racing: thrust bursts and gentle turns, never idle long. */
export async function cruiseBeat(page, beat) {
  await holdKey(page, 'KeyW', 0.8, null, null);
  if (beat % 4 === 1) await holdKey(page, beat % 8 === 1 ? 'KeyA' : 'KeyD', 0.4, null, null);
}
