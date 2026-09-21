# Drifter chase cycle 12

- Revision: `chase_form_v12`
- LOD0 SHA: `992b3e915df8a5eff675ac5fc6757101ea0856e6b36c8f96594e238c6620def5`
- Stills: Cycles CPU 24 samples, `play_chase` / `play_chase_abeam` / `play_chase_close` + clay. Valid whole-ship chase framing (`play_chase` shipW 13.1%; close 33.1%). Hitch stills from frozen `kestrel.glb`.
- Subagents: play_chase `bc-f961674a-7a2f-5fde-b505-6894bec1ac3b` REVISE; abeam `bc-a2fc1c23-d31f-5550-8266-988af0aa3fea` REVISE; close `bc-22df6410-22a0-5e1d-a4d3-b13c13a7e123` REVISE
- Kept: wells as boolean holes (close still: crates/winch/liner in the mouth), greenhouse framed hole, no teal beam rail, brown 0.1%. Light>=0.28 is 2.2% on `play_chase` (Hitch 5.0%). Mid 73.2%. No black dorsal bars.
- Targeted C11 leftovers: gray-plate skin (chase-scale dorsal panel bays well-lip to chine, mixed deck/armor courses) and kite/paddle sponsons (constant-chord short sponsons off the hull beam, not a mid-body diamond). Reviewers still read gray tube with plates and paddle/box sponsons vs Hitch formed shell.
- Hitch freeze LOD0 `e8317c66…`. Hornet freeze LOD0 `0f81dce8…`.
- RESULT: REVISE. Hitch still wins formed-shell / skin at D=144. Hitch-plus chase NOT closed. Parent unproven / not G7.
