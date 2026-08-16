<!-- LIFETIME: DURABLE -->
# 39 — AMBIENT VFX: machinery that never sleeps

The "alive" layer between fights. Everything loops, everything pooled, nothing allocates per
frame (PERF contract: ambient dressing has a hard per-scene emitter budget in data).

## The dressing catalog

- **Stations**: rotating rings/sections, docking clamps cycling, container cranes on the
  yards, welding arms with spark falls, ad hoardings with slow scroll, running-light groups
  with independent blink clocks.
- **Industry**: refinery vent flares, slag drips, heat shimmer columns, ore conveyor glow.
- **Belts**: miner beam glows at work (18), dust motes in keylight, occasional distant flash
  of someone else's mining charge.
- **Traffic**: lane buoy strobes in sequence (the road reads as a road), gate charge-up
  cycles, convoy formation lights.
- **Planets** (23): storm lightning inside bands, city-light terminator, ring glint sweeps.
- **Space itself**: one near-field dust layer (35) + the authored skybox. That's it. Depth
  comes from light, not layer stacks.

## The golden rule

Ambient motion must never out-shout *state change* (GDD §9.4): blinks are slow, loops are
slow, and anything fast on screen means something. If an ambient effect is mistaken for a
combat event in review, it's redesigned.

## Acceptance

- Perf: ambient emitters within budget; zero per-frame allocs in a 10-min island soak.
- Human gate: owner watches a station approach and a worked field for 60 s each: "alive?"
  twice.
