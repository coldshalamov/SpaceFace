# Asset-bank quality and family direction

Owner refinement, 2026-10-14: increase detail and quality, review the existing game's models, and
unify the visual language while retaining enough variation across ship types and genres to give
things character. This applies to the full bank, not just a few presentation samples. The initial
utility previews are a construction starting point; a high file count does not satisfy this goal.

## Existing source anchors

- Wasp: graphite arrowhead, paired stinger nacelles, recessed luminous channels and swept structural
  joins. Translate the disciplined armour/recess hierarchy to compact protected equipment.
- Atlas: navy load spine, steel cargo, dark clamp mechanics and selective safety orange. Its gantry,
  command cab, cargo restraints and rear drive create hierarchy at several scales.
- Standard cargo pod: freight-teal ribbed shell, charcoal corner castings, locking bars/cams and
  a real grapple lug. New handled loads need similarly legible loading and restraint anatomy.
- Dead hulk: recognisable manufactured structure with faded repairs, bright tear edges and dark
  opened cavities. Salvage should reveal layered construction, not only random damaged primitives.
- Saucer: lenticular radial architecture, machinery bezel, restrained field lights and gyroscopic
  drive anatomy. Exotic objects should have a different structural logic, not a human box painted
  green. Do not give every ordinary utility the saucer's exceptional visual signals.

These references are the actual Forge recipes in `tools/blender/forge/ships/`. Existing lore, the
Look, material truth and camera standards remain authoritative. Newly proposed manufacturing details
are art extrapolation until adopted by the owning feature; this document invents no factions.

## Shared language, varied character

Keep shared physical finish response, believable scale, edge hierarchy, readable dark recesses and
purposeful emission. Vary primary form, enclosure, load paths, repair history and working interfaces:

- Industrial freight: robust frames, replaceable protective corners, exposed accessible mechanics,
  load markings, teal/navy bodies and selective hazard controls.
- Civilian/service: cleaner protective shells, softened human-facing interfaces, ivory/teal service
  panels and obvious access/inspection geometry; avoid featureless rounded toy blocks.
- Protected/military equipment: compact integrated shells, recessed optics, armoured shutters,
  disciplined paired features and protected connections; avoid cosmetic weapon-like additions.
- Salvaged machinery: visible original identity, mismatched replacement panels and purposeful repair
  structure. Tears expose actual layers, fasteners and service paths rather than uniform noise.
- Geological/organic/ancient: distinct fracture, growth and precise ceramic assembly logic. Preserve
  host contact and physical continuity. Shared lighting does not mean identical substrates.

## Required refinement loop

1. Establish the function and material bill before adding detail. Identify the primary silhouette,
   structural frame, working part, enclosure, access path and connections.
2. Add meaningful meso-scale construction: cast joints, stepped shell lips, service recesses,
   restrained fastener groups, seals, protective guards, cooling or routed services where justified.
   Do not cover every surface with the same screws or generic greebles.
3. Inspect actual exported meshes in top and chase-like views, at close and normal projected sizes.
   Compare an existing reference and a new piece under the same review light. A source render alone
   does not establish exporter correctness or game-camera quality.
4. Inspect coarse LODs. Preserve thickness, negative space, socket position, aperture and loaded
   silhouette. If decimation turns beams into ribbons, author simpler construction instead.
5. Verify attachments and moving joints. A floating pipe or a socket left behind by an articulated
   member is an implementation defect, not a detail pass waiting for taste approval.
6. Review each family as a group for both consistency and distinguishable roles. Repair weak pieces
   across the bank; do not use a polished hero sample to certify untouched basic models.
7. Record measured geometry/draw/texture costs and exact hashes. Optimize for role and visibility,
   without treating triangle count as quality or claiming representative GPU performance from CPU
   renders. Final live integration and artistic acceptance remain explicit gates.

The result must be useful to another model or artist: usable geometry, editable/reproducible source,
clear family intent, stable interfaces, truthful collision/LOD contracts and verified GitHub files.
