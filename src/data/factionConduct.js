// Faction conduct: how each faction's people treat the player once they have history together.
//
// factions.js owns reputation (the number). factionPresence owns the incident memory (what the
// player physically did to a faction's ships and berths) and is the single writer of the live
// stance stamped onto its own presence hulls. This module is the pure table both read: from a
// rep value plus that memory it derives one stance, and for each stance it names an activity the
// existing AI stack already flies (doctrine.js maps loiter-with-target to ORBIT, scan_approach to
// INTERCEPT at range, hail_hold to HOLD, disengage to RETREAT). No second AI, no new meter.
//
// Stances: 'kin' (served them / high standing), 'known' (default — authored presence behavior
// untouched), 'wary' (low standing, or recently forgiven), 'grudge' (struck, killed or robbed and
// not yet forgiven). Forgiveness is doctrine: some factions forgive with time, some only with an
// act (a consignment, a returned record), the paper faction only with paperwork.

const freeze = Object.freeze;

export const CONDUCT_STANCES = freeze(['kin', 'known', 'wary', 'grudge']);

export const CONDUCT_ACTS = freeze([
  'struck', 'killed', 'berth_robbed', 'berth_returned',
  'berth_consign', 'berth_feed', 'berth_folio', 'berth_filing',
]);

const SERVICE_ACTS = new Set(['berth_consign', 'berth_feed', 'berth_folio', 'berth_filing']);

export const FACTION_CONDUCT = freeze({
  // Saprophytes: they never close on a live hull. Kin are shadowed at the edge of the lamp;
  // wary pilots keep the whole dark between you; a grudge is a withdrawal, never a chase.
  // They forgive fast — a wreck is worth more than a feud.
  faction_understory: freeze({
    short: 'understory',
    kinAt: 30, waryBelow: -10, kinServed: 2, waryAfterS: 240,
    forgive: freeze({ afterS: 90, acts: freeze(['berth_feed', 'berth_returned']) }),
    kin: freeze({ kind: 'loiter', range: 520, reason: 'understory_shadow_at_the_lamp' }),
    wary: freeze({ kind: 'loiter', range: 980, reason: 'understory_keep_the_dark_between' }),
    grudge: freeze({ kind: 'disengage', hostile: false, closesDesk: true, reason: 'understory_withdraw_from_you' }),
    keeperKin: freeze({ kind: 'loiter', range: 300, reason: 'understory_slip_attends' }),
    lines: freeze({
      kin: 'The slip remembers {count} hull{s} you brought it. The growth leans your way.',
      known: 'Afterwake Slip. Bring a hull the ledger can prove.',
      wary: 'The growth closes when you come near. Keep your lamp off the slip.',
      grudge: 'The slip is shut to you. The Understory will not be near your guns.',
      forgive: 'The Understory have stopped listening for your guns. The slip opens a crack.',
      robbed: 'You dragged a fed hull off the slip. The growth will not forget the shape of you.',
      returned: 'The hull is back in the growth. The slip unclenches.',
    }),
  }),
  // Censors: they read you. Kin are catalogued politely from range; wary pilots get a close
  // reading; a grudge is a redaction writ served with the Redaction EMP. Time alone barely heals
  // it; returning a record does.
  faction_archive: freeze({
    short: 'archive',
    kinAt: 40, waryBelow: -10, kinServed: 2, waryAfterS: 600,
    forgive: freeze({ afterS: 900, acts: freeze(['berth_returned']) }),
    kin: freeze({ kind: 'scan_approach', range: 360, reason: 'archive_catalogue_courtesy' }),
    wary: freeze({ kind: 'scan_approach', range: 170, reason: 'archive_close_reading' }),
    grudge: freeze({ kind: 'attack_run', hostile: true, closesDesk: true, reason: 'archive_redaction_writ' }),
    keeperKin: freeze({ kind: 'scan_approach', range: 220, reason: 'archive_stacks_usher' }),
    lines: freeze({
      kin: 'The Stacks hold {count} reading{s} under your name. The censor dips its lamps.',
      known: 'The Pallas Stacks. Readings are racked; nothing leaves.',
      wary: 'A censor is reading your hull at close range. The Archive is taking notes.',
      grudge: 'A redaction writ is open on you. The censors will disable before they discuss.',
      forgive: 'The Archive has filed a correction. The writ is closed; the note stays.',
      robbed: 'You hauled a sealed folio out of the Stacks. A redaction writ is open on you.',
      returned: 'The folio is back on its rack. The Archive records the correction.',
    }),
  }),
  // Pilgrims: they sing alongside friends, hold the note when unsure, scatter from violence and
  // forgive fastest of anyone.
  faction_choir: freeze({
    short: 'choir',
    kinAt: 25, waryBelow: -10, kinServed: 2, waryAfterS: 120,
    forgive: freeze({ afterS: 40, acts: freeze(['berth_returned']) }),
    kin: freeze({ kind: 'loiter', range: 150, reason: 'choir_sing_alongside' }),
    wary: freeze({ kind: 'hail_hold', range: 0, reason: 'choir_hold_the_note' }),
    grudge: freeze({ kind: 'disengage', hostile: false, closesDesk: false, reason: 'choir_scatter' }),
    lines: freeze({
      forgive: 'The Choir has sung over the quarrel. They keep a slower distance now.',
    }),
  }),
  // Scrappers: they nod you through the yard, price you when you are a risk, and collect on a
  // debt by disabling your drive and running. Only business settles it.
  faction_pitborn: freeze({
    short: 'pitborn',
    kinAt: 65, waryBelow: 0, kinServed: 2, waryAfterS: 300,
    forgive: freeze({ afterS: null, acts: freeze(['berth_consign', 'berth_returned']) }),
    kin: freeze({ kind: 'loiter', range: 260, reason: 'pitborn_yard_nod' }),
    wary: freeze({ kind: 'scan_approach', range: 240, reason: 'pitborn_pricing_you' }),
    grudge: freeze({ kind: 'attack_run', hostile: true, closesDesk: true, reason: 'pitborn_collect_the_debt' }),
    keeperKin: freeze({ kind: 'scan_approach', range: 180, reason: 'pitborn_line_boss_meets_you' }),
    lines: freeze({
      kin: 'The Line has {count} of your hulls under the cutters. The boss waves you onto the strip.',
      known: 'Consignment Line. Rights in, hull out.',
      wary: 'The line boss is pricing your hull as you come in.',
      grudge: 'You owe the Line. They will take it out of your drive.',
      forgive: 'Business settles it. The Line takes your consignment and forgets the rest.',
      robbed: 'You pulled a consigned hull off the strip-line. The Pitborn call that a debt.',
      returned: 'The hull is back under the cutters. The Line calls it square.',
    }),
  }),
  // Homesteaders: they wave you past, hold the line at the homestead when unsure, defend it with
  // guns when wronged, and come round slowly.
  faction_free: freeze({
    short: 'free',
    kinAt: 30, waryBelow: -10, kinServed: 2, waryAfterS: 420,
    forgive: freeze({ afterS: 300, acts: freeze([]) }),
    kin: freeze({ kind: 'loiter', range: 220, reason: 'free_homestead_wave' }),
    wary: freeze({ kind: 'hail_hold', range: 0, reason: 'free_hold_the_homestead' }),
    grudge: freeze({ kind: 'attack_run', hostile: true, closesDesk: false, reason: 'free_homestead_defense' }),
    lines: freeze({
      forgive: 'The homestead watch lowers its guns. They will keep an eye on you a while.',
    }),
  }),
  // The paper faction: no ships, so no guns. A grudge is a variance — the desk is closed until
  // the paperwork is put right. A filing cycle lapses it eventually.
  faction_helix: freeze({
    short: 'helix',
    kinAt: 35, waryBelow: -10, kinServed: 2, waryAfterS: 900,
    forgive: freeze({ afterS: 1800, acts: freeze(['berth_returned']) }),
    kin: null,
    wary: null,
    grudge: freeze({ kind: null, hostile: false, closesDesk: true, reason: 'helix_variance_open' }),
    lines: freeze({
      kin: 'Variance Pier: {count} filing{s} on record, no variance. The Directorate expedites you.',
      known: 'Variance Pier. Every filing is kept in duplicate.',
      wary: 'Your file is flagged for review. The Directorate will be thorough.',
      grudge: 'VARIANCE OPEN: a filed copy is missing from the pier. Desk services suspended.',
      forgive: 'Variance closed. The Directorate thanks you for restoring its records.',
      robbed: 'You removed a filed copy from the Variance Pier. VARIANCE OPEN; desk services suspended.',
      returned: 'Filed copy restored to the pier. Variance closed pending review.',
    }),
  }),
});

export function conductFor(factionId) {
  return FACTION_CONDUCT[String(factionId || '')] || null;
}

export function isServiceAct(act) {
  return SERVICE_ACTS.has(act);
}

export const GRUDGE_STRIKES = 3;
const STRIKE_WINDOW_S = 60;

/** Fresh, serializable incident memory for one faction. */
export function emptyConductMemory() {
  return {
    struck: 0, recentStrikes: 0, killed: 0, robbed: 0, returned: 0, served: 0, forgiven: 0,
    grudge: false, grudgeSince: null, lastStruckAt: null, forgivenAt: null, lastAct: null, lastActAt: null,
  };
}

const finiteOrNull = (value) => (value == null || !Number.isFinite(Number(value)) ? null : Number(value));
const count = (value) => Math.max(0, Math.floor(Number(value) || 0));

export function normalizeConductMemory(value) {
  const src = value && typeof value === 'object' ? value : {};
  return {
    struck: count(src.struck),
    recentStrikes: count(src.recentStrikes),
    killed: count(src.killed),
    robbed: count(src.robbed),
    returned: count(src.returned),
    served: count(src.served),
    forgiven: count(src.forgiven),
    grudge: src.grudge === true,
    grudgeSince: finiteOrNull(src.grudgeSince),
    lastStruckAt: finiteOrNull(src.lastStruckAt),
    forgivenAt: finiteOrNull(src.forgivenAt),
    lastAct: CONDUCT_ACTS.includes(src.lastAct) ? src.lastAct : null,
    lastActAt: finiteOrNull(src.lastActAt),
  };
}

/**
 * Apply one physical act to a faction's memory (mutates and returns it). Returns
 * { memory, opened, forgave } so the caller can restyle hulls and speak exactly once.
 */
export function recordConductAct(memory, factionId, act, now) {
  const conduct = conductFor(factionId);
  const mem = memory || emptyConductMemory();
  const t = Number(now) || 0;
  let opened = false;
  let forgave = false;
  mem.lastAct = act;
  mem.lastActAt = t;
  if (act === 'struck' || act === 'killed' || act === 'berth_robbed') {
    if (act === 'struck') {
      // A run of hits is a minute long; older strays are forgotten.
      if (!Number.isFinite(mem.lastStruckAt) || t - mem.lastStruckAt > STRIKE_WINDOW_S) mem.recentStrikes = 0;
      mem.struck += 1;
      mem.recentStrikes += 1;
    }
    if (act === 'killed') mem.killed += 1;
    if (act === 'berth_robbed') mem.robbed += 1;
    mem.lastStruckAt = t;
    // One stray round is an accident the faction's own self-defense answers; a grudge is a
    // kill, a robbery, or a deliberate run of hits.
    const deliberate = act !== 'struck' || mem.recentStrikes >= GRUDGE_STRIKES;
    if (deliberate && conduct && conduct.grudge && !mem.grudge) {
      mem.grudge = true;
      mem.grudgeSince = t;
      opened = true;
    }
  } else {
    if (act === 'berth_returned') mem.returned += 1;
    if (isServiceAct(act)) mem.served += 1;
    if (mem.grudge && conduct && conduct.forgive.acts.includes(act)) {
      forgiveConduct(mem, t);
      forgave = true;
    }
  }
  return { memory: mem, opened, forgave };
}

export function forgiveConduct(memory, now) {
  memory.grudge = false;
  memory.recentStrikes = 0;
  memory.grudgeSince = null;
  memory.forgiven += 1;
  memory.forgivenAt = Number(now) || 0;
  return memory;
}

/** True when this faction's doctrine lets time close the grudge at `now`. */
export function grudgeLapsed(factionId, memory, now) {
  const conduct = conductFor(factionId);
  if (!conduct || !memory || !memory.grudge) return false;
  const afterS = conduct.forgive.afterS;
  if (!Number.isFinite(afterS)) return false;
  const since = Number.isFinite(memory.lastStruckAt) ? memory.lastStruckAt : memory.grudgeSince;
  return Number.isFinite(since) && (Number(now) || 0) - since >= afterS;
}

export function deriveConductStance(factionId, rep, memory, now) {
  const conduct = conductFor(factionId);
  if (!conduct) return 'known';
  const mem = memory || null;
  if (mem && mem.grudge) return 'grudge';
  const standing = Number(rep) || 0;
  const t = Number(now) || 0;
  if (standing < conduct.waryBelow) return 'wary';
  if (mem && Number.isFinite(mem.forgivenAt) && t - mem.forgivenAt < conduct.waryAfterS) return 'wary';
  if (standing >= conduct.kinAt) return 'kin';
  if (mem && mem.served >= conduct.kinServed && mem.struck + mem.killed + mem.robbed === 0) return 'kin';
  return 'known';
}

/**
 * The AI activity a stance asks for. `keeper` hulls at a berth use their own kin posture.
 * Returns null when the stance keeps the authored activity (known) or the faction flies nothing.
 */
export function conductActivity(factionId, stance, { playerId = null, anchor = null, tick = 0, keeper = false } = {}) {
  const conduct = conductFor(factionId);
  if (!conduct) return null;
  const row = stance === 'kin' && keeper && conduct.keeperKin ? conduct.keeperKin : conduct[stance];
  if (!row || !row.kind) return null;
  const base = {
    kind: row.kind,
    reason: row.reason,
    anchor: anchor ? { x: anchor.x, z: anchor.z } : null,
    leashRadius: 1400,
    preferredRange: row.range || 0,
    startedTick: tick | 0,
    conductStance: stance,
  };
  if (row.kind === 'loiter' || row.kind === 'scan_approach' || row.kind === 'attack_run') {
    base.targetId = playerId;
  }
  return base;
}

/** Closed-desk reason for a faction desk under this stance, or '' when the desk is open. */
export function conductDeskClosure(factionId, stance) {
  const conduct = conductFor(factionId);
  if (!conduct || stance !== 'grudge' || !conduct.grudge || conduct.grudge.closesDesk !== true) return '';
  return conduct.lines.grudge || 'Desk closed to you';
}

/** One berth-arrival line carrying the berth's own receipt count. */
export function conductLine(factionId, key, { count: n = 0 } = {}) {
  const conduct = conductFor(factionId);
  const template = conduct && conduct.lines && conduct.lines[key];
  if (!template) return '';
  const k = count(n);
  return template.replace('{count}', String(k)).replace('{s}', k === 1 ? '' : 's');
}

export default FACTION_CONDUCT;
