// Read the portable weather's real state. Presentation only: never owns charge, pose or damage.
// One of each explanation per prop per installed room prevents dock-edge chatter.
export function readCryoWeatherCue(previous, current, role, seen = new Set()) {
  if (!previous || !current || !['coolant', 'heat'].includes(role)) return null;
  const name = role === 'coolant' ? 'Coolant tank' : 'Heat manifold';
  let id, text;
  if (previous.alive && !current.alive) {
    id = 'lost'; text = `${name} destroyed: its portable pocket is gone.`;
  } else if (!current.alive) return null;
  else if (current.docked && !previous.docked) {
    id = 'refilled'; text = `${name} back at its berth: portable charge replenished.`;
  } else if (!current.docked && previous.docked && current.active) {
    id = 'moved'; text = role === 'coolant'
      ? 'Coolant tank moved: cold follows for eight seconds. Your momentum stays; steering weakens.'
      : 'Heat manifold moved: burning heat follows for eight seconds. Keep clear of the pocket.';
  } else if (previous.active && !current.active && !current.docked) {
    id = 'spent'; text = `${name} spent: its portable pocket has ended. Return it to its berth to refill.`;
  } else if (!current.docked && current.active && previous.charge > 120 && current.charge <= 120) {
    id = 'low'; text = `${name}: two seconds of portable charge remain. The central island blocks new room exposure.`;
  }
  return id && !seen.has(id) ? { id, text } : null;
}
