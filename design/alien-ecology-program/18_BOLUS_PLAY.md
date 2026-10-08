# 18 — The Bolus plays

Status: implemented on top of doc 16 and doc 17. This pass does not add a verb the cut rejected.

The throat is one sentence. The lane is the refusal. The tooth is the lie. The iris is the clock. The cough is the period. Light steers. It does not also cure. The berth is the only dry room. Contamination changes what follows you. It does not pause under the flashlight.

Research that survived the gate: Outer Wilds (a clock you can miss, then hit, with no subtitle), Inside (light, mass, and a chase explaining each other), Annihilation (the zone leaves in you and never shows a god), a Spelunky tell, a Metroid melt, Death Stranding's one shelter, a Mario Kart draft, Journey's end light. A hostile pass cut the thirty-one "readable" beats, because thirty-one captions make none of them readable.

## Cut on purpose

Not in this set, and not a hole if they are absent:

- Plaque toasts, baleen lectures, acid toasts, "it will follow you."
- Light as a carried cure. The nose cone does not pause contamination.
- A bug bolt when a louse leaves the cone. Light only pins.
- Drums waking because the tooth bit. That is a second cause.
- Stitches that soften the tooth. Two valves are a hook, not a cushion.
- A tendril whip, a knob kick, or any second launcher stacked on the crest.
- A delayed tooth. The reach test is the bite. The tell is a same-tick cue.
- A second grapple, a boss, a face, a skill tree, a new commodity, an oxygen clock, wall gravity, a camera punch.

## The thirty

1. Overload slips the tooth. No +X. Cue `bolus_slip`. Loaded still yanks +160, or +80 if the papilla soured it. Cue `bolus_tooth` on the bite tick only.
2. Open iris, speed above 18, |z − 400| < 40, |x| < 200, once per 20s cycle: +24 Z before the last second, +12 Z on the last second. Cue `bolus_thread`. A ship sitting still at t = 3 does not move.
3. Cue `bolus_breath` on the rising edge of the open iris. No toast.
4. The crest is 46 Z in the gutter and 56 Z in the lane (x in [−1100, −820]). At x = 0 it stays 46. Cue stays `bolus_crest`.
5. One exit shove. In the lane and z ≥ 1173, if this visit was not baleen-tolled and the spit is unpaid: +40 Z, set `bolus:coughPaid` and `bolus:coughCracked`, cue `bolus_cough`.
6. The baleen sets `bolus:baleenTolled` and cues `bolus_baleen`. Cleared when a visit begins. The cracked lip is not cleared.
7. Leaving the sector clears `bolus:inVolume`. The first tick back clears the toll and the unpaid spit, and keeps the crack.
8. Letting go of a knob, tendril, valve, or suture sets `bolus:swingUntil` for 0.8s. Cilia does not rewrite vz during that window. No extra impulse.
9. Passing within 80 of a lantern sets `bolus:gallUntil` for 2s. Cue `bolus_gall` once per lantern. While the gall holds, acid damage is 0.
10. Entering the acid, or the bite returning when gall drops, cues `bolus_acid` once per entry. No toast.
11. Within 120 of the berth {−980, −900}, exposure does not climb. The cone does not shelter.
12. Exposure ≥ 0.25: floater lissajous runs at half scale.
13. Exposure ≥ 0.35 and the floater itself is in the lane: its vz matches the ship. It falls into the wake. No toast.
14. A floater within 50 while the ship is under limp speed adds 0.02 exposure, once per sac.
15. Holding a fingerling makes the others mill at radius 12 instead of 30.
16. Boosting within 220 of any fingerling scatters every fingerling within 400 of the nursery. Hold huddles. Boost scatters. Not four panics.
17. A drum inside the nose cone is pinned at speed 0 even if the ship has been fast. Light pins. It does not bolt.
18. Cutting thrust after a 2s chase sets `bolus:drumSlideUntil` for 0.8s. During the slide, a drum that is not pinned and not spurred keeps its last vector instead of snapping to the wander.
19. The tooth does not wake drums. Bugs do not bolt out of the cone. Sutures do not soften the tooth.
20. Holding a valve or a suture suppresses that tick's crest and still advances the peristalsis mark, so the crest cannot stick the else-if chain and block cilia forever.
21. A valve commits on `bolus_stitch`. A bezoar, cyst, or concretion commits on `bolus_grit`. The pleat commits on `bolus_pleat` and still writes vz = 64. Everything else still latches.
22. The existing mite contact also sets `bolus:miteFleeUntil` for 4s. Mites drive away at 36 unless the cone pins them. The flee is the contact, not the toast.
23. A rib within 100 of the cough anchor stops once and sets `bolus:ribLodged`. No toast.
24. `bolusIrisShutter` is 1 on [2, 7), 0.35 on [7, 8), and 0 otherwise. Blade slide uses it. `bolusIrisOpenAmount` stays 0 / 1 / 0 at t = 0 / 3 / 8.
25. `bolusCoughGap` is 0 or 48. A cracked cough pushes the crease and the lip apart. The mouth z and the gate centers do not move.
26. New cues live in the existing recipe list: tooth, slip, breath, thread, grit, stitch, pleat, baleen, gall, acid, cough. No new wav, no new bus, no toast for these.
27. Predicates live in `src/data/bolusPlay.js`. The tick calls them. Headless tests can hit them without Three.
28. The unlatched lane still climbs on cilia alone, still takes no acid, still gains no X. Extra Z from the lane crest and the final spit is allowed.
29. Visit reset never clears `bolus:coughCracked`.
30. The berth is the only exposure shelter. Gall only skins the acid. Neither one is a second light.

## What "done" means

A further idea is a new design pass if it needs a new input, a new commodity, a second clock, a caption, or a force that changes a locked velocity in `test/bolus-cut.test.mjs`. Inside this set, the work is the motion and the cue.
