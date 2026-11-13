# Rock surface sets (LOOK-05A, 2026-11-13)

Generated with Codex image generation (gpt-6.1-sol) through tools/art/imagegen_variants.py, two variants per family,
chosen by eye, then made seamless and given a derived normal by tools/art/finish_generated.py tile (512 px).
Common frame for every prompt (subject differs):

> A flat-lit, shadowless, perfectly top-down orthographic square material swatch, 1024 by 1024, seamlessly tileable
> (detail continues naturally across all four edges, no vignette, no focal feature, evenly distributed detail at one
> consistent scale), no perspective, no text, no objects. Photoreal AAA game PBR albedo texture, painterly-real, crisp
> micro detail, NOT a cartoon, NOT flat. Mid-value overall (not dark, not washed out), rich colour variation within the
> surface, baked ambient occlusion in cracks only, no strong directional lighting. The surface: <subject>

| Set | Chosen | Subject | Status |
|---|---|---|---|
| metal | v1 | iron-nickel asteroid crust: dark gunmetal, rust-orange oxide bloom, blue-steel heat tint streaks, bright scratched bare-metal facets, shear scratches, pits, thin pale-cyan seams | CANDIDATE: metal_basecolor/normal here (512 px); the live asteroid-families/metal_* is unchanged |
| crystal | v2 | crystalline asteroid crust: dark indigo-violet matrix, faceted amethyst clusters, geode cavities, pale-lilac glowing veins only in seams | CANDIDATE: crystal_* here, glow map keyed from brightness |
| exotic | v2 | very dark basalt, subtle blue-violet sheen, thin branching hot magenta veins, faint cooling crackle | CANDIDATE: exotic_* here |
| silicate (rock) | v1 | layered sedimentary-basalt strata, warm slate/umber/ochre, fractures, iron-oxide staining, pale dust in crevices, chipped fresh edges | CANDIDATE, not wired |
| ice | v2 | cool blue-grey/teal opaque satin frozen regolith, frost, fracture networks, dust specks, brighter cleaved facets | CANDIDATE, not wired |

Source 1254 px generations are in .devshots/fleet/looks/look05a/gen/<set>/v1|v2/out.png (not committed).

None of these is live. The frames shot in LOOK-05A (.devshots/fleet/looks/look05a/open3-*) show the Helios rocks on a flat, untextured, faceted material, so a family swap could not be judged on screen; Codex's style pass owns wiring them (see design/program/fleet/drafts/asset-findings-for-codex.md, A - rocks). Drop-in: copy metal_/crystal_/exotic_ files over assets/ships/release/surfaces/asteroid-families/.
