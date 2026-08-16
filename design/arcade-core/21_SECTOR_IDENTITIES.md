<!-- LIFETIME: DURABLE -->
# 21 — SECTOR IDENTITIES: ten places, ten personalities

`sectorVisualProfiles.js` + `sectorZones.js` are the seam. Standard (GDD §9.2): one
representative frame communicates *where you are* with no label. Each sector gets a data
profile across all of:

| Axis | What it controls |
|---|---|
| **Light** | Key light hue/angle, ambient level, bloom character |
| **Sky** | Background art, parallax dust density, distant bodies |
| **Density** | Rock count/size, debris, lane spacing, empty-space ratio (I-6 honored per sector *region*, not per sector) |
| **Traffic** | Cast mix from 18, faction presence, hostility baseline |
| **Hazard** | One signature environmental risk (storm pocket, eddy field, debris river, radiation band) |
| **Economy** | Dominant commodities, price personality (06: e.g. refinery metals sine) |
| **Sound** | Ambient bed, radio chatter dialect, music mode |
| **Landmark** | One signature POI (25) + one rumor (27) |

## Authored example identities (adapt names to live data)

- **Ceres Belt** (starter): warm industrial light, dense worked rocks, miner/tug traffic,
  low hazard, friendly prices — the tutorial of place: "space is a workplace."
- **A refinery sector**: orange forge glow, heat shimmer, slag fields, corporate security,
  metals sine market.
- **A frontier dead zone**: cold dim light, sparse everything, the Quiet Patch, prospectors
  only, ambush risk maximal — Freelancer dread in a bottle.
- **A shrine sector**: lantern convoys, calm traffic, zealot patrols, a wreck-cathedral
  landmark.
- **A storm sector**: ion pockets everywhere, smugglers, lightning-lit rocks, sensor play.

## Rules

- A sector's identity must change *play*, not just paint: hazard changes fits, traffic changes
  income, light changes readability (validated against the accessibility palette).
- No two sectors share more than two axis values.

## Acceptance

- Blind location test (human gate): owner sees 10 frames, names ≥ 7 sectors.
