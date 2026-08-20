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

| 56 review | - | - | **REVERT** | independent A/B against C54. "C54 is a ship with problems; C56 is a problem that stopped being a ship." Also corrected the premise: C56 did NOT hit every number - it failed the value split, the one row that could not be satisfied by bolting on geometry. |

| 57 | **no** | see json | (none) | ladder proof only, built on the C56 form. Proved the per-LOD texture ladder works: 64.6/64.5/63.1 MB became 64.6/20.2/7.6. Does not count as an authoring cycle. |

| 58 | **no** | see json | (none) | C54 form restored per the REVERT, carrying only the re-seated sockets and the texture ladder. Not a new form attempt, so it does not count. First attempt crashed Blender in igc64.dll during render setup after the LODs exported cleanly; retried. |

| 59 | yes | 0CF06831 | REVERT/REVISE/REVISE | Raised C54 loft + Exact booleans. Hull 21,966 tris (held). Profile 5.02:1. Exact cuts shredded the loft into 26 shells; starboard is a plate cage again (20% enclosed). Bells read as washers. Not wired. |
| 66 | **no** | — | (none) | Exact pocket cuts emptied the pressure hull. Not counted. |
| 67 | yes | see json | REVISE/REVISE/REVISE | Closed hull again. Dark liners. Canopy still a brick on skin. Clay still primitives. Not wired. |
| 68 | yes | see json | REVISE | Deep loft well pinched the nose. Worse than 67. Well reverted. |
| 69 | yes | see json | REVISE | Shallow saddle. Silhouette restored. Clay still primitives. Not wired. |
| 70 | yes | see json | REVISE/REVISE/REVISE | Brighter hull. Clay still faceted dart with card wings. Not wired. |
| 73 | yes | see json | REVISE | FLOAT boolean merged inner/outer, 0 boundary. Thick slab wings. |
| 74 | yes | see json | REVISE/REVISE/REVISE | Face pockets: 81 faces, 92 boundary, 2 shells. First visible cockpit well. Keep the well. |
| 75 | yes | see json | pending | Seat on pocket floor. Well kept. Clay still a dart. Not wired. |
| 76 | yes | see json | REVISE (author) | Lofted wings + interior vanes. Rectangular hoop cage. Chrome raytrace. Do not keep the hoops. |
| 77 | yes | 5FF2CE0A | REVISE/REVISE/REVISE | Cage gone. Airfoil loft + visible seat in bay crop. Required stills still read dart/cards/fan. Not wired. |
| 78 | yes | see json | REVISE/REVISE/REVISE | Larger well (156 boundary). Fat wing root. Station-following hoops. Starboard shows airfoil thickness. Clay still a dart. Not wired. |
| 79 | yes | see json | pending | Dropped wing inset (C78 crumpled). Underside spar. Starboard lights the airfoil. Clay still a dart. Not wired. |
| 80 | yes | see json | REVISE/REVISE/REVISE | Six-station hull. Reviewers still read a dart. Glass tent hid the seat. Not wired. |
| 81 | yes | see json | pending | Glass tent off. Seat visible. Clay still a dart. Not wired. |
| 82 | yes | see json | (well missed) | Three volumes. Cabin well deleted 0 faces. |
| 83 | yes | see json | REVISE/REVISE/REVISE | Three volumes + cabin well (196 boundary). Reviewers still read a dart. Not wired. |
| 84 | yes | see json | KEEP/REVISE/REVISE | Wide waist + rectangular house. Clay KEEP on three volumes. Bells still balls. |
| 85 | yes | FDC3636B | 3Q REVISE / starboard REVISE / rear REVISE | Bells recessed. Live LOD0/1/2 copied. Rear still two dark disks on a hex lid. Not quality-closed. |
| 86 | yes | see json | author REVISE | Transom cap removed. Solid cylinders as “clamps” still read as disks. Cabin well 264 boundary. Not wired. |
| 87 | yes | B62E48BD | 3Q REVISE / starboard REVISE / rear REVISE | Whole aft face opened. Ringed throats with vanes. Reviewers still REVISE. Not wired. |
| 88 | yes | see json | 3Q REVISE / starboard REVISE / rear REVISE | House faired out of the waist. Open house read as a cave from 3Q. Not wired. |
| 89 | yes | see json | 3Q REVISE / starboard REVISE / rear REVISE | 3Q counted three volumes and thick wings. Starboard still crate tail. Rear vanes + hub plug. Not wired. |
| 90 | yes | see json | pending | House height matches waist. Hub plug off; dark open bore. Not wired. |
| 91 | yes | 6C8B11ED | 3Q REVISE / starboard REVISE / rear REVISE | Cans stand off. Roof well is an empty crate. Transom gouge blacked the aft. Not wired. |
| 92 | yes | see json | author REVISE | Smaller well, no transom gouge. Glass roof hid the seat. Rear still impeller-in-a-hoop. Not wired. |
| 93 | yes | 880FF4FB | 3Q REVISE / starboard REVISE / rear REVISE | Long 3D cans you can look into. Interiors chrome. Greenhouse still a crate. Not wired. |
| 94 | yes | see json | author REVISE | Dark bowls. Rails off. Bay crop shows seat + glass. Starboard still a boom. Not wired. |
| 95 | yes | see json | author REVISE | Boom shortened. Floating keel tiles removed from the script. Cabin-waist still a hard step. Not wired. |
| 96 | yes | see json | author REVISE | Width-carry waist. Keel plates off. Well punch split the cabin (ghosted nose). Not wired. |
| 97 | yes | see json | author REVISE | Roof-only well (52 boundary). Nose closed. Headrest poked out as a tower. Not wired. |
| 98 | yes | see json | 3Q REVISE / starboard REVISE / rear REVISE | Medium well. Belly plates confirmed gone. Joint still called a triangle. Not wired. |
| 99 | yes | see json | 3Q REVISE / rear REVISE / starboard author REVISE | One continuous hull. Large well. Open cans. Still not KEEP. Not wired. |
| 100 | yes | see json | 3Q REVISE / starboard REVISE / rear REVISE | Raised seat, flipped liner, thicker wing. Glass yes; seat not named at 3Q. Not wired. |
| 101 | yes | see json | author REVISE | Teardrop wing, orange seat, dark cans. Still not KEEP. Not wired. |
| 102 | yes | B429FF51 | 3Q REVISE / starboard REVISE / rear REVISE | Boolean hit; inner-shell greenhouse stayed closed. Coaming was a lid. Kite wing. Open cans, pale lips. Not wired. |
| 103 | yes | see json | 3Q REVISE / starboard REVISE / rear REVISE | 1 shell, 172 boundary. Named peach seat in an open crate. Chimney from starboard. Wing lost thickness. Not wired. |
| 104 | yes | see json | 3Q REVISE / starboard REVISE / rear REVISE | Seat through glass lid. Chimney gone. Fat dark wing slab. Cans still pale and close. Clay still a crate. Not wired. |
| 105 | yes | see json | author REVISE pending | Raked glass, split cans, dark vanes. 3Q still a crate. Not wired. |
| 106 | yes | see json | 3Q REVISE / starboard pending / rear pending | Coaming off. Open well, named peach seat, split dark-lip cans. Wing still a slab. Not wired. |
| 107 | yes | see json | author REVISE | Gray hull, armor wings, dark soot throats. Seat too low, vanished. White rims. Not wired. |
| 108 | yes | see json | 3Q REVISE / starboard REVISE / rear REVISE | Raised coral seat named at 3Q. Dark split throats. Gray teardrop wing. Not wired. |
| 111 | yes | see json | 3Q REVISE / starboard REVISE / rear REVISE | Open well, L-chair, dark lips. Chair glowed. Wing still a slab. Not wired. |
| 112 | yes | see json | 3Q REVISE / starboard REVISE / rear REVISE | Painted seat, framed brow. Starboard still a kite. White inner hoop. Not wired. |
| 113 | yes | see json | author REVISE | LE tube reads as a pipe. Not wired. |
| 114 | yes | 660FDF4D | 3Q REVISE / starboard REVISE / rear REVISE | Pipe gone. Open well + orange seat + thin lip. Dark cans. Starboard still a black diamond. Not wired. |
| 115 | yes | 92DE7D72 | 3Q REVISE / starboard REVISE / rear REVISE | Armor wing, flat anhedral, level camera. Thickness real; side silhouette still a diamond. Not wired. |
| 116 | yes | 568463CD | 3Q REVISE / starboard REVISE / rear REVISE (throats KEEP) | Fat unswept gray wing. Starboard still called a kite. Not wired. |
| 117 | yes | 3100978A | 3Q REVISE / starboard REVISE (wing KEEP) / rear REVISE (throats KEEP) | First sausage KEEP. Unmapped hull went foam-white. Not wired. |
| 118 | yes | 3C581158 | author REVISE | Hull maps without metallic. Starboard went ink-black. GLBs restored to C117. Not wired. |
| 119 | yes | B1550A4D | 3Q REVISE / starboard REVISE (wing KEEP) / rear REVISE (throats KEEP) | Cool gray still photographed foam-white at 3Q. Not wired. |
| 120 | yes | 32380193 | 3Q REVISE / starboard REVISE (wing KEEP) / rear REVISE (throats KEEP) | Gray paint, sausage wing, dark cans. Whole-still still REVISE. Not wired. |
| 121 | yes | 9C5E2FB6 | 3Q REVISE / starboard REVISE (wing KEEP) / rear REVISE (throats KEEP) | Ceramic cans readable at 3Q. Pane still empty air. Plates read as stamps. Not wired. |
| 122 | yes | EAF9C4CD | 3Q REVISE / starboard REVISE (wing KEEP) / rear REVISE (throats KEEP) | Upright pane counts as glass from starboard, not from 3Q. Not wired. |

Hitch-plus / A-list: not met. C85 remains the live game body. Do not mark PQ-050.01 done. Do not self-accept.
