<!-- Agent brief template (Forge). Copy, fill in the specific bodies, hand to a subagent. See design/program/GRAPHICS_PROGRAM.md. -->

You are a senior environment/set designer in the SpaceFace repo (/home/user/SpaceFace), a top-down
Three.js space game (60° chase camera; the player ship is ~26 WU long). Every ship and most stations
are now built in one kit, "Forge". Your job: build three HERO LANDMARKS as brand-new Forge places.
Today these named wonders borrow small shared props and draw no bigger than the player's own ship —
a stranger flies up to "the Candle Fleet" and sees a 15 m prop (demo defect ledger D54). A landmark
must make the player stop and look: huge, unique, lit, readable from the top-down camera.

READ FIRST (fully): tools/blender/forge/FORGE.md (look bar + kit API), tools/blender/forge/forge.py
(every function signature), and the finished examples tools/blender/forge/ships/place_station_refinery.py
and place_station_fab.py (station-scale detail: truss helpers, window clusters — reuse their local
helpers), place_cargo_pod_standard.py (place file structure), and warden.py / leviathan.py / kestrel.py
(ship construction you can reuse for hull-shaped parts). Renders of the refinery for the bar:
.devshots/forge-place_station_refinery/*.png

THE THREE PLACES (new files; fleet.json entries already exist with layout 'place' and new_place=true —
the exporter then writes YOUR sockets instead of copying a live file). In each build() set
  s.socket_names = ['SOCKET_Structure_Core', 'SOCKET_Camera_Focus']
and place both with s.socket(name, (x, y, z)) at the landmark's visual centre (Camera_Focus a little
above it). Build at real metres; the runtime scales places to their gameplay radius, so proportions
and detail density matter, not absolute size — but design for a finished size of ~180–260 m across
(a landmark is 4–8 player ships wide), which means detail must read at that scale: many small lit
windows, lights, plates, not a few big blocks.

1. place_landmark_candle_fleet — "The Candle Fleet", Helios Prime memorial (sector_helios_prime).
   Lore: "Twenty-four flames burn. The recovered hull's plinth stays dark." "Families paid for the
   candles." A memorial to the lost Pit convoy. Design: a great ring (plan view!) of 24 candle
   plinths — each a slender memorial pylon/plinth holding a warm flame (glow_warm/amber light at the
   top, a small votive ring or lantern cage), with 25th plinth deliberately dark, larger, holding a
   recovered black-box/hull fragment — around a central dark still point. Linked by a thin civic
   ring walkway/truss so nothing floats; small family shrines, plaques, ribbon masts, a caretaker
   tender moored at one side. Helios ivory stone/ceramic + charcoal; the flames are the colour.
   The picture from above: a circle of 24 warm lights with one gap of dark. Budget LOD0 40k–80k.

2. place_landmark_resonant_cathedral — "The Resonant Cathedral", Vesta Forge (sector_vesta_forge),
   Choir faction. Lore: "Twin magenta spires tune themselves to the old shift rhythm." "The
   resonance arch turns industrial noise into liturgy." "Old foundry notices forbid Choir assembly
   beneath the present arch." Design: a converted foundry structure — heavy charcoal/rust industrial
   base (old furnace hall, gantries, stacks) from which rise TWIN tall spires in magenta light
   (finish variants work as '<finish>.<name>' keys: put 'glow_cyan.magenta': '#ff3ad0' in COLORS and
   use material='glow_cyan.magenta'; the same works for paint variants, e.g. 'paint2.rust') joined by a great RESONANCE ARCH spanning between them,
   ribbed like an organ/tuning fork, with lit tuning rings. Read from above: an arch bridging two
   spire bases over the foundry hall. Budget LOD0 50k–90k.

3. place_landmark_skerris_throne — "The Skerris Throne", Skerris Deep (sector_sker_haven), Reach
   raiders. Lore: "Every wall was once somebody else's hull." "No architect designed the Throne.
   Survivors kept welding." "The skull grows larger after every successful Reach raid." Design: a
   fortress welded from dozens of captured hulls of different makes and colours (build hull chunks
   with simple lofts in varied faction paints — Helios ivory, work-fleet orange, teal freight, Ashline
   rust/black), stacked and fused into curtain walls around a central keep; a skull-like prow/crown of
   plated hulls facing +X; gun turrets, sodium-orange (glow_warm/amber) raider lights, trophy racks,
   crude welded bridges between hulls, docking spars with raider ships. Ashline language: angular,
   dark rust/black, exposed machinery. Must read as a fortress from above. Budget LOD0 60k–100k.

COLOUR: the key light lifts values ~2.5x — author darker than intuition (ivory '#a69d8a' is the
brightest allowed). Three values per structure, identity colour in bands (band()), lights as design.
Nothing floats. No noise/grime.

LOOP per landmark (at least 3 full render + look cycles each):
1. Write tools/blender/forge/ships/<id>.py (SHIP_ID = the id).
2. Build preview: blender -b --python tools/blender/forge/ships/<id>.py 2>&1 | grep -E "forge\]|Error|Trace|line [0-9]"
3. Render: node scripts/fleet-look.mjs --file=assets/ships/forge/preview/<id>.glb --name=<id> --views=inspect,close,top --out=.devshots/forge-<id> --timeout=1500
   then OPEN the PNGs with Read. Renders are slow on this shared machine (another agent renders too);
   render one landmark at a time.
4. Critique like an art director and fix everything you see; repeat.

HARD RULES: only create/edit your three tools/blender/forge/ships/place_landmark_*.py files (plus
preview GLBs and .devshots output). Do not edit forge.py, forge_export.py, fleet.json, FORGE.md, src/,
manifests; do not run publish.mjs or git.

REPORT at the end: per landmark — LOD0 tris, envelope (m), the idea, design, fixes across cycles,
final PNG paths.
