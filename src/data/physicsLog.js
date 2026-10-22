// Row 502 (W-LOG): LOG — the physics narrator. A cause-aware one-line feed reads impact kills,
// throws, liens, deliveries and records in the house register. Copy lives here as data so
// INFERENCE EXP-12 can fill it out without touching the feed; the callout lane supplies the
// 3 s fade and the terminal-zone silence.

/** Modes where LOG stays silent — terminal zones don't narrate. */
export const PHYSICS_LOG_SILENT_MODES = new Set(['gameover', 'debrief', 'dead', 'crash']);

/** True while LOG should not speak: terminal zones and non-flight surfaces. */
export function physicsLogSilent(state) {
  if (!state) return false;
  const mode = String(state.mode || '');
  if (PHYSICS_LOG_SILENT_MODES.has(mode)) return true;
  if (state.player && state.player.dead === true) return true;
  return false;
}

function nameOf(p, keys) {
  for (const k of keys) {
    const v = p && p[k];
    if (typeof v === 'string' && v.trim()) return v.trim().toUpperCase();
  }
  return null;
}

function tonnes(p, keys) {
  for (const k of keys) {
    const v = Number(p && p[k]);
    if (Number.isFinite(v) && v > 0) return Math.round(v);
  }
  return null;
}

/**
 * One LOG line for an event, or null when the event isn't LOG-worthy. Lines are short, plain,
 * and read with sound off — the register's voice is declarative: THING DID THING.
 */
export function physicsLogLine(eventName, payload = {}) {
  const p = payload || {};
  switch (eventName) {
    case 'combat:kill': {
      const cause = String(p.cause || '');
      if (cause === 'impact' || cause === 'collision' || cause === 'throw' || cause === 'physics') {
        const who = nameOf(p, ['victimName', 'targetName', 'name']) || 'CONTACT';
        const t = tonnes(p, ['mass', 'impactMass', 'bodyMass']);
        return t ? `${who} RECLASSIFIED: PROJECTILE — ${t}t` : `${who} RECLASSIFIED: PROJECTILE`;
      }
      return null;
    }
    case 'entity:killed': {
      if (String(p.cause || '') === 'impact') {
        const who = nameOf(p, ['name', 'victimName']) || 'HULL';
        return `${who} RECLASSIFIED: DEBRIS`;
      }
      return null;
    }
    case 'physics:impact': {
      const energy = tonnes(p, ['energy', 'impulse', 'damage']);
      if (energy != null && energy >= 40) return `IMPACT LOGGED — ${energy} wu/s²`;
      return null;
    }
    case 'tether:releaseRated': {
      const grade = String(p.classification || '').toUpperCase();
      const t = tonnes(p, ['tonnageU', 'mass']);
      return t ? `LINE RELEASED ${t}t — ${grade || 'CLEAN'}` : `LINE RELEASED — ${grade || 'CLEAN'}`;
    }
    case 'cargo:delivered': {
      const t = tonnes(p, ['tonnage', 'mass', 'units']);
      const dest = nameOf(p, ['destination', 'stationName', 'portName']);
      return t && dest ? `${t}t DELIVERED — ${dest}` : 'CARGO DELIVERED';
    }
    case 'vael:lienClamped': return 'LIEN ATTACHED — THE LEDGER OPENS';
    case 'vael:lienPaid': return 'LIEN SETTLED — THE LEDGER CLOSES';
    case 'vael:lienCut': return 'LIEN CUT — THE LEDGER NOTES IT';
    case 'vael:lienThrown': return 'LIEN TRANSFERRED — THE DEBT HAS A NEW NAME';
    case 'helix:lienFiled': return 'FINE FILED — HELIX RECORDS';
    case 'helix:lienStuck': return 'LIEN STUCK — HELIX RECORDS';
    case 'lossLedger:recorded': return 'LOSS RECORDED — THE LEDGER REMEMBERS';
    case 'custody:recorded': return 'CUSTODY RECORDED';
    case 'aftermathWreck:recorded': return 'WRECK RECORDED — THE FIELD KEEPS IT';
    case 'law:recordAudit': return 'AUDIT LOGGED — LAW KNOWS';
    case 'mail:delivered': return 'MAIL — SOMETHING WAITING AT THE NEXT BERTH';
    case 'survivorPod:delivered': return 'SURVIVOR DELIVERED — ONE MORE NAME OFF THE LIST';
    case 'occupation:delivered': return 'PASSENGERS DELIVERED';
    case 'swarm:killPopup': {
      const word = String(p.word || '').toUpperCase();
      return word ? `ARENA: ${word}` : null;
    }
    default:
      return null;
  }
}

/** The bus events LOG listens to — one subscription surface for the feed owner. */
export const PHYSICS_LOG_EVENTS = Object.freeze([
  'combat:kill', 'entity:killed', 'physics:impact', 'tether:releaseRated',
  'cargo:delivered', 'vael:lienClamped', 'vael:lienPaid', 'vael:lienCut', 'vael:lienThrown',
  'helix:lienFiled', 'helix:lienStuck', 'lossLedger:recorded', 'custody:recorded',
  'aftermathWreck:recorded', 'law:recordAudit', 'mail:delivered', 'survivorPod:delivered',
  'occupation:delivered', 'swarm:killPopup',
]);
