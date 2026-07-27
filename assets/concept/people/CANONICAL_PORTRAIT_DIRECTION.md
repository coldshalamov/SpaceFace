# Canonical portrait direction

The eight recurring contract actors are people with separate lives, not a matching cast of
space-crime archetypes. Their narrative authority is
[`docs/worldbuilding/story/NPCs-CANONICAL.md`](../../../docs/worldbuilding/story/NPCs-CANONICAL.md).
This brief governs their live portraits in `assets/portraits/` and future portrait revisions.

## Non-negotiable direction

- Treat every portrait as a specific encounter with a real character. Role, faction, or genre is not
  a costume slot.
- Spacepunk comes from work, class, place, history, and the device making the image. Do not turn the
  cast into interchangeable grim captains, glossy cyberpunk models, or uniformed space officers.
- Tattoos, scars, implants, grooming, jewelry, and repairs require a biographical reason. Some people
  should have none. Hale is explicitly lawful and uncorrupt; his clean institutional image is a
  deliberate contrast, not a deficiency.
- Vary the capture source as well as the person: compliance scanner, booth glass, respirator camera,
  freight relay, service camera, document camera, and security replay can each leave different
  perspective, color, noise, compression, and obstruction.
- Preserve facial identity at the actual 64 by 64 contact presentation. Environmental storytelling
  may surround the face, but cannot make the person unreadable.
- Never bake legible generated text, names, decorative HUD frames, helmets, or universal neon rim
  lighting into the art. UI and exact lettering remain authored separately.
- Canonical portraits keep stable registry keys and filenames. A missing image must still fall back
  to the procedural portrait path.

## Approved character and capture matrix

| Character | Life-specific visual evidence | Capture source | Moral position |
|---|---|---|---|
| Kessler | Worn Tycho scale coat, calibration implant, daughter's braided cord, thumb and seal reader intruding into frame | Cheap cargo-scale compliance camera with rolling-shutter grime | A father committing a quiet long-term skim |
| Rook | Payout stylus, private token tally, old gold tooth and token ear cuff | Cinder bounty-booth witness camera through scratched glass | A broker who double-bills and mistakes his confession for leverage |
| Voss | Claim respirator, coordinate-dot tattoo, faded mining dye, paper shaft maps | Hollow claim-recorder respirator camera as the mask lowers | A claim thief building a private map of sealed shafts |
| Hale | Plain regulation workwear, careful grooming, no outlaw coding or decorative tattoos | Clean, face-on Concord compliance scanner | Honest and lawful; the systemic anchor through which corrupt rules operate |
| Mira | Patched freight jacket, half-lasered Quiet route mark, seal-reader scar | Illicitly intercepted Bourse freight-relay frame | A trapped code-swapper who has been two jobs from escape for four years |
| Slate | Welding hood, severe old weld burn and graft, cell-block hash tattoo | Pit service camera inside a welding mask with arc bloom | A welder cataloguing the failure point of every bad second pass |
| Drift | Breathing strip, ink-stained fingers, old cardigan, physical ledgers | Overhead Meridian document camera rather than a posed headshot | A clerk who calls sixteen years of theft his unfunded pension |
| Quinn | Faded Pit hierarchy tattoo, UV counting stain, private-ledger key, old patterned shirt and apron | Low, wide Outpost 9 under-counter security replay | A territorial currency changer whose mathematically sound exit does not exist |

## Generation and processing provenance

- Generated in eight separate OpenAI image-generation calls through Codex on 2026-07-27.
- Prompts were authored from the canonical narrative above and the capture matrix in this document.
- No third-party photographs or donor assets were supplied to the generator.
- The first generic “prestige spacer” exploration was rejected and never promoted.
- Approved generator outputs were converted to 1254 by 1254, quality-95 sRGB JPEG authoring sources.
- Runtime files are stripped 1024 by 1024, quality-92 sRGB JPEGs. Mira uses crop
  `1050x1050+90+10`, Drift `1000x1000+127+0`, and Quinn `1050x1050+102+0` before the runtime resize;
  the other five retain the full generated composition.
- Final runtime review must include the station/contact UI at its normal crop and a 64 by 64
  identity check. Source-sheet approval alone is insufficient.

| Character | Authoring source SHA-256 | Runtime SHA-256 |
|---|---|---|
| Kessler | `00e2b84e7de2c8b45b1fb7efd3d3c744ac5c352d56a58412bc402cccaa802698` | `e396de6e900e0f2d29be4c4490822351ad5a8956078fac5e09a884b713de5467` |
| Rook | `f2c6cd618903d22b918c5e7a1bd811fb5f46b37ddb421513a4a7a0808a90fc31` | `b4812be8110860e394f8e31c8d5ccbabf306d3a9022749646a89297e4d9e7ec8` |
| Voss | `f21323d74fc5c4890e9d8ba111754a02907e9aeaf70994c8ea7873a3ce3db04b` | `66d415c904a28e190d4607b2ffd0b459a653072a32a82b9bbc885a21a3c4c532` |
| Hale | `f3289bb49ec7da78a750efb9c4391cefda79ed6e4f65408fbba58272d0498ce3` | `786060a50b152b387d9f0819b8d6d6e0e6424f2d424c62d550333d38c6b7275c` |
| Mira | `759706502a1ea1dfcb3208fd1a49433a0de7b4ef8f32fea78f857e36d6b6a4fe` | `04fcea175f3b57bc8ac6dac9479ddc289d30e5e0a2767fdcf7e9d3962f151ddb` |
| Slate | `bc3d4128d85e4125fb21786a88575cae31e52019fd8e53d59b018deafdac80f5` | `7208c624dbc3c3e48d26c3c6d53e7d5c1fc46ebdd9794d478d30b7cfaf7b0c12` |
| Drift | `9ee502a77edd5e57fdb02fdeb8d2842f48ff94e425fb43b2c899dce81a3df7d1` | `9589da2dfb11b06707b8b168af723bebc428d78d14b4604be23ed732a647f4b7` |
| Quinn | `45cd936866a622eae0d6d8bc7235260ccd0b647613163adf23afd1b108b95807` | `dcd7efae3597975fb6a465229ae206cbff1a983f2f8f608e331f0db68acf1eee` |
