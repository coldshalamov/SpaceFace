<!-- LIFETIME: DURABLE -->
# 34 — FIELD & TETHER VFX: the physics made visible

The physics kit only works if players *see* forces. Palette anchors are already locked
(`fields.js` FIELD_PALETTE, per the field readability bible). This is the behavioral layer.

## Fields

- **Well**: rim filaments drift *inward* continuously; captured debris orbits and slowly
  spirals — you can watch the field chew. Kill-depth center glows hottest (violet-white,
  prefigures 02's implosion signature).
- **Repulsor**: outward-drifting ribs; a visible "berm" of piled dust/debris at the boundary
  tells you exactly where the push ends.
- **Cone**: chevron flow pointing forward along the wedge; cleared-lane readability (you can
  see the empty corridor it makes).
- **Anchor snare (hostile)**: same language, hostile palette shift (amber rim) — players learn
  "amber field = not mine."
- Deployed devices are small physical objects with hull (they can be shot — counterplay is
  visible at the device, not in a menu).

## The Massline (the signature)

- The line is the brightest filament on screen (GDD §4.3). Sag under slack, taut-sing under
  load.
- **Strain gradient cyan → amber → red** communicates *how hard it's working* (not breakage —
  the near-unbreakable rule stands).
- Anchor point sparks; winch travel has visible spool direction; a cut snaps with a whip
  recoil + a spent-line curl that fades.
- Tethered bodies telegraph through the line: you can *see* mass in how the sag changes.

## Rules

- Fields and tethers never spam: max active fields is already bounded (6); presentation pools
  match that bound exactly.
- All field VFX are non-blooming at the boundary by construction (locked palette) — keep it.

## Acceptance

- Human gate: owner watches a well + tether fight muted and correctly narrates the forces
  ("that one's pulling, my line's near its working limit, the snare is theirs").
