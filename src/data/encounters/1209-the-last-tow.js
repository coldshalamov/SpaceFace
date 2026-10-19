// INF-09 — THE LAST TOW. The aftermath ledger keeps a perfect memory of the dead — victim name,
// killer name, estate residue, the drift of the hulk — and until now nobody in the world ever did
// anything with it. Wreck markers were raw material: the player could strip the dead, scavengers
// could strip the dead, but no one ever came FOR the dead. A named hauler dies on the freight
// spine, the ledger knows her name and her line, and her estate simply rots in the water.
//
// This beat is the missing duty: when the sector's aftermath ledger holds a fresh recorded kill,
// the Meridian Traffic Syndicate's retrieval contract fires — a collection detail (a winch tug and
// an honor guard) flies out to the dead hull's real death site to haul the estate's spilled freight
// home. Reach corpse-robbers hear the same filing and come to strip the grave first. The scene is
// anchored on the aftermath marker itself — the wreck the ledger materializes, not a prop the
// encounter invents — so the pods the detail winches are the dead ship's actual estate.
//
// Every verb reads the world: the estate pods are real owner-stamped jettisoned freight (the
// stolen-cargo law path prices a witnessed grab itself), the robbers are zone_hostile hulls
// (dropping them is lawful work that pays a contract fee), a laden robber carries its take in the
// ordinary kill-spill schema (killing it re-drops the pods physically), the guard is a lawful
// witness (murdering the detail is adjudicated murder, and the desk answers it), and the player
// can haul a loose pod to the tug's line themselves for a hand-back fee.
import { deepFreeze, defineEncounter } from './catalog.js';
import { ActivityKind, RulesOfEngagement, setEntityDoctrine } from '../../ai/doctrine.js';
import {
  alive, entityById, priorOutcome, publishSituationNews, settleSituation,
} from '../../systems/crSituationKit.js';
import { aftermathForSector, isPlayerWreckMarker } from '../../systems/aftermathWrecks.js';

export const encounterOrder = 1209;
export const trigger = deepFreeze({
  id: 'the_last_tow',
  tier: 'minor',
  deck: 'combat',
  weight: 1,
  zoneTypes: ['derelict_field', 'trade_lane', 'patrol_corridor', 'ambush_lane'],
  script: 'selfRegistered',
  fallbackScript: 'whisper',
  pressureCost: 22,
  cooldownS: 2400,
  proximity: true,
  fireWithinWu: 1400,
  gates: {
    sectorIds: [
      'sector_helios_prime', 'sector_ceres_belt', 'sector_tethys_junction',
      'sector_vesta_forge', 'sector_io_reach', 'sector_pallas_drift', 'sector_charon_expanse',
    ],
  },
});

export const LAST_TOW = Object.freeze({
  windowS: 300,             // the retrieval window: the detail works, then burns home
  readyWu: 1600,            // fireReady gate — the recorded dead must be within a flyable reach
  podCount: 3,              // estate freight pods spilled at the death site
  standoffWu: 210,          // where the tug parks relative to the hulk to work the winch
  workWu: 470,              // pods inside this reach of the site are winchable
  winchS: 18,               // one pod per this many seconds once the tug is on station
  tugSpawnWu: 720,          // the detail flies in from this far off the site
  robberSpawnWu: 1500,      // corpse-robbers inbound from this far — a race, not an ambush
  grabWu: 90,               // a robber inside this of a loose pod cuts it loose into its hold
  egressWu: 1500,           // past this from the player a bolting hull is gone
  boltS: 24,                // a bolting hull despawns this far out
  returnWu: 140,            // a player-latched pod inside this of the tug is handed back
  guardFeeCr: 650,          // the line's screen fee: paid for defended or hand-returned recovery
  returnFeeCr: 200,         // a pod hauled to the detail's line earns the hand-back fee on the spot
});

const DETAIL = Object.freeze({ name: 'MTS Retrieval Contract', factionId: 'faction_mts' });
const DEFAULT_FREIGHT = Object.freeze(['cmdty_consumer_goods', 'cmdty_medical', 'cmdty_refined_metals']);
const SERVED_CAP = 8;

function tick60(now) { return Math.round(now * 60); }

function dist2(a, b) {
  const dx = ((a && a.x) || 0) - ((b && b.x) || 0);
  const dz = ((a && a.z) || 0) - ((b && b.z) || 0);
  return dx * dx + dz * dz;
}

/** Marker ids this ledger already sent a detail for, carried forward through the situation
 * memory's facts — bounded to the aftermath ledger's own per-sector cap. */
function servedMarkers(state) {
  const rec = priorOutcome(state, trigger.id);
  const list = rec && rec.facts && rec.facts.servedMarkers;
  return Array.isArray(list) ? list : [];
}

/** The recorded dead this beat answers: durable aftermath markers in the sector, minus the
 * player's own hulk and mission-pinned wrecks (those already have owners), minus any death the
 * detail has already flown. Freight kills outrank bare fighter kills — an estate is worth a tow. */
function eligibleMarkers(state, sectorId, nearPos) {
  if (!sectorId) return [];
  const served = new Set(servedMarkers(state));
  const out = [];
  for (const marker of aftermathForSector(state, sectorId)) {
    if (!marker || isPlayerWreckMarker(marker) || marker.pinWreck === true) continue;
    if (served.has(marker.markerId)) continue;
    if (!marker.pos || !Number.isFinite(marker.pos.x) || !Number.isFinite(marker.pos.z)) continue;
    out.push(marker);
  }
  out.sort((a, b) => {
    const aF = a.manifestResidue ? 1 : 0;
    const bF = b.manifestResidue ? 1 : 0;
    if (aF !== bF) return bF - aF;
    if (nearPos) return dist2(a.pos, nearPos) - dist2(b.pos, nearPos);
    return (b.tick || 0) - (a.tick || 0);
  });
  return out;
}

function playerPosOf(state) {
  const player = state && state.entities && state.entities.get
    ? state.entities.get(state.playerId) : null;
  return player && player.pos && Number.isFinite(player.pos.x) ? player.pos : null;
}

/** The estate freight a recorded death actually left: echo the manifest residue the marker
 * carries so a hauler's spilled estate reads as her cargo; a bare fighter leaves effects. */
function podSpecsFor(marker) {
  const residue = marker && marker.manifestResidue;
  const kinds = residue ? Object.keys(residue).sort((a, b) => a.localeCompare(b)) : [];
  const specs = [];
  for (const id of kinds) {
    if (specs.length >= LAST_TOW.podCount) break;
    if (typeof id !== 'string' || !id.startsWith('cmdty_')) continue;
    specs.push({ commodityId: id, amount: Math.min(8, Math.max(3, Math.floor(Number(residue[id]) || 0) + 2)) });
  }
  for (const id of DEFAULT_FREIGHT) {
    if (specs.length >= LAST_TOW.podCount) break;
    specs.push({ commodityId: id, amount: 5 });
  }
  return specs;
}

function transitTo(ent, live, now, target, reason, leash = 5200) {
  setEntityDoctrine(ent, {
    activity: {
      kind: ActivityKind.TRANSIT,
      reason,
      anchor: { x: target.x, z: target.z },
      leashRadius: leash,
      startedTick: tick60(now),
      encounterId: live.id,
    },
    roe: RulesOfEngagement.HOLD_FIRE,
  });
}

function loiterAt(ent, live, now, anchor, reason, leash = 160) {
  setEntityDoctrine(ent, {
    activity: {
      kind: ActivityKind.LOITER,
      reason,
      anchor: { x: anchor.x, z: anchor.z },
      leashRadius: leash,
      startedTick: tick60(now),
      encounterId: live.id,
    },
    roe: RulesOfEngagement.HOLD_FIRE,
  });
}

/** The honor guard answers hands on the estate: weapons-free on the claimant through the same
 * doctrine seam every squad uses — a real fight, not a scripted swat. */
function goHotOnPlayer(ent, live, now, reason, playerId) {
  setEntityDoctrine(ent, {
    activity: {
      kind: ActivityKind.ATTACK_RUN,
      reason,
      anchor: { x: ent.pos.x, z: ent.pos.z },
      leashRadius: 2400,
      startedTick: tick60(now),
      targetId: playerId == null ? null : playerId,
      encounterId: live.id,
    },
    roe: RulesOfEngagement.WEAPONS_FREE,
  });
  const ai = ent.data && ent.data.ai;
  if (ai) ai.passive = false;
}

/** A coward's exit: pointed away from whoever pressured it, still a lawful target while it flies. */
function boltAway(ent, live, now, awayFrom, reason) {
  let dx = (ent.pos.x || 0) - ((awayFrom && awayFrom.x) || 0);
  let dz = (ent.pos.z || 0) - ((awayFrom && awayFrom.z) || 0);
  const len = Math.hypot(dx, dz);
  if (!(len > 1)) { dx = Math.cos(now); dz = Math.sin(now); }
  else { dx /= len; dz /= len; }
  transitTo(ent, live, now,
    { x: ent.pos.x + dx * LAST_TOW.egressWu * 2, z: ent.pos.z + dz * LAST_TOW.egressWu * 2 },
    reason);
}

export const runtime = Object.freeze({
  // The beat only exists where somebody actually died and the ledger kept the name: no fresh
  // unprotected marker inside a flyable reach of the player means there is no estate to tow.
  fireReady(state) {
    const sectorId = state && state.world && state.world.currentSectorId;
    const pos = playerPosOf(state);
    for (const marker of eligibleMarkers(state, sectorId, pos)) {
      if (!pos || dist2(marker.pos, pos) <= LAST_TOW.readyWu * LAST_TOW.readyWu) return true;
    }
    return false;
  },

  fire(d, live, state) {
    const sectorId = live.sectorId || (state.world && state.world.currentSectorId);
    const pos = playerPosOf(state);
    const marker = eligibleMarkers(state, sectorId, pos)
      .find((m) => !pos || dist2(m.pos, pos) <= LAST_TOW.readyWu * LAST_TOW.readyWu)
      || eligibleMarkers(state, sectorId, pos)[0];
    if (!marker) return d.abort(live, 'no_recorded_dead');

    // The scene anchors on the death the ledger recorded — the bound wreck materializes there
    // through the aftermath owner when the player closes; the detail works the site itself.
    const site = { x: marker.pos.x, z: marker.pos.z };
    live.anchor = { x: site.x, z: site.z };
    const rng = d.stream(live, 'last_tow_layout');
    const a = rng() * Math.PI * 2;
    const u = { x: Math.cos(a), z: Math.sin(a) };
    const p = { x: -u.z, z: u.x };
    const at = (along, across) => ({
      x: site.x + u.x * along + p.x * across,
      z: site.z + u.z * along + p.z * across,
    });
    const label = marker.victimLabel || 'the dead hull';
    const estateOwnerId = `estate:${marker.victimId}`;
    const estateFaction = marker.victimFactionId || DETAIL.factionId;
    const estateName = `the ${label} estate`;

    // The dead's estate: owner-stamped pods, so scooping them under the honor guard's eyes is
    // the same witnessed-theft door a jettisoned pod opens anywhere else — the law prices it.
    const pods = [];
    for (const [i, spec] of podSpecsFor(marker).entries()) {
      const side = i % 2 ? 1 : -1;
      const pod = d.spawnCargoPod(live, {
        pos: at(26 + i * 30, side * (34 + i * 14)), vel: { x: 0, z: 0 },
        commodityId: spec.commodityId, amount: spec.amount,
        unitMass: 0.5, radius: 5,
        ownerId: estateOwnerId, ownerName: estateName, factionId: estateFaction,
      });
      if (!pod) continue;
      pod.data.scanLabel = `ESTATE OF ${String(label).toUpperCase()} — RECOVERY MANIFEST`;
      pod.data.encounterId = live.id;
      live.ids.push(pod.id);
      live.roles[pod.id] = 'estate_freight';
      pods.push({ podId: pod.id, cid: spec.commodityId, amount: spec.amount, fate: null });
    }
    if (pods.length < 1) return d.abort(live, 'no_bodies');

    // The cast: the winch tug and its honor guard inbound on the retrieval contract; the Reach
    // corpse-robbers who heard the same filing inbound from the cold side.
    const ids = d.spawnShips(live, [
      {
        archetype: 'mule_trader', level: 4, role: 'tug', factionId: DETAIL.factionId, team: 2,
        context: 'civilian', passive: true, pos: at(LAST_TOW.tugSpawnWu, 60),
        scanLabel: 'MTS RETRIEVAL TUG — COLLECTION DETAIL',
      },
      {
        archetype: 'bruiser_brawler', level: 5, role: 'guard', factionId: DETAIL.factionId, team: 2,
        context: 'civilian', passive: true, pos: at(LAST_TOW.tugSpawnWu + 60, -80),
        scanLabel: 'MTS HONOR GUARD — ESCORTING THE DETAIL',
      },
      {
        archetype: 'wasp_swarmer', level: 4, role: 'robber', factionId: 'faction_reach', team: 1,
        context: 'zone_hostile', passive: false, pos: at(-LAST_TOW.robberSpawnWu, 120),
        scanLabel: 'REACH CORPSE-ROBBER — HEARD THE FILING',
      },
      {
        archetype: 'reaver_pirate', level: 5, role: 'robber', factionId: 'faction_reach', team: 1,
        context: 'zone_hostile', passive: false, pos: at(-LAST_TOW.robberSpawnWu, -160),
        scanLabel: 'REACH CORPSE-ROBBER — HEARD THE FILING',
      },
    ]);
    const tug = d.entsOf(live, 'tug')[0];
    const guard = d.entsOf(live, 'guard')[0];
    const robberIds = d.entsOf(live, 'robber').map((e) => e.id);
    if (!tug || robberIds.length < 1) return d.abort(live, 'no_cast');

    // The detail transits in and holds over the hulk to work; the guard holds the picture —
    // lawful eyes on whoever lays a hand on the estate.
    transitTo(tug, live, d.now(), at(LAST_TOW.standoffWu, 0), 'the_last_tow:tug_inbound', 3200);
    if (guard) {
      guard.data.ai = guard.data.ai || {};
      guard.data.ai.lawful = true;
      guard.data.lawWitness = true;
      loiterAt(guard, live, d.now(), at(LAST_TOW.standoffWu + 90, 40), 'the_last_tow:honor_watch', 200);
    }
    for (const id of robberIds) {
      const robber = entityById(state, id);
      if (robber) transitTo(robber, live, d.now(), site, 'the_last_tow:robber_inbound', 4200);
    }

    live.data.lastTow = {
      markerId: marker.markerId,
      victimLabel: label,
      site,
      tugId: tug.id,
      guardId: guard ? guard.id : null,
      robberIds,
      pods,
      latched: [],
      robberBolted: {},
      robberTarget: {},
      tugArrived: false,
      tugDeparted: false,
      nextWinchAt: 0,
      secured: 0,          // pods the detail winched aboard
      returned: 0,         // pods the player hauled to the detail's line
      taken: 0,            // estate pods that left the world with the player
      scavTaken: 0,        // estate pods corpse-robbers cut loose
      defended: 0,         // robbers the player put down — the line pays a screen fee
      guardHot: false,
      warned: false,
      detailMurdered: false,
      served: [...servedMarkers(state), marker.markerId].slice(-SERVED_CAP),
      settled: false,
    };
    live.deadlineAt = d.now() + LAST_TOW.windowS;
    live.phase = 'retrieval';
    live.approach = {
      signal: 'collection_detail_over_the_dead',
      contacts: ids.length + pods.length,
      t: d.now(),
    };
    live.vars = { ...(live.vars || {}), victim: label, fee: LAST_TOW.guardFeeCr };
    d.say(live, 'alert',
      `MTS RETRIEVAL CONTRACT: the ${label} went down here and the line filed for the dead — a collection detail is inbound to winch her estate home. Reach corpse-robbers heard the same filing. Screen the detail and the line pays ${LAST_TOW.guardFeeCr} cr; hands on the estate and the honor guard answers.`,
      null, { primary: true, literal: true });
  },

  event(d, live, state, name, payload) {
    const w = live.data && live.data.lastTow;
    if (!w || w.settled || live.phase === 'done') return;
    const now = d.now();
    if (name === 'squadKill' && payload) {
      const role = payload.role;
      if ((role === 'tug' || role === 'guard') && payload.byPlayer) {
        w.detailMurdered = true;
        return this._settle(d, live, state, 'detail_murdered');
      }
      if (role === 'robber') {
        if (payload.byPlayer) {
          w.defended += 1;
          if (w.defended === 1) {
            d.say(live, 'bark', 'MTS RETRIEVAL: robber hull down — the detail logs the screen and the line owes a fee if the dead come home.', null, { literal: true });
          }
        }
        return;
      }
      return;
    }
    if (name === 'playerHitSquad' && payload && payload.targetId != null) {
      const role = live.roles && live.roles[payload.targetId];
      const hit = entityById(state, payload.targetId);
      if (role === 'robber' && hit && alive(hit) && !w.robberBolted[hit.id]) {
        // Corpse-robbers do not duel — a hit hull bolts with whatever it already cut loose.
        w.robberBolted[hit.id] = now;
        boltAway(hit, live, now, d.player() && d.player().pos, 'the_last_tow:robber_spooked');
      }
      if ((role === 'tug' || role === 'guard') && !w.guardHot) {
        // Fire on the detail is fire on a filed recovery — the honor guard answers on the spot.
        w.guardHot = true;
        const guard = entityById(state, w.guardId);
        if (guard && alive(guard)) {
          goHotOnPlayer(guard, live, now, 'the_last_tow:detail_fired_on', state.playerId);
          d.say(live, 'bark', 'MTS HONOR GUARD: you fired on a filed recovery detail. We answer for the dead.', null, { literal: true });
        }
      }
      return;
    }
    if (name === 'tetherAttached' && payload && w.pods.some((rec) => rec.podId === payload.targetId && !rec.fate)) {
      if (!w.latched.includes(payload.targetId)) w.latched.push(payload.targetId);
      if (!w.warned) {
        w.warned = true;
        d.say(live, 'bark', 'MTS HONOR GUARD: registry, that pod is estate freight under a filed recovery — set it on the detail\'s line and the hand-back pays; walk it off and we answer.', null, { literal: true });
      }
    }
  },

  tick(d, live, state, now) {
    const w = live.data && live.data.lastTow;
    if (!w || w.settled || live.phase === 'done') return;
    const player = d.player();
    const playerPos = player && player.pos;

    // Sweep the estate: a pod out of the world with no recorded fate left with the player's
    // registry — or went down with whoever broke it. Either way the detail logs the empty cradle.
    for (const rec of w.pods) {
      if (rec.fate) continue;
      const pod = entityById(state, rec.podId);
      if (!pod || pod.alive === false) {
        rec.fate = 'taken';
        w.taken += 1;
        if (!w.guardHot) {
          w.guardHot = true;
          const guard = entityById(state, w.guardId);
          if (guard && alive(guard)) {
            goHotOnPlayer(guard, live, now, 'the_last_tow:estate_taken', state.playerId);
            d.say(live, 'bark', 'MTS HONOR GUARD: the estate is logging handlers under a filed recovery — hands off the dead.', null, { literal: true });
          }
        }
      }
    }

    // A pod on the player's line inside the hand-back reach goes home with the detail — the
    // tow fee pays on the spot, no receipt backlog.
    const tug = entityById(state, w.tugId);
    if (tug && alive(tug)) {
      for (const rec of w.pods) {
        if (rec.fate || !w.latched.includes(rec.podId)) continue;
        const pod = entityById(state, rec.podId);
        if (!pod || pod.alive === false) continue;
        if (dist2(pod.pos, tug.pos) <= LAST_TOW.returnWu * LAST_TOW.returnWu) {
          rec.fate = 'returned';
          pod.alive = false;
          w.returned += 1;
          d.grant(LAST_TOW.returnFeeCr, 'the_last_tow:hand_back');
          d.rep(DETAIL.factionId, 2, 'the_last_tow_hand_back');
          d.say(live, 'bark', 'MTS RETRIEVAL: pod received on the line — the hand-back fee is wired. The dead\'s own people thank you.', null, { literal: true });
        }
      }
    }

    // Robber legs: each thief runs at the nearest loose pod, cuts it into the ordinary
    // kill-spill hold, and bolts. A laden hull the player drops re-drops its take physically.
    for (const id of w.robberIds) {
      const robber = entityById(state, id);
      if (!robber || robber.alive === false) continue;
      if (w.robberBolted[id]) {
        if (playerPos && dist2(robber.pos, playerPos) > LAST_TOW.egressWu * LAST_TOW.egressWu
          && !(robber.data && robber.data.despawnAt)) {
          robber.data = robber.data || {};
          robber.data.despawnAt = now + 3;
        }
        continue;
      }
      let best = null;
      let bestD = Infinity;
      for (const rec of w.pods) {
        if (rec.fate || w.latched.includes(rec.podId)) continue;
        const pod = entityById(state, rec.podId);
        if (!pod || pod.alive === false) continue;
        const dd = dist2(robber.pos, pod.pos);
        if (dd < bestD) { bestD = dd; best = rec; }
      }
      if (!best) {
        // Nothing loose worth dying for — the filing is dry and the field is hot.
        w.robberBolted[id] = now;
        boltAway(robber, live, now, playerPos, 'the_last_tow:robber_dry');
        continue;
      }
      if (bestD <= LAST_TOW.grabWu * LAST_TOW.grabWu) {
        const pod = entityById(state, best.podId);
        if (pod && pod.alive !== false) {
          best.fate = 'robbed';
          pod.alive = false;
          w.scavTaken += 1;
          const cargo = robber.data.cargo || (robber.data.cargo = { items: {} });
          cargo.items[best.cid] = (Math.floor(Number(cargo.items[best.cid]) || 0)) + best.amount;
        }
        w.robberBolted[id] = now;
        boltAway(robber, live, now, playerPos, 'the_last_tow:robber_laden');
        if (w.scavTaken === 1) {
          d.say(live, 'bark', 'MTS RETRIEVAL: robbers are cutting the estate loose — burn them before they clear the field.', null, { literal: true });
        }
      } else if (w.robberTarget[id] !== best.podId) {
        // Re-issue the run only when the mark changes — doctrine stays live between pumps.
        w.robberTarget[id] = best.podId;
        const pod = entityById(state, best.podId);
        transitTo(robber, live, now, pod ? pod.pos : w.site, 'the_last_tow:robber_run', 4200);
      }
    }

    // The tug's work loop: arrive, hold over the hulk, winch a loose pod aboard every beat.
    if (tug && alive(tug) && !w.tugDeparted) {
      if (!w.tugArrived && dist2(tug.pos, w.site) <= (LAST_TOW.standoffWu + 120) * (LAST_TOW.standoffWu + 120)) {
        w.tugArrived = true;
        w.nextWinchAt = now + LAST_TOW.winchS;
        loiterAt(tug, live, now, w.site, 'the_last_tow:winch_station', LAST_TOW.standoffWu + 60);
        d.say(live, 'bark', `MTS RETRIEVAL: on station over the ${w.victimLabel}. Winching the estate — keep the field clean.`, null, { literal: true });
      }
      if (w.tugArrived && now >= w.nextWinchAt) {
        let best = null;
        let bestD = Infinity;
        for (const rec of w.pods) {
          if (rec.fate) continue;
          const pod = entityById(state, rec.podId);
          if (!pod || pod.alive === false) continue;
          const dd = dist2(pod.pos, w.site);
          if (dd < bestD) { bestD = dd; best = rec; }
        }
        if (best && bestD <= LAST_TOW.workWu * LAST_TOW.workWu) {
          const pod = entityById(state, best.podId);
          best.fate = 'secured';
          if (pod) pod.alive = false;
          w.secured += 1;
          w.nextWinchAt = now + LAST_TOW.winchS;
        }
      }
      // The contract is done — or the window is nearly done — and the detail burns for home.
      const loose = w.pods.some((rec) => {
        if (rec.fate) return false;
        const pod = entityById(state, rec.podId);
        return pod && pod.alive !== false && dist2(pod.pos, w.site) <= LAST_TOW.workWu * LAST_TOW.workWu;
      });
      if (!loose || now >= live.deadlineAt - 40) {
        w.tugDeparted = true;
        transitTo(tug, live, now,
          { x: w.site.x + (tug.pos.x - w.site.x >= 0 ? 1 : -1) * LAST_TOW.egressWu * 2, z: w.site.z },
          'the_last_tow:tug_home', 5200);
        tug.data = tug.data || {};
        tug.data.despawnAt = now + LAST_TOW.boltS;
      }
    }

    // Resolution: the detail gone or the window closed settles what the dead got.
    if (tug && alive(tug) && !w.tugDeparted && now < live.deadlineAt) return;
    const outcome = w.detailMurdered ? 'detail_murdered'
      : w.taken > 0 ? 'robbed_the_dead'
      : (w.secured + w.returned) >= 1 ? 'crew_home'
      : w.scavTaken >= w.pods.length ? 'robbed_the_dead'
      : 'went_cold';
    return this._settle(d, live, state, outcome);
  },

  _settle(d, live, state, outcome) {
    const w = live.data && live.data.lastTow;
    if (!w || w.settled) return;
    w.settled = true;
    const label = w.victimLabel;
    const recovered = w.secured + w.returned;
    const worked = w.defended > 0 || w.returned > 0;
    if (outcome === 'crew_home') {
      if (worked) {
        d.grant(LAST_TOW.guardFeeCr, 'the_last_tow:screen_fee');
        d.rep(DETAIL.factionId, 3, 'the_last_tow_screened');
      } else {
        d.rep(DETAIL.factionId, 1, 'the_last_tow_witnessed');
      }
      publishSituationNews(d, live, worked
        ? `DEAD BROUGHT HOME: a collection detail flew the ${label} estate out under a registry screen — ${recovered} of ${w.pods.length} pods made the line's cradle. The retrieval fee is paid.`
        : `DEAD BROUGHT HOME: the ${label} estate was winched out by the line's own detail — ${recovered} of ${w.pods.length} pods recovered unescorted.`);
    } else if (outcome === 'detail_murdered') {
      d.rep(DETAIL.factionId, -8, 'the_last_tow_detail_murdered');
      publishSituationNews(d, live, `DETAIL MURDERED OVER THE DEAD: the line's collection tug was killed on station over the ${label}. The desk keeps the registry; so does the estate.`);
    } else if (outcome === 'robbed_the_dead') {
      if (w.taken > 0) {
        d.rep(DETAIL.factionId, -5, 'the_last_tow_robbed_estate');
        publishSituationNews(d, live, `ESTATE ROBBED AT THE CRADLE: the ${label}'s recovery manifest walked off under an honor guard's eyes. The line files the registry that touched it.`);
      } else {
        publishSituationNews(d, live, `GRAVE STRIPPED: corpse-robbers cut the ${label} estate loose before the line's detail could winch it home. The filing stays open; the dead keep nothing.`);
      }
    } else { // went_cold — the window closed or the detail never made cradle
      publishSituationNews(d, live, `RETRIEVAL LAPSED: the ${label}'s estate stayed in the water past the collection window. The line's filing goes quiet — the field keeps what it kept.`);
    }
    live.vars = { ...(live.vars || {}), via: worked ? 'screened' : 'stood_off' };
    return settleSituation(d, live, state, outcome, {
      secured: w.secured, returned: w.returned, taken: w.taken, scavTaken: w.scavTaken,
      defended: w.defended, servedMarkers: w.served, victim: label, markerId: w.markerId,
    });
  },
});

export default defineEncounter(trigger, {
  shape: {
    situation: 'salvage',
    place: trigger.zoneTypes,
    twist: 'player_echo',
    actor: 'faction_mts',
  },
  factionId: 'faction_mts',
  title: 'THE LAST TOW',
  primaryLine: `MTS RETRIEVAL CONTRACT: a recorded kill leaves an estate in the water — the line's collection detail is inbound to winch the dead's freight home, and Reach corpse-robbers heard the same filing.`,
  verbs: ['fire', 'salvage', 'fly_on'],
  choices: [
    { id: 'screen', verb: 'fire', text: 'Screen the collection detail — corpse-robbers are lawful targets.' },
    { id: 'return', verb: 'salvage', text: 'Haul a loose estate pod to the detail\'s line for the hand-back fee.' },
    { id: 'pass', verb: 'fly_on', text: 'Fly on — let the line collect its own dead, or the robbers strip them.' },
  ],
  civilian: { archetypes: ['mule_trader'], size: [1, 1], factionId: 'faction_mts', context: 'civilian', team: 2, passive: true },
  squad: {
    archetypes: ['wasp_swarmer'], anchorArchetype: 'reaver_pirate', size: [2, 2],
    factionId: 'faction_reach', context: 'zone_hostile', team: 1, doctrine: 'scavenger', formation: 'loose',
  },
  deadlineS: LAST_TOW.windowS,
  receipts: {
    crew_home: 'DEAD BROUGHT HOME — the collection detail winched the estate out and the line paid the screen fee. The dead keep their freight.',
    robbed_the_dead: 'ROBBED THE DEAD — the estate pods left the field with your registry under a lawful witness, or the robbers stripped the grave first.',
    detail_murdered: 'DETAIL MURDERED — the line\'s retrieval hull is dead on station over the dead. The desk keeps the registry.',
    went_cold: 'RETRIEVAL LAPSED — the collection window closed with the estate still in the water. The filing goes quiet.',
  },
});
