// 346 — Yard tow-out on a live crusher clock.
//
// A dead MTS hauler drifts toward the yard crusher mouth on a visible cycle. The
// player can latch and tow it clear (tow verb), watch the yard eat it, or leave.
// Reuses the tow verb and the crash-and-debris consequence; new: the crusher-clock
// countdown as a civilian-deck pressure shape (no combat, no fail flag).
import { deepFreeze, defineEncounter } from './catalog.js';

export const encounterOrder = 346;
export const trigger = deepFreeze({
  id: 'yard_towout',
  tier: 'minor',
  deck: 'civilian',
  weight: 1.5,
  zoneTypes: ['civilian_core'],
  // Self-registered runtime (below) dispatches by shapeId; the legacy script labels must name
  // real ENCOUNTER_SCRIPTS keys for check tooling — 'salvage' is not one. Sibling modules leave
  // fallbackScript unset so the schedule label defaults to 'whisper'.
  script: 'selfRegistered',
  pressureCost: 20,
  cooldownS: 600,
  proximity: true,
  gates: {},
});

const MOUTH_RADIUS = 40;
const JAW_ADVANCE_WU_S = 4;
const CLEAR_MARGIN_WU = 120;
const WINDOW_S = 150;

function dist(a, b) {
  return Math.hypot(a.x - b.x, a.z - b.z);
}

function crushHauler(d, live, hauler) {
  const pos = hauler && hauler.pos
    ? { x: hauler.pos.x, z: hauler.pos.z }
    : (live.data.towout && live.data.towout.mouth);
  if (hauler) hauler.alive = false;
  if (pos && typeof d.spawnWreck === 'function') {
    d.spawnWreck(live, {
      pos,
      pool: { cmdty_scrap_metal: 4, cmdty_ore_iron: 1 },
      scanLabel: 'Crusher leavings',
      storyPropKind: 'yard_crush_debris',
    });
  }
  d.despawnAll(live, 12, 'skiff');
}

export const runtime = Object.freeze({
  fire(d, live, state) {
    live.deadlineAt = d.now() + WINDOW_S;
    const ids = d.spawnShips(live, live.plan.ships);
    // The premise needs the hauler AND the yard skiff on the field: a partial
    // budget grant that lands one hull is a different encounter. (344 idiom.)
    if (!ids.length || d.aliveCount(live, 'hauler') < 1 || d.aliveCount(live, 'skiff') < 1) {
      return d.abort(live, 'no_budget');
    }
    const hauler = d.entsOf(live, 'hauler')[0];
    // Entity-level: the readers (convoyTargetDisabled, engagement gating) check
    // ent.disabled, not ent.data. A dead hauler is scenery that can be towed.
    hauler.disabled = true;
    // The mouth opens ahead of the hauler's drift, inside the yard.
    const anchor = (hauler && hauler.pos) || { x: 0, z: 0 };
    live.data.towout = {
      mouth: { x: anchor.x + 300, z: anchor.z, radius: MOUTH_RADIUS },
      startDist: hauler ? dist(hauler.pos, { x: anchor.x + 300, z: anchor.z }) : 300,
      lastNow: d.now(),
    };
    live.approach = {
      signal: 'yard_crusher_clock',
      contacts: ids.length,
      t: d.now(),
    };
    live.phase = 'tow';
    d.say(live, 'alert', 'yard_towout_alert', null, { primary: true });
  },

  tick(d, live, state, now) {
    if (live.phase === 'done') return;
    const tow = live.data.towout;
    if (!tow) return;
    // entsOf only returns live hulls, so a missing hauler is a lost one.
    const hauler = d.entsOf(live, 'hauler')[0] || null;
    if (!hauler) {
      d.despawnAll(live, 12);
      return d.resolve(live, 'hauler_lost', { speak: false });
    }
    // The jaw advances on its cycle whether or not the player acts.
    const dt = Math.max(0, now - (tow.lastNow || now));
    tow.lastNow = now;
    const dx = hauler.pos.x - tow.mouth.x;
    const dz = hauler.pos.z - tow.mouth.z;
    const len = Math.hypot(dx, dz) || 1;
    tow.mouth.x += (dx / len) * JAW_ADVANCE_WU_S * dt;
    tow.mouth.z += (dz / len) * JAW_ADVANCE_WU_S * dt;
    const distNow = dist(hauler.pos, tow.mouth);
    if (distNow <= tow.mouth.radius) {
      crushHauler(d, live, hauler);
      return d.resolve(live, 'crushed', { speak: true });
    }
    if (distNow >= tow.startDist + CLEAR_MARGIN_WU) {
      d.grant(300, 'yard:towout');
      d.rep('faction_mts', 4, 'yard_towout');
      // The towed hauler stays in the world it was towed into; the skiff stands down.
      d.despawnAll(live, 15, 'skiff');
      return d.resolve(live, 'towed', { speak: true });
    }
    if (now >= live.deadlineAt) {
      crushHauler(d, live, hauler);
      return d.resolve(live, 'crushed', { speak: false });
    }
  },
});

export default defineEncounter(trigger, {
  shape: {
    situation: 'yard',
    place: trigger.zoneTypes,
    twist: 'depth',
    actor: 'mule_trader',
  },
  // A scout watches the approach grow on the scope: the crusher clock signal at
  // 900 WU resolves into the hauler's drift vector plus the jaw countdown.
  scoutApproach: {
    signal: 'yard_crusher_clock',
    rangeWu: 900,
    resolves: 'hauler_drift_and_crusher_countdown',
  },
  verbs: ['latch', 'tow'],
  roster: [
    { cast: 'hauler', archetype: 'mule_trader', team: 2, passive: true },
    { cast: 'skiff', archetype: 'mule_trader', team: 2, passive: true },
  ],
  civilian: {
    archetypes: ['mule_trader'],
    size: [1, 1],
    factionId: 'faction_mts',
    context: 'civilian',
    team: 2,
    passive: true,
  },
  squad: {
    archetypes: ['mule_trader'],
    size: [1, 1],
    factionId: 'faction_mts',
    context: 'civilian',
    team: 2,
    passive: true,
  },
  // Role names only — no `enabled`, so the planner borrows carrierRole/raiderRole
  // for the plan ships and leaves plan.predation null: no custody, no authority.
  // The skiff keeps a yard name so the scope never reads it as a raider.
  predation: {
    carrierRole: 'hauler',
    raiderRole: 'skiff',
  },
  bark: 'yard_towout_alert',
  transitS: 150,
});
