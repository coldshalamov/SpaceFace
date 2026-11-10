# Ranger chase cycle 3

- Revision: `chase_form_v3e`
- LOD0 SHA: `489f9affe0b27f9e0a8aa2dc30645ff722c8af3909f65917f4e7077cd9fe8e9d`
- Stills: Cycles CPU 24 samples, `play_chase` / `play_chase_abeam` / `play_chase_close` + clay. Valid whole-ship chase framing (same live camera / runtime scale to 30.96 WU; play shipW ~13%, close ~32%). Hitch stills from frozen `kestrel.glb`.
- This is the chase camera; I can see the whole planform; the ship is not a close-up. (abeam is length-on.)
- Reviews: written adversarial reviews vs Hitch (no cloud subagents on this box). All three VALID / REVISE / HITCH_WINS YES.
- Kept from C2: wells as boolean mouths; no seats; no megatex; clay all-slot; Hitch/Kestrel/Hornet/Drifter frozen; CAGE_READ NO.
- Tactic: kill C2 leftover TUBE_PADDLE — blunt forward third, grow planform in the continuous shell (dorsal-readable beam near crown), drop separate tip-fin paddles. Not garnish. Not more rings.
- **Gates (clay + shaded, all three cameras):** CAGE_READ **NO** (continuous plated shell). TUBE_PADDLE **YES** leftover — forward third still tapers to a needle at D=144 vs Hitch’s chunkier formed bow (authored aspect ~2.73 vs Hitch ~2.3; play silhouette still reads tube-first). Wells **HOLES**.
- Leftovers for C4 (do not start garnish): more bow mass / shorter needle read at chase size; Hitch skin density still wins.
- Hitch freeze LOD0 `e8317c66…`. Hornet freeze LOD0 `0f81dce8…`. Drifter freeze LOD0 `3278b8ed…`.
- RESULT: **REVISE**. Hitch-plus chase not closed. Parent unproven / not G7.

## Review — play_chase (VALID / REVISE)

- Framing VALID; whole planform readable; shipW ~13%.
- CAGE_READ NO: one continuous lofted/plated shell; no wrapping-ring cage.
- TUBE_PADDLE YES: forward third still spikes/tapers to a needle against Hitch’s formed bow massing. Mid planform is now in the shell (no card fins), but the chase silhouette is still tube-first.
- Wells HOLES (greenhouse + survey mouths dark).
- Hitch wins formed-shell massing / skin density at D=144.
- HITCH_WINS YES. Verdict REVISE.

## Review — play_chase_abeam (VALID / REVISE)

- Framing VALID (length-on).
- CAGE_READ NO on clay and shaded.
- TUBE_PADDLE YES: spine/flank still reads as a long tube vs Hitch’s chunkier sideboard. Separate tip paddles gone; leftover is the length-to-beam needle, not a bolted fin.
- Wells HOLES.
- HITCH_WINS YES. Verdict REVISE.

## Review — play_chase_close (VALID / REVISE)

- Framing VALID; shipW ~32%.
- CAGE_READ NO; plated courses read as one sheet. Close clay shows a flatter diamond planform than C2.
- TUBE_PADDLE YES leftover on bow taper vs Hitch; mid shell is formed, not garnish.
- Wells HOLES with lips.
- HITCH_WINS YES. Verdict REVISE.
