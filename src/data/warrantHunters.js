// THE WORLD REMEMBERS (U-A) — the authored cast of WANTED hunters.
//
// Six named people, not a generator. The cast is STABLE: a hunter you disable is recovered and
// comes back angrier; nobody here is written out of the game by a kill. This file is pure data +
// pure readers (no runtime state, no RNG). Runtime memory and the wave rhythm live in
// systems/warrantHunterWaves.js, hosted by lawSecurity. Lines are chosen with hash32 — never the
// shared RNG — so a replay speaks the same words.
//
// Each hunter carries: identity, home faction (licensed Concord contractors vs freelancers who
// work for anyone), a hull bias, ONE quirk that changes how they fight or hunt, a portrait pick
// and a short voice. Quirks are read by the wave system through `quirk.id`.
import { hash32 } from '../core/rng.js';
import { PIRATE_PROMOTION_MAX_TIER } from './namedAces.js';

export const WARRANT_HUNTER_SCHEMA = 1;

/**
 * Pressure rhythm by WANTED tier (heat.js `WANTED_TIER`). `minGap` / `guaranteeGap` count wanted
 * ARRIVALS (jump arrivals + dock arrivals while WANTED at this tier or above) since the last wave:
 * under `minGap` never; at `guaranteeGap` always; between, a `state.rng()` roll at `chance`.
 * `cooldownS` is a sim-time floor between two waves so dock-hopping cannot farm or dodge them.
 * `crew` — IMPOUND brings the hunter's crew (return-crew composition), NETS only the hunter.
 *   nets:    ~every 2nd–3rd arrival
 *   impound: most arrivals (never two in a row without the cooldown)
 */
export const WARRANT_WAVE_RHYTHM = Object.freeze({
  nets: Object.freeze({ minGap: 2, guaranteeGap: 3, chance: 0.5, cooldownS: 180, crew: false }),
  impound: Object.freeze({ minGap: 1, guaranteeGap: 2, chance: 0.8, cooldownS: 75, crew: true }),
});

/** A jump wave is held this long after arrival so the player reads the sector first. */
export const WARRANT_WAVE_ARRIVAL_DELAY_S = 60;
/** A dock wave is materialized this long after the player undocks (never while docked). */
export const WARRANT_WAVE_UNDOCK_DELAY_S = 10;
/** A held wave retries this often when the spawn budget or a live fight refuses it. */
export const WARRANT_WAVE_RETRY_S = 12;
/** A held wave that cannot land inside this window is dropped (no pressure debt carries over). */
export const WARRANT_WAVE_HOLD_MAX_S = 180;
/** Recovery after a disable: base + step per previous disable, capped. Sim seconds. */
export const WARRANT_RECOVER_BASE_S = 600;
export const WARRANT_RECOVER_STEP_S = 300;
export const WARRANT_RECOVER_MAX_S = 2400;
/** Escorts a crewed (IMPOUND) wave may bring on top of the hunter. */
export const WARRANT_CREW_MAX = 2;
/** Boldness is the aceMemory return tier: 1..PIRATE_PROMOTION_MAX_TIER. */
export const WARRANT_MAX_BOLDNESS = PIRATE_PROMOTION_MAX_TIER;
/** First hail range (wu): a hunter speaks once when it closes inside this of the player. */
export const WARRANT_HAIL_RANGE_WU = 1500;
/** The hailer's offer stays open this long; fire is held for the window. */
export const WARRANT_OFFER_WINDOW_S = 25;
/** What the player last did to a hunter; the grievance line is keyed by it. */
export const WARRANT_GRIEVANCES = Object.freeze(['disabled', 'rammed', 'netted', 'outran', 'paid']);

const F = Object.freeze;

export const WARRANT_HUNTERS = F([
  F({
    id: 'wh_ines_garrow',
    name: 'Ines Garrow',
    callsign: 'Writ',
    crew: 'Garrow Recovery',
    factionId: 'faction_scn',
    licensed: true,
    // Hull bias: a long-barrel hull that works from range while she talks.
    archetype: 'lancer_sniper',
    escortArchetype: 'patrol_lawman',
    baseLevel: 4,
    gimmickTag: 'writ-lancer',
    trick: 'phase-jammer',
    portrait: F({ role: 'bounty_hunter', index: 2 }),
    quirk: F({
      id: 'hails_first',
      label: 'Hails first',
      note: 'Holds fire and offers the bounty to be paid on the channel before she opens up.',
    }),
    voice: F({
      first: F([
        'Concord-licensed. The bounty on you is payable to me, here, now. Say the word and I stand down.',
        'This is a contract, not a feud. Settle the bounty and we both go home.',
      ]),
      grievance: F({
        disabled: 'You took my drive out last time. Repairs are on your bill. Pay it or fly.',
        rammed: 'You put your hull through mine. The writ has a line for that now.',
        netted: 'You wrapped my own net round my tail. I kept the knot. Pay the bounty.',
        outran: 'You outran my writ once. Writs are patient. Pay, or run again.',
        paid: 'I cleared you once and you went straight back to work. No discount this time.',
      }),
      giveUp: F([
        'Writ withdrawn. I am venting air. File the loss against your name.',
        'Drive is gone. I will be back with paper and a new tug.',
      ]),
      tierUp: F([
        'The bounty grew while we talked. I am calling in the rest of my paper.',
      ]),
      // Said when the player takes the offer and cannot cover it (the hails_first quirk's other half).
      refused: F([
        'That does not cover the writ. Find the rest of it, or we do this the other way.',
      ]),
    }),
  }),
  F({
    id: 'wh_tobiah_kell',
    name: 'Tobiah Kell',
    callsign: 'Gatepost',
    crew: 'Apron Watch',
    factionId: 'faction_scn',
    licensed: true,
    archetype: 'bruiser_brawler',
    escortArchetype: 'bruiser_brawler',
    baseLevel: 4,
    gimmickTag: 'apron-brawler',
    trick: 'ram-plate',
    portrait: F({ role: 'bounty_hunter', index: 5 }),
    quirk: F({
      id: 'dock_lurker',
      label: 'Dock lurker',
      note: 'Only works docks: waits on the undock lane and never takes a jump-arrival job.',
      triggers: F(['dock']),
    }),
    voice: F({
      first: F([
        'Apron is mine. Nobody undocks wanted on my shift.',
        'Gate fees are paid in hull plate. Slow down.',
      ]),
      grievance: F({
        disabled: 'You opened my hull at the apron. Nine years on this gate. Not once like that.',
        rammed: 'You rode your mass through my nose. Same apron, same gate, different bill.',
        netted: 'Your tether took my fins off. I patched them with your wanted notice.',
        outran: 'You slipped my gate. It is my gate. I wrote it down.',
        paid: 'You paid at the desk and thought that was the end. The desk is not the gate.',
      }),
      giveUp: F([
        'Apron is yours. Tell nobody how you got past me.',
      ]),
      tierUp: F([
        'Heat is climbing. The gate shuts behind you and I am on the other side.',
      ]),
    }),
  }),
  F({
    id: 'wh_orsolya_pike',
    name: 'Orsolya Pike',
    callsign: 'Slackline',
    crew: 'Free Tender',
    factionId: 'faction_free',
    licensed: false,
    archetype: 'tether_control_raider',
    escortArchetype: 'field_anchor_controller',
    baseLevel: 4,
    gimmickTag: 'net-tender',
    trick: 'tether-cutter',
    portrait: F({ role: 'bounty_hunter', index: 7 }),
    quirk: F({
      id: 'net_tender',
      label: 'Net tender',
      note: 'Always brings an anchor tender to pay out the net, at any tier.',
      tender: true,
    }),
    voice: F({
      first: F([
        'Net is out behind me, friend. Do not fight the cord.',
        'Tender is paying out slack. Turn before it pulls tight.',
      ]),
      grievance: F({
        disabled: 'You cooked my winch. Tender is rebuilt. Better knots now.',
        rammed: 'You rammed the tender last time. This one has a bumper.',
        netted: 'You used my own net on me. Hell of a trick. It will not work twice.',
        outran: 'You slid out of my net. Nobody does. I am still counting the holes.',
        paid: 'You paid. Somebody paid me too. Does not make us square.',
      }),
      giveUp: F([
        'Cord is cut. I am drifting. Keep your bounty, I will find the next one.',
      ]),
      tierUp: F([
        'Bigger bounty, bigger net. Let out the whole spool.',
      ]),
    }),
  }),
  F({
    id: 'wh_dov_marrow',
    name: 'Dov Marrow',
    callsign: 'Furrow',
    crew: 'Seeded Lane',
    factionId: 'faction_reach',
    licensed: false,
    archetype: 'reaver_pirate',
    escortArchetype: 'corsair_raider',
    baseLevel: 4,
    gimmickTag: 'wake-miner',
    trick: 'wake-mines',
    portrait: F({ role: 'bounty_hunter', index: 3 }),
    quirk: F({
      id: 'wake_miner',
      label: 'Wake miner',
      note: 'Lays mines on the vector you leave by; arrives on the line you will fly.',
    }),
    voice: F({
      first: F([
        'Stay on your vector. I already seeded it.',
        'Every exit has a lane. I know yours.',
      ]),
      grievance: F({
        disabled: 'You shot my rack empty. Month to refill. Every mine has your name on it.',
        rammed: 'You ran me down. The mines do not care. They go off for anyone.',
        netted: 'You hung my wake on a line. Now it is your wake.',
        outran: 'You jumped before the mines found you. This time I seed the other side.',
        paid: 'Paid off. Still seeded. Habit.',
      }),
      giveUp: F([
        'Rack is empty and so am I. Fly clean.',
      ]),
      tierUp: F([
        'Heat is up so I laid thicker. Mind your wake.',
      ]),
    }),
  }),
  F({
    id: 'wh_sunniva_hale',
    name: 'Sunniva Hale',
    callsign: 'Pairing',
    crew: 'Hale and Rook',
    factionId: 'faction_free',
    licensed: false,
    archetype: 'corsair_raider',
    escortArchetype: 'corsair_raider',
    baseLevel: 4,
    gimmickTag: 'paired-wing',
    trick: 'sensor-ghost',
    portrait: F({ role: 'bounty_hunter', index: 6 }),
    quirk: F({
      id: 'hunts_in_pair',
      label: 'Hunts in a pair',
      note: 'Never flies alone: Rook comes with her at every tier.',
      partner: F({ name: 'Rook', archetype: 'corsair_raider' }),
    }),
    voice: F({
      first: F([
        'Two of us, one of you. Do not make it a long afternoon.',
        'Rook has your left. I have your right. Hold still.',
      ]),
      grievance: F({
        disabled: 'You dropped Rook last time. I brought a better wing.',
        rammed: 'You put Rook through a bulkhead. He is back. He remembers.',
        netted: 'You netted the pair of us. We do not fly in a line anymore.',
        outran: 'You outran us both. We have trained for it since.',
        paid: 'You paid, we split it. Then we went looking for you again.',
      }),
      giveUp: F([
        'Rook, break off. We lost this one. Next time.',
      ]),
      tierUp: F([
        'More heat. Rook, call the third.',
      ]),
    }),
  }),
  F({
    id: 'wh_calder_ansah',
    name: 'Calder Ansah',
    callsign: 'Lantern',
    crew: 'Lantern Bond',
    factionId: 'faction_scn',
    licensed: true,
    archetype: 'patrol_lawman',
    escortArchetype: 'patrol_lawman',
    baseLevel: 4,
    gimmickTag: 'lantern-bond',
    trick: 'shield-turtle',
    portrait: F({ role: 'bounty_hunter', index: 1 }),
    quirk: F({
      id: 'holds_for_survivors',
      label: 'Refuses a survivor tow',
      note: 'Will not fire on a hull towing survivors; fire resumes the moment the tow drops.',
    }),
    voice: F({
      first: F([
        'I hold fire on any hull with survivors in tow. Keep them aboard and we talk. Drop them and we do not.',
        'Licensed, and I read scans. The wanted flag is real. So are the people behind you.',
      ]),
      grievance: F({
        disabled: 'You gutted me while I held fire on your tow. I remember the difference.',
        rammed: 'You rammed a licensed hull. That is a charge, not a trade.',
        netted: 'You wrapped my wings in my own line. I let you go. Not twice.',
        outran: 'You outran me last time. I will be faster. I will still be polite.',
        paid: 'You paid and I stood down. Do not make me regret the courtesy.',
      }),
      giveUp: F([
        'I am done. Hull is open. Make sure those people reach a dock.',
      ]),
      tierUp: F([
        'The bounty does not care what I think. Neither do the guns now.',
      ]),
    }),
  }),
]);

const BY_ID = new Map(WARRANT_HUNTERS.map((hunter) => [hunter.id, hunter]));

export function warrantHunterById(id) {
  return BY_ID.get(String(id || '')) || null;
}

/** The ace-shaped driver `namedAces` readers (returnCrewForAce / styleLoadoutForAce) expect. */
export function warrantHunterAce(hunter) {
  if (!hunter) return null;
  return {
    id: hunter.id,
    name: hunter.name,
    crew: hunter.crew,
    factionId: hunter.factionId,
    gimmickTag: hunter.gimmickTag,
    returnArchetype: hunter.archetype,
    escortArchetype: hunter.escortArchetype,
    baseReturnLevel: hunter.baseLevel,
  };
}

/** A hunter's quirk limits which arrival triggers it will take (default: any). */
export function hunterTakesTrigger(hunter, trigger) {
  const triggers = hunter && hunter.quirk && hunter.quirk.triggers;
  return !Array.isArray(triggers) || triggers.includes(trigger);
}

/**
 * Deterministic cast pick: `hash32(seed, tier, arrivalCount)` over the hunters that take this
 * trigger and are not recovering. Returns null when the whole eligible cast is recovering.
 * `isRecovering(hunterId)` is supplied by the runtime (sim-time read of the memory ledger).
 */
export function pickWarrantHunter({
  seed = 0, tier = 'nets', arrivalCount = 0, trigger = 'jump', isRecovering = null,
} = {}) {
  const pool = WARRANT_HUNTERS.filter((hunter) => hunterTakesTrigger(hunter, trigger)
    && !(typeof isRecovering === 'function' && isRecovering(hunter.id)));
  if (!pool.length) return null;
  return pool[hash32(seed >>> 0, String(tier), arrivalCount | 0) % pool.length];
}

/** What the player did to a hunter, read off a kill's style. Unknown styles read as 'disabled'. */
export function grievanceForKillStyle(style) {
  if (style === 'ram' || style === 'rock') return 'rammed';
  if (style === 'fling') return 'netted';
  return 'disabled';
}

/**
 * One voiced line. kind: 'first' | 'grievance' | 'giveUp' | 'tierUp' | 'refused' (hails_first only). `grievance` takes the
 * remembered outcome and falls back to 'disabled' when the memory names an unknown one.
 */
export function warrantHunterLine(hunter, kind, { seed = 0, salt = 0, grievance = null } = {}) {
  if (!hunter || !hunter.voice) return '';
  const voice = hunter.voice;
  let pool = null;
  if (kind === 'grievance') {
    const key = WARRANT_GRIEVANCES.includes(grievance) ? grievance : 'disabled';
    const line = voice.grievance && voice.grievance[key];
    return typeof line === 'string' ? line : '';
  }
  pool = voice[kind];
  if (!Array.isArray(pool) || !pool.length) return '';
  return pool[hash32(seed >>> 0, hunter.id, kind, salt | 0) % pool.length];
}

/** Boldness (aceMemory return tier) for a wave: global bolder-count plus a returning hunter's edge. */
export function warrantBoldness({ bolder = 0, returning = false } = {}) {
  const raw = 1 + Math.max(0, bolder | 0) + (returning ? 1 : 0);
  return Math.max(1, Math.min(WARRANT_MAX_BOLDNESS, raw));
}

/** Recovery window after the n-th disable (n counted AFTER increment, so first disable = 1). */
export function warrantRecoverSeconds(timesDisabled = 1) {
  const n = Math.max(1, timesDisabled | 0);
  return Math.min(WARRANT_RECOVER_MAX_S, WARRANT_RECOVER_BASE_S + WARRANT_RECOVER_STEP_S * (n - 1));
}
