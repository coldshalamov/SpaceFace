// 353 — THE WAKE (CR-CHAIN braid: hitch on a working miner).
// A loaded ore mule is mid-leg on a real haul to its drop pocket — slow, heavy, honest
// work. Two Reach shadows pace it at range, waiting for it to clear the lane's eyes.
// The braid is the player's hitch: latch a line onto the working hull and it tows you
// down its real route — the tow contract is the ordinary one (a dynamic target's COM).
// The discovery: the moment you're on the wake, the shadows spring — riding the miner's
// line is what exposes the tail. Never hitch and the leg runs quiet; the shadow peels
// off unfought and nobody ever knows it was there.
import { deepFreeze, defineEncounter } from './catalog.js';

export const encounterOrder = 353;
export const trigger = deepFreeze({
  id: 'wake_hitch',
  tier: 'minor',
  deck: 'combat',
  weight: 0.9,
  zoneTypes: ['trade_lane', 'mining_belt', 'refinery_approach'],
  script: 'selfRegistered',
  fallbackScript: 'whisper',
  pressureCost: 30,
  cooldownS: 760,
  proximity: true,
  fireWithinWu: 380,
  gates: {
    maxSecurity: 0.7,
    minSectorTier: 1,
    storyBeatMin: 1,
  },
});

const LEG_WU = 2200;            // the mule's haul leg — long enough that hitching is transit
const MULE_HAUL_SPEED = 38;     // loaded: slower than the player's cruise, honest weight
const SHADOW_RANGE_WU = 850;    // the tail holds this far off the line until springing
const SHADOW_INTERCEPT_SPEED = 96;
const ARRIVAL_RADIUS_WU = 140;  // reaching the drop pocket resolves the leg
const LEG_DEADLINE_S = 130;

// Same contract as 344/350/351/352: resolving must not stamp the cast for despawn.
function releaseCast(live) {
  if (!live) return;
  if (Array.isArray(live.ids)) live.ids.length = 0;
  if (live.roles && typeof live.roles === 'object') {
    for (const id of Object.keys(live.roles)) delete live.roles[id];
  }
}

// Is the player physically hitched to the mule? The ordinary attachment table is the
// truth — a live rope edge with the player as owner and the mule as target.
function playerHitched(state, playerId, muleId) {
  const byId = state.combat && state.combat.attachments && state.combat.attachments.byId;
  if (!byId || typeof byId !== 'object') return false;
  for (const att of Object.values(byId)) {
    if (att && att.state === 'active' && att.ownerId === playerId && att.targetId === muleId) {
      return true;
    }
  }
  return false;
}

export const runtime = Object.freeze({
  fire(d, live, state) {
    live.deadlineAt = d.now() + (live.shape.deadlineS || LEG_DEADLINE_S);
    const center = live.plan && live.plan.zoneCenter;
    if (!center || !Number.isFinite(center.x) || !Number.isFinite(center.z)) {
      return d.abort(live, 'no_anchor');
    }
    const ships = live.plan.ships;
    const muleSpec = ships.find((sh) => sh && sh.role === 'hauler');
    const shadowSpecs = ships.filter((sh) => sh && sh.role === 'raider');
    if (!muleSpec || !shadowSpecs.length) return d.abort(live, 'no_cast');

    const rng = d.stream(live, 'wake_layout');
    const legAngle = rng() * Math.PI * 2;
    const legDir = { x: Math.cos(legAngle), z: Math.sin(legAngle) };
    const legPerp = { x: -legDir.z, z: legDir.x };

    // The mule sits on the anchor mid-leg; its drop pocket is a real marker at the far
    // end of the leg — hitching it is how you learn where it was going.
    muleSpec.pos.x = center.x;
    muleSpec.pos.z = center.z;
    const drop = {
      x: center.x + legDir.x * LEG_WU,
      z: center.z + legDir.z * LEG_WU,
    };
    live.data.wake = { legDir, drop, sprung: false };

    // The shadows hold off the line astern-lateral — close enough to read as drift
    // traffic, far enough that the mule hasn't paid them off as a threat.
    let ri = 0;
    for (const spec of shadowSpecs) {
      const lateral = (ri === 0 ? 1 : -1) * (0.35 + rng() * 0.15);
      spec.pos.x = center.x - legDir.x * 260 + legPerp.x * SHADOW_RANGE_WU * lateral;
      spec.pos.z = center.z - legDir.z * 260 + legPerp.z * SHADOW_RANGE_WU * lateral;
      ri++;
    }

    const ids = d.spawnShips(live, ships);
    if (!ids.length || d.aliveCount(live, 'hauler') < 1 || d.aliveCount(live, 'raider') < 1) {
      return d.abort(live, 'no_budget');
    }

    const mule = d.entsOf(live, 'hauler')[0];
    mule.vel = { x: legDir.x * MULE_HAUL_SPEED, z: legDir.z * MULE_HAUL_SPEED };
    const mdata = mule.data || (mule.data = {});
    const mai = mdata.ai || (mdata.ai = {});
    mai.jobKind = 'miner';
    mai.moraleImmune = true; // it hauls on through the spring — a working hull, not a fighter
    mdata.scanLabel = 'ORE MULE — LOADED, MID-LEG';
    mdata.cargo = { cmdty_ore_goldium: 6 };

    // The shadows hold formation and wait: passive, uncommitted, watching the line.
    for (const shadow of d.entsOf(live, 'raider')) {
      const sdata = shadow.data || (shadow.data = {});
      const sai = sdata.ai || (sdata.ai = {});
      sai.passive = true;
      sai.holdPosition = true;
      sdata.scanLabel = 'LANE DRIFTER';
    }

    // The drop pocket: a real marker at the end of the leg so the route is a place.
    const beacon = d.spawnProp(live, {
      type: 'beacon', pos: drop, radius: 12,
      scanLabel: 'ORE DROP — CLAIM POCKET',
      tetherable: false,
    });
    if (beacon) live.data.wake.dropBeaconId = beacon.id;

    live.phase = 'conflict';
    d.say(live, 'alert',
      'LANE WATCH: a loaded mule is mid-leg for a drop pocket — something is pacing its wake.',
      null, { primary: true, literal: true });
    d.emit('comms:log', {
      from: 'ORE MULE',
      text: 'Long haul, heavy hold. Mind the wake if you ride it — I have not shaken what is back there.',
      kind: 'encounter',
    });
  },

  tick(d, live, state, now) {
    if (live.phase === 'done') return;
    const mule = d.entsOf(live, 'hauler')[0] || null;
    const shadows = d.entsOf(live, 'raider');
    const wake = live.data.wake;

    // The braid: hitching the working hull springs the tail. One player latch on the
    // mule and the shadows commit — the tow is what exposes them.
    if (wake && !wake.sprung && mule) {
      const player = d.player();
      const hitched = player && playerHitched(state, player.id, mule.id);
      const muleHurt = Number.isFinite(mule.hull) && Number.isFinite(mule.hullMax)
        && mule.hull < mule.hullMax;
      const shadowDown = shadows.some((s) => s && s.alive === false)
        || shadows.some((s) => s && Number.isFinite(s.hull) && Number.isFinite(s.hullMax) && s.hull < s.hullMax);
      if (hitched || muleHurt || shadowDown) {
        wake.sprung = true;
        for (const shadow of shadows) {
          if (!shadow || shadow.alive === false) continue;
          const sdata = shadow.data || (shadow.data = {});
          const sai = sdata.ai || (sdata.ai = {});
          sai.passive = false;
          sai.holdPosition = false;
          sdata.scanLabel = 'REACH SHADOW';
          (sdata.combat || (sdata.combat = {})).targetId = hitched && player ? player.id : mule.id;
          sai.targetId = hitched && player ? player.id : mule.id;
          sai.pursueTargetId = mule.id;
          if (mule && shadow.pos && mule.pos) {
            const dx = mule.pos.x - shadow.pos.x, dz = mule.pos.z - shadow.pos.z;
            const len = Math.hypot(dx, dz) || 1;
            shadow.vel = { x: (dx / len) * SHADOW_INTERCEPT_SPEED, z: (dz / len) * SHADOW_INTERCEPT_SPEED };
          }
        }
        d.emit('comms:log', {
          from: 'REACH SHADOW',
          text: hitched
            ? 'That is not ballast on the line. Cut the wake-rider loose — take them both.'
            : 'No more pacing. Take the mule now.',
          kind: 'encounter',
        });
        d.emit('encounter:hostileCommitted', { encounterId: live.id, reason: 'wake_sprung' });
      }
    }

    if (!mule) {
      releaseCast(live);
      return d.resolve(live, 'wake_down', { speak: true });
    }

    // The mule completes its leg: reaching the drop pocket resolves quiet.
    if (wake && wake.drop && mule.pos) {
      const dx = mule.pos.x - wake.drop.x, dz = mule.pos.z - wake.drop.z;
      if (dx * dx + dz * dz <= ARRIVAL_RADIUS_WU * ARRIVAL_RADIUS_WU) {
        if (wake.sprung && d.aliveCount(live, 'raider') > 0) {
          // It limped in under fire — arrival still resolves, tighter receipt.
          releaseCast(live);
          return d.resolve(live, 'made_leg', { speak: true });
        }
        d.rep('faction_mts', 2, 'leg_made');
        releaseCast(live);
        return d.resolve(live, 'made_leg', { speak: true });
      }
    }

    if (wake && wake.sprung && d.aliveCount(live, 'raider') === 0) {
      d.grant(170, 'wake:shadows_cleared');
      d.rep('faction_mts', 3, 'wake_cleared');
      d.emit('comms:log', {
        from: 'ORE MULE',
        text: 'The tail is gone. Whatever you were doing back there — it worked. The drop owes you.',
        kind: 'encounter',
      });
      releaseCast(live);
      return d.resolve(live, 'wake_cleared', { speak: true });
    }

    if (now >= live.deadlineAt) {
      releaseCast(live);
      return d.resolve(live, wake && wake.sprung ? 'press_over' : 'quiet_leg', { speak: false });
    }
  },
});

export default defineEncounter(trigger, {
  shape: {
    situation: 'convoy',
    place: trigger.zoneTypes,
    twist: 'none',
    actor: 'mule_trader',
  },
  motive: 'cargo_raid',
  engagementTrigger: 'authorized_hostile_spawn',
  factionId: 'faction_reach',
  context: 'encounter',
  title: 'THE WAKE',
  primaryLine: 'LANE WATCH: a loaded mule is mid-leg for a drop pocket — something is pacing its wake.',
  squad: {
    archetypes: ['corsair_raider', 'wasp_swarmer'],
    size: [2, 2],
    doctrine: 'thief',
    formation: 'loose',
  },
  civilian: {
    archetypes: ['mule_trader'],
    size: [1, 1],
    factionId: 'faction_mts',
    context: 'civilian',
    team: 2,
    passive: true,
  },
  bark: null,
  telegraph: 'A loaded mule runs a long leg — and something patient is pacing its wake.',
  deadlineS: LEG_DEADLINE_S,
  aftermath: {
    flee: 'The mule runs its leg out. The wake goes quiet.',
    kill: 'The wake empties. The drop pocket still waits on its mark.',
  },
  receipts: {
    wake_cleared: 'WAKE CLEARED — the shadows are off the line. The mule owes the rider.',
    wake_down: 'MULE DOWN — the wake ends here. The drop pocket keeps its marker.',
    made_leg: 'LEG MADE — the mule reached its pocket. The shadows had their chance.',
    quiet_leg: 'The leg ran quiet. Whatever paced the wake peeled off unseen.',
    press_over: 'The sprung press burned out. The lane holds its silence again.',
  },
});
