// src/ui/icons/ — the DUST icon language (design/program/dust/README.md P5, BS-5).
//
// One coherent vector vocabulary for the three surfaces the vision audit flagged: the
// market's commodity register, the contracts board's type tags, and the station's tab rail.
// All three sets share one hand — 24×24 grid, single 1.8 stroke, square caps, miter joins,
// currentColor only — so a glyph on the tab rail and a glyph in a market row are visibly
// the same drawing school (TONE_BIBLE §2: icons are wayfinding, never joke surfaces).
//
// Import from the screens' side is through this index; the individual modules stay
// string-pure (no DOM, no state) so tests and the visual lab can snapshot them directly.
export {
  COMMODITY_CATEGORY_GLYPHS,
  COMMODITY_GLYPH_CATEGORIES,
  COMMODITY_GLYPH_CATEGORY_IDS,
  commodityGlyphSvg,
  applyCommodityGlyph,
} from './commodityGlyphs.js';
export {
  MISSION_TYPE_GLYPHS,
  MISSION_GLYPH_TYPE_IDS,
  hasMissionTypeGlyph,
  missionTypeGlyphSvg,
  missionTypeChipHtml,
} from './missionGlyphs.js';
export {
  STATION_TAB_GLYPHS,
  STATION_TAB_IDS,
  hasStationTabGlyph,
  stationTabGlyphSvg,
} from './stationGlyphs.js';
