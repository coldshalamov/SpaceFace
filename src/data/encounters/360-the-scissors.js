// 360 — THE SCISSORS (WF-02: a fight that uses the geometry).
// A Reach pack that works the belt narrows instead of the open lane. One wing stands in the
// open ahead and runs the demand — the classic, readable toll-taker read. The other wing is
// already seeded astern of the player, among the rocks, weapons cold, holding the wake. The
// demand window is when the scissors are readable but not yet dangerous: the field shows both
// blades, nothing fires. Refuse, run, go quiet inside the ring, or open fire — and the wake
// wing lights its burns while the front holds the lane. The exit was taken before the hail.
//
// The counterplay is the read the game has been teaching all along: the wake blade is light
// hulls (wasps + one corsair) — turn and break IT first and the trap collapses into an
// ordinary ambush; pay and both wings part through the gap; thread the rocks off-axis and a
// line-abreast pincer cannot follow. Where the field carries a readable stone, the wake wing
// seeds behind it (same lee arithmetic as the ambush lee, applied to the astern anchor).
//
// Appended after 358 — the next free order, not slotted by theme.
import { deepFreeze, defineEncounter } from './catalog.js';
import { ENEMY_TYPES } from '../enemies.js';

export const encounterOrder = 360;
export const trigger = deepFreeze({
  id: 'scissors_ambush',
  tier: 'minor',
  deck: 'combat',
  weight: 1.1,
  zoneTypes: ['ambush_lane', 'mining_belt', 'outlaw_zone', 'derelict_field'],
  script: 'selfRegistered',
  fallbackScript: 'ambush',
  pressureCost: 48,
  cooldownS: 620,
  proximity: true,
  gates: {
    minCargoValue: 200,
    maxSecurity: 0.7,
    storyBeatMin: 1,
    minSectorTier: 2,
  },
});

// ── tuning ────────────────────────────────────────────────────────────────────────────────────
const FRONT_STANDOFF_WU = 620;      // the loud wing cuts the lane ahead (toll-standard read)
const FRONT_JITTER_WU = 160;
const WAKE_STANDOFF_WU = 840;       // the quiet wing holds the wake, off the exact bearing
const WAKE_LATERAL_WU = 150;
const WAKE_SPACING_WU = 55;         // line abreast across the wake
const ROCK_SEED_SEARCH_WU = 620;    // wake anchor → stone scan
const ROCK_SEED_MIN_RADIUS = 14;    // readable cover, not gravel (lee law)
const ROCK_SEED_MAX_SHIFT_WU = 420; // formation-preserving shift cap (lee law)
const ROCK_SEED_STANDOFF_WU = 40;
const SPRING_RING_WU = 900;         // closing on the quiet blade inside this shuts the trap
const SPRING_GRACE_S = 4;           // the demand must exist before proximity can answer it
const ESCAPE_RING_WU = 2600;        // physical escape = clear of BOTH blades
const PAY_DIST_WU = 520;            // toll payment contract: cut thrust inside, hold 3 s
const PAY_SPEED_WU = 8;
const PAY_HOLD_S = 3;
const TITHE_FRACTION = 0.18;        // a smaller cut than the lane toll — the wake is the wage
const TITHE_MIN_CR = 220;

const ENEMY_BY_ID = new Map(ENEMY_TYPES.map((entry) => [entry.id, entry]));

function titheFor(cargoValue) {
  const value = Math.max(0, Number(cargoValue) || 0);
  return Math.max(TITHE_MIN_CR, Math.round((value * TITHE_FRACTION) / 10) * 10);
}

function dist2(ax, az, bx, bz) { const dx = ax - bx, dz = az - bz; return dx * dx + dz * dz; }

/** Wake-wing rock seeding (WF-02). Pure and rng-free: the same player pose, wake anchor and
 * stone field resolve the same shift. Prefers the biggest readable stone near the wake anchor
 * that stands on the player's side of it, then parks the wing on the stone's far side — the
 * astern blade sits in cover the same way an ambush lee does. Returns a rigid offset or null
 * (fail-open: no stone, the wing holds the raw wake line). */
function seedWakeBehindRock(playerPos, anchor, entityList) {
  if (!playerPos || !anchor || !Array.isArray(entityList)) return null;
  const wx = anchor.x - playerPos.x, wz = anchor.z - playerPos.z;
  const wl = Math.hypot(wx, wz);
  if (!(wl > 1)) return null;
  const ux = wx / wl, uz = wz / wl;                    // player → wake-anchor bearing
  const search2 = ROCK_SEED_SEARCH_WU * ROCK_SEED_SEARCH_WU;
  let best = null;
  let bestScore = -Infinity;
  for (const rock of entityList) {
    if (!rock || rock.alive === false || rock.type !== 'asteroid' || !rock.pos) continue;
    const radius = Number.isFinite(rock.radius) ? rock.radius : 0;
    if (radius < ROCK_SEED_MIN_RADIUS) continue;
    const rx = rock.pos.x - anchor.x, rz = rock.pos.z - anchor.z;
    if (rx * rx + rz * rz > search2) continue;
    // Cover only counts on the player's side of the wing (forward hemisphere, lee law).
    const along = (rock.pos.x - playerPos.x) * ux + (rock.pos.z - playerPos.z) * uz;
    if (along <= radius) continue;
    const lateral = Math.abs((rock.pos.x - playerPos.x) * uz - (rock.pos.z - playerPos.z) * ux);
    const score = radius * 2 - lateral * 0.25;
    if (score > bestScore || (score === bestScore && best && rock.id != null && best.rockId != null
      && rock.id < best.rockId)) {
      bestScore = score;
      best = { rockX: rock.pos.x, rockZ: rock.pos.z, rockRadius: radius, rockId: rock.id != null ? rock.id : null };
    }
  }
  if (!best) return null;
  // Far side of the stone along the player→rock bearing, pushed out by radius + standoff.
  let lx = best.rockX - playerPos.x, lz = best.rockZ - playerPos.z;
  const ll = Math.hypot(lx, lz) || 1;
  lx /= ll; lz /= ll;
  const stand = best.rockRadius + ROCK_SEED_STANDOFF_WU;
  const tx = (best.rockX + lx * stand) - anchor.x;
  const tz = (best.rockZ + lz * stand) - anchor.z;
  const tl = Math.hypot(tx, tz);
  if (!(tl > 0.5)) return null;                        // anchor already in the stone's lee
  const k = tl > ROCK_SEED_MAX_SHIFT_WU ? ROCK_SEED_MAX_SHIFT_WU / tl : 1;
  return { dx: tx * k, dz: tz * k, rockRadius: best.rockRadius, rockId: best.rockId, shiftWU: Math.round(tl * k) };
}

// Same motive-stamp contract as the shared ambush spring: the engagement authority denies
// cargo_extortion shots until the robbery escalates — the trigger stamp releases the guns.
function settleScissorsMotive(d, live, trigger) {
  for (const entity of d.entsOf(live)) {
    const data = entity.data || (entity.data = {});
    const ai = data.ai || (data.ai = {});
    ai.motive = (live.shape && live.shape.motive) || 'cargo_extortion';
    ai.engagementTrigger = trigger;
    ai.motiveSatisfied = false;
  }
}

function springScissors(d, live, trigger) {
  if (!live || live.data.sprung) return;
  live.data.sprung = true;
  live.data.sprungAt = d.now();
  d.setPassive(live, false);
  live.phase = 'conflict';
  settleScissorsMotive(d, live, trigger);
  d.say(live, 'alert', (live.shape && live.shape.springBark) || 'scissors_spring');
  if (live.data.tookWakeFirst) {
    // The earned read: the player opened on the quiet blade — say so, once.
    d.say(live, 'alert', 'You took the back wing first — the scissors never closed.', null, { literal: true });
  } else if (live.shape.telegraph) {
    d.say(live, 'alert', live.shape.telegraph, null, { literal: true });
  }
}

/** Distance² to the quiet blade only — the loud wing cuts the lane INSIDE its own demand
 * ring on purpose (the toll read), so it can never be the proximity spring's yardstick. */
function wakeDist2(d, live, p) {
  let best = Infinity;
  for (const e of d.entsOf(live, 'flank')) {
    const d2 = dist2(p.pos.x, p.pos.z, e.pos.x, e.pos.z);
    if (d2 < best) best = d2;
  }
  return best;
}

export const runtime = Object.freeze({
  fire(d, live, state) {
    const p = d.player();
    if (!p || !p.pos) return d.abort(live, 'no_player');
    const frontSpecs = (live.plan.ships || []).map((sh) => ({ ...sh, passive: true }));
    if (!frontSpecs.length) return d.abort(live, 'no_cast');
    const rng = d.stream(live, 'scissors_layout');

    // Loud blade: the front wing cuts the lane on the zone bearing (the toll-taker read).
    const center = live.anchor || (live.plan && live.plan.zoneCenter) || p.pos;
    let fx = center.x - p.pos.x, fz = center.z - p.pos.z;
    const fl = Math.hypot(fx, fz);
    if (fl < 1) { const a = rng() * Math.PI * 2; fx = Math.cos(a); fz = Math.sin(a); }
    else { fx /= fl; fz /= fl; }
    const px = -fz, pz = fx;                             // perpendicular of the lane bearing
    for (const sh of frontSpecs) {
      sh.pos = {
        x: p.pos.x + fx * FRONT_STANDOFF_WU + (rng() - 0.5) * FRONT_JITTER_WU,
        z: p.pos.z + fz * FRONT_STANDOFF_WU + (rng() - 0.5) * FRONT_JITTER_WU,
      };
    }
    const frontIds = d.spawnShips(live, frontSpecs);
    if (!frontIds.length) return d.abort(live, 'no_budget');

    // Quiet blade: the wake wing, seeded astern — off the exact bearing, in a stone's lee when
    // the field carries one. Its spec is authored on the shape; the plan never knows about it.
    const flankPlan = live.shape.flank;
    const flankSpecs = [];
    if (flankPlan && Array.isArray(flankPlan.archetypes) && flankPlan.archetypes.length) {
      const side = rng() < 0.5 ? -1 : 1;
      const anchor = {
        x: p.pos.x - fx * WAKE_STANDOFF_WU + px * WAKE_LATERAL_WU * side,
        z: p.pos.z - fz * WAKE_STANDOFF_WU + pz * WAKE_LATERAL_WU * side,
      };
      const seed = seedWakeBehindRock(p.pos, anchor, state.entityList);
      if (seed) {
        anchor.x += seed.dx; anchor.z += seed.dz;
        live.data.wakeSeed = seed;
      }
      const [lo, hi] = Array.isArray(flankPlan.size) && flankPlan.size.length === 2 ? flankPlan.size : [2, 2];
      const count = Math.max(1, Math.round(lo + rng() * Math.max(0, hi - lo)));
      const level = frontSpecs[0].level;
      for (let i = 0; i < count; i++) {
        const archetype = i === 0 && flankPlan.anchorArchetype
          ? flankPlan.anchorArchetype
          : flankPlan.archetypes[Math.floor(rng() * flankPlan.archetypes.length) % flankPlan.archetypes.length];
        const along = (i - (count - 1) / 2) * WAKE_SPACING_WU;
        flankSpecs.push({
          archetype,
          combatDoctrineId: ENEMY_BY_ID.get(archetype)?.combatDoctrineId || null,
          level,
          pos: { x: anchor.x + px * along, z: anchor.z + pz * along },
          factionId: live.factionId,
          context: live.shape.context || 'encounter',
          doctrine: flankPlan.doctrine,
          formation: flankPlan.formation,
          passive: true,
          role: 'flank',
        });
      }
    }
    if (flankSpecs.length) d.spawnShips(live, flankSpecs);   // budget fail-open: front carries alone

    live.phase = 'offer';
    live.vars.amount = titheFor(d.cargoValue());
    live.deadlineAt = d.now() + (live.shape.offerS || 14);
    live.data.payHold = 0;
    live.data.springAt = d.now() + SPRING_GRACE_S;
    d.say(live, 'bark', live.shape.bark, live.vars, { primary: true });
    d.offerChoices(live, live.shape.choices.map((c) => c.id), live.shape.timeoutChoice || 'refuse', live.deadlineAt);
  },

  tick(d, live, state, now) {
    const p = d.player();
    if (!p) return d.abort(live, 'no_player');
    if (live.phase === 'offer') {
      const leader = d.entsOf(live, 'squad')[0];
      if (!leader) {
        // The loud blade died without a recorded trigger (collateral, terrain) — the wake wing
        // carries the robbery on: the trap shuts with the honest stamp it earned.
        if (d.aliveCount(live) > 0) return springScissors(d, live, 'player_attack');
        return d.abort(live, 'squad_gone');
      }
      // Physical PAY: cut thrust inside the payment ring of the loud wing (toll contract).
      const speed = p.vel ? Math.hypot(p.vel.x || 0, p.vel.z || 0) : 0;
      const pd2 = dist2(p.pos.x, p.pos.z, leader.pos.x, leader.pos.z);
      if (pd2 <= PAY_DIST_WU * PAY_DIST_WU && speed <= PAY_SPEED_WU) {
        if (++live.data.payHold >= PAY_HOLD_S) return this.choose(d, live, state, 'pay');
      } else live.data.payHold = 0;
      // Silence at the deadline is a refusal — the blades shut themselves.
      if (now >= live.deadlineAt) return this.choose(d, live, state, 'timeout');
      // Reversing hard into the quiet blade inside its ring is an answer too: the shut.
      if (now >= (live.data.springAt || 0)
        && wakeDist2(d, live, p) <= SPRING_RING_WU * SPRING_RING_WU) {
        return springScissors(d, live, 'ignored_demand');
      }
      return;
    }
    if (live.phase === 'conflict') {
      if (d.aliveCount(live) === 0) {
        d.dangerImpulse(live, 'ambush_cleared', -0.02);
        return d.resolve(live, 'cleared');
      }
      // Escaping means clear of BOTH blades — the wake wing is why running is a fight now.
      if (d.minDist2ToSquad(live, p) >= ESCAPE_RING_WU * ESCAPE_RING_WU) {
        d.refundPressure(live, 0.3);
        return d.resolve(live, 'escaped');
      }
    }
  },

  choose(d, live, state, choiceId) {
    if (live.phase !== 'offer') return;
    const ack = (live.shape && live.shape.ackBarks) || {};
    if (choiceId === 'pay') {
      const amount = live.vars.amount | 0;
      if (d.cargoValue() < amount) {
        d.say(live, 'bark', ack.broke || 'toll_broke_ack');
        return this.choose(d, live, state, 'refuse');
      }
      const tithe = d.takeTithe(amount);
      d.rep('faction_reach', 1, 'wake_tithe_paid');
      d.dangerImpulse(live, 'wake_tithe_paid', -0.01);
      d.say(live, 'bark', ack.paid || 'wake_tithe_paid');
      d.despawnAll(live, 22);                            // both blades part; the gap stays open
      return d.resolve(live, 'paid', { vars: { ...live.vars, tithe: tithe.label } });
    }
    if (choiceId === 'run') {
      // Running is not a teleport here: the wake was taken while the player haggled. The
      // choice commits to the breakout — the physical escape ring is the actual exit.
      d.say(live, 'bark', ack.flee || 'toll_flee_ack');
      return springScissors(d, live, 'explicit_refusal');
    }
    if (choiceId === 'timeout') {
      return springScissors(d, live, 'ignored_demand');
    }
    // refuse (and opening fire): the demand collapses into the shut.
    d.say(live, 'bark', ack.refused || 'toll_refused_ack');
    const trigger = choiceId === 'attack' ? 'player_attack' : 'explicit_refusal';
    springScissors(d, live, trigger);
  },

  event(d, live, state, name, p) {
    if (name === 'playerHitSquad' && live.phase === 'offer') {
      // A blade touched is a blade answered — but record WHICH blade: opening on the quiet
      // blade is the read the encounter exists to reward, and the spring says so out loud.
      const hitId = p && p.targetId != null ? p.targetId : null;
      if (hitId != null && live.roles && live.roles[hitId] === 'flank') {
        live.data.tookWakeFirst = true;
      }
      return this.choose(d, live, state, 'attack');
    }
  },
});

export default defineEncounter(trigger, {
  shape: {
    situation: 'ambush',
    place: trigger.zoneTypes,
    twist: 'none',
    actor: 'reaver_pirate',
  },
  motive: 'cargo_extortion',
  engagementTrigger: 'demand_pending',
  factionId: 'faction_reach',
  context: 'encounter',
  title: 'THE SCISSORS',
  primaryLine: 'LANE CONTACT: a Reach wing cuts the lane ahead and quotes the toll. Their other wing is already behind you.',
  // The loud blade: a real hull worth killing on the lane, plus disposable light ammunition.
  squad: {
    anchorArchetype: 'reaver_pirate',
    archetypes: ['wasp_swarmer', 'corsair_raider'],
    size: [3, 4],
    doctrine: 'scavenger',
    formation: 'wedge',
  },
  // The quiet blade: light hulls holding the wake in line abreast — throwable, breakable, and
  // the reason the exit is not free. Killing it first collapses the trap into an ordinary
  // ambush; that read is the counterplay the encounter teaches.
  flank: {
    anchorArchetype: 'corsair_raider',
    archetypes: ['wasp_swarmer'],
    size: [2, 3],
    doctrine: 'scavenger',
    formation: 'line',
  },
  bark: 'scissors_demand',
  offerS: 14,
  timeoutChoice: 'refuse',
  choices: [
    { id: 'pay', label: 'Pay the cut', needs: 'cargo' },
    { id: 'refuse', label: 'Refuse' },
    { id: 'run', label: 'Burn for the gap' },
  ],
  springBark: 'scissors_spring',
  ackBarks: {
    paid: 'scissors_paid',
    refused: 'scissors_refused',
    flee: 'scissors_run',
  },
  telegraph: 'The wake wing lights its burns — the exit was theirs before the hail.',
  receipts: {
    paid: 'CUT PAID — both blades part and the gap stays open for payers.',
    cleared: 'SCISSORS SHUT — the pocket is quiet and both wings are scrap.',
    escaped: 'THREADED — you broke through the blades; the belt keeps their wrecks.',
  },
});
