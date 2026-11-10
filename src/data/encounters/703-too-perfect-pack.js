// 703 — THE TOO-PERFECT PACK (E-10, Helix signature). A "Reach" pack ambushes a Quiet
// runner, and its formation is flawless — exact diamond geometry, matched speeds, paint a
// little too clean. Break the pattern (fling one hull off its slot) and every transponder
// flips to HELIX at once. The runner's cargo is already logged as "recovered contraband" —
// the seizure was written before the ambush flew.
import { deepFreeze, defineEncounter } from './catalog.js';
import { faction as HELIX } from '../factions/helix.js';

export const encounterOrder = 703;
export const trigger = deepFreeze({
  id: 'too_perfect_pack',
  tier: 'minor',
  deck: 'patrol',
  weight: 0.9,
  zoneTypes: ['trade_lane', 'patrol_corridor', 'ambush_lane', 'derelict_field'],
  script: 'selfRegistered',
  fallbackScript: 'patrolScan',
  pressureCost: 28,
  cooldownS: 900,
  proximity: true,
  fireWithinWu: 700,
  gates: {},
});

const FLAG = (HELIX.custom && HELIX.custom.falseFlag) || {};
const MASKS = Array.isArray(FLAG.masks) && FLAG.masks.length ? FLAG.masks : ['faction_reach'];
const DEADLINE_S = 240;
const RUNNER_FLEE_SPEED = 46;
// The authored diamond: slots that sum to zero so the pack centroid IS the diamond center.
const SLOTS = Object.freeze([
  { dx: 130, dz: 0 }, { dx: 0, dz: 85 }, { dx: 0, dz: -85 }, { dx: -130, dz: 0 },
]);

function releaseCast(live) {
  if (!live) return;
  if (Array.isArray(live.ids)) live.ids.length = 0;
  if (live.roles && typeof live.roles === 'object') {
    for (const id of Object.keys(live.roles)) delete live.roles[id];
  }
}

export const runtime = Object.freeze({
  fire(d, live, state) {
    live.deadlineAt = d.now() + DEADLINE_S;
    const center = (live.plan && live.plan.zoneCenter) || live.anchor;
    if (!center || !Number.isFinite(center.x) || !Number.isFinite(center.z)) {
      return d.abort(live, 'no_anchor');
    }
    const ships = (live.plan && live.plan.ships) || [];
    const rng = d.stream(live, 'pack_layout');
    const mask = MASKS[Math.floor(rng() * MASKS.length) % MASKS.length];
    const packId = `pack_${live.id}`;

    // The pack holds its authored diamond around the zone center — too perfectly.
    const packSpecs = ships.filter((s) => s && s.role === 'squad').slice(0, SLOTS.length);
    packSpecs.forEach((s, i) => {
      const slot = SLOTS[i % SLOTS.length];
      s.pos = { x: center.x + slot.dx, z: center.z + slot.dz };
      s.factionId = mask;
    });
    // The Quiet runner flees through the kill-pocket on the pack's far side.
    const runnerSpec = ships.find((s) => s && s.role === 'escort');
    if (runnerSpec) {
      runnerSpec.pos = { x: center.x + 520, z: center.z + 40 };
      runnerSpec.factionId = runnerSpec.factionId || 'faction_quiet';
    }

    const ids = d.spawnShips(live, [runnerSpec, ...packSpecs].filter(Boolean));
    if (!ids.length) return d.abort(live, 'no_budget');

    const pack = d.entsOf(live, 'squad');
    const runner = d.entsOf(live, 'escort')[0] || null;
    if (!runner || pack.length < 2) return d.abort(live, 'no_cast');
    const packIds = [];
    for (const [i, m] of pack.entries()) {
      const md = m.data || (m.data = {});
      const ai = md.ai || (md.ai = {});
      md.helixFalseFlag = true;
      md.helixPack = packId;
      md.helixSlot = SLOTS[i % SLOTS.length];
      md.maskedAs = mask;
      ai.targetId = runner.id;
      if (!m.vel) m.vel = { x: 0, z: 0 };
      m.vel.x = RUNNER_FLEE_SPEED; // matched speed is the tell — they pace the runner exactly
      m.factionId = mask;
      md.scanLabel = mask === 'faction_reach' ? 'REACH RAIDER' : 'MTS RETAINED ESCORT';
      packIds.push(m.id);
    }
    {
      const rd = runner.data || (runner.data = {});
      const ai = rd.ai || (rd.ai = {});
      rd.scanLabel = 'QUIET RUNNER — SEALED HOLD';
      rd.runner = true;
      if (!runner.vel) runner.vel = { x: 0, z: 0 };
      runner.vel.x = RUNNER_FLEE_SPEED;
      ai.fleeing = true;
    }
    // Its cargo is already written up as recovered contraband — the paperwork preceded the ambush.
    const crate = d.spawnCargoPod(live, {
      pos: { x: runner.pos.x + 30, z: runner.pos.z }, vel: { x: RUNNER_FLEE_SPEED, z: 0 },
      commodityId: 'cmdty_contraband_med', amount: 3, unitMass: 8,
      ownerName: 'HELIX EVIDENCE (PENDING)', factionId: 'faction_helix',
    });
    if (crate && crate.data) {
      crate.data.scanLabel = 'SEALED CRATE — LOGGED AS RECOVERED CONTRABAND';
      crate.data.evidenceLogged = true;
    }

    live.data.pack = {
      packId, mask, memberIds: packIds, runnerId: runner.id,
      crateId: crate ? crate.id : null,
    };
    live.phase = 'conflict';
    d.say(live, 'alert',
      'Reach raiders on a Quiet runner — tight formation. Almost too tight.',
      null, { primary: true, literal: true });
    d.emit('comms:log', {
      from: 'QUIET RUNNER',
      text: '…',
      kind: 'encounter',
    });
  },

  event(d, live, state, name, payload) {
    const rec = live.data && live.data.pack;
    if (!rec || live.phase === 'done') return;
    if ((name === 'entityGone' || name === 'squadKill') && payload) {
      if (payload.id === rec.runnerId) {
        // FF: the runner dies and Helix sells its cargo at Bourse — the paperwork
        // already said it was theirs.
        releaseCast(live);
        return d.resolve(live, 'runner_lost', { speak: true });
      }
      if (rec.memberIds.includes(payload.id)) {
        const alive = rec.memberIds.filter((id) => {
          const m = state.entities.get(id);
          return m && m.alive !== false;
        });
        if (!alive.length) {
          releaseCast(live);
          return d.resolve(live, 'pack_down', { speak: true });
        }
      }
    }
  },

  tick(d, live, state, now) {
    if (live.phase === 'done') return;
    const rec = live.data.pack;
    if (!rec) return;
    const player = d.player();
    if (!player || player.alive === false) {
      releaseCast(live);
      return d.resolve(live, 'subject_gone', { speak: false });
    }

    // The tell breaks: any member whose flag dropped means the pattern broke — the whole
    // pack's paperwork just went Helix (faction_helix writes the stamp; we read it).
    const members = rec.memberIds.map((id) => state.entities.get(id)).filter(Boolean);
    if (members.some((m) => m.data && m.data.falseFlagDropped === true)) {
      d.rep('faction_helix', -2, 'too_perfect_flags_dropped');
      d.emit('comms:log', {
        from: 'HELIX ADJUDICATOR',
        text: 'Lawful interdiction. Under orders. You saw nothing but paperwork.',
        kind: 'encounter',
      });
      releaseCast(live);
      return d.resolve(live, 'flags_dropped', { speak: true });
    }
    const runner = state.entities.get(rec.runnerId);
    if (!runner || runner.alive === false) {
      releaseCast(live);
      return d.resolve(live, 'runner_lost', { speak: true });
    }
    if (!members.some((m) => m.alive !== false)) {
      releaseCast(live);
      return d.resolve(live, 'pack_down', { speak: true });
    }

    // The runner keeps fleeing while the pack paces it — the encounter resolves when the
    // pocket leaves the field.
    if (player.pos) {
      const dx = player.pos.x - runner.pos.x, dz = player.pos.z - runner.pos.z;
      if (dx * dx + dz * dz > 2600 * 2600) {
        releaseCast(live);
        return d.resolve(live, 'walked_away', { speak: false });
      }
    }
    if (now >= live.deadlineAt) {
      releaseCast(live);
      return d.resolve(live, 'pack_departed', { speak: false });
    }
  },
});

export default defineEncounter(trigger, {
  shape: {
    situation: 'ambush',
    place: trigger.zoneTypes,
    twist: 'none',
    actor: 'faction_helix',
  },
  motive: 'lawful_interdiction',
  engagementTrigger: 'authorized_hostile_spawn',
  factionId: 'faction_helix',
  context: 'patrol',
  title: 'THE TOO-PERFECT PACK',
  primaryLine: 'Reach raiders on a Quiet runner — tight formation. Almost too tight.',
  squad: {
    archetypes: ['wasp_swarmer', 'reaver_pirate'],
    size: [4, 4],
    doctrine: 'official',
    formation: 'wedge',
  },
  escort: {
    archetypes: ['quiet_ghost'],
    size: [1, 1],
    doctrine: 'ghost',
    formation: 'none',
    factionId: 'faction_quiet',
    context: 'civilian',
    passive: true,
  },
  choices: [],
  bark: null,
  telegraph: 'A raider pack in perfect diamond formation runs down a Quiet runner.',
  deadlineS: DEADLINE_S,
  aftermath: {
    flee: 'The pack holds its diamond as it leaves the field.',
    kill: 'The Directorate files the wreckage as recovered contraband.',
  },
  receipts: {
    flags_dropped: 'FLAGS DROPPED — the pattern broke and every transponder went HELIX.',
    pack_down: 'The pack is wreckage. The invoice stays open.',
    runner_lost: 'The runner died masked as a seizure. Helix sells its cargo at Bourse.',
    pack_departed: 'The diamond left the field intact. Whatever it was, it filed itself.',
    walked_away: 'You let the pattern pass. It keeps somebody else’s books now.',
    subject_gone: 'The audit closes itself.',
  },
});
