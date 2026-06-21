# PROMPT — paste this to the model

---

You are a senior hard-surface 3D artist shipping assets for a real-time space game. I need a
**modular ship-parts library** — not one ship, but ~24 individually-modeled *parts* (cockpits,
engines, weapons, fins, greeble kits) that my game's procedural assembler kit-bashes into every ship.
Studio technique: authored parts carry the quality, procedural assembly carries the variety. Think
No Man's Sky / Starfield generic ships / Elite Dangerous.

**Read the full spec first** — it is the source of truth for contracts, the parts manifest, and the
art direction:
`docs/Spec/SHIP_PARTS_LIBRARY_SPEC.md` (in the repo). Treat §1–§4 as hard requirements; §8 is the
ambition bar to clear, not a ceiling.

**The problem I'm solving, plainly:** my ships currently look "Starfox 64" because they're built from
raw boxes with procedural noise at 256px. Your parts replace that. The two things that will most move
the needle — and that I want you to go hard on — are:

1. **Chamfered/beveled edges on every manufactured surface.** A beveled edge catches a crisp highlight
   line that reads instantly as "machined metal." Raw boxes have razor 90° edges that catch light as
   flat facets — that's the cheap look. Don't leave hard edges on anything that should read as
   manufactured. Use support loops / bevel modifiers.
2. **Real high-to-low baking.** Sculpt panel lines, rivets, weld seams, gouges, greeble into a high-poly,
   then bake to normal + ambient-occlusion + metallic/roughness maps at 1K–2K. No flat colors, no
   procedural noise — sculpted, baked detail. Ambient occlusion especially: there is currently zero AO
   on any ship and it's killing the depth read.

**Format / delivery:** game-ready glTF (.glb) per part, +X forward, +Y up, metres, origin at the mount
point, with the named mount/hook/socket empties from spec §2.3. ≤ 4k tris / ≤ 350 KB per part. Required
maps: baseColor (sRGB), normal (tangent, OpenGL green-up), and AO+roughness+metallic. Cockpit glass
should be a real transmission/clearcoat material.

**Priority:** deliver the **P0 set first** — that's what lifts every ship visibly:
- 3 cockpits (`cockpit_dome`, `cockpit_slab`, `cockpit_recessed`) — smoked refractive glass + visible
  interior deck + frame. Highest readability impact.
- 4 engines (`engine_ion_small`, `engine_ion_twin`, `engine_industrial`, `engine_resonator`) — interior
  turbine detail + bright core + heat wear; export `HOOK_Emissive` + `HOOK_Spin` + `MOUNT_Child`.

Then P1 (weapons, fins, greeble kits) as you get to them. Layout and `parts_manifest.json` schema are
in spec §6.

**Tintability contract (important):** separate each part's hull material from its accent/emissive
material and name them so my assembler can recolor per faction (`Material_Hull`, `Material_Accent`).
One cockpit part then recolors across all 7 factions.

**I'll handle the integration** — GLTFLoader wiring, the kit-bash assembler, binding hooks to my
drive/damage/LOD systems, keeping automated checks green. Your job is the parts. Don't worry about
whole-ship composition or rigging; just clean, game-ready, beautiful parts that meet §2.

**Give me:** the GLB files + a `parts_manifest.json` per §6, plus a one-paragraph note per part on the
sculpt/bake choices you made (what reads as the identity, where you put wear, why). If you make strong
creative calls that deviate from the manifest, flag them — I'd rather you push the craft than
color-by-numbers.

Make these look like ships from a real game, not a tutorial.
