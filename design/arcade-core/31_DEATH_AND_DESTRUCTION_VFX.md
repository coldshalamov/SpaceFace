<!-- LIFETIME: DURABLE -->
# 31 — DEATH & DESTRUCTION VFX: the explosion taxonomy

The single highest-value polish surface in the game: you see a death every few seconds. Every
one should be *watched*, not just registered. Obeys 02's cause signatures and 10's caps.

## The size ladder (by victim class)

| Class | Signature build | Duration |
|---|---|---|
| Light | White core flash → orange petal burst → 6–10 debris chunks + 2 tumbling plates → smoke wisp | ~0.8 s |
| Medium | Interior flicker through hull seams (2 beats) → main burst → shockwave ring → debris + a tumbling *section* (engine block, wing) → lingering fires on the largest chunk | ~1.4 s |
| Heavy | Multi-point cook-off: 3–6 staggered secondary detonations walk the hull → main burst → the wreck persists, burning, and is a physical object (26) | ~3 s + persistent wreck |
| Capital | 20's chain: rolling detonations, structural collapse, the sky goes briefly bright | setpiece |

## The cause layer (from 02 — same event, different skin)

Terrain smash = fuel-tank fireball (huge flash, forward-directed debris cone). Burn-up =
reentry shroud + sunward fragment rain. Chain = cyan core. Well collapse = inward streak
implosion. Ordinary = the size-ladder default. These stack with size: a heavy terrain-smash is
a cook-off walking toward the impact point, then the fireball.

## Physics rules (I-3)

- All debris above a size threshold is *real*: collision, mass, vacuum-immune (it's not loot),
  and it can chain-kill (02 detection reads it).
- Explosion impulses are real: point-blank ships get shoved. Small, honest, and it makes
  kill-dives spicy.
- Debris budget: pooled, capped per frame; oldest small debris evaporates first. Persistent
  wrecks use the aftermath system, not the VFX pool.

## Bans

- No screen-clearing white flashes (10's flash caps; reduced-flash variant mandatory).
- No invisible "despawn pop": everything that dies leaves something for at least a beat.

## Acceptance

- Human gate: a 30 s kill-montage capture at default zoom, sound on. Owner's bar: "I'd watch
  this loop."
