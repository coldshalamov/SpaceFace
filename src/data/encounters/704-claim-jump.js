// 704 — CLAIM JUMP (E-06, Drift signature). Two Drift crews feud over a seam, and one has
// already played the canon betrayal: a charge drifts toward the keystone hanging over the
// shaft mouth where the other crew is still digging. Three honest answers —
//
//   * BRACE: latch the keystone and hold it — the Line carries the load until the shaft
//     clears (the charge may still hit first; brace is a race);
//   * VENT: latch the charge and fling it into open space — no detonation, but the
//     keystone still needs bracing after;
//   * LET IT FALL: the collapse happens and the survivors owe you — or hate you.
//
// Killing the saboteur picks the miners' side; killing a miner picks the betrayer's.
import { deepFreeze, defineEncounter } from './catalog.js';
import { faction as DMC } from '../factions/dmc.js';

export const encounterOrder = 704;
export const trigger = deepFreeze({
  id: 'claim_jump',
  tier: 'minor',
  deck: 'civilian',
  weight: 1.0,
  zoneTypes: ['mining_belt', 'derelict_field', 'refinery_approach'],
  script: 'selfRegistered',
  fallbackScript: 'traderRun',
  pressureCost: 26,
  cooldownS: 1000,
  proximity: true,
  fireWithinWu: 620,
  gates: {},
});

const CFG = (DMC.custom && DMC.custom.claimJump) || {};
const BRACE_HOLD_S = Math.max(0.5, Number(CFG.braceHoldS) || 3);
const FLING_WU = Math.max(100, Number(CFG.chargeFlingWu) || 700);
const CHARGE_FLIGHT_S = Math.max(4, Number(CFG.chargeFlightS) || 14);
const BLAST_WU = 46;             // the charge is "on" the keystone inside this
const DEADLINE_S = 120;

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
    const rng = d.stream(live, 'jump_layout');

    // Cast: the shaft crew digging below, the saboteur who lit the fuse and is already
    // leaving, and the keystone + charge as props.
    const miners = ships.filter((s) => s && s.role === 'escort');
    const saboteurSpec = ships.find((s) => s && s.role === 'squad');
    miners.forEach((s, i) => {
      const a = (i / Math.max(1, miners.length)) * Math.PI * 2;
      s.pos = { x: center.x + Math.cos(a) * 90, z: center.z + Math.sin(a) * 90 };
      s.factionId = 'faction_dmc';
    });
    if (saboteurSpec) {
      saboteurSpec.pos = { x: center.x + 900, z: center.z + 300 };
      saboteurSpec.factionId = 'faction_dmc'; // the betrayal is in-house — two crews feud
    }
    const ids = d.spawnShips(live, [saboteurSpec, ...miners].filter(Boolean));
    if (!ids.length) return d.abort(live, 'no_budget');
    const saboteur = d.entsOf(live, 'squad')[0] || null;
    const diggers = d.entsOf(live, 'escort');
    if (!saboteur || !diggers.length) return d.abort(live, 'no_cast');
    {
      const sd = saboteur.data || (saboteur.data = {});
      const ai = sd.ai || (sd.ai = {});
      sd.scanLabel = 'DMC SABOTEUR — FUSE LIT, LEAVING';
      if (!saboteur.vel) saboteur.vel = { x: 0, z: 0 };
      saboteur.vel.x = 30; // already walking it off
    }
    for (const m of diggers) {
      const md = m.data || (m.data = {});
      const ai = md.ai || (md.ai = {});
      md.scanLabel = 'DMC SHAFT CREW — DIGGING';
      ai.passive = true; ai.holdPosition = true;
    }

    // The keystone: the big rock over the shaft mouth — tetherable, and already cracked.
    const keystone = d.spawnProp(live, {
      pos: { x: center.x, z: center.z - 40 },
      radius: 55, mass: 4800,
      scanLabel: 'KEYSTONE — CRACKED, HOLDING THE SHAFT',
      storyPropKind: 'claim_keystone',
    });
    // The charge: a slow ballistic packet the saboteur left drifting in on the keystone.
    const chargeStart = {
      x: center.x + (rng() - 0.5) * 160,
      z: center.z + (CHARGE_FLIGHT_S * 30) * -1,
    };
    const charge = d.spawnProp(live, {
      pos: chargeStart,
      radius: 8, mass: 30,
      scanLabel: 'SHAFT CHARGE — LIVE, DRIFTING IN',
      storyPropKind: 'claim_charge',
    });
    if (!keystone || !charge) return d.abort(live, 'no_bodies');
    {
      const kd = keystone.data || (keystone.data = {});
      kd.keystone = true;
      const cd = charge.data || (charge.data = {});
      cd.shaftCharge = true;
      // Drift-in on the keystone at a steady pace — the fuse is a distance, not a clock.
      const dx = keystone.pos.x - charge.pos.x, dz = keystone.pos.z - charge.pos.z;
      const dist = Math.hypot(dx, dz) || 1;
      charge.vel.x = (dx / dist) * (dist / CHARGE_FLIGHT_S);
      charge.vel.z = (dz / dist) * (dist / CHARGE_FLIGHT_S);
    }

    live.data.jump = {
      keystoneId: keystone.id, chargeId: charge.id,
      saboteurId: saboteur.id, minerIds: diggers.map((m) => m.id),
      braceS: 0, ventedBy: null, lastNow: null,
    };
    live.phase = 'conflict';
    d.say(live, 'alert',
      'SHAFT CREW: That charge is coming in on our keystone! Hold the rock or kill the charge — pick one!',
      null, { primary: true, literal: true });
    d.emit('comms:log', {
      from: 'DMC SABOTEUR',
      text: 'Claim\'s ours when the dust settles. Nothing personal.',
      kind: 'encounter',
    });
  },

  event(d, live, state, name, payload) {
    const rec = live.data && live.data.jump;
    if (!rec || live.phase === 'done') return;
    if (name === 'tetherAttached' && payload) {
      const playerId = (d.player() && d.player().id) || state.playerId;
      const byPlayer = payload.actorId === playerId || payload.controllerId === playerId || !playerId;
      if (!byPlayer) return;
      if (payload.targetId === rec.keystoneId) {
        const keystone = state.entities.get(rec.keystoneId);
        if (keystone && keystone.data) keystone.data.braceBy = 'player';
        d.emit('comms:log', { from: 'SHAFT CREW', text: 'He\'s on the rock! Hold it!', kind: 'encounter' });
      }
      if (payload.targetId === rec.chargeId) rec.ventedBy = 'player';
      return;
    }
    if ((name === 'entityGone' || name === 'squadKill') && payload) {
      if (payload.id === rec.saboteurId) {
        d.rep('faction_dmc', 3, 'claim_jump_saboteur_downed');
        releaseCast(live);
        return d.resolve(live, 'saboteur_downed', { speak: true });
      }
      if (rec.minerIds.includes(payload.id) && payload.byPlayer === true) {
        d.rep('faction_dmc', -4, 'claim_jump_miner_downed');
        releaseCast(live);
        return d.resolve(live, 'side_picked', { speak: true });
      }
    }
  },

  tick(d, live, state, now) {
    if (live.phase === 'done') return;
    const rec = live.data.jump;
    if (!rec) return;
    const dt = rec.lastNow == null ? 0 : Math.max(0, Math.min(0.5, now - rec.lastNow));
    rec.lastNow = now;
    const keystone = state.entities.get(rec.keystoneId);
    const charge = state.entities.get(rec.chargeId);

    if (keystone && charge) {
      const dx = charge.pos.x - keystone.pos.x, dz = charge.pos.z - keystone.pos.z;
      const dist2 = dx * dx + dz * dz;

      // The brace: the Line is on the rock and the rock is holding.
      if (keystone.data && keystone.data.braceBy === 'player') {
        rec.braceS += dt;
        if (rec.braceS >= BRACE_HOLD_S) {
          d.rep('faction_dmc', 4, 'claim_jump_shaft_braced');
          releaseCast(live);
          return d.resolve(live, 'shaft_braced', { speak: true });
        }
      }

      // The vent: latched and flung — the charge is dead space junk now.
      if (rec.ventedBy === 'player' && dist2 > FLING_WU * FLING_WU) {
        releaseCast(live);
        return d.resolve(live, 'charge_vented', { speak: true });
      }

      // The detonation: the charge arrives and the shaft comes down on the crew.
      if (dist2 <= BLAST_WU * BLAST_WU) {
        if (charge.alive !== false) charge.alive = false;
        for (const id of rec.minerIds) {
          const miner = state.entities.get(id);
          if (miner && miner.data) miner.data.buried = true;
        }
        if (keystone.data) { keystone.data.collapsed = true; keystone.data.braceBy = null; }
        d.rep('faction_dmc', -4, 'claim_jump_shaft_collapsed');
        releaseCast(live);
        return d.resolve(live, 'shaft_collapsed', { speak: true });
      }
    }

    if (now >= live.deadlineAt) {
      releaseCast(live);
      return d.resolve(live, 'walked_away', { speak: false });
    }
  },
});

export default defineEncounter(trigger, {
  shape: {
    situation: 'claim',
    place: trigger.zoneTypes,
    twist: 'none',
    actor: 'faction_dmc',
  },
  motive: 'claim_defense',
  engagementTrigger: 'none',
  factionId: 'faction_dmc',
  context: 'civilian',
  title: 'CLAIM JUMP',
  primaryLine: 'SHAFT CREW: That charge is coming in on our keystone! Hold the rock or kill the charge!',
  squad: {
    archetypes: ['mule_trader'],
    size: [1, 1],
    doctrine: 'blue-collar',
    formation: 'none',
    passive: true,
  },
  escort: {
    archetypes: ['mule_trader'],
    size: [2, 3],
    doctrine: 'blue-collar',
    formation: 'none',
    factionId: 'faction_dmc',
    context: 'civilian',
    passive: true,
  },
  choices: [],
  bark: null,
  telegraph: 'A Drift shaft crew digs under a cracked keystone while a live charge drifts in.',
  deadlineS: DEADLINE_S,
  aftermath: {
    flee: 'The feud settles itself in dust.',
    kill: 'The claim goes to whoever writes the report.',
  },
  receipts: {
    shaft_braced: 'BRACED — the Line held the rock. The shaft crew owes you a shift\'s share.',
    charge_vented: 'VENTED — the charge burned out in open space. The keystone still stands.',
    shaft_collapsed: 'COLLAPSED — the shaft came down on the crew. The feud has a grave now.',
    saboteur_downed: 'The saboteur is wreckage. The shaft crew saw who swung it.',
    side_picked: 'You picked the betrayer\'s side. The vein remembers who bled for it.',
    walked_away: 'The claim decides itself behind you.',
    subject_gone: 'The seam keeps its secrets.',
  },
});
