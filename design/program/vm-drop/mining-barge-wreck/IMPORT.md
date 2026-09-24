# Mining-barge wreck — outbox import

## What this is

`wreck_mining_barge.glb` is the **mining-barge** hero wreck that
`assets/incubator/wreck_aftermath_pack/INTEGRATION.md` names and does not contain
(fiction `design/fiction/THE_LONG_AFTERMATH.md` §5). Freighter-variant grammar: boom
root sheared; the cutter head is the heavy thing that stayed. Ore-bin rhythm and
starboard working-face asymmetry carry class identity after dismemberment. The hull
is a ring with an amidships fly-through bay measured at **47.76 m**
clear span (required ≥ 40 m).

Authored envelope (meters): **146.766 × 63.0 × 31.537 m** (L × W × H).
Triangles: 2160. State ladder rung: `cooling`.
Blender `4.5.14 LTS`.

Three chase stills (`play_chase.png`, `play_chase_abeam.png`, `play_chase_close.png`)
were shot with in-folder `spaceface_chase_camera.py` pose math. Distances were scaled
×9.17 so a 146.766 m hero wreck sits near the play occupancy
band (base D=144 / D=58); camera `clip_end` raised for the scaled ranges.

SHA-256:
- GLB `acc90275cc696f44b738f256a31f27700e7a61d3f950cd9c4c0f64b33fa4442c`
- `play_chase` `11698a1ab4293d12864104ccb2d331c2c8dae0178dd7b61911a94965a00ffaf0`
- `play_chase_abeam` `dba8967ed9e146bb81ffea12923cf7dc5fc94b3b61fb99b827667275631d7f22`
- `play_chase_close` `4bd151c48abb29393fe89845d4d7b2fc40b6aae69cc361503390199c49e1d668`

Rebuild:

```sh
blender --background --python design/program/vm-drop/mining-barge-wreck/build_mining_barge_wreck.py -- \
  --out-dir design/program/vm-drop/mining-barge-wreck --state cooling
blender --background --python design/program/vm-drop/mining-barge-wreck/render_mining_barge_chase.py -- \
  --glb design/program/vm-drop/mining-barge-wreck/wreck_mining_barge.glb \
  --out design/program/vm-drop/mining-barge-wreck --samples 24
```

## Exact future live paths

Only if a later owner-side promotion accepts this outbox into the aftermath ecology:

| Outbox file | Authoring destination (owner decides) |
|---|---|
| `wreck_mining_barge.glb` | `assets/incubator/wreck_aftermath_pack/source/wreck_mining_barge.glb` (and authored_down mirror) |
| chase stills | evidence / review only — not runtime |

Material roles already reserve barge-rust paint in the pack palette. No wreck-class /
spawn / landmark row is proposed here.

## What is not wired / freeze notes

Nothing is wired. `assets/incubator/wreck_aftermath_pack/` was **read only**. No edit to
`src/`, `NOW.md`, `VM_LANES.md`, live GLBs, manifests, shared builders, or release trees.
Survey-ship and smuggler/carrier hulls remain unbuilt (fiction §5).
