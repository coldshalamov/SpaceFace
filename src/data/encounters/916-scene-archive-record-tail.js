// Archive Record Tail — lived vignette. External-only: ambient world scene.
import { deepFreeze, defineEncounter } from './catalog.js';
import { compileVignette, applyMotion } from '../../systems/vignetteInterpreter.js';

export const spec = {
  "id": "scene_archive_record_tail",
  "title": "Archive Record Tail",
  "factionId": "faction_archive",
  "start": "spawn",
  "cast": [
    {
      "role": "runner",
      "archetype": "quiet_ghost",
      "factionId": "faction_quiet",
      "dx": 0,
      "dz": 0,
      "scanLabel": "RECORD RUNNER"
    },
    {
      "role": "ship_1",
      "archetype": "choir_zealot",
      "factionId": "faction_archive",
      "dx": -150,
      "dz": 90,
      "scanLabel": "ARCHIVE WARDEN"
    }
  ],
  "choices": [
    {
      "id": "a",
      "label": "Scan the runner’s bearing",
      "playerLine": "I will pulse the runner for a bearing, not take the file."
    },
    {
      "id": "b",
      "label": "Decline the scan and withdraw",
      "playerLine": "I will leave this file unread and withdraw from both hulls."
    },
    {
      "id": "c",
      "label": "Leave the file",
      "playerLine": "I will not take custody of a moving record."
    }
  ],
  "timeoutChoice": "c",
  "phases": [
    {
      "id": "spawn",
      "verb": "spawn",
      "next": "hail"
    },
    {
      "id": "hail",
      "verb": "say",
      "line": "ARCHIVIST: A stolen record is running. Its last byte names Orcus.",
      "channel": "info",
      "primary": true,
      "next": "run"
    },
    {
      "id": "run",
      "verb": "motion",
      "motion": "chase",
      "seconds": 6,
      "next": "a0"
    },
    {
      "id": "a0",
      "verb": "say",
      "line": "The record skips the same second each time it turns.",
      "channel": "info",
      "next": "offer"
    },
    {
      "id": "offer",
      "verb": "offer",
      "motion": "chase",
      "windowS": 22,
      "onChoice": {
        "a": "say_a",
        "b": "say_b",
        "c": "say_c"
      }
    },
    {
      "id": "say_a",
      "verb": "say",
      "line": "Your scanner obtained the runner’s bearing. The file remains aboard, still incomplete.",
      "channel": "info",
      "next": "grant_a"
    },
    {
      "id": "grant_a",
      "verb": "grant",
      "amount": 30,
      "reason": "scene_archive_record_tail",
      "next": "rep_a"
    },
    {
      "id": "rep_a",
      "verb": "rep",
      "factionId": "faction_archive",
      "delta": 2,
      "reason": "scene_archive_record_tail",
      "next": "resolve_a"
    },
    {
      "id": "resolve_a",
      "verb": "resolve",
      "outcome": "a"
    },
    {
      "id": "say_b",
      "verb": "say",
      "line": "You withdrew without scanning the runner. The file and pursuit remain unresolved.",
      "channel": "info",
      "next": "rep_b_runner"
    },
    {
      "id": "rep_b_runner",
      "verb": "rep",
      "factionId": "faction_quiet",
      "delta": 1,
      "reason": "scene_archive_record_tail",
      "next": "rep_b_authority"
    },
    {
      "id": "rep_b_authority",
      "verb": "rep",
      "factionId": "faction_archive",
      "delta": -1,
      "reason": "scene_archive_record_tail",
      "next": "resolve_b"
    },
    {
      "id": "resolve_b",
      "verb": "resolve",
      "outcome": "b"
    },
    {
      "id": "say_c",
      "verb": "say",
      "line": "You left the record running into the dark.",
      "channel": "info",
      "next": "resolve_c"
    },
    {
      "id": "resolve_c",
      "verb": "resolve",
      "outcome": "c"
    }
  ]
};

export const encounterOrder = 916;
export const trigger = deepFreeze({
  "id": "scene_archive_record_tail",
  "tier": "ambient",
  "deck": "civilian",
  "weight": 1,
  "zoneTypes": [
    "civilian_core",
    "trade_lane",
    "patrol_corridor",
    "border_checkpoint",
    "refinery_approach",
    "mining_belt",
    "colony",
    "derelict_field",
    "outlaw_zone",
    "radiation_field",
    "nebula_fog",
    "ambush_lane",
    "anomaly_deep",
    "planetary_mass"
  ],
  "script": "selfRegistered",
  "fallbackScript": "whisper",
  "pressureCost": 6,
  "cooldownS": 1200,
  "proximity": true,
  "rare": true,
  "gates": {
    "externalOnly": true
  }
});

// Only this scene observes evidence. Shared choreography and consequence writers stay unchanged.
const archiveBase = compileVignette(spec);
const archiveSessions = new WeakMap();
const archiveFinitePos = e => e && e.alive === true && Number.isFinite(e.pos?.x) && Number.isFinite(e.pos?.z);
const archiveDistance = (a, b) => Math.hypot(a.x - b.x, a.z - b.z);
function archiveValid(d, live, state, session) {
  return session && state.world?.currentSectorId === session.sector
    && d.player() === session.player
    && [session.player, session.runner, session.warden].every(e =>
      archiveFinitePos(e) && state.entities.get(e.id) === e);
}
function archiveAbort(d, live, reason, line) {
  archiveSessions.delete(live);
  if (line) d.say(live, 'info', line, null, { literal: true });
  d.abort(live, reason);
}
function archiveSettle(d, live, state, session) {
  session.settling = true;
  try { archiveBase.choose(d, live, state, session.choice); }
  finally { archiveSessions.delete(live); }
}
export const runtime = Object.freeze({
  fire(d, live, state) {
    archiveBase.fire(d, live, state);
    if (live.phase === 'done') return;
    const role = name => state.entities.get(live.ids.find(id => live.roles[id] === name));
    const scanner = d.registry?.get?.('scanner');
    archiveSessions.set(live, {
      player: d.player(), runner: role('runner'), warden: role('ship_1'),
      sector: state.world?.currentSectorId,
      lastSeq: Number.isSafeInteger(scanner?._pulseSeq) ? scanner._pulseSeq : 0,
      choice: null,
    });
  },
  choose(d, live, state, choice) {
    const session = archiveSessions.get(live);
    if (!session || session.choice || live.phase !== 'offer' || d.now() >= live.deadlineAt) return;
    if (!archiveValid(d, live, state, session)) return archiveAbort(d, live, 'record_subject_gone');
    if (choice === 'c') {
      session.choice = choice;
      return archiveSettle(d, live, state, session);
    }
    if (choice !== 'a' && choice !== 'b') return;
    if (choice === 'b' && session.readBeforeChoice) return archiveAbort(d, live, 'record_already_read',
      'Your earlier pulse already read this runner. An unread withdrawal is no longer yours to offer.');
    session.choice = choice;
    session.chosenAt = d.now();
    session.start = { x: session.player.pos.x, z: session.player.pos.z };
    session.anchor = { x: live.anchor.x, z: live.anchor.z };
    live.deadlineAt = d.now() + 90;
    live.phase = choice === 'a' ? 'await_bearing' : 'await_discretion';
    d.say(live, 'info', choice === 'a'
      ? 'ARCHIVIST: Use your scanner pulse on RECORD RUNNER. A bearing is enough; the file stays aboard.'
      : 'Keep your scanner off RECORD RUNNER. Withdraw 600 from this scene, 400 clear of both hulls, and at least 400 from where you answered. Their pursuit is not yours to settle.',
    null, { literal: true });
  },
  tick(d, live, state, now) {
    if (live.phase === 'done') return;
    const session = archiveSessions.get(live);
    if (session?.settling) return;
    if (!archiveValid(d, live, state, session)) return archiveAbort(d, live, 'record_subject_gone');
    if (!session.choice) return archiveBase.tick(d, live, state, now);
    if (!Number.isFinite(now) || now < session.chosenAt || now >= live.deadlineAt) {
      return archiveAbort(d, live, 'record_evidence_timeout', 'No fresh bearing or witnessed withdrawal. The file remains unresolved.');
    }
    applyMotion(d, live, 'chase', now);
    if (session.choice === 'b'
      && archiveDistance(session.player.pos, session.start) >= 400
      && archiveDistance(session.player.pos, session.anchor) >= 600
      && archiveDistance(session.player.pos, session.runner.pos) >= 400
      && archiveDistance(session.player.pos, session.warden.pos) >= 400) {
      archiveSettle(d, live, state, session);
    }
  },
  event(d, live, state, name, payload) {
    const session = archiveSessions.get(live);
    if (!session || session.settling || live.phase === 'done' || name !== 'scanPulse') return;
    if (!archiveValid(d, live, state, session)) return archiveAbort(d, live, 'record_subject_gone');
    const scanner = d.registry?.get?.('scanner');
    const now = d.now();
    // The scanner owner stamps this synchronous event. Reject foreign owners, stale/replayed
    // sequences, wrong origins and invalid ranges rather than inventing a fallback pulse.
    if (!payload || payload.source !== 'player-scanner' || payload.scannerId !== session.player.id
      || !scanner || scanner.state !== state || scanner._pulseSeq !== payload.seq
      || !Number.isSafeInteger(payload.seq) || payload.seq <= session.lastSeq
      || !Number.isFinite(payload.simTime) || payload.simTime !== now
      || !Number.isFinite(payload.pos?.x) || !Number.isFinite(payload.pos?.z)
      || archiveDistance(payload.pos, session.player.pos) > 1e-6
      || !Number.isFinite(payload.radius) || payload.radius <= 0) return;
    session.lastSeq = payload.seq;
    if (!session.choice) {
      if (archiveDistance(payload.pos, session.runner.pos) <= payload.radius) session.readBeforeChoice = true;
      return;
    }
    if (now < session.chosenAt) return;
    if (now >= live.deadlineAt) return archiveAbort(d, live, 'record_evidence_timeout');
    if (archiveDistance(payload.pos, session.runner.pos) > payload.radius) return;
    if (session.choice === 'b') return archiveAbort(d, live, 'record_discretion_broken',
      'Your pulse read the runner. No discretion was witnessed; the file remains aboard.');
    archiveSettle(d, live, state, session);
  },
});
export default defineEncounter(trigger, {
  "shape": {
    "situation": "archive",
    "place": "anomaly_deep",
    "twist": "depth",
    "actor": "faction_archive"
  },
  "livedVignette": true,
  "ambientScene": true,
  "sectorIds": [
    "sector_orcus_shadow"
  ],
  "noCombat": true,
  "motive": "lane_courtesy",
  "engagementTrigger": "hailed",
  "title": "Archive Record Tail",
  "primaryLine": "ARCHIVIST: A stolen record is running. Its last byte names Orcus.",
  "factionId": "faction_archive",
  "choices": [
    {
      "id": "a",
      "label": "Scan the runner’s bearing",
      "playerLine": "I will pulse the runner for a bearing, not take the file."
    },
    {
      "id": "b",
      "label": "Decline the scan and withdraw",
      "playerLine": "I will leave this file unread and withdraw from both hulls."
    },
    {
      "id": "c",
      "label": "Leave the file",
      "playerLine": "I will not take custody of a moving record."
    }
  ],
  "timeoutChoice": "c",
  "receipts": {
    "a": "Your scanner obtained the runner’s bearing. The file remains aboard, still incomplete.",
    "b": "You withdrew without scanning the runner. The file and pursuit remain unresolved.",
    "c": "You left the record running into the dark."
  }
});
