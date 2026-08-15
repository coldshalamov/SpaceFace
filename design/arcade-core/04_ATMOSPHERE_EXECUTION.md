<!-- LIFETIME: DURABLE -->
# 04 — ATMOSPHERES AS EXECUTION ZONES

The fantasy image the owner keeps coming back to: *an enemy blasted toward a planet, spiraling
in, wrapped in flame, exploding.* What exists (`planetRuntime.js`, `planets.js`, hazard
language) must be audited; what's specified here is the standard for how it must feel,
regardless of what exists.

## Physical model (deterministic, kernel-consistent)

Each populated planet gains three concentric, data-driven zones:

1. **Gravity gradient** (outer): a soft, always-on radial pull toward the planet, strength
   scaled by distance band — weak enough to ignore under thrust, strong enough that a
   *tumbling* (control-less) body curves visibly inward. Runs through the field-kernel idiom
   (radial acceleration + mass coupling), not bespoke per-planet code.
2. **Atmosphere band** (middle): entering it applies drag + heating. Controlled thrust can
   still escape (it should be expensive and scary, not instant death — the player may need to
   dive in to grab something). A tumbling body cannot escape: drag circularizes then decays
   its path into a tightening spiral.
3. **Kill depth** (inner): heating exceeds the hull's tolerance → burn-up death (02_STYLE_KILLS
   "Burn-up" signature) → material/credit burst scatters along the descent path, some of it
   flung back out by the detonation so diving the rim to catch the spray is a real (risky)
   play.

## Feel standard (the acceptance bar, in words)

- **The spiral is the show.** From "tumbling at the rim" to burn-up should take ~3–6 seconds:
  long enough to watch the flame shroud build and the path curl in, short enough to stay an
  arcade beat.
- **Escapable with agency, fatal without it.** A conscious pilot at full burn escapes the
  middle band with hull to spare; a tumbling ship never does. That asymmetry is the entire
  mechanic — it's why blasting enemies sunward is a kill move and getting blasted sunward is
  a terror.
- **The planet reads as dangerous before anything touches it.** Heat shimmer / glow gradient
  on approach, engine-strain audio, HUD proximity cue (quiet, persistent — not an alarm).
- **It must work on NPCs without scripts.** Pirates fleeing low, debris from any explosion,
  cargo pods — anything tumbling near a planet should occasionally just… burn up. The world
  doing this on its own is what makes it feel real (07_LIVING_WORLD).

## Bans

- No scripted death sequences: the spiral emerges from gradient + drag + no-control, never a
  canned animation.
- No invisible walls / instant-kill planes.
- Player escape difficulty must not depend on framerate or wall time (fixed-timestep sim).
- Don't nerf planets into harmlessness because the player complained once — the counterplay
  is "don't tumble near a planet," which the physics kit makes controllable.

## Acceptance

- Headless sim tests: (a) thrusting reference ship escapes middle band; (b) tumbling reference
  ship spirals and dies within the time band; (c) reward burst spawns along descent path.
- Bot route: concussion an enemy into the gradient of the starter system's planet → burn-up
  style kill credited (×2) with materials recovered at the rim.
- Human gate: capture of the full spiral at default zoom; the owner's bar is "I would clip
  this."
