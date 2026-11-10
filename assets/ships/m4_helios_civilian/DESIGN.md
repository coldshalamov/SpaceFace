# M4 Helios Civilian Fleet — Design Direction

**Packet:** `M4-HELIOS-CIVILIAN-FLEET-BLENDER-001`
**Status:** published to default Helios civilian traffic and shared asset manifests
**Quality bar:** SF-K0 Borrowed Time (minimum); Ashline is failure-comparison only
**Authority:** `design/spec2/00_MASTER_TASTE.md`, SPEC3-F5/F8/F9, planning constitution

## Family identity

**Helios Civilian** is optimistic precision engineering: warm ivory shells over graphite mechanical guts, restrained cyan identity rails, amber as functional bay markers only. Broad readable masslines, honest hardpoints, modular equipment language, no greeble soup.

| Token | Role | RGB |
|---|---|---|
| `Material_Hull` | Primary ivory shell | 196,184,164 |
| `Material_Mechanical` | Graphite guts / mounts | 20,24,28 |
| `Material_Cyan` | Identity rails, drive cores | restrained emissive cyan |
| `Material_Warm` | Bay lips / status markers | restrained amber |
| `Material_Glass` | Canopy / viewports | smoked cool glass |

Socket contract (stable bare names, same as K0 production):

- `SOCKET_Weapon_Front`, `SOCKET_Mining_Front`, `SOCKET_Engine_Main`, `SOCKET_Trail_Main`
- `SOCKET_Utility_Dorsal`, `SOCKET_Cargo_Ventral`, `SOCKET_Camera_Focus`
- `SOCKET_RCS_Port`, `SOCKET_RCS_Starboard`

Axes: forward `+X`, up `+Y`, starboard `+Z`, units metres.

## Three roles — distinct silhouettes

### 1. Helios Lark — licensed courier / route scout
- Compact dart, forward thrust mass, twin tight rear nozzles, low canards
- Runtime authority: ambient traffic with `entity.data.trafficRole === 'courier'`
- IDs: `SF_WHOLESHIP_HELIOS_LARK` / `wholeship_helios_lark`

### 2. Helios Cradle — industrial miner / support tug
- Protective shoulders, ventral tool cradle, dorsal utility mast, rooted mining head
- Runtime authority: ambient traffic with `entity.data.trafficRole === 'miner'`
- IDs: `SF_WHOLESHIP_HELIOS_CRADLE` / `wholeship_helios_cradle`

### 3. Helios Span — hauler / licensed trader
- Long load-bearing spine with integrated cargo flanks (not bolt-on pods)
- Runtime authority: ambient traffic with `entity.data.trafficRole === 'hauler'`
- IDs: `SF_WHOLESHIP_HELIOS_SPAN` / `wholeship_helios_span`

## Optimization policy

Structural only: merge-by-material LODs, keep-separate drive/gun/mining hooks, Meshopt+KTX2 finalize, real MikkT tangents, no plume meshes, no arbitrary quality caps. Every semantic material receives authored deterministic 1024² base-color, tangent-space normal, and packed ORM information; neutral placeholder maps are forbidden.

## Isolation

All family authoring remains under `assets/ships/m4_helios_civilian/**`. Publication copies only the three reviewed wholeships into canonical source/release paths, adds their manifest rows, and maps ambient `trafficRole` values in `src/render/partsLibrary.js`; it does not replace K0, Ashline, station, or world-place assets.

## Reproducible build

```text
"C:\Program Files\Blender Foundation\Blender 5.1\blender.exe" --background --python tools/blender/build_m4_helios_civilian_family.py --
node tools/art/finalize_m4_helios_civilian_candidate.mjs
```
