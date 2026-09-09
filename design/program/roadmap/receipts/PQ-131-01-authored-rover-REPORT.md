<!-- LIFETIME: DURABLE -->
# PQ-131.01 — authored Rover report

## Outcome

The Asteroid Works Rover now loads as the authored `place_works_rover` release asset on the normal Works
route. The procedural `makeRover` builder is deleted. The live vehicle preserves the existing boom/bit,
five hopper stages, lid, lamp, vent, tracks, scar, heat, cargo, movement, and reduced-motion behavior
through named authored hooks. Work zoom uses LOD0 and site zoom uses LOD1.

## Frozen artifacts

- Combined source: `444DA580C97A5A993D713AF6656A1049D8B9FBBD6E86697F8B21B58D6354D5CB`
- Release: `7F759A4853517D1622D9293552C596C61CB5987EF74418DDADDA85C515B67D4C`, 2,429,548 bytes
- Render package: `9BEBA0E36ED10375F7C392EBC30DFCD3753D8DEAD07E966D2009ADF1971D4380`, 3,037,852 bytes
- LOD0: 17,438 / 18,000 triangles; LOD1 remains within its 4,000-triangle budget
- Final source rebuilds match at raw GLB, normalized JSON, and BIN payload layers

## Player-route acceptance

- Final dedicated work/site capture mounted the selected release, changed register LODs, reported no
  untagged meshes, resolved all 13 required hooks plus asset identity, and reported the expected texture
  colour spaces.
- Final playable route: 16/16 passed.
- Controller desktop playable route: 16/16 passed. A separate controller browser run passed all gameplay,
  Continue, shader, asset, and authored-hull assertions but hit the documented intermittent opening-
  submission post-submit diagnostic as CLEAN; it did not request the Works asset and was retained rather
  than rerun unchanged.
- Focused loader/Rover tests: 8/8 passed.
- Render-package plan: 114/114 passed; selected package freshness: 114.
- Asteroid theater check passed.

The fresh Cycle 79 report retains one red automated row, clay `CAB_PANE = 0.0081 < 0.02`. Grok 4.6,
Cursor Grok 4.6 xhigh, and Clinepass Kimi K3 max each inspected the exact frozen candidate at original
resolution and returned G1/G2/G4 KEEP, no P0/P1 defects, and measurement-false-positive for that row.
The controller accepted the whole asset in
`assets/works/rover/evidence/cycle_079/reviews/controller_acceptance.md`.

## Next product unit

`PQ-131.02` — authored Massline Core.
