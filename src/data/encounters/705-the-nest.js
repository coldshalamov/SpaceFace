// 705 — THE NEST (E-08, Reach signature). A gutted freighter — the Nest Carrier — launches
// wasp packs from its belly bays on a rhythm. Two ways to gut it, both physical:
//
//   * RIP THE DOORS: latch a belly door and drag it off its socket — the bay spills open.
//     At half-stripped the carrier vents its whole nest at once (the twist);
//   * THROW ITS OWN WASPS BACK: a wasp returned through the open bays hurts it where
//     armor doesn't help — enough returns and the hull is a T4 wreck.
//
// Let it live and it raids the next lane (the FF mark). Kill it and its plate hangs on
// the Sker Haven trophy wall — yours to steal back.
import { deepFreeze, defineEncounter } from './catalog.js';
import { faction as REACH } from '../factions/reach.js';

export const encounterOrder = 705;
export const trigger = deepFreeze({
  id: 'the_nest',
  tier: 'minor',
  deck: 'patrol',
  weight: 0.7,
  zoneTypes: ['ambush_lane', 'outlaw_zone', 'radiation_field', 'derelict_field'],
  script: 'selfRegistered',
  fallbackScript: 'pirateRaid',
  pressureCost: 34,
  cooldownS: 1400,
  proximity: true,
  fireWithinWu: 720,
  gates: { maxSecurity: 0.6 },
});

const NEST = (REACH.custom && REACH.custom.nestCarrier) || {};
const TROPHY = (REACH.custom && REACH.custom.trophyWall) || {};
const DOOR_COUNT = Math.max(1, Math.round(Number(NEST.doorCount) || 2));
const NEST_SIZE = Math.max(1, Math.round(Number(NEST.nestSize) || 6));
const LAUNCH_S = Math.max(1, Number(NEST.launchIntervalS) || 5);
const TEAR_WU = Math.max(40, Number(NEST.tearWu) || 120);
const RETURN_HITS = Math.max(1, Math.round(Number(NEST.waspReturnHits) || 3));
const VENT_AT = Math.max(1, Math.round(Number(NEST.ventAtDoorsTorn) || 1));
const BAY_OFFSETS = Object.freeze([{ dx: -46, dz: 0 }, { dx: 46, dz: 0 }, { dx: 0, dz: 46 }, { dx: 0, dz: -46 }]);
const DEADLINE_S = 280;
const ESCAPE_WU = 3000;

function releaseCast(live) {
  if (!live) return;
  if (Array.isArray(live.ids)) live.ids.length = 0;
  if (live.roles && typeof live.roles === 'object') {
    for (const id of Object.keys(live.roles)) delete live.roles[id];
  }
}

function hangTrophy(d, live, label) {
  // The plate goes on the Sker Haven wall — a kill the clan remembers, and a stealable.
  const state = d.state;
  const wall = state.trophyWall || (state.trophyWall = { plates: [] });
  const plate = {
    id: `plate_${live.id}`,
    label,
    atS: d.now(), sectorId: live.sectorId || null,
    stationId: TROPHY.stationId || 'sker_haven',
  };
  wall.plates.push(plate);
  d.emit('reach:trophyHung', { plate, t: d.now() });
}

export const runtime = Object.freeze({
  fire(d, live, state) {
    live.deadlineAt = d.now() + DEADLINE_S;
    const center = (live.plan && live.plan.zoneCenter) || live.anchor;
    if (!center || !Number.isFinite(center.x) || !Number.isFinite(center.z)) {
      return d.abort(live, 'no_anchor');
    }
    const ships = (live.plan && live.plan.ships) || [];
    const carrierSpec = ships.find((s) => s && s.role === 'squad');
    if (carrierSpec) { carrierSpec.pos = { x: center.x, z: center.z }; carrierSpec.factionId = 'faction_reach'; }
    const ids = d.spawnShips(live, [carrierSpec].filter(Boolean));
    const carrier = d.entsOf(live, 'squad')[0] || null;
    if (!carrier) return d.abort(live, 'no_cast');
    {
      const cd = carrier.data || (carrier.data = {});
      const ai = cd.ai || (cd.ai = {});
      cd.scanLabel = 'REACH NEST CARRIER — BELLY DOORS SEALED';
      cd.nestCarrier = true;
      ai.passive = true; ai.holdPosition = true;
    }

    // The belly doors: tetherable plugs over the launch bays.
    const doorIds = [];
    for (let i = 0; i < DOOR_COUNT; i++) {
      const off = BAY_OFFSETS[i % BAY_OFFSETS.length];
      const door = d.spawnProp(live, {
        pos: { x: center.x + off.dx, z: center.z + off.dz },
        radius: 12, mass: 400,
        scanLabel: `BELLY DOOR ${i + 1} — LATCH AND RIP`,
        storyPropKind: 'nest_door',
      });
      if (door && door.data) {
        door.data.bellyDoor = true;
        door.data.socket = { dx: off.dx, dz: off.dz };
        door.data.carrierId = carrier.id;
        doorIds.push(door.id);
      }
    }

    live.data.nest = {
      carrierId: carrier.id, doorIds,
      waspIds: [], remaining: NEST_SIZE, launched: 0,
      nextLaunchS: d.now() + LAUNCH_S,
      vented: false, returnHits: 0, tornDoors: 0,
    };
    live.phase = 'conflict';
    d.say(live, 'alert',
      'NEST CARRIER: doors cycling — she\'s birthing wasps. Peel her belly or feed her back her own.',
      null, { primary: true, literal: true });
  },

  event(d, live, state, name, payload) {
    const rec = live.data && live.data.nest;
    if (!rec || live.phase === 'done') return;
    if (name === 'tetherAttached' && payload) {
      const playerId = (d.player() && d.player().id) || state.playerId;
      if (playerId && payload.actorId !== playerId && payload.controllerId !== playerId) return;
      const target = state.entities.get(payload.targetId);
      if (!target || !target.data) return;
      // Latching a door is the grip; the rip happens when the Line drags it off-socket.
      if (target.data.bellyDoor === true) target.data.latchedBy = 'player';
      // Latching a wasp marks it a returnable piece of ammunition.
      else if (rec.waspIds.includes(payload.targetId)) target.data.thrownBy = 'player';
      return;
    }
    if ((name === 'entityGone' || name === 'squadKill') && payload && rec.waspIds.includes(payload.id)) {
      // A wasp that dies on the carrier's skin — thrown back or shot point-blank — is a return.
      const wasp = state.entities.get(payload.id);
      const carrier = state.entities.get(rec.carrierId);
      if (wasp && carrier && wasp.data && wasp.data.thrownBy === 'player') {
        rec.returnHits += 1;
        d.emit('comms:log', { from: 'NEST CARRIER', text: 'Hull breach on the bays — she\'s bleeding.', kind: 'encounter' });
      }
    }
  },

  tick(d, live, state, now) {
    if (live.phase === 'done') return;
    const rec = live.data.nest;
    if (!rec) return;
    const carrier = state.entities.get(rec.carrierId);
    const player = d.player();
    if (!player || player.alive === false) {
      releaseCast(live);
      return d.resolve(live, 'subject_gone', { speak: false });
    }
    if (!carrier || carrier.alive === false) {
      hangTrophy(d, live, 'NEST CARRIER — GUTTED');
      releaseCast(live);
      return d.resolve(live, 'carrier_down', { speak: true });
    }

    // Doors: a latched door dragged past the tear radius rips free — the bay is open.
    for (const doorId of rec.doorIds) {
      const door = state.entities.get(doorId);
      if (!door || door.alive === false || !door.data || door.data.torn === true) continue;
      if (door.data.latchedBy !== 'player') continue;
      const sock = door.data.socket || { dx: 0, dz: 0 };
      const sx = carrier.pos.x + sock.dx, sz = carrier.pos.z + sock.dz;
      const dx = door.pos.x - sx, dz = door.pos.z - sz;
      if (dx * dx + dz * dz >= TEAR_WU * TEAR_WU) {
        door.data.torn = true;
        door.data.scanLabel = 'TORN BELLY DOOR — TROPHY SCRAP';
        rec.tornDoors += 1;
        d.emit('comms:log', {
          from: 'NEST CARRIER',
          text: rec.tornDoors >= VENT_AT ? 'Bay open — VENTING THE WHOLE NEST.' : 'Door torn — the bay hangs open.',
          kind: 'encounter',
        });
      }
    }

    // The vent: half-stripped means the whole nest comes out at once.
    if (!rec.vented && rec.tornDoors >= VENT_AT && rec.remaining > 0) {
      rec.vented = true;
      launchWasps(d, live, rec, carrier, rec.remaining, now);
    }

    // The rhythm: while any door still holds, the carrier births on its interval.
    const doorsHolding = rec.doorIds.some((id) => {
      const door = state.entities.get(id);
      return door && door.alive !== false && door.data && door.data.torn !== true;
    });
    if (doorsHolding && rec.remaining > 0 && now >= rec.nextLaunchS) {
      rec.nextLaunchS = now + LAUNCH_S;
      launchWasps(d, live, rec, carrier, 1, now);
    }

    // Returned wasps gut the hull through the open bays.
    const list = state.entityList || (state.entities ? [...state.entities.values()] : []);
    for (const waspId of rec.waspIds) {
      const wasp = state.entities.get(waspId);
      if (!wasp || wasp.alive === false || !wasp.data || wasp.data.thrownBy !== 'player') continue;
      const dx = wasp.pos.x - carrier.pos.x, dz = wasp.pos.z - carrier.pos.z;
      const reach = (carrier.radius || 40) + (wasp.radius || 4) + 14;
      if (dx * dx + dz * dz <= reach * reach) {
        wasp.alive = false;
        rec.returnHits += 1;
        d.emit('comms:log', { from: 'NEST CARRIER', text: 'Hull breach on the bays — she\'s bleeding.', kind: 'encounter' });
      }
    }
    void list;
    if (rec.returnHits >= RETURN_HITS) {
      carrier.alive = false;
      hangTrophy(d, live, 'NEST CARRIER — GUTTED BY ITS OWN NEST');
      releaseCast(live);
      return d.resolve(live, 'carrier_gutted', { speak: true });
    }

    // Out of wasps and doors — the carrier is a gutted wreck that stays a wreck.
    if (rec.remaining <= 0 && rec.tornDoors >= rec.doorIds.length) {
      hangTrophy(d, live, 'NEST CARRIER — EMPTIED');
      releaseCast(live);
      return d.resolve(live, 'nest_emptied', { speak: true });
    }

    // It lives and leaves — the FF: it raids the next lane.
    const dx = carrier.pos.x - player.pos.x, dz = carrier.pos.z - player.pos.z;
    if (dx * dx + dz * dz > ESCAPE_WU * ESCAPE_WU) {
      const story = state.story || (state.story = { flags: {} });
      story.flags.reach_nest_raids_next_lane = { atS: now, sectorId: live.sectorId || null };
      releaseCast(live);
      return d.resolve(live, 'carrier_escapes', { speak: true });
    }
    if (now >= live.deadlineAt) {
      releaseCast(live);
      return d.resolve(live, 'carrier_escapes', { speak: true });
    }
  },
});

function launchWasps(d, live, rec, carrier, count, now) {
  const specs = [];
  for (let i = 0; i < count; i++) {
    specs.push({
      archetype: 'wasp_swarmer', level: 1, role: 'wasp', factionId: 'faction_reach',
      context: 'patrol', pos: { x: carrier.pos.x + (i % 3 - 1) * 30, z: carrier.pos.z + 40 },
      scanLabel: 'NEST WASP — LAUNCHED',
    });
  }
  const ids = d.spawnShips(live, specs);
  const player = d.player();
  for (const id of ids) {
    const e = d.state.entities.get(id);
    if (!e || !e.data) continue;
    const ai = e.data.ai || (e.data.ai = {});
    ai.passive = false;
    if (player) { ai.targetId = player.id; (e.data.combat || (e.data.combat = {})).targetId = player.id; }
    rec.waspIds.push(id);
  }
  rec.remaining -= ids.length;
  rec.launched += ids.length;
  d.emit('nest:waspsLaunched', {
    encounterId: live.id, count: ids.length, vented: rec.vented, t: now,
  });
}

export default defineEncounter(trigger, {
  shape: {
    situation: 'hunt',
    place: trigger.zoneTypes,
    twist: 'none',
    actor: 'faction_reach',
  },
  motive: 'nest_raid',
  engagementTrigger: 'authorized_hostile_spawn',
  factionId: 'faction_reach',
  context: 'patrol',
  title: 'THE NEST',
  primaryLine: 'NEST CARRIER: doors cycling — she\'s birthing wasps. Peel her belly or feed her back her own.',
  squad: {
    archetypes: ['corsair_raider'],
    size: [1, 1],
    doctrine: 'raider',
    formation: 'none',
    passive: true,
  },
  choices: [],
  bark: null,
  telegraph: 'A Reach Nest Carrier cycles its belly doors — wasps are coming.',
  deadlineS: DEADLINE_S,
  aftermath: {
    flee: 'The carrier limps off to raid the next lane.',
    kill: 'The nest is wreckage. Its plate hangs at Sker Haven.',
  },
  receipts: {
    carrier_gutted: 'GUTTED — its own wasps took it down through the bays.',
    carrier_down: 'The Nest Carrier is dead. The plate hangs at Sker Haven.',
    nest_emptied: 'EMPTIED — the last wasp is out and the doors hang open.',
    carrier_escapes: 'It escaped. The next lane hears the doors cycling tonight.',
    subject_gone: 'The nest settles back into the rocks.',
  },
});
