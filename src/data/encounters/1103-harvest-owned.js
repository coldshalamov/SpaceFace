// 1103 — THE HARVEST SOMEBODY ELSE OWNS (SFQ-M M34). A battle left a survey core loose in a wreck
// drift — your salvage claim, unprotected. A precursor Sorter has already classified it for
// reduction and its intake field is drawing the core in, slowly enough for an ordinary pilot.
//
//   * recover first: latch the core and haul it out of the draw before the intake takes it;
//   * change its class: scan the core up close to log it, then present that reading to the Sorter;
//     the machine recognizes custody, reclassifies the core PRESERVE and stops it dead itself.
//
// The draw and the stop are real impulses through the physics authority. A core the Sorter takes
// is not deleted: it comes out of the discharge as a lesser, recoverable lot of scrap and alloys.
import { deepFreeze, defineEncounter } from './catalog.js';
import { queuePhysicsImpulse } from '../../core/physicsAuthority.js';

export const encounterOrder = 1103;
export const trigger = deepFreeze({
  id: 'harvest_owned',
  tier: 'minor',
  deck: 'civilian',
  weight: 1,
  zoneTypes: ['derelict_field'],
  script: 'selfRegistered',
  pressureCost: 14,
  cooldownS: 1500,
  proximity: true,
  gates: {
    sectorIds: ['sector_ceres_belt', 'sector_io_reach', 'sector_vesta_forge'],
  },
});

const WINDOW_S = 300;
const SORTER_RADIUS = 16;
const CORE_RADIUS = 8;
const CORE_MASS = 50;
const CORE_START_WU = 720;
const DRAW_WU = 1000;
const DRAW_ACCEL = 0.6;            // ~48 s from rest to the intake: warning time, not a twitch test
const ESCAPE_WU = 1150;
const INTAKE_PAD_WU = 20;
const TAG_SCAN_WU = 90;
const PRESENT_SCAN_WU = 160;
const MAX_STEP_S = 1.5;
const CLEAR_WU = 60;
const LAYOUT_TRIES = 30;
const LAYOUT_STEP_WU = 150;
const CLAIM_PAY = 380;
const CLAIM_FACTION = 'faction_free';
const MACHINE_FACTION = 'faction_archive';
const REDUCED_OUTPUT = Object.freeze({ cmdty_scrap_metal: 4, cmdty_alloys: 1 });
const OUTPUT_TTL_S = 600;

const dist = (a, b) => Math.hypot(a.x - b.x, a.z - b.z);

function blockersNear(state, center, radius) {
  const out = [];
  for (const e of state.entityList || []) {
    if (!e || e.alive === false || !e.pos || e.id === state.playerId) continue;
    if (!(Number(e.radius) > 0) || e.type === 'projectile' || e.type === 'fx' || e.type === 'pickup') continue;
    if (dist(e.pos, center) <= radius) out.push(e);
  }
  return out;
}

function findLayout(state, center, rng) {
  const blockers = blockersNear(state, center, CORE_START_WU + 400);
  const dir0 = rng() * Math.PI * 2;
  let best = null;
  for (let i = 0; i < LAYOUT_TRIES; i++) {
    const ring = Math.floor(i / 6);
    const sorter = i === 0 ? { x: center.x, z: center.z } : {
      x: center.x + Math.cos(dir0 + i * 1.047) * ring * LAYOUT_STEP_WU,
      z: center.z + Math.sin(dir0 + i * 1.047) * ring * LAYOUT_STEP_WU,
    };
    const ang = dir0 + i * 0.83;
    const dir = { x: Math.cos(ang), z: Math.sin(ang) };
    const layout = {
      sorter,
      dir,
      core: { x: sorter.x + dir.x * CORE_START_WU, z: sorter.z + dir.z * CORE_START_WU },
      discharge: { x: sorter.x - dir.x * 70, z: sorter.z - dir.z * 70 },
    };
    let blocked = 0;
    for (let k = 0; k <= 6; k++) {
      const q = { x: sorter.x + dir.x * CORE_START_WU * (k / 6), z: sorter.z + dir.z * CORE_START_WU * (k / 6) };
      for (const r of blockers) if (dist(r.pos, q) < (r.radius || 0) + CLEAR_WU) blocked++;
    }
    if (blocked === 0) return layout;
    if (!best || blocked < best.blocked) best = { layout, blocked };
  }
  return best.layout;
}

function entityById(state, id) {
  return id != null && state.entities ? state.entities.get(id) || null : null;
}

function alive(e) { return !!e && e.alive !== false; }

function kick(state, e, dvx, dvz, kind) {
  const m = Number(e.mass) || CORE_MASS;
  return queuePhysicsImpulse(e, { x: dvx * m, y: 0, z: dvz * m }, {
    provenance: 'encounter:harvest_owned', tick: state.tick | 0, kind,
  });
}

export const runtime = Object.freeze({
  fire(d, live, state) {
    const center = (live.plan && live.plan.zoneCenter) || live.anchor;
    if (!center || !Number.isFinite(center.x)) return d.abort(live, 'no_zone_anchor');
    const layout = findLayout(state, center, d.stream(live, 'm34_layout'));
    const sorter = d.spawnProp(live, {
      type: 'machine', pos: layout.sorter, radius: SORTER_RADIUS, mass: 1e6, tetherable: false,
      scanLabel: 'SORTER — CLASSIFYING DEBRIS FOR REDUCTION', storyPropKind: 'm34_sorter',
    });
    const core = d.spawnProp(live, {
      type: 'payload', pos: layout.core, radius: CORE_RADIUS, mass: CORE_MASS, tetherable: true,
      scanLabel: 'SURVEY CORE — YOUR SALVAGE CLAIM, UNPROTECTED', storyPropKind: 'm34_survey_core',
    });
    if (!sorter || !core) return d.abort(live, 'no_bodies');
    sorter.data.masslineTetherable = false;
    // The catalogue Debris Sorter silhouette; no homeSectorId, so the Verge machine layer never drives it.
    sorter.data.machine = { kind: 'debris_sorter', anchor: { ...layout.sorter }, t: 0, phase: 0, encounterOwned: true };
    core.physicsBody = { shape: 'ball', mass: CORE_MASS, dynamic: true };
    core.data.masslineTetherable = true;

    const now = d.now();
    live.data.harvest = {
      sorterId: sorter.id,
      coreId: core.id,
      discharge: { ...layout.discharge },
      tagged: false,
      preserved: false,
      lastPulseSeq: -1,
      lastTickAt: null,
      settled: false,
      outcome: null,
    };
    live.deadlineAt = now + WINDOW_S;
    live.phase = 'drawing';
    live.approach = { signal: 'sorter_intake', contacts: 2, t: now };
    d.say(live, 'alert',
      'CLAIMS DESK: That survey core is yours by claim, but a Sorter has tagged it for reduction and its intake is pulling it in. Haul it out of the draw — or log it and show the Sorter it is owned.',
      null, { primary: true, literal: true });
  },

  event(d, live, state, name, payload) {
    const h = live.data && live.data.harvest;
    if (!h || live.phase === 'done' || h.settled || name !== 'scanPulse' || !payload || !payload.pos) return;
    const player = d.player();
    if (payload.source !== 'player-scanner' || !player || payload.scannerId !== player.id) return;
    if (Number.isFinite(payload.seq)) {
      if (payload.seq <= h.lastPulseSeq) return;
      h.lastPulseSeq = payload.seq;
    }
    const core = entityById(state, h.coreId);
    const sorter = entityById(state, h.sorterId);
    if (!alive(core) || !alive(sorter)) return;
    if (!h.tagged && dist(payload.pos, core.pos) <= TAG_SCAN_WU) {
      h.tagged = true;
      core.data.scanLabel = 'SURVEY CORE — CLAIM LOGGED, PRESENT TO THE SORTER';
      d.say(live, 'alert', 'SCAN: Claim and provenance logged on the core. Show the Sorter.', null, { literal: true });
      return;
    }
    if (h.tagged && dist(payload.pos, sorter.pos) <= PRESENT_SCAN_WU) {
      h.preserved = true;
      kick(state, core, -(core.vel?.x || 0), -(core.vel?.z || 0), 'sorter_set_aside');
      d.say(live, 'alert', 'SORTER: CUSTODY RECOGNIZED. RECLASSIFIED — PRESERVE.', null, { literal: true });
      return this._settle(d, live, h, 'preserved');
    }
  },

  tick(d, live, state, now) {
    const h = live.data && live.data.harvest;
    if (!h || live.phase === 'done' || h.settled) return;
    const step = Math.min(MAX_STEP_S, Math.max(0, now - (h.lastTickAt == null ? now : h.lastTickAt)));
    h.lastTickAt = now;
    const player = d.player();
    if (!alive(player)) return this._settle(d, live, h, 'lost');
    const core = entityById(state, h.coreId);
    const sorter = entityById(state, h.sorterId);
    if (!alive(core)) return this._settle(d, live, h, 'destroyed');
    if (!alive(sorter)) return this._settle(d, live, h, 'lost');
    const r = dist(core.pos, sorter.pos);
    if (r <= SORTER_RADIUS + CORE_RADIUS + INTAKE_PAD_WU) return this._settle(d, live, h, 'processed');
    if (r >= ESCAPE_WU) return this._settle(d, live, h, 'recovered');
    if (r <= DRAW_WU && step > 0) {
      const ux = (sorter.pos.x - core.pos.x) / r, uz = (sorter.pos.z - core.pos.z) / r;
      kick(state, core, ux * DRAW_ACCEL * step, uz * DRAW_ACCEL * step, 'sorter_draw');
    }
    if (now >= live.deadlineAt) return this._settle(d, live, h, 'lapsed');
  },

  _settle(d, live, h, outcome) {
    if (h.settled) return;
    h.settled = true;
    h.outcome = outcome;
    const core = entityById(d.state, h.coreId);
    if (outcome === 'recovered') {
      d.grant(CLAIM_PAY, 'harvest_owned:recovered');
      d.rep(CLAIM_FACTION, 2, 'harvest_owned_recovered');
      if (alive(core)) core.data.scanLabel = 'SURVEY CORE — RECOVERED UNDER CLAIM';
    } else if (outcome === 'preserved') {
      d.grant(CLAIM_PAY, 'harvest_owned:preserved');
      d.rep(MACHINE_FACTION, 3, 'harvest_owned_preserved');
      if (alive(core)) core.data.scanLabel = 'PRESERVED — THE SORTER SET IT ASIDE';
    } else if (outcome === 'processed') {
      // The prize is reduced, not erased: the core becomes the lots the discharge throws out.
      if (alive(core)) core.alive = false;
      for (const [commodityId, qty] of Object.entries(REDUCED_OUTPUT)) {
        const lot = d.spawnFreightPickup(live, { pos: { ...h.discharge }, commodityId, qty, ttlS: OUTPUT_TTL_S });
        if (lot && lot.data) lot.data.scanLabel = 'SORTER OUTPUT — REDUCED FROM YOUR CORE';
      }
    }
    return d.resolve(live, outcome, { speak: true });
  },
});

export default defineEncounter(trigger, {
  shape: {
    situation: 'salvage',
    place: trigger.zoneTypes,
    twist: 'none',
    actor: MACHINE_FACTION,
  },
  factionId: CLAIM_FACTION,
  title: 'THE HARVEST SOMEBODY ELSE OWNS',
  primaryLine: 'CLAIMS DESK: That survey core is yours by claim, but a Sorter has tagged it for reduction and its intake is pulling it in. Haul it out of the draw — or log it and show the Sorter it is owned.',
  verbs: ['scan', 'latch', 'tow', 'present'],
  bark: null,
  deadlineS: WINDOW_S,
  receipts: {
    recovered: 'RECOVERED — the core is out of the draw and the claims desk pays full value.',
    preserved: 'PRESERVED — the Sorter recognized your custody and set the core aside. Full value paid.',
    processed: 'The Sorter reduced the core. Scrap and alloys come out of the discharge — that is all that is left.',
    destroyed: 'The core was destroyed before anyone could keep it.',
    lapsed: 'The claim window closed with the core still in the drift.',
    lost: 'The claim ended without you.',
  },
});
