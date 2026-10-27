// Row 463 (RC-BOSS-READ): every authored capital move names itself and its counter at least
// one second before it fires — through the PRODUCTION score, the pure readout projection,
// and the mounted overlay. Seed 4242, DT = 1/60, no wall-clock, no renderer.
import test from 'node:test';
import assert from 'node:assert/strict';

import { createBus } from '../src/core/eventBus.js';
import { createGameState } from '../src/core/gameState.js';
import { makeBudgetApi } from '../src/systems/spawnBudget.js';
import { createProductionCapitalBossEncounters } from '../src/systems/capitalBossRuntime.js';
import { requireCapitalBossEncounter } from '../src/data/encounters/capital-boss.js';
import { capitalBossReadouts } from '../src/presentation/capitalBossPresentation.js';
import { mountCapitalBossOverlay } from '../src/ui/capitalBossOverlayMount.js';
import { resolveObjectiveHudLayout } from '../src/ui/hud.js';
import { fakeDom, findAll, textLines } from './helpers/fake-dom.mjs';

const DT = 1 / 60;
const SEED = 4242;
const TOLLMAN = 'capital_boss_tollman';

// ── fixtures ─────────────────────────────────────────────────────────────────────────
function stubCtx(canvas) {
  // Drawing ops are recorded on the canvas element so a test can prove real warning
  // geometry was painted — a no-op stub would let a silent restore pass as "mounted".
  const calls = canvas._drawCalls || (canvas._drawCalls = []);
  const rec = (name) => () => { calls.push(name); };
  return {
    canvas, beginPath: rec('beginPath'), moveTo: rec('moveTo'), lineTo: rec('lineTo'),
    closePath: rec('closePath'), fill: rec('fill'),
    stroke: rec('stroke'), clip: rec('clip'), save: rec('save'), restore: rec('restore'),
    clearRect: rec('clearRect'),
    setTransform(...values) { calls.push('setTransform'); canvas._transform = values; },
    setLineDash: rec('setLineDash'), fillRect: rec('fillRect'),
    set fillStyle(_) {}, set strokeStyle(_) {}, set globalAlpha(_) {}, set lineWidth(_) {},
  };
}

function installDom(width = 1280, height = 720) {
  const doc = fakeDom();
  doc.createElementNS = (_ns, tag) => doc.createElement(tag);
  const origCreate = doc.createElement;
  doc.createElement = (tag) => {
    const el = origCreate(tag);
    el.remove = () => {
      const parent = el.parentNode;
      if (parent) { const i = parent.children.indexOf(el); if (i >= 0) parent.children.splice(i, 1); }
      el.parentNode = null;
    };
    if (tag === 'canvas') { el.width = 0; el.height = 0; el.getContext = () => stubCtx(el); }
    return el;
  };
  const root = doc.createElement('div');
  root.clientWidth = width; root.clientHeight = height;
  doc.head.appendChild(root);
  const prevDoc = globalThis.document;
  const prevWin = globalThis.window;
  const listeners = {};
  globalThis.document = doc;
  globalThis.window = {
    devicePixelRatio: 1, innerWidth: width, innerHeight: height,
    addEventListener(n, f) { (listeners[n] = listeners[n] || []).push(f); },
    removeEventListener(n, f) { const l = listeners[n] || []; const i = l.indexOf(f); if (i >= 0) l.splice(i, 1); },
  };
  return {
    doc, root, listeners,
    restore() { globalThis.document = prevDoc; globalThis.window = prevWin; },
  };
}

function groupNodes(root) {
  return findAll(root, (n) => typeof n.className === 'string' && n.className === 'sf-cboss-readout');
}
const groupText = (g) => g.children.slice(0, 4).map((c) => c.textContent);

function bootScoreFight(encounterId) {
  const state = createGameState(SEED);
  const raw = createBus();
  const emitted = [];
  const h = { state, emitted };
  const bus = {
    on: raw.on.bind(raw), off: raw.off.bind(raw), once: raw.once.bind(raw),
    emit(event, payload) {
      // Stamp the clock that GENERATED the command, not the clock at fan-out: the score
      // increments fight.clock at the end of its step, before runCommand emits, so a live
      // read would land every emission one tick late — damage on the final warning tick
      // would stamp fireAt and slip under the < fireAt gate. The pre-update snapshot in
      // tick() names the generating clock; anything emitted outside a step reads live.
      const fights = state.capitalBossEncounters && state.capitalBossEncounters.fights;
      const fight = payload && payload.fightId != null && fights ? fights[payload.fightId] : null;
      const pre = h.preUpdateClock && payload && payload.fightId != null
        ? h.preUpdateClock[payload.fightId] : undefined;
      emitted.push({
        event, payload, tick: state.tick,
        fightClock: pre != null ? pre : (fight ? fight.clock : null),
      });
      raw.emit(event, payload);
    },
  };
  const spawned = [];
  const helpers = {
    spawnBudget: makeBudgetApi(state),
    routeCombatDamage(packet) { return packet; },
    spawnEntity(spec) {
      const id = state.nextEntityId++;
      const entity = { ...spec, id, alive: true, pos: spec.pos ? { x: spec.pos.x, z: spec.pos.z } : { x: 0, z: 0 } };
      state.entities.set(id, entity); state.entityList.push(entity); spawned.push(entity);
      return entity;
    },
    getCombatCapabilities() { return null; },
  };
  const player = { id: state.nextEntityId++, alive: true, pos: { x: 0, z: 0 }, type: 'ship', team: 0 };
  state.entities.set(player.id, player); state.entityList.push(player); state.playerId = player.id;
  state.mode = 'flight';
  const boss = {
    id: state.nextEntityId++, alive: true, pos: { x: 300, z: 0 }, rot: 0,
    hull: 100, hullMax: 100, radius: 20, type: 'ship', team: 1,
  };
  state.entities.set(boss.id, boss); state.entityList.push(boss);
  const fightId = `contract:${encounterId}`;
  state.missions.active.push({ id: fightId, status: 'active', destSectorId: 'contract_room' });
  state.world.currentSectorId = 'contract_room';
  const capSys = createProductionCapitalBossEncounters();
  capSys.init({ state, bus, helpers });
  bus.emit('capitalBoss:start', { encounterId, fightId, bossId: boss.id, targetId: player.id });
  return Object.assign(h, { bus, spawned, capSys, fightId, boss, player, helpers });
}

function tick(h, n = 1, mount = null) {
  for (let i = 0; i < n; i += 1) {
    h.state.tick += 1;
    h.state.simTime += DT;
    // Commands emitted inside this update were generated at each fight's PRE-step clock —
    // the score increments clock at the end of its own step, before runCommand fans out.
    const fights = h.state.capitalBossEncounters && h.state.capitalBossEncounters.fights;
    const pre = {};
    if (fights) for (const [id, f] of Object.entries(fights)) pre[id] = f ? f.clock : null;
    h.preUpdateClock = pre;
    h.capSys.update(DT);
    h.preUpdateClock = null;
    if (mount) mount.draw(h.state);
  }
}

const castEvents = (h, event) =>
  h.emitted.filter((e) => e.event === `capitalBoss:${event}`).map((e) => e.payload);

test('warning projection stays in CSS pixels on high-DPI screens and after menu return', () => {
  const env = installDom();
  globalThis.window.devicePixelRatio = 2;
  const h = bootScoreFight(TOLLMAN);
  const mount = mountCapitalBossOverlay({ root: env.root, ...h,
    helpers: { worldToScreen: (p) => ({ x: 320 + p.x, y: 180 + p.z }) } });
  const canvas = findAll(env.root, (n) => n.tagName === 'canvas')[0];
  try {
    h.bus.emit('capitalBoss:telegraph', {
      fightId: h.fightId, castId: 'dpi-cast', startedAt: 0, fireAt: 60, endAt: 120,
      shapes: [{ kind: 'lane', a: { x: 0, z: 0 }, b: { x: 100, z: 0 }, radius: 10 }],
    });
    mount.draw(h.state);
    assert.equal(canvas.width, 2560);
    assert.equal(canvas.height, 1440);
    assert.ok(canvas._drawCalls.includes('stroke'), 'a live warning is painted');
    assert.deepEqual(canvas._transform, [2, 0, 0, 2, 0, 0],
      'CSS-pixel warning coordinates scale into the backing buffer');

    h.state.mode = 'menu';
    mount.draw(h.state);
    assert.deepEqual(canvas._transform, [1, 0, 0, 1, 0, 0], 'menu clears the full backing buffer');
    h.state.mode = 'flight';
    mount.draw(h.state);
    assert.deepEqual(canvas._transform, [2, 0, 0, 2, 0, 0], 'return restores the projection scale');

    env.root.clientWidth = 900;
    env.root.clientHeight = 600;
    for (const resize of env.listeners.resize || []) resize();
    mount.draw(h.state);
    assert.equal(canvas.width, 1800);
    assert.equal(canvas.height, 1200);
    assert.deepEqual(canvas._transform, [2, 0, 0, 2, 0, 0], 'resize restores the canvas transform');
  } finally { mount.destroy(); env.restore(); }
});

// ── 1 · all seven authored beats read out before they fire ────────────────────────────
test('all seven Tollman beats show authored title+counter at least 60 ticks before firing', () => {
  const env = installDom(1280, 720);
  try {
    const h = bootScoreFight(TOLLMAN);
    const worldToScreen = (w, out) => { out.x = 640 + w.x; out.y = 360 + w.z; out.onScreen = true; return out; };
    const mount = mountCapitalBossOverlay({ root: env.root, bus: h.bus, state: h.state, helpers: { worldToScreen } });
    const score = requireCapitalBossEncounter(TOLLMAN).score;
    const beatsById = new Map(score.beats.map((b) => [b.id, b]));
    // Visibility is recorded per CAST, never per beat: an earlier cancelled cast's
    // warning can never satisfy a later attack of the same beat.
    const seenByCast = new Map(); // castId -> {beatId,title,counter,firstVisibleTick,firstVisibleClock}
    const seenBeats = new Set();
    const announceLog = [];
    const liveRegion = findAll(env.root, (n) => n.attributes && n.attributes['aria-live'] === 'polite')[0];
    Object.defineProperty(liveRegion, 'textContent', {
      get() { return liveRegion._live || ''; },
      set(v) { liveRegion._live = v; announceLog.push({ tick: h.state.tick, text: v }); },
    });
    const readGroups = () => {
      const r = capitalBossReadouts(h.state)[0];
      for (const g of groupNodes(env.root)) {
        const [name, act, moveTitle, counter] = g.children.map((c) => c.textContent);
        if (g.style.display === 'none') continue;
        if (r && r.move && moveTitle === beatsById.get(r.move.beatId).title) {
          // A mounted-but-hidden counter is not a warning: the instruction must be
          // DISPLAYED — on screen — for the whole window it is owed, not merely present
          // in the DOM. The same goes for the required hull instrument. Reading the
          // textContent of a display:none node would happily "see" a suppressed
          // instruction, so the observer asserts the elements' own display every tick.
          assert.notEqual(g.children[2].style.display, 'none',
            `${r.move.beatId}: the move title stays displayed through the warning+active window`);
          assert.notEqual(g.children[3].style.display, 'none',
            `${r.move.beatId}: the counter stays displayed through the warning+active window`);
          const gauge = g.children.find((c) => c.attributes && c.attributes.role === 'progressbar');
          assert.ok(gauge && gauge.style.display !== 'none',
            `${r.move.beatId}: the hull progressbar stays mounted through the window`);
          const scaleSvg = g.children.find((c) => c.tagName === 'svg');
          assert.ok(scaleSvg && scaleSvg.style.display !== 'none',
            `${r.move.beatId}: the hull scale stays displayed through the window`);
          const castId = r.move.castId;
          if (!seenByCast.has(castId)) {
            seenByCast.set(castId, {
              beatId: r.move.beatId, title: moveTitle, counter,
              firstVisibleTick: h.state.tick, firstVisibleClock: r.clock, castId,
            });
            seenBeats.add(r.move.beatId);
          }
        }
      }
    };
    const driveActs = () => {
      const need = new Set(score.beats.map((b) => b.id));
      let act2At = null;
      for (let guard = 0; guard < 3600 * 3; guard += 1) {
        const r = capitalBossReadouts(h.state)[0];
        if (r && r.move && seenBeats.has(r.move.beatId)) need.delete(r.move.beatId);
        tick(h, 1, mount);
        readGroups();
        // Keep driving until every beat has both been read AND fired — a beat's cast can
        // outlive the act that showed it.
        const firedNow = new Set(castEvents(h, 'attack').map((p) => p.beatId));
        if (need.size === 0 && seenBeats.size >= 7 && firedNow.size >= 7) break;
        // Hull forcing for act transitions, through the live entity the score observes.
        const fight = h.state.capitalBossEncounters.fights[h.fightId];
        if (fight && fight.actIndex === 0 && h.state.tick > 600 && seenBeats.size >= 4) {
          h.boss.hull = 0.65 * h.boss.hullMax;
        }
        if (fight && fight.actIndex === 1 && act2At === null) act2At = h.state.tick;
        // Do not leave Act II until receipt_lance — its only late-act pattern slot — has
        // actually FIRED (an act change mid-tell cancels the cast, so seeing the title is
        // not enough); a full-cycle fallback keeps the route finite.
        const fired = new Set(castEvents(h, 'attack').map((p) => p.beatId));
        if (fight && fight.actIndex === 1 && seenBeats.has('seizure')
          && (fired.has('receipt_lance') || h.state.tick - act2At > 2400)) {
          h.boss.hull = 0.28 * h.boss.hullMax;
        }
      }
    };
    driveActs();
    assert.equal(seenBeats.size, 7, `all seven beats appeared on the readout — saw ${[...seenBeats].join(',')}`);
    for (const [castId, row] of seenByCast) {
      const beat = beatsById.get(row.beatId);
      assert.equal(row.title, beat.title, `${row.beatId}: cast ${castId} shows the authored title`);
      assert.equal(row.counter, beat.counter, `${row.beatId}: cast ${castId} shows the complete authored counter`);
    }
    const attacks = castEvents(h, 'attack');
    const telegraphs = castEvents(h, 'telegraph');
    assert.ok(attacks.length >= 7, `every beat fired at least once — ${attacks.length} attacks`);
    for (const beatId of seenBeats) {
      assert.ok(attacks.some((p) => p.beatId === beatId),
        `${beatId}: at least one cast of the beat fired (an earlier cast may have been cancelled)`);
    }
    // Damage/hit payloads identify their cast through origin.id / castId and carry no
    // encounter clock — correlate them against the fight clock captured at emission.
    const strikes = h.emitted.filter((e) => e.event === 'capitalBoss:damage' || e.event === 'capitalBoss:hit');
    for (const attack of attacks) {
      // A cast cancelled by a legitimate act change never fires — that is the score's own
      // lifecycle, not a missing warning. The contract: each attack's OWN cast showed its
      // instruction at least a second before it fired; a different cast's warning,
      // however early, cannot satisfy this one.
      const row = seenByCast.get(attack.castId);
      assert.ok(row, `cast ${attack.castId} (${attack.beatId}) fired without ever showing its instruction`);
      const lead = attack.tick - row.firstVisibleTick;
      assert.ok(lead >= 60, `${attack.beatId}: own instruction visible ${lead} ticks before its attack (>= 60)`);
      const leadClock = attack.clock - row.firstVisibleClock;
      assert.ok(leadClock >= 60,
        `${attack.beatId}: own instruction visible ${leadClock} encounter ticks before its attack (>= 60)`);
      // No attack/damage is emitted during THIS cast's warning window.
      const early = strikes
        .filter((e) => (e.payload.castId === attack.castId
            || (e.payload.origin && e.payload.origin.id === attack.castId))
          && e.fightClock != null && e.fightClock >= attack.startedAt && e.fightClock < attack.fireAt);
      assert.deepEqual(early.map((e) => e.event), [],
        `${attack.beatId}: nothing fires inside cast ${attack.castId}'s warning window`);
    }
    // Every command that names the generating encounter clock is stamped with that same
    // clock — the score increments fight.clock at the end of the step that produced the
    // command, before runCommand fans out, so a stamp read after the update lands one tick
    // ahead and pushes a final-warning-tick strike past the < fireAt gate.
    for (const e of h.emitted) {
      if (e.payload && Number.isFinite(e.payload.clock)) {
        assert.equal(e.fightClock, e.payload.clock,
          `${e.event}: stamped with the generating encounter clock, not the post-advance clock`);
      }
    }
    // Tracking/lock telegraph updates never repeat the live announcement for one cast —
    // and silence is not allowed either: EVERY observed cast gets exactly one.
    const castAnnouncements = announceLog.filter((e) => e.text && e.text.includes('.'));
    for (const beatId of seenBeats) {
      const beat = beatsById.get(beatId);
      const observed = [...seenByCast.values()].filter((v) => v.beatId === beatId).length;
      const castIds = new Set(telegraphs.filter((p) => p.beatId === beatId).map((p) => p.castId));
      const msgs = castAnnouncements.filter((e) => e.text.startsWith(`${beat.title}.`));
      assert.equal(msgs.length, observed,
        `${beatId}: exactly one announcement per observed cast, got ${msgs.length} for ${observed}`);
      assert.ok(msgs.length <= castIds.size,
        `${beatId}: at most one announcement per telegraphed cast, got ${msgs.length} for ${castIds.size}`);
    }
    mount.destroy();
    h.capSys.destroy();
  } finally { env.restore(); }
});

// ── 1b · a strike generated on the final warning tick stamps inside the window ────────
test('damage generated one tick before fireAt stamps the warning tick, not fireAt', () => {
  const h = bootScoreFight(TOLLMAN);
  const score = requireCapitalBossEncounter(TOLLMAN).score;
  // Inject the strike inside the encounter update itself — the same seam the production
  // damage path uses — exactly one encounter tick before the cast fires. Inside the
  // update the live clock has already advanced past the generating tick, which is what
  // used to push this emission one tick late, past the warning gate.
  let probe = null;
  const origUpdate = h.capSys.update.bind(h.capSys);
  h.capSys.update = (dt) => {
    const out = origUpdate(dt);
    const fight = h.state.capitalBossEncounters.fights[h.fightId];
    if (!probe && fight && fight.cast && !fight.cast.fired) {
      const beat = score.beats.find((b) => b.id === fight.cast.beatId);
      if (beat && fight.clock === fight.cast.startedAt + beat.tellTicks) {
        probe = {
          castId: fight.cast.id,
          startedAt: fight.cast.startedAt,
          fireAt: fight.cast.startedAt + beat.tellTicks,
        };
        h.bus.emit('capitalBoss:damage', {
          fightId: h.fightId, castId: fight.cast.id,
          attackerId: h.boss.id, targetId: h.player.id,
          packet: {}, origin: { kind: 'capital_score', id: fight.cast.id },
        });
      }
    }
    return out;
  };
  for (let guard = 0; guard < 3600 && !probe; guard += 1) tick(h, 1);
  assert.ok(probe, 'a cast reached its final warning tick');
  const entry = h.emitted.at(-1);
  assert.equal(entry.event, 'capitalBoss:damage');
  assert.equal(entry.fightClock, probe.fireAt - 1,
    'a strike generated on the last warning tick stamps that tick, not the fire tick');
  assert.ok(entry.fightClock >= probe.startedAt && entry.fightClock < probe.fireAt,
    'the warning-window gate still covers the final warning tick');
  h.capSys.destroy();
});

// ── 2 · Adventure name, act, health are real readouts ─────────────────────────────────
test('Adventure shows boss name, act title, and a parts instrument on the live entity', () => {
  const env = installDom(1280, 720);
  try {
    const h = bootScoreFight(TOLLMAN);
    const mount = mountCapitalBossOverlay({ root: env.root, bus: h.bus, state: h.state, helpers: { worldToScreen: (w, out) => { out.x = 640 + w.x; out.y = 360 + w.z; out.onScreen = true; return out; } } });
    const score = requireCapitalBossEncounter(TOLLMAN).score;
    const actsSeen = [];
    for (let i = 0; i < 3600 * 3 && actsSeen.length < 3; i += 1) {
      tick(h, 1, mount);
      const r = capitalBossReadouts(h.state)[0];
      if (r && r.actId && !actsSeen.includes(r.actId)) actsSeen.push(r.actId);
      const fight = h.state.capitalBossEncounters.fights[h.fightId];
      if (fight && fight.actIndex === 0 && h.state.tick > 600) h.boss.hull = 0.65 * h.boss.hullMax;
      if (fight && fight.actIndex === 1 && h.state.tick > 900) h.boss.hull = 0.28 * h.boss.hullMax;
    }
    const g = groupNodes(env.root)[0];
    assert.equal(g.children[0].textContent, 'THE TOLLMAN', 'the boss names itself');
    const actTitles = score.acts.map((a) => a.title);
    assert.deepEqual(actsSeen, score.acts.map((a) => a.id), 'all three authored acts ran');
    assert.equal(g.children[1].textContent, actTitles[2], 'the readout names the current act');
    // W-COLOSSI (row 547): a plated score boss's instrument reads the fight's own
    // attached-parts fraction, not the entity hull — the Tollman's two authored plates
    // shed with their authored acts above, so re-joining the ledger reads full, half of
    // it reads half, and the accessible name says what the bar is actually counting.
    const gauge = findAll(g, (n) => n.attributes && n.attributes.role === 'progressbar')[0];
    const liveFight = h.state.capitalBossEncounters.fights[h.fightId];
    for (const rec of liveFight.plates) rec.attached = true;
    tick(h, 1, mount);
    assert.equal(gauge.getAttribute('aria-valuenow'), '100',
      'all parts attached reads 100');
    assert.equal(gauge.getAttribute('aria-label'), `${g.children[0].textContent} parts remaining`,
      'a plated score boss names its instrument parts, not hull');
    liveFight.plates[1].attached = false;
    tick(h, 1, mount);
    assert.equal(gauge.getAttribute('aria-valuenow'), '50',
      'one of two parts attached reads 50');
    // A boss whose hull field was never stamped (or dropped by a partial restore) used to
    // divide undefined into the fraction and print aria-valuenow="NaN" — the projection
    // still clamps its published hull to zero, and the parts-backed gauge answers the
    // plate ledger, so a missing hull can surface nothing but the live fraction. The
    // sim itself rejects non-finite hull bounds, so this is probed at the draw seam.
    delete h.boss.hull;
    mount.draw(h.state);
    const r = capitalBossReadouts(h.state)[0];
    assert.ok(Number.isFinite(r.hull) && Number.isFinite(r.hullFraction),
      'a missing hull projects finite readout numbers');
    assert.equal(r.hullFraction, 0, 'a missing hull reads as an empty fraction');
    assert.equal(gauge.getAttribute('aria-valuenow'), '50',
      'a missing hull still answers the live parts fraction, never NaN');
    // Presentation emits nothing of its own — it only reads. Two separate claims, both
    // load-bearing: the swarm family is a hard ZERO in this Adventure fight (a fabricated
    // swarm:* payload with no origin used to satisfy the old predicate), and every damage
    // emission carries the sim's own attribution — a strike without a score/exposure
    // origin is one the presentation layer made up.
    const swarmEvents = h.emitted.filter((e) => e.event.startsWith('swarm:'));
    assert.deepEqual(swarmEvents.map((e) => e.event), [],
      'the readout fabricates no swarm events — an Adventure fight emits none at all');
    const SIM_STRIKE_ORIGINS = new Set(['capital_score', 'capital_exposure']);
    const strikes = h.emitted.filter((e) => e.event === 'capitalBoss:damage');
    assert.ok(strikes.every((e) => e.payload && e.payload.origin
        && SIM_STRIKE_ORIGINS.has(e.payload.origin.kind)),
      'every damage event attributes to the sim — presentation fabricates none');
    mount.destroy();
    h.capSys.destroy();
  } finally { env.restore(); }
});

// ── 3 · late mount, save restoration, stale data ──────────────────────────────────────
test('late mount and save:loaded restore the live instruction without a replayed telegraph', () => {
  const env = installDom(1280, 720);
  try {
    const h = bootScoreFight(TOLLMAN);
    const score = requireCapitalBossEncounter(TOLLMAN).score;
    const project = (w, out) => { out.x = 640 + w.x; out.y = 360 + w.z; out.onScreen = true; return out; };
    // Run until the first cast is mid-tell BEFORE any mount exists.
    tick(h, score.introTicks + score.transitionTicks + 30);
    const fight = h.state.capitalBossEncounters.fights[h.fightId];
    assert.ok(fight.cast, 'a cast is live before the mount exists');
    // Late mount: geometry and the current instruction appear with no new telegraph.
    const telegraphCount = castEvents(h, 'telegraph').length;
    const mount = mountCapitalBossOverlay({ root: env.root, bus: h.bus, state: h.state, helpers: { worldToScreen: project } });
    const announceLog = [];
    const liveRegion = findAll(env.root, (n) => n.attributes && n.attributes['aria-live'] === 'polite')[0];
    assert.ok(liveRegion, 'the mount created its live region');
    Object.defineProperty(liveRegion, 'textContent', {
      get() { return liveRegion._live || ''; },
      set(v) { liveRegion._live = v; announceLog.push({ tick: h.state.tick, text: v }); },
    });
    mount.draw(h.state);
    const g = groupNodes(env.root)[0];
    assert.equal(g.children[2].textContent, score.beats.find((b) => b.id === fight.cast.beatId).title,
      'late mount shows the live move title without a new telegraph');
    assert.equal(castEvents(h, 'telegraph').length, telegraphCount, 'mounting emits no telegraph');
    // The restore re-armed REAL warning geometry on the canvas — moveTo/lineTo/stroke
    // happened before any further telegraph, not merely text in the DOM pool.
    const canvasEl = findAll(env.root, (n) => n.tagName === 'canvas')[0];
    assert.ok(canvasEl && canvasEl._drawCalls, 'the canvas records drawing calls');
    for (const op of ['beginPath', 'moveTo', 'lineTo', 'stroke']) {
      assert.ok(canvasEl._drawCalls.includes(op),
        `late mount paints warning geometry (${op}) without a new telegraph`);
    }
    const castTitle = score.beats.find((b) => b.id === fight.cast.beatId).title;
    const announcesBeforeRestore = announceLog.filter((e) => e.text.startsWith(`${castTitle}.`)).length;
    // Serialize/restore the owner, emit save:loaded: same cast, act, counter, timing.
    const snapshot = h.capSys.serialize();
    const before = { castId: fight.cast.id, beatId: fight.cast.beatId, clock: fight.clock, actId: g.children[1].textContent };
    h.capSys.restore(snapshot);
    h.bus.emit('save:loaded', { reason: 'test' });
    mount.draw(h.state);
    const after = h.state.capitalBossEncounters.fights[h.fightId];
    assert.ok(after.cast && after.cast.id === before.castId, 'the same cast is still live');
    assert.equal(after.cast.beatId, before.beatId, 'same beat after restore');
    const g2 = groupNodes(env.root)[0];
    assert.equal(g2.children[2].textContent, score.beats.find((b) => b.id === before.beatId).title,
      'the restored instruction is the same authored title');
    assert.equal(g2.children[3].textContent, score.beats.find((b) => b.id === before.beatId).counter,
      'the restored counter is complete');
    assert.equal(g2.children[1].textContent, before.actId, 'the act readout survived the restore');
    const remaining = after.cast.startedAt + score.beats.find((b) => b.id === before.beatId).tellTicks - after.clock;
    assert.ok(remaining > 0, 'remaining warning time is real, not reset');
    // The load boundary opens a new presentation session: the resumed cast is spoken
    // again rather than swallowed by the pre-load dedupe ledger.
    const announcesAfterRestore = announceLog.filter((e) => e.text.startsWith(`${castTitle}.`)).length;
    assert.equal(announcesAfterRestore, announcesBeforeRestore + 1,
      'the restored cast is announced once more after save:loaded');
    // A stale cast whose beatId is unknown shows no fabricated move and does not crash.
    after.cast = { ...after.cast, beatId: 'not_a_real_beat' };
    mount.draw(h.state);
    const g3 = groupNodes(env.root)[0];
    assert.equal(g3.children[2].textContent, '', 'unknown beat renders no fabricated title');
    assert.equal(g3.children[3].textContent, '', 'unknown beat renders no fabricated counter');
    mount.destroy();
    h.capSys.destroy();
  } finally { env.restore(); }
});

// ── 4 · lifecycle: freeze, suspend, dock, terminate, destroy ──────────────────────────
test('freeze holds warning timing; suspend/dock/terminal hide; destroy removes everything', () => {
  const env = installDom(1280, 720);
  try {
    const h = bootScoreFight(TOLLMAN);
    const score = requireCapitalBossEncounter(TOLLMAN).score;
    const mount = mountCapitalBossOverlay({ root: env.root, bus: h.bus, state: h.state, helpers: { worldToScreen: (w, out) => { out.x = 640 + w.x; out.y = 360 + w.z; out.onScreen = true; return out; } } });
    tick(h, score.introTicks + score.transitionTicks + 30, mount);
    const fight = h.state.capitalBossEncounters.fights[h.fightId];
    assert.ok(fight.cast, 'a cast is live');
    // Frozen sim: draw is a no-op on warning timing — the clock does not advance itself.
    const clockBefore = fight.clock;
    for (let i = 0; i < 120; i += 1) mount.draw(h.state);
    assert.equal(fight.clock, clockBefore, 'drawing never advances the fight clock');
    // Dock: the owner suspends the fight; readouts hide.
    h.state.ui = h.state.ui || {};
    h.state.ui.docked = true;
    tick(h, 2, mount);
    assert.equal(fight.suspended, true, 'docking suspends the live fight');
    assert.equal(groupNodes(env.root).filter((g) => g.style.display === 'block').length, 0,
      'docking hides the readouts');
    // Undock: the score resumes and the same instruction returns.
    h.state.ui.docked = false;
    tick(h, 2, mount);
    const resumed = groupNodes(env.root).filter((g) => g.style.display === 'block');
    assert.ok(resumed.length >= 1, 'undocking restores the readout');
    // Menu entry hides; flight restores.
    h.state.mode = 'menu';
    mount.draw(h.state);
    assert.equal(groupNodes(env.root).filter((g) => g.style.display === 'block').length, 0,
      'menu mode hides the readouts');
    h.state.mode = 'flight';
    mount.draw(h.state);
    assert.ok(groupNodes(env.root).filter((g) => g.style.display === 'block').length >= 1,
      'returning to flight restores the readouts');
    // Terminal outcome: everything goes away.
    fight.terminal = 'victory';
    tick(h, 1, mount);
    assert.equal(groupNodes(env.root).filter((g) => g.style.display === 'block').length, 0,
      'a terminal fight shows no readouts');
    // Reduced motion/flash still carries all text.
    fight.terminal = null;
    h.state.settings = h.state.settings || {};
    h.state.settings.video = { motionReduce: true, flashReduce: true };
    mount.draw(h.state);
    const calm = groupNodes(env.root).filter((g) => g.style.display === 'block');
    if (fight.started && !fight.suspended && fight.cast) {
      assert.ok(calm.length >= 1, 'reduced motion keeps the instruction visible');
      assert.ok(calm[0].children[2].textContent.length > 0, 'reduced motion keeps the move title');
    }
    h.state.settings.video = { motionReduce: false, flashReduce: false };
    // Destroy removes the pool and the canvas; later events cannot resurrect it.
    const nodeCountBefore = findAll(env.root, () => true).length;
    mount.destroy();
    const nodeCountAfter = findAll(env.root, () => true).length;
    assert.ok(nodeCountAfter < nodeCountBefore, 'destroy removes mounted nodes');
    assert.equal(findAll(env.root, (n) => typeof n.className === 'string' && n.className.includes('sf-cboss')).length, 0,
      'no readout or canvas nodes survive destroy');
    h.bus.emit('capitalBoss:telegraph', { castId: 'z', fightId: h.fightId, shapes: [] });
    mount.draw(h.state);
    assert.equal(findAll(env.root, (n) => typeof n.className === 'string' && n.className.includes('sf-cboss')).length, 0,
      'post-destroy bus events cannot update detached presentation');
    h.capSys.destroy();
  } finally { env.restore(); }
});

// ── 5 · composition, isolation, ordering ──────────────────────────────────────────────
test('readout placement stays inside the viewport at 1280 and 1920; survival adds no bar', () => {
  const score = requireCapitalBossEncounter(TOLLMAN).score;
  for (const [width, height] of [[1280, 720], [1920, 1080]]) {
    const env = installDom(width, height);
    try {
      const h = bootScoreFight(TOLLMAN);
      const mount = mountCapitalBossOverlay({ root: env.root, bus: h.bus, state: h.state,
        helpers: { worldToScreen: (w, out) => { out.x = w.x; out.y = w.z; out.onScreen = true; return out; } } });
      tick(h, score.introTicks + score.transitionTicks + 30, mount);
      const g = groupNodes(env.root)[0];
      assert.ok(g, 'a readout group mounted');
      const x = parseFloat(g.style.left) || 0;
      const y = parseFloat(g.style.top) || 0;
      assert.ok(x >= 0 && x < width, `readout x inside ${width}px viewport`);
      assert.ok(y >= 0 && y < height, `readout y inside ${height}px viewport`);
      const r0 = capitalBossReadouts(h.state)[0];
      assert.notEqual(g.children[2].style.display, 'none',
        'the move title is displayed, never hidden');
      assert.notEqual(g.children[3].style.display, 'none',
        'the counter is displayed, never hidden');
      if (r0 && r0.move) {
        const def = score.beats.find((b) => b.id === r0.move.beatId);
        assert.equal(g.children[3].textContent, def.counter,
          'the mounted counter is the complete authored string');
      }
      assert.ok(String(g.children[3].style.cssText).includes('break-word'),
        'the counter wraps rather than clips');
      mount.destroy();
      h.capSys.destroy();
    } finally { env.restore(); }
  }
  // Survival: instruction still mounts, but the adapter adds no second health bar — the
  // visible scale AND the semantic gauge both leave the tree, then both come back.
  {
    const env = installDom(1280, 720);
    try {
      const h = bootScoreFight(TOLLMAN);
      const mount = mountCapitalBossOverlay({ root: env.root, bus: h.bus, state: h.state,
        helpers: { worldToScreen: (w, out) => { out.x = 640 + w.x; out.y = 360 + w.z; out.onScreen = true; return out; } } });
      tick(h, score.introTicks + score.transitionTicks + 10, mount);
      const g = groupNodes(env.root)[0];
      assert.ok(g && g.style.display !== 'none', 'adventure shows the readout');
      const svgNode = findAll(g, (n) => n.tagName === 'svg')[0];
      const gauge = findAll(g, (n) => n.attributes && n.attributes.role === 'progressbar')[0];
      assert.ok(svgNode, 'the scale node exists in the pool');
      assert.ok(gauge, 'the semantic gauge node exists in the pool');
      assert.notEqual(gauge.style.display, 'none', 'adventure exposes the semantic gauge');
      assert.equal(gauge.getAttribute('aria-label'), `${g.children[0].textContent} parts remaining`,
        'the live gauge names the boss and its instrument — a plated score boss counts parts');
      // Survival: Swarm owns its champion bar — the SVG and the progressbar both hide, and
      // the hidden node answers no stale hull claim.
      const prevRun = h.state.run;
      h.state.run = { kind: 'survival', phase: 'active' };
      mount.draw(h.state);
      assert.equal(svgNode.style.display, 'none', 'survival hides the health scale — Swarm owns it');
      assert.equal(gauge.style.display, 'none', 'survival hides the semantic progressbar too');
      assert.equal(gauge.getAttribute('aria-valuenow'), null,
        'a hidden gauge answers no stale hull value');
      assert.equal(gauge.getAttribute('aria-label'), null,
        'a hidden gauge answers no stale boss name');
      // Back to Adventure: the gauge returns naming the live boss, not a stale one.
      h.state.run = prevRun;
      mount.draw(h.state);
      assert.notEqual(gauge.style.display, 'none', 'adventure restores the semantic gauge');
      assert.equal(gauge.getAttribute('aria-label'), `${g.children[0].textContent} parts remaining`,
        'the restored gauge names the live boss');
      assert.ok(Number.isFinite(Number(gauge.getAttribute('aria-valuenow'))),
        'the restored gauge carries a live instrument value');
      mount.destroy();
      h.capSys.destroy();
    } finally { env.restore(); }
  }
});

test('readouts sort by fightId regardless of store insertion order', () => {
  const h = bootScoreFight(TOLLMAN);
  tick(h, 5);
  const fights = h.state.capitalBossEncounters.fights;
  const base = fights[h.fightId];
  for (const id of ['zz-last', 'aa-first']) {
    const r = JSON.parse(JSON.stringify(base));
    r.fightId = id; r.bossId = h.boss.id; r.targetId = h.player.id;
    fights[id] = r;
  }
  const ids = capitalBossReadouts(h.state).map((r) => r.fightId);
  assert.deepEqual(ids, [...ids].sort(), 'readout order is stable by fightId');
  assert.equal(new Set(ids).size, 3, 'all live fights project');
  h.capSys.destroy();
});

// ── 7 · simultaneous fights: disjoint readouts, per-boss accessible names ─────────────
test('simultaneous fights resolve to non-overlapping readouts; equal instrument % keeps its own name', () => {
  const env = installDom(1280, 720);
  try {
    const h = bootScoreFight(TOLLMAN);
    const score = requireCapitalBossEncounter(TOLLMAN).score;
    // A second boss on the SAME projected position — identical anchors are the worst case —
    // and the same instrument fraction, which is the pool-reuse trap for the gauge's name.
    const boss2 = {
      id: h.state.nextEntityId++, alive: true, pos: { x: 300, z: 0 }, rot: 0,
      hull: 100, hullMax: 100, radius: 20, type: 'ship', team: 1,
    };
    h.state.entities.set(boss2.id, boss2); h.state.entityList.push(boss2);
    const mount = mountCapitalBossOverlay({ root: env.root, bus: h.bus, state: h.state,
      helpers: { worldToScreen: (w, out) => { out.x = 640 + w.x; out.y = 360 + w.z; out.onScreen = true; return out; } } });
    tick(h, score.introTicks + score.transitionTicks + 30, mount);
    const fights = h.state.capitalBossEncounters.fights;
    const clone = JSON.parse(JSON.stringify(fights[h.fightId]));
    clone.fightId = 'zz-ala-fight';
    clone.encounterId = 'capital_boss_ala';
    clone.bossId = boss2.id;
    // The copied plate ledger carries Tollman ids, which mean nothing to ALA's spec —
    // a real ALA fight records its own authored plates. Rebuild the ledger so both
    // readouts sit on the same full attached-parts fraction: equal instrument %,
    // different bosses — the exact state that once kept a reused gauge's old name.
    clone.plates = requireCapitalBossEncounter('capital_boss_ala').plates
      .map((p) => ({ id: p.id, attached: true, strainTicks: 0 }));
    fights[clone.fightId] = clone;
    mount.draw(h.state);
    const visible = groupNodes(env.root).filter((g) => g.style.display === 'block');
    assert.equal(visible.length, 2, 'both live fights project readouts');
    // Identical anchors must still resolve to boxes that share no pixels — dodging HUD
    // reservations alone is not enough. The mount's declared footprint (_rect) is the
    // box each readout actually reserved, so disjointness is measured on that.
    for (const g of visible) {
      assert.notEqual(g.children[3].style.display, 'none',
        'a seated readout never hides its counter');
    }
    const boxes = visible.map((g) => g._rect);
    const boxOverlap = (a, b) => a.x < b.x + b.width && a.x + a.width > b.x
      && a.y < b.y + b.height && a.y + a.height > b.y;
    for (const b of boxes) {
      assert.ok(Number.isFinite(b.x) && b.x >= 0 && b.x + b.width <= 1280,
        `readout inside viewport x (${JSON.stringify(b)})`);
      assert.ok(Number.isFinite(b.y) && b.y >= 0 && b.y + b.height <= 720,
        `readout inside viewport y (${JSON.stringify(b)})`);
    }
    assert.ok(!boxOverlap(boxes[0], boxes[1]),
      `same-anchor readouts cannot share pixels (${JSON.stringify(boxes)})`);
    // Equal instrument percentages, different bosses: each pooled gauge names its own
    // boss — under W-COLOSSI both read attached parts, so the accessible name is the
    // parts claim, not hull.
    const gauges = visible.map(
      (g) => findAll(g, (n) => n.attributes && n.attributes.role === 'progressbar')[0]);
    assert.equal(gauges.length, 2, 'each readout carries an instrument gauge');
    const labels = gauges.map((g) => g.attributes['aria-label']);
    const names = visible.map((g) => g.children[0].textContent);
    assert.equal(labels[0], `${names[0]} parts remaining`);
    assert.equal(labels[1], `${names[1]} parts remaining`);
    assert.notEqual(labels[0], labels[1],
      'an unchanged instrument percentage must not retain the previous boss name');
    mount.destroy();
    h.capSys.destroy();
  } finally { env.restore(); }
});

// ── 7b · top-edge fights stagger to disjoint readouts ─────────────────────────────────
test('two fights projected against the top edge still resolve to disjoint readouts', () => {
  const env = installDom(1280, 720);
  try {
    const h = bootScoreFight(TOLLMAN);
    const score = requireCapitalBossEncounter(TOLLMAN).score;
    // Both bosses project beside the top edge — an upward-only dodge clamps at y=8 and a
    // second readout used to land on top of the first. Review repro anchors sit near
    // y=120 in a 1280x720 frame.
    h.boss.pos = { x: 300, z: -240 };
    const boss2 = {
      id: h.state.nextEntityId++, alive: true, pos: { x: 360, z: -240 }, rot: 0,
      hull: 100, hullMax: 100, radius: 20, type: 'ship', team: 1,
    };
    h.state.entities.set(boss2.id, boss2); h.state.entityList.push(boss2);
    const mount = mountCapitalBossOverlay({ root: env.root, bus: h.bus, state: h.state,
      helpers: { worldToScreen: (w, out) => { out.x = 640 + w.x; out.y = 360 + w.z; out.onScreen = true; return out; } } });
    tick(h, score.introTicks + score.transitionTicks + 30, mount);
    const fights = h.state.capitalBossEncounters.fights;
    const clone = JSON.parse(JSON.stringify(fights[h.fightId]));
    clone.fightId = 'zz-top-edge';
    clone.bossId = boss2.id;
    fights[clone.fightId] = clone;
    mount.draw(h.state);
    const visible = groupNodes(env.root).filter((g) => g.style.display === 'block');
    assert.equal(visible.length, 2, 'both live fights project readouts');
    for (const g of visible) {
      assert.notEqual(g.children[3].style.display, 'none',
        'a seated readout never hides its counter');
    }
    const boxes = visible.map((g) => g._rect);
    const boxOverlap = (a, b) => a.x < b.x + b.width && a.x + a.width > b.x
      && a.y < b.y + b.height && a.y + a.height > b.y;
    for (const b of boxes) {
      assert.ok(Number.isFinite(b.x) && b.x >= 0 && b.x + b.width <= 1280,
        `readout inside viewport x (${JSON.stringify(b)})`);
      assert.ok(Number.isFinite(b.y) && b.y >= 0 && b.y + b.height <= 720,
        `readout inside viewport y (${JSON.stringify(b)})`);
    }
    assert.ok(!boxOverlap(boxes[0], boxes[1]),
      `top-edge readouts cannot share pixels — stagger below or across instead (${JSON.stringify(boxes)})`);
    mount.destroy();
    h.capSys.destroy();
  } finally { env.restore(); }
});

// ── 7c · an exhausted stagger ladder must never land a readout on the HUD ────────────
test('two fights beside the right dock resolve to readouts that dodge every HUD reservation', () => {
  const env = installDom(1280, 720);
  try {
    const h = bootScoreFight(TOLLMAN);
    const score = requireCapitalBossEncounter(TOLLMAN).score;
    // Review repro: production-started fights projecting at (556,424) and (1200,680) in a
    // 1280x720 frame used to resolve (600,304) and (952,560) — the second a 320x96 box
    // intersecting rightDock (1070,298,198,410). The ladder's fixed strides stepped over
    // every clear band and the code then ACCEPTED the colliding anchor as a fallback.
    // World positions stay inside the 620/900 WU engagement band so the fights really
    // start; the 2x-center projection puts their anchors on the reviewed pixels.
    h.boss.pos = { x: -42, z: 32 };
    const boss2 = {
      id: h.state.nextEntityId++, alive: true, pos: { x: 280, z: 160 }, rot: 0,
      hull: 100, hullMax: 100, radius: 20, type: 'ship', team: 1,
    };
    h.state.entities.set(boss2.id, boss2); h.state.entityList.push(boss2);
    const mount = mountCapitalBossOverlay({ root: env.root, bus: h.bus, state: h.state,
      helpers: { worldToScreen: (w, out) => { out.x = 640 + w.x * 2; out.y = 360 + w.z * 2; out.onScreen = true; return out; } } });
    tick(h, score.introTicks + score.transitionTicks + 30, mount);
    const fights = h.state.capitalBossEncounters.fights;
    const clone = JSON.parse(JSON.stringify(fights[h.fightId]));
    clone.fightId = 'zz-dock-fight';
    clone.bossId = boss2.id;
    fights[clone.fightId] = clone;
    mount.draw(h.state);
    const visible = groupNodes(env.root).filter((g) => g.style.display === 'block');
    assert.equal(visible.length, 2, 'a legal cell exists — both live fights still paint');
    // The mount's own footprint contract: the _rect a placement reserved is the box to
    // assert — and every seated readout must keep its counter displayed, since a hidden
    // counter is a suppressed instruction, not a smaller footprint.
    for (const g of visible) {
      assert.notEqual(g.children[3].style.display, 'none',
        'a seated readout never hides its counter');
      assert.notEqual(g.children[2].style.display, 'none',
        'a seated readout never hides its move title');
    }
    const layout = resolveObjectiveHudLayout(1280, 720);
    const reservations = [layout.objective, layout.vitals, layout.action, layout.rightDock, layout.commandDeck];
    const overlaps = (a, b) =>
      a.x < b.x + b.width && a.x + a.width > b.x && a.y < b.y + b.height && a.y + a.height > b.y;
    const boxes = visible.map((g) => g._rect);
    for (const b of boxes) {
      assert.ok(Number.isFinite(b.x) && b.x >= 0 && b.x + b.width <= 1280,
        `readout inside viewport x (${b.x})`);
      assert.ok(Number.isFinite(b.y) && b.y >= 0 && b.y + b.height <= 720,
        `readout inside viewport y (${b.y})`);
      for (const hit of reservations) {
        assert.ok(!overlaps(b, hit),
          `readout at (${b.x},${b.y},${b.width}x${b.height}) must never cover the HUD reservation ${JSON.stringify(hit)}`);
      }
    }
    assert.ok(!overlaps(boxes[0], boxes[1]),
      `the two readouts never share pixels (${JSON.stringify(boxes)})`);
    mount.destroy();
    h.capSys.destroy();
  } finally { env.restore(); }
});

// ── 7d · crowded frames: instructions condense or scroll, they never hide ────────────
// Review-4 reproduction: seed 4242, three production Tollman fights, advance
// introTicks + transitionTicks + 30. At 640x480 the third readout used to show
// PASSAGE OPEN with its counter at display:none; at 640x360 two counters vanished and
// the third readout hid outright. The contract: attack instructions and the required
// hull instrument stay DISPLAYED through warning and active windows — a crowded frame
// condenses (denser lines, a smaller gauge) or stacks the overflow into a scroll
// column inside the reservation-free zone, but it never suppresses the content.
test('three live fights at 640x480 and 640x360 keep every counter and hull readout displayed', () => {
  const score = requireCapitalBossEncounter(TOLLMAN).score;
  const beatsByTitle = new Map(score.beats.map((b) => [b.title, b]));
  for (const [width, height] of [[640, 480], [640, 360]]) {
    const env = installDom(width, height);
    try {
      const h = bootScoreFight(TOLLMAN);
      const bosses = [h.boss];
      for (const pos of [{ x: 250, z: -40 }, { x: 350, z: 50 }]) {
        const b = {
          id: h.state.nextEntityId++, alive: true, pos: { x: pos.x, z: pos.z }, rot: 0,
          hull: 100, hullMax: 100, radius: 20, type: 'ship', team: 1,
        };
        h.state.entities.set(b.id, b);
        h.state.entityList.push(b);
        bosses.push(b);
      }
      const mount = mountCapitalBossOverlay({ root: env.root, bus: h.bus, state: h.state,
        helpers: { worldToScreen: (w, out) => { out.x = width / 2 + w.x; out.y = height / 2 + w.z; out.onScreen = true; return out; } } });
      tick(h, score.introTicks + score.transitionTicks + 30, mount);
      const fights = h.state.capitalBossEncounters.fights;
      ['zz-crowd-b', 'zz-crowd-c'].forEach((id, i) => {
        const clone = JSON.parse(JSON.stringify(fights[h.fightId]));
        clone.fightId = id;
        clone.bossId = bosses[i + 1].id;
        fights[id] = clone;
      });
      mount.draw(h.state);
      assert.equal(capitalBossReadouts(h.state).length, 3, 'three production fights are live');
      const stack = findAll(env.root, (n) => n.className === 'sf-cboss-readout-stack')[0];
      assert.ok(stack, 'the mount always builds the scroll-column host');
      const visible = groupNodes(env.root).filter((g) => g.style.display === 'block');
      assert.equal(visible.length, 3,
        `all three live readouts stay displayed at ${width}x${height} — none may be hidden`);
      const layout = resolveObjectiveHudLayout(width, height);
      const reservations = [layout.objective, layout.vitals, layout.action, layout.rightDock, layout.commandDeck];
      const overlaps = (a, b) => a.x < b.x + b.width && a.x + a.width > b.x
        && a.y < b.y + b.height && a.y + a.height > b.y;
      const inViewport = (r) => !!r && r.x >= 0 && r.y >= 0
        && r.x + r.width <= width && r.y + r.height <= height;
      const offReservations = (r) => !reservations.some((hit) => overlaps(r, hit));
      const placed = [];
      for (const g of visible) {
        const [name, act, moveTitle, counterEl] = g.children;
        const beat = beatsByTitle.get(moveTitle.textContent);
        assert.ok(beat, `the readout names an authored move (${moveTitle.textContent})`);
        for (const [label, el] of [['name', name], ['act', act], ['move title', moveTitle], ['counter', counterEl]]) {
          assert.notEqual(el.style.display, 'none',
            `${width}x${height}: a live readout's ${label} stays displayed`);
        }
        assert.equal(counterEl.textContent, beat.counter,
          'the complete authored counter is on screen, not truncated or hidden');
        const svgNode = findAll(g, (n) => n.tagName === 'svg')[0];
        const gauge = findAll(g, (n) => n.attributes && n.attributes.role === 'progressbar')[0];
        assert.notEqual(svgNode.style.display, 'none',
          'the hull scale stays displayed while the readout is live');
        assert.notEqual(gauge.style.display, 'none',
          'the hull progressbar stays mounted while the readout is live');
        assert.ok(Number.isFinite(Number(gauge.getAttribute('aria-valuenow'))),
          'the hull gauge answers a live value');
        assert.ok(inViewport(g._rect),
          `readout rect inside the ${width}x${height} viewport (${JSON.stringify(g._rect)})`);
        assert.ok(offReservations(g._rect),
          `readout rect dodges HUD reservations (${JSON.stringify(g._rect)})`);
        if (g.parentNode !== stack) placed.push(g);
      }
      for (let i = 0; i < placed.length; i += 1) {
        for (let j = i + 1; j < placed.length; j += 1) {
          assert.ok(!overlaps(placed[i]._rect, placed[j]._rect),
            `seated readouts never share pixels (${JSON.stringify(placed.map((g) => g._rect))})`);
        }
      }
      const stacked = visible.filter((g) => g.parentNode === stack);
      if (height <= 360) {
        // At 640x360 no legal cell can hold a complete readout: the fallback is the
        // scrollable stack column parked in the largest reservation-free rect — every
        // readout stays mounted and displayed instead of two counters and a whole
        // readout going dark.
        assert.equal(stacked.length, 3,
          'at 640x360 all three readouts stack into the scroll column rather than hiding');
        assert.equal(stack.style.display, 'block', 'the stack column is live');
        assert.ok(inViewport(stack._rect), 'the stack column sits inside the viewport');
        assert.ok(offReservations(stack._rect), 'the stack column dodges HUD reservations');
        assert.equal(stack.style.overflowY, 'auto', 'the stack column scrolls');
      } else {
        assert.equal(stacked.length, 0,
          `at ${width}x${height} all three readouts seat in cells of their own`);
      }
      mount.destroy();
      h.capSys.destroy();
    } finally { env.restore(); }
  }
});

// ── 8 · new-game boundary resets the presentation session ─────────────────────────────
test('game:new alone clears warnings, readouts, and the announcement ledger', () => {
  const env = installDom(1280, 720);
  try {
    const h = bootScoreFight(TOLLMAN);
    const score = requireCapitalBossEncounter(TOLLMAN).score;
    const mount = mountCapitalBossOverlay({ root: env.root, bus: h.bus, state: h.state,
      helpers: { worldToScreen: (w, out) => { out.x = 640 + w.x; out.y = 360 + w.z; out.onScreen = true; return out; } } });
    const announceLog = [];
    const liveRegion = findAll(env.root, (n) => n.attributes && n.attributes['aria-live'] === 'polite')[0];
    Object.defineProperty(liveRegion, 'textContent', {
      get() { return liveRegion._live || ''; },
      set(v) { liveRegion._live = v; announceLog.push({ tick: h.state.tick, text: v }); },
    });
    tick(h, score.introTicks + score.transitionTicks + 30, mount);
    const fight = h.state.capitalBossEncounters.fights[h.fightId];
    assert.ok(fight.cast, 'a cast is live');
    const snapshot = JSON.parse(JSON.stringify(fight));
    const castTitle = score.beats.find((b) => b.id === fight.cast.beatId).title;
    const before = announceLog.filter((e) => e.text.startsWith(`${castTitle}.`)).length;
    assert.equal(before, 1, 'the cast announced once');
    const canvasEl = findAll(env.root, (n) => n.tagName === 'canvas')[0];
    assert.ok(canvasEl._drawCalls.includes('stroke'), 'warning geometry painted before new game');
    // New game: the store empties and game:new alone must handle cleanup — no save:loaded
    // rides after it to do the work. Readouts hide, stale warning strokes stop, and the
    // announcement ledger (a per-session dedupe) must not gag the next session.
    canvasEl._drawCalls.length = 0;
    h.state.capitalBossEncounters.fights = {};
    h.bus.emit('game:new', { reason: 'test' });
    mount.draw(h.state);
    mount.draw(h.state);
    assert.equal(groupNodes(env.root).filter((g) => g.style.display === 'block').length, 0,
      'new game shows no stale readouts');
    const postOps = new Set(canvasEl._drawCalls);
    assert.ok(!postOps.has('moveTo') && !postOps.has('lineTo') && !postOps.has('stroke'),
      'game:new clears the warning canvas — no telegraph strokes repaint');
    // The next session restores the same fight — the same dedupe key — and it must be
    // spoken again because this is a new presentation session.
    h.state.capitalBossEncounters.fights[snapshot.fightId] = snapshot;
    mount.draw(h.state);
    const after = announceLog.filter((e) => e.text.startsWith(`${castTitle}.`)).length;
    assert.equal(after, before + 1,
      'the same cast key is announced again in the new session, not swallowed by the old ledger');
    mount.destroy();
    h.capSys.destroy();
  } finally { env.restore(); }
});

// ── review · one live-region write per frame, pooled readouts ─────────────────────────
test('identities opened in one frame share one announcement, cast first; readouts are pooled', () => {
  const env = installDom(1280, 720);
  try {
    const h = bootScoreFight(TOLLMAN);
    const score = requireCapitalBossEncounter(TOLLMAN).score;
    const project = (w, out) => { out.x = 640 + w.x; out.y = 360 + w.z; out.onScreen = true; return out; };
    tick(h, score.introTicks + score.transitionTicks + 30);
    const fight = h.state.capitalBossEncounters.fights[h.fightId];
    assert.ok(fight.cast, 'a cast is live before the mount exists');
    const beat = score.beats.find((b) => b.id === fight.cast.beatId);
    const act = score.acts[fight.actIndex];
    const mount = mountCapitalBossOverlay({ root: env.root, bus: h.bus, state: h.state, helpers: { worldToScreen: project } });
    const writes = [];
    const liveRegion = findAll(env.root, (n) => n.attributes && n.attributes['aria-live'] === 'polite')[0];
    Object.defineProperty(liveRegion, 'textContent', {
      get() { return liveRegion._live || ''; },
      set(v) { liveRegion._live = v; writes.push(v); },
    });
    const expectOneJoined = (label) => {
      assert.equal(writes.length, 1, `${label}: one live-region write for the frame, got ${writes.length}`);
      const text = writes[0];
      assert.ok(text.startsWith(`${beat.title}. ${beat.counter}`), `${label}: the cast instruction leads (${text})`);
      assert.ok(text.includes(`${score.name} is on you.`), `${label}: the boss intro is not overwritten (${text})`);
      assert.ok(text.includes(`${score.name}: ${act.title}`), `${label}: the act is not overwritten (${text})`);
    };
    mount.draw(h.state);
    expectOneJoined('late mount');
    writes.length = 0;
    mount.draw(h.state);
    assert.equal(writes.length, 0, 'a steady frame speaks nothing');
    h.bus.emit('save:loaded', { reason: 'test' });
    mount.draw(h.state);
    expectOneJoined('save:loaded');

    // The pooled projection reuses its array and readout objects frame to frame.
    const pool = [];
    const first = capitalBossReadouts(h.state, pool);
    const r0 = first[0];
    const m0 = r0.move;
    const second = capitalBossReadouts(h.state, pool);
    assert.equal(second, pool, 'the caller array is the result');
    assert.equal(second[0], r0, 'the readout object is reused');
    assert.equal(second[0].move, m0, 'the move record is reused');
    assert.deepEqual(Object.keys(r0).sort(), Object.keys(capitalBossReadouts(h.state)[0]).sort(),
      'a pooled readout carries the same public fields as a fresh one');
    h.state.mode = 'docked';
    assert.equal(capitalBossReadouts(null, pool).length, 0, 'no state, no readouts');
    mount.draw(h.state);
    const shown = groupNodes(env.root).filter((g) => g.style.display === 'block');
    assert.equal(shown.length, 0, 'leaving flight hides every readout');
    mount.destroy();
    h.capSys.destroy();
  } finally { env.restore(); }
});
