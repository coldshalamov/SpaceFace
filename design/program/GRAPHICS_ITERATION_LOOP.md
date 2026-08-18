<!-- LIFETIME: STABLE -->
# Graphics iteration loop — reference, build, three angles, subagent, repeat ×7

The operator loop for every model in the graphics campaign. It is the *how*.
The *what* is `CANONICAL_BUILD_MAP.md` §1 (campaign door → `PQ-050`), the technique law is
[`ADVANCED_MODEL_TECHNIQUE_CONTRACT.md`](../../docs/visual-assets/ADVANCED_MODEL_TECHNIQUE_CONTRACT.md),
and the review law is
[`MODEL_ADVERSARIAL_REVIEW_WORKFLOW.md`](../../docs/visual-assets/MODEL_ADVERSARIAL_REVIEW_WORKFLOW.md).
Where this file and those disagree, they win.

## Per model: reference first

1. Look for reference at `assets/ships/<family>/<ship>/reference/`. Hornet's is the shape to copy:
   construction images plus `REFERENCE_PROVENANCE.md` saying where each came from.
2. **If there is no reference image for the thing you are about to build, generate one before you
   model.** Use the image-generation tool available in the session. Generate the *specific*
   construction you need — "wing root fairing into a fuselage", "engine bell with vanes and a
   flange", "canopy tub with rim thickness and interior" — not a whole-ship beauty shot, which
   tells you nothing about how a part is made.
3. Save it into that `reference/` folder and add a `REFERENCE_PROVENANCE.md` row: what it shows,
   what generated it, and what it is being used to decide. Generated reference is a construction
   aid, never evidence of quality and never a target to copy pixel-for-pixel.

## Then loop, seven times per model

One pass = **one complete attempt to finish the ship**, not one slice of the technique list.

1. **Build.** Implement every mandatory technique row for the class as if this export ships tonight.
2. **Export and capture three angles** — three-quarter, starboard, rear — from the exported file of
   this pass's hash.
   - **Every angle must show the whole model:** bow, stern, both extremities of span, top, keel,
     with roughly 8–15% margin. If any extremity is out of frame, or the model fills less than
     about a third of it, **zoom out and recapture**. A zoomed grey crop is not a capture and a pass
     that only has crops did not happen.
3. **Review with three subagents, one per angle.** Give each the image path and the prompt in
   `MODEL_ADVERSARIAL_REVIEW_WORKFLOW.md` §4. Require: every obvious defect a player would notice,
   the technique rows failing in that angle, concrete Blender actions rather than adjectives, and a
   verdict of KEEP / REVISE / REVERT. Tell them "better than last pass" is explicitly not the bar.
4. **Implement every real revise item**, plus anything you can see that they missed.
5. **Record the pass**: hash, still paths, what the reviewers said, what you changed.
6. Repeat. **Seven passes per model**, then move to the next model.

Stop before seven only if all three subagents return KEEP on the same hash, the clay is not
primitives, and every mandatory row is implemented. Keep going past seven if it still loses.

## What makes a pass not count

Moving the camera. A crop or thumbnail. "I reviewed it" with no subagent text. Implementing two
rows and calling it a pass. Splitting one plan across several passes. Reusing an older hash's
stills.

## Rules paid for in failed passes

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

Commit each pass. Never wire a model that still loses to the reference bar. Report `DONE` or
`NOT DONE` in plain language, and say which passes were run.
