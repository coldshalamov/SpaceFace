# Swarm preparation preview evidence

Captured on 2026-11-01 at 1280×720 using the existing UI bench, real preparation owner and real Crucible screen modules. Each specialist's exact configured threat and counter is asserted on both preparation surfaces. All six original screenshots were opened and inspected; the preview paragraphs stay inside the viewport without horizontal overflow or vertical clipping. No uncaught page errors were recorded.

| Surface | Next wave | Screenshot |
|---|---:|---|
| Armory | 6 | [mine_layer_jackal](crucible-draft-next06-1280.webp) |
| Armory | 9 | [warden_escort](crucible-draft-next09-1280.webp) |
| Armory | 22 | [field_anchor_controller](crucible-draft-next22-1280.webp) |
| Refit | 6 | [mine_layer_jackal](crucible-refit-swarm-next06-1280.webp) |
| Refit | 9 | [warden_escort](crucible-refit-swarm-next09-1280.webp) |
| Refit | 22 | [field_anchor_controller](crucible-refit-swarm-next22-1280.webp) |

The six images are lossless WebP conversions of the original screenshots; decoded RGB pixels were checked byte for byte. [preview-capture.json](preview-capture.json) records the displayed text, owner/run wave agreement, bounding and clipping measurements, source/image hashes, and fixture correction.

## Reproduce

From the repository root, with a compatible Chrome executable in `SF_CHROMIUM`:

```sh
node scripts/capture-swarm-specialist-previews.mjs
```

The script writes its PNGs and report under `.devshots/swarm-specialist-previews/` by default. It fails if the expected counter is missing, the preview is clipped/outside the viewport, or the page throws an uncaught error.

## Scope

These are explicit bench fixtures, not proof of an ordinary run reaching waves 6, 9 or 22. The script changes the fixture wave and reopens its existing preparation owner before refreshing, so the owner selects the corresponding real offers and preview. The screenshots establish the changed paragraph's content and desktop wrapping; they do not certify every control, mobile layouts, performance or the repository-wide measured UI budget. No golden or budget digest was rewritten.
