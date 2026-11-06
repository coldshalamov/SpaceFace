// W-SHIFT (row 506, 03 §4.3): QUILL / AR-3 — the deserter page-drone. It hides
// by the Watcher's Tithe rim on Triton Wake's empty lane with the Archive's
// sealed pages still in its chest. Bring it a scanned wreck — a hull whose
// manifest your scanner resolved — settled inside its read ring, and it copies
// the log. The wreck stays yours; the page opens. One sealed secret per new
// copy, in order, until the Archive is out. "I copied it. Now it exists twice.
// That is how you keep a thing."
//
// THE INFORMATION ECONOMY — what the copies are FOR:
//   • THE LEDGER (state.story.quillLedger): every copy mints a FOLIO — a page of
//     sellable intel. Its kind is read off the hull's log: manifests are trade
//     intel, lane charts are routes, and court/courier paper is NAMES — the
//     blackmail pages that pay best and burn hardest.
//   • THE DESK: stand your hull inside the rim and the drone's buyers take one
//     folio per slow cadence. The press keeps an ink cut; answered errands and
//     Archive attention move every price.
//   • THE PRESS: once the sealed Archive is out, the drone keeps printing —
//     fresh logs get an OVERPRINT (a folio with no secret attached), already-
//     stamped hulls give one RE-IMPRESSION (a copy of a copy sells like one),
//     and unread blanks get a FORGED page that pays sealed-page money until a
//     buyer checks the seal.
//   • THE ERRANDS: each opened page wants to go home. The ledger arms one errand
//     at a time — carry the page's copy to the sector that wrote it and the
//     machine there answers it with credit and truth. Every answer raises every
//     later price; all six is the Archive rebound.
//   • THE NOTICE: a page that exists twice gets noticed. Exposure climbs with
//     every print, every names sale, every burn — decays slowly with quiet time
//     — and past the line the Archive sends a REDACTOR, a collector drone that
//     chases the pilot through the impulse membrane and takes a page back, or
//     takes credits where there is no page left to take. Kill it and the Archive
//     writes your name in a margin.
//
// WHAT THIS OWNS — the drone hull and the redactor hulls it summons (one-off
// event seams: init / deferred sector-enter / save:loaded / newGame), the copy
// count and gone receipt in story flags, the quillCopied / quillOverprinted /
// quillReimpressed / quillForgedBlank stamps on each worked hull, the folio
// ledger under state.story, and the calendar census that reads the ring, runs
// the desk, mints the press, and steers the redactor. The stamp rides the
// hull's data, so a copied log can never be re-copied — across saves, sectors,
// or a later drone. Money only ever moves as economy:grantCredits /
// economy:chargeCredits intents (economy.js is the sole credits writer);
// standing moves as faction:repDelta intents. Nothing here reads or writes
// entity.vel; drift-home and the redactor's chase go through queuePhysicsImpulse.
// Every roll is hash32 over stable keys — no ambient randomness, no wall time.
import { QUILL } from '../data/quill.js';
import { quillCopyable, quillNextSecret, quillSecretAt, quillDriftHome } from '../characters/quillRules.js';
import { deferSectorEnterMaterialization } from '../core/sectorEnterDefer.js';
import { queuePhysicsImpulse } from '../core/physicsAuthority.js';
import { hash32 } from '../core/rng.js';

// ── THE LEDGER ───────────────────────────────────────────────────────────────
// `state.story.quillLedger` — a JSON-safe subtree this system owns outright (the
// way titles owns state.story.titles). Absent until the drone's first copy
// mints, so a run that never finds the rim serializes byte-identically to
// before. clonePlain'd wholesale by the save envelope; sanitized on read so a
// stale or hand-edited section heals instead of poisoning the desk.
const LEDGER_SCHEMA = 1;
const FOLIO_CAP = 120;
const FOLIO_STATUS = new Set(['held', 'sold', 'seized']);
const FOLIO_KINDS = new Set(['manifest', 'route', 'names', 'impression', 'forgery']);

function defaultQuillLedger() {
  return {
    schema: LEDGER_SCHEMA,
    seq: 0, saleSeq: 0,
    folios: [],
    sold: 0, earnedCr: 0, seized: 0, burned: 0, forged: 0,
    exposure: 0, exposureAt: 0,
    quietUntil: 0, burnedMarketUntil: 0, nextSaleAt: 0,
    answered: {}, errand: null, errandsDone: 0, rebound: false,
    pressAnnounced: false,
    redactorSeq: 0, redactorNextAt: 0, redactorUntil: 0, redactorLosses: 0,
  };
}

function pruneFolios(folios) {
  // Bound the save: held pages are sacred; closed receipts die newest-last —
  // the most recent sales stay readable, the deep past drops off the spine.
  const held = folios.filter((f) => f.status === 'held');
  const closed = folios.filter((f) => f.status !== 'held')
    .sort((a, b) => (b.soldAt || 0) - (a.soldAt || 0) || (b.copiedAt || 0) - (a.copiedAt || 0));
  return held.concat(closed).slice(0, FOLIO_CAP);
}

function sanitizeFolio(raw) {
  if (!raw || typeof raw !== 'object' || Array.isArray(raw)) return null;
  const id = typeof raw.id === 'string' && raw.id ? raw.id : null;
  if (!id) return null;
  return {
    id,
    markerId: typeof raw.markerId === 'string' ? raw.markerId : null,
    sectorId: typeof raw.sectorId === 'string' ? raw.sectorId : QUILL.sectorId,
    kind: FOLIO_KINDS.has(raw.kind) ? raw.kind : 'manifest',
    grade: Math.max(1, Math.min(5, Math.floor(Number(raw.grade) || 1))),
    impression: raw.impression === 2 ? 2 : 1,
    forged: raw.forged === true,
    burned: raw.burned === true,
    copiedAt: Math.max(0, Number(raw.copiedAt) || 0),
    status: FOLIO_STATUS.has(raw.status) ? raw.status : 'held',
    priceCr: Math.max(0, Math.round(Number(raw.priceCr) || 0)),
    grantedCr: Math.max(0, Math.round(Number(raw.grantedCr) || 0)),
    soldAt: Math.max(0, Number(raw.soldAt) || 0),
    saleSeq: Math.max(0, Math.floor(Number(raw.saleSeq) || 0)),
    buyer: typeof raw.buyer === 'string' ? raw.buyer : null,
  };
}

/** A ledger candidate -> clean ledger, or null when it is not an object at all.
 *  Tolerates partial rows (older saves, hand edits): anything missing takes the
 *  default; folios without ids are dropped. */
export function sanitizeQuillLedger(raw) {
  if (!raw || typeof raw !== 'object' || Array.isArray(raw)) return null;
  const out = defaultQuillLedger();
  out.seq = Math.max(0, Math.floor(Number(raw.seq) || 0));
  out.saleSeq = Math.max(0, Math.floor(Number(raw.saleSeq) || 0));
  for (const f of Array.isArray(raw.folios) ? raw.folios : []) {
    const clean = sanitizeFolio(f);
    if (clean) out.folios.push(clean);
  }
  if (out.folios.length > FOLIO_CAP) out.folios = pruneFolios(out.folios);
  for (const k of ['sold', 'earnedCr', 'seized', 'burned', 'forged',
    'errandsDone', 'redactorSeq', 'redactorLosses']) {
    out[k] = Math.max(0, Math.floor(Number(raw[k]) || 0));
  }
  for (const k of ['exposure', 'exposureAt', 'quietUntil', 'burnedMarketUntil',
    'nextSaleAt', 'redactorNextAt', 'redactorUntil']) {
    out[k] = Math.max(0, Number(raw[k]) || 0);
  }
  out.exposure = Math.min(QUILL_NOTICE.cap, out.exposure);
  const answered = raw.answered && typeof raw.answered === 'object' && !Array.isArray(raw.answered)
    ? raw.answered : {};
  for (const key of Object.keys(answered)) {
    const idx = Math.floor(Number(key));
    if (Number.isInteger(idx) && idx >= 0 && idx < QUILL.secrets.length && answered[key] === true) {
      out.answered[idx] = true;
    }
  }
  const errand = raw.errand && typeof raw.errand === 'object' && !Array.isArray(raw.errand)
    ? raw.errand : null;
  if (errand && quillErrandFor(errand.page) && typeof errand.sectorId === 'string') {
    out.errand = {
      page: Math.floor(Number(errand.page)),
      sectorId: errand.sectorId,
      armedAt: Math.max(0, Number(errand.armedAt) || 0),
    };
  }
  out.rebound = raw.rebound === true;
  out.pressAnnounced = raw.pressAnnounced === true;
  return out;
}

// ── THE DESK — the rim as a market stall ──────────────────────────────────────
export const QUILL_DESK = Object.freeze({
  radius: 190,             // stand inside it and the broker's buyers come
  cadenceS: 12,            // one folio per cadence — the drone writes carefully
  inkCut: 0.15,            // the press keeps its ink: buyer price × (1 - cut)
  quietS: 90,              // a burned name closes the desk this long
  marketBurnS: 160,        // a detected forgery collapses every price this long
  burnedPriceMult: 0.35,   // a burned market pays cents on the credit
});

// ── THE PRESS — kind, grade, and the price law ────────────────────────────────
export const QUILL_PRESS = Object.freeze({
  baseCr: Object.freeze({ manifest: 90, route: 140, names: 240, impression: 55, forgery: 210 }),
  gradeFloor: 0.7, gradeStep: 0.3,          // price × (0.7 + 0.3 × grade)
  impressionMult: 0.45,                     // a copy of a copy sells like one
  namesBurnChance: 0.22, namesFineFrac: 0.6, namesFineMinCr: 80, namesRepHit: -5,
  forgeryDetectChance: 0.3, forgeryFineFrac: 0.5,
});

// ── THE NOTICE — the Archive watches what exists twice ────────────────────────
export const QUILL_NOTICE = Object.freeze({
  mintCopy: 8, mintOverprint: 6, mintImpression: 4, mintForgery: 12,
  namesSale: 6, burn: 14, redactorKill: 15, seizeRelief: 20, withdrawRelief: 10,
  pageSix: 17,                 // the page that names the deserter — it hears itself
  decayPerS: 0.12, cap: 100,
  hotAt: 40, hotMult: 1.25,    // hot paper sells dear
  sendAt: 80, sendRelief: 35,  // past the line a redactor comes for the ledger
  answeredBonusPer: 0.04,      // each answered errand: +4% on every later sale
});

// ── THE ERRANDS — each sealed page wants to go home ───────────────────────────
// The page index is the secret index: opening page k arms the errand that
// carries its copy back to the sector the secret was written about. Delivery
// resolves on sector:enter — the machine that inspired the page reads the copy
// when you arrive. Arrival IS the delivery: the copy is in your hold.
export const QUILL_ERRANDS = Object.freeze([
  Object.freeze({ page: 0, sectorId: 'sector_dione_lane', rewardCr: 260,
    line: 'PAGE 1 ANSWERED — the dead scale on Dione Lane still reads true. The page came home.' }),
  Object.freeze({ page: 1, sectorId: 'sector_orcus_shadow', rewardCr: 260,
    line: 'PAGE 2 ANSWERED — the broken shepherd counts the ring at Orcus. It counted you in.' }),
  Object.freeze({ page: 2, sectorId: 'sector_haumea_rift', rewardCr: 300,
    line: 'PAGE 3 ANSWERED — AN-1 still runs the Haumea rift, clamps open. The page was true.' }),
  Object.freeze({ page: 3, sectorId: 'sector_phoebe_echo', rewardCr: 300,
    line: 'PAGE 4 ANSWERED — five bells at Phoebe Echo, still waiting for the low one first.' }),
  Object.freeze({ page: 4, sectorId: 'sector_eunomia_gulf', rewardCr: 340,
    line: 'PAGE 5 ANSWERED — UG-4 still races the wrecks home. The garden grows.' }),
  Object.freeze({ page: 5, sectorId: 'sector_sedna_dark', rewardCr: 400,
    line: 'PAGE 6 ANSWERED — the dark kept the deserter\'s name. Now it keeps yours too.' }),
]);
export const QUILL_REBOUND_CR = 1400;

// ── THE REDACTOR — the Archive's collector ────────────────────────────────────
export const QUILL_REDACTOR = Object.freeze({
  radius: 7, mass: 14, hull: 60,
  speed: 96,               // impulse-steered homing speed — catchable, killable
  arrive: 26,              // contact radius: it takes a page, or a fine
  spawnDist: 430,
  ttlS: 240,               // it gives up eventually — it does not forget
  seizeFineCr: 180,        // no held pages: it collects credits instead
  retryS: 60,              // beat between sends after a seize or a kill
});

// A burned names page names back: the wronged party is one of the respectable
// five, picked off the manifest's own marker so the blow lands where the paper
// said it would.
const BURN_FACTIONS = Object.freeze([
  'faction_scn', 'faction_mts', 'faction_dmc', 'faction_quiet', 'faction_reach',
]);
const BUYERS = Object.freeze([
  'a Quiet ledger-broker', 'the Dione weigh-men', 'a Reach powder house',
  'the Sedna collation', 'a Free captain who asks nothing',
]);

// ── pure rules (module scope; the adapter below reads them per census) ────────
function finiteXZ(v) {
  return Number.isFinite(v && v.x) && Number.isFinite(v && v.z);
}

// A log is what a scanner READ. Aftermath stamps a markerId on every wreck at
// birth, so marker stamps alone never make a log (same gate as quillCopyable).
function logOf(d) {
  return !!(d && d.scanRevealed);
}

function settledInRing(entity, post) {
  if (!entity || !finiteXZ(entity.pos) || !finiteXZ(post)) return false;
  const speed = finiteXZ(entity.vel) ? Math.hypot(entity.vel.x, entity.vel.z) : 0;
  if (speed > QUILL.readSpeed) return false;
  return Math.hypot(entity.pos.x - post.x, entity.pos.z - post.z) <= QUILL.readRadius;
}

/** What a hull's log is good for on the market. Court/registry/courier paper
 *  names names — leverage, not freight. Otherwise the manifest's own marker
 *  decides: one log in ten carries names, four in ten carry lane charts. */
export function quillFolioKind(data) {
  const d = data || {};
  const prov = d.provenance || {};
  const text = `${prov.recordType || ''} ${prov.sourceRef || ''} ${prov.incidentId || ''} ${prov.lossId || ''}`;
  if (/court|warrant|witness|hearing|cordon|blockade|registry|diplomatic|courier|sealed|alias/i.test(text)) {
    return 'names';
  }
  const marker = String(d.markerId || d.aftermathMarkerId || prov.markerId
    || (d.scanRevealed && d.scanRevealed.discovery) || 'anon');
  const r = hash32(marker, 'quill-folio-kind') % 10;
  if (r === 0) return 'names';
  if (r <= 4) return 'route';
  return 'manifest';
}

/** Richness of the log: mass of the paper trail plus provenance depth. 1..5. */
export function quillFolioGrade(entity) {
  const d = (entity && entity.data) || {};
  let g = 1;
  g += Math.min(2, Math.floor((Number(entity && entity.hullMax) || 0) / 150));
  if (d.provenance && (d.provenance.lossId || d.provenance.recordType)) g += 1;
  if (d.scanRevealed && d.scanRevealed.discovery) g += 1;
  return Math.max(1, Math.min(5, g));
}

/** The buyer's gross price. Hot paper sells dear; a burned market pays cents;
 *  every answered errand is a confirmed secret and buyers pay for confirmed. */
export function quillFolioPrice(folio, ledger, simTime) {
  if (!folio || typeof folio !== 'object') return 0;
  const base = QUILL_PRESS.baseCr[folio.kind] || QUILL_PRESS.baseCr.manifest;
  let price = base * (QUILL_PRESS.gradeFloor + QUILL_PRESS.gradeStep * (folio.grade || 1));
  if ((folio.impression || 1) > 1) price *= QUILL_PRESS.impressionMult;
  const exposure = quillExposureNow(ledger, simTime);
  if (exposure >= QUILL_NOTICE.hotAt) price *= QUILL_NOTICE.hotMult;
  price *= 1 + QUILL_NOTICE.answeredBonusPer * (Number(ledger && ledger.errandsDone) || 0);
  if (Number.isFinite(simTime) && Number(ledger && ledger.burnedMarketUntil) > simTime) {
    price *= QUILL_DESK.burnedPriceMult;
  }
  return Math.max(1, Math.round(price));
}

const MILL = 1000000;
/** Did the named party find out who sold them? Pure in (folio id, sale seq). */
export function quillNamesBurns(folio, saleSeq) {
  const roll = hash32(String((folio && folio.id) || ''), 'quill-names-burn',
    Math.floor(Number(saleSeq) || 0)) % MILL;
  return roll < QUILL_PRESS.namesBurnChance * MILL;
}
/** Did a buyer check the seal on a forged page? Pure in (folio id, sale seq). */
export function quillForgeryDetected(folio, saleSeq) {
  const roll = hash32(String((folio && folio.id) || ''), 'quill-forgery-detect',
    Math.floor(Number(saleSeq) || 0)) % MILL;
  return roll < QUILL_PRESS.forgeryDetectChance * MILL;
}
/** Who the named page names back — the manifest marker picks the grudge. */
export function quillBurnFaction(folio) {
  const key = String((folio && (folio.markerId || folio.id)) || '');
  return BURN_FACTIONS[hash32(key, 'quill-burn-faction') % BURN_FACTIONS.length];
}
/** The buyer's voice for the sale line — names and seals sell to specialists. */
export function quillBuyerFor(folio, saleSeq) {
  const kind = folio && folio.kind;
  if (kind === 'names') return 'a captain who pays for names';
  if (kind === 'forgery') return 'a collation that does not check seals';
  return BUYERS[hash32(String((folio && folio.id) || ''), 'quill-buyer',
    Math.floor(Number(saleSeq) || 0)) % BUYERS.length];
}

// ── the press predicates — post-Archive work, one hull at a time ──────────────
// These mirror quillCopyable's ring geometry but read different stamps: the
// Archive being out frees the PRESS, which serves three other hulls.
/** A scanned log the drone reads again once the Archive is out — the folio
 *  still mints (the log is real); no sealed page opens because none are left.
 *  The quillCopied stamp stays null — the Archive-stamp contract is untouched. */
export function quillOverprintable(entity, post) {
  if (!entity || entity.alive === false || entity.type !== 'wreck') return false;
  const d = entity.data || {};
  if (d.quill === true || d.quillCopied === true || d.quillOverprinted === true) return false;
  return logOf(d) && settledInRing(entity, post);
}
/** An unread wreck is a blank page: the drone writes a forged sealed page onto
 *  it. It never had a log — a later scanner may still find one underneath. */
export function quillBlank(entity, post) {
  if (!entity || entity.alive === false || entity.type !== 'wreck') return false;
  const d = entity.data || {};
  if (d.quill === true || d.quillCopied === true || d.quillOverprinted === true
      || d.quillForgedBlank === true) return false;
  return !logOf(d) && settledInRing(entity, post);
}
/** A hull the Archive already stamped gives one more impression — the drone
 *  reads its OWN stamp and prints it again. The one-page law stands: this is
 *  the press running, not a second sealing. */
export function quillReimpressable(entity, post) {
  if (!entity || entity.alive === false || entity.type !== 'wreck') return false;
  const d = entity.data || {};
  return d.quillCopied === true && d.quillReimpressed !== true && settledInRing(entity, post);
}

/** The errand an opened page arms, or null past the Archive's end. */
export function quillErrandFor(page) {
  const i = Math.floor(Number(page));
  return QUILL_ERRANDS.find((e) => e.page === i) || null;
}

/** The redactor hull — a collector drone the Archive sends for its pages. A
 *  story_prop peer of QUILL itself: a live dynamic body steered through the
 *  impulse membrane, never a vel write. */
export function quillRedactorSpec(spot, seq) {
  const x = Number(spot && spot.x) || 0;
  const z = Number(spot && spot.z) || 0;
  return {
    type: 'drone',
    pos: { x, z }, vel: { x: 0, z: 0 },
    radius: QUILL_REDACTOR.radius, mass: QUILL_REDACTOR.mass,
    hull: QUILL_REDACTOR.hull, hullMax: QUILL_REDACTOR.hull,
    homeSectorId: QUILL.sectorId,
    data: {
      quillRedactor: true, runtimeOwner: 'quill', parentType: 'story_prop',
      callsign: 'REDACTOR', quillRedactorSeq: Math.max(0, Math.floor(Number(seq) || 0)),
      scanLabel: 'Archive redactor — a collector drone come for the pages',
      scannerSignalKind: 'archive',
      homeSectorId: QUILL.sectorId,
    },
  };
}

// Exposure decays lazily — a projection at read time, not a tick — so hiding in
// another sector cools the notice exactly as well as holding still on the rim.
export function quillExposureNow(ledger, simTime) {
  const base = Number(ledger && ledger.exposure) || 0;
  const at = Number(ledger && ledger.exposureAt) || 0;
  const now = Number(simTime);
  if (!Number.isFinite(now) || now <= at) return Math.min(QUILL_NOTICE.cap, base);
  return Math.max(0, Math.min(QUILL_NOTICE.cap, base - (now - at) * QUILL_NOTICE.decayPerS));
}

export function createQuill() {
  return {
    name: 'quill',
    init(ctx) {
      this.destroy();
      this.state = ctx.state; this.bus = ctx.bus; this.helpers = ctx.helpers || {};
      this._unsubs = [];
      this._announced = false;
      this._deskHinted = false;
      const on = (event, fn) => {
        const off = this.bus?.on(event, fn); if (typeof off === 'function') this._unsubs.push(off);
      };
      on('sector:enter', (p) => {
        this._announced = false;
        this._deskHinted = false;
        // The errand resolves on the PAGE's home sector, never on the drone's —
        // run it before the adventure gate decides whether the rim is even live.
        this._resolveErrand(p);
        if (deferSectorEnterMaterialization(this.state, p, this._cookProvider)) return;
        this._sync();
      });
      this._cookProvider = () => { this._sync(); };
      (this.helpers.sectorCookProviders || (this.helpers.sectorCookProviders = []))
        .push(this._cookProvider);
      on('save:loaded', () => {
        this._announced = false; this._deskHinted = false; this._sync();
      });
      on('game:newGame', () => {
        this._announced = false; this._deskHinted = false; this._sync();
      });
      on('entity:killed', (p) => this._onKilled(p));
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
      this._deskHinted = false;
      this._removeOwned();
    },
    _flags() {
      const flags = this.state?.story?.flags;
      return flags ? flags : (this.state?.story ? (this.state.story.flags = {}) : null);
    },
    _adventureRun() {
      const run = this.state?.run;
      return !run || !run.kind || run.kind === 'adventure' || run.kind === 'campaign';
    },
    _adventure() {
      return this._adventureRun()
        && this.state?.world?.currentSectorId === QUILL.sectorId;
    },
    _entity(id) {
      const s = this.state;
      return s?.entities?.get?.(id) || (s?.entityList || []).find((e) => e && e.id === id) || null;
    },
    _playerEntity() {
      const s = this.state;
      const byId = s?.playerId != null ? this._entity(s.playerId) : null;
      if (byId && byId.pos) return byId;
      for (const e of s?.entityList || []) {
        if (e && e.alive !== false && e.isPlayer === true && e.pos) return e;
      }
      return byId && byId.alive !== false ? byId : null;
    },
    _robot() {
      for (const e of this.state?.entityList || []) {
        if (e?.alive && e.data?.quill === true) return e;
      }
      return null;
    },
    _redactorLive() {
      for (const e of this.state?.entityList || []) {
        if (e?.alive && e.data?.quillRedactor === true) return e;
      }
      return null;
    },
    _removeOwned() {
      for (const e of this.state?.entityList || []) {
        if (e?.alive && (e.data?.quill === true || e.data?.quillRedactor === true)) {
          this.helpers?.removeEntity?.(e.id);
        }
      }
    },
    _say(id, text, ttl = 7) {
      this.bus?.emit('comms:popup', {
        id, sender: QUILL.sender, category: 'story', text, ttl, persist: false,
      });
    },
    _log(id, text) {
      this.bus?.emit('comms:log', { id, from: QUILL.sender, kind: 'quill', text });
    },
    // ── the ledger accessors ─────────────────────────────────────────────────
    /** Create-or-heal. A missing/corrupt section installs a clean ledger; a
     *  live schemad one is trusted as-is only while its working fields are
     *  actually there — a schemad-but-partial row re-sanitizes, so a stale or
     *  hand-cut section heals instead of minting NaN at the desk. */
    _ledger() {
      const story = this.state?.story;
      if (!story) return null;
      const raw = story.quillLedger;
      if (raw && raw.schema === LEDGER_SCHEMA && Array.isArray(raw.folios)
          && Number.isFinite(raw.seq) && Number.isFinite(raw.exposure)
          && Number.isFinite(raw.saleSeq) && Number.isFinite(raw.errandsDone)
          && Number.isFinite(raw.sold) && Number.isFinite(raw.earnedCr)
          && Number.isFinite(raw.redactorSeq)
          && raw.answered && typeof raw.answered === 'object' && !Array.isArray(raw.answered)) {
        return raw;
      }
      const clean = sanitizeQuillLedger(raw) || defaultQuillLedger();
      story.quillLedger = clean;
      return clean;
    },
    /** Never mints — but a section that already exists is healed in place, so
     *  other-sector seams read the same ledger the desk writes. */
    _peekLedger() {
      const raw = this.state?.story?.quillLedger;
      if (raw == null) return null;
      return this._ledger();
    },
    _exposureAdd(ledger, delta, simTime) {
      if (!ledger) return 0;
      ledger.exposure = Math.max(0, Math.min(QUILL_NOTICE.cap,
        quillExposureNow(ledger, simTime) + (Number(delta) || 0)));
      ledger.exposureAt = Number(simTime) || 0;
      return ledger.exposure;
    },
    // ── folio minting ────────────────────────────────────────────────────────
    _mintFolio(ledger, wreck, fields, s) {
      ledger.seq += 1;
      const d = (wreck && wreck.data) || {};
      const folio = {
        id: `quill_folio_${ledger.seq}`,
        markerId: typeof fields?.markerId === 'string' ? fields.markerId
          : (typeof d.markerId === 'string' ? d.markerId
            : (typeof d.aftermathMarkerId === 'string' ? d.aftermathMarkerId
              : (d.provenance && typeof d.provenance.markerId === 'string' ? d.provenance.markerId : null))),
        sectorId: (this.state?.world?.currentSectorId) || QUILL.sectorId,
        kind: fields?.kind || 'manifest',
        grade: Math.max(1, Math.min(5, Math.floor(Number(fields?.grade) || 1))),
        impression: fields?.impression === 2 ? 2 : 1,
        forged: fields?.forged === true,
        burned: false,
        copiedAt: Number(s.simTime) || 0,
        status: 'held',
        priceCr: 0, grantedCr: 0, soldAt: 0, saleSeq: 0, buyer: null,
      };
      ledger.folios.push(folio);
      if (ledger.folios.length > FOLIO_CAP) ledger.folios = pruneFolios(ledger.folios);
      this.bus?.emit('quill:folioMinted', {
        id: folio.id, kind: folio.kind, grade: folio.grade, impression: folio.impression,
        forged: folio.forged, markerId: folio.markerId, sectorId: folio.sectorId,
      });
      if (ledger.seq === 1) {
        this._say('quill_desk_hint',
          'A copy is coin if you hold the rim. Stand the desk and my buyers come — names pay best and burn hottest.', 9);
      }
      return folio;
    },
    // ── the press census — one hull, one action, in ring order ───────────────
    _press(flags, ledger, robot, s) {
      const copied = Number(flags[QUILL.copiedFlag]) || 0;
      const next = quillNextSecret(copied);
      if (next >= 0) {
        for (const e of s.entityList || []) {
          if (!e || e === robot) continue;
          if (!quillCopyable(e, robot.pos)) continue;
          this._sealCopy(e, robot, flags, ledger, next, s);
          return;
        }
        return;
      }
      // The Archive is out; the press still runs. Announce the shift once ever.
      if (ledger && ledger.pressAnnounced !== true) {
        ledger.pressAnnounced = true;
        this._say('quill_press',
          'THE ARCHIVE IS OUT. THE PRESS IS NOT. Bring me blanks and I will write what it never sealed.', 9);
      }
      let overprint = null; let reimpress = null; let blank = null;
      for (const e of s.entityList || []) {
        if (!e || e === robot || e.type !== 'wreck') continue;
        if (!overprint && quillOverprintable(e, robot.pos)) overprint = e;
        else if (!reimpress && quillReimpressable(e, robot.pos)) reimpress = e;
        else if (!blank && quillBlank(e, robot.pos)) blank = e;
      }
      const work = overprint || reimpress || blank;
      if (!work) return;
      const d = work.data = work.data || {};
      if (work === overprint) {
        d.quillOverprinted = true;
        d.quillOverprintedBy = robot.id;
        d.quillOverprintedAt = Number(s.simTime) || 0;
        d.quillFolioKind = d.quillFolioKind || quillFolioKind(d);
        d.quillFolioGrade = d.quillFolioGrade || quillFolioGrade(work);
        this._mintFolio(ledger, work, { kind: d.quillFolioKind, grade: d.quillFolioGrade, impression: 1 }, s);
        this._exposureAdd(ledger, QUILL_NOTICE.mintOverprint, s.simTime);
        this._say(`quill_overprint_${work.id}`,
          'No pages left to keep — so I printed another. The press does not need a reason.', 6);
        return;
      }
      if (work === reimpress) {
        d.quillReimpressed = true;
        d.quillReimpressedAt = Number(s.simTime) || 0;
        this._mintFolio(ledger, work, {
          kind: 'impression',
          grade: Math.max(1, (Number(d.quillFolioGrade) || 2) - 1),
          impression: 2,
        }, s);
        this._exposureAdd(ledger, QUILL_NOTICE.mintImpression, s.simTime);
        this._say(`quill_reimpress_${work.id}`,
          'Twice exists. I read my own stamp and printed it again — copies of copies sell like copies.', 6);
        return;
      }
      // A blank hull: write the page the Archive never sealed.
      d.quillForgedBlank = true;
      d.quillForgedBlankBy = robot.id;
      d.quillForgedBlankAt = Number(s.simTime) || 0;
      ledger.forged += 1;
      this._mintFolio(ledger, work, {
        kind: 'forgery',
        grade: 3 + (hash32(String(work.id), 'quill-forge-grade') % 3),
        impression: 1, forged: true,
      }, s);
      this._exposureAdd(ledger, QUILL_NOTICE.mintForgery, s.simTime);
      this._say(`quill_forge_${work.id}`,
        'A blank hull. I wrote a page the Archive never sealed — it reads true to anyone who does not check.', 6);
    },
    _sealCopy(e, robot, flags, ledger, next, s) {
      e.data = e.data || {};
      e.data.quillCopied = true;
      e.data.quillCopiedBy = robot.id;
      e.data.quillCopiedAt = Number(s.simTime) || 0;
      e.data.quillFolioKind = quillFolioKind(e.data);
      e.data.quillFolioGrade = quillFolioGrade(e);
      const copied = Number(flags[QUILL.copiedFlag]) || 0;
      flags[QUILL.copiedFlag] = copied + 1;
      this._mintFolio(ledger, e, {
        kind: e.data.quillFolioKind, grade: e.data.quillFolioGrade, impression: 1,
      }, s);
      this._exposureAdd(ledger, QUILL_NOTICE.mintCopy + (next === QUILL.secrets.length - 1 ? QUILL_NOTICE.pageSix : 0), s.simTime);
      const secret = quillSecretAt(next);
      this._say(`quill_copy_${e.id}`, QUILL.copiedLine, 6);
      this._say(`quill_secret_${next}`, secret, 12);
      if (quillNextSecret(copied + 1) < 0) {
        this._say('quill_mastery', QUILL.masteryLine, 9);
      }
      this._armErrand(ledger, s);
    },
    // ── the desk — one sale per cadence while the pilot stands the rim ───────
    _desk(ledger, robot, player, s) {
      const now = Number(s.simTime) || 0;
      const held = ledger.folios.filter((f) => f.status === 'held');
      if (!player || !finiteXZ(player.pos) || !finiteXZ(robot.pos)) return;
      const d = Math.hypot(player.pos.x - robot.pos.x, player.pos.z - robot.pos.z);
      if (d > QUILL_DESK.radius) return;
      if (!this._deskHinted && held.length > 0) {
        this._deskHinted = true;
        this._say('quill_desk_open',
          `The desk is open — ${held.length} page${held.length === 1 ? '' : 's'} held. My buyers take one at a time.`, 7);
      }
      if (now < ledger.quietUntil || now < ledger.nextSaleAt || held.length === 0) return;
      ledger.nextSaleAt = now + QUILL_DESK.cadenceS;
      ledger.saleSeq += 1;
      const marketBurned = now < ledger.burnedMarketUntil;
      let best = null; let bestPrice = -1;
      for (const f of held) {
        const p = quillFolioPrice(f, ledger, now);
        if (p > bestPrice) { best = f; bestPrice = p; }
      }
      if (!best) return;
      const price = Math.max(1, bestPrice);
      const granted = Math.max(1, Math.round(price * (1 - QUILL_DESK.inkCut)));
      const buyer = quillBuyerFor(best, ledger.saleSeq);
      best.status = 'sold';
      best.priceCr = price;
      best.grantedCr = granted;
      best.soldAt = now;
      best.saleSeq = ledger.saleSeq;
      best.buyer = buyer;
      ledger.sold += 1;
      ledger.earnedCr += granted;
      this.bus?.emit('economy:grantCredits', { amount: granted, reason: `quill:folio:${best.kind}` });
      this.bus?.emit('quill:folioSold', {
        id: best.id, kind: best.kind, priceCr: price, grantedCr: granted,
        buyer, saleSeq: ledger.saleSeq, burned: false,
      });
      this._say(`quill_sale_${best.id}`,
        `${buyer} bought a ${best.kind} page for ${price} — the press kept its ink.`, 7);
      this._log(`quill_sale_log_${best.id}`,
        `Desk sale: ${best.kind} folio ${best.id} -> ${buyer}, ${price}cr gross, ${granted}cr to the pilot.`);
      if (marketBurned) return; // a wary market does not roll consequences twice
      if (best.kind === 'names') {
        this._exposureAdd(ledger, QUILL_NOTICE.namesSale, now);
        if (quillNamesBurns(best, ledger.saleSeq)) this._burnNames(ledger, best, price, s);
      } else if (best.kind === 'forgery' && quillForgeryDetected(best, ledger.saleSeq)) {
        this._detectForgery(ledger, best, price, s);
      }
    },
    /** A names page names back: the wronged party's friends collect a fine, the
     *  desk goes quiet, and the Archive sends a collector for the rest. */
    _burnNames(ledger, folio, price, s) {
      const now = Number(s.simTime) || 0;
      ledger.burned += 1;
      folio.burned = true;
      const fine = Math.max(QUILL_PRESS.namesFineMinCr,
        Math.round(price * QUILL_PRESS.namesFineFrac));
      const factionId = quillBurnFaction(folio);
      this.bus?.emit('economy:chargeCredits', { amount: fine, reason: 'quill:names_burned' });
      this.bus?.emit('faction:repDelta', {
        factionId, delta: QUILL_PRESS.namesRepHit, reason: 'quill:names_burned',
      });
      ledger.quietUntil = now + QUILL_DESK.quietS;
      this._exposureAdd(ledger, QUILL_NOTICE.burn, now);
      this._say(`quill_burn_${folio.id}`,
        `The names page named back. ${fine} credits of quiet money left your hold — the desk goes still.`, 9);
      this.bus?.emit('quill:folioBurned', {
        id: folio.id, kind: folio.kind, fineCr: fine, factionId,
      });
      this._sendRedactor(ledger, s, 'names');
    },
    /** A buyer checked the seal. The whole market heard — every price collapses
     *  until the word fades, and a collector comes to take the press's ink. */
    _detectForgery(ledger, folio, price, s) {
      const now = Number(s.simTime) || 0;
      ledger.burned += 1;
      folio.burned = true;
      ledger.burnedMarketUntil = now + QUILL_DESK.marketBurnS;
      const fine = Math.max(1, Math.round(price * QUILL_PRESS.forgeryFineFrac));
      this.bus?.emit('economy:chargeCredits', { amount: fine, reason: 'quill:forgery_detected' });
      this._exposureAdd(ledger, QUILL_NOTICE.burn, now);
      this._say(`quill_detect_${folio.id}`,
        `A buyer checked the seal. There was no seal. The word is out — ${fine} credits of it on your name.`, 9);
      this.bus?.emit('quill:forgeryDetected', {
        id: folio.id, fineCr: fine, marketBurnedUntil: ledger.burnedMarketUntil,
      });
      this._sendRedactor(ledger, s, 'forgery');
    },
    // ── the errands — pages carried home ─────────────────────────────────────
    /** Arm the oldest opened, unanswered page. One errand at a time — a page
     *  waits its turn the way it waited sealed. */
    _armErrand(ledger, s) {
      if (!ledger || ledger.errand) return;
      const flags = this._flags();
      const copied = Math.min(Number(flags?.[QUILL.copiedFlag]) || 0, QUILL_ERRANDS.length);
      for (let page = 0; page < copied; page += 1) {
        if (ledger.answered[page] === true) continue;
        const spec = quillErrandFor(page);
        if (!spec) continue;
        ledger.errand = { page, sectorId: spec.sectorId, armedAt: Number(s?.simTime) || 0 };
        this.bus?.emit('quill:errandArmed', { page, sectorId: spec.sectorId, rewardCr: spec.rewardCr });
        this._say(`quill_errand_${page}`,
          `PAGE ${page + 1} wants to go home. Carry its copy to ${spec.sectorId.replace('sector_', '').replace(/_/g, ' ')} — let the machine read what it wrote.`, 9);
        return;
      }
    },
    /** sector:enter — the page resolves where it was written, drone present or
     *  not: the copy rides in the pilot's hold and the machine reads it there. */
    _resolveErrand(p) {
      if (!this._adventureRun() || !p || typeof p.sectorId !== 'string') return;
      const ledger = this._peekLedger();
      const errand = ledger && ledger.errand;
      if (!errand || p.sectorId !== errand.sectorId) return;
      const spec = quillErrandFor(errand.page);
      ledger.errand = null;
      if (!spec) return;
      ledger.answered[errand.page] = true;
      ledger.errandsDone += 1;
      this.bus?.emit('economy:grantCredits', {
        amount: spec.rewardCr, reason: `quill:errand:${errand.page}`,
      });
      this._say(`quill_answered_${errand.page}`, spec.line, 10);
      this.bus?.emit('quill:errandAnswered', {
        page: errand.page, sectorId: spec.sectorId, rewardCr: spec.rewardCr,
        errandsDone: ledger.errandsDone,
      });
      if (ledger.errandsDone >= QUILL.secrets.length && ledger.rebound !== true) {
        ledger.rebound = true;
        const flags = this._flags();
        if (flags) flags.quill_rebound = true;
        this.bus?.emit('economy:grantCredits', { amount: QUILL_REBOUND_CR, reason: 'quill:rebound' });
        this._say('quill_rebound',
          'EVERY PAGE HOME. The Archive is loose in the world now — and the world paid for the telling.', 12);
        this.bus?.emit('quill:archiveRebound', { errandsDone: ledger.errandsDone, rewardCr: QUILL_REBOUND_CR });
      }
      this._armErrand(ledger, this.state);
    },
    // ── the redactor — the Archive's collector ───────────────────────────────
    _sendRedactor(ledger, s, cause) {
      const now = Number(s.simTime) || 0;
      if (!ledger || this._redactorLive() || now < ledger.redactorNextAt) return null;
      if (!this.helpers.spawnEntity) return null;
      const player = this._playerEntity();
      const seq = ledger.redactorSeq + 1;
      ledger.redactorSeq = seq;
      const angle = (hash32('quill-redactor-spot', seq, Math.floor(now)) % 6283) / 1000;
      const anchor = finiteXZ(player?.pos) ? player.pos
        : (finiteXZ(this._robot()?.pos) ? this._robot().pos : QUILL.post);
      const spot = {
        x: anchor.x + Math.cos(angle) * QUILL_REDACTOR.spawnDist,
        z: anchor.z + Math.sin(angle) * QUILL_REDACTOR.spawnDist,
      };
      const entity = this.helpers.spawnEntity(quillRedactorSpec(spot, seq));
      if (!entity) return null;
      ledger.redactorUntil = now + QUILL_REDACTOR.ttlS;
      this.bus?.emit('quill:redactorSpawned', { id: entity.id, cause: cause || 'notice' });
      this._say('quill_redactor',
        'THE ARCHIVE SENT A COLLECTOR. It takes a page back — or it takes payment where there is no page.', 9);
      return entity;
    },
    /** The chase. Homing delta-v through the impulse membrane — it wants the
     *  PILOT, not the drone, and it survives its deserter cousin's death. */
    _redactorUpkeep(ledger, s) {
      const red = this._redactorLive();
      if (!red || !red.pos) return;
      const now = Number(s.simTime) || 0;
      const player = this._playerEntity();
      if (!player || !finiteXZ(player.pos) || player.alive === false
          || (ledger.redactorUntil > 0 && now > ledger.redactorUntil)) {
        this._redactorWithdraw(ledger, red, 'lost', s);
        return;
      }
      const dx = player.pos.x - red.pos.x;
      const dz = player.pos.z - red.pos.z;
      const d = Math.hypot(dx, dz);
      if (d <= QUILL_REDACTOR.arrive) {
        this._redactorSeize(ledger, red, player, s);
        return;
      }
      const want = QUILL_REDACTOR.speed * Math.min(1, d / (QUILL_REDACTOR.arrive * 2));
      const vx = finiteXZ(red.vel) ? red.vel.x : 0;
      const vz = finiteXZ(red.vel) ? red.vel.z : 0;
      if (red.mass > 0) {
        queuePhysicsImpulse(red, {
          x: ((dx / d) * want - vx) * red.mass,
          z: ((dz / d) * want - vz) * red.mass,
        }, { tick: s.tick });
      }
    },
    _redactorWithdraw(ledger, red, why, s) {
      this.helpers?.removeEntity?.(red.id);
      ledger.redactorNextAt = (Number(s.simTime) || 0) + QUILL_REDACTOR.retryS;
      this._exposureAdd(ledger, -QUILL_NOTICE.withdrawRelief, s.simTime);
      this._say(`quill_redactor_out_${red.id}`,
        'The collector gave up the rim. It will not forget — nothing copied ever forgets.', 7);
      this.bus?.emit('quill:redactorWithdrew', { id: red.id, why });
    },
    _redactorSeize(ledger, red, player, s) {
      const now = Number(s.simTime) || 0;
      let best = null; let bestPrice = -1;
      for (const f of ledger.folios) {
        if (f.status !== 'held') continue;
        const p = quillFolioPrice(f, ledger, now);
        if (p > bestPrice) { best = f; bestPrice = p; }
      }
      let seizedFolioId = null; let fineCr = 0;
      if (best) {
        best.status = 'seized';
        ledger.seized += 1;
        seizedFolioId = best.id;
        this._say(`quill_seize_${best.id}`,
          'It took the page. The Archive has it back now — check your ledger.', 8);
      } else {
        fineCr = QUILL_REDACTOR.seizeFineCr;
        this.bus?.emit('economy:chargeCredits', { amount: fineCr, reason: 'quill:redactor_fine' });
        this._say(`quill_seize_fine_${red.id}`,
          `No pages left to take — it took ${fineCr} credits instead. The Archive collects.`, 8);
      }
      this._exposureAdd(ledger, -QUILL_NOTICE.seizeRelief, now);
      ledger.redactorNextAt = now + QUILL_REDACTOR.retryS;
      this.helpers?.removeEntity?.(red.id);
      this.bus?.emit('quill:folioSeized', {
        redactorId: red.id, folioId: seizedFolioId, fineCr,
      });
    },
    _sync() {
      if (!this.state?.story) return;
      if (!this._adventure()) { this._removeOwned(); return; }
      const flags = this._flags();
      const gone = flags?.[QUILL.goneFlag] === true;
      if (!gone && !this._robot() && this.helpers.spawnEntity) {
        this.helpers.spawnEntity(quillSpec());
      }
      const ledger = this._peekLedger();
      if (ledger) this._armErrand(ledger, this.state);
      if (!gone && !this._announced) {
        this._announced = true;
        this._say('quill_announce', QUILL.announce, 9);
      }
    },
    /** Kill reports read the victim by id — the emitter marks it dead before the
     *  bus hears it. The drone's death is durable and its last line fires once;
     *  the copies it already made stay copied — that was the whole point. A
     *  redactor the pilot kills is a line the Archive writes in THEIR margin:
     *  the notice climbs and the collectors remember the hull. */
    _onKilled(p) {
      if (!this._adventure() || !p) return;
      const victim = this._entity(p.id);
      if (!victim || !victim.data) return;
      const ledger = this._peekLedger();
      if (victim.data.quillRedactor === true) {
        if (ledger) {
          const playerKill = p.killerId != null && p.killerId === this.state?.playerId;
          ledger.redactorNextAt = (Number(this.state?.simTime) || 0) + QUILL_REDACTOR.retryS;
          ledger.redactorUntil = 0;
          if (playerKill && victim.data.quillRedactorCounted !== true) {
            victim.data.quillRedactorCounted = true;
            ledger.redactorLosses += 1;
            this._exposureAdd(ledger, QUILL_NOTICE.redactorKill, this.state?.simTime);
            this.bus?.emit('faction:repDelta', {
              factionId: 'faction_archive', delta: -6, reason: 'quill:redactor_killed',
            });
            this._say(`quill_redactor_dead_${victim.id}`,
              'You shot a page-drone. I was a page-drone once. The Archive adds a line to your ledger.', 9);
            this.bus?.emit('quill:redactorKilled', { id: victim.id, killerId: p.killerId });
          }
        }
        return;
      }
      if (victim.data.quill !== true) return;
      const flags = this._flags();
      if (flags && flags[QUILL.goneFlag] !== true) {
        flags[QUILL.goneFlag] = true;
        this._say('quill_gone', QUILL.goneLine, 9);
      }
    },
    /** The calendar census: walk the drone home if it was shoved off its drift
     *  (impulse-membrane steering), cool the Archive's notice, chase the
     *  redactor if one is out, then run the press and the desk. The press: the
     *  first settled scanned wreck gets the quillCopied stamp on ITS hull (the
     *  copy travels with the body, so the ledger is the wreck itself) — or,
     *  once the Archive is out, an overprint / re-impression / forgery. The
     *  desk: one folio per cadence while the pilot stands the rim. */
    update(dt, state) {
      const s = state || this.state;
      if (!s || !this._adventure()) return;
      const flags = this._flags();
      if (!flags) return;
      const ledger = this._peekLedger();
      // The chase and the cooling run even with the drone dead — the Archive's
      // business does not stop because its deserter did.
      if (ledger) {
        this._redactorUpkeep(ledger, s);
        if (!this._redactorLive()
            && quillExposureNow(ledger, s.simTime) >= QUILL_NOTICE.sendAt) {
          this._sendRedactor(ledger, s, 'notice');
        }
      }
      const robot = this._robot();
      if (!robot || !robot.pos) return;
      const dv = quillDriftHome(robot);
      if (dv && robot.mass > 0) {
        queuePhysicsImpulse(robot, { x: dv.x * robot.mass, z: dv.z * robot.mass }, { tick: s.tick });
      }
      const book = ledger || this._ledger();
      if (!book) return;
      this._press(flags, book, robot, s);
      this._desk(book, robot, this._playerEntity(), s);
    },
  };
}

export function quillSpec() {
  return {
    type: 'drone',
    pos: { ...QUILL.post }, vel: { x: 0, z: 0 },
    radius: 9, mass: 22, hull: 180, hullMax: 180,
    homeSectorId: QUILL.sectorId,
    data: {
      quill: true, authoredCharacter: 'quill', parentType: 'story_prop',
      callsign: QUILL.callsign,
      scanLabel: 'QUILL / AR-3 — deserter page-drone, reads wreck logs',
      scannerSignalKind: 'archive',
      homeSectorId: QUILL.sectorId,
    },
  };
}

export const quill = createQuill();
