// Plan 53 — discovered bestiary.
//
// These are not static help pages. The registered scanReveal owner records the first real scanner
// reveal and the first real player hit for each stable enemy identity. The Codex projects those
// durable receipts: a scan names the page, combat completes it, and only then is the useful counter
// note shown.

const ROWS = [
  ['wasp_swarmer', 'Wasp Swarmer', 'Swarmer',
    'Cheap guns become expensive when six firing arcs overlap.',
    'Break the cloud. Shove or kill one edge, then work the exposed hulls instead of chasing the center.'],
  ['dart_swarmer', 'Dart', 'Swarmer',
    'A straight-line knife with more engine than turn authority.',
    'Cross its lane. Do not chase; make the Dart spend a whole pass turning back.'],
  ['flea_swarmer', 'Flea', 'Swarmer',
    'The little hull is only dangerous while its drag rig stays planted.',
    'Displace the anchor or kill it during spool. Leaving the field is also a win.'],
  ['skitter_swarmer', 'Skitter', 'Swarmer',
    'It fights from the asteroid rather than from its own armor.',
    'Strip the cover: break, tether, or shove the rock before taking the shot.'],
  ['ember_swarmer', 'Ember', 'Swarmer',
    'A weak reactor carried deliberately into knife range.',
    'Choose where it dies. Pop the core beside its pack and let the cook-off move the fight.'],
  ['marauder_brawler', 'Marauder', 'Medium',
    'Close pressure, heavy autocannon, and a retreat once the hull begins to show daylight.',
    'Break its control frame, then use terrain or a hard shove before it can dump mass and leave.'],
  ['lancer_sniper', 'Lancer Sniper', 'Medium',
    'The long gun is the fight. The hull exists to move that gun to a new bearing.',
    'Close under its slow turn or clump it in a Well; do not trade clean lanes at range.'],
  ['hostile_interceptor', 'Interceptor', 'Medium',
    'Fast enough to punish an escape and light enough to inherit every bad vector.',
    'Sink its momentum or feed it terrain. A straight chase gives it the fight it wants.'],
  ['bulwark_escort', 'Bulwark', 'Medium',
    'Its projector spends shield on the wing, turning several ordinary hulls into one problem.',
    'Separate the Bulwark from the formation or strip the projector before grinding the escorts.'],
  ['corsair_raider', 'Corsair Raider', 'Medium',
    'A cargo thief that makes the stolen mass part of its escape plan.',
    'Pressure the towing hull below its retreat line; it must dump the same physical cargo to flee.'],
  ['torcher_denial', 'Torcher', 'Medium',
    'Plasma rails turn empty space into a temporary wall.',
    'Read the ignition tell, cross before the line roots, then punish the slow reversal.'],
  ['heavy_gunship', 'Gunship', 'Heavy',
    'A rotating pressure ring wrapped around a barge-sized mass.',
    'Select and strip exposed mounts. Once the turret ring is gone, shove the barge or leave it.'],
  ['heavy_ramscoop', 'Ramscoop', 'Heavy',
    'The prow commits the whole ship to one announced lane.',
    'Dodge after the spool locks, then let terrain collect the mass. Shooting the prow cancels the commit.'],
  ['heavy_carrier_lite', 'Carrier-lite', 'Heavy',
    'Two launch bays turn time into a growing light-craft screen.',
    'Strip the bays during the opening tell. Every destroyed bay is fewer physical launches later.'],
  ['heavy_foundry', 'Foundry', 'Heavy',
    'Industrial cutters protect a rack of charged ore that is dangerous to everyone nearby.',
    'Detonate or repulse the ore, then strip the rack so the mine line cannot be rebuilt.'],
  ['mine_layer_jackal', 'Mine-Layer Jackal', 'Specialist',
    'It seeds the wake and makes a clean pursuit lane cost hull.',
    'Cut the tether or clear the wake. A Repulsor turns its physical mines into somebody else’s route.'],
  ['pd_screen_escort', 'Point-Defense Screen', 'Specialist',
    'Its flak spends a real shot to remove one assigned incoming projectile.',
    'Hold missiles, peel the escort with kinetics, then launch after the interception screen is gone.'],
  ['jammer_specialist', 'Jammer', 'Specialist',
    'The fan smears what the radar draws; it does not move the underlying ships.',
    'Close inside the fuzz or kill the source. Your weapons still answer to the real physical target.'],
];

export const CODEX_BESTIARY = Object.freeze(ROWS.map((row, index) => Object.freeze({
  id: row[0],
  order: index,
  title: row[1],
  family: row[2],
  fieldRead: row[3],
  counterplay: row[4],
})));

const BY_ID = new Map(CODEX_BESTIARY.map((entry) => [entry.id, entry]));

export function codexBestiaryEntry(enemyTypeId) {
  return BY_ID.get(String(enemyTypeId || '')) || null;
}

export function codexBestiaryEnemyId(entity) {
  const data = entity && entity.data || {};
  const enemyTypeId = data.enemyTypeId || data.lootTableId || null;
  return codexBestiaryEntry(enemyTypeId) ? enemyTypeId : null;
}

export function bestiaryProgressRecord(story, enemyTypeId) {
  const rows = story && story.flags && story.flags.codexLore && story.flags.codexLore.bestiary;
  const row = rows && rows[enemyTypeId];
  if (!row || typeof row !== 'object') return null;
  return {
    scannedAt: Number.isFinite(row.scannedAt) ? row.scannedAt : null,
    engagedAt: Number.isFinite(row.engagedAt) ? row.engagedAt : null,
    defeatedAt: Number.isFinite(row.defeatedAt) ? row.defeatedAt : null,
    defeats: Math.max(0, Math.min(999, Math.floor(Number(row.defeats) || 0))),
  };
}

export function codexBestiaryPages(story = {}) {
  return CODEX_BESTIARY.map((entry) => {
    const progress = bestiaryProgressRecord(story, entry.id);
    const scanned = progress && progress.scannedAt != null;
    const engaged = progress && progress.engagedAt != null;
    return Object.freeze({
      ...entry,
      progress,
      scanned: !!scanned,
      engaged: !!engaged,
      complete: !!(scanned && engaged),
    });
  });
}

function earliest(a, b) {
  const values = [a, b].filter(Number.isFinite);
  return values.length ? Math.min(...values) : null;
}

export function mergeCodexBestiaryRows(legacyRows, currentRows) {
  const legacy = legacyRows && typeof legacyRows === 'object' ? legacyRows : {};
  const current = currentRows && typeof currentRows === 'object' ? currentRows : {};
  const merged = {};
  for (const entry of CODEX_BESTIARY) {
    const a = legacy[entry.id] && typeof legacy[entry.id] === 'object' ? legacy[entry.id] : null;
    const b = current[entry.id] && typeof current[entry.id] === 'object' ? current[entry.id] : null;
    if (!a && !b) continue;
    const row = {
      scannedAt: earliest(a && a.scannedAt, b && b.scannedAt),
      engagedAt: earliest(a && a.engagedAt, b && b.engagedAt),
      defeatedAt: earliest(a && a.defeatedAt, b && b.defeatedAt),
      defeats: Math.max(0, Math.min(999,
        Math.floor(Math.max(Number(a && a.defeats) || 0, Number(b && b.defeats) || 0)))),
    };
    if (row.scannedAt == null) delete row.scannedAt;
    if (row.engagedAt == null) delete row.engagedAt;
    if (row.defeatedAt == null) delete row.defeatedAt;
    if (!row.defeats) delete row.defeats;
    merged[entry.id] = row;
  }
  return merged;
}
