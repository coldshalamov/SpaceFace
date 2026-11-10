<!-- Agent brief template (Forge). Copy, fill in the specific bodies, hand to a subagent. See design/program/GRAPHICS_PROGRAM.md. -->

You are a senior hard-surface environment designer in the SpaceFace repo (/home/user/SpaceFace), a
top-down Three.js space game. The ship fleet and most stations have been rebuilt in one kit, "Forge".
Your job: rebuild the game's most-seen building — the Helios TRADE HUB (place_station_trade_hub), the
station the player starts at, docks at and returns to all game.

READ FIRST (fully): tools/blender/forge/FORGE.md (look bar + kit API), tools/blender/forge/forge.py
(every function signature), and the finished station examples
tools/blender/forge/ships/place_station_refinery.py, place_station_fab.py, place_station_mining.py
(these define the station bar you must match or beat — copy their local helpers such as truss /
window clusters rather than reinventing), plus place_cargo_pod_standard.py (place file structure).
Also look at the finished refinery renders: .devshots/forge-place_station_refinery/*.png

THE LIVE HUB (what you replace): assets/ships/parts/places/place_station_trade_hub.glb.
Inspect with: node tools/blender/forge/glbinfo.cjs assets/ships/parts/places/place_station_trade_hub.glb
Render the old one for reference: node scripts/fleet-look.mjs --files=places/place_station_trade_hub.glb --views=inspect,top --out=.devshots/old-trade-hub --timeout=1500
Envelope (glTF metres, X forward, Y up, Z starboard): X -57..63, Y -4..29, Z -52..52 — a ~110 m
disc-like station with a ring of 16 supported bays at radius ~37 m. Sockets: SOCKET_Dock_Approach at
glTF (63.4, 13.4, 0) — the docking side is +X; SOCKET_Camera_Focus (3, 13.4, 0); SOCKET_Structure_Core
(3, 12.25, 0). The exporter copies these automatically; keep structure under them (the dock mouth /
approach arm must end near +X 60, at height ~13).
Blender axes: Blender (x, y, z) = glTF (X, -Z, Y).

FACTION OVERLAYS — hard constraint. Three faction-variant overlay GLBs are drawn ON TOP of the hub at
the same origin and scale when a faction owns the station:
  assets/ships/parts/places/var_station_trade_hub_{free,mts,scn}_overlay_v01.glb
(free: pods + trusses; mts: inner/outer ring, struts, 6 crowns, 4 ad-panels; scn: 4 bastions, booms,
cladding band, masts). Their meshes span roughly X -94..79, Y 11..56, Z -66..73 — they hang around and
above the hub's ring. Your hub must still give them something to sit on: keep a structural ring deck
at radius ~35–52 m, keep the upper hub mass reaching Y ~26–30 near the centre, and do not put tall
parts where the overlay crowns/bastions stand. VERIFY: in Blender, import each overlay GLB into your
built scene (bpy.ops.import_scene.gltf — the parts/places sources import fine), and render a quick
Cycles top + 3/4 still (low samples, 800 px) of hub+overlay for each of the three; open them and fix
any overlay part that floats in empty space or cuts through your hub. Name these checks in your report.

DESIGN: the Helios civil palette (ivory '#a69d8a' is the brightest allowed, charcoal '#23282e', one
occupation colour — for trade, the Helios market teal or a warm brass; your call, justified), warm lit
windows (glow_warm), amber/red/green signal lights, cyan tech. The key light lifts values ~2.5x —
author darker than intuition. One clear idea ("the market wheel", "harbour of lights", ...) with a
memorable plan silhouette readable from the top-down camera. It is a HUB: berths with parked ships of
the Helios traffic look (small ivory freighters/shuttles built from simple lofts/boxes), cargo
cranes, container stacks, a lit concourse, antennas, beacons, hundreds of small lit windows, dock
lights leading into the +X berth. Nothing floats; every module joins by trusses/arms/spokes.
Budget LOD0 50k–90k tris (it is the one station always on screen at the start).

LOOP (at least 3 full cycles; this station matters most — do 4–5):
1. Write tools/blender/forge/ships/place_station_trade_hub.py (SHIP_ID = 'place_station_trade_hub';
   the fleet.json entry already exists).
2. Build preview: blender -b --python tools/blender/forge/ships/place_station_trade_hub.py 2>&1 | grep -E "forge\]|Error|Trace|line [0-9]"
3. Render: node scripts/fleet-look.mjs --file=assets/ships/forge/preview/place_station_trade_hub.glb --name=place_station_trade_hub --views=inspect,close,top --out=.devshots/forge-trade-hub --timeout=1500
   OPEN the PNGs with Read. Renders are slow on this shared machine; be patient, do not run two at once.
4. Critique like an art director (silhouette, three values, colour carried in bands, lights, nothing
   floating, nothing blown out, detail density at station scale) and fix; repeat. Do the overlay check
   at least on the final version.

HARD RULES: only create/edit tools/blender/forge/ships/place_station_trade_hub.py (plus preview GLBs,
scratch renders under .devshots or /tmp). Do not edit forge.py, forge_export.py, fleet.json, FORGE.md,
src/, manifests; do not run publish.mjs or git. No noise/grime textures.

REPORT: LOD0 tris, the idea, design, fixes across cycles, overlay-check results, final PNG paths.
