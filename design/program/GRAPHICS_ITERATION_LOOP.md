<!-- LIFETIME: STABLE -->
# Graphics iteration loop — reference, chase stills, chunk, review

The operator loop for every model in the graphics campaign. It is the *how*.
The *what* is `CANONICAL_BUILD_MAP.md` §1 (campaign door → `PQ-050`), the one-ship
chunking / reference / hidden-face law is
[`FLYABLE_SHIP_WORKFLOW.md`](../../docs/visual-assets/FLYABLE_SHIP_WORKFLOW.md),
the technique law is
[`ADVANCED_MODEL_TECHNIQUE_CONTRACT.md`](../../docs/visual-assets/ADVANCED_MODEL_TECHNIQUE_CONTRACT.md),
and the review law is
[`MODEL_ADVERSARIAL_REVIEW_WORKFLOW.md`](../../docs/visual-assets/MODEL_ADVERSARIAL_REVIEW_WORKFLOW.md).
Where this file and those disagree, they win.

## Per model: reference first

1. Look for reference at `assets/ships/<family>/<ship>/reference/`. Hornet's is the shape to copy:
   construction images plus `REFERENCE_PROVENANCE.md` saying where each came from.
2. **If there is no reference image for the thing you are about to build, generate one before you
   model.** Use the image-generation tool available in the session. Generate the *specific*
   construction you need as the **chase camera will see it** — "wing planform from 60° above",
   "engine throats as dark wells from behind-above", "canopy as a framed dark rectangle at play
   size" — not a whole-ship beauty shot and **not a cockpit interior**. The Hornet loop burned
   cycles on seats nobody can see from the bird’s-eye chase.
3. Save it into that `reference/` folder and add a `REFERENCE_PROVENANCE.md` row: what it shows,
   what generated it, and what it is being used to decide. Generated reference is a construction
   aid, never evidence of quality and never a target to copy pixel-for-pixel.

## Then loop on the current chunk

One pass = **one complete attempt to finish the current chunk** of this ship
(skin / wells / separate parts / surfaces — see `FLYABLE_SHIP_WORKFLOW.md`),
judged on chase stills. Do not treat the MTX list as the work unit.

1. **Build.** Implement every mandatory technique row for the class as if this export ships tonight.
2. **Export and capture the three chase stills** from the exported file of this pass's hash,
   using `tools/blender/spaceface_chase_camera.py`: `play_chase` (D=144), `play_chase_abeam`,
   `play_chase_close` (D=58). Same 60° tilt and 50° vertical FOV as the live game.
   - The ship at default chase is ~10–16% of frame width, not a hero filling the frame.
   - If the ship fills most of the image, or the camera is inside the hull, **that pass did not
     happen**. Studio three-quarter / starboard / rear / bay_interior do not count.
3. **Review the exported hash at play size.** Use up to three independent reviewers when the
   current defects are genuinely ambiguous or cross-angle. One strong reviewer may cover all three
   chase views when the defect is obvious. Give reviewers the prompt in
   `MODEL_ADVERSARIAL_REVIEW_WORKFLOW.md` §4 and require concrete Blender actions, not adjectives.
   "Better than last pass" is explicitly not the bar.
4. **Implement every real revise item** that is visible at shipping scale, plus anything you can see
   that the reviewer missed. Do not spend a pass on detail the 144 WU view cannot resolve.
5. **Record the pass**: hash, still paths, causal defects, what changed, and whether the player's
   read materially improved.
6. Repeat only while the next pass has a named, player-visible defect to remove.

### Marginal-value stopping law

**Iteration count is not a quality gate.** The old fixed seven-pass rule was a throughput bug: it
rewarded process volume and could spend days polishing an asset whose remaining differences were
invisible from the shipping camera.

- Expect roughly **three meaningful chase-camera passes** for an ordinary asset, but this is a sizing
  heuristic, not a minimum or maximum.
- Stop early when the exported hash meets the mandatory technique contract, no P0/P1 play-size defect
  remains, and another pass has no named visible target.
- Continue past three when a concrete silhouette, aperture, material, socket, identity, or integration
  defect remains visible at shipping scale.
- If **two consecutive valid passes do not change the review disposition or remove a named play-size
  defect**, stop that causal model. Return the asset to the Central Brain quality ranking or rebuild
  from a different premise instead of adding ornamental detail.
- An asset never promotes merely because a pass count was reached. A broken L0/L1 asset elsewhere on
  the same route outranks L3 micro-detail on an already coherent asset unless the former has a real
  external blocker.

## What makes a pass not count

Moving the camera. A crop or thumbnail. A seat or cabin kit. "I reviewed it" with no defect record.
Implementing two rows and calling it a pass. Splitting one plan across several passes. Reusing an
older hash's stills. Capturing studio beauty cameras instead of the chase camera. Making changes that
cannot be distinguished at shipping scale.

## Rules paid for in failed passes

- **The player camera is the only close camera.** Hornet spent a long loop on seats, consoles, and
  walkable interiors. None of that reads in the 60° / 144 WU chase. Capture with
  `spaceface_chase_camera.py`. MTX-04 is a dark well at play size, not furniture.

- **Numbers are a floor, never a pass.** A gate of measurable targets caught a rod, a cage and a
  capped drive that 52 passes of opinion had missed — and the next pass hit almost every number and
  produced a worse ship, because each target was met by the cheapest shape that satisfied it. No
  pass promotes on numbers alone if a reviewer's plain read of the play-size frame got worse. See
  `roadmap/active/PQ-050.md` § the gate rule.
- **A form change moves the mount points.** Sockets do not render, so no still can catch them.
  After any change to hull length or height, re-check every `SOCKET_*` against the exported
  `COLLISION_HULL_MESH` bounds. A gun once sat 1.45 units in front of its own nose through a full
  three-reviewer pass.
- **Verify the builder with `compile()`, not `ast.parse()`.** The latter misses whole error classes
  and will let a broken build run for minutes.
- **Texture size ladders per LOD.** `create_materials()` shared across LODs inflates all three at
  once. LOD0 above 1024 produces source files GitHub rejects at fleet scale.
- **If the render step crashes, check the machine before the build.** Rebuild at the last settings
  that worked. Exports survive these crashes; only the stills are lost.

## Measure, do not argue

- `node scripts/measure-ship-still.mjs <still.png> [--region=x,y,r]` — silhouette, daylight enclosed
  by the hull, value distribution, and whether an aperture is darker than its casing.
- `node scripts/measure-hull-shell-closure.mjs <file.glb>` — boundary edges and how many
  disconnected pieces a hull is.

Both carry calibration notes in their headers. Read them: one of them reports the ship we are trying
to beat as four times more fragmented than the one we are fixing, so its numbers only mean anything
as a before/after on the same model.

## Finishing

Commit each meaningful pass. Never wire a model that still loses to the reference bar. Report `DONE`
or `NOT DONE` in plain language, the play-size defects removed, and the evidence hash. Do not report
iteration volume as evidence of quality.
