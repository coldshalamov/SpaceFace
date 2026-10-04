// 362 — THE SALVAGE WATCH. The living-world chain the vision demands, played as a scene:
// a freighter dies on a fringe lane, the station actually ANSWERS — a yard tug burns out to
// patch the drive — and raiders decide two wrecks are better than one. The player can defend
// the work, rob the spill, or make everything worse. No consent dialog: the watch is already
// open when the beat fires, exactly like the opening raid.
import { deepFreeze, defineEncounter } from './catalog.js';
import { makeShipEntitySpec } from '../../systems/ships.js';

export const encounterOrder = 362;
export const trigger = deepFreeze({
  id: 'salvage_watch',
  tier: 'minor',
  deck: 'combat',
  weight: 1.2,
  zoneTypes: ['trade_lane', 'civilian_core', 'refinery_approach'],
  // Freight-event routing (pickup:collected, subsystemDisabled, entityGone) rides the convoy
  // family exactly like 344; this module's self-registered runtime wins fire/tick dispatch
  // by shapeId.
  script: 'convoy',
  fallbackScript: 'convoy',
  pressureCost: 15,
  cooldownS: 1800,
  proximity: true,
  gates: {
    maxSecurity: 0.8, // lawful cores have patrols for this; the fringe has a tug and you
  },
});

// The raid dissolving must not take its cast with it (same release as 344): ids/roles detach
// from the live record so the released ships keep flying as ordinary world entities.
function releaseSquadToWorld(live) {
  if (!live) return;
  if (Array.isArray(live.ids)) live.ids.length = 0;
  if (live.roles && typeof live.roles === 'object') {
    for (const id of Object.keys(live.roles)) delete live.roles[id];
  }
}

const REPAIR_NEED_S = 55;      // open work the player is defending
const ARRIVE_BURN_S = 8;       // the tug closes the last stretch before work opens
const ESCALATE_AT_S = 22;      // probe → commit on the tug itself
const TUG_PRESS_WU = 240;      // raiders this close stall the work: patching under fire is a lie

function nearestEnemyDistTo(d, live, body) {
  if (!body || !body.pos) return Infinity;
  let best = Infinity;
  for (const raider of d.entsOf(live, 'raider')) {
    if (!raider || !raider.pos || !raider.data || raider.data.despawnAt != null) continue;
    const dx = raider.pos.x - body.pos.x;
    const dz = raider.pos.z - body.pos.z;
    const dist = Math.hypot(dx, dz);
    if (dist < best) best = dist;
  }
  return best;
}

export const runtime = Object.freeze({
  fire(d, live, state) {
    live.deadlineAt = d.now() + 170;
    live.data.watch = { phase: 'arrive', t: 0, escalated: false, halfSaid: false, stallSaid: false, tenderLost: false };

    // The casualty rides in already broken: one plan tweak pre-spawn, the ordinary budget
    // grant does the rest. Its volatile lot is the physical stake — destruction spills it
    // through the same custody path the opening raid uses.
    for (const sh of (live.plan && live.plan.ships) || []) {
      if (sh.role === 'hauler') sh.hullFrac = 0.16;
      if (sh.role === 'escort') {
        // The station's answer is yard stock, not an enemy archetype: a complete ship spec
        // gives the tug its real hull identity (H8 pattern). It must not inherit the PD
        // screen's combat doctrine — a repair tug does not fight.
        sh.combatDoctrineId = null;
        sh.entitySpec = makeShipEntitySpec('ship_hawser', {
          team: 2,
          factionId: sh.factionId || 'faction_mts',
          pos: sh.pos,
        });
      }
    }

    const ids = d.spawnShips(live, live.plan.ships);
    // The premise needs all three parts: a casualty, a rescue, and a threat. A partial grant
    // that lands fewer resolves nothing — abort leaves the ledger honest.
    if (!ids.length || d.aliveCount(live, 'hauler') < 1 || d.aliveCount(live, 'escort') < 1
      || d.aliveCount(live, 'raider') < 1) {
      return d.abort(live, 'no_budget');
    }

    const freighter = d.entsOf(live, 'hauler')[0];
    const tug = d.entsOf(live, 'escort')[0];

    // Stake: a small volatile lot. Cookable class, physical spill, no predation machinery —
    // the pods belong to whoever is there when the hull breaks.
    if (freighter) {
      const qty = 4 + Math.round(d.stream(live, 'cargo')() * 3);
      const fdata = freighter.data || (freighter.data = {});
      fdata.jobKind = 'hauler';
      fdata.cargo = { cmdty_fuel_cells: qty };
      fdata.bountyCr = 0;
      fdata.loot = null;
      fdata.freightRewardOwner = 'manifest_custody';
      live.data.freightManifest = {
        manifestId: `fm_watch_${live.id}`,
        freighterKey: `encounter:${live.id}`,
        role: 'hauler',
        lines: [{ commodityId: 'cmdty_fuel_cells', qty }],
        totalQty: qty,
      };
      fdata.cargoManifest = {
        manifestId: live.data.freightManifest.manifestId,
        freighterKey: live.data.freightManifest.freighterKey,
        role: 'hauler',
        lines: [{ commodityId: 'cmdty_fuel_cells', qty }],
        totalQty: qty,
      };
    }

    // Raiders are committed on the casualty from the first frame (the raid is already
    // happening), the same focus-stamp the opening raid uses.
    for (const raider of d.entsOf(live, 'raider')) {
      const data = raider.data || (raider.data = {});
      if (data.ai) data.ai.targetId = freighter.id;
      (data.combat || (data.combat = {})).targetId = freighter.id;
    }

    // The tug wants to be where the work is. If its AI runs it burns in; if the passive flag
    // holds it, it spawned close enough that the scene still reads.
    if (tug && freighter) {
      const tdata = tug.data || (tug.data = {});
      tdata.jobKind = 'tender';
      tdata.bountyCr = 0;
      tdata.loot = null;
      tdata.ai = tdata.ai || {};
      tdata.ai.targetId = freighter.id;
      tdata.watchTugFor = freighter.id;
    }

    live.phase = 'conflict';
    d.say(live, 'alert',
      'MULE: Mayday, mayday — drive coupling is gone, hold is intact, I am not moving. Anyone on the watch channel…',
      null, { literal: true, primary: true });
    d.say(live, 'info',
      'STATION WATCH: Copy the mayday. Yard tug is burning to your marker. Salvage watch is open — armed escort appreciated, pilot.',
      null, { literal: true });
  },

  tick(d, live, state, now) {
    if (live.phase === 'done') return;
    const w = live.data.watch || (live.data.watch = { phase: 'arrive', t: 0, escalated: false, halfSaid: false, stallSaid: false, tenderLost: false });
    const step = Math.max(0, now - (w.lastNow == null ? now : w.lastNow));
    w.lastNow = now;

    const freighter = d.entsOf(live, 'hauler')[0];
    const tug = d.entsOf(live, 'escort')[0];
    const freighterAlive = d.aliveCount(live, 'hauler') > 0;
    const tugAlive = !!tug && tug.hull > 0 && !(tug.data && tug.data.despawnAt != null);
    const raidersAlive = d.aliveCount(live, 'raider') > 0;

    // Custody in play outranks the watch: spilled pods mean somebody is still flying.
    const custody = live.data.freightCargoCustody;
    const custodyOpen = !!(custody && custody.terminal !== true);

    // ── resolution ladder ──────────────────────────────────────────────────────────────
    if (!freighterAlive) {
      if (custodyOpen) return;
      // Casualty broke up — the watch becomes a disputed salvage field. Raiders take what
      // they can reach and leave; the tug marks the spot and goes home.
      if (tugAlive && tug.data) tug.data.despawnAt = now + 14;
      if (raidersAlive) d.despawnAll(live, 16, 'raider');
      if (!w.casualtyNews) {
        w.casualtyNews = true;
        d.emit('news:publish', {
          text: 'LANE CASUALTY BROKE UP UNDER WATCH: fuel-cell hold spilled across the lane. Salvage rights in dispute before the wreck stopped tumbling.',
          kind: 'incidents', source: 'watch-relay', sourceRef: `salvage_watch:${live.id}`,
          eventId: `salvage_watch:${live.id}`,
        });
      }
      releaseSquadToWorld(live);
      return d.resolve(live, 'casualty_lost', { speak: true });
    }

    if (!tugAlive && !w.tenderLost) {
      // The tug is the watch. Saying it once: the rep hit and the headline are the station's
      // memory of losing a hull on a mayday answer — never a per-tick drumbeat.
      w.tenderLost = true;
      d.rep('faction_mts', -4, 'salvage_watch_tender_lost');
      d.emit('news:publish', {
        text: 'YARD TUG LOST ON THE WATCH: the station answers maydays with hulls, and today the lane kept one.',
        kind: 'incidents', source: 'watch-relay', sourceRef: `salvage_watch:${live.id}`,
        eventId: `salvage_watch:${live.id}`,
      });
    }

    if (!tugAlive) {
      // No rescue left. Raiders go back to stripping the casualty; the watch resolves when
      // the stripping ends or the deadline closes the channel.
      if (raidersAlive && freighter) {
        for (const raider of d.entsOf(live, 'raider')) {
          const data = raider.data || (raider.data = {});
          if (data.ai) data.ai.targetId = freighter.id;
          (data.combat || (data.combat = {})).targetId = freighter.id;
        }
      }
      if (!raidersAlive || now >= live.deadlineAt) {
        releaseSquadToWorld(live);
        return d.resolve(live, 'tender_lost', { speak: true });
      }
      return; // the stripping continues on-glass; the player can still answer it
    }

    if (!raidersAlive && w.phase !== 'work') {
      // Threat answered early — the tug gets its window and the scene becomes what it was
      // always supposed to be: work, watched.
      w.phase = 'work';
      d.say(live, 'bark',
        'TUG: Lane is quiet. Opening the coupling — give me a minute and she breathes again.',
        null, { literal: true });
    }

    // ── the watch itself ───────────────────────────────────────────────────────────────
    if (w.phase !== 'work') {
      w.t += step;
      if (w.t >= ARRIVE_BURN_S) {
        w.phase = 'work';
        w.t = 0;
        d.say(live, 'bark',
          'TUG: On scene. Patch job, not a miracle — keep the lane clear while I cut.',
          null, { literal: true });
      }
    }

    // The complication the whole beat exists for: raiders stop nibbling at a dead ship and
    // go for the rescue. Killing the tender is the unforgivable loss here.
    if (!w.escalated && raidersAlive && w.lastNow - live.startedAt >= ESCALATE_AT_S && tug) {
      w.escalated = true;
      for (const raider of d.entsOf(live, 'raider')) {
        const data = raider.data || (raider.data = {});
        if (data.ai) data.ai.targetId = tug.id;
        (data.combat || (data.combat = {})).targetId = tug.id;
      }
      d.say(live, 'alert',
        'RAIDER: Forget the corpse. Kill the rescue — the station stops answering after this.',
        null, { literal: true });
    }

    if (w.phase === 'work') {
      // Work advances unless raiders are pressed onto the tug — that interruption is the
      // defend beat, and it is honest: you cannot patch under fire.
      const pressed = nearestEnemyDistTo(d, live, tug) < TUG_PRESS_WU;
      if (!pressed) {
        w.t += step;
        w.stalled = false;
        if (!w.halfSaid && w.t >= REPAIR_NEED_S * 0.5) {
          w.halfSaid = true;
          d.say(live, 'bark',
            'TUG: Half patched. Whatever you are doing, keep doing it.',
            null, { literal: true });
        }
      } else if (!w.stallSaid) {
        w.stallSaid = true;
        d.say(live, 'danger',
          'TUG: I cannot work with them on me! Peel them off or we are both cargo!',
          null, { literal: true });
      }
    }

    if (w.t >= REPAIR_NEED_S) {
      // The payoff: the freighter leaves under its own power, paid and named on the wire.
      if (freighter && freighter.data) {
        freighter.hull = freighter.hullMax;
        freighter.data.despawnAt = now + 20;
      }
      if (tug && tug.data) tug.data.despawnAt = now + 20;
      d.grant(300, 'salvage_watch:repaired');
      d.rep('faction_mts', 6, 'salvage_watch_repaired');
      d.emit('comms:log', {
        from: 'MTS MULE',
        text: 'Drive is LIVE. Watch bounty is on its way, pilot — the station heard everything you did out here.',
        kind: 'encounter',
      });
      d.emit('news:publish', {
        text: 'SALVAGE WATCH CLOSED CLEAN: lane casualty repaired under escort and hauling again. The watch channel names its escort.',
        kind: 'incidents', source: 'watch-relay', sourceRef: `salvage_watch:${live.id}`,
        eventId: `salvage_watch:${live.id}`,
      });
      releaseSquadToWorld(live);
      return d.resolve(live, 'repaired', { speak: true });
    }

    if (now >= live.deadlineAt) {
      // Watch closes at the deadline whatever the state. Everything still alive stays
      // alive — released to the world, not deleted.
      releaseSquadToWorld(live);
      return d.resolve(live, w.tenderLost ? 'tender_lost' : 'watch_over', { speak: true });
    }
  },

});

export default defineEncounter(trigger, {
  shape: {
    situation: 'distress',
    place: trigger.zoneTypes,
    twist: 'none',
    actor: 'reaver_pirate',
  },
  motive: 'wreck_stripping',
  engagementTrigger: 'authorized_hostile_spawn',
  factionId: 'faction_reach',
  context: 'encounter',
  title: 'THE SALVAGE WATCH',
  primaryLine: 'WATCH RELAY: Casualty on the lane — drive dead, cargo intact, rescue inbound. Raiders already sniffing the wreck.',
  squad: {
    anchorArchetype: 'reaver_pirate',
    archetypes: ['reaver_pirate', 'corsair_raider'],
    size: [2, 3],
    clusterRadius: 110,
    minSeparation: 42,
    doctrine: 'thief',
    formation: 'wedge',
  },
  civilian: {
    archetypes: ['mule_trader'],
    size: [1, 1],
    factionId: 'faction_mts',
    context: 'civilian',
    team: 2,
    passive: true,
  },
  // The station's answer arrives as a third cast: yard stock, the Hawser-class tug the
  // station actually owns. Identity rides a complete ship spec set at fire time.
  escort: {
    archetypes: ['pd_screen_escort'],
    size: [1, 1],
    factionId: 'faction_mts',
    context: 'civilian',
    team: 2,
    passive: true,
  },
  receipts: {
    repaired: 'WATCH CLOSED — the mule burned home under its own power. The station pays for hulls it keeps, and it heard your name on the channel.',
    tender_lost: 'THE TUG IS GONE — the station answers maydays with hulls, and this lane kept one. No rescue is coming for the mule.',
    casualty_lost: 'THE CASUALTY BROKE UP — spilled fuel cells are floating free on the lane. The tug marked the field and went home quiet.',
    watch_over: 'THE WATCH CLOSED — the tug had to break off. Whatever the lane kept, it kept.',
  },
});
