# Depth-contact portrait direction

The G1-G15 contacts in
[`src/story/campaign47a/embodiedDialogue.js`](../../../src/story/campaign47a/embodiedDialogue.js)
are authored recurring characters. They must not inherit a stock photograph from a role such as
`pilot`, `miner`, or `barkeep`. Their stable portrait keys and runtime files are owned by
`src/data/portraits.js`.

The shared human and capture rules in
[`CANONICAL_PORTRAIT_DIRECTION.md`](./CANONICAL_PORTRAIT_DIRECTION.md) apply here. In particular,
spacepunk is a world condition rather than a universal criminal costume. Lawful inspectors,
scholars, refugees, clerks, and archivists need as much specificity as rivals, kingpins, and illicit
mechanics.

## Approved contact and capture matrix

| Program | Character | Life-specific visual evidence | Capture source |
|---|---|---|---|
| G1 | Clerk Yune | Repaired clerk collar, reading lenses, mourning pin, archival residue | Evidence-copy scanner through thick scratched glass |
| G2 | “Coldburn” Rey | Civilian freight jacket, plotting pencil, old coolant depigmentation injury | Battered collision-avoidance camera during an intercept |
| G3 | Dr. Iren Suhl | Darned field-lab coat, specimen clip, recorder, mineral dust | Multispectral transcript camera reflected through a spectrograph plate |
| G4 | Warrant Orrin | Mismatched reading lenses, repaired civil-service cuff, original evidence cartridge | Rigid institutional deposition camera with aging interlaced video |
| G5 | Boss Sker Vane | Inherited toll ring and a lineage tattoo extended coherently across decades | Sker toll-booth parallax camera through smoked transaction glass |
| G6 | “Dustwife” Senna | Memorial cords and machine tags, graphite fingers, recovered name slip | Cold pinhole recorder inside an opened wreck locker |
| G7 | Latch-Child | Asymmetric inspection lenses, parcel cord, maker's faded crescent, careful grippers | Salvage-grapple macro inspection camera |
| G8 | The Question | Worn non-Euclidean object with misaligned apertures and impossible reflection | Failed Sedna photogrammetry reconstruction |
| G9 | “Filecleaver” Dorin | Torn badge residue, copier toner, wedding ring, stolen seal-log cartridge | Badly leveled customs body-camera frame in a service corridor |
| G10 | Lira Vonn, “The Margin” | Repaired reporter's jacket, print-slug earring, taped recorder, shorthand-stained fingers | Self-triggered instant-news camera and chemical print process |
| G11 | Tinker Zell | Singed hair, prosthetic test fingertip, cracked tooth, corrected wiring-reference tattoo | Tool camera mounted inside a live engine bay |
| G12 | Mara and the Children | Four distinct civilians with a toy glider, food tin, patchwork animal, and family bracelet | Thermal-assisted convoy intake camera above their shared hold |
| G13 | “Wraith” Kell | Deliberately forgettable clerk clothing, paper-cut scar, copied page hidden in lining | Overlapped customs-glass exposures from clerk and dead-drop cameras |
| G14 | Prof. Halev Doss | Darned cardigan, doubled spectacles, inked hand, page weight, inherited ring | Microfilm camera reflected through a circular page magnifier |
| G15 | Captain Maera Vols | De-ranked civilian flight coveralls, injector-burn scar, undelivered message | Abandoned ship's warm, low-resolution crew-status camera |

## Procedural locals

Procedural station contacts currently have deterministic IDs but a synthetic name-and-role generator.
They intentionally receive the deterministic canvas fallback instead of borrowing one of the seven
deleted role singleton photographs. Replacing that fallback with authored imagery requires a separate
station-roster migration: stable local biographies, names, locations, and one identity per portrait.
Adding a prettier role pool would reintroduce the same false identity at a larger file count.

## Generation and processing provenance

- Generated in fifteen separate OpenAI image-generation calls through Codex on 2026-07-27.
- Prompts were authored from the G1-G15 cards and their six-line voice registers.
- No third-party photographs or donor assets were supplied to the generator.
- Approved outputs were converted to 1254 by 1254, quality-95 sRGB JPEG authoring sources.
- Runtime files are stripped 1024 by 1024, quality-92 sRGB JPEGs. Suhl uses crop
  `1080x1080+90+20`, Senna `1080x1080+85+10`, Kell `1040x1040+115+15`, and Doss
  `1080x1080+85+30` before the runtime resize; the other eleven retain their full composition.
- Review covered the full 15-up board and nearest-neighbor enlargements of the actual 64 by 64
  output. Runtime acceptance still requires the 38-pixel contact rail, 160-pixel conversation stage,
  image-failure fallback, and Browser/Electron parity.

| Character | Authoring source SHA-256 | Runtime SHA-256 |
|---|---|---|
| Yune | `2d291de51cb97319ce12b085516eaffb7b8d836b0aca1b2beea7b9265e088048` | `49fc41d89c8066e7c588939cd33102e3571d810b03af093ff8fafb85bea23e99` |
| Coldburn Rey | `9ca7d6467dac029fcbdff564476a5e1c44da30e9936e01c7bf042ef0eb113bf1` | `cfb29be9919028f0fbc850f21bb10d856b8baaa55bfbd6bb21eaef1ac9607766` |
| Iren Suhl | `b0b136b14fd29fb0e4859e018d5db6ef73055c6169ed128e8bb834046d6e6711` | `d68cb1bfe01864537e9ef9fb2cd0deabf937c4363e0625b75583bc97520dc299` |
| Orrin | `837441a5abf10e70e21022f068cd4471336275010275bc504ea4e7a35db02f2c` | `f819f294549e4726a95de2cc57b1499f790c4f705e763cd08507ad33df6aa734` |
| Sker Vane | `b76adc60d29397096a0f2b06aa8f659a93f1edbd1db7994475c827240e629bd2` | `06743afc90da0e917ebb2aeff8f2e9bbf6661119f35b43c2950725bc1b0a6b13` |
| Dustwife Senna | `7b5e7956a83e0960b213daf37400dfc8287255b29d37b93f94323269adfca3d0` | `65e3762235e18e03d534e75af32eebacf5f182531ed7f88ad44c5fbc966e822d` |
| Latch-Child | `64f6093af2eecd2eedf3fa87d1d13ffa479e547566dc7f7e6af32ddfc3cec3b0` | `79c9e9ba92f6597f4bc9b0d9c0db504b4632a5d085223193695f702275b62f8e` |
| The Question | `d1a8f4263bd1cd2d11d561b4fbaaf8b1a9eb4b599aefb28b04ffb38c35d70bc1` | `7dbd468cf2cf2b50c7c3af280a68f53ab7953d262b5e60d1ecbbecf828a8fc73` |
| Filecleaver Dorin | `2888e737307242054ae0fc4363da7b517d4411c5c4a6ca72e2e70572bf7019d7` | `12c5739562ed567ee8b5bfdc4326622b96fd1a48f0c4ae9f53d24c0f270a234a` |
| Lira Vonn | `e3052530ac8fa8a0318bb20dbeb73a1f2c634501f36a2281cdb4ce3f896a5b73` | `f0c8e91e8879a41fd4899fc9ccbeeae9d871b0b501139fdbda20be0a5c9de409` |
| Tinker Zell | `e1359eb849ad55d3c48cdc7485b504af0c39150b64b5ae20dca848024e09337e` | `3c1d0de1c76a3f22b04d663d7513f1eda5e8ef7241b1004aa5e7ba5ab63952e7` |
| Mara and the Children | `32337d3d78d64237f36ca8e08a4ec942b72fbf09a3a3c617396bd97967187935` | `d5fc132ee905c94f4b6f9a0d8918abc9d950eb86807bd9fc5c5319470f219620` |
| Wraith Kell | `dbd611ca8499dbe1ff9192907b513d9c052b74ec5817cc2834e18779f4e6a507` | `fbd3f2e8d8757edac37439121f6d90eaa35b6e1562474cb48dcf131d296da115` |
| Halev Doss | `22ef39f044f5f60423bab907383e4e932e229c9884f5e30ca5013be317dc1cbe` | `d2db197c72f4992bbb142897b9baa7b1e18b0025f466cd23e47eb9b43213e9a1` |
| Maera Vols | `e53423fbc85594c47de9b0f99524586f26f80ffd73337a4f89039b22836b46b3` | `00c9621a1b9d5164f08f19ec9aa0e086c4b67d3903bbbce729677bd2dde4d5c9` |
