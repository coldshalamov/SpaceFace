/** BRACKET / BX-9: a yard robot who has appointed himself Keeper of the Small Goal. */
export const BRACKET = Object.freeze({
  id: 'character_bracket', name: 'BRACKET', callsign: 'BX-9 / BRACKET',
  sectorId: 'sector_helios_prime', anchor: Object.freeze({ x: -520, z: 440 }),
  keeperRadius: 14, keeperMass: 140, hull: 900,
  ballRadius: 4.5, ballMass: 10, goalZ: -78, keeperZ: -54, postX: 56,
  aperture: 48, serveZ: 48, bumperX: 87, bumperZ: -4, bumperRadius: 10,
  discoverRadius: 340, hailRadius: 260, leaveRadius: 410,
  rounds: 5, serveSeconds: 2.4, shotSeconds: 32, resultSeconds: 2.3,
  maxBallSpeed: 300, minShotSpeed: 6, playerTouchSeconds: 35,
  retreatSeconds: 16, reactionSeconds: 0.22, tellSeconds: 0.58,
  dashSeconds: 0.74, recoverSeconds: 0.95,
});
export const BRACKET_LINES = Object.freeze({
  discover: 'BX-9 / BRACKET — a salvage robot is guarding a tiny goal. Scan nearby to play.',
  hello: 'BRACKET: The yard is closed. The league is open. Five shots. Nudge or Massline the ball past me, between the amber posts.',
  welcome: 'BRACKET: Challenger recognized. Your previous excuses remain on file. Scan for a rematch.',
  champion: 'BRACKET: Yard Champion approaching. Everybody look professional. That means me.',
  serve: 'BRACKET: Your ball. Push or sling it toward the goal. The side bumpers are legal. Apparently.',
  goal: 'BRACKET: A goal. A perfectly regulation-sized catastrophe.',
  bank: 'BRACKET: Off the bumper? Using the yard against the yard. I respect the paperwork.',
  save: 'BRACKET: Returned to sender. Postage unpaid.',
  miss: 'BRACKET: Not a goal. A bold investigation of the rest of space.',
  timeout: 'BRACKET: Time. I admire the suspense. The ball was less impressed.',
  win: 'BRACKET: Three or more. You win. I am furious in a very sportsmanlike way.',
  perfect: 'BRACKET: Five out of five. Fine. I will demonstrate the problem with having hands.',
  lose: 'BRACKET: The small goal remains defended. Scan for a rematch. I have cleared my entire century.',
  cancel: 'BRACKET: Match suspended. No score filed. The small goal will be here.',
  hurt: 'BRACKET: That is ammunition. Different sport. I am closing my hands now.',
  dead: 'BX-9 / BRACKET — the scoreboard goes dark. The small goal has no keeper.',
  quiet: 'BRACKET: They built me to sort scrap. Nobody said I could not sort it into teams.',
  tiny: 'BRACKET: One small goal. An unreasonable amount of universe. Still worth defending.',
  third: 'BRACKET: Third rematch. I am counting this as a friendship. Objections may be submitted to the ball.',
  trick: 'BRACKET: Goal while going backwards. Your engine and I have several questions.',
});
export function freshBracketMemory() {
  return { version: 1, met: false, destroyed: false, hull: BRACKET.hull,
    matches: 0, wins: 0, goals: 0, best: 0, bankGoals: 0,
    perfect: false, quiet: false, tiny: false, reverseGoal: false };
}
export function normalizeBracketMemory(raw) {
  const m = freshBracketMemory();
  if (!raw || typeof raw !== 'object' || raw.version !== 1) return m;
  for (const k of ['met', 'destroyed', 'perfect', 'quiet', 'tiny', 'reverseGoal']) m[k] = raw[k] === true;
  for (const k of ['matches', 'wins', 'goals', 'bankGoals'])
    m[k] = Number.isFinite(raw[k]) ? Math.min(1e6, Math.max(0, Math.floor(raw[k]))) : 0;
  m.wins = Math.min(m.matches, m.wins);
  m.best = Number.isFinite(raw.best) ? Math.min(5, Math.max(0, Math.floor(raw.best))) : 0;
  m.hull = Number.isFinite(raw.hull) ? Math.min(BRACKET.hull, Math.max(0, raw.hull)) : BRACKET.hull;
  m.destroyed ||= m.hull === 0;
  return m;
}
export const BRACKET_AUDIO_RECIPES = Object.freeze([
  { id: 'sfx_bracket_serve', category: 'world', type: 'oscillator', wave: 'triangle',
    baseFreq: 440, freqSweep: [440, 660], sweepTimeS: 0.13,
    gainEnvelope: { attack: 0.01, decay: 0.08, sustain: 0.2, release: 0.17 }, gainMult: 0.25 },
  { id: 'sfx_bracket_tell', category: 'world', type: 'oscillator', wave: 'triangle',
    baseFreq: 112, freqSweep: [112, 170], sweepTimeS: 0.45, filterType: 'lowpass', filterFreq: 900,
    gainEnvelope: { attack: 0.04, decay: 0.10, sustain: 0.6, release: 0.20 }, gainMult: 0.22 },
  { id: 'sfx_bracket_goal', category: 'world', type: 'oscillator', wave: 'sine',
    baseFreq: 523.25, freqSweep: [523.25, 1046.5], sweepTimeS: 0.2,
    gainEnvelope: { attack: 0.01, decay: 0.16, sustain: 0.3, release: 0.8 }, gainMult: 0.32 },
  { id: 'sfx_bracket_save', category: 'world', type: 'oscillator', wave: 'triangle',
    baseFreq: 156, freqSweep: [210, 105], sweepTimeS: 0.16,
    gainEnvelope: { attack: 0.01, decay: 0.10, sustain: 0.2, release: 0.24 }, gainMult: 0.24 },
]);
