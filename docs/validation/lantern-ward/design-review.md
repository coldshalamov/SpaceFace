# Lantern Ward — independent spatial review

**Gate:** G1, before production. **Reviewer:** `taste_reviewer`, independent of runtime and art authors.
**Source inspected:** `fcc4491ac44162e5e73b5a062ccc37622fe7b9d4`, 4 November 2026.
**Verdict:** select the **open-throat asymmetric crescent**, subject to the measured collision and
normal-camera checks below. This is design admission, not acceptance of an implemented scene.

## Existing things the composition must respect

The source contains the living-world specification but no Lantern Ward/Nessa/Empty Plinth runtime
at this base. The memorial and its other uses already exist. Do not replace them.

| Existing fact | Consequence for this design |
| --- | --- |
| `poi_memorial` at `(1680,-820)`; `placeTargetRadius=100` | Treat the authored landmark as a roughly 200 WU envelope until its exact geometry is measured. Its `visualRadius=28` does not license building through the mesh. |
| `station_helios` at `(1280,-420)`; starter claim `(720,-260)` | The public southwest approach must stay open. Preserve the first-session claim and station operations. |
| Pit Line `(2450,-1600)`; smear pin `(2027,-1171)` | Preserve the northeast memorial bearing and its procession. Do not build a picturesque wall across it. |
| Existing sample pod `(1800,-820)` and memorial tourist | Keep the cache, its thief/rope interactions and tourist independently reachable. A new lamp must be visually and causally separate. |
| Vesper starts at `(720,250)` | The district must not move Vesper to satisfy a new scene description. Any audible overlap is opportunistic, not a new duplicate. |
| Hitch collision radius 14; source describes drawn hull length about 26.5 WU | A decorative 28 WU opening is not a tow lane. Derive loaded swept width from the admitted bodies and couplings. |
| `tabletopPolicy.js`: default glass about 170×100 WU, default zoom 144, manual maximum 330 | The whole district cannot be accepted from one 600 WU beauty shot. The crucial work triangle must read at default framing; the crescent reveals itself during a short continuous flight. |

References: `src/data/sectorAnchors.js`, `sectorZones.js`, `worldOneOffs.js`, `ships.js`, `vesper.js`,
`src/render/tabletopPolicy.js`, `src/systems/traffic.js`, and the living-world story/assets/catalog.

## Three competing footprints

All dimensions here are proposed design envelopes, not measurements of shipping geometry. `S`
means the maximum swept width of the admitted craft and its load, including rotation. The initial
Hitch-only reference is 28 WU; a loaded tug can require more. Clear widths are measured between
actual colliders, not between marker centers.

| Rank / composition | Playable footprint and silhouette | Camera and physical usefulness | Rejection condition |
| --- | --- | --- | --- |
| **1. Open service throat crescent** | An uneven inhabited arc roughly 400–500 WU across surrounds the 200 WU memorial envelope, opened toward the station/freight approach. A short low public rim connects Apron → cut → family receiver; White Side is an ordered outer flank. Northeast keeps a second gap for the old Pit bearing. | One 120–170 WU work pocket exposes the interrupted load, tool and receiving bracket together. A broad southwest throat admits beginners; the outside bypass lets an awkward tow retreat. The missing span and projecting work arm give the town a recognizable outline across successive frames. | Reject if a ring of separate assets replaces the connected spine, if the loaded route crosses the memorial, or if the only exit is the obstruction itself. |
| **2. Broken horseshoe / central memorial opening** | Two unequal inhabited arms around a 200–240 WU central memorial court; total footprint about 440×380 WU. Main throat southwest, second opening northeast. Receiver sits on one arm end. | Strong framed glimpses of the Fleet. Two passages permit recovery, but equal arms and gates make the work invitation less legible. At default framing the opposite arm is usually absent; the player can mistake the court for a generic ring station. | Reject as the primary slice if arms imply a route through the memorial's body, if both entrances look equally important, or if framing consumes the action triangle's clearance. Useful later as background asymmetry, not the core route. |
| **3. Asymmetric stacked-berth ribbon** | A 480–600 WU diagonal working rim, 120–180 WU deep, with repair pocket compressed to one side. Apparent stacking comes from attached visual relief only; no overlapping flight floors. | Excellent source-to-receiver direction and traffic queue readability, weak sense of a harbor around the memorial. At default framing it becomes a procession of unrelated stations. A long narrow strip promotes head-on jams and hides retreat behind the player. | **Reject for this commission.** It spends the one-shot budget on a corridor, risks fake vertical navigation, and makes the memorial an incidental backdrop. A short ribbon is suitable inside the selected crescent's Apron. |

## Selected work pocket and route reservations

Recommended sector-local positions, shared with the lead and environment author before production:

| Element | Position / constraint |
| --- | --- |
| Apron observation pocket | `(1710,-570)`; an unblocked public place to brake and watch. |
| Cradle / original lamp source seat | `(1710,-650)`; load and empty cradle have distinct silhouettes. |
| Service cut | Center `(1775,-650)`, 76–84 WU clear before the movable obstruction. A concrete 84 WU proposal uses support centers `(1775,-704)` and `(1775,-596)`, each with halfwidth no more than 12 WU. |
| Family receiver | `(1830,-695)`; 186 WU from memorial center and about 128 WU from the existing sample pod. Its socket must be conspicuously different from the memorial's dark plinth. |
| Tender installation stand | Around `(1800,-665)`, finalized from the actual service arm reach and hull envelope. Work tools must contact the receiver, not wave through a sphere. |
| Local work extent | Source → receiver is 120×45 WU before body margins. Keep the observation and installation states readable in a normal close view. |
| Turning court | At least 112 WU clear diameter for initial 28 WU reference, increased if the loaded swept envelope requires it. Do not place furniture in the sweep. |
| Public freight throat | At least 180 WU clear for the initial admitted craft; 6–8 S governs after measurement. The throat is the obvious broad entrance, not a timed door. |
| Outside bypass and retreat | A visibly continuous southern route around `z≈-500`; this is the safe way out while the short cut is blocked. It must have a real destination and cannot cut through station geometry. |
| Memorial reserve | Keep new solids outside a provisional 125 WU radius; preserve the original assets, actors and interactions. Confirm their actual swept envelopes before placement. |
| Pit route reserve | Keep at least 65 WU swept halfwidth around the existing northeast bearing; increase where the original procession needs it. White Side may flank this corridor but must not cap it. |

The obstruction should prevent the **loaded operation**, while the whole neighborhood stays
traversable. A pilot may push it with a hull, pull it with a Massline, or move it with another real
force. All should change the same clearance predicate. A trigger circle that says “blocked” after
the object has physically moved out of the gap is a rejected implementation.

The 26×16 WU proposed mobile cradle is roughly a small utility craft, with open prongs, one clear
goods seat, tow lugs and an offset articulated brace. Its socket envelope and collisions must be
measured independently of the decorative outline. Habitat modules should retain plausible human
scale and form clusters joined by spines; inflating individual 12 WU habitats to station size is
not environmental authorship. A worker can be 1.8–2.5 WU and remain readable through a grouped
brace/tool silhouette and the working light. It should not be enlarged into a pilot-sized mascot.

## Two work-pacing concepts

**A — Blockage first, slower ordinary recovery: selected.** Arrive during an intelligible failed
turn: loaded tender waits, commuter yields, the third worker continues a different useful task.
The stationary load and working cradle show what matters before Nessa speaks. The player can clear
the cut, carry the same payload by the bypass, or brace the attended installation. Ignoring the
operation leaves it real; after the existing watch/schedule delay the legitimate crew can take the
longer usable route. It cannot delete the obstacle or conjure a lost lamp. The resulting route and
work history distinguish “I helped” from “they managed without me.”

**B — Lamp handoff first, procession deadline: rejected as primary pacing.** A visible pickup and
handoff is lively, but asking a new arrival to infer an exact object and a deadline while everything
is moving hides the causal problem. It readily becomes a timer escort with a failure banner.
Retain its strengths as the completed operation's departure and next-watch ambient routine; do not
make a countdown the service truth or erase a family for being late.

Do not pad six to twelve minutes with mandatory waiting. Duration comes from approach, inspection,
physical manipulation, attended work and return. A highly competent or inventive pilot may finish
faster. The quiet after the repair belongs to the scene: one concise household response, changed
light, unloaded tender departure, and the next commuter continuing its day.

## Later independent review must still reject material failures

- Normal camera cannot identify both the lamp and the receiving face, or only a label explains them.
- The cradle moves decoratively while physical contacts use another body or silhouette.
- A commuter “yields” on a fixed timer unrelated to actual route occupancy.
- The maintenance worker touches nothing, or cargo vanishes without a custody transition.
- The crew moves a payload while the player owns its cradle, or resumes through a newly blocked route.
- Leaving, malformed saves, recycled entity IDs or duplicate bus receipts recreate a finite lamp,
  erase damage, reattach wrong cargo or pay twice.
- The original twenty-fifth memorial plinth lights, even as a convenient success effect.
- A beauty capture or headless invariant is reported as ordinary-route/native-device acceptance.

No runtime, mission, economy, physics, camera, shared controller or model files were changed by this
review. The verdict admits a composition and testable constraints; G4 and G6 remain independent
checks of the actual built scene.
