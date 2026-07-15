# src/combat/ agent notes

The registered `src/systems/combat.js` system delegates shared mechanics to this library. Weapons,
attachments/tether, damage, targeting, cues, and physics contacts cross several update-order seams.

- Preserve single-writer ownership; emit economy, cargo, reputation, and heat intents rather than
  mutating their state directly.
- Keep damage, attribution, death, loot, and cue emission deterministic and idempotent.
- Tether/attachment changes must coordinate with `src/systems/tetherGameplay.js`, weapons, physics,
  camera/focus, and the focused tether checks.
- Do not make combat easier or harder through unexplained global constants. Validate intended enemy
  doctrine, player feedback, TTK/fairness, and first-session survivability.
- Preserve audio/visual cue events when refactoring; player feedback is part of the mechanic.
