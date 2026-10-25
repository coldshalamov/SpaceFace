import { SECTORS } from './sectors.js';
import { FACTION_META } from './factions.js';
import { stationShiftAt, barPressureAt } from './worldCalendar.js';

const STATIONS = new Map(SECTORS.flatMap(s => (s.stations || []).map(st => [st.id, st])));
const AUTHORITIES = new Map(FACTION_META.map(f => [f.id, f.name]));
const TYPE = Object.freeze({
  trade_hub: ['Concourse', 'Keep purchases attended. Unclaimed freight is not a gift.', 820, .16],
  refinery: ['Crucible', 'Hot-work crews: pressure-test the line before the next pour.', 460, .10],
  mining: ['Claim', 'Dust seals stay shut until the assay crew clears the lock.', 530, .10],
  fab: ['Foundry', 'Tool lockers close at the bell. Count your fingers before signing.', 620, .12],
  military: ['Watch', 'Visitors remain inside the marked lanes. No exceptions for rank.', 980, .055],
  black_market: ['Backstairs', 'No names over the public address. Settle your berth before leaving.', 360, .09],
  research: ['Survey', 'Samples travel sealed. If the seal is talking, call containment.', 720, .065],
});

/** Reads existing station, standing and calendar owners; nothing here advances world time. */
export function stationLifeProfile(state, stationId) {
  const station = STATIONS.get(stationId);
  if (!station) return null;
  const rep = Number(state.factions?.[station.factionId]?.rep) || 0;
  const standing = rep < -20 ? 'guarded' : rep >= 30 ? 'welcome' : 'ordinary';
  const type = TYPE[station.type] || TYPE.trade_hub;
  const time = Math.max(0, Number(state.simTime) || 0);
  const shift = stationShiftAt(stationId, time);
  return {
    stationId, stationName: station.name, type: station.type, factionId: station.factionId,
    authority: AUTHORITIES.get(station.factionId) || 'Local authority', standing, shift,
    prefix: type[0], notice: type[1], crowdHz: type[2],
    crowdGain: type[3] * (.65 + barPressureAt(stationId, time)) * (standing === 'guarded' ? .7 : 1),
  };
}

export const BAY_PERIOD_S = 64;
export const BAY_SLOTS = Object.freeze([
  Object.freeze({ id: 'apron-seven', berth: 7, offset: 12, side: -1, fit: 18 }),
  Object.freeze({ id: 'apron-twelve', berth: 12, offset: 44, side: 1, fit: 16 }),
]);

/** An apron transfer, not a second live traffic/physics owner. out is caller-owned. */
export function stationBayPose(seconds, slot, out = {}) {
  const phase = ((seconds - slot.offset) % BAY_PERIOD_S + BAY_PERIOD_S) % BAY_PERIOD_S;
  const arriving = phase < 12;
  const moored = phase >= 12 && phase < 26;
  const leaving = phase >= 26 && phase < 38;
  const travel = arriving ? 1 - phase / 12 : leaving ? (phase - 26) / 12 : 0;
  out.visible = arriving || moored || leaving;
  out.phase = arriving ? 'arriving' : moored ? 'moored' : leaving ? 'departing' : 'away';
  // Foreground service aprons sit inside the berth's authored work lights. The old
  // rear-wall lane hid small dark craft behind the gantry and the seated hull.
  out.x = slot.side * (22 + travel * 65);
  out.y = -3 + travel * 9;
  out.z = 14 - travel * 46;
  out.yaw = arriving ? slot.side * .7 : leaving ? slot.side * .7 + Math.PI : slot.side * .7;
  return out;
}

export function stationLifeElapsed(clock, nowMs) {
  return clock ? clock.elapsedS + (clock.running ? Math.max(0, nowMs - clock.updatedAt) / 1000 : 0) : 0;
}

/** Events in a short presentation interval. Long covered intervals never replay a backlog. */
export function stationBayCalls(fromS, toS, profile) {
  if (!profile || toS < fromS || toS - fromS > 3) return [];
  const calls = [];
  for (const slot of BAY_SLOTS) {
    for (const [offset, direction] of [[0, 'inbound'], [26, 'outbound']]) {
      const base = slot.offset + offset;
      const cycle = Math.floor((toS - base) / BAY_PERIOD_S);
      const at = base + cycle * BAY_PERIOD_S;
      if (cycle < 0 || !(at > fromS && at <= toS)) continue;
      const callsign = `${profile.prefix} ${slot.berth}`;
      calls.push({ at, berth: slot.berth, direction, text: direction === 'inbound'
        ? `${callsign}, berth ${slot.berth} is clear. Bring her in at walking speed.`
        : `${callsign}, outbound lane is clear. Berth ${slot.berth} released.` });
    }
  }
  return calls.sort((a, b) => a.at - b.at);
}

export function stationPALine(profile, index = 0) {
  if (index % 3 === 1) return profile.notice;
  if (index % 3 === 2) return `${profile.authority} berth control. ${profile.standing === 'guarded'
    ? 'Additional manifest checks are in effect for this visitor. Keep your papers ready.'
    : profile.standing === 'welcome' ? 'Our trusted pilots have priority at the service desk. Thank you for coming back.'
      : 'Keep your manifest ready and the transfer lane clear.'}`;
  return `${profile.stationName} public address. ${profile.shift.name} has the floor. ${profile.shift.ending
    ? 'Relief crews, report to the locks. Outgoing crews, leave the lane clear.' : profile.notice}`;
}
