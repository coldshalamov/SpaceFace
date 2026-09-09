# `place_station_refinery` material-truth V2 preflight

```yaml
assetId: place_station_refinery
assetTitle: Refinery Crown
dispatchUnit: PQ-022.refinery-reauthor
tier: B
startingState: production_model_with_G1_G2_G4_rejection
targetState: surfaced_candidate
componentReferenceDecision: not_needed
candidateOnly: true
livePromotionAuthorized: false
finalCandidateSha256: 49d6a50f24fdbb01a29d64f944a6171dd281f1b1800e0d4e045411b69b4538ed
finalCandidateBytes: 23088208
candidateSideDisposition: keep
supportedReviewCameras:
  - process_three_quarter
  - feed_three_quarter
  - side_process
  - top_flow
  - process_three_quarter_emissive_off
allSupportedViewZonesClassified: true
```

## Frozen identity and implementation boundary

The candidate preserves `place_station_refinery`, `SF_PLACE_STATION_REFINERY_ROOT`, the station
landmark role, +X process/dock direction, broadphase-only collision contract, three LODs, and five
material slots. The exported glTF socket transforms remain exact:

| Socket | glTF translation |
|---|---|
| `SOCKET_Structure_Core` | `[0, 0, 0]` |
| `SOCKET_Dock_Approach` | `[42.48, 0, 0]` |
| `SOCKET_Emissive` | `[0, 0, -31.955]` |

The authoring scene uses Blender Z-up deliberately, while export uses the sanctioned glTF Y-up
conversion. Geometry is designed in Blender `(X process, Y starboard, Z up)` space; the builder
asserts the three post-export glTF translations rather than assuming an Euler-axis interpretation.
The largest exported LOD0 envelope dimension may not exceed 144 runtime units. Candidate source
bytes and LOD0/1/2 triangles may not exceed the current live source ceilings of 23,431,088 bytes and
141,740 / 35,056 / 5,440 triangles. The collision proxy is a closed 11-sided broadphase prism with
exactly 44 triangles.

No live source, release, manifest, queue, NOW, route, Browser, Electron, or performance path belongs
to this unit.

## Canon-cited object portrait

The refinery exists because Catalytic Silt is the material economy beneath the visible one. The
canon defines Silt as a dense dark-gray slurry of synthetic rare-earth silicates that restores
station air recyclers, then degrades into pale inert Chalk; raw ore is mined in the outer sectors,
while valuable refined slurry is produced in Core refineries and shipped in licensed 150 kg
canisters (`docs/worldbuilding/story/ATMOSPHERIC-ECONOMY.md`, “The Scarce Resource” and “Integration
in the Commodity Tables”). The object therefore cannot be a generic petrochemical skyline. A pilot
must be able to follow the conversion of rough incoming mineral into separated catalyst feed,
heat-treated process stock, sealed slurry, and segregated chalk waste.

At the -X end, haulers meet an armored raw-feed mouth rather than a decorative wall. Its rolled and
folded hopper plates flare around a dark throat, and their load lands on gusseted frame stations. A
pair of transverse crusher rotors sits behind that throat. Their teeth are replaceable hard-faced
shoes, not radial decoration; the opposing shafts root into bearing blocks that can actually carry
the shock into the spine. The mouth, rotors, and first transfer trough form one readable assembly.

The transfer run stays open enough for the process to be understood. Two deep structural rails carry
a central trough and the fluid/ore lines that peel away toward the separator train. Cross-bracing is
concentrated where loads change direction. Quiet plate remains on the hopper shoulders, vessel
jackets, and control pod so the construction does not become full-surface greeble noise.

Three separation stages rise in a staggered cadence. The primary stage is a tapered hydrocyclone
with tangential feed and underflow spigot; the secondary is a tall domed pressure/tray column; the
tertiary is a rectangular lamella cell over a faceted solids boot. Flanged stage lines, pipe shoes,
manways, platforms, and load legs explain transfer and service without relying on labels.

The thermal section is deliberately asymmetric. A horizontal rotary kiln sits on tyres, trunnions,
saddles, and a driven gear beside a two-header waste-heat tube bank. A flanged burner throat, fuel
manifold, recovery riser, baffles, and supported tubes explain conversion with emission disabled.
Heat discoloration belongs on the kiln, burner, hot header, and clamps; it does not spread as generic
orange dirt over the whole asset.

Refined slurry and spent Chalk leave visibly different storage stories. Slurry occupies a dark
agitated thickener with bridge, gearbox, conical rake boot, protected pump, and sealed transfer line.
Chalk falls into pale square ceramic-lined mass-flow bins with steep hoppers, rotary valves, and a
shared screw conveyor. This is the setting’s moral process made physical: one output is guarded
life-support inventory, the other is the dead material poor stations are forced to stretch. The
distinction is structural and material before it is labeled.

The +X end is the lawful face of the machine. Twin faceted, trussed dock yokes surround the frozen
approach point while an offset folded-armor control pod watches the final transfer manifold. Its
glazing is recessed behind structure;
status bars sit in housings rather than floating as glowing strips. `REG 44-C` and process labels are
sparse maintenance/ownership marks, not the source of role readability.

**ART EXTRAPOLATION:** the exact crusher shoe design, three-stage separator arrangement, heat-recovery
cassettes, pale ceramic Chalk bins, and MTS/Concord maintenance-label placement are production-art
interpretations made to express the canon process. They add no new gameplay commodity or faction
claim. The memorable asymmetry is the thermal wing opposite the slurry/chalk storage fork. The
manufacturing signature is a sequence of dark folded load frames, cool process alloy, hot treated
alloy, pale ceramic waste hardware, and tightly housed amber/cyan controls. The service-history clue
is selective replacement: fresh pale Chalk-bin liners and patched hot-loop clamps amid older coated
frame paint. It must never resemble four copied drums on a wall, an oil-refinery cliché, a toy block
set, or a uniformly orange industrial prop.

## Production translation

### Macro silhouette imperatives

1. The -X hopper and crusher must read as the intake and establish process direction without color.
2. Three unequal-height separator stacks must form the central vertical cadence.
3. The thermal wing must create one strong asymmetric heat-recovery silhouette and real negative space.
4. Slurry and Chalk storage must fork into visibly different pressure/waste geometries.
5. The +X dock/control yoke must terminate the flow and preserve the frozen approach point.

### Visible-zone register and material bill

| Zone | Disposition | Supported views / dominance | Fiction, manufacture, finish, interface, response, history | Forbidden read |
|---|---|---|---|---|
| Raw-feed hopper and throat | `billed` | feed 3/4, side, top; dominant in feed view | Folded abrasion plate over a welded load frame; hard-faced lip, dark replaceable throat liner, gusset roots; dry chipped coating only at impact edges | featureless box, cargo funnel pasted to spine |
| Crusher and bearing bridge | `billed` | feed 3/4, side; dominant in feed view | Transverse forged shafts, segmented hard-face shoes, machined bearing blocks, bolted access bridge; cool metallic response with localized contact polishing | decorative gears, glowing disks, unsupported teeth |
| Transfer spine and manifolds | `billed` | all four; dominant in side/top | Deep folded rails, open bracing, trough, rooted process lines and junction flanges; coated structure plus bare service metal; patch history at clamps | long flat wall, random pipes, full-surface greebles |
| Three-stack separation train | `billed` | process 3/4, side, top; dominant in process/side | Tapered hydrocyclone, domed pressure/tray column, and rectangular lamella cell; flanged stage lines, manways, pipe racks, platforms, load legs, and directional alloy response | copied cylinders with rings, clay silos |
| Thermal and heat-recovery wing | `billed` | process 3/4, side, top; dominant in process | Horizontal rotary kiln on driven tyres/trunnions/saddles plus two-header supported tube bank; heat oxide localized by temperature, not orange tint | orange boiler, emissive blob, radiator fins with no roots |
| Refined-slurry storage | `billed` | process 3/4, top | Agitated thickener with bridge, gearbox, rake boot, protected pump and sealed transfer line; smoother cleanable alloy with maintenance wipe bands | generic fuel tank, unrooted hose |
| Chalk storage/discharge | `billed` | feed 3/4, top | Pale square ceramic-lined mass-flow bins, rotary valves, screw conveyor, abrasion-dark lower interfaces and replaceable liner seams | white plastic drums, tint-only output identity |
| Dock yoke and control pod | `billed` | process 3/4, side, top | Twin faceted/trussed structural yokes around frozen approach, folded armored pod, recessed glazing/status housings, sparse lawful transfer markings | torus dock, floating box/window, emissive identity only |
| Controls, labels and ownership signals | `billed` | all four, secondary | Enamel/process markings and recessed amber/cyan fixtures on physical housings; serviced and deliberately sparse | HUD-like rings, decals carrying the entire role |

There are no dominant inherited visible zones: this is a bounded whole-asset candidate rebuild under
the frozen identity/interface contract. The root, sockets, broadphase proxy role, route scale, and
runtime identity are retained technical interfaces, not camera-visible art zones.

### Shape-grammar audit

| Baseline form | Failure | Manufactured replacement |
|---|---|---|
| Four near-identical drums | Copied primitive rhythm with no staged process | Three profiled separator vessels with unequal heights, stagger, lower manifold, upper recovery header, platforms and manways |
| Long flat spine | Featureless ochre wall; no load or service logic | Open deep-rail transfer frame, trough, cross-bracing, bearing roots and process manifolds |
| Generic tank row | Storage/process states indistinguishable | Jacketed slurry pressure vessel and pale ceramic Chalk discharge bins with different interfaces |
| Emissive accents | Signal without mechanism | Recessed fixtures on crusher, thermal, storage and dock housings; emissive-off evidence required |
| Z-up construction exported as Y-up assumption | Process masses appear laid against a wall | Author in Blender Z-up, export with explicit Y-up conversion, and assert glTF bounds/socket axes after export |

### LOD and evidence plan

- LOD0 keeps crusher shoes, vessel profiles, manways, platforms, sparse load gussets, tube gaps, valves,
  labels, and recessed fixtures.
- LOD1 keeps the hopper throat, crusher pair, three-stage stack rhythm, primary manifolds, thermal
  wing, split storage story, and dock yoke with reduced service detail.
- LOD2 keeps all macro process stages and material boundaries; it may remove labels, small fasteners,
  secondary braces, and fine fins.
- Four matched 1600×900 exact-source views plus one emissive-off duplicate are rendered after
  re-importing the finalized source candidate GLB.
- All fifteen maps remain uniform 512×512 square PNGs. Their final material fields are smooth and
  substrate-specific; the generator contains neither block-cell nor per-pixel hash noise.
- G1/G2/G4 may reach only hash-bound offline `keep|revise|revert`; G5 representative performance,
  G6 Browser/Electron route integration, live promotion, and G7 final acceptance remain open.
