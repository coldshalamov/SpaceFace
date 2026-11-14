# Faction character in asset reviews

Use this as a practical direction for the graphics overhaul, not as a claim that today's models
already implement it. The owner's request is that ships and places express the people and work
of the world. The existing creative direction is a warm, readable working harbour with blue
shadows, small accents of neon and restrained bloom ([game direction](../../../game/README.md)).
At the gameplay camera, a ship's purpose and silhouette should read before tiny markings do.
Materials should retain texture and shape in highlights and shadow, without broad plastic color,
unexplained attachments or luminous white surfaces.

| Identity | Character grounded in game data | Visual direction to test |
| --- | --- | --- |
| [Solar Concord Navy](../../../../src/data/factions/scn.js) | Customs, patrol and inspection | Maintained, coherent hulls and inspection hardware; clean satin finishes and controlled metallic accents, with restrained blue identification. |
| [Meridian Trade Syndicate](../../../../src/data/factions/mts.js) | Contracts, tolls, haulers and escorts | Recognizable freight fittings and commercial markings; maintained executive craft can sit beside working ships with handled surfaces. |
| [Drift Miners](../../../../src/data/factions/dmc.js) | Mining and refinery work | Strong load-bearing forms, functional tools, practical hazard paint and wear at likely contact points. |
| [Crimson Reach](../../../../src/data/factions/reach.js) | Pirate raids and prizes | Repaired damage and salvaged parts, with deliberate identifying marks; preserve material variation rather than making the entire ship a flat red. |
| [Free Frontier](../../../../src/data/factions/free.js) | Independent pilots and settlements | Individual service histories and practical repairs, without giving every independent the player's personal marks. |
| [The Quiet](../../../../src/data/factions/quiet.js) | Smuggling and concealed cargo | Understated markings and credible cargo access; retain readable midtones against space. |
| [The Vael](../../../../src/data/factions/vael.js) | Human far-rim people, contracts and instruments | Precise, maintained human-built equipment and physical contract details; do not conflate them with ancient machines. |
| [The Pitborn](../../../../src/data/factions/pitborn.js) | A joyful working salvage community | Structurally believable patchwork, reused parts and individual marks; avoid treating every patched craft as a pirate. |
| [The Understory](../../../../src/data/factions/understory.js) | Recovered machinery and biological growth | Keep the original machinery recognizable beneath layered growth; avoid a single plastic-green surface. |
| [Verge-Layers](../../../../src/data/factions/vergelayers.js) | Precursors, survey and measurement | Precise machine geometry with a clear purpose for rings, apertures and light; avoid unexplained glowing decoration. |
| [Choir](../../../../src/data/factions/choir.js), [Archive](../../../../src/data/factions/archive.js), [Fulfillment](../../../../src/data/factions/fulfillment.js), [Helix](../../../../src/data/factions/helix.js) | Ritual, custodianship, automated administration and paper authority respectively | Distinguish these jobs through construction and restrained identifying details. Trace the actual scene before inventing a public Helix fleet. |

Individual vessels can depart from these tendencies when their story or owner calls for it.
Check the selected runtime body, saved appearance, faction variant and role before changing a
model: some Forge finishes intentionally retain authored colors and do not consume the ordinary
faction tint/wear defaults. The role-livery data describes intent, not proof that a particular
ship currently displays it. The story names Wren's ship Tessera, the starter hull class Hitch,
and an older art comment names Borrowed Time; do not assume their relationship is settled.

Prefer coherent shared atlases, material families and existing sockets over unique per-object
textures, lights or extra decorative meshes when they give the same picture. Textures and normal
maps still cost memory and bandwidth; added materials, passes and geometry can cost submissions.
Measure the affected path, preserve critical cues, and compare the actual image rather than inferring
quality or frame rate from asset counts. A lore consultation may propose a story or asset change;
verify it against the current game and label it as a proposal until it is implemented.
