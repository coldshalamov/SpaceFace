# VFX-02 — A giant flat golden wedge covers the screen; explosion smoke buries ships

Evidence: `.devshots/fleet/runs/ACCEPT-06-later-content.hydrogen.*/RECEIPT.md`; frames `.devshots/fleet/accept06/swarm-r10/r10-1-mid1.png`
(the wedge), `swarm-r5/r5-2-mid2.png`, `swarm-r4/r4-0-open.png`, `beats/beat-dock-1.png`, `beats/beat-claimed-3.png` (smoke).

1. **The wedge.** In Swarm round 10 a translucent golden triangle starts near the `FLYBY · Break the beam` marker and spreads
   across ~70% of the viewport, drawn over the arena and ships. It looks like the flyby event's beam (or another beam/cone
   volume) rendered as one huge flat wedge. Find the owner: grep `Break the beam` / the flyby system
   (`src/systems/flybyFocus.js`, its render counterpart) and any beam/cone mesh in `src/render/**` (search
   `ConeGeometry`, `beam`, `sweep`, `searchlight`, the Nocturne spot `media`). Make it a modern light shaft: thin, with
   radial and length falloff (soft edges, additive, depth-tested, fades with distance), scaled to the real beam length —
   never a flat opaque-looking plane over the HUD-level view. Prove it with a frozen frame (look-bench or a staged
   `?swarmRound=10` boot) before/after.
2. **Explosion smoke.** LOOK-05C's lingering smoke (`2–3 billows, ~4–5 s`) now shows as huge opaque white faceted spheres
   that hide the Iron Maw boss and ships. Smoke must be lit, soft, dark-to-mid grey with low opacity, a size cap relative to
   the victim (no bigger than ~1.5× the fireball), dissolve over its life, and never fully occlude a boss (cap opacity where
   it overlaps the boss/player). Find the billow emitter (LOOK-05C commits `4183fa068b`…`c942a2d2e0`) and fix it.
Report GPU cost before/after (`scripts/fleet/looks/bloom-cost.mjs` or renderer.info at the same staged moment). Exact-path
commits; tests for touched files.
