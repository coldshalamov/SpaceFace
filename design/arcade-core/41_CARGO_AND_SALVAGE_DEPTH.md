<!-- LIFETIME: DURABLE -->
# 41 — CARGO AS A PHYSICAL SYSTEM

`cargo.js`, `fragileCargo.js`, `jettisonImpulse.js`, custody systems exist. Standard: cargo is
never an inventory number in flight — it's *stuff in the world*.

## The verbs

- **Magnet fishing**: debris fields, battle aftermaths, and cargo spills are trawled with the
  vacuum — a relaxed, lucrative idle verb between fights.
- **Jettison tactics**: dump mass to lighten the ship (small real thrust benefit), drop a
  decoy pod when pirates scan you (49), or *weaponize* a heavy pod: jettison at speed into a
  pursuer's path (it's a real collision object — the game already has the impulse).
- **Fragile cargo**: some goods take damage from hard maneuvers and collisions — hauling them
  changes how you fly (a flight-model contract, not a timer).
- **Contraband**: flagged goods scan as illegal at customs (49); hidden compartments and cold
  running are the counters.
- **Pod custody**: loose pods remember ownership (custody system); grabbing witnessed-owned
  cargo is theft with I-7 consequences. Drifting *unowned* salvage is finders-keepers — the
  scan UI must say which is which.

## Rules

- Every cargo interaction is physical first, menu second (jettison scatters real pods).
- Cargo volume/mass affects ship handling honestly but mildly — feel it, don't fight it.

## Acceptance

- Bot routes: decoy-drop fools a pirate scan; jettison-pod collision damages a pursuer;
  fragile goods degrade on a violent route and survive a gentle one.
