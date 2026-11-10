// Fixture: a system that rolls its own dice. Must trip no-ambient-randomness.
export function pickTarget(list) {
  return list[Math.floor(Math.random() * list.length)];
}
