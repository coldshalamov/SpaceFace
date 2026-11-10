// Player-facing read of a fauna drive, and the approach choice the ecology tick uses.
// Motion words are the inference: feeding, alarm, defense, retreat, or quiet.

const MOTION_BY_DRIVE = Object.freeze({
  feed: 'feeding',
  investigate: 'alarm',
  shadow: 'alarm',
  trail: 'alarm',
  defend: 'defense',
  charge: 'defense',
  swarm: 'defense',
  flee: 'retreat',
  drift: 'quiet',
  forage: 'quiet',
  migrate: 'quiet',
  dormant: 'quiet',
  anchored: 'quiet',
  idle: 'quiet',
  repair: 'quiet',
  return: 'quiet',
  captured: 'quiet',
});

/** @returns {'feeding'|'alarm'|'defense'|'retreat'|'quiet'|null} */
export function readFaunaMotion(driveState) {
  if (typeof driveState !== 'string' || !driveState) return null;
  return MOTION_BY_DRIVE[driveState] || null;
}

/**
 * The approach the animal takes toward the player. Returns null when this rule
 * does not apply (not yet reacted, dormant, or silenced) so the caller leaves
 * the current drive alone. A far watcher does not pull a feeding or attached
 * animal off that work.
 */
export function resolveFaunaApproachDrive(species, ctx = {}) {
  if (!species || !species.drives) return null;
  if (!ctx.reacted || species.dormant || ctx.silenced) return null;
  const playerD = Number.isFinite(ctx.playerD) ? ctx.playerD : Infinity;
  // The tick passes the scaled notice ring (stealth, awake site, severed relay).
  // A direct call uses the species ring.
  const noticeR = Number.isFinite(ctx.noticeR) ? ctx.noticeR : (Number(species.alertR) || 0);
  const threatenR = Number(species.threatenR) || 0;
  // A heat hunter at one range holds shadow until the plume is hot.
  // Inside the close ring it still panics. Other animals keep the proximity rule.
  if (species.heatHunter && playerD < noticeR) {
    if (playerD < threatenR) return species.drives.panic;
    return ctx.heatSaturated ? 'charge' : species.drives.curious;
  }
  if (playerD < threatenR) return species.drives.panic;
  if (playerD < noticeR) return ctx.awake ? species.drives.tense : species.drives.curious;
  const current = ctx.currentDrive;
  if (current === 'attach' || current === 'idle' || current === 'feed') return current;
  return species.drives.idle;
}
