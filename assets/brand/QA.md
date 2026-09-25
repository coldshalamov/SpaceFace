# Emblem validation — 2026-09-13

Scope: the authored SVG assets and their export files, not gameplay or packaged application integration.

## Completed checks

- Seven SVGs parsed and rendered with CairoSVG. XML elements, unique IDs and local references were checked; no embedded bitmap, font, script or external resource is present.
- Signature and flat variants share the same three base contours. The signature's extra facets are clipped to that silhouette. At 1024 px, the only raster coverage outside the flat image was one pixel with alpha 1/255, an antialiasing difference.
- The revised small optical master retained three disconnected regions at 16, 20, 24 and 32 px (8-neighbor connectivity at 50% alpha). The full monochrome master also has three regions.
- Chromium rendered the preview at 1440 px and 390 px viewport widths: all nine image instances decoded, no horizontal overflow and no JavaScript page errors. Reduced-motion emulation found zero active animations.
- Every ICO representation was decoded and compared byte-for-byte to its individually rendered PNG. The largest ICNS representation decoded at 1024 × 1024.
- Visual inspection covered signature, flat, black-on-light, launcher, actual-size strips, enlarged pixel details and the mobile layout. This was author review, not independent visual acceptance.

Browser navigation is restricted in the authoring environment. The Chromium layout test used the exact local SVG bytes as in-memory data URLs, not on-disk link navigation. The delivered page retains ordinary relative file links. No Electron build, installed OS icon, full game test suite or trademark clearance was tested.

## SVG source hashes

| Source | Bytes | SHA-256 |
| --- | ---: | --- |
| `spaceface-emblem-flat.svg` | 859 | `8cba26c42b2e4732065f30c90aa65ced32ffff8b3a256f14ae9a3429c74db8ef` |
| `spaceface-emblem-mono.svg` | 723 | `14f416c2c408183b8064e29a7a064822cea2b7c655d3d039641079476be3276c` |
| `spaceface-emblem-reverse.svg` | 715 | `d0fb8be53d1942bde138d6edd25f752e779c68117e80dbe42fdd52f83c76236c` |
| `spaceface-emblem-small.svg` | 816 | `bd8254acf67d9193bef953937eabf31efa48b3f3e2d8b06c73a9e13695b86213` |
| `spaceface-emblem.svg` | 3432 | `bd3404036173f9caa91b2a54a1047fba06e2e2300be33441fc3f9c8153916325` |
| `spaceface-favicon.svg` | 838 | `9b90190fa1271c94983acfcfecae2ae547c500695d308324203cb8c9f3a374b6` |
| `spaceface-launcher.svg` | 4072 | `3c21a9d3a1a6c394d2c4805064eaef8b1c98ad6aa64f74b8a598397790f8ae69` |
