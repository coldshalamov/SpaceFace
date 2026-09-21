# Drifter chase cycle 16

- Revision: `chase_form_v16`
- LOD0 SHA: `e928017d155b20a2aaa303fec5fb2e40a4b55dd3ee6abb5b7fe11cc0097664ca`
- Stills: Cycles CPU 24 samples, `play_chase` / `play_chase_abeam` / `play_chase_close` + clay (including clay abeam). Valid whole-ship chase framing (`play_chase` shipW 13.2%; close 33.1%). Hitch stills from frozen `kestrel.glb`.
- Subagents: play_chase `bc-9ba5dc94-9b18-509c-b9fc-e0bfe206e15d` REVISE; abeam `bc-61320a73-43a5-5ec5-8aca-b0d4c24d1ee1` REVISE; close `bc-6f6024c6-dbe9-50e5-a956-1f4e926d9bfd` REVISE
- Kept: C14/C15 play+close TUBE_PADDLE NO; wells as boolean holes (close: rim, liner, winch, crate). Light>=0.28 is 4.7% on `play_chase` (Hitch same-script 8.5%). Mid 88.5%. Brown 0.0%. No seats. No megatex.
- Tactic: convex-diamond YZ (max beam at mid-height; no vertical slab); separate nacelle *body* lofts deleted; aft stations widened so drives are throats/collars in the primary shell. **Abeam TUBE_PADDLE is not gone** — independent review still called a dark longitudinal spine with lighter flanking volumes and a hard value/seam at the root on clay (shaded closer to one diamond; gate is clay AND shaded).
- Hitch freeze LOD0 `e8317c66…`. Hornet freeze LOD0 `0f81dce8…`.
- RESULT: REVISE. Hitch still wins formed-shell / skin at D=144. Hitch-plus chase NOT closed. Parent unproven / not G7.
