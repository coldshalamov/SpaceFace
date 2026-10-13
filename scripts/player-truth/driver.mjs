// Public-input player. Keyboard and mouse only, through Playwright's trusted input (the same
// events a person produces). Observing window.SF to decide where to aim is allowed — a player
// sees the enemies on screen — but nothing here writes game state or calls a game service.

export const simNow = (page) => page.evaluate(() => (window.SF && window.SF.state ? window.SF.state.simTime : 0));
export const wallNow = (page) => page.evaluate(() => performance.now());

/** Wait until sim time advances by `seconds`, or a predicate (in page) becomes true, or wall cap.
 *  `page.__ptObserve`, when set, can end the wait early (sim stall or a screen over the HUD). */
export async function waitSim(page, seconds, { maxWallMs = 120000, until = null, arg = null } = {}) {
  const start = await simNow(page); const t0 = Date.now();
  while (Date.now() - t0 < maxWallMs) {
    if (typeof page.__ptObserve === 'function') {
      const hit = await page.__ptObserve();
      if (hit) return { done: false, watch: hit, sim: start };
    }
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

/** What is under a viewport point, in one short string. Recorded before the click, not after the screen changes. */
export async function noteClick(page, x, y) {
  const hit = await page.evaluate(([px, py]) => {
    const el = document.elementFromPoint(px, py);
    const text = el ? String(el.innerText || el.textContent || '').replace(/\s+/g, ' ').trim().slice(0, 40) : '';
    const element = !el ? 'nothing'
      : `${el.tagName.toLowerCase()}${el.id ? `#${el.id}` : ''}${el.classList.length ? `.${[...el.classList].slice(0, 3).join('.')}` : ''}${text ? ` "${text}"` : ''}`;
    const sm = window.SF && window.SF.ctx && window.SF.ctx.screenManager;
    const st = window.SF && window.SF.state;
    return { element, top: sm ? sm.top() : null, sim: st ? st.simTime : null, t: performance.now() };
  }, [x, y]).catch(() => ({ element: 'unreadable', top: null, sim: null, t: null }));
  const input = { kind: 'click', x, y, button: 'left', ...hit };
  page.__ptLastInput = input;
  page.__ptLastClick = input;
  return input;
}

export function noteKey(page, code) {
  const input = { kind: 'key', code };
  page.__ptLastInput = input;
  return input;
}

/** One flight sample for the play watcher. `boot` is the opening overlay, which is a loading state. */
/** Visible Wave G4 arc chips. Hidden slots stay `display: none` and are not marks. */
export async function readEdgeMarkers(page) {
  return page.evaluate(() => {
    const out = [];
    for (const el of document.querySelectorAll('.sf-threat-halo__slot--arc')) {
      const cs = getComputedStyle(el);
      if (cs.display === 'none' || cs.visibility === 'hidden' || Number(cs.opacity) < 0.05) continue;
      const r = el.getBoundingClientRect();
      if (r.width < 1 || r.height < 1) continue;
      out.push({ edge: el.getAttribute('data-edge'), x: Math.round(r.left + r.width / 2), y: Math.round(r.top + r.height / 2) });
    }
    return out;
  });
}

export async function readPlaySample(page) {
  return page.evaluate(() => {
    const st = window.SF && window.SF.state;
    const sm = window.SF && window.SF.ctx && window.SF.ctx.screenManager;
    const o = document.getElementById('boot-overlay');
    let boot = false;
    if (o) {
      const cs = getComputedStyle(o);
      boot = !(cs.display === 'none' || cs.visibility === 'hidden' || Number(cs.opacity) < 0.05 || o.hidden);
    }
    return {
      sim: st && Number.isFinite(st.simTime) ? st.simTime : null,
      t: performance.now(),
      mode: st ? st.mode : null,
      phase: st && st.run ? st.run.phase : null,
      top: sm ? sm.top() : null,
      boot,
    };
  });
}

export async function holdKey(page, code, seconds, label, probes, until = null) {
  const startSim = await simNow(page); const startT = await wallNow(page);
  noteKey(page, code);
  await page.keyboard.down(code);
  let waited = null;
  try { waited = await waitSim(page, seconds, { maxWallMs: 90000, until }); } finally { await page.keyboard.up(code); }
  const endSim = await simNow(page); const endT = await wallNow(page);
  const rec = { label, key: code, kind: code === 'KeyW' ? 'thrust' : 'yaw', startSim, endSim, startT, endT, watch: waited && waited.watch };
  if (probes) probes.push(rec);
  return rec;
}

/** Thrust and yaw probes: the "can I move at all" question, asked at every spawn/round start. */
export async function controlProbes(page, tag, probes) {
  const thrust = await holdKey(page, 'KeyW', 1.2, `${tag} thrust`, probes);
  if (thrust && thrust.watch) return thrust.watch;
  const yaw = await holdKey(page, 'KeyD', 0.8, `${tag} yaw`, probes);
  return yaw && yaw.watch ? yaw.watch : null;
}

export function readTarget() {
  const st = window.SF.state; const cam = st.render && st.render.camera; const THREE = window.SF.THREE;
  const me = st.entityList.find((e) => e.id === st.playerId);
  if (!me || !cam) return null;
  const canvas = st.render.renderer.domElement; const r = canvas.getBoundingClientRect();
  const v = new THREE.Vector3();
  const hostile = (e) => {
    const d = e.data || {};
    return d.runRole === 'enemy' || d.runRole === 'hostile'
      || !!(d.ai && (d.ai.huntPlayer || d.ai.forcePlayerTarget))
      || (e.team !== me.team && e.team !== 0 && e.team !== 2);
  };
  let best = null; let bd = Infinity;
  for (const e of st.entityList) {
    if (!e.alive || e.id === me.id || !(e.type === 'ship' || e.type === 'drone')) continue;
    if (!hostile(e)) continue;
    v.set(e.pos.x, e.pos.y || 0, e.pos.z).project(cam);
    const x = r.left + (v.x * 0.5 + 0.5) * r.width;
    const y = r.top + (-v.y * 0.5 + 0.5) * r.height;
    // A public shot must hit the gameplay canvas, not an off-screen coordinate
    // or a HUD control covering the target. Match the real DOM input boundary.
    if (v.z < -1 || v.z > 1 || x < r.left || x >= r.right || y < r.top || y >= r.bottom
      || document.elementFromPoint(Math.round(x), Math.round(y)) !== canvas) continue;
    const dist = Math.hypot(e.pos.x - me.pos.x, e.pos.z - me.pos.z);
    if (dist < bd) { bd = dist; best = e; }
  }
  let cx = 0; let cz = 0; let near = 0;
  for (const e of st.entityList) {
    if (!e.alive || e.id === me.id || !(e.type === 'ship' || e.type === 'drone')) continue;
    if (Math.hypot(e.pos.x - me.pos.x, e.pos.z - me.pos.z) > 700) continue;
    if (!hostile(e)) continue;
    cx += e.pos.x; cz += e.pos.z; near++;
  }
  let away = null; const packDist = near ? Math.hypot(me.pos.x - cx / near, me.pos.z - cz / near) : Infinity;
  if (near) { const a = Math.atan2(me.pos.z - cz / near, me.pos.x - cx / near); away = a - me.rot; while (away > Math.PI) away -= 2 * Math.PI; while (away < -Math.PI) away += 2 * Math.PI; }
  const hull = me.hullMax ? me.hull / me.hullMax : 1;
  if (!best) {
    // The off-screen hostile is a public radar glyph, not a hidden world target. Follow its
    // accessible dial bearing until a real target is reachable by the gameplay canvas.
    const radar = document.querySelector?.('.sf-radar-semantic-canvas');
    const text = radar?.getAttribute('aria-label') || '';
    const bearing = /Nearest hostile at \d+ o'clock, dial bearing (\d+) degrees\./.exec(text);
    const stampText = radar?.getAttribute('data-radar-bearing-sim');
    const stamp = stampText == null ? NaN : Number(stampText);
    let radarRel = null;
    if (radar?.offsetParent && bearing && Number.isFinite(stamp) && Number.isFinite(st.simTime)
      && st.simTime - stamp >= 0 && st.simTime - stamp <= 0.5) {
      // The radar's +X reads left, +Z reads up: a clockwise dial bearing maps to XZ heading.
      radarRel = Math.PI / 2 + Number(bearing[1]) * Math.PI / 180 - me.rot;
      while (radarRel > Math.PI) radarRel -= 2 * Math.PI;
      while (radarRel < -Math.PI) radarRel += 2 * Math.PI;
    }
    return { none: true, hull, radarRel, cx: r.left + r.width / 2, cy: r.top + r.height / 2 };
  }
  v.set(best.pos.x, best.pos.y || 0, best.pos.z).project(cam);
  // The hull's nose is (cos rot, sin rot) on XZ (src/core/flightDynamics.js localAxesInto).
  const ang = Math.atan2(best.pos.z - me.pos.z, best.pos.x - me.pos.x);
  let rel = ang - me.rot; while (rel > Math.PI) rel -= 2 * Math.PI; while (rel < -Math.PI) rel += 2 * Math.PI;
  return { x: r.left + (v.x * 0.5 + 0.5) * r.width, y: r.top + (-v.y * 0.5 + 0.5) * r.height, dist: bd, rel, away, near, packDist, hull, cx: r.left + r.width / 2, cy: r.top + r.height / 2 };
}

const fighterMemory = { hull: null, breakBeats: 0 };

// A pausing arena surface legitimately stops the simulation clock. Finish the
// current public-input beat and let run.mjs use its real between-round controls.
function combatPhaseEnded(st) {
  return st.mode !== 'flight'
    || !!(st.run && st.run.kind === 'survival' && st.run.phase !== 'active');
}

function readCombatPhaseEnded() {
  const st = window.SF.state;
  return st.mode !== 'flight'
    || !!(st.run && st.run.kind === 'survival' && st.run.phase !== 'active');
}

/**
 * One beat of a kiting fighter (public input only): aim the mouse at the nearest hostile and fire,
 * hold a 230–400 u standoff, and break off — turn away from the pack and burn — when 3+ hostiles
 * close inside 450 u, when hit, or when low, instead of trading hits. Latch (Space) every 7th beat.
 *
 * The aim point is the hostile's projected position even when that pixel is a HUD control
 * (the race-tape Circuits button is one). The click is recorded with elementFromPoint before
 * mouseup. The driver does not steer around DOM controls; the play watcher reports them.
 */
export async function fightBeat(page, beat) {
  const tg = await page.evaluate(readTarget).catch(() => null);
  if (!tg) { await page.waitForTimeout(300); return null; }
  const lost = fighterMemory.hull != null ? fighterMemory.hull - tg.hull : 0;
  fighterMemory.hull = tg.hull;
  // Kite: never sit inside a pack. Burn away when 3+ hostiles close in, when hit, or when low.
  if ((tg.near >= 3 && tg.packDist < 450) || lost > 0.04 || (tg.hull < 0.5 && tg.near >= 2 && tg.packDist < 600)) fighterMemory.breakBeats = Math.max(fighterMemory.breakBeats, 4);
  if (tg.none) {
    if (Number.isFinite(tg.radarRel)) {
      const turn = Math.abs(tg.radarRel) > 0.12 ? (tg.radarRel > 0 ? 'KeyD' : 'KeyA') : null;
      const turnS = turn ? Math.min(0.6, Math.abs(tg.radarRel) / 4.5) : 0;
      try {
        if (turn) {
          await page.keyboard.down(turn);
          await waitSim(page, turnS, { maxWallMs: 30000, until: combatPhaseEnded });
          await page.keyboard.up(turn);
        }
        if (!await page.evaluate(readCombatPhaseEnded)) {
          await holdKey(page, 'KeyW', Math.max(0.05, 0.6 - turnS), null, null, combatPhaseEnded);
        }
      } finally {
        for (const key of ['KeyW', 'KeyA', 'KeyD']) await page.keyboard.up(key);
      }
      return;
    }
    await holdKey(page, 'KeyW', 0.6, null, null, combatPhaseEnded);
    if (beat % 3 === 0 && !await page.evaluate(readCombatPhaseEnded)) {
      await holdKey(page, 'KeyA', 0.4, null, null, combatPhaseEnded);
    }
    return;
  }
  const x = Math.round(tg.x);
  const y = Math.round(tg.y);
  await page.mouse.move(x, y, { steps: 2 });
  // Record the element under the aim before the button goes down, and again before mouseup,
  // which is when a HUD button's click listener runs.
  await noteClick(page, x, y);
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
  if (Math.abs(err) > 0.12) turn = err > 0 ? 'KeyD' : 'KeyA'; // Native Pilot yaw: D raises rot, A lowers it.
  try {
    for (const k of keys) { noteKey(page, k); await page.keyboard.down(k); }
    const turnS = turn ? Math.min(0.6, Math.abs(err) / 4.5) : 0;
    if (turn) {
      noteKey(page, turn);
      await page.keyboard.down(turn);
      await waitSim(page, turnS, { maxWallMs: 30000, until: combatPhaseEnded });
      await page.keyboard.up(turn);
    }
    await waitSim(page, Math.max(0.05, 0.6 - turnS), { maxWallMs: 30000, until: combatPhaseEnded });
  } finally {
    for (const k of ['KeyW', 'KeyS', 'KeyA', 'KeyD']) await page.keyboard.up(k).catch(() => {});
    await noteClick(page, x, y);
    await page.mouse.up().catch(() => {});
  }
  if (typeof page.__ptObserve === 'function') {
    const after = await page.__ptObserve();
    if (after) return after;
  }
  if (beat % 7 === 3 && !await page.evaluate(readCombatPhaseEnded)) { noteKey(page, 'Space'); await page.keyboard.press('Space'); }
}

/** A non-combat flyer for Adventure / racing: thrust bursts and gentle turns, never idle long. */
export async function cruiseBeat(page, beat) {
  const thrust = await holdKey(page, 'KeyW', 0.8, null, null);
  if (thrust && thrust.watch) return thrust.watch;
  if (beat % 4 === 1) {
    const yaw = await holdKey(page, beat % 8 === 1 ? 'KeyA' : 'KeyD', 0.4, null, null);
    if (yaw && yaw.watch) return yaw.watch;
  }
  return null;
}
