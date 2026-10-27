// W-SHIFT (row 506, 03 §4.3): BOUNCER / DR-0 — the bazaar's door robot. A real marked
// hull posts up at the no-weapons cordon around the Sker Bazaar berth and enforces the
// one law the ring keeps: a weapon fired inside is a strike. First strike is a spoken
// warning; the next inside the window is the throw — a radial impulse through the
// physics membrane, scaled to the hull's mass, pointed out through the door. The robot
// throws anyone: a corsair that opens up inside the ring flies out the same door, which
// is the backup play — bait rowdy ships into the cordon and the door does your work.
// Thrown rocks never emit combat:fire, so the ring's own ammo stays legal.
//
// THE LADDER — the door keeps a station record: state.stationRecords.bouncer, a
// JSON-safe rap sheet per hull mirrored into story flags so it survives the save. The
// record is what turns a bar brawl into law with consequences: one throw and the hull
// is watched; the second throw posts the hull WANTED — a live mark other actors can
// read (data.bazaarWanted) plus door muscle on contract that chases the mark and
// shoves it through the same impulse membrane; the fourth throw bans the hull
// outright, and a banned hull inside the ring is thrown on sight, no shot required.
// Repeat rowdies are thrown harder each time; banned hulls are thrown hardest of all.
// A wanted sheet cools on clean sim time. A ban never does — the door knows that hull.
// Friends of the house (authored VIP/station-crew data or earned door standing) get a
// courtesy notice and take no strike: the law is enforced, not evenly blind.
//
// WHAT THIS OWNS — the robot body and the hired muscle hulls (event-driven seams like
// every one-off: init / deferred sector-enter / save:loaded / newGame), the per-visit
// strike ledger keyed on the hull object, the persistent offender registry and its
// flag mirror, ejection/trespass impulses, the wanted sheets, muscle contracts, and a
// calendar drift-home + sweep pass. Door law lives in story flags: ejection count, the
// once-ever announce, the banned receipt, and the records mirror.
import { BOUNCER } from '../data/bouncer.js';
import { bouncerInRing, bouncerStrikeDecision, bouncerEjectImpulse, bouncerCanEject, bouncerDriftHome } from '../characters/bouncerRules.js';
import { deferSectorEnterMaterialization } from '../core/sectorEnterDefer.js';
import { queuePhysicsImpulse } from '../core/physicsAuthority.js';
import { occupantGenerationOf } from '../core/entity.js';

// ── The ladder's numbers ────────────────────────────────────────────────────────
// These live in the adapter, not the data file: BOUNCER is the stable authored surface
// (sector, geometry, lines); the escalation ladder is implementation detail.
export const BOUNCER_LAW = Object.freeze({
  recordsFlag: 'bouncer_records',   // story-flags key holding the JSON mirror
  recordsSchema: 1,
  maxOffenderRows: 24,              // bounded ledger — the door forgets small fry first
  ejectionsToWanted: 2,             // second throw posts the hull wanted
  ejectionsToBan: 4,                // fourth throw bans the hull from the ring
  wantedS: 150,                     // a wanted sheet cools after this much clean time
  repeatEjectScale: 0.3,            // every prior throw adds 30% to the next one
  bannedEjectScale: 1.5,            // banned hulls fly hardest of all
  tabPerOffense: 250,               // the bazaar's running repair tab per offense (credits,
                                    // ledger-only: billing belongs to station services)
  sweepDtS: 0.5,                    // the sweep's soft cadence inside update()
  playerBannedFlag: 'bouncer_banned_you',
});

export const BOUNCER_MUSCLE = Object.freeze({
  perWanted: 1,                     // contract hulls per wanted mark
  perBanned: 2,                     // a banned hull rates a heavier escort
  maxTotal: 4,                      // the bazaar pays for four door hulls at once, tops
  radius: 8, mass: 18, hull: 120,
  chaseSpeed: 65,                   // closing delta-v toward a live mark
  patrolSpeed: 24,                  // drift to the perimeter post while the mark is out
  shoveRange: 30,                   // a paid hand reaches this far
  shoveDv: 55,                      // and puts this much through the door, per shove
  shoveCooldownS: 2.5,              // the arm needs a breath between shoves
  arriveRadius: 20,                 // inside this of the mark it brakes instead of driving
  spawnRadius: 40,                  // hired hulls materialize just off the robot's post
});

// Earned door standing: this many consecutive clean berths and the door stops
// reaching for the muzzle. One recorded offense burns the streak back to zero.
const BOUNCER_VIP = Object.freeze({ docks: 5, flag: 'bouncer_vip', streakFlag: 'bouncer_clean_docks' });

const DOOR_LINES = Object.freeze({
  vip: 'Easy with the muzzle, friend of the house. The ring watches anyway.',
  wanted: 'Twice out the door. The ring posts your hull — muscle is paid, and they fly till you cool.',
  banned: 'No more lessons. Your hull is banned from the ring. On sight, now.',
  banThrow: 'Banned hulls do not get the door. They get the throw.',
  trespass: 'Banned hull inside the ring. Out.',
});

// ── Pure helpers (no state, no bus, no Math.random) ─────────────────────────────

function finiteXZ(v) {
  return Number.isFinite(v && v.x) && Number.isFinite(v && v.z);
}

/** A stored offender row, or null when the slot holds hostile/corrupt data — a
 *  restored mirror can carry any JSON shape, and writes onto a primitive throw. */
function offenderRowObject(row) {
  return row && typeof row === 'object' && !Array.isArray(row) ? row : null;
}

/** FNV-1a — deterministic jitter for spawn bearings/patrol posts. No rng draw, no salt:
 *  the same offender key always walks the same muscle geometry. */
function hash32(str) {
  let h = 0x811c9dc5;
  const s = String(str);
  for (let i = 0; i < s.length; i++) { h ^= s.charCodeAt(i); h = Math.imul(h, 0x01000193); }
  return h >>> 0;
}

/** Stable identity for the station's records: the player is 'player', an authored
 *  character keeps its character id, every other hull answers by transponder — its
 *  live entity id. Hull ids recycle inside a visit; that fuzz is priced in: per-visit
 *  strike timing still keys on the hull OBJECT (see this._strikes), while the
 *  persistent record deliberately remembers the transponder the door scanned. */
export function bouncerRecordKey(entity, state) {
  if (!entity) return 'hull:0';
  if (entity.isPlayer === true || (state && entity.id === state.playerId)) return 'player';
  const c = entity.data && entity.data.authoredCharacter;
  if (typeof c === 'string' && c.length) return `char:${c}`;
  return `hull:${entity.id}`;
}

/** The courtesy list. The door still asks VIPs to mind the muzzle — a spoken notice,
 *  never a strike — but their hulls never take a throw. Friends of the house are
 *  authored data (vip / bazaarVip / stationCrew / bouncerVip) plus a player carrying
 *  earned door standing in story flags (bouncer_vip). */
export function bouncerIsVip(entity, flags) {
  if (!entity) return false;
  const d = entity.data || {};
  if (d.vip === true || d.bazaarVip === true || d.stationCrew === true || d.bouncerVip === true) return true;
  if (entity.isPlayer === true && flags && flags.bouncer_vip === true) return true;
  return false;
}

/** Impulse scale on the base throw, read off the record BEFORE this throw lands:
 *  throw one is the authored shove; every prior throw adds repeatEjectScale, and a
 *  banned hull multiplies the whole thing again. */
export function bouncerEjectScale(record) {
  const ejects = Math.max(0, Number(record && record.ejections) || 0);
  let k = 1 + ejects * BOUNCER_LAW.repeatEjectScale;
  if (record && record.status === 'banned') k *= BOUNCER_LAW.bannedEjectScale;
  return k;
}

/** What the record becomes after its ejections-th throw. */
export function bouncerStatusAfterEject(ejections) {
  const n = Number(ejections) || 0;
  if (n >= BOUNCER_LAW.ejectionsToBan) return 'banned';
  if (n >= BOUNCER_LAW.ejectionsToWanted) return 'wanted';
  return 'watched';
}

/** The muscle contract: a marked hull's hired door hand. Spawn bearing and radius are
 *  hashed from the offender key + slot, so the same mark always draws the same
 *  geometry — deterministic without spending state.rng. */
export function bouncerMuscleSpec(recordKey, slot = 0) {
  const a = (hash32(`${recordKey}:${slot}`) % 6283) / 1000; // ~0..2π, stable per key
  const r = BOUNCER_MUSCLE.spawnRadius + (hash32(`${slot}:${recordKey}`) % 200) / 10;
  return {
    type: 'drone',
    pos: { x: BOUNCER.post.x + Math.cos(a) * r, z: BOUNCER.post.z + Math.sin(a) * r },
    vel: { x: 0, z: 0 },
    radius: BOUNCER_MUSCLE.radius, mass: BOUNCER_MUSCLE.mass,
    hull: BOUNCER_MUSCLE.hull, hullMax: BOUNCER_MUSCLE.hull,
    homeSectorId: BOUNCER.sectorId,
    data: {
      bouncerMuscle: true, muscleFor: String(recordKey), muscleSlot: Number(slot) || 0,
      parentType: 'story_prop',
      callsign: `DOOR MUSCLE / DM-${(Number(slot) || 0) + 1}`,
      scanLabel: 'DOOR MUSCLE — bazaar contract enforcement',
      scannerSignalKind: 'salvage',
      homeSectorId: BOUNCER.sectorId,
    },
  };
}

/** Where a markless muscle hull holds: a perimeter berth on the ring, golden-angle
 *  spread by patrol slot so the paid hands never stack on one seat. */
export function bouncerMusclePatrolPost(slot) {
  const a = ((Number(slot) || 0) * 2.39996322972865332) % (Math.PI * 2);
  const r = BOUNCER.ringRadius * 0.92;
  return { x: BOUNCER.center.x + Math.cos(a) * r, z: BOUNCER.center.z + Math.sin(a) * r };
}

export function bouncerSpec() {
  return {
    type: 'drone',
    pos: { ...BOUNCER.post }, vel: { x: 0, z: 0 },
    radius: 10, mass: 30, hull: 300, hullMax: 300,
    homeSectorId: BOUNCER.sectorId,
    data: {
      bouncer: true, authoredCharacter: 'bouncer', parentType: 'story_prop',
      callsign: BOUNCER.callsign,
      scanLabel: 'BOUNCER / DR-0 — bazaar door robot',
      scannerSignalKind: 'salvage',
      homeSectorId: BOUNCER.sectorId,
    },
  };
}

export function createBouncer() {
  return {
    name: 'bouncer',
    init(ctx) {
      this.destroy();
      this.state = ctx.state; this.bus = ctx.bus; this.helpers = ctx.helpers || {};
      this._unsubs = [];
      // Per-visit door ledgers keyed on the entity OBJECT, not its id — a hull that dies
      // inside the window frees its id for a fresh occupant, and the recycled id must not
      // inherit a dead rowdy's strikes.
      this._strikes = new Map(); // entity -> {count, lastAt}
      this._ejectAt = new Map(); // entity -> simTime of its last throw (cooldown)
      this._muscleShoveAt = new Map(); // muscle entity -> simTime of its last shove
      this._vipNoted = new Map(); // entity -> simTime of its last courtesy notice
      this._muscleSeq = 0; // per-visit patrol-slot counter
      this._nextSweep = 0; // simTime of the next records/muscle sweep
      const on = (event, fn) => {
        const off = this.bus?.on(event, fn); if (typeof off === 'function') this._unsubs.push(off);
      };
      on('sector:enter', (p) => {
        this._clearVisit();
        if (deferSectorEnterMaterialization(this.state, p, this._cookProvider)) return;
        this._sync();
      });
      this._cookProvider = () => { this._sync(); };
      (this.helpers.sectorCookProviders || (this.helpers.sectorCookProviders = []))
        .push(this._cookProvider);
      // A restored visit is a fresh visit: the door ledger is in-memory only, so a save
      // carried mid-offense must not reload straight into the throw (docket/gateThreeWeir
      // drop their transient state on the same seam). The rap sheet is the opposite —
      // it is the station's own memory and comes back off the flag mirror.
      on('save:loaded', () => { this._clearVisit(); this._restoreRecords(true); this._sync(); });
      on('game:newGame', () => { this._clearVisit(); this._restoreRecords(); this._sync(); });
      on('combat:fire', (p) => this._onFire(p));
      on('dock:docked', () => this._onDocked());
      this._restoreRecords();
      this._sync();
    },
    destroy() {
      for (const off of this._unsubs || []) off();
      this._unsubs = [];
      const providers = this.helpers?.sectorCookProviders;
      if (Array.isArray(providers)) {
        const i = providers.indexOf(this._cookProvider);
        if (i >= 0) providers.splice(i, 1);
      }
      const queue = this.state?.render?.deferredEnterMaterializers;
      if (Array.isArray(queue)) {
        for (let i = queue.length - 1; i >= 0; i--) {
          if (queue[i] && queue[i].provider === this._cookProvider) queue.splice(i, 1);
        }
      }
      this._cookProvider = null;
      this._removeOwned();
    },
    /** Per-visit transient state — strikes, throw cooldowns, muscle shove clocks, and
     *  courtesy-notice timers all reset on the seams. The station record does not. */
    _clearVisit() {
      this._strikes.clear(); this._ejectAt.clear();
      this._muscleShoveAt.clear(); this._vipNoted.clear();
      this._nextSweep = 0;
      // Patrol berths must not collide with muscle that outlived the seam (a
      // save restores contract hulls with their slot data): the counter resumes
      // past the highest live berth instead of reissuing slot 1.
      this._muscleSeq = 0;
      for (const m of this._muscleAll()) {
        const slot = Number(m.data?.patrolSlot) || 0;
        if (slot > this._muscleSeq) this._muscleSeq = slot;
      }
    },
    _flags() {
      const flags = this.state?.story?.flags;
      return flags ? flags : (this.state?.story ? (this.state.story.flags = {}) : null);
    },
    _adventure() {
      const run = this.state?.run;
      return (!run || !run.kind || run.kind === 'adventure' || run.kind === 'campaign')
        && this.state?.world?.currentSectorId === BOUNCER.sectorId;
    },
    _entity(id) {
      const s = this.state;
      return s?.entities?.get?.(id) || (s?.entityList || []).find((e) => e && e.id === id) || null;
    },
    _robot() {
      for (const e of this.state?.entityList || []) {
        if (e?.alive && e.data?.bouncer === true) return e;
      }
      return null;
    },
    _muscleAll() {
      const out = [];
      for (const e of this.state?.entityList || []) {
        if (e && e.alive !== false && e.data?.bouncerMuscle === true) out.push(e);
      }
      return out;
    },
    _muscleFor(recordKey) {
      return this._muscleAll().filter((e) => e.data?.muscleFor === recordKey);
    },
    _removeEntitySafe(e) {
      if (e && e.alive !== false) this.helpers?.removeEntity?.(e.id);
    },
    _removeOwned() {
      for (const e of this.state?.entityList || []) {
        if (e?.alive && (e.data?.bouncer === true || e.data?.bouncerMuscle === true)) {
          this.helpers?.removeEntity?.(e.id);
        }
      }
    },
    /** A berthed hull is not rowdy: docked ships hold station by definition — the
     *  ring does not throw hulls that are not flying, and muscle does not shove
     *  them. Reads every convention the sim writes: a top-level docked note, the
     *  flags.docked bit, a data.docked note, and the player's ui.docked berth. */
    _docked(e) {
      if (!e) return false;
      if (e.docked === true || e.flags?.docked === true || e.data?.docked === true) return true;
      const s = this.state;
      return !!(s?.ui?.docked === true && (e.isPlayer === true || e.id === s.playerId));
    },
    /** The live mark a muscle contract hunts: the record key's live hull, still
     *  wearing the door's broadcast mark and still flying. Generation and dock
     *  guards ride along inside _entityByKey/_docked. */
    _wantedMarkFor(recordKey) {
      if (!recordKey) return null;
      const e = this._entityByKey(recordKey);
      if (!e || e.data?.bazaarWanted !== true || this._docked(e)) return null;
      return e;
    },
    /** Resolve a record key back to a live hull: player and authored characters by
     *  identity, hull rows by their transponder id — plus the stored occupant
     *  generation, because ids recycle and a recycled transponder must not
     *  inherit a dead rowdy's paper. Returns null for gone/dead/mismatched hulls. */
    _entityByKey(key) {
      const s = this.state;
      if (typeof key !== 'string' || !key || !s) return null;
      const live = (e) => (e && e.alive !== false ? e : null);
      if (key === 'player') return live(this._entity(s.playerId));
      if (key.startsWith('char:')) {
        const c = key.slice(5);
        for (const e of s.entityList || []) {
          if (e?.alive !== false && e.data?.authoredCharacter === c) return e;
        }
        return null;
      }
      if (key.startsWith('hull:')) {
        const e = live(this._entity(Number(key.slice(5))));
        if (!e) return null;
        // Same convention as stampAttackSource's sourceLife: a row with no
        // recorded generation cannot disprove identity, so it is still served.
        const gen = offenderRowObject(this._records()?.offenders?.[key])?.gen;
        if (gen != null && occupantGenerationOf(e) !== gen) return null;
        return e;
      }
      return null;
    },
    _sync() {
      if (!this.state?.story) return;
      if (!this._adventure()) { this._removeOwned(); return; }
      if (!this._robot() && this.helpers.spawnEntity) this.helpers.spawnEntity(bouncerSpec());
      const flags = this._flags();
      if (flags && flags[BOUNCER.announceFlag] !== true) {
        flags[BOUNCER.announceFlag] = true;
        this.bus?.emit('comms:popup', {
          id: 'bouncer_announce', sender: BOUNCER.sender, category: 'story',
          text: BOUNCER.announce, ttl: 9, persist: false,
        });
      }
    },
    // ── The station record ────────────────────────────────────────────────────
    // state.stationRecords.bouncer: { schema, offenders: {key: row}, counters }.
    // Plain JSON only — never an entity ref, never a Map — so the sheet reads clean
    // to saves, scanners, and station services alike. The durable copy is the story-
    // flags mirror; this subtree is the live public face.
    _freshRecords() {
      return {
        schema: BOUNCER_LAW.recordsSchema,
        offenders: {},
        muscleHired: 0, wantedIssued: 0, bansIssued: 0,
        trespassThrows: 0, vipNotices: 0,
      };
    },
    _records() {
      const s = this.state;
      if (!s) return null;
      if (!s.stationRecords || typeof s.stationRecords !== 'object' || Array.isArray(s.stationRecords)) {
        s.stationRecords = {};
      }
      const rec = s.stationRecords;
      if (!rec.bouncer || typeof rec.bouncer !== 'object' || rec.bouncer.schema !== BOUNCER_LAW.recordsSchema
        || !rec.bouncer.offenders || typeof rec.bouncer.offenders !== 'object' || Array.isArray(rec.bouncer.offenders)) {
        rec.bouncer = this._recordsFromMirror() || this._freshRecords();
      }
      return rec.bouncer;
    },
    _recordsFromMirror() {
      const m = this._flags()?.[BOUNCER_LAW.recordsFlag];
      if (!m || typeof m !== 'object' || Array.isArray(m) || m.schema !== BOUNCER_LAW.recordsSchema
        || !m.offenders || typeof m.offenders !== 'object' || Array.isArray(m.offenders)) return null;
      return JSON.parse(JSON.stringify(m)); // never alias the flag payload
    },
    _persistRecords() {
      const flags = this._flags();
      const rec = this.state?.stationRecords?.bouncer;
      if (!flags || !rec) return;
      flags[BOUNCER_LAW.recordsFlag] = JSON.parse(JSON.stringify(rec));
    },
    /** The save envelope owns the durable copy: on restore/newGame the mirror is the
     *  authority — live stationRecords always re-derive from what the run carried in.
     *  applyIdRemap is only legal on the save:loaded seam: sessionEntityIdRemap is that
     *  restore's own saved→live id map, meaningless against any later session's keys. */
    _restoreRecords(applyIdRemap = false) {
      const s = this.state;
      if (!s) return;
      const mirror = this._recordsFromMirror();
      if (mirror) {
        if (!s.stationRecords || typeof s.stationRecords !== 'object' || Array.isArray(s.stationRecords)) {
          s.stationRecords = {};
        }
        s.stationRecords.bouncer = mirror;
        this._adoptRestoredMarks(mirror, applyIdRemap);
      } else if (s.stationRecords && typeof s.stationRecords === 'object') {
        delete s.stationRecords.bouncer;
      }
    },
    /** A restore re-stamps every hull's occupant generation — the token is
     *  non-enumerable by design and never rides the save — so a hot `hull:` row's
     *  recorded gen can never prove its binding again. Two proofs rebind it:
     *
     *  1) The envelope's id remap. Saved transponder ids are reclaimed only
     *     best-effort — a ledger-held or earlier-claimed number moves the hull,
     *     and its sheet must follow or the rowdy returns as a stranger. The map
     *     is the envelope's own proof, so it beats the marks: 'hull:<savedId>'
     *     re-keys onto wherever that hull actually landed, and a stranger now
     *     holding the old number inherits nothing. Moves are staged then applied
     *     — a chained remap (5→47 while 47→90) must never hop a sheet twice, and
     *     several sources collapsing onto one carrier keep the hottest paper.
     *  2) The door's own marks: only this system writes bazaarWanted/doorBanned
     *     and corpses never serialize, so a live hull arriving with a mark on IS
     *     the rowdy the save carried — re-stamp its row's gen. Marks on dead
     *     paper (no row, or a cooled one) still die in the sweep. */
    _adoptRestoredMarks(rec, applyIdRemap = false) {
      const offenders = rec && rec.offenders;
      if (!offenders) return;
      let healed = false;
      const rank = (r) => (r && r.status === 'banned' ? 2 : r && r.status === 'wanted' ? 1 : 0);
      if (applyIdRemap) {
        const remap = this.state?.sessionEntityIdRemap;
        if (remap instanceof Map && remap.size) {
          const movers = new Map(); // newKey -> {key, row, mid} (hottest wins a collision)
          const sources = new Set(); // every vacated key, winners and losers alike
          for (const key of Object.keys(offenders)) {
            if (typeof key !== 'string' || !key.startsWith('hull:')) continue;
            const mid = remap.get(key.slice(5));
            if (!Number.isSafeInteger(mid)) continue;
            const nk = `hull:${mid}`;
            if (nk === key) continue;
            const row = offenderRowObject(offenders[key]);
            if (!row) continue;
            sources.add(key);
            const prev = movers.get(nk);
            if (!prev || rank(row) >= rank(prev.row)) movers.set(nk, { key, row, mid });
          }
          if (sources.size) {
            // Vacate every source first: a target that is itself a mover's source
            // must clear before anyone lands — chained remaps resolve correctly,
            // and losing copies (several saved ids collapsing onto one carrier)
            // leave no dead-paper twin behind.
            for (const key of sources) delete offenders[key];
            for (const [nk, mv] of movers) {
              const existing = offenderRowObject(offenders[nk]);
              // Unmoved paper already sitting at the target keeps its seat only
              // when it is strictly hotter; equal rank loses to the live binding.
              if (existing && rank(existing) > rank(mv.row)) continue;
              offenders[nk] = mv.row;
              const e = this._entity(mv.mid);
              if (e && e.alive !== false && bouncerRecordKey(e, this.state) === nk) {
                mv.row.gen = occupantGenerationOf(e);
              }
            }
            healed = true;
          }
        }
      }
      for (const e of this.state?.entityList || []) {
        if (!e || e.alive === false || !e.data) continue;
        if (e.data.bazaarWanted !== true && e.data.doorBanned !== true) continue;
        const k = bouncerRecordKey(e, this.state);
        if (!k || !k.startsWith('hull:')) continue;
        const row = offenderRowObject(offenders[k]);
        if (!row || (row.status !== 'wanted' && row.status !== 'banned')) continue;
        const gen = occupantGenerationOf(e);
        if (gen == null || row.gen === gen) continue;
        row.gen = gen;
        healed = true;
      }
      if (healed) this._persistRecords();
    },
    _offenderRow(key, now) {
      const rec = this._records();
      if (!rec || !key) return null;
      let row = offenderRowObject(rec.offenders[key]);
      if (!row) {
        row = rec.offenders[key] = {
          offenses: 0, strikes: 0, ejections: 0, status: 'watched',
          lastOffenseAt: now, lastKind: null, wantedUntil: null, bannedAt: null, tab: 0,
        };
      }
      return row;
    },
    /** Every offense lands on the sheet — kind ('discharge'), running tab, timestamp —
     *  and goes out on the wire for anything that reads the door's blotter. */
    _noteOffense(owner, kind, now) {
      const key = bouncerRecordKey(owner, this.state);
      let row = this._offenderRow(key, now);
      if (!row) return { key, row: null };
      if (key.startsWith('hull:')) {
        // Transponder ids recycle: a row stamped to a provably different
        // occupant generation belongs to a dead rowdy, so this hull starts a
        // fresh sheet under the same key instead of inheriting strikes,
        // ejections, and status it never earned. An UNPROVABLE hull (no stamp)
        // is denied the same way — _entityByKey already refuses to serve it,
        // so the offense path must not hand it the paper either.
        const gen = occupantGenerationOf(owner);
        if (row.gen != null && row.gen !== gen) {
          const rec = this._records();
          if (rec) delete rec.offenders[key];
          row = this._offenderRow(key, now) || row;
        }
        if (gen != null) row.gen = gen;
      }
      row.offenses += 1;
      row.lastOffenseAt = now;
      row.lastKind = kind;
      row.tab += BOUNCER_LAW.tabPerOffense;
      this._persistRecords();
      const isPlayer = owner.id === this.state?.playerId || owner.isPlayer === true;
      if (isPlayer) {
        const flags = this._flags();
        if (flags) flags[BOUNCER_VIP.streakFlag] = 0; // a blotter entry burns the streak
      }
      this.bus?.emit('bouncer:offense', {
        entityId: owner.id, recordKey: key, kind,
        offenses: row.offenses, status: row.status,
        isPlayer,
      });
      return { key, row };
    },
    /** The courtesy flag's real writer: clean berths count toward the door knowing
     *  your transponder. A wanted or banned sheet counts nothing — the streak only
     *  opens again once the blotter cools (status back under 'wanted'). */
    _onDocked() {
      if (!this._adventure()) return;
      const flags = this._flags();
      if (!flags || flags[BOUNCER_VIP.flag] === true) return;
      const s = this.state;
      const player = this._entity(s?.playerId);
      if (!player) return;
      const key = bouncerRecordKey(player, s);
      const rec = this._records();
      const row = key && rec && rec.offenders ? offenderRowObject(rec.offenders[key]) : null;
      if (row && (row.status === 'wanted' || row.status === 'banned')) return;
      const n = (Number(flags[BOUNCER_VIP.streakFlag]) || 0) + 1;
      flags[BOUNCER_VIP.streakFlag] = n;
      if (n < BOUNCER_VIP.docks) return;
      flags[BOUNCER_VIP.flag] = true;
      this.bus?.emit('comms:popup', {
        id: 'bouncer_vip_earned', sender: BOUNCER.sender, category: 'story',
        text: 'Five clean berths. The door knows your transponder now — it will still ask you to mind the muzzle.',
        ttl: 9, persist: false,
      });
      this.bus?.emit('bouncer:vipEarned', { entityId: player.id, docks: n });
    },
    /** VIPs do not take strikes — but the door still speaks, and the sheet still
     *  counts the courtesy. Rate-limited per hull so a burst reads as one talking-to. */
    _vipNotice(owner, now) {
      const rec = this._records();
      if (rec) { rec.vipNotices += 1; this._persistRecords(); }
      const last = this._vipNoted.get(owner);
      if (Number.isFinite(last) && (now - last) < 30) return;
      this._vipNoted.set(owner, now);
      const isPlayer = owner.id === this.state?.playerId || owner.isPlayer === true;
      this.bus?.emit('comms:popup', {
        id: `bouncer_vip_${owner.id}_${Math.floor(now)}`, sender: BOUNCER.sender,
        category: 'story', text: DOOR_LINES.vip, ttl: 6, persist: false,
      });
      this.bus?.emit('bouncer:vipDischarge', { entityId: owner.id, isPlayer });
    },
    /** Door law on every firing report: inside the ring is a strike. Warn once, then
     *  throw — the same for the player and for every corsair dumb enough to test it,
     *  except a hull the sheet already knows: wanted and banned rowdies get no more
     *  warnings, every shot inside is the throw. */
    _onFire(p) {
      if (!this._adventure() || !p) return;
      const owner = this._entity(p.ownerId);
      if (!owner || !bouncerInRing(owner.pos)) return;
      if (owner.data?.bouncer === true) return; // the door robot does not eject itself
      if (owner.data?.bouncerMuscle === true) return; // nor its paid hands
      if (!bouncerCanEject(owner) || this._docked(owner)) return; // a corpse's or a berthed hull's firing receipt is no strike
      const now = Number(this.state?.simTime) || 0;
      const flags = this._flags();
      // A continuous beam reports combat:fire every tick after its 'begin'
      // report — one held trigger is one discharge, not sixty a second.
      // Continuations still strike and still throw (throw timing is identical),
      // but the sheet is not re-booked and no persist or VIP notice burns.
      const cont = p.continuous === true && p.phase === 'update';
      // The live sheet for this hull, when one already exists — a courtesy look
      // never books and never creates paper.
      let key, row;
      const sheet = () => {
        key = bouncerRecordKey(owner, this.state);
        const r = offenderRowObject(this.state?.stationRecords?.bouncer?.offenders?.[key]);
        return (r && r.gen != null && occupantGenerationOf(owner) !== r.gen) ? null : r;
      };
      if (bouncerIsVip(owner, flags)) {
        row = sheet();
        // Courtesy covers the muzzle, never a live warrant: a friend of the
        // house whose sheet is already hot answers the paper, not the list.
        if (!row || (row.status !== 'wanted' && row.status !== 'banned')) {
          if (!cont) this._vipNotice(owner, now);
          return;
        }
      } else if (cont) {
        row = sheet();
        // A hold begun outside the cordon booked no 'begin' receipt — this
        // update is still the one discharge, so book it once; every later
        // update sees the row and the latch holds.
        if (!row) ({ key, row } = this._noteOffense(owner, 'discharge', now));
      } else {
        ({ key, row } = this._noteOffense(owner, 'discharge', now));
      }
      const prev = this._strikes.get(owner) || {};
      const dec = bouncerStrikeDecision(prev.count, prev.lastAt, now);
      this._strikes.set(owner, { count: dec.count, lastAt: now });
      if (row && !cont) { row.strikes = (Number(row.strikes) || 0) + 1; this._persistRecords(); }
      // A clean or merely watched hull still gets the spoken warning. Once the sheet
      // says wanted or banned, the door has nothing left to say — every shot throws.
      const hardCase = !!row && (row.status === 'wanted' || row.status === 'banned');
      if (!dec.eject && !hardCase) {
        this.bus?.emit('comms:popup', {
          id: `bouncer_warn_${owner.id}`, sender: BOUNCER.sender, category: 'warning',
          text: BOUNCER.warn, ttl: 7, persist: false,
        });
        this.bus?.emit('bouncer:warned', {
          entityId: owner.id, recordKey: key,
          isPlayer: owner.id === this.state?.playerId || owner.isPlayer === true,
        });
        return;
      }
      const lastThrow = this._ejectAt.get(owner);
      if (Number.isFinite(lastThrow) && (now - lastThrow) < BOUNCER.ejectCooldownS) return;
      this._throw(owner, now, 'discharge', key, row);
    },
    /** The throw itself, shared by discharge and trespass: a mass-scaled radial
     *  impulse through the membrane, scaled harder by the record, then the record
     *  escalates — watched, wanted, banned — and the consequences walk behind it. */
    _throw(owner, now, kind, key, row) {
      this._ejectAt.set(owner, now);
      const isPlayer = owner.id === this.state?.playerId || owner.isPlayer === true;
      const impulse = bouncerEjectImpulse(owner.pos, owner.mass);
      const scale = bouncerEjectScale(row);
      impulse.x *= scale; impulse.z *= scale;
      queuePhysicsImpulse(owner, impulse,
        isPlayer ? { externalEffect: true, isPlayerTarget: true, tick: this.state?.tick } : { tick: this.state?.tick });
      const flags = this._flags();
      if (flags) {
        flags[BOUNCER.ejectCountFlag] = (Number(flags[BOUNCER.ejectCountFlag]) || 0) + 1;
        if (isPlayer) flags[BOUNCER.playerEjectedFlag] = true;
      }
      if (row) {
        row.ejections = (Number(row.ejections) || 0) + 1;
        row.tab += BOUNCER_LAW.tabPerOffense * row.ejections; // each throw costs more than the last
        this._applyStatus(owner, key, row, bouncerStatusAfterEject(row.ejections), now, isPlayer);
        // A wanted hull that keeps earning throws stays hot — the sheet cools
        // on CLEAN time, so every new throw re-heats the deadline from now.
        // (_applyStatus early-returns on a same-status row, so the refresh
        // lives here; for a fresh transition it writes the same value twice.)
        if (row.status === 'wanted') {
          row.wantedUntil = now + BOUNCER_LAW.wantedS;
          const d = owner.data || (owner.data = {});
          d.bazaarWanted = true;
          d.bazaarWantedUntil = row.wantedUntil;
        }
      }
      const rec = this._records();
      if (rec && kind === 'trespass') rec.trespassThrows += 1;
      this._persistRecords();
      const text = kind === 'trespass' ? DOOR_LINES.trespass
        : row && row.status === 'banned' ? DOOR_LINES.banThrow
        : isPlayer ? BOUNCER.ejectPlayer : BOUNCER.backup;
      this.bus?.emit('comms:popup', {
        id: `bouncer_eject_${owner.id}_${Math.floor(now)}`, sender: BOUNCER.sender,
        category: 'warning', persist: isPlayer,
        text, ttl: 8,
      });
      this.bus?.emit('bouncer:ejected', {
        entityId: owner.id, isPlayer, kind: kind || 'discharge',
        status: row ? row.status : 'watched',
        offenderEjections: row ? row.ejections : 0,
        recordKey: key || null, impulseScale: scale,
        ejections: flags ? Number(flags[BOUNCER.ejectCountFlag]) || 0 : 0,
      });
    },
    /** Status transitions are where consequences attach: the mark goes on the live
     *  hull so scanners, traffic, and muscle can all read it; the wanted sheet starts
     *  cooling the moment it posts; a ban is forever and flags the player's record. */
    _applyStatus(owner, key, row, next, now, isPlayer) {
      if (!row || next === row.status) return;
      row.status = next;
      const flags = this._flags();
      if (next === 'wanted') {
        row.wantedUntil = now + BOUNCER_LAW.wantedS;
        const d = owner.data || (owner.data = {});
        d.bazaarWanted = true;
        d.bazaarWantedUntil = row.wantedUntil;
        const rec = this._records();
        if (rec) rec.wantedIssued += 1;
        this.bus?.emit('bouncer:wanted', {
          entityId: owner.id, recordKey: key, ejections: row.ejections,
          wantedUntil: row.wantedUntil, isPlayer,
        });
        this.bus?.emit('comms:popup', {
          id: `bouncer_wanted_${owner.id}_${Math.floor(now)}`, sender: BOUNCER.sender,
          category: 'warning', text: DOOR_LINES.wanted, ttl: 8, persist: isPlayer,
        });
        this._hireMuscle(key, now);
      } else if (next === 'banned') {
        row.bannedAt = now;
        row.wantedUntil = null; // a ban does not cool
        const d = owner.data || (owner.data = {});
        d.bazaarWanted = true;
        d.bazaarWantedUntil = null; // nor does it keep advertising a deadline it outlived
        d.doorBanned = true;
        const rec = this._records();
        if (rec) rec.bansIssued += 1;
        if (flags && isPlayer) flags[BOUNCER_LAW.playerBannedFlag] = true;
        this.bus?.emit('bouncer:banned', {
          entityId: owner.id, recordKey: key, ejections: row.ejections, isPlayer,
        });
        this.bus?.emit('comms:popup', {
          id: `bouncer_banned_${owner.id}_${Math.floor(now)}`, sender: BOUNCER.sender,
          category: 'warning', text: DOOR_LINES.banned, ttl: 9, persist: isPlayer,
        });
        this._hireMuscle(key, now);
      }
    },
    /** Provably dead paper: a gen-stamped transponder row can only ever be served
     *  by the one live occupant holding that id+gen pair. When it is gone — killed,
     *  despawned, recycled — no hull can ever inherit the rap (the gen mismatch is
     *  permanent), so the sheet is blotter history, not live law: it holds no
     *  muscle contract and no active-paper eviction immunity. Rows without a gen
     *  (pre-stamp saves, unauthored hulls) cannot disprove identity, so they keep
     *  their contract; player/char keys outlive any one hull entirely. A key the
     *  transponder grammar can never produce (hostile mirror data) is dead on
     *  arrival — nothing resolves it, ever. */
    _deadPaper(key, row) {
      if (typeof key !== 'string' || !row) return false;
      if (key === 'player' || key.startsWith('char:')) return false;
      if (!key.startsWith('hull:')) return true;
      return row.gen != null && this._entityByKey(key) === null;
    },
    /** Hired muscle: real hulls on contract, spawned off the robot's post, steered
     *  through the impulse membrane. The contract count is per mark — one for a
     *  wanted hull, two for a banned one — bounded by the bazaar's purse. */
    _desiredMuscleFor(key) {
      const row = offenderRowObject(this._records()?.offenders?.[key]);
      if (!row) return 0;
      if (row.status === 'banned') return BOUNCER_MUSCLE.perBanned;
      if (row.status === 'wanted') return BOUNCER_MUSCLE.perWanted;
      return 0;
    },
    _hireMuscle(key, now) {
      if (typeof this.helpers?.spawnEntity !== 'function' || !key) return 0;
      const have = this._muscleFor(key).length;
      const want = Math.min(this._desiredMuscleFor(key) - have,
        BOUNCER_MUSCLE.maxTotal - this._muscleAll().length);
      let spawned = 0;
      for (let i = 0; i < want; i++) {
        const m = this.helpers.spawnEntity(bouncerMuscleSpec(key, have + i));
        if (!m) continue;
        if (m.data) {
          m.data.muscleHiredAt = now;
          m.data.patrolSlot = (this._muscleSeq = (this._muscleSeq || 0) + 1);
        }
        const rec = this._records();
        if (rec) rec.muscleHired += 1;
        spawned += 1;
        this.bus?.emit('bouncer:muscleHired', { muscleId: m.id ?? null, recordKey: key, slot: have + i });
      }
      if (spawned) this._persistRecords();
      return spawned;
    },
    /** The sweep — the door's slow pass every sweepDtS: wanted sheets cool, stale
     *  marks come off dead paper, known hulls are re-marked on sight, banned hulls
     *  inside the ring are thrown on sight, muscle contracts reconcile, and the
     *  ledger stays bounded. */
    _sweep(now) {
      const s = this.state;
      const rec = this._records();
      if (!s || !rec) return;
      let dirty = false;
      // 1) A wanted sheet cools on clean time — and only on clean time.
      for (const key of Object.keys(rec.offenders)) {
        const row = offenderRowObject(rec.offenders[key]);
        if (!row) continue;
        if (row.status === 'wanted' && Number.isFinite(row.wantedUntil) && now >= row.wantedUntil) {
          row.status = 'watched';
          row.wantedUntil = null;
          dirty = true;
          const e = this._entityByKey(key);
          this.bus?.emit('bouncer:wantedCleared', {
            entityId: e ? e.id : null, recordKey: key, reason: 'cooled',
          });
        }
      }
      // 2) Marks follow the record: stale marks come off hulls whose paper cleared;
      //    a wanted or banned hull seen alive in-sector wears the mark again — the
      //    door remembers the transponder, and the mark is what everyone else reads.
      for (const e of s.entityList || []) {
        if (!e || e.alive === false || !e.data) continue;
        if (!e.data.bazaarWanted && !e.data.doorBanned) continue;
        const k = bouncerRecordKey(e, s);
        const row = offenderRowObject(rec.offenders[k]);
        // A recycled transponder does not carry the paper: a stamped row that
        // names a different occupant generation is not this hull's record.
        const mine = row && (row.gen == null || occupantGenerationOf(e) === row.gen);
        if (!(mine && (row.status === 'wanted' || row.status === 'banned'))) {
          delete e.data.bazaarWanted;
          delete e.data.bazaarWantedUntil;
        }
        if (!(mine && row.status === 'banned')) delete e.data.doorBanned;
      }
      for (const key of Object.keys(rec.offenders)) {
        const row = offenderRowObject(rec.offenders[key]);
        if (!row || (row.status !== 'wanted' && row.status !== 'banned')) continue;
        const e = this._entityByKey(key);
        if (!e) continue;
        const d = e.data || (e.data = {});
        if (d.bazaarWanted !== true) d.bazaarWanted = true;
        // The advertised deadline follows the paper on every pass — a re-heated
        // sheet or a ban must never leave a stale timestamp on the hull.
        d.bazaarWantedUntil = row.wantedUntil ?? null;
        if (row.status === 'banned') d.doorBanned = true;
      }
      // 3) Trespass: a banned hull inside the ring is thrown on sight — no shot
      //    needed, the mark is the warrant. The shared arm cooldown still applies.
      for (const e of s.entityList || []) {
        if (!e || e.alive === false || this._docked(e) || !bouncerCanEject(e) || !bouncerInRing(e.pos)) continue;
        if (e.data?.bouncer === true || e.data?.bouncerMuscle === true) continue;
        // The courtesy list does not commute a warrant: this pass only reaches
        // hulls whose paper already says banned, and a ban answers the sheet.
        const k = bouncerRecordKey(e, s);
        const row = offenderRowObject(rec.offenders[k]);
        if (!row || row.status !== 'banned') continue;
        if (row.gen != null && occupantGenerationOf(e) !== row.gen) continue; // recycled transponder
        const lastThrow = this._ejectAt.get(e);
        if (Number.isFinite(lastThrow) && (now - lastThrow) < BOUNCER.ejectCooldownS) continue;
        this._throw(e, now, 'trespass', k, row);
        dirty = true;
      }
      // 4) Muscle reconciliation: a contract stands while its mark's paper is hot —
      //    a mark that leaves the sector leaves muscle holding a perimeter post, not
      //    a pension. Contracts die with the paper (cooled, cleared, or never filed)
      //    or with the hull itself: dead paper keeps its row, not its door hands —
      //    a corpse's contract frees the purse for the living's marks.
      for (const m of this._muscleAll()) {
        const k = m.data?.muscleFor;
        const row = k ? offenderRowObject(rec.offenders[k]) : null;
        const hot = row && (row.status === 'wanted' || row.status === 'banned');
        if (hot && !this._deadPaper(k, row)) continue;
        const reason = !row ? 'no_record' : !hot ? 'cooled' : 'dead_paper';
        this._removeEntitySafe(m);
        this.bus?.emit('bouncer:muscleStandDown', { muscleId: m.id ?? null, recordKey: k || null, reason });
      }
      for (const key of Object.keys(rec.offenders)) {
        const row = offenderRowObject(rec.offenders[key]);
        if (row && (row.status === 'wanted' || row.status === 'banned') && !this._deadPaper(key, row)) {
          this._hireMuscle(key, now);
        }
      }
      // 5) Housekeeping: prune dead clocks and bound the ledger. Live paper
      //    (servable wanted/banned) is never evicted; the oldest small fry and
      //    dead sheets go first.
      for (const m of Array.from(this._muscleShoveAt.keys())) {
        if (!m || m.alive === false) this._muscleShoveAt.delete(m);
      }
      for (const e of Array.from(this._vipNoted.keys())) {
        if (!e || e.alive === false) this._vipNoted.delete(e);
      }
      for (const e of Array.from(this._strikes.keys())) {
        if (!e || e.alive === false) this._strikes.delete(e);
      }
      for (const e of Array.from(this._ejectAt.keys())) {
        if (!e || e.alive === false) this._ejectAt.delete(e);
      }
      const keys = Object.keys(rec.offenders);
      if (keys.length > BOUNCER_LAW.maxOffenderRows) {
        const active = [], inactive = [];
        for (const k of keys) {
          const row = offenderRowObject(rec.offenders[k]);
          const st = row && row.status;
          // Dead paper is history, not live law — it evicts with the small fry.
          (st === 'wanted' || st === 'banned' ? (this._deadPaper(k, row) ? inactive : active) : inactive).push(k);
        }
        inactive.sort((a, b) => (Number(offenderRowObject(rec.offenders[a])?.lastOffenseAt) || 0)
          - (Number(offenderRowObject(rec.offenders[b])?.lastOffenseAt) || 0));
        const keepInactive = Math.max(0, BOUNCER_LAW.maxOffenderRows - active.length);
        const keep = new Set(active.concat(inactive.slice(Math.max(0, inactive.length - keepInactive))));
        for (const k of keys) if (!keep.has(k)) { delete rec.offenders[k]; dirty = true; }
      }
      if (dirty) this._persistRecords();
    },
    /** Muscle drive pass every update: a live mark gets chased and shoved through
     *  the door (radial out, real mass — the ring's own ammunition), a markless
     *  contract drifts to its perimeter post and holds. All through the membrane. */
    _driveMuscle(now) {
      const s = this.state;
      if (!s) return;
      for (const m of this._muscleAll()) {
        if (!finiteXZ(m.pos) || !(m.mass > 0)) continue;
        const vx = finiteXZ(m.vel) ? m.vel.x : 0;
        const vz = finiteXZ(m.vel) ? m.vel.z : 0;
        const mark = this._wantedMarkFor(m.data?.muscleFor);
        if (mark && finiteXZ(mark.pos)) {
          const dx = mark.pos.x - m.pos.x, dz = mark.pos.z - m.pos.z;
          const d = Math.hypot(dx, dz) || 1e-6;
          // Chase at contract speed, but brake inside arm's reach — a paid hand
          // hangs on its mark, it doesn't orbit through it.
          const desire = d > BOUNCER_MUSCLE.arriveRadius ? BOUNCER_MUSCLE.chaseSpeed : 0;
          const dvx = (dx / d) * desire - vx, dvz = (dz / d) * desire - vz;
          if (dvx || dvz) queuePhysicsImpulse(m, { x: dvx * m.mass, z: dvz * m.mass }, { tick: s.tick });
          if (d <= BOUNCER_MUSCLE.shoveRange) {
            const last = this._muscleShoveAt.get(m);
            if (!Number.isFinite(last) || (now - last) >= BOUNCER_MUSCLE.shoveCooldownS) {
              this._muscleShoveAt.set(m, now);
              const shove = bouncerEjectImpulse(mark.pos, mark.mass, BOUNCER.center, BOUNCER_MUSCLE.shoveDv);
              const isPlayer = mark.id === s.playerId || mark.isPlayer === true;
              queuePhysicsImpulse(mark, shove,
                isPlayer ? { externalEffect: true, isPlayerTarget: true, tick: s.tick } : { tick: s.tick });
              this.bus?.emit('bouncer:muscleShove', {
                muscleId: m.id ?? null, targetId: mark.id ?? null, recordKey: m.data?.muscleFor || null,
              });
            }
          }
        } else {
          // The mark is dead or gone; the contract still pays — hold a berth on the
          // ring until the sheet says otherwise.
          const post = bouncerMusclePatrolPost(Number(m.data?.patrolSlot ?? m.data?.muscleSlot) || 0);
          const dx = post.x - m.pos.x, dz = post.z - m.pos.z;
          const d = Math.hypot(dx, dz);
          if (d > BOUNCER_MUSCLE.arriveRadius) {
            queuePhysicsImpulse(m, {
              x: ((dx / d) * BOUNCER_MUSCLE.patrolSpeed - vx) * m.mass,
              z: ((dz / d) * BOUNCER_MUSCLE.patrolSpeed - vz) * m.mass,
            }, { tick: s.tick });
          } else if (vx !== 0 || vz !== 0) {
            queuePhysicsImpulse(m, { x: -vx * m.mass, z: -vz * m.mass }, { tick: s.tick });
          }
        }
      }
    },
    /** Calendar pass: the robot drifts home when pushed off its post — a door robot
     *  knocked across the ring walks back to the door. The walk crosses the impulse
     *  membrane like docket's servo: the robot is a live dynamic body, so a direct vel
     *  write would die in the physics readback before it ever moved. The same tick
     *  runs the records sweep and drives the muscle — the robot's body and the law's
     *  paperwork keep different clocks but the same beat. */
    update(dt, state) {
      const s = state || this.state;
      if (!s || !this._adventure()) return;
      const now = Number(s.simTime) || 0;
      const robot = this._robot();
      if (robot && robot.pos) {
        const dv = bouncerDriftHome(robot);
        if (dv && (robot.mass > 0)) {
          queuePhysicsImpulse(robot, { x: dv.x * robot.mass, z: dv.z * robot.mass }, { tick: s.tick });
        }
      }
      if (now >= (Number(this._nextSweep) || 0)) {
        this._nextSweep = now + BOUNCER_LAW.sweepDtS;
        this._sweep(now);
      }
      this._driveMuscle(now);
    },
  };
}

export const bouncer = createBouncer();
