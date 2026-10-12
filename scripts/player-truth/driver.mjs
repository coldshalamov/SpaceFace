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
  const canvas = st.render.renderer.domElement; const r = canvas.getBoundingClientRect();
  const v = new THREE.Vector3();
  if (!best) return { none: true, cx: r.left + r.width / 2, cy: r.top + r.height / 2 };
  v.set(best.pos.x, best.pos.y || 0, best.pos.z).project(cam);
  const ang = Math.atan2(best.pos.x - me.pos.x, best.pos.z - me.pos.z);
  let rel = ang - me.rot; while (rel > Math.PI) rel -= 2 * Math.PI; while (rel < -Math.PI) rel += 2 * Math.PI;
  return { x: r.left + (v.x * 0.5 + 0.5) * r.width, y: r.top + (-v.y * 0.5 + 0.5) * r.height, dist: bd, rel, cx: r.left + r.width / 2, cy: r.top + r.height / 2 };
}

/** One beat of a simple fighting player: aim the mouse at the nearest hostile, fire, close/open range. */
export async function fightBeat(page, beat) {
  const tg = await page.evaluate(readTarget).catch(() => null);
  if (!tg) { await page.waitForTimeout(300); return; }
  if (tg.none) {
    await holdKey(page, 'KeyW', 0.6, null, null);
    if (beat % 3 === 0) await holdKey(page, 'KeyA', 0.4, null, null);
    return;
  }
  await page.mouse.move(Math.round(tg.x), Math.round(tg.y), { steps: 2 });
  await page.mouse.down();
  const turnKey = tg.rel > 0.3 ? 'KeyD' : tg.rel < -0.3 ? 'KeyA' : null;
  if (turnKey) await page.keyboard.down(turnKey);
  if (tg.dist > 260) await page.keyboard.down('KeyW');
  else if (tg.dist < 90) await page.keyboard.down('KeyS');
  await waitSim(page, 0.6, { maxWallMs: 30000 });
  for (const k of ['KeyW', 'KeyS', 'KeyA', 'KeyD']) await page.keyboard.up(k);
  await page.mouse.up();
  if (beat % 7 === 3) { await page.keyboard.press('Space'); }
}

/** A non-combat flyer for Adventure / racing: thrust bursts and gentle turns, never idle long. */
export async function cruiseBeat(page, beat) {
  await holdKey(page, 'KeyW', 0.8, null, null);
  if (beat % 4 === 1) await holdKey(page, beat % 8 === 1 ? 'KeyA' : 'KeyD', 0.4, null, null);
}
