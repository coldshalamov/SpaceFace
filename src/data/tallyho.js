// src/data/tallyho.js — TALLYHO / CN-2, the scoreboard robot looking for a crowd (W-SHIFT
// row 506, 03 §4.3). A Cull scoreboard that came loose; it posts up over the Rhea Cinder
// fight ground and rates every player kill it can see — streaks score higher, and a real
// crowd of Pitborn spectators drifts in to park at the rail while the numbers run. The
// play: fight where it can watch, and the sector fills with an audience that only exists
// because the scoreboard called you good.
export const TALLYHO = Object.freeze({
  sectorId: 'sector_rhea_cinder',
  // Posted over the Cinder Claim fight ground, just off the radiation ring.
  post: Object.freeze({ x: 350, z: -600 }),
  // It rates what it can see — kills inside the crowd ring.
  crowdRadius: 900,
  // Rolling streak window: kills inside it count together.
  streakWindowS: 8,
  // Every ratedKillsPerSpectator rated kills draws one spectator hull; the rail caps.
  ratedKillsPerSpectator: 3,
  spectatorCap: 3,
  spectatorRingOffset: 120, // spectators park just outside the crowd ring edge
  scoreFlag: 'tallyho_score',
  ratedFlag: 'tallyho_rated',
  announceFlag: 'tallyho_announced',
  sender: 'TALLYHO / CN-2',
  callsign: 'CN-2',
  announce: 'CN-2 is ON THE BOARD. Kill something where I can see it. Bring friends. I will bring the crowd.',
  // Streak-indexed rating lines — canon: "THAT ONE COUNTS DOUBLE!"
  rateSingle: 'ONE.',
  rateDouble: 'THAT ONE COUNTS DOUBLE!',
  rateTriple: 'THREE RUNNING — THE RAIL LIKES YOU.',
  rateBig: 'CROWD CALL: THE BOARD IS YOURS.',
});
