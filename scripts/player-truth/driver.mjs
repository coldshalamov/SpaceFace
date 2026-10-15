// Public-input player. Keyboard and mouse only, through Playwright's trusted input (the same
// events a person produces). Observing window.SF to decide where to aim is allowed — a player
// sees the enemies on screen — but nothing here writes game state or calls a game service.

export const simNow = (page) => page.evaluate(() => (window.SF && window.SF.state ? window.SF.state.simTime : 0));
export const wallNow = (page) => page.evaluate(() => performance.now());

/** Wait until sim time advances by `seconds`, or a predicate (in page) becomes true, or wall cap.
 *  `page.__ptObserve`, when set, can end the wait early (sim stall or a screen over the HUD). */
export async function waitSim(page, seconds, { maxWallMs = 120000, until = null, arg = null, onPoll = null } = {}) {
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
    if (onPoll && await onPoll()) return { ...r, stop: true };
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
/** Visible G4 chips and the exact shooter centers the live halo projects. Observer only. */
export function observeEdgeMarkers({ drain = false } = {}) {
    const reader = window.__playerTruth;
    const batch = drain ? reader && reader.drain() : null;
    if (drain && !batch) return null;
    const sf = window.SF;
    const state = sf && sf.state;
    const observedAt = performance.now();
    const out = [];
    const markersBySample = new Map();
    const recordMarker = (sample, marker) => {
      if (!sample) return;
      const rows = markersBySample.get(sample) || [];
      rows.push(marker);
      markersBySample.set(sample, rows);
    };
    for (const el of document.querySelectorAll('.sf-threat-halo__slot--arc')) {
      const cs = getComputedStyle(el);
      if (cs.display === 'none' || cs.visibility === 'hidden' || Number(cs.opacity) < 0.05) continue;
      const r = el.getBoundingClientRect();
      if (r.width < 1 || r.height < 1) continue;
      const marker = { edge: el.getAttribute('data-edge'), x: Math.round(r.left + r.width / 2), y: Math.round(r.top + r.height / 2), shooter: null };
      const rawId = el.getAttribute('data-entity-id');
      if (rawId != null && rawId !== '') {
        const id = Number.isFinite(Number(rawId)) ? Number(rawId) : rawId;
        let placed = null;
        try { placed = JSON.parse(el.getAttribute('data-placement-read')); } catch { /* missing producer read fails closed */ }
        const rawFrame = (el.parentElement || el.parentNode)?.getAttribute?.('data-placement-frame');
        const publication = rawFrame != null && rawFrame !== '' ? Number(rawFrame) : null;
        let reason = null;
        if (placed?.version !== 1) reason = 'missing producer placement';
        else if (placed.id !== id) reason = 'different shooter life';
        else if (drain && !Number.isSafeInteger(placed.tick)) reason = 'invalid producer placement';
        else if (!Number.isFinite(placed.at) || !Number.isFinite(placed.expiresAt)
          || !Number.isFinite(placed.checkedAt) || placed.at > placed.checkedAt
          || placed.checkedAt > observedAt || placed.expiresAt > placed.at + 250
          || !Number.isFinite(placed.x) || !Number.isFinite(placed.y)
          || typeof placed.onScreen !== 'boolean') reason = 'invalid producer placement';
        else if (!Number.isSafeInteger(publication) || publication < 1 || placed.frame !== publication) reason = 'older halo publication';
        else if (placed.checkedAt > placed.expiresAt) reason = 'expired at halo publication';
        const sourceSample = drain && Number.isSafeInteger(placed?.tick)
          ? batch.samples.find((sample) => sample && sample.tick === placed.tick) || null
          : null;
        if (drain && !sourceSample && !reason) {
          // The marker belongs to a HUD publication whose simulation sample was not retained.
          // Leave it unmeasured instead of assigning its identity to a nearby frame.
          continue;
        }
        if (!reason && drain) {
          const sourceIdentity = typeof reader?.identityFor === 'function'
            ? reader.identityFor(id, placed.generation)
            : null;
          const sourceHasShooter = sourceIdentity != null
            && Array.isArray(sourceSample?.e)
            && sourceSample.e.some((entity) => entity && entity[0] === sourceIdentity);
          if (!sourceHasShooter) reason = 'no living shooter in publication sample';
          else if (state?.tick === placed.tick) {
            const shooter = state.entities?.get?.(id);
            const data = shooter?.data || {};
            const weapons = data.weapons || shooter?.weapons;
            const eligible = shooter?.alive !== false && shooter?.type === 'ship' && data.unarmed !== true
              && data.canShoot !== false && (!Array.isArray(weapons) || weapons.length > 0);
            if (!shooter) reason = 'no living shooter in publication state';
            else if (placed.generation !== (shooter.occupantGeneration ?? null)) reason = 'different shooter life';
            else if (!eligible) reason = 'ineligible shooter';
          }
        } else if (!reason) {
          // Direct reads have no retained source frame, so validate against the current actor.
          const shooter = state?.entities?.get?.(id);
          const data = shooter?.data || {};
          const weapons = data.weapons || shooter?.weapons;
          const eligible = shooter?.alive !== false && shooter?.type === 'ship' && data.unarmed !== true
            && data.canShoot !== false && (!Array.isArray(weapons) || weapons.length > 0);
          if (placed.generation !== (shooter?.occupantGeneration ?? null)) reason = 'different shooter life';
          else if (!eligible) reason = 'ineligible shooter';
        }
        // A producer-approved grace chip is the painted chip until next publication.
        // Observation wall time alone cannot revoke an otherwise unchanged HUD frame.
        if (!reason) marker.shooter = { id, alive: true,
          onScreen: placed.onScreen, behind: placed.behind === true, x: placed.x, y: placed.y };
        else marker.placementFailure = { reason, id,
          generation: state?.entities?.get?.(id)?.occupantGeneration ?? null, placement: placed };
        if (drain) recordMarker(sourceSample || (reason ? batch.samples.at(-1) : null), marker);
      } else {
        marker.placementFailure = { reason: 'missing shooter identity', placement: null };
        if (drain) recordMarker(batch.samples.at(-1), marker);
      }
      out.push(marker);
    }
    if (!drain) return out;
    for (const [sample, markers] of markersBySample) {
      sample.edgeMarkers = markers;
      sample.edgeMarkerAt = observedAt;
    }
    return typeof reader.packBatch === 'function' ? reader.packBatch(batch) : batch;
}

export async function readEdgeMarkers(page) {
  return page.evaluate(observeEdgeMarkers);
}

/** Drain and observe the DOM in one task, before another render can replace its actors. */
export async function drainPlayerTruth(page) {
  return page.evaluate(observeEdgeMarkers, { drain: true });
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

/**
 * Read only the race cue that is painted for a player. The compact map is the authoritative
 * visible course projection: its target circle and ship path are both screen-space SVG nodes,
 * so this actor never reads race params, world coordinates, or a simulation command. The text
 * hint remains a useful fallback for a reduced/older HUD where the map is not mounted.
 */
export function readVisibleRaceCue() {
  const doc = globalThis.document;
  const root = doc?.querySelector?.('#race-tape');
  if (!root || root.hidden === true) return null;
  const visible = (node) => {
    if (!node || node.hidden === true) return false;
    const style = globalThis.getComputedStyle?.(node);
    if (style && (style.display === 'none' || style.visibility === 'hidden' || Number(style.opacity) < 0.05)) return false;
    return true;
  };
  if (!visible(root)) return null;
  const finite = (value) => Number.isFinite(Number(value)) ? Number(value) : null;
  const attr = (node, key) => node?.getAttribute?.(key);
  let bearingDeg = null;
  let distanceWU = null;
  const map = root.querySelector?.('.race-tape-map svg') || doc.querySelector?.('#race-tape .race-map');
  if (visible(map)) {
    const target = map.querySelector?.('circle');
    const ship = map.querySelector?.('path');
    const targetX = finite(attr(target, 'cx'));
    const targetY = finite(attr(target, 'cy'));
    const transform = String(attr(ship, 'transform') || '');
    const translate = /translate\(\s*([-+]?\d*\.?\d+(?:e[-+]?\d+)?)\s*[, ]\s*([-+]?\d*\.?\d+(?:e[-+]?\d+)?)\s*\)/i.exec(transform);
    const rotate = /rotate\(\s*([-+]?\d*\.?\d+(?:e[-+]?\d+)?)\s*[, ]?/i.exec(transform);
    const shipX = finite(translate?.[1]);
    const shipY = finite(translate?.[2]);
    const rotationDeg = finite(rotate?.[1]);
    if (targetX !== null && targetY !== null && shipX !== null && shipY !== null && rotationDeg !== null) {
      const dx = targetX - shipX;
      const dy = targetY - shipY;
      if (Math.hypot(dx, dy) > 0.5) {
        // The map ship path points up before its authored +90deg SVG rotation. Subtracting
        // that quarter turn recovers the same +X/+Z nose frame used by the painted course.
        const yaw = (rotationDeg - 90) * Math.PI / 180;
        const fx = Math.cos(yaw); const fz = Math.sin(yaw);
        bearingDeg = Math.atan2(fx * dy - fz * dx, fx * dx + fz * dy) * 180 / Math.PI;
      }
    }
  }
  const hints = root.querySelectorAll?.('.race-tape-hint') || [];
  let hintText = '';
  for (const node of hints) {
    if (!visible(node)) continue;
    const text = String(node.textContent || '').replace(/\s+/g, ' ').trim();
    if (text) { hintText = text; break; }
  }
  const directionMatch = /\b(LEFT|RIGHT|AHEAD)\b/i.exec(hintText);
  const direction = bearingDeg !== null
    ? (bearingDeg > 12 ? 'right' : bearingDeg < -12 ? 'left' : 'ahead')
    : directionMatch ? directionMatch[1].toLowerCase() : null;
  const distanceMatch = /(\d[\d,]*(?:\.\d+)?)\s*wu\b/i.exec(hintText);
  if (distanceMatch) distanceWU = Number(distanceMatch[1].replace(/,/g, ''));
  if (!direction) return null;
  if (bearingDeg === null) bearingDeg = direction === 'right' ? 30 : direction === 'left' ? -30 : 0;
  return { direction, bearingDeg, distanceWU, hintText };
}

async function holdPublicKeys(page, codes, seconds, until = null) {
  const unique = [...new Set(codes.filter(Boolean))];
  const pressed = [];
  const startSim = await simNow(page); const startT = await wallNow(page);
  let waited = null;
  try {
    for (const code of unique) {
      noteKey(page, code);
      await page.keyboard.down(code);
      pressed.push(code);
    }
    waited = await waitSim(page, seconds, { maxWallMs: 90000, until });
  } finally {
    for (let i = pressed.length - 1; i >= 0; i--) await page.keyboard.up(pressed[i]).catch(() => {});
  }
  return { startSim, endSim: await simNow(page), startT, endT: await wallNow(page), waited };
}

async function resolveBoostCode(page) {
  try {
    const code = await page.evaluate(async () => {
      const { resolveActionCodes } = await import('../../src/systems/input.js');
      return resolveActionCodes(window.SF.state, 'boost')[0] || null;
    });
    return typeof code === 'string' && code ? code : 'ShiftLeft';
  } catch {
    return 'ShiftLeft';
  }
}

/** Thrust and yaw probes: the "can I move at all" question, asked at every spawn/round start. */
export async function controlProbes(page, tag, probes) {
  const thrust = await holdKey(page, 'KeyW', 1.2, `${tag} thrust`, probes);
  if (thrust && thrust.watch) return thrust.watch;
  const yaw = await holdKey(page, 'KeyD', 0.8, `${tag} yaw`, probes);
  return yaw && yaw.watch ? yaw.watch : null;
}

export async function readTarget({ selectedOnly = false } = {}) {
  const [{ presentationAllowsTargetLock }, { collectPresentedBodyLeaves }] = await Promise.all([
    import('../../src/core/presentationAdmission.js'), import('../../src/render/worldObjectPicking.js'),
  ]);
  const st = window.SF.state; const cam = st.render && st.render.camera; const THREE = window.SF.THREE;
  const me = st.entityList.find((e) => e.id === st.playerId);
  const meshes = st.render && st.render.meshes;
  if (!me || !cam) return null;
  const canvas = st.render.renderer.domElement; const r = canvas.getBoundingClientRect();
  const v = new THREE.Vector3();
  const hostile = (e) => {
    const d = e.data || {};
    return d.runRole === 'enemy' || d.runRole === 'hostile'
      || !!(d.ai && (d.ai.huntPlayer || d.ai.forcePlayerTarget))
      || (e.team !== me.team && e.team !== 0 && e.team !== 2);
  };
  let best = null; let bd = Infinity; let bestX = 0; let bestY = 0;
  // Keep a tiny explanation for a no-target observation. This is intentionally a capped list
  // carried with the existing read result, rather than a per-frame diagnostic stream: it lets a
  // route receipt distinguish a pending body from a canvas/HUD miss without adding observer work.
  const rejects = [];
  const reject = (reason) => { if (rejects.length < 4 && !rejects.includes(reason)) rejects.push(reason); };
  for (const e of st.entityList) {
    if (!e.alive || e.id === me.id || !(e.type === 'ship' || e.type === 'drone')) continue;
    if (!hostile(e)) continue;
    // Use the same authored-presentation receipt as the live Tab/overview producer.
    // A staged pending hull must not mask an admitted contact; pooled bodies stay eligible.
    if (!presentationAllowsTargetLock(e, st)) { reject('presentation'); continue; }
    if (selectedOnly && e.id !== st.player?.targetId) continue;
    const root = meshes?.get(e.id);
    let x; let y; let depth = 0;
    if (root?.matrixWorld) {
      if (root.visible === false) { reject('hidden'); continue; }
      if (typeof root.traverse === 'function' && !collectPresentedBodyLeaves(root).length) {
        reject('unpresented'); continue;
      }
      v.setFromMatrixPosition(root.matrixWorld).project(cam);
      x = r.left + (v.x * 0.5 + 0.5) * r.width;
      y = r.top + (-v.y * 0.5 + 0.5) * r.height; depth = v.z;
    } else {
      // Instanced/pooled contacts need no per-entity root. Read the renderer's current
      // frame projection instead of treating a simulation coordinate as camera-local.
      const point = window.SF.ctx?.helpers?.worldToScreen?.(e.pos);
      if (!point?.onScreen || point.behind) { reject('projection'); continue; }
      x = point.x; y = point.y;
    }
    // A public shot must hit the gameplay canvas, not an off-screen coordinate
    // or a HUD control covering the target. Match the real DOM input boundary.
    if (depth < -1 || depth > 1 || x < r.left || x >= r.right || y < r.top || y >= r.bottom
      ) { reject('projection'); continue; }
    if (document.elementFromPoint(Math.round(x), Math.round(y)) !== canvas) {
      reject('covered'); continue;
    }
    const dist = Math.hypot(e.pos.x - me.pos.x, e.pos.z - me.pos.z);
    if (dist < bd) { bd = dist; best = e; bestX = x; bestY = y; }
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
    return { none: true, hull, radarRel, cx: r.left + r.width / 2, cy: r.top + r.height / 2,
      rejects: rejects.length ? rejects : null };
  }
  // The hull's nose is (cos rot, sin rot) on XZ (src/core/flightDynamics.js localAxesInto).
  const ang = Math.atan2(best.pos.z - me.pos.z, best.pos.x - me.pos.x);
  let rel = ang - me.rot; while (rel > Math.PI) rel -= 2 * Math.PI; while (rel < -Math.PI) rel += 2 * Math.PI;
  const selected = st.player?.targetId === best.id;
  let x = bestX; let y = bestY;
  // Follow the game's painted "aim here" cue only for this selected visible subject.
  // No velocity, solver or hidden intercept enters the actor's decision.
  const pip = selected ? document.querySelector?.('.sf-leadpip.visible') : null;
  if (pip?.offsetParent) {
    const box = pip.getBoundingClientRect();
    const px = box.left + box.width / 2; const py = box.top + box.height / 2;
    if (box.width > 0 && box.height > 0 && px >= r.left && px < r.right && py >= r.top && py < r.bottom
      && document.elementFromPoint(Math.round(px), Math.round(py)) === canvas) { x = px; y = py; }
  }
  return { x, y, selected, dist: bd, rel, away, near, packDist, hull, cx: r.left + r.width / 2, cy: r.top + r.height / 2 };
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

/** The painted payload readout is a public line cue, including the older HUD layout. */
function readAttachedMassline() {
  for (const selector of ['.orr-cluster__payload', '#sf-tetherstat']) {
    const node = document.querySelector?.(selector);
    if (!node?.offsetParent || node.hidden || typeof node.getBoundingClientRect !== 'function') continue;
    const style = getComputedStyle(node); const box = node.getBoundingClientRect();
    if (style.display !== 'none' && style.visibility !== 'hidden' && style.visibility !== 'collapse'
      && Number(style.opacity) >= 0.05 && box.width > 0 && box.height > 0) return true;
  }
  return false;
}

async function releaseFightMassline(page) {
  // A prior combat latch keeps orbit assist in charge of this W/turn chord. A public tap
  // cuts the visible line before chasing; otherwise the fighter circles its distant load.
  if (await page.evaluate(readAttachedMassline)) {
    if (await page.evaluate(readCombatPhaseEnded)) return false;
    const cutCode = await page.evaluate(async () => {
      const { resolveActionCodes } = await import('../../src/systems/input.js');
      return resolveActionCodes(window.SF.state, 'tether')[0] || null;
    });
    if (!cutCode) return false;
    noteKey(page, cutCode);
    try { await page.keyboard.press(cutCode); }
    finally { await page.keyboard.up(cutCode).catch(() => {}); }
    // Let the fixed-tick tap grammar and the painted payload update finish. Do not
    // chase through a modal or assume a still-visible line has released successfully.
    const cut = await waitSim(page, 0.6, { maxWallMs: 30000, until: combatPhaseEnded,
      onPoll: async () => !await page.evaluate(readAttachedMassline) });
    if (cut.watch || cut.timeout || await page.evaluate(readCombatPhaseEnded)
      || await page.evaluate(readAttachedMassline)) return false;
  }
  return true;
}

async function searchFightBeat(page, tg, beat, minimumSearchS = 0) {
  let reachable = null;
  if (Number.isFinite(tg?.radarRel)) {
    const boostCode = await page.evaluate(async () => {
      const { resolveActionCodes } = await import('../../src/systems/input.js');
      return resolveActionCodes(window.SF.state, 'boost')[0] || null;
    });
    const held = new Set();
    const setHeld = async (code, down) => {
      if (!code || down === held.has(code)) return;
      if (down) { held.add(code); noteKey(page, code); await page.keyboard.down(code); }
      else { held.delete(code); await page.keyboard.up(code); }
    };
    const searchStart = await simNow(page);
    let boostUntil = searchStart;
    let wasAligned = false;
    try {
      await waitSim(page, 2.4, { maxWallMs: 30000, until: combatPhaseEnded, onPoll: async () => {
        const fresh = await page.evaluate(readTarget);
        if (!fresh) return true;
        if (!fresh.none && await simNow(page) - searchStart >= minimumSearchS) {
          // Carry this same public observation into the selection path. Returning to the outer
          // beat loop first can lose a fast contact between two canvas frames (the Gauntlet
          // failure case); the next action still revalidates the click and selection normally.
          reachable = fresh;
          return true;
        }
        // After a failed pick, seeing that same hull is not recovery. Move around the
        // cover briefly, following its visible bearing, before attempting selection again.
        const bearing = fresh.none ? fresh.radarRel : fresh.rel;
        if (!Number.isFinite(bearing)) return true;
        const now = await simNow(page);
        const turn = Math.abs(bearing) > 0.12 ? (bearing > 0 ? 'KeyD' : 'KeyA') : null;
        const aligned = Math.abs(bearing) <= 0.35;
        // Keep closing while the public pilot turns onto the course. A lost contact can orbit at
        // the edge of the radar band; turning in place until the nose is nearly aligned leaves
        // the fighter circling that same distance indefinitely. W is still an ordinary public
        // input and the turn remains bounded by the painted bearing, so this never steers from
        // hidden world coordinates. Boost stays alignment-gated below.
        await setHeld('KeyW', true);
        if (aligned && !wasAligned) boostUntil = now + 0.35;
        wasAligned = aligned;
        await setHeld('KeyA', turn === 'KeyA'); await setHeld('KeyD', turn === 'KeyD');
        // Boost is a short public course pulse, not a second continuous chase throttle.
        await setHeld(boostCode, aligned && now < boostUntil);
        // A keydown can itself open a public draft/overlay. Stop before waitSim asks the
        // frozen clock for another sample, while its finally block still releases every key.
        return await page.evaluate(readCombatPhaseEnded);
      } });
    } finally {
      for (const key of new Set(['KeyW', 'KeyA', 'KeyD', boostCode].filter(Boolean))) await page.keyboard.up(key).catch(() => {});
    }
    return reachable;
  }
  await holdKey(page, 'KeyW', 0.6, null, null, combatPhaseEnded);
  if (beat % 3 === 0 && !await page.evaluate(readCombatPhaseEnded)) {
    await holdKey(page, 'KeyA', 0.4, null, null, combatPhaseEnded);
  }
  return reachable;
}

/**
 * One beat of a kiting fighter (public input only): select the nearest reachable hostile with RMB,
 * aim at its visible lead pip (or the hull when no pip is painted), and fire,
 * hold a 230–400 u standoff, and break off — turn away from the pack and burn — when 3+ hostiles
 * close inside 450 u, when hit, or when low, instead of trading hits. Latch (Space) every 7th beat.
 *
 * Both the hull pick and aim point must reach the gameplay canvas. The click is recorded with
 * elementFromPoint before mouseup, and the play watcher reports any later DOM interruption.
 */
export async function fightBeat(page, beat) {
  // A reachable target is not evidence that the previous line has released.
  // Cut the painted payload before either visible-target steering or radar pursuit.
  if (!await releaseFightMassline(page)) return null;
  let tg = await page.evaluate(readTarget).catch(() => null);
  if (!tg) { await page.waitForTimeout(300); return null; }
  const lost = fighterMemory.hull != null ? fighterMemory.hull - tg.hull : 0;
  fighterMemory.hull = tg.hull;
  // Kite: never sit inside a pack. Burn away when 3+ hostiles close in, when hit, or when low.
  if ((tg.near >= 3 && tg.packDist < 450) || lost > 0.04 || (tg.hull < 0.5 && tg.near >= 2 && tg.packDist < 600)) fighterMemory.breakBeats = Math.max(fighterMemory.breakBeats, 4);
  if (tg.none) {
    tg = await searchFightBeat(page, tg, beat);
    // A fresh target found during radar pursuit is still a public observation. Continue through
    // the ordinary RMB/Tab selection and firing path immediately, instead of making the caller
    // spend another beat re-reading a contact that may already have crossed the canvas edge.
    if (!tg || tg.none) return tg;
  }
  if (!tg.selected) {
    // Default gun assist retains a valid old lock. A cursor over a different hull does not
    // release it: use the same quick RMB selection a person would before this shot.
    const pickX = Math.round(tg.x); const pickY = Math.round(tg.y);
    await page.mouse.move(pickX, pickY, { steps: 2 });
    await page.mouse.click(pickX, pickY, { button: 'right' });
    await waitSim(page, 1 / 60, { maxWallMs: 30000, until: combatPhaseEnded });
    if (await page.evaluate(readCombatPhaseEnded)) return;
    tg = await page.evaluate(readTarget, { selectedOnly: true }).catch(() => null);
    if (!tg || tg.none || !tg.selected) {
      // A hull can move behind cover between observation and the real ray pick. Use the
      // shipped keyboard lock controls, then shoot only a selection visible on the canvas.
      noteKey(page, 'Backspace'); await page.keyboard.press('Backspace');
      noteKey(page, 'Tab'); await page.keyboard.press('Tab');
      await waitSim(page, 1 / 60, { maxWallMs: 30000, until: combatPhaseEnded });
      if (await page.evaluate(readCombatPhaseEnded)) return;
      tg = await page.evaluate(readTarget, { selectedOnly: true }).catch(() => null);
      // Selection attempts are not a flight action. A repeated miss must still move
      // through the public search route rather than freezing on the same failed pick.
      if (!tg || tg.none || !tg.selected) return searchFightBeat(page, tg, beat, 0.4);
    }
  }
  let x = Math.round(tg.x); let y = Math.round(tg.y);
  await page.mouse.move(x, y, { steps: 2 });
  // Record the element under the aim before the button goes down, and again before mouseup,
  // which is when a HUD button's click listener runs.
  await noteClick(page, x, y);
  // Turn by tapping: hold the turn key only as long as the bearing error needs (the hull turns
  // ~5 rad/s; holding it for a whole beat overshoots and the ship spins in place under fire).
  const keys = []; let err = 0;
  const retreat = fighterMemory.breakBeats > 0 && tg.away != null;
  if (retreat) {
    fighterMemory.breakBeats--;
    err = tg.away; keys.push('KeyW');
  } else {
    err = tg.rel;
    if (tg.dist < 230) keys.push('KeyS');
    else if (tg.dist > 400 || beat % 3 !== 2) keys.push('KeyW');
  }
  const tapTurn = async (bearing) => {
    if (!Number.isFinite(bearing) || Math.abs(bearing) <= 0.12) return;
    const turn = bearing > 0 ? 'KeyD' : 'KeyA'; // Native Pilot yaw: D raises rot, A lowers it.
    noteKey(page, turn);
    // Release within the public input call, before any observer/aim RPC can delay a
    // simulation-time deadline. Reobserve between short taps instead of overshooting.
    await page.keyboard.press(turn, { delay: Math.min(80, Math.abs(bearing) / 4.5 * 1000) });
  };
  const refreshAim = async () => {
    const fresh = await page.evaluate(readTarget, { selectedOnly: true });
    if (!fresh || fresh.none || !fresh.selected) return true;
    const nextX = Math.round(fresh.x); const nextY = Math.round(fresh.y);
    if (nextX !== x || nextY !== y) {
      x = nextX; y = nextY;
      await page.mouse.move(x, y, { steps: 1 });
    }
    await tapTurn(retreat && fresh.away != null ? fresh.away : fresh.rel);
    return false;
  };
  try {
    await page.mouse.down();
    for (const k of keys) { noteKey(page, k); await page.keyboard.down(k); }
    await tapTurn(err);
    await waitSim(page, 0.6, { maxWallMs: 30000, until: combatPhaseEnded, onPoll: refreshAim });
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

/** A bounded public pilot for the temporary circuit. Turn first on the painted next-gate cue;
 * only add thrust (and then a short boost) once the nose is aligned. */
export async function racingCruiseBeat(page, beat) {
  const cue = await page.evaluate(readVisibleRaceCue).catch(() => null);
  if (!cue) {
    // A transiently unmounted tape is a route transition, not permission to fly blind through
    // authored scenery. Keep a small public yaw pulse so a remounted map gets a fresh heading.
    return holdKey(page, beat % 2 ? 'KeyD' : 'KeyA', 0.18, null, null);
  }
  const bearing = Number.isFinite(cue.bearingDeg)
    ? cue.bearingDeg : cue.direction === 'right' ? 30 : cue.direction === 'left' ? -30 : 0;
  const absBearing = Math.abs(bearing);
  if (absBearing > 14) {
    const turn = bearing > 0 ? 'KeyD' : 'KeyA';
    const duration = Math.min(0.46, Math.max(0.12, absBearing / 180 * 0.7));
    return holdKey(page, turn, duration, null, null);
  }
  const pulse = Number.isFinite(cue.distanceWU) && cue.distanceWU < 120 ? 0.22 : 0.34;
  const boost = absBearing <= 8 && (!Number.isFinite(cue.distanceWU) || cue.distanceWU > 160)
    ? await resolveBoostCode(page) : null;
  return holdPublicKeys(page, ['KeyW', boost], pulse);
}

/** A non-combat flyer for Adventure: thrust bursts and gentle turns, never idle long. */
export async function cruiseBeat(page, beat, { racing = false } = {}) {
  if (racing) return racingCruiseBeat(page, beat);
  const thrust = await holdKey(page, 'KeyW', 0.8, null, null);
  if (thrust && thrust.watch) return thrust.watch;
  if (beat % 4 === 1) {
    const yaw = await holdKey(page, beat % 8 === 1 ? 'KeyA' : 'KeyD', 0.4, null, null);
    if (yaw && yaw.watch) return yaw.watch;
  }
  return null;
}
