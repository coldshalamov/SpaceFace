<!-- LIFETIME: STABLE -->
# VFX technique standard

Governs every player-facing effect **and every world dressing that can be mistaken for one**:
thrusters, weapons, impacts, shields, mining, massline, explosions, debris, dust, gas, hazards,
pickups, nav lights, and the space you fly through.

The owner's standing direction, quoted because it is the acceptance bar and not a mood:

> whatever plan you come up with and however advanced it is, you should then ask yourself what 3x
> more attention to detail and advanced technique would produce, whatever quality all of these
> prompts would induce you to create, you should do 3x better than that instead

The reference target is `assets/concept/` thruster reference: thin, sharply-defined curling plasma
**sheets** in many shades of blue, bright along their folds, dark between them.

## 0. The failure this document exists to stop

Agents keep satisfying a visual brief by drawing a square, making it transparent, and blurring the
edges. The owner does not have to know the jargon to reject it: it looks like a Nintendo 64 glow
card or a cheap web-game CSS blob.

That cheat has a name. Use these terms when banning it:

| Owner words | Technique name | What the GPU is doing |
|---|---|---|
| Blurry square | Soft-particle billboard | A camera-facing quad with a radial-gradient alpha |
| Janky white squares | Point sprites | `GL_POINTS` / `THREE.Points` — hardware squares with a round falloff |
| Cheap transparent CSS | Additive glow card | Unlit additive blend, no lighting, no occlusion, no silhouette |
| Glowing see-through rock | Additive primitive | An untextured mesh that adds light instead of existing as matter |

The same trick looks acceptable in **one** place: distant background stars. They are small, bright,
and at sky depth, so the square never becomes an object you can fly past. That exception does not
travel. If the player can pass it, it is not a star.

This is also why the cheat is endemic. A task can say "add a meteor field / thruster / gas cloud /
pickup glow" and a blurry square meets the literal success criteria. The other option is to design
the thing. The square is the stand-in. It is not a first pass. It is a failed pass.

Live instances are listed in [`SOFT_CARD_INVENTORY.json`](./SOFT_CARD_INVENTORY.json). Adding a new
one, or copying one into a new file, is a failed task even if a screenshot exists.

## 1. Banned techniques

These are banned as the *primary construction or final art* of a player-facing effect or world
object. Each is listed with what it looks like on screen, so the ban can be applied without knowing
the jargon.

| # | Technique | What it looks like |
|---|---|---|
| B1 | Procedural noise (hash/value/Perlin/FBM) baked or sampled as the final FX art | grey-blue static; "shady smoke"; no readable shapes |
| B2 | Camera-facing soft-particle billboards — quads with radial alpha falloff | Super Mario clouds; cotton wool; puffs |
| B3 | UV-scrolled emissive cone or cylinder mesh | tiger-striped traffic cone; a solid shape pretending to be gas |
| B4 | Point sprites (`GL_POINTS`, `THREE.Points`) for sparks, embers, debris, dust, or any fly-through field | dots; confetti; pixel spray; a field of white squares |
| B5 | Untextured emissive primitives (sphere/cone/capsule/tetrahedron) as the object itself | glowing balls; see-through rocks |
| B6 | Gaussian-only cross-section (`exp(-r²)`) as the sole edge treatment | airbrushed; soft everywhere; no definition |
| B7 | Flat ribbons with no view-dependent term | plastic tape; party streamer |
| B8 | Output clamped at or below 1.0 with nothing left for bloom | flat sticker; no glow, no heat |
| B9 | Effect terminating at a mesh or UV boundary | hard cut-off; clipped tail |
| B10 | Visual state driven directly by an input with no attack/release envelope | popping; clipping instantly from small to big |
| B11 | Exhaust rigidly parented to the nozzle, rotating with the ship | plume reads as a solid object bolted on |
| B12 | Isotropic volumetric density integration used to portray sheets or filaments | soft smoke; cannot produce a crisp crease at any setting |
| B13 | Reusing the distant-star point-sprite at play scale | flying through a field of blurry white squares |
| B14 | One object serving as both a jet and a flight history | a horse's tail welded to the hull and dragged around |
| B15 | A history trail advected along the emitter's axis instead of recording where the emitter was | a full-length ribbon snapping into place behind a ship that has not moved |
| B16 | Deformation keyed only to state frozen at emission, so the form is constant in the emitter's frame | a still image being stretched and translated; nothing flows through it |
| B17 | Opacity used as an animation channel — fading an effect in and out with the input that drives it | a decal switching on; "shady glass"; cheap website translucency |

A banned technique may still appear as a *minor supporting term* — for example a soft radial falloff
modulating a ribbon's own opacity — but never as the thing that carries the effect's silhouette,
structure, or detail.

**The only exception to B2 / B4 / B13** is distant background stars (and a handful of sky flares
that sit in that same sky). They must remain tiny, at sky depth, and never occupy the flight path.
Planet impostors may stay as far-sky cards of an authored planet texture. Nothing else inherits
this exception: not debris, not dust motes, not gas clouds, not pickups, not nav lights, not
hazards, not thrusters, not explosions.

## 2. Required techniques

1. **Structure comes from geometry.** Swept ribbons or sheets built along advected streamlines, or
   authored / simulated meshes that occlude and catch light. The silhouette is real geometry, not
   an alpha gradient.
2. **Grazing-angle edge brightening.** A thin sheet is brilliant where the view catches its edge and
   nearly invisible face-on. This single term is the entire visual signature of the reference and is
   mandatory on every sheet or ribbon. Absence of it is what makes ribbons read as plastic tape.
3. **World-space aging.** Emitted material is left in the world and ages there. It does not follow
   the emitter's rotation. A *history* trail is stricter still: it may only occupy positions the
   emitter actually occupied, so it must record poses rather than advect anything (B15).
4. **A jet and its history are separate objects.** A steady jet is genuinely anchored to its emitter —
   a real nozzle's shock structure stands still relative to the bell — and is short: a couple of
   emitter lengths. History is long, cold, and lies on the flown path. Merging them forces the jet to
   be as long as the history window (B14).
5. **Something must flow through the effect.** Structure rides a travelling wave — a function of
   position *minus* time — plus a second slow term so it evolves rather than scrolling rigidly. An
   effect whose form is constant in the emitter's frame is a still image, however it is animated
   afterwards (B16).
6. **Transparency means "the material has thinned".** Alpha comes from dilution as a volume expands,
   from material running out at an edge, and from genuine dispersal over time. Visibility of a hot
   effect comes from its *temperature* instead: additive material at zero radiance is already
   invisible, so nothing needs fading out (B17).
7. **HDR with deliberate bloom headroom.** Cores exceed 1.0 on purpose, with a stated intent about
   what the bloom threshold will catch.
8. **Asymmetric attack/release on every state transition.** Spool-up, cool-down, and one-shot events
   each get an explicit envelope. Cooling is always slower than lighting up. What the envelope moves is
   the effect's *reach and heat*, not its opacity.
9. **Depth-aware soft intersection** where an effect can meet geometry.
10. **Detail from simulation or authored art.** Fine detail comes from a real source — a fluid
    simulation bake, or authored art — never from hash noise. See §3.
11. **Motion-vector interpolation** if a flipbook is used at all, so playback is not a slideshow.

Matter in the world (rocks, ice, debris, wreckage, cargo) is opaque, lit, and has a silhouette.
Glow is a property of a hot surface or a volume, not a substitute for the object.

## 3. Source art pipeline

Blender is the project's VFX authoring tool (installed, OSS, includes the Mantaflow gas solver).

Detail art for effects is produced by simulating in Blender and baking the result, not by generating
noise in JavaScript. See `tools/vfx/AGENTS.md` for the bake scripts and
`assets/fx/AGENTS.md` for the manifest contract.

Procedural generation remains legitimate for *fields that must be continuous and infinite* — a curl
field advecting ribbons, for instance. It is banned as the final visible art.

## 4. Verification

A technique claim is only closed by a capture at the real gameplay camera distance, compared against
the reference. Preview framings closer than the live chase camera do not count: tuning against a
closer camera than the game uses produced three consecutive rejected thruster passes.

`npm run check:vfx-techniques` keeps [`SOFT_CARD_INVENTORY.json`](./SOFT_CARD_INVENTORY.json) honest:
every live `THREE.Points` / `THREE.Sprite` / glow-card factory in the scanned trees must be listed,
and a new file cannot pick up the cheat without declaring it. Listing a new world-object as an
exception is itself a failure unless it is the star-sky allowlist. Eyes on a capture still decide
whether a replacement actually looks like the thing.
