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
| 123 | yes | 1E454820 | 3Q REVISE / starboard REVISE (wing KEEP) / rear REVISE (throats KEEP) | Raked front pane still empty air from 3Q. Hung plates have gaps; cabin flank still a cream slab. Not wired. |
| 124 | yes | 439EB0FD | 3Q REVISE (glass KEEP) / starboard REVISE (wing KEEP) / rear REVISE (throats KEEP) | First 3Q seat-through-glass. Spine plates still LEGO boxes. One pane blows white. Not wired. |
| 125 | yes | 0547F958 | 3Q REVISE (glass KEEP) / starboard REVISE (wing KEEP) / rear REVISE (throats KEEP) | Hood + sheet courses. Seat through glass held. Dorsal sheets still 12 cm proud, read as boxes. Not wired. |
| 126 | yes | CBF71EF8 | 3Q REVISE (glass KEEP) / starboard REVISE (wing KEEP) / rear REVISE (throats KEEP) | Flush 3 cm plates, flap slot, lower hood. Whole still still a gray tube. Not wired. |
| 127 | yes | 1CC330CA | author REVISE | Per-face hull inset became a waffle. Not sent to three-angle review. Not wired. |
| 128 | yes | BA751AF9 | 3Q REVISE (courses started) / starboard REVISE (wing KEEP) / rear REVISE (throats KEEP) | Inset courses in the hull, not boxes. Aft barrel still blank. Not wired. |
| 129 | yes | A0F4D7F5 | 3Q REVISE / starboard REVISE (wing KEEP, aft courses) / rear REVISE (throats KEEP) | Courses through the aft barrel. Whole still still REVISE. Not wired. |
| 130 | yes | 0C879215 | 3Q REVISE (courses KEEP) / starboard REVISE (wing KEEP) / rear REVISE (throats KEEP) | Eight large courses, not a waffle. Hood still a crate from 3Q. Cans closed from 3Q, open from rear. Not wired. |
| 131 | yes | 806D677F | 3Q REVISE / starboard REVISE (wing+hood KEEP) / rear REVISE (throats KEEP) | Low dark hood, 3Q open rims, gap paint. Gap shader blacked a flank. Not wired. |
| 132 | yes | 7555D869 | 3Q REVISE / starboard REVISE (wing KEEP) / rear REVISE (throats KEEP) | Gap paint only on channel walls. Whole still still REVISE. Not wired. |
| 133 | yes | E5CF028D | 3Q REVISE / starboard REVISE / rear REVISE (throats KEEP) | Ceramic liner/vane tips, plate rims, flap slot, L-kit. 3Q still black cups; flap hidden in tip; cockpit still a brick. Not wired. |
| 134 | yes | DE4D5394 | author REVISE | 3Q camera found the mouth ellipse, then a solid lip capped it. Orange chimney through the hood. Not wired. |
| 135 | yes | D783F6E0 | 3Q REVISE / starboard REVISE / rear REVISE | Lid and chimney gone. Rear throats open. 3Q still black cups; flap not readable from starboard. Not wired. |
| 136 | yes | E4B76565 | author REVISE | More-aft 3Q. Flap hung as a black box under the wing. Not wired. |
| 137 | yes | 2225E7D1 | 3Q REVISE / starboard REVISE / rear REVISE | Flap tucked. Ceramic vane tips at the mouth. Whole still still REVISE. Not wired. |
| 138 | yes | 2DD483E4 | author REVISE | First 3Q that looks into open throats. Slot cube hung as a black bar. Not wired. |
| 139 | yes | 41C7D57B | 3Q REVISE / starboard REVISE / rear REVISE | 3Q looks into mouths; vane star still read as a black plug. Flap slot a dark strip. Not wired. |
| 140 | yes | see json | author REVISE | Eight thinner vanes. 3Q still a black star in the cup. Not wired. |
| 141 | yes | ED357768 | author REVISE | Ceramic interior in the close crop. 3Q at play size still black cups. Not wired. |
| 142 | yes | see json | author REVISE | Open ceramic bowls from 3Q; vanes too deep, gone from rear. Not wired. |
| 143 | yes | B3693D54 | 3Q REVISE / starboard REVISE / rear REVISE | Tan bowls + vanes in the crop. Reviewers still called black cups and hanging flap. Not wired. |
| 144 | yes | 046DF132 | author notes | Flap raised into the wing plane. 3Q hanging slab reduced. Not wired. |
| 145 | **no** | D7F734BB | INVALID 3Q/rear | Brighter ceramic, 8 vanes, diamond flap, DriveFair. 3Q clipped bells; rear clipped bow. Recapture only. Not wired. |
| 146 | yes | 4C524834 | 3Q REVISE / starboard REVISE / rear REVISE | Valid recapture of C145. Rear open tan bowls with vane star. Whole still grey tube with plates. 3Q cockpit a fleck; flap a hanging card. Not wired. |
| 147 | **no** | 7C717791 | INVALID 3Q | Ceramic outer flare + throat lights blew bowls white; 3Q clipped a bell. Starboard flap became a second sausage. Not wired. |
| 148 | yes | 9DF4CBC9 | author stop | Soot vanes restored, no throat lights, no slot sheet, lower hood. Grind stopped; Hitch-plus not met. Not wired. |
| 149 | yes | see json | leftover | First chase-camera capture. Authored metres, ~4% frame. Scale bug, not form. Not wired. |
| 150 | yes | see json | leftover | Chase recapture. Belly-axis still wrong through C151. Not wired. |
| 151 | yes | see json | leftover | Wings pushed outboard; canopy raised. Camera still under the keel. Not wired. |
| 152 | yes | see json | leftover | Chase-camera axis fix (Blender Z-up). First dorsal chase. Not wired. |
| 153 | yes | 098EA799 | REVISE/REVISE/REVISE | Legal chase stills at runtime size. Gray tube with card wings. Canopy a patch; drives discs. Not wired. |
| 154 | yes | 7DDD2F99 | REVISE/REVISE/REVISE | Three-volume loft, no seat, delta wings, dorsal wells. Clay still primitives; canopy lid; tan bells. Not wired. |

| 155 | yes | see json | REVISE/REVISE/REVISE | Diamond clay + punched 2-shell hull. Play went black. Not wired. |
| 156 | yes | see json | author REVISE | Shallower wells, more fill. Play still charcoal — gap-paint + hull maps. Not wired. |
| 157 | yes | 0DCEEE04 | REVISE/REVISE/REVISE | Unmapped Hitch-white hull. Card wings, cage canopy, jagged cups. Not wired. |
| 158 | yes | 0460960F | REVISE/REVISE/REVISE | Slab-delta + visor. Play luminance ~42. Maps muddied the hull. Not wired. |
| 159 | yes | 9780D2BF | REVISE/REVISE/REVISE | White hull restored. Wings hide the waist; canopy stamp; square wells. Not wired. |
| 160 | yes | see json | author REVISE | Aft wings + steep dihedral. Play luminance ~35. Not wired. |
| 161 | yes | F60F0808 | REVISE/REVISE/REVISE | White hull, wings aft. Two-tone still reads as cards. Not wired. |
| 162 | yes | see json | REVISE/REVISE/REVISE | One white skin. Still a chalk wedge with card wings. Not wired. |
| 163 | yes | 46ACB5BD | REVISE/REVISE/REVISE | Shorter visor, drive rims, flap slot. Still clay plate. Not wired. |
| 164 | yes | 5967FDAF | REVISE/REVISE/REVISE | Mid-paint, large flaps, taller chines. Lum ~159. Still clay plate. Not wired. |
| 165 | yes | 12980C91 | REVISE/REVISE/REVISE | Naked waist, long visor, house lid. Visor became an open crate. Not wired. |
| 166 | yes | C8A6AB32 | REVISE/REVISE/REVISE | Flush visor, belly wrap. House lid sealed the drives. 2-shell hull. Not wired. |
| 167 | yes | E23EF8E4 | REVISE/REVISE/REVISE | 1-shell, punched wells. Visor still a sticker; rims plug the drives. Not wired. |
| 168 | yes | FECC116E | REVISE/REVISE/REVISE | Inset visor, no rim plugs. Bells named at close. Still chalk plate. Not wired. |
| 169 | yes | 19F28618 | REVISE/REVISE/REVISE | Dark TE plates. Lum ~151. Still one white mass. Not wired. |
| 170 | yes | 9D9A6348 | REVISE/REVISE/REVISE | Side belts. Chase looks down; lum unchanged. Still chalk. Not wired. |
| 171 | yes | 9232AD72 | REVISE/REVISE/REVISE | Dorsal waist band moved lum toward Hitch; reads as a glued crate. Not wired. |
| 172 | yes | 25ED03A5 | REVISE/REVISE/REVISE | Waist crate off; lum back to chalk. Split lids read as glued cards. Not wired. |
| 173 | yes | 56FFA615 | REVISE/REVISE/REVISE | Waist shoulders photographed as black side boxes. Not wired. |

Hitch-plus / A-list: not met. C85 remains the live game body. Do not mark PQ-050.01 done. Do not self-accept.
