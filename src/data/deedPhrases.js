// THE WORLD REMEMBERS — one line per deed, in the voice of whoever is telling it.
//
// Pure: no state, no RNG. Variant choice is hash32 over the deed id so a save tells the same
// story every time. Voices: 'neutral' (the Codex, a newsreader), 'grievance' (a speaker whose
// side was hurt), 'praise' (a speaker whose side approves). deedToneFor() in deedRecord picks
// the voice for a faction; callers that already know their register pass it directly.

import { hash32 } from '../core/rng.js';
import { SECTORS } from './sectors.js';
import { FACTION_META } from './factions/index.js';

const SECTOR_BY_ID = new Map(SECTORS.map((s) => [s.id, s]));
const STATION_BY_ID = new Map();
for (const s of SECTORS) for (const st of (s.stations || [])) STATION_BY_ID.set(st.id, st);
const FACTION_BY_ID = new Map(FACTION_META.map((f) => [f.id, f]));

export function deedPlaceName(deed) {
  if (!deed) return 'somewhere';
  const station = deed.stationId && STATION_BY_ID.get(deed.stationId);
  if (station && station.name) return station.name;
  const sector = deed.sectorId && SECTOR_BY_ID.get(deed.sectorId);
  if (sector && sector.name) return sector.name;
  return humanize(deed.sectorId || deed.stationId) || 'somewhere';
}

export function deedFactionName(deed) {
  const f = deed && deed.factionId && FACTION_BY_ID.get(deed.factionId);
  return f ? (f.short || f.name) : humanize(deed && deed.factionId) || 'someone';
}

function humanize(id) {
  if (!id) return '';
  return String(id).replace(/^(?:sector|faction|station)_/, '').replace(/_/g, ' ');
}

function pick(deed, voice, lines) {
  if (!lines || lines.length === 0) return null;
  const i = hash32(String(deed.id), voice, 'deed-line') % lines.length;
  return lines[i];
}

// Each kind: lines per voice built from {place, faction, n, subject}. Short enough for a bark.
const LINES = {
  dock_slam: {
    neutral: [
      (c) => `Put a hull through the ring at ${c.place}; ${c.n} cr filed.`,
      (c) => `Dock slam at ${c.place}. Repair bay was down the better part of an hour.`,
    ],
    grievance: [
      (c) => `You're the one who went through the ring at ${c.place}. The yard still talks about it.`,
      (c) => `${c.place} dock control has your hull on the wall. Slow down this time.`,
    ],
    praise: [
      (c) => `Heard you redecorated ${c.place}'s ring. Yard crews hate you. We don't.`,
    ],
  },
  ore_flood: {
    neutral: [
      (c) => `Cracked a rock open near ${c.place}; ${c.subject || 'ore'} went cheap for a while.`,
    ],
    grievance: [
      (c) => `Prices at ${c.place} haven't recovered since you blew that rock apart.`,
    ],
    praise: [
      (c) => `That rock you cracked at ${c.place}? Half the belt filled their holds on it.`,
      (c) => `Cheap ${c.subject || 'ore'} at ${c.place} for a week, and everyone knows whose shot did it.`,
    ],
  },
  hauler_dragged: {
    neutral: [(c) => `Dragged a ${c.faction} hauler off its lane at ${c.place}.`],
    grievance: [
      (c) => `${c.faction} lost a schedule because you dragged their hauler at ${c.place}. They remember.`,
      (c) => `A hauler of ours went sideways in your well at ${c.place}. Filed, not forgotten.`,
    ],
    praise: [
      (c) => `You pulled a ${c.faction} hauler clean off the lane at ${c.place}. That's a trick worth money.`,
    ],
  },
  pod_rescued: {
    neutral: [(c) => `Towed in a survivor pod at ${c.place}.`],
    grievance: [],
    praise: [
      (c) => `You brought a ${c.faction} crew home from ${c.place}. People here don't forget that.`,
      (c) => `Someone's family at ${c.place} still has a father because you answered a mayday.`,
    ],
  },
  pod_abandoned: {
    neutral: [(c) => `Left a survivor pod to drift at ${c.place}.`],
    grievance: [
      (c) => `There was a pod at ${c.place}. You were close enough to hear it. You flew on.`,
      (c) => `${c.faction} buried an empty box after ${c.place}. They know whose contact light drifted off.`,
    ],
    praise: [],
  },
  pod_captured: {
    neutral: [(c) => `A pod left behind at ${c.place} was taken by raiders.`],
    grievance: [
      (c) => `Raiders took the survivors you left at ${c.place}. ${c.faction} has the ransom note.`,
    ],
    praise: [],
  },
  kill_lawful: {
    neutral: [(c) => `Shot down a ${c.faction} ${c.subject || 'hull'} at ${c.place}.`],
    grievance: [
      (c) => `A ${c.faction} ${c.subject || 'hull'} went down at ${c.place}, and the gun camera has your silhouette.`,
      (c) => `${c.faction} lost a crew at ${c.place}. The pilot's name is on a wall here.`,
    ],
    praise: [
      (c) => `That ${c.faction} ${c.subject || 'hull'} you dropped at ${c.place}? Half this bar bought a round.`,
    ],
  },
  kill_outlaw: {
    neutral: [(c) => `Destroyed a hostile ${c.subject || 'hull'} at ${c.place}.`],
    grievance: [
      (c) => `That was one of ours you killed at ${c.place}. Crews talk.`,
    ],
    praise: [
      (c) => `Lane's been quieter since you cleared that ${c.subject || 'raider'} at ${c.place}.`,
      (c) => `Haulers at ${c.place} run with their lights on again. Your doing.`,
    ],
  },
  base_destroyed: {
    neutral: [(c) => `Destroyed a ${c.subject || 'base'} at ${c.place}.`],
    grievance: [
      (c) => `${c.faction} had a ${c.subject || 'base'} at ${c.place}. Had. They have a list, and you top it.`,
    ],
    praise: [
      (c) => `The ${c.subject || 'base'} at ${c.place} is slag. Took a hull with nerve to do that.`,
    ],
  },
  fence_burned: {
    neutral: [(c) => `Walked out of a set-up job out of ${c.place}.`],
    grievance: [
      (c) => `Someone at ${c.place} sold a job that didn't take. Their name's mud now, and it's your fault.`,
      (c) => `The fence at ${c.place} is finished. You survived what you weren't meant to.`,
    ],
    praise: [],
  },
  fence_emboldened: {
    neutral: [(c) => `A job out of ${c.place} went the fence's way.`],
    grievance: [],
    praise: [(c) => `${c.place} is selling that job again. Worked once, didn't it.`],
  },
  fence_thanked: {
    neutral: [(c) => `Delivered on a quiet job out of ${c.place}.`],
    grievance: [],
    praise: [
      (c) => `The quiet work out of ${c.place} came through clean. That buys a seat at the table.`,
      (c) => `Word from ${c.place}: you deliver. That travels further than you'd think.`,
    ],
  },
  bounty_paid: {
    neutral: [(c) => `Settled a ${c.n} cr bounty at ${c.place}.`],
    grievance: [
      (c) => `You paid the law off at ${c.place}. Some here call that going soft.`,
    ],
    praise: [
      (c) => `Paid your bounty at ${c.place} like a citizen. Dock control noticed.`,
    ],
  },
  wanted_tier: {
    neutral: [(c) => `Warrant escalated to ${c.subject || 'wanted'} near ${c.place}.`],
    grievance: [
      (c) => `Your warrant went to ${c.subject || 'wanted'} out of ${c.place}. Every lawful dock has the flag.`,
    ],
    praise: [
      (c) => `${c.subject || 'Wanted'} status out of ${c.place}. Took you long enough.`,
      (c) => `The law raised your paper at ${c.place}. Round here that's a letter of reference.`,
    ],
  },
  tumble_rake: {
    neutral: [(c) => `Raked ${c.n} hulls with a tumbling wreck at ${c.place}.`],
    grievance: [],
    praise: [
      (c) => `${c.n} hulls off one tumbling wreck at ${c.place}. Pilots here still argue about the angle.`,
    ],
  },
  stunt: {
    neutral: [(c) => `Landed ${c.subject || 'a stunt'} at ${c.place}.`],
    grievance: [],
    praise: [
      (c) => `Saw the ${c.subject || 'stunt'} at ${c.place} on a gun camera. Buy you a drink for that.`,
    ],
  },
  hunter_disabled: {
    neutral: [(c) => `Disabled the warrant hunter ${c.subject || 'on your paper'} at ${c.place}.`],
    grievance: [
      (c) => `${c.subject || 'A licensed hunter'} came back from ${c.place} on a tow. The guild took that personally.`,
      (c) => `You put ${c.subject || 'a hunter'} in a repair bay at ${c.place}. Every writ-holder here read the report.`,
    ],
    praise: [
      (c) => `${c.subject || 'That hunter'} went home from ${c.place} on a cable. Nobody here minded.`,
      (c) => `Word is ${c.subject || 'a writ-holder'} limped out of ${c.place} after meeting you. Drinks were had.`,
    ],
  },
  hunter_outran: {
    neutral: [(c) => `Outran ${c.subject || 'a warrant hunter'} at ${c.place}.`],
    grievance: [],
    praise: [
      (c) => `${c.subject || 'The hunter'} lost you at ${c.place}. They're still telling it as a tactical withdrawal.`,
    ],
  },
  station_strike: {
    neutral: [(c) => `Crews at ${c.place} walked off the floor over a killed shift.`],
    grievance: [
      (c) => `${c.place}'s crews sat down because of what you did to their shift. They know your hull.`,
      (c) => `There's a shift at ${c.place} that doesn't come home. The floor remembers who flew that.`,
    ],
    praise: [],
  },
  station_grudge: {
    neutral: [(c) => `${c.place} shut its berth to you until the note is paid.`],
    grievance: [
      (c) => `${c.place} has a standing order: your hull does not come through the ring until you pay.`,
      (c) => `Dock control at ${c.place} keeps your silhouette pinned by the berth board. Pay the note.`,
    ],
    praise: [
      (c) => `Banned from ${c.place}'s ring. That's a badge in this bar.`,
    ],
  },
  ace_defeated: {
    neutral: [(c) => `Brought down ${c.subject || 'a named ace'} at ${c.place}.`],
    grievance: [
      (c) => `${c.subject || 'A captain'} is dead at ${c.place}, and the crew that flew under them is drinking to your name. Not kindly.`,
      (c) => `You killed ${c.subject || 'a name'} at ${c.place}. Their wingman has it written down.`,
    ],
    praise: [
      (c) => `${c.subject || 'That ace'} went down at ${c.place}. Lanes out that way breathe easier.`,
      (c) => `Patrol pilots at ${c.place} toast the hull that finished ${c.subject || 'the ace'}. That's yours.`,
    ],
  },
  pod_ransomed: {
    neutral: [(c) => `Sold a survivor pod to a fence at ${c.place}.`],
    grievance: [
      (c) => `A ${c.faction} crew went to a fence at ${c.place} on your cable. Their families got a price list.`,
      (c) => `You towed survivors to ${c.place} and took money for them. That is on a wall here.`,
    ],
    praise: [
      (c) => `Heard you brought a pod to ${c.place} and got paid for the cargo. Practical.`,
    ],
  },
  fence_route: {
    neutral: [(c) => `Ran a fence's full route out of ${c.place}.`],
    grievance: [],
    praise: [
      (c) => `${c.subject || 'The fence'} at ${c.place} says you ran the whole route clean. That name opens doors.`,
      (c) => `Three legs for ${c.subject || 'a fence'} out of ${c.place} and nothing lost. People here heard.`,
    ],
  },
  heat_scrubbed: {
    neutral: [(c) => `Had your paper scrubbed at ${c.place}.`],
    grievance: [],
    praise: [
      (c) => `${c.subject || 'Someone'} at ${c.place} took a level off your paper. Quietly, of course.`,
    ],
  },
  ace_routed: {
    neutral: [(c) => `Ran ${c.subject || 'a named ace'} off at ${c.place}.`],
    grievance: [
      (c) => `${c.subject || 'That captain'} ran from you at ${c.place}, and the crew hasn't let them forget it. They'll be back heavier.`,
    ],
    praise: [
      (c) => `${c.subject || 'The ace'} turned tail at ${c.place}. First time anyone here saw that happen.`,
    ],
  },
};

/**
 * One line for a deed. voice: 'neutral' | 'grievance' | 'praise'. Falls back to neutral when the
 * voice has nothing to say about that kind. Returns null for an unknown kind.
 */
export function deedLine(deed, opts = {}) {
  if (!deed || !LINES[deed.kind]) return null;
  const voice = opts.voice === 'grievance' || opts.voice === 'praise' ? opts.voice : 'neutral';
  const bank = LINES[deed.kind];
  const ctx = {
    place: deedPlaceName(deed),
    faction: deedFactionName(deed),
    subject: prettySubject(deed),
    n: numberFor(deed),
  };
  const fn = pick(deed, voice, bank[voice]) || pick(deed, 'neutral', bank.neutral);
  return fn ? fn(ctx) : null;
}

function prettySubject(deed) {
  if (!deed.subject) return null;
  if (deed.kind === 'wanted_tier') return String(deed.subject).toUpperCase();
  if (deed.kind === 'ore_flood' || deed.kind === 'kill_lawful' || deed.kind === 'kill_outlaw' || deed.kind === 'base_destroyed') {
    return humanize(deed.subject);
  }
  if (deed.kind === 'dock_slam' || deed.kind === 'fence_burned') return null;
  return String(deed.subject);
}

function numberFor(deed) {
  const d = deed.detail || {};
  if (deed.kind === 'dock_slam') return Math.round(Number(d.fineCr) || 0);
  if (deed.kind === 'bounty_paid') return Math.round(Number(d.amount) || 0);
  if (deed.kind === 'tumble_rake') return Math.max(1, Number(d.victims) || 1);
  return Math.round(Number(deed.weight) || 0);
}

/** Short label for a ledger row. */
export function deedKindLabel(kind) {
  return String(kind || '').replace(/_/g, ' ');
}
