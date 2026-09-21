# Drifter chase cycle 17

- Revision: `chase_form_v17`
- LOD0 SHA: `0cc9f942670172e2ce74d99cfb3f3d61283f970b80694185c99530d8e6d4bff5`
- Stills: Cycles CPU 24 samples, `play_chase` / `play_chase_abeam` / `play_chase_close` + clay (including clay abeam). Valid whole-ship chase framing (`play_chase` shipW 13.2%; close 33.1%). Hitch stills from frozen `kestrel.glb`.
- Subagents: play_chase `bc-ec07df2a-a635-58cb-aae9-b59eb0fe8664` REVISE; abeam `bc-9e6caf1d-524f-532e-9357-1ef7546489e9` REVISE; close `bc-b519a806-77f0-5dca-b569-cea761736f77` REVISE
- Kept: C14–C16 play+close TUBE_PADDLE NO; C16 single-diamond hull (no separate nacelle bodies); wells as boolean holes. Light>=0.28 is 4.8% on `play_chase` (Hitch same-script 8.3%). Mid 88.9%. Brown 0.0%. No seats. No megatex.
- Diagnosis: C16 clay abeam leftover was **material/override**, not a new YZ crease. `apply_clay` only replaced slot 0; Deck-on-crown (slot 2) and Armor (slot 1) kept authored albedo → dark spine + lighter flanks. C17 overrides every slot and paints the outer diamond one Hull value.
- **Abeam TUBE_PADDLE is gone on clay and shaded** (independent review). Remaining gap is Hitch formed-shell / skin at D=144.
- Hitch freeze LOD0 `e8317c66…`. Hornet freeze LOD0 `0f81dce8…`.
- RESULT: REVISE. Hitch still wins formed-shell / skin at D=144. Hitch-plus chase NOT closed. Parent unproven / not G7.
