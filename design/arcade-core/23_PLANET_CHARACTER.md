<!-- LIFETIME: DURABLE -->
# 23 — PLANETS & BIG BODIES: character *and* kill zone

Every planet is both a place and a 04_ATMOSPHERE_EXECUTION zone. `planets.js`,
`planetStates.js`, `planetRuntime.js` own the seams.

## Planet archetypes (visual profile + atmosphere tuning + one hook)

| Type | Look | Atmosphere band (04) | Hook |
|---|---|---|---|
| **Forge world** | Smog-orange bands, city-light spiderweb on the dark side, heat shimmer | Thick, hot: burn-up is fast (~3 s) and spectacular | Best burn-up spectacle; orbitals are factory platforms |
| **Ice giant** | Pale cyan bands, ring system | Wide, gentle gradient: long spirals, escapable late | Ring debris hides smugglers; crystal shoals nearby |
| **Storm giant** | Raging bands, constant internal lightning | Violent: drag + random gust impulses (through the field kernel!) | The rodeo planet: experts fight in its gradient |
| **Dead rock** | Grey-brown, cratered, no atmosphere | None — it's a collision body, not a burn-up body | Honest smash physics only; mining-rich |
| **Ocean world** | Deep blue, white swirls, bright terminator | Clean, medium band | Prettiest backdrop; tourist liners loop it (18) |
| **Shrouded world** | Fully overcast, murky under-glow | Band glows from *within* when something burns | The creepy one; rumor magnet |

## Rules

- City lights / storm lightning / ring shadows are the identity carriers — readable at default
  zoom (I-1), cheap (baked textures + a light, not live sim).
- Every inhabited planet has **orbital furniture**: platforms, elevators, defense sats —
  real objects, targetable/destroyable within law rules (I-7 consequences apply).
- Atmosphere danger is color-coded consistently game-wide (heat gradient = danger) so the 04
  mechanic needs zero tutorial text.
- Moons: collision bodies with their own micro-gradient; one moon in the graph gets a hidden
  cache (30).

## Acceptance

- Blind test per archetype; 04 acceptance runs on at least three planet types (fast/medium/no
  burn-up variants).
