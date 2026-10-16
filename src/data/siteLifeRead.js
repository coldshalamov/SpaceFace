// Biomass, activity, and confidence stay separate.
// A quiet relay on a site that still has life is suppression, not eradication.

export const SITE_LIFE_SUPPRESSED =
  'SUPPRESSED. BIOMASS IS STILL HERE. ACTIVITY IS QUIET. THE RELAY WENT QUIET. THE SITE IS NOT DEAD.';
export const SITE_LIFE_STERILE =
  'STERILE. NO BIOMASS. THE GROUND WAS HELD EMPTY ON PURPOSE.';
export const SITE_LIFE_UNKNOWN =
  'UNKNOWN. NO SAMPLE. BIOMASS, ACTIVITY, AND CONFIDENCE ARE NOT KNOWN.';
export const SITE_LIFE_LIVING =
  'LIVING. BIOMASS IS PRESENT. ACTIVITY IS UP.';
export const SITE_LIFE_ERADICATED =
  'ERADICATED. THE BIOMASS ITSELF IS GONE.';
export const SITE_LIFE_THIN =
  'UNKNOWN. THE SAMPLE DOES NOT SEPARATE BIOMASS FROM A QUIET RELAY.';

const BIOMASS = ['living', 'none', 'unknown'];
const ACTIVITY = ['active', 'quiet', 'unknown'];
const CONFIDENCE = ['sure', 'thin', 'none'];
const READING = ['living', 'suppressed', 'sterile', 'unknown', 'eradicated'];

function pack(biomass, activity, confidence, reading, text) {
  return { biomass, activity, confidence, reading, text };
}

export function readSiteLife(input) {
  const src = input && typeof input === 'object' ? input : {};
  if (src.sampled !== true) {
    return pack('unknown', 'unknown', 'none', 'unknown', SITE_LIFE_UNKNOWN);
  }
  const living = src.living === true && src.biomassGone !== true;
  const relayQuiet = src.relayQuiet === true || src.suppressed === true;
  if (living) {
    if (relayQuiet) return pack('living', 'quiet', 'sure', 'suppressed', SITE_LIFE_SUPPRESSED);
    return pack('living', 'active', 'sure', 'living', SITE_LIFE_LIVING);
  }
  if (src.biomassGone === true) {
    return pack('none', 'quiet', 'sure', 'eradicated', SITE_LIFE_ERADICATED);
  }
  if (src.sterile === true) {
    return pack('none', 'quiet', 'sure', 'sterile', SITE_LIFE_STERILE);
  }
  return pack('unknown', 'unknown', 'thin', 'unknown', SITE_LIFE_THIN);
}

export function lifeSampleFromSite(site, rec, sampled) {
  const cast = site && site.faunaCast && typeof site.faunaCast === 'object' ? site.faunaCast : {};
  const castLiving = Object.keys(cast).some((key) => Number(cast[key]) > 0);
  const biomassGone = !!(rec && rec.biomassGone === true);
  const sterile = !!(site && site.sterile === true);
  const living = castLiving && !biomassGone && !sterile;
  const relayQuiet = !!(rec && (rec.relaySevered === true || rec.state === 'severed'));
  return {
    sampled: sampled === true,
    sterile,
    living,
    relayQuiet,
    suppressed: relayQuiet && living,
    biomassGone,
  };
}

export function copyLifeRead(raw) {
  if (!raw || typeof raw !== 'object') return null;
  const biomass = BIOMASS.includes(raw.biomass) ? raw.biomass : 'unknown';
  let activity = ACTIVITY.includes(raw.activity) ? raw.activity : 'unknown';
  const confidence = CONFIDENCE.includes(raw.confidence) ? raw.confidence : 'none';
  let reading = READING.includes(raw.reading) ? raw.reading : 'unknown';
  let text = typeof raw.text === 'string' ? raw.text : '';
  if (reading === 'eradicated' && biomass === 'living') {
    reading = 'suppressed';
    activity = 'quiet';
    text = SITE_LIFE_SUPPRESSED;
  }
  return { biomass, activity, confidence, reading, text };
}
