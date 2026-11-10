# Ranger chase cycle 2

- Revision: `chase_form_v2b`
- LOD0 SHA: `865c80271ede9e47ea007dabc518127b29292267cfe5b0c45473edbf989af33b`
- Stills: Cycles CPU 24 samples, `play_chase` / `play_chase_abeam` / `play_chase_close` + clay. Valid whole-ship chase framing (`play_chase` shipW 13.1%, close 32.4%). Hitch stills from frozen `kestrel.glb`.
- This is the chase camera; I can see the whole planform; the ship is not a close-up. (abeam is length-on: width 4.1% / height 20.3%; reviewers VALID.)
- Reviews: written adversarial reviews vs Hitch (no cloud subagents on this box). All three VALID / REVISE / HITCH_WINS YES.
- Kept from C1: wells as boolean mouths; no seats; no megatex; clay all-slot; Hitch/Kestrel/Hornet/Drifter frozen.
- Tactic: kill C1 tube/paddle + cage — mid≠bow loft, thick-root wings, shallow crown/flank scores (four, not wrapping rings), deeper greenhouse/survey holes, formed survey pylon.
- **Gates (clay + shaded, all three cameras):** CAGE_READ **NO** (continuous plated shell). TUBE_PADDLE **YES** leftover — forward taper still reads needle at D=144 vs Hitch’s chunkier formed shell (chase aspect ~3.7 vs Hitch ~2.3). Wells **HOLES**.
- Leftovers for C3 (do not start garnish): thicken forward third / shorten needle read; grow wing planform from shell so tips never read as card fins at chase size; Hitch skin density still wins.
- Hitch freeze LOD0 `e8317c66…`. Hornet freeze LOD0 `0f81dce8…`. Drifter freeze LOD0 `3278b8ed…`.
- RESULT: **REVISE**. Hitch-plus chase not closed. Parent unproven / not G7.

## Review — play_chase (VALID / REVISE)

- Framing VALID; whole planform readable; shipW ~13%.
- CAGE_READ NO: one continuous lofted/plated shell; no wrapping-ring cage.
- TUBE_PADDLE YES: forward third still spikes to a needle against Hitch’s formed bow massing.
- Wells HOLES (greenhouse + survey mouths dark).
- Hitch wins formed-shell massing / skin density at D=144.
- HITCH_WINS YES. Verdict REVISE.

## Review — play_chase_abeam (VALID / REVISE)

- Framing VALID (length-on).
- CAGE_READ NO on clay and shaded.
- TUBE_PADDLE YES: spine/flank still reads as a long tube with thin wing stubs vs Hitch.
- Wells HOLES.
- HITCH_WINS YES. Verdict REVISE.

## Review — play_chase_close (VALID / REVISE)

- Framing VALID; shipW ~32%.
- CAGE_READ NO; plated courses read as one sheet.
- TUBE_PADDLE YES leftover on bow taper; mast reads as formed pylon (C1 stick mostly gone) but overall silhouette still loses to Hitch.
- Wells HOLES with lips.
- HITCH_WINS YES. Verdict REVISE.
