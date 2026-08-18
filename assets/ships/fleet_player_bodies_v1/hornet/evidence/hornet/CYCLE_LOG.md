# Hornet cycle log

| Cycle | Counted | lod0 hash prefix | Verdicts | Notes |
|---|---|---|---|---|
| 01 | yes | 6B0422BA | REVISE/REVISE/REVISE | loft+boxes |
| 02 | no | 4BBE1134 | REVISE/INVALID_FRAMING/REVISE | drive cropped |
| 03 | yes | ADAF719F | REVISE | darker hull |
| 04 | no | ADAF719F | REVISE/REVISE/REVISE | camera only |
| 05 | yes | see json | REVISE | unique maps + holes |
| 06 | yes | see json | REVISE | stripe gone |
| 07 | yes | CEDBCA7A | REVISE | sloped greenhouse |
| 08 | yes | 264B7355 | REVISE/REVISE/REVISE | drive house + hollow bell |
| 09 | yes | 5D2B80C4 | REVISE | house bands |
| 10 | yes | 14B05415 | REVISE | chine caps. Ten-cycle cap |
| 11 | yes | 49BBA617 | REVISE/REVISE/REVISE | first form rebuild. Bell flares. Still crate/cards/boom |
| 12 | yes | see json | REVISE/REVISE/REJECT | fat house + thicker wing. Crate canopy remains |
| 13 | yes | 0BEC01D7 | REJECT/REJECT/REJECT | crate gone. Still below Hitch. Not wired |
| 14 | yes | see json | REJECT/REJECT/REJECT | flared bell + vanes. Waffle throat. Hitch wins |
| 26–31 | yes | see json | REVISE | form rewrite: folded needle, airfoil wings, drive well |
| 32 | yes | see json | REJECT | brighter glass. Needle still black. Hitch still wins |
| 33 | yes | see json | REJECT | gray needle, visible glass. Cards/plank remain |
| 34 | yes | see json | REJECT | overlapping shells + bubble canopy. Wings still cards |
| 35 | yes | see json | pending | plank and crate gone |
| 36 | yes | see json | REJECT | steep dihedral. Wing fold reads at 3/4. Hitch still wins |
| 37 | yes | see json | pending | hoses/turret/sticker gone. Needle still a pyramid |
| 38 | yes | see json | pending | wider needle cheeks. Step reads at 3/4. Hitch still wins |
| 39 | yes | see json | REJECT | stacked wing plates worse than C36. Reverted |
| 40 | yes | see json | REJECT | C38 needle + C36 wings. Still a dart. Not wired |
| 41 | yes | see json | REJECT | hull-is-needle. Overlapping wing shoulders |
| 42 | yes | see json | REJECT | waist and house. Leather boom |
| 43 | yes | see json | pending | easier AO. Tan remained (warm rim) |
| 44 | yes | see json | REJECT/REVISE | gray steel. Foam dart, card wings |

| 53 | **no** | see json | (baseline) | toolchain repair only. Blender 5.1 crashed every build in `boolean_cut_box`; fixed and re-ran. Output is byte-identical to C52, so this is NOT an authoring cycle and does not count. Stills exist only as the review baseline for the form restart. |

| 54 | yes | 1069a507 | REVISE/REVISE/REVISE | **form restart.** Four disjoint gloves and the outside plate cage replaced by one continuous loft. 15.3x2.5 needle -> 10.7x7.4 interceptor. Cage defect CONFIRMED FIXED by review; "traded a cage for a blank". Canopy is a frame on unbroken skin, no openings anywhere, wing still a card. Daylight through the hull 74 regions/4.1% -> 1/0.05%; wings and engine collar now solid. Sockets were left at the old needle coordinates (gun 1.45u in front of the nose) and were re-seated by the controller. |

| 55 | **no** | see json | (none) | socket re-seat rebuild only, no form change. Does not count. |

| 56 | yes | see json | see cycle_56.md | **every gate number hit and the ship got worse.** Height 157->244, bell 50->125px, openings 0->3, bore 82/73 (cap) -> 15/61 (throat), all met. But the canopy became a black tent, the drive a flat washer with no vanes, panel detail flattened, and hull triangles fell 77% to a torn loft. Two metrics were satisfied by shapes that defeat their purpose. C54 is the better ship overall and is recoverable at a7a41d90. |

Hitch-plus / A-list: not met. Do not promote. Do not self-accept.
