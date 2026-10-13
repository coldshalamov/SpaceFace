// 585 — The Candle Relighting. The Fleet's tender column walks the relight run out to the
// Candle Fleet memorial: twenty-four lamps for the Pit convoy, one plinth that stays dark.
// Guaranteed once in the starter sector's first day so the first hour contains one thing that
// is not a lesson or a fight — a shift already under way, going somewhere, that a curious
// pilot can follow. Following is the whole reward: the walk ends at the memorial the landmark
// quest wants scanned, and nobody shoots at anybody.
//
// Self-registered runtime (the raid's shape): the module owns the cast, the walk, and the
// witness beat. Locomotion copies the lived-vignette intent writes — passive hulls opt into
// the shared tactical navigation, so the column clears the starter field instead of grinding
// through it.
import { deepFreeze, defineEncounter } from './catalog.js';
import { sectorGlobalOrigin } from '../../data/sectorCoordinates.js';

export const encounterOrder = 585;

// The authored day-0 promise: land after the opening raid's window (60–170 s) and around the
// onboarding rail's closing choice, before the first dock usually settles the evening. The
// window's floor also sits above every organic tier ceiling (~530 s) and above the other
// pinned windows ([60,170] raid, [180,420] salvage tail), so the ≥45 s spacing pass can
// always clear neighbors — two pinned windows must never overlap-adjacent within a sector-day.
const EARLY_WINDOW_S = deepFreeze([540, 810]);
const WALK_DEADLINE_S = 300;
const ARRIVAL_RANGE_WU = 110;
const CRUISE_WU_S = 26;
const WITNESS_RANGE_WU = 420;

// The memorial's authored sector-local anchor (sectorAnchors.js); Helios is the one sector
// whose origin is (0, 0), and this module is Helios-gated, but convert through the real
// boundary anyway so the bearing math cannot silently depend on that coincidence.
function memorialPos() {
  const origin = sectorGlobalOrigin('sector_helios_prime');
  return { x: origin.x + 1680, z: origin.z - 820 };
}

function bearingFrom(from, to) {
  const dx = to.x - from.x;
  const dz = to.z - from.z;
  const distance = Math.hypot(dx, dz) || 1;
  return { x: dx / distance, z: dz / distance };
}

// Same intent shape the lived vignettes write: passive + hold-fire + a transit anchor with a
// matched velocity, so the shared tracker walks the hull instead of braking it to a stop.
function walkIntent(entity, tx, tz, ux, uz) {
  if (!entity || !entity.pos) return;
  const data = entity.data || (entity.data = {});
  const ai = data.ai || (data.ai = {});
  ai.passive = true;
  ai.allowPassiveManeuver = true;
  ai.roe = 'hold_fire';
  ai.activity = {
    ...ai.activity,
    kind: 'transit',
    reason: 'encounter:candle_relighting',
    anchor: { x: tx, z: tz },
    anchorVelocity: { x: ux * CRUISE_WU_S, z: uz * CRUISE_WU_S },
    targetId: null,
    preferredRange: 0,
  };
  const intent = data.intent || (data.intent = {});
  intent.tx = tx;
  intent.tz = tz;
  intent.fire = false;
}

const CAST = deepFreeze([
  { id: 'lead', archetype: 'pallet_jack', scanLabel: 'FLEET TENDER LEAD', offset: 240 },
  { id: 'lamp_1', archetype: 'mothlight', scanLabel: 'FLEET LAMP 1', offset: 180 },
  { id: 'lamp_2', archetype: 'mothlight', scanLabel: 'FLEET LAMP 2', offset: 120 },
  { id: 'lamp_3', archetype: 'mothlight', scanLabel: 'FLEET LAMP 3', offset: 60 },
  { id: 'lamp_4', archetype: 'mothlight', scanLabel: 'FLEET LAMP 4', offset: 0 },
]);

export const runtime = Object.freeze({
  fire(d, live, state) {
    const memorial = memorialPos();
    const anchor = live.anchor || { x: 0, z: 0 };
    // The column forms up behind the player's frame and walks outward past it — you see a
    // line of lamps overtake you on the Fleet bearing, and following is your choice.
    const dir = bearingFrom(anchor, memorial);
    const start = { x: anchor.x - dir.x * 220, z: anchor.z - dir.z * 220 };
    live.deadlineAt = d.now() + WALK_DEADLINE_S;
    live.plan = live.plan || {};
    live.plan.ships = CAST.map((member) => ({
      archetype: member.archetype,
      level: 2,
      pos: { x: start.x + dir.x * member.offset, z: start.z + dir.z * member.offset },
      factionId: 'faction_scn',
      context: 'convoy_civilian',
      role: member.id,
      passive: true,
      team: 2,
      scanLabel: member.scanLabel,
    }));
    const ids = d.spawnShips(live, live.plan.ships) || [];
    if (ids.length < CAST.length) return d.abort(live, 'spawn_failed');
    live.data.leadId = ids[0];
    live.data.memorial = memorial;
    live.phase = 'walk';
    // The column starts walking the frame it spawns in; the first carrot goes out now so the
    // hulls never sit on the director's telegraph hold. Same per-hull bearing the tick uses.
    for (const id of ids) {
      const ship = state.entities.get(id);
      if (!ship || !ship.pos) continue;
      const own = bearingFrom(ship.pos, memorial);
      walkIntent(ship, ship.pos.x + own.x * 200, ship.pos.z + own.z * 200, own.x, own.z);
    }
    // The one primary line (one-voice law): who they are, where they are going, why follow.
    d.say(live, 'info',
      'FLEET TENDERS: Relight run — twenty-four candles out to the Fleet. Walk the line if you like.',
      null, { literal: true, primary: true });
  },

  tick(d, live, state, now) {
    if (live.phase === 'done') return;
    const memorial = live.data.memorial || memorialPos();
    const ents = d.entsOf(live);
    if (!ents.length) return d.resolve(live, 'lost', { speak: false });
    const lead = live.data.leadId != null ? state.entities.get(live.data.leadId) : ents[0];
    const walker = lead && lead.alive !== false && lead.pos ? lead : ents.find((e) => e.pos) || null;
    if (!walker) return d.resolve(live, 'lost', { speak: false });
    const dir = bearingFrom(walker.pos, memorial);
    // Carrot a fixed distance ahead of each hull so the shared tracker keeps them walking at
    // the cruise pace instead of decelerating onto a static point.
    for (const ship of ents) {
      if (!ship || !ship.pos) continue;
      walkIntent(ship, ship.pos.x + dir.x * 200, ship.pos.z + dir.z * 200, dir.x, dir.z);
    }
    const dx = memorial.x - walker.pos.x;
    const dz = memorial.z - walker.pos.z;
    const arrived = (dx * dx + dz * dz) <= ARRIVAL_RANGE_WU * ARRIVAL_RANGE_WU;
    if (!arrived && now < (live.deadlineAt || 0)) return;

    const player = d.player && d.player();
    let witnessed = false;
    if (arrived && player && player.pos) {
      const px = memorial.x - player.pos.x;
      const pz = memorial.z - player.pos.z;
      witnessed = (px * px + pz * pz) <= WITNESS_RANGE_WU * WITNESS_RANGE_WU;
    }
    if (!witnessed) {
      d.emit('comms:log', {
        from: 'FLEET TENDERS',
        text: arrived
          ? 'The lamps reach the Fleet and thin out. The dark plinth keeps its hour.'
          : 'The relight run walks on without you. The candles will be lit either way.',
        kind: 'encounter',
      });
    } else {
      d.emit('comms:log', {
        from: 'FLEET TENDERS',
        text: 'Twenty-four lit. The plinth stays dark. Bring a scanner close and it answers.',
        kind: 'encounter',
      });
    }
    return d.resolve(live, witnessed ? 'witnessed' : arrived ? 'relit' : 'walked_on', { speak: false });
  },
});

export const trigger = deepFreeze({
  id: 'candle_relighting',
  tier: 'ambient',
  deck: 'civilian',
  weight: 1.0,
  zoneTypes: ['trade_lane', 'civilian_core', 'patrol_corridor'],
  script: 'selfRegistered',
  fallbackScript: 'whisper',
  pressureCost: 6,
  cooldownS: 1500,
  proximity: true,
  earlyWindowGuaranteeDay: 0,
  earlyDelayS: EARLY_WINDOW_S,
  fireWithinWu: 320,
  gates: {
    sectorIds: ['sector_helios_prime'],
  },
});

export default defineEncounter(trigger, {
  shape: {
    situation: 'wake',
    place: 'trade_lane',
    twist: 'follow_on',
    actor: 'faction_scn',
  },
  title: 'THE CANDLE RELIGHTING',
  factionId: 'faction_scn',
  motive: 'memorial_shift',
  engagementTrigger: 'hailed',
  noCombat: true,
  primaryLine: 'FLEET TENDERS: Relight run — twenty-four candles out to the Fleet. Walk the line if you like.',
});
