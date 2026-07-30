# Thread B — World Identity (Places, Stations, Landmarks)

> **Manual sprint lane.** This scope is exclusive only while Thread B is explicitly activated and its
> ownership signal is live; it is not a permanent prohibition for later coherent work.

## Domain (exclusive)

**Owns:** New `place_*` / `landmark_*` GLBs, concept chaining, `design/world-identity/sectors/*.md` reads, evidence folders for places.

**Forbidden:** Kit parts (Thread A), wholeships (Thread E), `partsLibrary.js`, `sectorAnchors.js` (Thread C), `vfx.js` (Thread D).

**Blender:** Only when lock free. Prefer planning sprint without Blender (concept + YAML specs) while Thread A holds lock.

## Sprint scope rule

One **place pack** per sprint:

| Sprint | Source | Count |
|--------|--------|-------|
| B-faction-stations-P0 | `needed-assets.md` §B P0 | 1 hero station |
| B-landmark | `needed-assets.md` §B P2 or `QUEUE.md` | 1 landmark |
| B-hero-asteroid | §B P5 | luminite OR ice |
| B-gate-variant | §B P3 | 1 faction gate |

## Task list (per place)

1. Read `assets/ships/AGENTS.md`, `docs/visual-assets/README.md`,
   `docs/visual-assets/VISUAL_ASSET_PRODUCTION_STANDARD.md`, and
   `.grok/skills/spaceface-blender-material-truth/SKILL.md`.
2. Read `design/world-identity/PIPELINE.md` + sector spec for story band, then complete the
   material-truth preflight for the changed place assemblies.
3. Load `assets/concept/index.json` entry → Blender `REF_<id>` plane. If the selected component
   reference needs image generation and this worker lacks it, use
   `docs/visual-assets/AGENT_PROMPTS.md` § E.
4. Acquire Blender lock (coordinate with A/E).
5. `npm run author:place-archetype -- <part_id>` OR MCP sculpt per pipeline.
6. Iterate from representative renders and player-route critique until the silhouette, material language,
   scale, and faction identity withstand independent review.
7. `finalize_part.mjs` + `check:place-concept-resemblance` when promoted.
8. Handoff YAML — `thread_c_actions` must list `sectorAnchors` + `PLACE_FILES`.
9. Release lock.

## Verification

```bash
npm run check:place-concept-resemblance   # after promote
# Integrator + C:
npm run check:station-archetype-glb-load
npm run check:station-archetype-wiring
```

## References

- `design/world-identity/PIPELINE.md`
- `design/revamp/BP-08_VISUAL_ASSET_SPEC.md` §2
- `docs/visual-assets/README.md`
- `docs/visual-assets/VISUAL_ASSET_PRODUCTION_STANDARD.md`
- `.grok/skills/spaceface-blender-material-truth/SKILL.md`
- `needed-assets.md` §B
- `assets/QUEUE.md`

## Goal prompt

Copy from `GOAL_PROMPTS.md` → **Thread B**.
