# GROK-BUILD20 effects rows

Picture fixes for rows 131, 132, 133, 134, 193, and the silhouette half of 255. No commit.

Voice files were not edited. Draft-offer cards were not edited, so the four emergent weapons are still not shop rows. FIGHT-08 mine order was already true and was left as it is.

## What changed

- A solid hull hit is a slam. The contact seat can draw and still does not skip the class or the scar. An ordinary bump reads dp or impulse. A damaging consequence reads exchangedMomentum, which is that same momentum. A graze stays below 0.22. A breakup stays at 0.8 and above.
- A kill streak is drawn only after that wreck id is already in the entity book. The offer waits for the book, then again on the next draw. No wreck means no streak.
- A Massline cut is the cable's tangent: one segment in the play plane. Reduced motion keeps that segment dim. It is not a camera-facing flash.
- A ricochet draws a second path only when `ricochetSecondPath` says yes. Past 256 shots, stopped shots are deleted. Live trails stay.
- A second bomb in the same place drops the extra flash. The detonation itself still plays.
- Undock, jettison, plunge, recovery burn, collector, and a refused harvest are drawn by the cause-mark layer from the silhouette table (`causeSilhouetteSegments`). Those six shapes are different polylines in the play plane. The ActionVfx verb stroke is a generic primitive and is not the authored silhouette. Station-arm entries in that table are not the arm picture; the arm draw still uses the machinery hold. The light-director file is still not called by the live effects, and this pass did not claim it.

## Commands

`node --test test/effects-cause-rows.test.mjs test/fight-08-mine-snap.test.mjs test/mine-triggered-snap.test.mjs test/combat-vfx-presentation-contract.test.mjs test/massline-presentation-uvp.test.mjs test/vfx-force-language.test.mjs test/impact-event-grammar.test.mjs`

71 pass, 0 fail.

The ribbon-pool wake-upload failure in `test/weapon-source-identity.test.mjs` was not re-run and was not chased.
