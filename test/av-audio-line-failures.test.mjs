// AUDIT-AUDIO F-AV-01..F-AV-04 — a failed or handed-off line must not borrow the voices of
// a success or double its own:
//   F-AV-01  an accepted handoff (or any quiet-reason break) emits tether:broke — the crack
//            belongs to tether:broken's snap, and quiet reasons are silent on both receipts.
//   F-AV-02  tether:broken's instrument snap already carries the crack layer; tether:broke
//            stands down on the stamp instead of re-playing it (same-tick AND reconcile-late).
//   F-AV-03  the player's shield collapse plays the crystalline signature + the bare
//            discharge + the alarm — not the pop recipe that embeds the same crack layer.
//   F-AV-04  a releaseRated with deliberate:false is a break's grade receipt — it must not
//            play the successful-release whoosh (instrument) or the messy snap (minimal cue).
//   F-AV-05  an out-of-update authority break (physics cut, entity_destroyed): the receipted
//            snap speaks on tether:broken and the deferred tether:broke echo dedups — never
//            crack then snap (D235, real tetherGameplay + audio on one bus in init order).

import test from 'node:test';
import assert from 'node:assert/strict';

import { createAttachmentService } from '../src/combat/attachments.js';
import { createCombatCatalog, ensureCombatState } from '../src/combat/runtime.js';
import { createBus } from '../src/core/eventBus.js';
import { audio } from '../src/audio/audioSystem.js';
import { tetherGameplay } from '../src/systems/tetherGameplay.js';

function host(tick = 100) {
  const plays = [];
  const h = Object.create(audio);
  const state = {
    tick,
    simTime: tick / 60,
    playerId: 'p1',
    entities: new Map([
      ['p1', { id: 'p1', isPlayer: true, alive: true, pos: { x: 0, z: 0 }, type: 'ship' }],
      ['rock', { id: 'rock', type: 'asteroid', alive: true, pos: { x: 40, z: 0 } }],
    ]),
    player: { tether: { active: true, load: 0.6, strain: 0.4 } },
  };
  const bus = createBus();
  h.init({ state, bus, helpers: {} });
  h.play = (recipeId) => { plays.push(recipeId); return { id: recipeId }; };
  return { h, bus, state, plays };
}

test('F-AV-01: an accepted handoff plays neither the snap nor the crack', () => {
  const { bus, plays } = host();
  // The _releaseAcceptedLoad sequence: quiet cut, then the broke receipt with the reason.
  bus.emit('tether:broken', { targetId: 'rock', attachmentId: 'a1', reason: 'accepted' });
  bus.emit('tether:broke', { targetId: 'rock', reason: 'accepted' });
  assert.equal(plays.includes('sfx.tetherSnap'), false, 'accepted is a quiet reason — no snap');
  assert.equal(plays.includes('sfx_tether_crack'), false, 'the handoff must not crack');
  // The reconcile path carries the same quiet law: a boundary break is silence, not failure.
  bus.emit('tether:broken', { targetId: 'rock', attachmentId: 'a2', reason: 'sector_changed' });
  bus.emit('tether:broke', { targetId: 'rock', reason: 'sector_changed' });
  assert.equal(plays.includes('sfx_tether_crack'), false, 'a line left behind stays silent');
});

test('F-AV-02: a real break plays one snap — the verb receipt stands down on the stamp', () => {
  const { h, bus, state, plays } = host(200);
  // The target-loss fanout, in production order: cut -> tether:broken (the snap), then
  // tether:broke + the rated receipt for the grade readout.
  bus.emit('tether:broken', { targetId: 'rock', attachmentId: 'a1', reason: 'target_lost' });
  bus.emit('tether:broke', { targetId: 'rock', reason: 'target_lost' });
  bus.emit('tether:releaseRated', { targetId: 'rock', classification: 'clean', deliberate: false });
  assert.equal(plays.filter((id) => id === 'sfx.tetherSnap').length, 1, 'one snap per break');
  assert.equal(plays.includes('sfx_tether_crack'), false,
    'tether:broke must not re-play the crack layer already inside the snap');
  assert.equal(h.rt._masslineBreakSpokeTick, 200, 'the played snap stamps its tick');

  // The reconcile path can surface the receipt a tick or two after the authority spoke —
  // the window, not a strict tick match, is what stands the verb voice down.
  state.tick = 202;
  bus.emit('tether:broke', { targetId: 'rock', reason: 'overload' });
  assert.equal(plays.includes('sfx_tether_crack'), false, 'a reconcile-late broke stays quiet');

  // But the verb voice is not dead: a broke whose break never snapped still speaks.
  state.tick = 220;
  bus.emit('tether:broke', { targetId: 'rock', reason: 'overload' });
  assert.equal(plays.includes('sfx_tether_crack'), true,
    'a broke outside the break window keeps its own voice');
});

test('F-AV-03: the player shield collapse plays one crack — signature, discharge, alarm', () => {
  const { bus, plays } = host();
  bus.emit('shieldDown', { combatantId: 'p1', pos: { x: 0, z: 0 } });
  assert.ok(plays.includes('sfx.shieldBreak'), 'the universal crystalline signature');
  assert.ok(plays.includes('sfx_shield_blowout_discharge'), 'the personal discharge');
  assert.ok(plays.includes('sfx_shield_blowout_alarm'), 'the alarm still speaks');
  assert.equal(plays.includes('sfx_shield_blowout_pop'), false,
    'the pop recipe embeds a second sfx_shield_break_crack — one collapse, one crack');

  plays.length = 0;
  bus.emit('shieldDown', { combatantId: 'rock', pos: { x: 40, z: 0 } });
  assert.ok(plays.includes('sfx.shieldBreak'), 'every collapse sounds like a collapse');
  assert.equal(plays.includes('sfx_shield_blowout_discharge'), false,
    'the personal layer belongs to the player alone');
});

test('F-AV-04: only a deliberate releaseRated sings the release whoosh', () => {
  const { bus, plays } = host();
  // A break that happened to grade well still emits the rating — for the readout, not
  // the whoosh.
  bus.emit('tether:releaseRated', { targetId: 'rock', classification: 'clean', deliberate: false });
  assert.equal(plays.includes('sfx_massline_release'), false,
    'a failed line must not play the successful-release whoosh');
  // And a break graded messy must not take the minimal snap cue either — the break owns it.
  bus.emit('tether:releaseRated', { targetId: 'rock', classification: 'messy', deliberate: false });
  assert.equal(plays.includes('sfx.tetherSnap'), false,
    'a non-deliberate rating never borrows the release snap');

  // The deliberate let-go keeps both voices: graded classes get the whoosh, a messy one the snap.
  bus.emit('tether:releaseRated', { targetId: 'rock', classification: 'clean', deliberate: true });
  assert.ok(plays.includes('sfx_massline_release'), 'a deliberate clean release whooshes');
  bus.emit('tether:releaseRated', { targetId: 'rock', classification: 'messy', deliberate: true });
  assert.ok(plays.includes('sfx.tetherSnap'), 'a deliberate messy release keeps the owned snap');
});

// A real tetherGameplay + audioSystem on one bus, initialized in production order
// (gameplay ~40 before audio ~68) so the bus re-creates the dispatch order that used to
// double-voice an out-of-update authority break: tetherGameplay's tether:broken listener
// ran first, and its tether:broke echo reached the crack verb before the snap's stamp.
function productionLineHost(tick = 200) {
  const p = {
    id: 'p1', type: 'ship', team: 0, alive: true,
    pos: { x: 0, z: 0 }, vel: { x: 12, z: -4 }, rot: 0,
    radius: 8, mass: 16, maxSpeed: 218, flags: {},
  };
  const rock = {
    id: 'rock', type: 'asteroid', team: null, alive: true,
    pos: { x: 180, z: 0 }, vel: { x: 0, z: 0 }, rot: 0,
    radius: 14, mass: 640, collides: true,
    data: { typeId: 'ast_common_rock' },
  };
  const entityList = [p, rock];
  const state = {
    mode: 'flight',
    simTime: tick / 60,
    tick,
    playerId: p.id,
    player: {
      heat: 0,
      targetId: null,
      tether: {
        active: false, targetId: null, strain: 0, load: 0,
        attachmentId: null, restLength: 0, phase: 'slack',
      },
    },
    entities: new Map(entityList.map((e) => [e.id, e])),
    entityList,
    spatialHash: {
      diagnostics: { activeBuckets: 1 },
      queryRadius(x, z, radius, out) {
        for (const e of entityList) {
          if (!e || !e.pos || e.alive === false) continue;
          const d = Math.hypot(e.pos.x - x, e.pos.z - z);
          if (d <= radius + (e.radius || 0)) out.push(e);
        }
      },
    },
    input: {
      aimWorld: { x: rock.pos.x, z: rock.pos.z },
      aimAngle: 0,
      tetherMode: null,
      actions: { tetherFire: false, tetherCut: false, reelDelta: 0 },
    },
    combat: null,
  };
  ensureCombatState(state);

  const bus = createBus();
  const plays = [];
  const broke = [];
  bus.on('tether:broke', (payload) => broke.push(payload));

  const catalog = createCombatCatalog();
  const helpers = {
    combatPhysics: {
      createAttachment(input) {
        return { id: input.attachmentId, attachmentId: input.attachmentId,
          ownerId: input.ownerId, targetId: input.targetId };
      },
      cutAttachment() { return true; },
      setAttachmentReel() { return true; },
      getAttachmentTelemetry() { return null; },
    },
  };
  const attachments = createAttachmentService({ state, catalog, helpers, bus });
  const kernel = { attachments, catalog: { attachments: catalog.attachments } };
  const registry = {
    get: (name) => (name === 'actions' || name === 'combat' ? { kernel } : null),
  };

  const system = Object.assign({}, tetherGameplay);
  system.init({ state, bus, helpers, registry });
  const h = Object.create(audio);
  h.init({ state, bus, helpers: {} });
  h.play = (recipeId) => { plays.push(recipeId); return { id: recipeId }; };
  return { system, h, bus, state, plays, broke, attachments, p, rock };
}

test('F-AV-05: an out-of-update authority break plays one snap — the deferred echo dedups', () => {
  const { system, h, state, plays, broke, attachments, p, rock } = productionLineHost();
  // Latch the player's line on the rock: press, then one more tick to paint the mirror.
  state.input.actions.tetherFire = true;
  system.update(1 / 60, state);
  state.input.actions.tetherFire = false;
  system.update(1 / 60, state);
  assert.equal(state.player.tether.active, true, 'the line must be live before it can break');
  plays.length = 0;

  // The authority breaks the line outside the tether update (target destroyed, physics
  // cut — every producer that emits tether:broken outside update() takes this path).
  const attachmentId = state.player.tether.attachmentId
    || attachments.listForEntity(p.id, true)[0]?.id;
  attachments.breakAttachment(attachmentId, 'entity_destroyed', rock.id);

  assert.equal(state.player.tether.active, false,
    'the HUD mirror still drops inside the dispatch — no LOCKED pill behind the break');
  assert.deepEqual(plays, ['sfx.tetherSnap'],
    'the receipted snap owns the break voice; before D235 the echoed crack spoke first');
  assert.equal(broke.length, 0,
    'the tether:broke echo defers past the tether:broken dispatch, not inside it');

  // The next in-update reconcile speaks the held receipt inside the snap's dedupe
  // window — the same order an in-update break produces, one voice total.
  system.update(1 / 60, state);
  assert.equal(broke.length, 1, 'the deferred broke receipt still delivers on the next update');
  assert.equal(broke[0].reason, 'entity_destroyed');
  assert.equal(plays.filter((id) => id === 'sfx.tetherSnap').length, 1, 'one snap per break');
  assert.equal(plays.includes('sfx_tether_crack'), false,
    'the crack stands down on the stamp instead of doubling the snap layer');
  assert.equal(h.rt._masslineBreakSpokeTick, state.tick, 'the snap stamped its tick');
});
