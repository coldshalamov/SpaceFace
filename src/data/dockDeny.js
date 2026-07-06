// src/data/dockDeny.js — reasons a station cannot be docked, with faction-flavored text.
//
// "The story is in the paperwork." A refused dock is a tiny piece of worldbuilding: the
// reason line carries the VOICE of whoever runs the station. This is PURE DATA + a pure
// selector — no imports, no state, no DOM, no Math.random.
//
// dockDenyReason(station, factionMeta) returns { reason, text } when the station is NOT
// dockable, or null when it is. It degrades gracefully: absent fields default to dockable.
//
// Reason codes (the "core" set every faction covers):
//   abandoned          — nobody home; automated or dead
//   private            — occupied but not open to you
//   military_only      — restricted to a service/navy
//   under_construction — not finished / not commissioned
//   quarantine         — sealed for contamination / incident
//   hostile_rep        — they know you and they don't like you

export const DOCK_DENY_REASONS = [
  'abandoned', 'private', 'military_only', 'under_construction', 'quarantine', 'hostile_rep',
];

// Neutral / unknown-faction fallback text per reason.
const GENERIC_TEXT = {
  abandoned:          'STATION DARK. No docking authority responding. Berths sealed.',
  private:            'PRIVATE FACILITY. Docking by prior arrangement only. Access denied.',
  military_only:      'RESTRICTED BERTH. Military clearance required. You have none.',
  under_construction: 'NOT COMMISSIONED. Docking systems offline pending completion.',
  quarantine:         'QUARANTINE. This station is sealed. No traffic in or out.',
  hostile_rep:        'ACCESS DENIED. Your registry is barred from this facility.',
};

// Faction-flavored text: FLAVOR[factionId][reason] = string.
// Voices mirror src/data/barks.js — bureaucratic / mercantile / tired / predatory / terse /
// zealot / plainspoken / alien-formal.
const FLAVOR = {
  faction_scn: { // Concord — procedural
    abandoned:          'DECOMMISSIONED — Ref 44-C. This installation is stricken from the active registry.',
    private:            'CONCORD ADMINISTRATIVE BERTH. Credentialed personnel only. State your authorization.',
    military_only:      'NAVAL FACILITY. Docking limited to Concord vessels. Your clearance does not qualify.',
    under_construction: 'PENDING COMMISSION. Berth allocation suspended until inspection clears, Ref 44-C.',
    quarantine:         'BIOHAZARD PROTOCOL ACTIVE. Station sealed by administrative order. No exceptions filed.',
    hostile_rep:        'ACCESS REVOKED. Your registry is flagged. Approach constitutes a violation.',
  },
  faction_mts: { // Meridian — mercantile
    abandoned:          'ASSET WRITTEN OFF. No return on reopening this berth. Move along.',
    private:            'MEMBERS-ONLY EXCHANGE. Docking is a paid privilege you have not purchased.',
    military_only:      'SECURED HOLDINGS. This berth is contracted. Your account does not cover it.',
    under_construction: 'CAPITAL PROJECT IN PROGRESS. Berths reserved for investors. You are not one.',
    quarantine:         'FACILITY CLOSED FOR LOSS MITIGATION. Nothing to buy, nothing to dock.',
    hostile_rep:        'ACCOUNT SUSPENDED. Outstanding balance too high. Docking privileges withdrawn.',
  },
  faction_dmc: { // Drift — blue-collar / tired
    abandoned:          'Nobody works this rock anymore. Lights are off. Go somewhere else.',
    private:            'Company berth. It’s not mine to hand out. Sorry, friend.',
    military_only:      'This one’s spoken for by the brass. We just fix the airlocks.',
    under_construction: 'Half-built. Docking clamps ain’t even wired yet. Come back next quarter.',
    quarantine:         'Sealed her up after the last incident. Nobody in, nobody out. Orders.',
    hostile_rep:        'You’re on the list, friend. I don’t make the list. Can’t let you in.',
  },
  faction_reach: { // Reach — predatory
    abandoned:          'Picked clean already. Nothing here but us, and you don’t want us.',
    private:            'Our den. You’re not welcome, and you won’t like knocking.',
    military_only:      'This berth’s for the pack. Strays get shot.',
    under_construction: 'Ain’t finished stripping it yet. Wait your turn or bleed for it.',
    quarantine:         'Something got loose in there. Even we won’t dock. That should tell you something.',
    hostile_rep:        'We know your ship. Come closer and we open the guns, not the doors.',
  },
  faction_quiet: { // Quiet — terse
    abandoned:          'Empty. Leave.',
    private:            'Not for you.',
    military_only:      'Closed. Move.',
    under_construction: 'Not ready. Later.',
    quarantine:         'Sealed. Don’t.',
    hostile_rep:        'You. No.',
  },
  faction_choir: { // Choir — zealot / ritual
    abandoned:          'The Pattern withdrew from this place. Only silence keeps the berths now.',
    private:            'A consecrated hold. The unascended do not enter. Turn away.',
    military_only:      'This sanctum is given to the faithful in arms. You are not of them.',
    under_construction: 'The shrine is unfinished. It is not yet fit to receive. Return when it sings.',
    quarantine:         'A corruption dwells within. It is sealed against the ascent. Do not disturb it.',
    hostile_rep:        'Your dissonance is known here. The gate does not open to the discordant.',
  },
  faction_free: { // Frontier — plainspoken
    abandoned:          'Nobody’s home, friend. Been dark a long while. Try the next waystation.',
    private:            'Somebody’s living aboard and they’d rather you didn’t. Best respect that.',
    military_only:      'Uniforms only on this one. Not our rule, but it’s the rule.',
    under_construction: 'Still building her out. No berths yet. Give it time.',
    quarantine:         'Word is something went wrong inside. Locked down tight. Wouldn’t risk it anyway.',
    hostile_rep:        'Folks here remember you, and not fondly. Might want to keep flying.',
  },
  faction_vael: { // Vael — alien contract-language / formal
    abandoned:          'Clause 0: no party holds this station. The accord that governed it is void.',
    private:            'This-hold is bound to a standing party. Your term grants no entry.',
    military_only:      'The berth is reserved to instruments of the Consensus. You bear no such instrument.',
    under_construction: 'The station is not yet party to any accord. It cannot receive you until it is.',
    quarantine:         'Clause 9: contamination-term active. The station is sealed against all forms.',
    hostile_rep:        'Your standing is adverse in the ledger. The gate withholds itself from you.',
  },
};

/** Resolve a faction id from either a factionMeta object or a raw id string. */
function resolveFactionId(factionMeta) {
  if (!factionMeta) return null;
  if (typeof factionMeta === 'string') return factionMeta;
  if (typeof factionMeta === 'object') return factionMeta.id || factionMeta.factionId || null;
  return null;
}

/** Pick the flavored text for a reason, falling back to generic if no faction match. */
function textFor(reason, factionId) {
  const table = factionId && FLAVOR[factionId];
  if (table && typeof table[reason] === 'string') return table[reason];
  if (typeof GENERIC_TEXT[reason] === 'string') return GENERIC_TEXT[reason];
  return 'DOCKING UNAVAILABLE.';
}

/**
 * Determine whether a station can be docked, and if not, WHY (with faction flavor).
 *
 * Reads defensively. A station is considered NON-dockable when any of these hold
 * (checked in priority order): explicit station.dockDeny code, station.abandoned,
 * station.underConstruction, station.quarantine, station.private / !station.public,
 * station.militaryOnly, or hostile rep (station.hostile === true, or a numeric
 * rep <= station.minRep — or, if factionMeta carries { rep }, rep below station.minRep).
 *
 * @param {object} station     station-like object (may be sparse). Missing/typical → dockable (null).
 * @param {object|string} [factionMeta]  faction meta (FACTION_META entry) or a faction id, for voice.
 * @returns {{reason:string, text:string}|null}  null means dockable.
 */
export function dockDenyReason(station, factionMeta) {
  if (!station || typeof station !== 'object') return null; // nothing to deny
  const factionId = resolveFactionId(factionMeta) || station.factionId || null;

  const deny = (reason) => ({ reason, text: textFor(reason, factionId) });

  // 1. Explicit override wins.
  if (typeof station.dockDeny === 'string' && DOCK_DENY_REASONS.includes(station.dockDeny)) {
    return deny(station.dockDeny);
  }

  // 2. Structural states, priority order.
  if (station.abandoned === true) return deny('abandoned');
  if (station.underConstruction === true || station.commissioned === false) return deny('under_construction');
  if (station.quarantine === true || station.quarantined === true) return deny('quarantine');

  // 3. Hostility. Explicit flag, or numeric rep below the station's minimum.
  if (station.hostile === true) return deny('hostile_rep');
  {
    let rep = null;
    if (factionMeta && typeof factionMeta === 'object' && Number.isFinite(factionMeta.rep)) rep = factionMeta.rep;
    else if (Number.isFinite(station.playerRep)) rep = station.playerRep;
    if (rep != null && Number.isFinite(station.minRep) && rep < station.minRep) return deny('hostile_rep');
  }

  // 4. Access restrictions.
  if (station.militaryOnly === true) return deny('military_only');
  if (station.private === true || station.public === false) return deny('private');

  // Default: dockable.
  return null;
}

export default { DOCK_DENY_REASONS, dockDenyReason };
