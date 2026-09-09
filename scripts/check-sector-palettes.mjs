import { SECTORS, SECTOR_PALETTE_CLASSES } from '../src/data/sectors.js';

const REQUIRED_FIELDS = ['key', 'rim', 'fill', 'ambient', 'fog', 'fogDensity', 'nebulaTint', 'dust'];
const COLOR_FIELDS = ['key', 'rim', 'fill', 'ambient', 'fog', 'nebulaTint', 'dust'];
const CLASS_ENTRIES = Object.entries(SECTOR_PALETTE_CLASSES);
const CORE_LUMINANCE = combinedLightLuminance(SECTOR_PALETTE_CLASSES.core);
const MIN_LUMINANCE = CORE_LUMINANCE * 0.8;
const MAX_LUMINANCE = CORE_LUMINANCE * 1.2;

const issues = [];
const usedClasses = new Set();

for (const sector of SECTORS) {
  const palette = sector.palette;
  if (!palette || typeof palette !== 'object') {
    issues.push(`${sector.id}: missing palette block`);
    continue;
  }

  for (const field of REQUIRED_FIELDS) {
    if (!(field in palette)) issues.push(`${sector.id}: palette missing ${field}`);
  }
  for (const field of COLOR_FIELDS) {
    if (!isColorHex(palette[field])) issues.push(`${sector.id}: palette.${field} must be a 0x000000-0xffffff number`);
  }
  if (!Number.isFinite(palette.fogDensity) || palette.fogDensity < 0) {
    issues.push(`${sector.id}: palette.fogDensity must be a non-negative finite number`);
  }

  const className = classNameForPalette(palette);
  if (!className) issues.push(`${sector.id}: palette does not match an authored class`);
  else usedClasses.add(className);

  const luminance = combinedLightLuminance(palette);
  if (luminance < MIN_LUMINANCE || luminance > MAX_LUMINANCE) {
    issues.push(`${sector.id}: ambient+fill luminance ${luminance.toFixed(4)} outside ${MIN_LUMINANCE.toFixed(4)}-${MAX_LUMINANCE.toFixed(4)}`);
  }
}

for (const [className] of CLASS_ENTRIES) {
  if (!usedClasses.has(className)) issues.push(`palette class unused: ${className}`);
}

if (issues.length) {
  console.error(`Sector palette check failed (${issues.length} issue${issues.length === 1 ? '' : 's'}):`);
  for (const issue of issues) console.error(`- ${issue}`);
  process.exit(1);
}

console.log(`Sector palettes OK: ${SECTORS.length} sectors, classes used: ${[...usedClasses].sort().join(', ')}`);

function classNameForPalette(palette) {
  for (const [className, classPalette] of CLASS_ENTRIES) {
    if (samePalette(palette, classPalette)) return className;
  }
  return null;
}

function samePalette(a, b) {
  return REQUIRED_FIELDS.every((field) => a[field] === b[field]);
}

function isColorHex(value) {
  return Number.isInteger(value) && value >= 0x000000 && value <= 0xffffff;
}

function combinedLightLuminance(palette) {
  return relativeLuminance(palette.ambient) + relativeLuminance(palette.fill);
}

function relativeLuminance(hex) {
  const r = linearRgb((hex >> 16) & 0xff);
  const g = linearRgb((hex >> 8) & 0xff);
  const b = linearRgb(hex & 0xff);
  return 0.2126 * r + 0.7152 * g + 0.0722 * b;
}

function linearRgb(channel) {
  const c = channel / 255;
  return c <= 0.04045 ? c / 12.92 : ((c + 0.055) / 1.055) ** 2.4;
}
