// 363 — THE GRANDEE. The vision's texture list, played: "a very large tanker whose entire
// purpose is to make everything else feel small. A famous ship passing through." The Grandee
// of Helion is the lanes' one celebrity — an old Atlas-class heavy hauler the whole pocket
// knows, making a rare announced run with her standing escort. You can pass her and get the
// hail, swing off her mass with the Massline (she is the heaviest body in the sky when she
// comes), harass her and meet the law, or kill her and be remembered for the wrong reasons.
//
// NOT a lane-contact pool entry: every sector pick pool is pinned by shipped tests, and the
// Cinder Run law says never displace an authored cast. She arrives through the encounter
// scheduler instead — rare, announced, and gone by the deadline, like a real transit.
import { deepFreeze, defineEncounter } from './catalog.js';
import { makeShipEntitySpec } from '../../systems/ships.js';

export const encounterOrder = 365;
export const trigger = deepFreeze({
  id: 'the_grandee_transit',
  tier: 'minor',
  deck: 'civilian',
  weight: 0.8,
  zoneTypes: ['trade_lane', 'civilian_core'],
  pressureCost: 10,
  cooldownS: 21600,
  proximity: true,
  gates: {
    storyBeatMin: 2, // she is a later-hour famous face, not a first-day novelty
  },
});

const CROSS_HOLD_WU = 160;      // "close enough to the pathfinder" → she coasts to a hold
const CROSS_MAX_S = 60;         // the crossing never outlives its welcome
const HOLD_S = 45;              // she holds at the pocket before the season turns

function releaseToWorld(live) {
  if (!live) return;
  if (Array.isArray(live.ids)) live.ids.length = 0;
  if (live.roles && typeof live.roles === 'object') {
    for (const id of Object.keys(live.roles)) delete live.roles[id];
  }
}

export const runtime = Object.freeze({
  fire(d, live, state) {
    live.deadlineAt = d.now() + CROSS_MAX_S + HOLD_S + 40;
    live.data.grandee = { phase: 'crossing', hitSeen: false, held: false, saidHold: false };

    // Identity rides the fire path (same pattern as 344/362): the squad's anchor becomes the
    // Grandee herself — Atlas hull, the biggest civilian body the kit owns.
    const ships = (live.plan && live.plan.ships) || [];
    let pathfinder = null;
    for (const sh of ships) {
      if (sh.compositionRole === 'identity_anchor') {
        sh.combatDoctrineId = null;
        sh.entitySpec = makeShipEntitySpec('ship_atlas', {
          team: 2,
          factionId: sh.factionId || 'faction_mts',
          pos: sh.pos,
        });
      } else if (sh.role === 'escort' && !pathfinder) {
        pathfinder = sh;
      }
    }

    const ids = d.spawnShips(live, ships);
    // The transit is the premise: the Grandee AND her standing escort, or nothing.
    if (!ids.length || d.aliveCount(live, 'squad') < 1 || d.aliveCount(live, 'escort') < 1) {
      return d.abort(live, 'no_budget');
    }

    const grandee = d.entsOf(live, 'squad')[0];
    const escorts = d.entsOf(live, 'escort');
    if (!grandee || !escorts.length) return d.abort(live, 'no_cast');

    if (grandee.data) {
      grandee.data.name = 'The Grandee of Helion';
      grandee.data.callsign = 'GRANDEE-1';
      grandee.data.gimmick = 'grand-transit';
      grandee.data.scanLabel = 'Atlas-class · GRANDEE-1';
      grandee.data.laneGrandee = true;
      grandee.data.jobKind = 'hauler';
      grandee.data.bountyCr = 0;
      grandee.data.loot = null;
    }
    live.data.grandeeId = grandee.id;
    live.data.grandeeHull0 = grandee.hull;

    // The crossing: she burns at her pathfinder escort; the escort pair holds formation on
    // her. When the gap closes, this runtime clears the targets and she coasts to a hold.
    if (escorts[0] && grandee.data) {
      grandee.data.ai = grandee.data.ai || {};
      grandee.data.ai.targetId = escorts[0].id;
    }
    for (const esc of escorts) {
      if (!esc || !esc.data) continue;
      esc.data.ai = esc.data.ai || {};
      esc.data.ai.targetId = grandee.id;
    }

    live.phase = 'conflict';
    d.say(live, 'alert',
      'LANE CONTROL: Attention pocket traffic — the Grandee of Helion is making the run today. Give her room; she does not corner.',
      null, { literal: true, primary: true });
    d.emit('news:publish', {
      text: 'THE GRANDEE IS RUNNING: the old Atlas celebrity crossed the gate with her standing escort. Half the pocket will claim they saw her first.',
      kind: 'traffic', source: 'lane-control', sourceRef: `grandee:${live.id}`,
      eventId: `grandee:inbound:${live.id}`,
    });
  },

  tick(d, live, state, now) {
    if (live.phase === 'done') return;
    const w = live.data.grandee || (live.data.grandee = { phase: 'crossing', hitSeen: false, held: false, saidHold: false });
    const grandee = d.entsOf(live, 'squad')[0];
    if (!grandee) {
      // The famous ship is gone. Whatever did it, the pocket remembers. Surviving escorts
      // burn out on the ordinary despawn path instead of lingering as stray law traffic.
      for (const esc of d.entsOf(live, 'escort')) {
        if (esc && esc.data && esc.data.despawnAt == null) esc.data.despawnAt = now + 30;
      }
      releaseToWorld(live);
      d.rep('faction_mts', -8, 'grandee_lost');
      d.emit('news:publish', {
        text: 'THE GRANDEE IS GONE: the Grandee of Helion did not clear the pocket. The lane she named is quieter, and nobody is pretending otherwise.',
        kind: 'incidents', source: 'lane-control', sourceRef: `grandee:${live.id}`,
        eventId: `grandee:lost:${live.id}`,
      });
      return d.resolve(live, 'grandee_lost', { speak: true });
    }
    if (!w.hitSeen && live.data.grandeeHull0 != null && grandee.hull < live.data.grandeeHull0) {
      w.hitSeen = true;
      d.say(live, 'danger',
        'GRANDEE ESCORT: Break off! You are harassing a civilian run — every gun on this formation has your transponder now.',
        null, { literal: true });
    }

    const escorts = d.entsOf(live, 'escort').filter((e) => e && e.alive !== false);

    if (w.phase === 'crossing') {
      w.t = (w.t || 0) + (w.lastNow == null ? 0 : Math.max(0, now - w.lastNow));
      const pathfinder = escorts[0];
      let close = false;
      if (pathfinder && pathfinder.pos && grandee.pos) {
        const dx = grandee.pos.x - pathfinder.pos.x;
        const dz = grandee.pos.z - pathfinder.pos.z;
        close = (dx * dx + dz * dz) <= CROSS_HOLD_WU * CROSS_HOLD_WU;
      }
      if (close || w.t >= CROSS_MAX_S) {
        w.phase = 'holding';
        w.t = 0;
        // She coasts: the crossing is done, so the formation lets the drive answer.
        if (grandee.data && grandee.data.ai) grandee.data.ai.targetId = null;
        for (const esc of escorts) {
          if (esc.data && esc.data.ai) esc.data.ai.targetId = null;
        }
      }
    } else if (w.phase === 'holding') {
      w.t = (w.t || 0) + (w.lastNow == null ? 0 : Math.max(0, now - w.lastNow));
      if (!w.saidHold && w.t >= 6) {
        w.saidHold = true;
        d.say(live, 'bark',
          'GRANDEE: Holding at the pocket this hour. Need a pull, ping me — after this I am gone till the season turns.',
          null, { literal: true });
      }
      if (w.t >= HOLD_S) {
        // The season turns: the formation is released to the world and burns out on its own.
        if (grandee.data) grandee.data.despawnAt = now + 25;
        for (const esc of escorts) {
          if (esc && esc.data) esc.data.despawnAt = now + 25;
        }
        d.emit('news:publish', {
          text: 'GRANDEE CLEARED THE POCKET: the run is done and the escort formation burned out on schedule. See you next season, old girl.',
          kind: 'traffic', source: 'lane-control', sourceRef: `grandee:${live.id}`,
          eventId: `grandee:cleared:${live.id}`,
        });
        releaseToWorld(live);
        return d.resolve(live, w.hitSeen ? 'transit_harried' : 'transit_over', { speak: true });
      }
    }
    w.lastNow = now;
  },

});

export default defineEncounter(trigger, {
  shape: {
    situation: 'convoy',
    place: trigger.zoneTypes,
    twist: 'named',
    actor: 'faction_mts',
  },
  motive: 'celebrity_transit',
  engagementTrigger: 'authorized_hostile_spawn',
  factionId: 'faction_mts',
  context: 'civilian',
  title: 'THE GRANDEE',
  primaryLine: 'LANE CONTROL: The Grandee of Helion is making the run today. Give her room; she does not corner.',
  // One squad, two identities: the anchor becomes the Grandee (complete ship spec at fire
  // time), the escorts keep their lawful patrol hulls and their guns.
  squad: {
    anchorArchetype: 'mule_trader',
    archetypes: ['mule_trader'],
    size: [1, 1],
    clusterRadius: 40,
    doctrine: null,
    formation: 'diamond',
  },
  escort: {
    archetypes: ['warden_escort', 'patrol_lawman'],
    size: [2, 2],
    factionId: 'faction_scn',
    context: 'patrol',
    team: 2,
    passive: false,
  },
  receipts: {
    transit_over: 'THE GRANDEE CLEARED — the famous run came and went clean. Half the bar will say they flew wing on her.',
    transit_harried: 'THE GRANDEE CLEARED ANGRY — she took fire in your pocket and the escort logged every transponder that lit up.',
    grandee_lost: 'THE GRANDEE IS GONE — the lane\'s one celebrity did not clear the pocket. Whatever your reason, the story is now about you.',
  },
});
