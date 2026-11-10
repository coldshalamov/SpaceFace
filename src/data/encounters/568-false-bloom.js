// 568 — FALSE BLOOM (M10). Traffic shut a derelict drift on a "bloom" (contamination) report. A
// salvage hand suspects a planted lamp. The report is a lie you can prove two ways, both physical:
//
//   * careful scanning — scan the reported hulk, scan a clean reference hulk (same lane, same
//     week), then scan the emitter clamped to the quarantined hulk up close;
//   * motion — latch the clamped emitter with the Massline and drag it clear: the "bloom" rides
//     with the emitter, not the hull.
//
// Proof draws the people who planted it: two claim-jumpers arrive hostile. Hold them off while the
// hand files the finding and it pays. Smash the emitter before the proof exists and the proof is
// slag. Nothing here is a menu: assess, approach, commit, complication, resolve, aftermath.
import { deepFreeze, defineEncounter } from './catalog.js';

export const encounterOrder = 568;
export const trigger = deepFreeze({
  id: 'false_bloom',
  tier: 'minor',
  deck: 'civilian',
  weight: 1.2,
  zoneTypes: ['derelict_field'],
  script: 'selfRegistered',
  pressureCost: 18,
  cooldownS: 1200,
  proximity: true,
});

const WINDOW_S = 240;
const FOCUS_WU = 170;              // a scan pulse credits the hulk it is closest to, inside this
const EMITTER_SCAN_WU = 90;        // "up close" on the emitter
const TOW_CLEAR_WU = 180;          // the emitter this far from the hulk has really moved
const REFERENCE_SEP_WU = 260;
const EMITTER_GAP_WU = 20;         // clamped beside the hulk, clear of its ~13 WU capsule so spawn resolution cannot shove it
const HAND_OFFSET_WU = 130;
const CLEAR_WU = 60;               // nothing spawns closer than this to a rock's surface
const LAYOUT_TRIES = 36;
const LAYOUT_STEP_WU = 140;
const JUMPER_RANGE_WU = [600, 700];
const JUMPER_ARRIVE_WU = 380;
const JUMPER_STAGGER_WU = 320;     // the second hull trails the first by a few seconds of flight
const HAND_HULL_MULT = 2.2;        // a working hand, not a paper one: protecting it must be possible
const HAND_SHIELD_MULT = 2;
const FILING_HOLD_S = 45;
const JUMPER_STUCK_S = 150;        // jumpers exist but none ever came near anyone
const JUMPER_RETRY_EVERY_S = 2;
const JUMPER_RETRY_FOR_S = 20;
const UNDISTURBED_HOLD_S = 30;     // budget denied every jumper: the hand files only after this
const BASE_PAY = 380;
const COMPARISON_BONUS = 140;
const EMITTER_RADIUS = 4;
const EMITTER_MASS = 6;

const QUARANTINED_POOL = Object.freeze({ cmdty_scrap_metal: 6, cmdty_alloys: 3, cmdty_electronics: 2 });
const REFERENCE_POOL = Object.freeze({ cmdty_scrap_metal: 2 });

const dist = (a, b) => Math.hypot(a.x - b.x, a.z - b.z);

function blockersNear(state, center, radius, ignoreId) {
  const out = [];
  for (const e of state.entityList || []) {
    if (!e || e.alive === false || !e.pos || e.id === ignoreId) continue;
    if (!(Number(e.radius) > 0) || e.type === 'projectile' || e.type === 'fx' || e.type === 'pickup') continue;
    if (dist(e.pos, center) <= radius) out.push(e);
  }
  return out;
}

function blockedCount(blockers, points) {
  let n = 0;
  for (const p of points) {
    for (const r of blockers) {
      if (dist(r.pos, p) < (r.radius || 0) + CLEAR_WU) n++;
    }
  }
  return n;
}

/** Cast layout in clear space: quarantined hulk H, reference hulk 260 WU along `dir`, emitter
 * beside H, the hand off to one side. The hulk site is offset-and-checked against every body
 * with a radius (rocks, stations, wrecks, live ships, machines) on a deterministic ring walk; if
 * nothing is fully clear the least-blocked candidate wins. */
function findLayout(state, center, rng, ignoreId) {
  const blockers = blockersNear(state, center, 2600, ignoreId);
  const dir0 = rng() * Math.PI * 2;
  let best = null;
  for (let i = 0; i < LAYOUT_TRIES; i++) {
    const ring = Math.floor(i / 6);
    const base = i === 0
      ? { x: center.x, z: center.z }
      : {
        x: center.x + Math.cos(dir0 + i * 1.047) * ring * LAYOUT_STEP_WU,
        z: center.z + Math.sin(dir0 + i * 1.047) * ring * LAYOUT_STEP_WU,
      };
    const ang = dir0 + i * 0.7;
    const dx = Math.cos(ang), dz = Math.sin(ang);
    const layout = {
      hulk: base,
      reference: { x: base.x + dx * REFERENCE_SEP_WU, z: base.z + dz * REFERENCE_SEP_WU },
      emitter: { x: base.x - dx * EMITTER_GAP_WU, z: base.z - dz * EMITTER_GAP_WU },
      hand: { x: base.x - dz * HAND_OFFSET_WU - dx * 40, z: base.z + dx * HAND_OFFSET_WU - dz * 40 },
      dir: { x: dx, z: dz },
    };
    const blocked = blockedCount(blockers, [layout.hulk, layout.reference, layout.emitter, layout.hand]);
    if (blocked === 0) return layout;
    if (!best || blocked < best.blocked) best = { layout, blocked };
  }
  return best.layout;
}

function entityById(state, id) {
  return id != null && state.entities ? state.entities.get(id) || null : null;
}

function alive(e) { return !!e && e.alive !== false; }

function isDisengaged(jumper) {
  const ai = jumper && jumper.data && jumper.data.ai;
  return !!ai && (ai.passive === true || ai.roe === 'hold_fire' || ai.pirateDisengaged === true);
}

export const runtime = Object.freeze({
  fire(d, live, state) {
    const ships = (live.plan && live.plan.ships) || [];
    const handSpec = ships.find((sh) => sh && sh.role === 'hand');
    const jumperSpecs = ships.filter((sh) => sh && sh.role === 'jumper');
    if (!handSpec) return d.abort(live, 'no_cast');
    const center = (live.plan && live.plan.zoneCenter) || live.anchor;
    if (!center || !Number.isFinite(center.x)) return d.abort(live, 'no_zone_anchor');

    const layout = findLayout(state, center, d.stream(live, 'false_bloom_layout'), state.playerId);
    handSpec.pos = { ...layout.hand };
    handSpec.factionId = 'faction_free';
    handSpec.passive = true;
    const ids = d.spawnShips(live, [handSpec]);
    if (!ids.length || d.aliveCount(live, 'hand') < 1) return d.abort(live, 'no_budget');
    const hand = d.entsOf(live, 'hand')[0];
    if (hand && hand.data) hand.data.scanLabel = 'SALVAGE HAND — SUSPECTS A LAMP';
    if (hand) {
      if (Number.isFinite(hand.hullMax)) { hand.hullMax = Math.round(hand.hullMax * HAND_HULL_MULT); hand.hull = hand.hullMax; }
      if (Number.isFinite(hand.shieldMax)) { hand.shieldMax = Math.round(hand.shieldMax * HAND_SHIELD_MULT); hand.shield = hand.shieldMax; }
    }

    const hulk = d.spawnWreck(live, {
      pos: layout.hulk, pool: { ...QUARANTINED_POOL },
      scanLabel: 'QUARANTINED HULK — BLOOM REPORTED', storyPropKind: 'false_bloom_hulk',
    });
    const reference = d.spawnWreck(live, {
      pos: layout.reference, pool: { ...REFERENCE_POOL },
      scanLabel: 'REFERENCE HULK — SAME LANE, SAME WEEK', storyPropKind: 'false_bloom_reference',
    });
    const emitter = d.spawnProp(live, {
      type: 'beacon', pos: layout.emitter, radius: EMITTER_RADIUS, mass: EMITTER_MASS, tetherable: true,
      scanLabel: 'CLAMPED EMITTER', storyPropKind: 'false_bloom_emitter',
    });
    if (!hulk || !reference || !emitter) return d.abort(live, 'no_bodies');
    if (emitter.data) emitter.data.masslineTetherable = true;

    const now = d.now();
    live.data.bloom = {
      hulkId: hulk.id,
      referenceId: reference.id,
      emitterId: emitter.id,
      hulkPos: { ...layout.hulk },
      referencePos: { ...layout.reference },
      evidence: { hulk: false, reference: false },
      proof: null,
      towHinted: false,
      jumperSpecs: jumperSpecs.map((sh) => ({ ...sh })),
      jumpersAt: null,
      jumpersSpawned: 0,
      jumperAttempts: 0,
      jumperRetryAt: null,
      jumperGiveUpAt: null,
      jumpersArrivedAt: null,
      lastPulseSeq: -1,
      settled: false,
    };
    live.deadlineAt = now + WINDOW_S;
    live.phase = 'assess';
    live.approach = { signal: 'bloom_report_and_lamp', contacts: ids.length + 3, t: now };
    d.say(live, 'alert',
      'SALVAGE HAND: Traffic shut this drift on a bloom report. Smells like a lamp. Scan both hulks — then pull that emitter off and watch where the bloom goes.',
      null, { primary: true, literal: true });
  },

  event(d, live, state, name, payload) {
    const bloom = live.data && live.data.bloom;
    if (!bloom || live.phase === 'done' || bloom.settled) return;
    if (name === 'scanPulse') return this._scanPulse(d, live, payload, bloom);
    if (name === 'tetherAttached') {
      if (!payload || payload.targetId !== bloom.emitterId || bloom.towHinted || bloom.proof) return;
      bloom.towHinted = true;
      d.say(live, 'alert',
        'SALVAGE HAND: That\'s it — drag it clear. If the bloom rides with it, it\'s a lamp.',
        null, { literal: true });
    }
  },

  _scanPulse(d, live, payload, bloom) {
    if (!payload || !payload.pos || bloom.proof) return;
    const player = d.player();
    if (payload.source !== 'player-scanner' || !player || payload.scannerId !== player.id) return;
    if (Number.isFinite(payload.seq)) {
      if (payload.seq <= bloom.lastPulseSeq) return;
      bloom.lastPulseSeq = payload.seq;
    }
    const origin = payload.pos;
    const hulk = entityById(d.state, bloom.hulkId);
    const reference = entityById(d.state, bloom.referenceId);
    const emitter = entityById(d.state, bloom.emitterId);
    // Order matters: the comparison needs both baselines from EARLIER pulses.
    const hadBaselines = bloom.evidence.hulk && bloom.evidence.reference;
    if (hadBaselines && alive(emitter) && dist(origin, emitter.pos) <= EMITTER_SCAN_WU) {
      d.say(live, 'alert', 'SCAN — the emitter\'s carrier IS the bloom. It\'s a spoof.', null, { literal: true });
      return this._prove(d, live, bloom, 'comparison');
    }
    const dh = alive(hulk) ? dist(origin, hulk.pos) : Infinity;
    const dr = alive(reference) ? dist(origin, reference.pos) : Infinity;
    if (dh <= dr && dh <= FOCUS_WU && !bloom.evidence.hulk) {
      bloom.evidence.hulk = true;
      d.say(live, 'alert',
        'SCAN — the "bloom" is one hot point clamped to the hull. Real bloom spreads across plating.',
        null, { literal: true });
    } else if (dr < dh && dr <= FOCUS_WU && !bloom.evidence.reference) {
      bloom.evidence.reference = true;
      d.say(live, 'alert', 'SCAN — reference hulk reads clean. Same lane, same week, no bloom.', null, { literal: true });
    }
  },

  _prove(d, live, bloom, kind) {
    if (bloom.proof) return;
    bloom.proof = kind;
    live.phase = 'proven';
    bloom.jumpersAt = d.now();
    this._spawnJumpers(d, live, bloom);
    d.say(live, 'alert', 'SALVAGE HAND: Filing it now — keep them off me!', null, { literal: true });
  },

  /** The claim-jumpers come for their lamp: out from the SITE, aimed at the hand as well as the
   * player. Budget-denied spawns return nothing and are retried by tick(). */
  _spawnJumpers(d, live, bloom) {
    const attempt = bloom.jumperAttempts++;
    const hand = d.entsOf(live, 'hand')[0] || null;
    const rng = d.stream(live, `false_bloom_jumpers_${attempt}`);
    const bearing = rng() * Math.PI * 2;
    const range = JUMPER_RANGE_WU[0] + rng() * (JUMPER_RANGE_WU[1] - JUMPER_RANGE_WU[0]);
    const specs = (bloom.jumperSpecs.length ? bloom.jumperSpecs : [{ archetype: 'wasp_swarmer', level: 1 }]).slice(0, 2);
    while (specs.length < 2) specs.push({ ...specs[0] });
    // Out from the site as it stands NOW (a towed or shoved hulk is where it is), falling back to
    // the cast layout once the hulk is gone.
    const hulkNow = entityById(d.state, bloom.hulkId);
    const origin = alive(hulkNow) && hulkNow.pos ? hulkNow.pos : bloom.hulkPos;
    const placed = specs.map((sh, i) => {
      const a = bearing + (i === 0 ? -0.12 : 0.12);
      const reach = range + (i === 0 ? 0 : JUMPER_STAGGER_WU);
      return {
        ...sh,
        archetype: sh.archetype || 'wasp_swarmer',
        role: 'jumper',
        factionId: 'faction_reach',
        team: 1,
        context: 'encounter',
        passive: false,
        pos: { x: origin.x + Math.cos(a) * reach, z: origin.z + Math.sin(a) * reach },
        scanLabel: 'CLAIM-JUMPER — PLANTED THE LAMP',
      };
    });
    const ids = d.spawnShips(live, placed);
    if (!ids.length) {
      if (bloom.jumperGiveUpAt == null) bloom.jumperGiveUpAt = d.now() + JUMPER_RETRY_FOR_S;
      bloom.jumperRetryAt = d.now() + JUMPER_RETRY_EVERY_S;
      return;
    }
    bloom.jumpersSpawned += ids.length;
    bloom.jumperRetryAt = null;
    // The sanctioned explicit-target relation (engagementAuthority: retaliationTargetId outranks
    // the team-2 neutrality) is what lets a raider fire on the passive hand, not only the player.
    // Split jobs: the lead goes for the hand, the second for the player. Both stay hostile to the
    // player (encounter context), so the hand's survival window is the lead's alone while an absent
    // player can still lose it.
    const player = d.player();
    // By the ids spawnShips actually returned (spec order), not roster order: a partial grant can
    // never leave the lead aimed at the player or the second at the hand.
    ids.forEach((id, i) => {
      const j = entityById(d.state, id);
      const ai = j && j.data && j.data.ai;
      if (!ai) return;
      if (i === 0 && hand) ai.retaliationTargetId = hand.id;
      else if (player) ai.retaliationTargetId = player.id;
    });
    d.say(live, 'alert', "CLAIM-JUMPER: That lamp's ours, scrapper. Put it down.", null, { literal: true });
  },

  tick(d, live, state, now) {
    const bloom = live.data && live.data.bloom;
    if (!bloom || live.phase === 'done' || bloom.settled) return;
    const hand = d.entsOf(live, 'hand')[0] || null;
    const emitter = entityById(state, bloom.emitterId);
    const hulk = entityById(state, bloom.hulkId);

    if (!hand) return this._settle(d, live, bloom, 'client_lost');
    if (!bloom.proof) {
      if (!alive(emitter)) return this._settle(d, live, bloom, 'smashed');
      const hulkPos = alive(hulk) ? hulk.pos : bloom.hulkPos;
      if (dist(emitter.pos, hulkPos) >= TOW_CLEAR_WU) {
        d.say(live, 'alert', 'SCAN — the bloom moved with the emitter. Spoof confirmed.', null, { literal: true });
        this._prove(d, live, bloom, 'motion');
      } else if (now >= live.deadlineAt) {
        return this._settle(d, live, bloom, 'lapsed');
      }
      return;
    }

    if (bloom.jumpersSpawned === 0) {
      if (bloom.jumperRetryAt != null && now < bloom.jumperGiveUpAt) {
        if (now >= bloom.jumperRetryAt) this._spawnJumpers(d, live, bloom);
        return;
      }
      if (now - bloom.jumperGiveUpAt >= UNDISTURBED_HOLD_S) {
        return this._settle(d, live, bloom, 'filed');
      }
      return;
    }

    // A jumper that broke off (passive, hold-fire or flagged disengaged) is no longer a threat:
    // it loses its explicit fire authority on the hand, and once every live jumper has run or
    // died the hand files.
    const jumpers = d.entsOf(live, 'jumper').filter((j) => {
      if (!isDisengaged(j)) return true;
      const ai = j.data.ai;
      if (ai.retaliationTargetId === hand.id) delete ai.retaliationTargetId;
      if (ai.activity && ai.activity.targetId === hand.id) ai.activity.targetId = null;
      return false;
    });
    if (jumpers.length === 0) return this._settle(d, live, bloom, 'filed');
    if (bloom.jumpersArrivedAt == null) {
      const p = d.player();
      const arrived = jumpers.some((j) => j.pos && (dist(j.pos, hand.pos) <= JUMPER_ARRIVE_WU
        || (p && p.pos && dist(j.pos, p.pos) <= JUMPER_ARRIVE_WU)));
      if (arrived) bloom.jumpersArrivedAt = now;
      else if (now - bloom.jumpersAt >= JUMPER_STUCK_S) return this._settle(d, live, bloom, 'filed');
    }
    const held = bloom.jumpersArrivedAt != null && now - bloom.jumpersArrivedAt >= FILING_HOLD_S;
    if (held) return this._settle(d, live, bloom, 'filed');
  },

  _settle(d, live, bloom, outcome) {
    if (bloom.settled) return;
    bloom.settled = true;
    if (outcome === 'filed') {
      const both = bloom.evidence.hulk && bloom.evidence.reference;
      d.grant(BASE_PAY + (both ? COMPARISON_BONUS : 0), 'false_bloom:filed');
      d.rep('faction_free', 5, 'false_bloom_filed');
    }
    d.despawnAll(live, 12, 'hand');
    const leftover = entityById(d.state, bloom.emitterId);
    if (alive(leftover) && leftover.data) {
      leftover.data.scanLabel = outcome === 'filed' ? 'SPOOF EMITTER — FILED' : 'SPOOF EMITTER';
    }
    const survivors = d.entsOf(live, 'jumper');
    const result = d.resolve(live, outcome, { speak: true });
    // Claim-jumpers still flying are ordinary hostiles now, not encounter stragglers.
    for (const j of survivors) {
      if (j.data && j.data.despawnAt != null) delete j.data.despawnAt;
    }
    return result;
  },
});

export default defineEncounter(trigger, {
  shape: {
    situation: 'anomaly',
    place: trigger.zoneTypes,
    twist: 'none',
    actor: 'faction_free',
  },
  factionId: 'faction_free',
  title: 'FALSE BLOOM',
  primaryLine: 'SALVAGE HAND: Traffic shut this drift on a bloom report. Smells like a lamp. Scan both hulks — then pull that emitter off and watch where the bloom goes.',
  verbs: ['scan', 'latch', 'tow'],
  civilian: {
    archetypes: ['mule_trader'],
    size: [1, 1],
    factionId: 'faction_free',
    context: 'civilian',
    team: 2,
    passive: true,
  },
  squad: {
    archetypes: ['wasp_swarmer'],
    size: [2, 2],
    factionId: 'faction_reach',
    context: 'encounter',
    team: 1,
    clusterRadius: 60,
    minSeparation: 40,
    doctrine: 'scavenger',
    formation: 'wedge',
  },
  predation: {
    carrierRole: 'hand',
    raiderRole: 'jumper',
  },
  bark: null,
  deadlineS: WINDOW_S,
  receipts: {
    filed: 'FILED — the bloom was a lamp. Traffic reopens the drift and the hand pays out.',
    smashed: 'The emitter\'s slag — and so is the proof. Traffic keeps the drift closed.',
    client_lost: 'The hand is gone before the filing. The proof dies with the one who would sign it.',
    lapsed: 'Traffic keeps the drift closed. The emitter keeps lying.',
  },
});
