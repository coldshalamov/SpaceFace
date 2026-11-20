// TOWJAW's picture is a projection of the real bodies and committed danger geometry.
// This module never creates armor stand-ins, writes entity.data, or owns a clock/RAF.
// Host rendering still draws the authored heavy hull and all physical salvage bodies.
import { slotPosition, grappleSweepShape } from './geometry.js';
import { TOWJAW_ATTACKS, TOWJAW_SLOTS } from './catalog.js';
import { admitStructuralFxCue } from '../../presentation/cueArbitration.js';

const TAU = Math.PI * 2;
const MAX_ARMOR = 6;
const MAX_BODIES = 32;
const MAX_SHAPES = 3;
const MAX_SEGMENTS = 80;
const MAX_EVENTS = 24;
const MAX_AUDIO_PER_UPDATE = 2;
const MAX_STRUCTURAL_PER_UPDATE = 3;
const MECHANISMS = Object.freeze(['jaw', 'winch', 'drive']);
const DASH_TELL = Object.freeze([7, 5]);
const DASH_REEL = Object.freeze([3, 4]);
const DASH_NONE = Object.freeze([]);
const PHASE_CAPTIONS = Object.freeze({
  approach: 'TOWJAW — KEEP THE WRECKS AWAY FROM THE TUG',
  scavenge: 'REELING SCRAP — STEAL A PLATE OR BREAK THE WINCH',
  recover: 'RECOVERING — THE MECHANISMS ARE VULNERABLE',
  exposed: 'CAGE OPEN — HIT A MECHANISM OR SLING SCRAP THROUGH',
  retreat: 'TOWJAW IS WITHDRAWING — LOOSE SCRAP REMAINS YOURS',
  defeated: 'TOWJAW DISABLED — SALVAGE THE REMAINS',
});
const ATTACK_CAPTIONS = Object.freeze({
  grapple: 'GRAPPLE SWEEP — LEAVE THE ARC OR PIN THE JAW',
  shotgun: 'SCRAP SHOTGUN — CLEAR THE SCRAP LANES OR EXPOSE THE WINCH',
  ram: 'RAM COMMITTED — MOVE ACROSS THE LANE',
});
const DISABLED_CAPTIONS = Object.freeze({
  jaw: 'JAW DISABLED — GRAPPLE SWEEP OFFLINE',
  winch: 'WINCH DISABLED — REEL AND SHOTGUN OFFLINE',
  drive: 'DRIVE DISABLED — RAM OFFLINE',
});
const safe = (n, fallback = 0) => Number.isFinite(n) ? n : fallback;
const clamp = (n, lo, hi) => Math.max(lo, Math.min(hi, n));
const point = (p) => !!p && Number.isFinite(p.x) && Number.isFinite(p.z);
const copyPoint = (p) => ({ x: p.x, y: safe(p.y), z: p.z });
const alive = (body) => !!body && body.alive !== false && point(body.pos);

function freezeRecipe(recipe) { return Object.freeze(recipe); }

/** Existing audio IDs and the existing structural pool; no generic particle-card fallback. */
export const TOWJAW_PRESENTATION_RECIPES = Object.freeze({
  'reel-start': freezeRecipe({ audio: 'sfx_doctrine_tether_spool', gain: 0.46, priority: 1, family: null }),
  'armor-latched': freezeRecipe({ audio: 'sfx_salvage_hydraulic', gain: 0.5, priority: 2, family: 'tether' }),
  'armor-lost': freezeRecipe({ audio: 'sfx_salvage_plate', gain: 0.64, priority: 4, family: 'tether' }),
  'armor-vented': freezeRecipe({ audio: 'sfx_salvage_plate', gain: 0.5, priority: 4, family: 'tether' }),
  'telegraph-start': freezeRecipe({ audio: null, gain: 0.72, priority: 7, family: null }),
  'telegraph-cancel': freezeRecipe({ audio: 'sfx_doctrine_break', gain: 0.62, priority: 8, family: null }),
  'attack-start': freezeRecipe({ audio: null, gain: 0.76, priority: 6, family: null }),
  'attack-end': freezeRecipe({ audio: null, gain: 0, priority: 2, family: null }),
  'mechanism-disabled': freezeRecipe({ audio: 'sfx_subsystem_disabled', gain: 0.7, priority: 9, family: 'reaction' }),
  'mechanism-displaced': freezeRecipe({ audio: 'sfx_salvage_plate', gain: 0.62, priority: 8, family: 'tether' }),
  'feedstock-denied': freezeRecipe({ audio: 'sfx_doctrine_brawler_withdraw', gain: 0.45, priority: 4, family: null }),
  'scrap-hit': freezeRecipe({ audio: null, gain: 0, priority: 5, family: 'collision' }),
  outcome: freezeRecipe({ audio: 'sfx_doctrine_withdraw', gain: 0.54, priority: 10, family: null }),
});

/** These are the canonical settings fields also consumed by vfx.js/feel.js. */
export function towjawPresentationPolicy(settings = {}) {
  return {
    motionReduced: !!(settings.video?.motionReduce || settings.accessibility?.motionReduce),
    flashReduced: !!(settings.accessibility?.flashReduce || settings.video?.flashReduce),
    forcedColors: settings.forcedColors === true,
  };
}

function addArc(points, x, z, radius, start, span) {
  // At most 80 chords, <=0.5 WU chord error at the authored attack dimensions.
  const n = clamp(Math.ceil(Math.abs(span) * Math.sqrt(Math.max(radius, 1))), 4, MAX_SEGMENTS);
  for (let i = 0; i <= n; i++) {
    const angle = start + span * i / n;
    points.push({ x: x + radius * Math.cos(angle), z: z + radius * Math.sin(angle) });
  }
}

/**
 * The same lane/annular-arc shapes tested by geometry.pointInAttack(). These are
 * warnings, never new hitboxes. Unknown/invalid shapes fail closed instead of
 * drawing an attractive but false circle at world origin.
 */
export function towjawShapeOutlines(shape) {
  if (!shape || typeof shape !== 'object') return [];
  if (shape.kind === 'lane') {
    if (!point(shape.a) || !point(shape.b) || !(shape.radius > 0) || !Number.isFinite(shape.radius)) return [];
    const radius = Math.min(shape.radius, 1024);
    const angle = Math.atan2(shape.b.z - shape.a.z, shape.b.x - shape.a.x);
    const points = [];
    addArc(points, shape.a.x, shape.a.z, radius, angle + Math.PI / 2, Math.PI);
    addArc(points, shape.b.x, shape.b.z, radius, angle - Math.PI / 2, Math.PI);
    return [points];
  }
  if (shape.kind !== 'arc' || !point(shape) || !Number.isFinite(shape.heading)
      || !(shape.outer > 0) || !Number.isFinite(shape.outer) || !Number.isFinite(shape.halfAngle)
      || shape.halfAngle <= 0 || !Number.isFinite(shape.inner) || shape.inner < 0
      || shape.inner >= shape.outer) return [];
  const outer = Math.min(shape.outer, 2048);
  const inner = Math.min(shape.inner, outer);
  const halfAngle = Math.min(shape.halfAngle, Math.PI);
  const start = shape.heading - halfAngle;
  const points = [];
  addArc(points, shape.x, shape.z, outer, start, halfAngle * 2);
  if (halfAngle >= Math.PI - 1e-6) {
    if (inner <= 0) return [points];
    const hole = [];
    addArc(hole, shape.x, shape.z, inner, start, -TAU);
    return [points, hole];
  }
  if (inner > 0) addArc(points, shape.x, shape.z, inner, start + halfAngle * 2, -halfAngle * 2);
  else points.push({ x: shape.x, z: shape.z });
  return [points];
}

function bodyMap(world) {
  const map = new Map();
  const debris = Array.isArray(world?.debris) ? world.debris : [];
  for (let i = 0; i < Math.min(MAX_BODIES, debris.length); i++) {
    const body = debris[i];
    if (alive(body) && body.id != null) map.set(body.id, body);
  }
  return map;
}

function attackName(event) {
  const attack = typeof event?.attack === 'string' ? event.attack : event?.attack?.kind;
  return attack || event?.kind || null;
}

/** Pure, bounded view projection. Call at a sim tick, never write its result onto an entity. */
export function buildTowjawPresentationFrame(view, world = view?.world || {}, settings = {}) {
  const policy = towjawPresentationPolicy(settings);
  const frame = {
    visible: false, clock: safe(world?.simTime, safe(view?.lastTime, safe(view?.elapsed))), phase: view?.phase || 'idle',
    attack: null, cables: [], mechanisms: [], armorCount: 0, caption: '', policy,
    boss: null, origin: null,
  };
  if (!view || !alive(world?.boss)) return frame;
  frame.visible = true;
  frame.boss = { id: world.boss.id, pos: copyPoint(world.boss.pos), radius: Math.max(1, safe(world.boss.radius, 12)) };
  frame.origin = frame.boss.pos;
  const bodies = bodyMap(world);
  const armor = Array.isArray(view.armor) ? view.armor : [];
  for (let i = 0; i < Math.min(MAX_ARMOR, armor.length); i++) {
    const plate = armor[i];
    const body = plate && bodies.get(plate.id);
    if (!body || !Number.isInteger(plate.slot) || plate.slot < 0 || plate.slot >= MAX_ARMOR) continue;
    const reeling = plate.status === 'reeling';
    if (plate.status === 'latched') frame.armorCount++;
    if (plate.status === 'venting') continue; // Released clamps have no cable; the body remains real.
    const mount = slotPosition(world.boss, plate.slot);
    const anchor = world.mechanisms?.[TOWJAW_SLOTS[plate.slot].mechanism];
    // A displaced mechanism is itself a physical body. Do not tether a plate
    // visually to the nominal mount after that body has been pulled away.
    if (!alive(anchor) || !point(mount)) continue;
    frame.cables.push({
      id: body.id, slot: plate.slot, from: copyPoint(anchor.pos), mount: copyPoint(mount), to: copyPoint(body.pos),
      reeling, radius: clamp(safe(body.radius, 3), 1, 24),
    });
  }
  for (const key of MECHANISMS) {
    const mech = view.mechanisms?.[key];
    const body = world.mechanisms?.[key];
    if (!mech || !alive(body)) continue;
    const at = body.pos;
    if (!point(at)) continue;
    frame.mechanisms.push({ key, id: body.id, pos: copyPoint(at),
      disabled: mech.disabled === true, exposed: mech.exposed === true,
      pinned: mech.pinned === true, detached: mech.detached === true });
  }
  const cast = view.telegraph || view.attack || view.coast;
  if (cast && typeof cast.castId === 'string' && Array.isArray(cast.shapes)
      && Number.isFinite(cast.startedAt) && Number.isFinite(cast.fireAt) && Number.isFinite(cast.endAt)
      && cast.startedAt <= frame.clock && cast.fireAt >= cast.startedAt && cast.endAt > cast.fireAt
      && frame.clock < cast.endAt) {
    const shapes = [];
    for (let i = 0; i < Math.min(MAX_SHAPES, cast.shapes.length); i++) {
      const shape = cast.shapes[i];
      const outlines = towjawShapeOutlines(shape);
      if (outlines.length) shapes.push({ shape, outlines });
    }
    if (shapes.length) {
      const coasting = cast.cancelled === true && cast.kind === 'ram';
      const active = coasting || frame.clock >= cast.fireAt;
      frame.attack = { kind: cast.kind, castId: cast.castId, shapes, active, coasting, coastReason: coasting ? cast.reason : null,
        progress: clamp((frame.clock - cast.startedAt) / Math.max(1e-6, cast.fireAt - cast.startedAt), 0, 1),
        secondsUntil: Math.max(0, cast.fireAt - frame.clock),
        origin: point(cast.origin) ? copyPoint(cast.origin) : frame.origin,
      };
      if (active && cast.kind === 'grapple' && !policy.motionReduced) {
        // Read the simulation's own sweep function; no renderer clock or
        // independent aiming curve can make the moving jaw tell dishonest.
        const sweep = grappleSweepShape(cast, safe(cast.activeTime) / TOWJAW_ATTACKS.grapple.activeS);
        frame.attack.sweepOutlines = towjawShapeOutlines(sweep);
      }
    }
  }
  frame.caption = frame.attack
    ? frame.attack.coasting ? frame.attack.coastReason === 'braking'
      ? 'RAM SPENT — THE HULL IS STILL COASTING' : 'RAM CANCELLED — THE HULL IS STILL COASTING'
      : ATTACK_CAPTIONS[frame.attack.kind] || 'TOWJAW ATTACK — LEAVE THE MARKED AREA'
    : PHASE_CAPTIONS[view.phase] || 'TOWJAW — STRIP THE CAGE; BREAK THE MACHINERY';
  return frame;
}

function eventPosition(event, view) {
  if (point(event?.pos)) return copyPoint(event.pos);
  if (point(event?.position)) return copyPoint(event.position);
  const world = view?.world;
  const body = event?.mechanism ? world?.mechanisms?.[event.mechanism] : null;
  if (alive(body)) return copyPoint(body.pos);
  const id = event?.entityId ?? event?.targetId;
  if (id != null && Array.isArray(world?.debris)) {
    for (let i = 0; i < Math.min(MAX_BODIES, world.debris.length); i++) {
      if (world.debris[i]?.id === id && alive(world.debris[i])) return copyPoint(world.debris[i].pos);
    }
  }
  if (point(event?.origin)) return copyPoint(event.origin);
  return alive(world?.boss) ? copyPoint(world.boss.pos) : null;
}

export function describeTowjawPresentationEvent(event, view = {}, settings = {}) {
  const recipe = TOWJAW_PRESENTATION_RECIPES[event?.type];
  if (!recipe) return null;
  const attack = attackName(event);
  let audio = recipe.audio;
  let caption = '';
  if (event.type === 'telegraph-start') {
    audio = attack === 'grapple' ? 'sfx_doctrine_tether_spool'
      : attack === 'ram' ? 'sfx_doctrine_brawler_commit' : 'sfx_doctrine_ranged_charge';
    caption = ATTACK_CAPTIONS[attack] || 'TOWJAW IS COMMITTING TO AN ATTACK';
  } else if (event.type === 'attack-start') {
    audio = attack === 'shotgun' ? 'sfx_doctrine_capital_broadside'
      : attack === 'ram' ? 'sfx_doctrine_brawler_commit' : 'sfx_tether_strain_creak';
  } else if (event.type === 'telegraph-cancel') {
    caption = event.reason === 'jaw-pinned' ? 'MECHANISM PINNED — ATTACK CANCELLED'
      : event.reason === 'shotgun-feed-displaced' ? 'SHOTGUN CANCELLED — THE FEED MOVED'
      : event.reason === 'mechanism-disabled' ? 'MECHANISM DISABLED — ATTACK CANCELLED'
      : 'ATTACK CANCELLED — THE MECHANISM LOST ITS COVER';
  } else if (event.type === 'mechanism-disabled') {
    caption = DISABLED_CAPTIONS[event.mechanism] || 'TOWJAW MECHANISM DISABLED';
    if (event.mechanism === 'drive') audio = 'sfx_subsystem_drive_disabled';
  } else if (event.type === 'mechanism-displaced') {
    const name = MECHANISMS.includes(event.mechanism) ? event.mechanism.toUpperCase() : 'MECHANISM';
    caption = `${name} OUT OF LINE — ATTACK INTERRUPTED`;
  } else if (event.type === 'feedstock-denied') {
    caption = 'FEEDSTOCK DENIED — THE CAGE CANNOT CLOSE';
  } else if (event.type === 'armor-lost') caption = 'ARMOR STRIPPED — THE GAP IS REAL';
  else if (event.type === 'armor-vented') caption = 'CLAMPS OPEN — GAPS ARE FORMING';
  else if (event.type === 'outcome') {
    const outcome = event.outcome || view.outcome;
    caption = outcome === 'defeat' || outcome === 'defeated' ? PHASE_CAPTIONS.defeated
      : outcome === 'retreat' || outcome === 'retreated' ? PHASE_CAPTIONS.retreat : 'TOWJAW ENCOUNTER CLOSED';
    if (outcome === 'defeat' || outcome === 'defeated') audio = 'sfx_salvage_hydraulic';
  }
  return {
    id: `towjaw.${event.type.replaceAll('-', '_')}`, type: event.type, priority: recipe.priority,
    audio, gain: recipe.gain, family: recipe.family, caption,
    position: eventPosition(event, view),
    sourceId: view.world?.boss?.id ?? null,
    targetId: event.entityId ?? event.targetId ?? view.world?.mechanisms?.[event.mechanism]?.id ?? null,
    policy: towjawPresentationPolicy(settings),
    heading: safe(event.heading, safe(view.heading)),
  };
}

/**
 * Supported production ports only: audio:cue consumes real recipe IDs; structural
 * presentation:vfxCue goes through cueArbitration and the existing bounded geometry pool.
 * This deliberately never fabricates combat:damage, tether:attached or entity:killed.
 */
export function emitTowjawPresentationEvent(bus, event, view = {}, settings = {}, state = null,
  { audio = true, structural = true } = {}) {
  const cue = describeTowjawPresentationEvent(event, view, settings);
  if (!cue || typeof bus?.emit !== 'function') return null;
  if (audio && cue.audio) bus.emit('audio:cue', {
    id: cue.audio, cueId: cue.id, position: cue.position,
    gain: cue.gain, rate: cue.type === 'reel-start' ? 0.8 : 1,
    importance: cue.priority >= 7 ? 0.9 : 0.55,
  });
  if (structural && cue.family && cue.position && !cue.policy.motionReduced && !cue.policy.flashReduced) {
    const payload = {
      id: cue.id, family: cue.family, boss: true, sourceId: cue.sourceId, targetId: cue.targetId,
      position: cue.position, radius: cue.type === 'scrap-hit' ? 5 : 3,
      magnitude: cue.type === 'scrap-hit' ? 1.5 : 0.7,
      direction: { x: Math.cos(cue.heading), z: Math.sin(cue.heading) },
      importance: cue.priority >= 7 ? 0.9 : 0.6, playerRelevance: 1,
    };
    const admitted = admitStructuralFxCue('presentation:vfxCue', payload, state || {});
    if (admitted) bus.emit('presentation:vfxCue', { ...payload, ...admitted });
  }
  return cue;
}

function trace(ctx, outlines, project) {
  ctx.beginPath();
  let complete = true;
  for (const contour of outlines) {
    let started = false, uninterrupted = true;
    for (const p of contour) {
      const q = project(p);
      if (!q || !Number.isFinite(q.x) || !Number.isFinite(q.y) || q.behind === true) {
        // Behind-camera projection mirrors coordinates. Break the path instead
        // of inventing a closing edge across the visible half of the warning.
        started = false; uninterrupted = false; complete = false; continue;
      }
      if (!started) { ctx.moveTo(q.x, q.y); started = true; }
      else ctx.lineTo(q.x, q.y);
    }
    if (started && uninterrupted) ctx.closePath();
  }
  return complete;
}

function segment(ctx, project, a, b) {
  const p = project(a);
  if (!p || !Number.isFinite(p.x) || !Number.isFinite(p.y) || p.behind === true) return;
  const x = p.x, y = p.y; // projection ports commonly reuse their returned object
  const q = project(b);
  if (!q || !Number.isFinite(q.x) || !Number.isFinite(q.y) || q.behind === true) return;
  ctx.moveTo(x, y); ctx.lineTo(q.x, q.y);
}

function drawMechanism(ctx, marker, project, palette) {
  const p = project(marker.pos);
  if (!p || !Number.isFinite(p.x) || !Number.isFinite(p.y) || p.behind === true) return;
  const x = p.x, y = p.y, r = marker.exposed ? 9 : 6;
  ctx.strokeStyle = marker.disabled ? palette.calm : marker.exposed ? palette.open : palette.paper;
  ctx.lineWidth = marker.exposed ? 2 : 1;
  ctx.globalAlpha = marker.disabled ? 0.55 : marker.exposed ? 1 : 0.65;
  ctx.beginPath();
  if (marker.key === 'jaw') {
    ctx.moveTo(x - r, y - r); ctx.lineTo(x - r / 2, y); ctx.lineTo(x - r, y + r);
    ctx.moveTo(x + r, y - r); ctx.lineTo(x + r / 2, y); ctx.lineTo(x + r, y + r);
  } else if (marker.key === 'winch') {
    ctx.moveTo(x, y - r); ctx.lineTo(x + r, y); ctx.lineTo(x, y + r);
    ctx.lineTo(x - r, y); ctx.closePath();
  } else {
    ctx.moveTo(x - r, y - r); ctx.lineTo(x + r, y - r);
    ctx.moveTo(x - r, y + r); ctx.lineTo(x + r, y + r);
  }
  if (marker.disabled || marker.pinned || marker.detached) {
    ctx.moveTo(x - r - 2, y - r - 2); ctx.lineTo(x + r + 2, y + r + 2);
    if (marker.pinned) { ctx.moveTo(x + r + 2, y - r - 2); ctx.lineTo(x - r - 2, y + r + 2); }
  }
  ctx.stroke();
  if (marker.exposed && !marker.disabled) {
    ctx.fillStyle = palette.paper; ctx.font = '600 12px sans-serif'; ctx.textAlign = 'center';
    ctx.fillText(marker.key.toUpperCase(), x, y - r - 5);
  }
}

/** Canvas is a danger/relationship overlay, not a body renderer. No own animation loop. */
export function createTowjawOverlay({ canvas, worldToScreen, getFrame }) {
  if (typeof canvas?.getContext !== 'function' || typeof worldToScreen !== 'function'
      || typeof getFrame !== 'function') throw new TypeError('Towjaw overlay needs canvas, projection and frame ports');
  const ctx = canvas.getContext('2d');
  if (!ctx) throw new TypeError('Towjaw overlay requires a 2D canvas context');
  let blank = false, disposed = false;
  const normal = { paper: '#f3ebd7', threat: '#ffad62', active: '#ff7055', open: '#f8d66d', calm: '#9ba6ad' };
  const forced = { paper: '#ffffff', threat: '#ffff00', active: '#ffffff', open: '#ffffff', calm: '#bbbbbb' };
  const clear = () => {
    if (blank) return;
    ctx.clearRect(0, 0, canvas.width, canvas.height); blank = true;
  };
  return {
    draw(frame = getFrame()) {
      if (disposed) return;
      if (!frame?.visible) { clear(); return; }
      ctx.clearRect(0, 0, canvas.width, canvas.height); blank = false;
      const palette = frame.policy.forcedColors ? forced : normal;
      const attack = frame.attack;
      ctx.save();
      if (attack) {
        const color = attack.active ? palette.active : palette.threat;
        for (const item of attack.shapes) {
          const complete = trace(ctx, item.outlines, worldToScreen);
          ctx.fillStyle = color;
          ctx.globalAlpha = frame.policy.flashReduced ? 0.035 : attack.active ? 0.1 : 0.055;
          if (complete) ctx.fill('evenodd');
          ctx.strokeStyle = color; ctx.globalAlpha = 0.95; ctx.lineWidth = attack.active ? 2.5 : 1.6;
          ctx.setLineDash(attack.active ? DASH_NONE : DASH_TELL);
          ctx.stroke(); ctx.setLineDash(DASH_NONE);
        }
        if (attack.sweepOutlines?.length) {
          trace(ctx, attack.sweepOutlines, worldToScreen);
          ctx.strokeStyle = palette.paper; ctx.lineWidth = 2; ctx.globalAlpha = 0.8;
          ctx.stroke();
        }
        // Shape is readable without color: ram is one capsule, shotgun has
        // separate scrap lanes, grapple an annular arc. One steady countdown
        // line teaches commitment without drawing the label once per round.
        const p = worldToScreen(attack.origin);
        if (p && Number.isFinite(p.x) && Number.isFinite(p.y) && p.behind !== true) {
          ctx.fillStyle = palette.paper; ctx.font = '700 12px sans-serif'; ctx.textAlign = 'center';
          ctx.globalAlpha = 1;
          const label = attack.coasting ? 'RAM BRAKING'
            : attack.active ? attack.kind.toUpperCase() : `${attack.kind.toUpperCase()} ${attack.secondsUntil.toFixed(1)}`;
          ctx.fillText(label, p.x, p.y - 28);
          ctx.lineWidth = 3; ctx.strokeStyle = palette.paper; ctx.beginPath();
          ctx.moveTo(p.x - 22, p.y - 22); ctx.lineTo(p.x - 22 + 44 * attack.progress, p.y - 22); ctx.stroke();
        }
      }
      ctx.lineWidth = 1.3;
      for (const cable of frame.cables) {
        ctx.strokeStyle = cable.reeling ? palette.threat : palette.paper;
        ctx.globalAlpha = cable.reeling ? 0.8 : 0.54;
        ctx.setLineDash(cable.reeling ? DASH_REEL : DASH_NONE);
        ctx.lineDashOffset = cable.reeling && !frame.policy.motionReduced ? -frame.clock * 8 % 7 : 0;
        ctx.beginPath(); segment(ctx, worldToScreen, cable.from, cable.to); ctx.stroke();
      }
      ctx.lineDashOffset = 0; ctx.setLineDash(DASH_NONE);
      for (const marker of frame.mechanisms) drawMechanism(ctx, marker, worldToScreen, palette);
      ctx.restore();
    },
    clear,
    inspect() { return { disposed, blank }; },
    destroy() { if (!disposed) { clear(); disposed = true; } },
  };
}

/**
 * Render/audio adapter. Runtime calls onEvents(events, runtime.getView()) once;
 * draw is called by the existing host render pass. Cached projection rebuilds
 * at most once per tick. Cue dedupe is bounded, transient, and reset on restore.
 */
export function createTowjawPresentation({ state, bus, getSnapshot, canvas = null,
  worldToScreen = null, onCaption = null } = {}) {
  if (!state || typeof getSnapshot !== 'function') throw new TypeError('Towjaw presentation requires state and getSnapshot');
  let view = null, frame = null, lastTick = NaN, caption = '', captionHoldUntil = 0, disposed = false;
  const seen = new Map();
  const unsubscribers = [];
  const captionTo = (text) => {
    if (text === caption) return;
    caption = text;
    if (typeof onCaption === 'function') onCaption(text);
  };
  const readFrame = () => {
    const tick = safe(state.tick, safe(state.simTime));
    if (!frame || tick !== lastTick) {
      view = getSnapshot();
      frame = buildTowjawPresentationFrame(view, view?.world, state.settings || {});
      lastTick = tick;
    }
    return frame;
  };
  const overlay = canvas && typeof worldToScreen === 'function'
    ? createTowjawOverlay({ canvas, worldToScreen, getFrame: readFrame }) : null;
  function reset() { seen.clear(); view = null; frame = null; lastTick = NaN; captionHoldUntil = 0; captionTo(''); overlay?.clear(); }
  if (typeof bus?.on === 'function') {
    for (const name of ['sector:exit', 'save:restoring', 'game:new', 'game:newGame']) {
      const off = bus.on(name, reset);
      if (typeof off === 'function') unsubscribers.push(off);
      else if (typeof bus.off === 'function') unsubscribers.push(() => bus.off(name, reset));
    }
    const off = bus.on('settings:changed', () => { frame = null; });
    if (typeof off === 'function') unsubscribers.push(off);
  }
  return {
    onEvents(events, currentView) {
      if (disposed) return;
      view = currentView || getSnapshot(); frame = null;
      const accepted = [];
      for (let i = 0; i < Math.min(MAX_EVENTS, Array.isArray(events) ? events.length : 0); i++) {
        const event = events[i];
        const cue = describeTowjawPresentationEvent(event, view, state.settings || {});
        if (!cue) continue;
        const key = `${event.sequence ?? event.at ?? safe(state.tick)}:${event.type}:${event.castId ?? ''}:${event.entityId ?? ''}:${event.mechanism ?? ''}`;
        if (seen.has(key)) continue;
        seen.set(key, true);
        if (seen.size > 128) seen.delete(seen.keys().next().value);
        accepted.push({ event, cue, order: i });
      }
      // Critical state changes outrank six plates latching on the same tick.
      accepted.sort((a, b) => b.cue.priority - a.cue.priority || a.order - b.order);
      let voices = 0, structures = 0, announced = false;
      for (const { event, cue } of accepted) {
        const audio = !!cue.audio && voices < MAX_AUDIO_PER_UPDATE;
        const structural = !!cue.family && structures < MAX_STRUCTURAL_PER_UPDATE;
        emitTowjawPresentationEvent(bus, event, view, state.settings || {}, state, { audio, structural });
        if (audio) voices++;
        if (structural) structures++;
        if (!announced && cue.caption) {
          captionTo(cue.caption);
          captionHoldUntil = safe(view?.world?.simTime, safe(view?.lastTime, safe(view?.elapsed))) + 1.6;
          announced = true;
        }
      }
    },
    draw({ visible = true } = {}) {
      if (disposed) return;
      const inFlight = visible && state.mode === 'flight' && !state.ui?.docked && state.ui?.dockedStationId == null;
      if (!inFlight) { overlay?.clear(); captionTo(''); return; }
      const current = readFrame();
      overlay?.draw(current);
      if (!current.visible) captionTo('');
      else if (!caption || current.clock >= captionHoldUntil) captionTo(current.caption);
    },
    getFrame: readFrame,
    reset,
    inspect() { return { seenCount: seen.size, caption, disposed, overlay: !!overlay }; },
    destroy() {
      if (disposed) return;
      reset(); disposed = true;
      for (const unsubscribe of unsubscribers.splice(0)) unsubscribe();
      overlay?.destroy();
    },
  };
}

/** Optional production UI mount; call its draw/destroy from the existing HUD host. */
export function mountTowjawPresentation({ root, state, bus, helpers, runtime, document: doc = globalThis.document } = {}) {
  if (!doc || !root || !state || typeof runtime?.getView !== 'function'
      || typeof helpers?.worldToScreen !== 'function') return null;
  const canvas = doc.createElement('canvas');
  canvas.className = 'sf-towjaw-overlay'; canvas.setAttribute('aria-hidden', 'true');
  Object.assign(canvas.style, { position: 'absolute', inset: '0', width: '100%', height: '100%', pointerEvents: 'none' });
  const live = doc.createElement('span');
  live.setAttribute('role', 'status'); live.setAttribute('aria-live', 'polite'); live.setAttribute('aria-atomic', 'true');
  Object.assign(live.style, { position: 'absolute', width: '1px', height: '1px', overflow: 'hidden', clipPath: 'inset(50%)', whiteSpace: 'nowrap' });
  root.appendChild(canvas); root.appendChild(live);
  let width = 1, height = 1, resizeDirty = true, disposed = false;
  const host = doc.defaultView || globalThis;
  const updateBounds = () => {
    const rect = root.getBoundingClientRect();
    width = Math.max(1, Math.round(rect.width)); height = Math.max(1, Math.round(rect.height));
    canvas.width = width; canvas.height = height;
    resizeDirty = false;
  };
  const markSize = () => { resizeDirty = true; };
  const Resize = host.ResizeObserver;
  const observer = typeof Resize === 'function' ? new Resize(markSize) : null;
  if (observer) observer.observe(root);
  else host.addEventListener?.('resize', markSize);
  // worldToScreen uses CSS pixels; keep the overlay in the same units to avoid DPR drift.
  const world = { x: 0, y: 0, z: 0 }, projected = { x: 0, y: 0, onScreen: false };
  let left = 0, top = 0;
  const project = (p) => {
    world.x = p.x; world.z = p.z;
    const q = typeof helpers.worldToScreen === 'function' ? helpers.worldToScreen(world, projected) : null;
    if (!q || !Number.isFinite(q.x) || !Number.isFinite(q.y) || q.behind === true) return null;
    projected.x = q.x - left; projected.y = q.y - top;
    return projected;
  };
  const presentation = createTowjawPresentation({ state, bus, canvas, worldToScreen: project,
    getSnapshot: () => runtime.getView(), onCaption: (text) => { live.textContent = text; } });
  return {
    onEvents: presentation.onEvents,
    getFrame: presentation.getFrame,
    inspect: presentation.inspect,
    draw(options) {
      if (disposed) return;
      if (resizeDirty) {
        updateBounds(); const rect = root.getBoundingClientRect(); left = rect.left; top = rect.top;
      }
      presentation.draw(options);
    },
    destroy() {
      if (disposed) return;
      disposed = true; presentation.destroy(); observer?.disconnect();
      if (!observer) host.removeEventListener?.('resize', markSize);
      canvas.remove(); live.remove();
    },
  };
}
