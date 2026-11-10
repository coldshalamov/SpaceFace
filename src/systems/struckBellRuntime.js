// Phoebe's practice bell is a physical lesson, not the Shard Sphere's Song mission.
// Existing asteroid geometry, Massline release and native impact owners supply the work.
// Only this encounter's transient evidence is kept here; the director owns durable receipts.
import { resolveCollisionProxyManifest, proxyOuterRadiusWu, proxyScaleFor } from '../data/collisionProxyManifests.js';
import { occupantGenerationOf } from '../core/entity.js';
import { queryAsteroidField } from '../world/asteroidField.js';
import { forEachDressingRow } from '../world/dressingTable.js';
import { asteroidColliderRadius } from '../data/asteroidColliders.js';
import { sectorLocalToGlobalForSector } from '../data/sectorCoordinates.js';
import { phoebePracticeDirection } from '../data/phoebePracticeConnection.js';

export const STRUCK_BELL_ID = 'scene_struck_bell';
export const STRUCK_BELL_SITE = Object.freeze({
  anchor: Object.freeze(sectorLocalToGlobalForSector({ x: 1600, z: -1400 }, 'sector_phoebe_echo')),
  admissionRadius: 700, abandonRadius: 1200, deadlineS: 150,
  bearingMin: 70, bearingMax: 180, bearingSpeed: 3, bearingReadings: 8,
  releaseWindowS: 20, minimumImpulse: 10,
});
const finite = (p) => p && Number.isFinite(p.x) && Number.isFinite(p.z);
const distance = (a, b) => finite(a) && finite(b) ? Math.hypot(a.x - b.x, a.z - b.z) : Infinity;
const speed = (e) => finite(e?.vel) ? Math.hypot(e.vel.x, e.vel.z) : Infinity;
const liveEntity = (state, e) => e && e.alive !== false && finite(e.pos)
  && state.entities?.get?.(e.id) === e;
const sameLife = (state, e, generations) => liveEntity(state, e)
  && generations.get(e) != null && occupantGenerationOf(e) === generations.get(e);
const active = (state, player) => state?.mode === 'flight' && state.timeScale > 0
  && !state.ui?.docked && !state.player?.flags?.docked && player?.alive !== false;
const say = (d, l, text) => d.say(l, 'info', text, null, { literal: true });
const role = (state, live, name) => state.entities?.get?.(live.ids?.find((id) => live.roles?.[id] === name));

export const STRUCK_BELL_ANCHORS = Object.freeze([[0,0],[300,0],[0,-300],[-300,0]].map(([x,z]) =>
  Object.freeze({x:STRUCK_BELL_SITE.anchor.x+x,z:STRUCK_BELL_SITE.anchor.z+z})));
export function struckBellAnchor(state, player) {
  if (state?.world?.currentSectorId !== 'sector_phoebe_echo' || !active(state,player) || !liveEntity(state,player)) return null;
  return STRUCK_BELL_ANCHORS.find((anchor) => distance(player.pos,anchor) <= STRUCK_BELL_SITE.admissionRadius
    && struckBellPlacementClear(state,anchor)) || null;
}
export function struckBellAdmission(state, registry, player) {
  return struckBellAnchor(state,player) != null;
}

// Conservative admission only: never relocate existing scenery or the arriving player.
export function struckBellPlacementClear(state, a = STRUCK_BELL_SITE.anchor) {
  const seats = [{ x: a.x-20, z: a.z+150, r: 50 }, { x:a.x+130,z:a.z+160,r:50 },
    { x:a.x-140,z:a.z-160,r:50 }, { x:a.x+110,z:a.z,r:asteroidColliderRadius('ast_crystalline',14) },
    { x:a.x-100,z:a.z,r:asteroidColliderRadius('ast_common_rock',4) }];
  const bodies = [...new Set([...(state.entityList || []), ...(state.entities?.values?.() || [])])];
  bodies.push(...queryAsteroidField(state, a, 700, []));
  forEachDressingRow(state, (e) => bodies.push(e));
  return bodies.every((e) => {
    if (!e || e.alive === false || !finite(e.pos) || e.collides === false) return true;
    const manifest = resolveCollisionProxyManifest(e);
    const scale = manifest ? proxyScaleFor(e, manifest) : 1;
    const hullReach = Math.max(0, ...(manifest?.compactHull || []).map((p) => Math.hypot(p.x,p.z)*scale));
    const r = Math.max(Number(e.physicsBody?.radius)||0, Number(e.radius)||0,
      Number(e.data?.visualRadius)||0, e.type === 'asteroid' ? asteroidColliderRadius(e.data?.typeId,e.radius) : 0,
      manifest ? proxyOuterRadiusWu(manifest,e) : 0, hullReach);
    if (!Number.isFinite(r)) return false;
    if (!(r > 0)) return true;
    return seats.every((p) => distance(e.pos,p) > r+p.r+8);
  });
}

// Both pieces use the ordinary asteroid renderer and its measured collider-radius owner.
// They are real finite, damageable rocks. No invulnerability, fake hit volume or new asset.
export function struckBellBodySpec(part, anchor = STRUCK_BELL_SITE.anchor) {
  const bell = part === 'bell', typeId = bell ? 'ast_crystalline' : 'ast_common_rock';
  const radius = bell ? 14 : 4, hull = bell ? 800 : 100;
  return {
    type: 'asteroid', name: bell ? "Cantor's practice bell" : 'Practice stone · latch and release',
    pos: { x: anchor.x + (bell ? 110 : -100), z: anchor.z },
    radius, mass: bell ? 1600 : 8, hull, hullMax: hull, collides: true,
    physicsBody: { radius: asteroidColliderRadius(typeId, radius), dynamic: true },
    data: { typeId, size: radius, tier: 1, tierCap: 1, oreHP: hull, oreHPMax: hull,
      yieldU: 1, pctEjected: 0, respawnSec: 0, homeSectorId: 'sector_phoebe_echo',
      scanLabel: bell ? "CANTOR'S PRACTICE BELL · strike with a released stone" : 'PRACTICE STONE · Massline',
      storyPropKind: STRUCK_BELL_ID, struckBellPart: part, masslineTetherable: true },
  };
}

function hold(e, point) {
  if (!e?.data) return;
  const ai = e.data.ai || (e.data.ai = {});
  ai.passive = true; ai.allowPassiveManeuver = true; ai.roe = 'hold_fire';
  ai.activity = { ...ai.activity, kind: 'loiter', reason: 'vignette_motion:struck_bell',
    anchor: { ...point }, anchorVelocity: null, targetId: null, preferredRange: 0 };
  const intent = e.data.intent || (e.data.intent = {});
  intent.tx = point.x; intent.tz = point.z; intent.fire = false;
}

export function createStruckBellRuntime(spec) {
  // Object references and unsubscriber functions must never enter serialized live vars.
  const sessions = new WeakMap();
  const clean = (live) => {
    const w = sessions.get(live);
    if (!w) return;
    w.finished = true;
    for (const off of w.off.splice(0)) if (typeof off === 'function') off();
    sessions.delete(live);
  };
  const abort = (d, live, reason, text) => {
    clean(live);
    if (text) say(d, live, text);
    d.abort(live, reason);
  };
  const finish = (d, live, state, outcome) => {
    const w = sessions.get(live);
    if (!w || w.finished) return;
    clean(live); // Reserve before synchronous reward listeners can re-enter.
    const stats = state.encounterDirector.stats || (state.encounterDirector.stats = {});
    (stats.livedSeen || (stats.livedSeen = {}))[STRUCK_BELL_ID] = outcome;
    if (outcome === 'a') { d.grant(30, STRUCK_BELL_ID); d.rep('faction_choir', 2, STRUCK_BELL_ID); }
    if (outcome === 'b') { d.rep('faction_vael', 1, STRUCK_BELL_ID); d.rep('faction_choir', -1, STRUCK_BELL_ID); }
    d.resolve(live, outcome, { speak: true });
    const direction = phoebePracticeDirection(state);
    if (outcome !== 'c' && direction) say(d, live, 'CANTOR: ' + direction);
  };
  const validWork = (d, live, state, w) => {
    if (!w || w.finished || live.phase === 'done') return false;
    if (state.encounterDirector?.live?.[live.id] !== live) { clean(live); return false; }
    if (state.world?.currentSectorId !== 'sector_phoebe_echo'
      || !sameLife(state, w.player, w.generations) || d.player?.() !== w.player
      || distance(w.player.pos, w.anchor) > STRUCK_BELL_SITE.abandonRadius) {
      abort(d, live, 'bell_departed', 'CANTOR: We will keep the practice bell. Your lesson can end here.'); return false;
    }
    if (!w.cast.every((e) => sameLife(state, e, w.generations)) || !sameLife(state, w.bell, w.generations)
      || (!w.hit && !sameLife(state, w.stone, w.generations))) {
      abort(d, live, 'bell_subject_gone', 'CANTOR: Stop. The original practice set is no longer intact.'); return false;
    }
    if (d.now() >= w.deadline) {
      abort(d, live, 'bell_timeout', 'CANTOR: The practice count is over. No strike was certified.'); return false;
    }
    return true;
  };
  const offer = (d, live, w) => {
    live.offerConsumed = false;
    d.offerChoices(live, ['a', 'b', 'c'], 'c', w.deadline);
  };
  return Object.freeze({
    fire(d, live, state) {
      if (!struckBellAdmission(state, d.registry, d.player?.())
        || !STRUCK_BELL_ANCHORS.some((a) => distance(a,live.anchor) < 0.001)
        || distance(d.player()?.pos,live.anchor) > STRUCK_BELL_SITE.admissionRadius
        || !struckBellPlacementClear(state,live.anchor)
        || typeof d.bus?.on !== 'function' || typeof d.helpers?.spawnEntity !== 'function') {
        d.abort(live, 'bell_unavailable'); return;
      }
      const anchor = { ...live.anchor };
      live.anchor = anchor; live.vars ||= {}; live.ids ||= []; live.roles ||= {}; live.plan ||= {};
      const rows = spec.cast.map((member) => ({ archetype: member.archetype, level: 2,
        factionId: member.factionId, pos: { x: anchor.x + member.dx, z: anchor.z + member.dz },
        context: 'convoy_civilian', role: member.role, passive: true, team: 2, scanLabel: member.scanLabel }));
      if ((d.spawnShips(live, rows) || []).length !== rows.length) { d.abort(live, 'spawn_failed'); return; }
      const cast = rows.map((row) => role(state, live, row.role));
      const pieces = ['bell', 'stone'].map((part) => {
        const body = d.helpers.spawnEntity(struckBellBodySpec(part, anchor));
        if (body) { body.data ||= {}; body.data.encounterId = live.id; live.ids.push(body.id); live.roles[body.id] = part; }
        return body;
      });
      if (!pieces.every((e) => liveEntity(state, e)) || !cast.every((e) => liveEntity(state, e))) {
        d.abort(live, 'prop_failed'); return;
      }
      const w = { player: d.player(), anchor, cast, seats: cast.map((e) => ({ ...e.pos })),
        bell: pieces[0], stone: pieces[1], deadline: d.now() + STRUCK_BELL_SITE.deadlineS,
        holdSince: null, readings: 0, lastReading: null, hadLatch: false, release: null, hit: null, off: [], finished: false };
      w.generations = new Map([w.player, ...cast, ...pieces].map((e) => [e, occupantGenerationOf(e)]));
      sessions.set(live, w);
      if ([...w.generations.values()].some((g) => g == null)) { abort(d, live, 'bell_identity_unavailable'); return; }
      const on = (name, fn) => { const off = d.bus.on(name, fn); if (typeof off === 'function') w.off.push(off); };
      on('tether:latched', (p) => {
        if (live.phase !== 'bell_strike' || !validWork(d, live, state, w) || !active(state, w.player)) return;
        if (p?.sourceId === w.player.id && p.targetId === w.stone.id) { w.hadLatch = true; w.release = null; }
      });
      on('tether:releaseRated', (p) => {
        if (live.phase !== 'bell_strike' || !validWork(d, live, state, w) || !active(state, w.player)) return;
        if (!w.hadLatch || p?.targetId !== w.stone.id || p.sourceId !== w.player.id || p.deliberate !== true
          || p.observedTick !== state.tick || !sameLife(state, w.stone, w.generations)) return;
        w.hadLatch = false;
        w.release = { at: d.now(), tick: p.observedTick };
        say(d, live, 'CANTOR: Released. Let the stone speak; a miss is only a miss. You may recover it and try again.');
      });
      on('physics:impact', (p) => {
        if (live.phase !== 'bell_strike' || w.hit || !w.release || !validWork(d, live, state, w)
          || !active(state, w.player) || !liveEntity(state, w.stone)) return;
        const pair = (p?.aId === w.stone.id && p.bId === w.bell.id
          && p.aGeneration === w.generations.get(w.stone) && p.bGeneration === w.generations.get(w.bell))
          || (p?.bId === w.stone.id && p.aId === w.bell.id
          && p.bGeneration === w.generations.get(w.stone) && p.aGeneration === w.generations.get(w.bell));
        const tether = state.player?.tether;
        if (!pair || p.backend !== 'rapier-dynamic' || (tether?.active === true && tether.targetId === w.stone.id)
          || p.tick !== state.tick || p.tick < w.release.tick
          || d.now() - w.release.at > STRUCK_BELL_SITE.releaseWindowS
          || !Number.isFinite(p.impulse) || p.impulse < STRUCK_BELL_SITE.minimumImpulse) return;
        // Synchronous scalar copy: physics pools its event object.
        w.hit = { tick: p.tick, impulse: p.impulse, at: d.now() };
      });
      on('encounter:resolved', (p) => { if (p?.encounterId === live.id) clean(live); });
      for (const event of ['save:restoring', 'save:loaded', 'sector:exit', 'game:new', 'game:newGame', 'game:started']) {
        on(event, () => { if (!w.finished) abort(d, live, 'bell_interrupted'); });
      }
      live.phase = 'offer'; live.deadlineAt = w.deadline;
      for (let i = 0; i < cast.length; i++) hold(cast[i], w.seats[i]);
      say(d, live, "CANTOR: This small crystal is our practice bell, not a fragment of the Shrine's song. Latch the marked stone, release it toward the bell, and let it ring. Or hold a quiet bearing for the Vael observer; the Choir keepers resent that record.");
      offer(d, live, w);
    },
    tick(d, live, state) {
      const w = sessions.get(live);
      if (!validWork(d, live, state, w)) return;
      if (!active(state, w.player)) { w.holdSince = null; w.readings = 0; w.lastReading = null; if (live.phase === 'offer') w.reoffer = true; return; }
      for (let i = 0; i < w.cast.length; i++) hold(w.cast[i], w.seats[i]);
      if (live.phase === 'offer') { if (w.reoffer) { w.reoffer = false; offer(d, live, w); } return; }
      if (live.phase === 'bell_strike') {
        const tether = state.player?.tether;
        if (tether?.active === true && tether.targetId === w.stone.id) w.release = null;
        if (w.hit) finish(d, live, state, 'a');
      } else if (live.phase === 'bell_bearing') {
        const observer = w.cast[2], range = distance(w.player.pos, observer.pos);
        const quiet = range >= STRUCK_BELL_SITE.bearingMin && range <= STRUCK_BELL_SITE.bearingMax
          && speed(w.player) <= STRUCK_BELL_SITE.bearingSpeed
          && speed(observer) <= STRUCK_BELL_SITE.bearingSpeed
          && Math.hypot(w.player.vel.x - observer.vel.x, w.player.vel.z - observer.vel.z) <= STRUCK_BELL_SITE.bearingSpeed;
        if (!quiet) {
          if (w.readings > 0) say(d, live, 'OBSERVER: That reading moved. Resetting the count; hold 70–180 units out and below 3 units per second.');
          w.readings = 0; w.lastReading = null;
        } else if (w.lastReading == null || d.now() - w.lastReading >= 1) {
          // At most one measured reading per callback: elapsed catch-up never fabricates samples.
          if (w.lastReading != null && d.now() - w.lastReading > 2) w.readings = 0;
          w.lastReading = d.now(); w.readings++;
          if ([1, 4].includes(w.readings)) say(d, live, `OBSERVER: Quiet reading ${w.readings} of 8.`);
          if (w.readings >= STRUCK_BELL_SITE.bearingReadings) finish(d, live, state, 'b');
        }
      }
    },
    choose(d, live, state, choiceId) {
      const w = sessions.get(live);
      if (!validWork(d, live, state, w) || live.phase !== 'offer') return;
      if (!active(state, w.player)) { w.reoffer = true; live.offerConsumed = false; return; }
      if (choiceId === 'c') { finish(d, live, state, 'c'); return; }
      if (choiceId === 'a') {
        live.phase = 'bell_strike';
        say(d, live, "CANTOR: The marked stone is yours to move. Move around the stone, not through it. Latch with your Massline, give it a gentle tow toward the bell, then release. Strafe clear of its path before braking. Do not smash the bell: a held push, your hull, or gunfire is not a strike.");
      } else if (choiceId === 'b') {
        live.phase = 'bell_bearing'; w.holdSince = null;
        say(d, live, 'OBSERVER: Hold 70–180 units from me, both hulls below 3 units per second, for eight measured readings, one on each count. This is a bearing, not a recovered song. The Vael will remember your help; the Choir will remember the intrusion.');
      }
    },
  });
}
