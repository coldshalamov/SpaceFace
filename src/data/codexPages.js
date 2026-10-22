// codexPages.js — PULSE-CODEX (build_map row 437), the in-world reference half of the codex.
//
// One catalog page per canonical thing a pilot can know: every commodity, hull, module, weapon,
// faction, sector, species, and named figure. Bodies are written in the archive's dry field-guide
// voice and answer three questions where they honestly can: who makes it, who smuggles it, and
// who died for it. Canonical fields carry the facts (commodity.lore already names the crew that
// moves a lot; FAUNA_SPECIES[].note is the field-journal line); CODEX_OVERLAYS carry the authored
// attribution — the yard that welds the hull, the clerk who died over the manifest.
//
// Pure data (src/data/AGENTS.md): no runtime reads, no RNG, no state. The discovery gates that
// decide which page is legible live in src/ui/sim/codexPages.js; the codex screen renders what
// that view hands it.

import { COMMODITIES } from './commodities.js';
import { SHIPS } from './ships.js';
import { MODULES } from './modules.js';
import { WEAPONS } from './weapons.js';
import { FACTION_KITS } from './factions/index.js';
import { SECTORS } from './sectors.js';
import { FAUNA_SPECIES } from './alienFauna.js';
import { FIGURES } from './narrative.js';
import { hash32 } from '../core/rng.js';

export const CODEX_SECTIONS = Object.freeze([
  { id: 'commodities', title: 'Cargo', line: 'What the lanes carry, who refines it, who buries it.' },
  { id: 'hulls', title: 'Hulls', line: 'The fifteen frames the yards will sell you — and the one they will not admit exists.' },
  { id: 'modules', title: 'Modules', line: 'Fittings for the empty slots, priced by what they forgive.' },
  { id: 'weapons', title: 'Weapons', line: 'Every argument a hull can make.' },
  { id: 'factions', title: 'Factions', line: 'Fourteen flags and the cargoes each will not name.' },
  { id: 'sectors', title: 'Sectors', line: 'Twenty-five systems, charted by whoever came back.' },
  { id: 'species', title: 'Xenofauna', line: 'Field notes on what lives where the chart ends.' },
  { id: 'figures', title: 'Figures', line: 'The people whose names keep turning up.' },
]);

// What a locked page admits, per section — never the real name or lore.
export const CODEX_LOCKED_HINTS = Object.freeze({
  commodities: 'Unlogged cargo. Hold it, trade it, or read its price on a market board.',
  hulls: 'An airframe the ledger has not certified for you. Fly one, or find one dead.',
  modules: 'A fitting you have never held. Salvage, buy, or fit it.',
  weapons: 'A mounting you have never held. Salvage, buy, or fit it.',
  factions: 'A flag you have not flown under or been billed by.',
  sectors: 'Off the edge of your chart. Jump there.',
  species: 'No field evidence. Find what it sheds, or go deeper than the beacon roads.',
  figures: 'A name the story has not spoken to you yet.',
});

// ── Authored overlays ──────────────────────────────────────────────────────────────────────
// id → extra sentences woven after the canonical text. `maker` names who builds or moves it;
// `casualty` names who died over it. Only written where the world has an honest answer.

const COMMODITY_OVERLAYS = Object.freeze({
  cmdty_narcotics: {
    maker: 'The Vael refine the resin under their own locks; the Quiet move it after dark.',
    casualty: 'Clerk Yune\'s predecessor was spaced over a pouch that scanned as tea.',
  },
  cmdty_weapons: {
    maker: 'Reach forges stamp them unserialized; Pitborn crates carry the rest.',
    casualty: 'Three customs officers at Charon did not survive a hold that declared "farm tools."',
  },
  cmdty_live_specimen: {
    maker: 'Collected by whoever was brave or desperate enough to close the jar.',
    casualty: 'The first collector\'s name is on the Veil memorial wall; the jar came back empty.',
  },
  cmdty_host_archive_sample: {
    maker: 'Only the Archive grows it, and the Archive does not sell — it lends to the dead.',
    casualty: 'An Understory broker died holding one. The sample is still alive.',
  },
  cmdty_stolen_goods: {
    maker: 'Nobody files a maker. That is the point of the crate.',
    casualty: 'Hale\'s REF 44-C exists because of the last crew that guessed wrong.',
  },
  cmdty_relay_nodule: {
    maker: 'Choir foundries cast them to a hymn specification the foundries will not translate.',
  },
  cmdty_cyst_resin: {
    maker: 'Cut from lantern cysts and spindle broods by people who wash their hands twice.',
  },
  cmdty_ore_iron: {
    maker: 'Drift Miners Collective claims pull it out by the claim-load.',
    casualty: 'Voss can recite the crews the exhausted veins kept.',
  },
  cmdty_revocation_beacon: {
    maker: 'No maker on record. The Verge-Layers leave them where questions accumulate.',
    casualty: 'Everyone who priced one publicly. Ask The Question why.',
  },
  cmdty_fuel_cells: {
    maker: 'Refined everywhere a refinery flag flies; the Reach sells it cut.',
  },
});

const HULL_OVERLAYS = Object.freeze({
  ship_kestrel: { maker: 'Built to a Concord courier pattern the yards stopped stamping. Every pilot\'s first argument.' },
  ship_pelican: { maker: 'Drift Miners yard-stock; the cargo frame eats what the rock gives up.' },
  ship_wasp: { maker: 'Reach-adjacent fighter shops turn these out fast and do not ask what for.' },
  ship_mule: { maker: 'Meridian Trade Syndicate contract freight; boring on purpose, alive because of it.' },
  ship_drifter: { maker: 'A free-market frame assembled from whoever bid lowest that quarter.' },
  ship_hornet: { maker: 'Interceptor shops sell it to people who intend to be somewhere else already.' },
  ship_ironback: { maker: 'Drift Miners heavy barge. Senna\'s crews weld names of the dead inside the keel.' },
  ship_hawser: { maker: 'The tug every hauler curses and every hauler eventually needs.' },
  ship_bastion: { maker: 'Concord-pattern corvette; the Navy sells surplus hulls to people it then watches.' },
  ship_atlas: { maker: 'Meridian flagship freight. The manifests it carries get their own insurance desks.' },
  ship_ranger: { maker: 'Explorer frame sold to people who file flight plans nobody reads.' },
  ship_warden: { maker: 'Gunship hull. Concord law says patrol only; the secondhand market says otherwise.' },
  ship_colossus: { maker: 'Battlecruiser tonnage; the yards that build them answer to flags, not buyers.' },
  ship_leviathan: { maker: 'Flagship-class. A buyer this size gets a file opened, not a receipt.' },
  ship_saucer: {
    maker: 'No yard stamps it. The Vael do not confirm they grow it; nothing else flies that profile.',
    casualty: 'Everyone who has publicly claimed to own one is missing, fined, or fiction.',
  },
});

// Slot-family fallback voices — deterministic pick by hash so un-described modules still read
// authored, not generated.
const MODULE_FAMILY_VOICE = Object.freeze({
  utility: [
    'Bay-shop hardware; it does one unglamorous thing and keeps doing it.',
    'Traded out of a crate at Sker with the serial filed warm.',
    'The kind of box a fitter installs without looking up from the invoice.',
  ],
  engine: [
    'A drive part. The yard welds it where the last one burned out.',
    'Thrust hardware; the rating plate lies a little, which is traditional.',
  ],
  shield: [
    'A projector coil. It answers fire the way an umbrella answers weather.',
    'Shield shop work; the warranty assumes you will not test it personally.',
  ],
  weapon: [
    'A mounting bracket with opinions about what hangs off it.',
    'Ordnance-adjacent hardware; the receipt calls it agricultural.',
  ],
  cargo: [
    'Hold hardware. It makes mass honest, which is the most you can ask of metal.',
    'Freight-shop frame; smells of the last load, always.',
  ],
  reactor: [
    'Power hardware. It hums at a frequency the insurance desk knows by heart.',
    'A coil and a promise; the promise is the expensive part.',
  ],
});

const MODULE_OVERLAYS = Object.freeze({
  unique_blackbird_governor: { maker: 'One governor, one registry: the Quiet built it for a hull they will not name.' },
  unique_choir_bell_aegis: { maker: 'Cast in a Choir foundry to a bell tone; it hums the liturgy back at incoming fire.', casualty: 'The acolyte who tuned it first is still listening. That is the story.' },
  unique_pale_coil_warp_drive: { maker: 'Verge-Layer work, or a very good copy of it; the coil is warm when nothing should be.' },
  unique_truesight_scanner: { maker: 'Archive-pattern optics. It reads what the hull wishes it had not.' },
  unique_quietcloak: { maker: 'The Quiet\'s answer to being interesting: stop being it.', casualty: 'Its last certified owner is listed as "recovered, eventually."' },
  unique_deepsurvey_suite: { maker: 'Survey-crew salvage; the deep arrays were meant to outlive the crew. They did.' },
  unique_phantom_scrambler: { maker: 'A Reach engineer\'s revenge on every targeting computer that ever found her.' },
  unique_smokesong_chaff: { maker: 'Chaff that sings on the way out. Pitborn work — nothing they make is quiet.' },
  unique_cryo_shroud_sink: { maker: 'Cold-storage camouflage; the ship reads as freight with a pulse of zero.' },
  unique_quadrille_box_reader: { maker: 'Reads precursor quadrille boxes. The Archive wants it back. The Archive always wants it back.' },
  unique_double_entry_mask: { maker: 'Bookkeeping hardware: one manifest for Hale, one for the truth.', casualty: 'Dorin posted a bounty against the man who filed the first one.' },
  unique_first_notch_marker: { maker: 'A marker the first Vols crew cut their tally on. It was not meant to leave the hull.' },
  unique_regular_mass_shifter: { maker: 'Shifts mass regularly and slightly illegally; customs scales hate it on principle.' },
  unique_knitbots: { maker: 'Swarm of repair mites in a sock. The Fulfillment calls them "unlicensed labor."' },
  unique_tideline_tractor: { maker: 'A tractor tuned to the tideline between charted and not. Rangers pay stupid money.' },
  unique_no_cut_filament: { maker: 'Filament that refuses to be severed — mined, allegedly, not grown.' },
  unique_toll_saint_bridle: { maker: 'Reach toll hardware, sanctified by a toll-saint. The receipt is a prayer slip.' },
  unique_broken_ring_whip: { maker: 'A ring-gate fragment whipped into a tool. The Verge-Layers have asked, in their way, for it back.' },
  mod_ram_plate_scarred: { maker: 'Pulled off a wreck that rammed something bigger. The scar is structural now.' },
  mod_precursor_handshake_s: { maker: 'Says hello in precursor on the right frequency. Nobody agrees on what it says next.' },
  mod_resonant_massline_m: { maker: 'Tunes the massline to a hum the hull finds calming; the invoice does not.' },
  mod_quiet_equation_s: { maker: 'The Quiet\'s math, boxed. It solves for "was never here."', casualty: 'The equation\'s author redacted themselves.' },
  mod_lattice_coupler_s: { maker: 'Couples to lattice relics only the Archive admits exist.' },
  mod_thruster_stock_s: { maker: 'Stock thruster. The part the yard puts in when you cannot afford the adjective.' },
  mod_thruster_stock_m: { maker: 'Stock thruster, mid-frame. Honest thrust, honest burn.' },
  mod_thruster_stock_l: { maker: 'Stock thruster, heavy frame. The bolt pattern is older than most pilots.' },
  mod_claw_anchor_s: { maker: 'Custody-hardware; bounty crews fit it when the mark\'s hull is worth more intact.' },
  mod_signature_reader_s: { maker: 'Reads a drive plume the way a clerk reads a forged seal — for the lie of it.' },
});

const WEAPON_OVERLAYS = Object.freeze({
  wpn_saucer_death_ray: {
    maker: 'Integral to the Saucer frame — if the Saucer exists, so does this. Neither is on a receipt.',
    casualty: 'Ask the ghost convoys. The ledger calls it "unattributed energy event."',
  },
});

const FACTION_OVERLAYS = Object.freeze({
  faction_scn: { maker: 'Runs the patrol grid, the customs desk, and the forms both are filed on.', casualty: 'Hale files REF 44-C in the name of everyone the grid could not save.' },
  faction_mts: { maker: 'Owns the freight lanes it does not bother to patrol; price is the only law with a signature.' },
  faction_dmc: { maker: 'Mines the drift, drinks the dust, and keeps the names of the crews the veins kept.', casualty: 'Senna reads the roll at shift end. It gets longer.' },
  faction_reach: { maker: 'Tolls the lanes it cannot hold outright; a Reach stamp means you paid, not that you are safe.', casualty: 'Sker Vane\'s toll-saints died proving the toll was negotiable. It was not.' },
  faction_quiet: { maker: 'Moves what the other thirteen will not touch, through doors that do not officially open.', casualty: 'Maera Vols flew their colors. The crew manifest is still mostly blank.' },
  faction_vael: { maker: 'Xeno-reclusive; their lockers move cargo at night and their biology is nobody\'s business.' },
  faction_free: { maker: 'Independent haulers flying their own flag because nobody else\'s fit.', casualty: '"Coldburn" Rey drinks to the ones who went independent and stayed that way.' },
  faction_choir: { maker: 'Casts relics to a hymn spec and listens for the answer in the relay band.' },
  faction_helix: { maker: 'Paper-first authority; their writs arrive before their ships do and outlast them.' },
  faction_understory: { maker: 'Grows in the wreck-filament understory; trades in what the dead left composting.' },
  faction_fulfillment: { maker: 'The administrative automaton; it processes you the way weather processes a field.' },
  faction_archive: { maker: 'Silent-script archivists. They do not confiscate — they accession.', casualty: 'Everything in the collection is a casualty of being remembered.' },
  faction_pitborn: { maker: 'Escaped scrappers welding patchwork miracles out of the Pit\'s offal.' },
  faction_verge_layers: { maker: 'Precursor-interrogative; they leave relics where the questions accumulate and wait for the answer to arrive screaming.' },
});

const SECTOR_OVERLAYS = Object.freeze({
  sector_helios_prime: 'The Concord\'s shop window. Everything legal, everything priced, everything watched.',
  sector_ceres_belt: 'First belt, first lesson: the rock does not care about your manifest.',
  sector_tethys_junction: 'Where the lanes braid. Half the rumor-trade passes through with the cargo.',
  sector_vesta_forge: 'Foundry sector; the glow is honest work and the smoke is somebody\'s claim.',
  sector_pallas_drift: 'Quiet rock, long sightlines, and claims filed on faith.',
  sector_io_reach: 'Listening posts and the traffic that learned to whisper back.',
  sector_charon_expanse: 'The long dark between customs desks. Smugglers call it "the reading room."',
  sector_sker_haven: 'Reach country. The bazaar prices everything, including you.',
  sector_veil_nebula: 'Research Station Veil and the things Dr. Suhl has not translated yet.',
  sector_ashfall_reach: 'A ledger that kept running after everyone else left. Kurtz is still there.',
  sector_nyx_march: 'Frontier march; the patrol grid thins to a rumor of itself.',
  sector_hyperion_cut: 'A lane cut through wreck-mass older than the Concord.',
  sector_kepler_scar: 'The scar is the map; everything else is collateral.',
  sector_orcus_shadow: 'Where shadows the size of stations drift without comment.',
  sector_rhea_cinder: 'Burned-over belt; the cinder fields still pay if you sift them right.',
  sector_haumea_rift: 'The rift reads your drive plume and decides to be elsewhere.',
  sector_eris_margin: 'Margin space — the chart\'s apology for what it cannot promise.',
  sector_phoebe_echo: 'Every signal arrives twice here. The second one lies.',
  sector_nereid_shoal: 'Shoal water for hulls; wreck-divers file the names in Senna\'s book.',
  sector_proteus_well: 'The well at the lane\'s bottom; what falls in, the Understory catalogues.',
  sector_triton_wake: 'Wake-line territory — follow a big enough hull and the law forgets you.',
  sector_eunomia_gulf: 'Wide, legal, and dull until it is none of those.',
  sector_sedna_dark: 'The dark the Verge-Layers asked about first. It is still answering.',
  sector_dione_lane: 'The straight shot everyone takes and nobody watches.',
  sector_the_bolus: 'Not a sector — a mouth the chart agreed to draw around.',
});

const CHARACTER_OVERLAYS = Object.freeze({
  protagonist: 'Wren, current pilot of the Tessera. Concord Registry lists the operator as UNKNOWN; the ship knows better than the paperwork.',
  vale: 'Concord administrator. Vale appears through forwarded paperwork, authorization codes, and systems that make refusal more expensive than compliance.',
  kessler: 'Cargo registrar tied to the 47-A weight variance. If a manifest changes mass, his initials usually survive the transfer.',
  mira: 'Bourse freight seal clerk. When the verification database agrees with the cargo seal, the seal becomes the story everyone else must use.',
  hale: 'Gate 3 customs officer. Hale does not need to open a sealed hold; he only needs to file the second fine correctly.',
  rook: 'Bounty broker. A clean tag is useful because it can be billed twice before anyone asks which target was real.',
  slate: 'Shipyard welder. His repairs look official because they are signed official, which is not the same as safe.',
  quinn: 'Outpost 9 bar proprietor. Rates stay posted, management keeps changing, and the drawer always closes on the same count.',
  voss: 'Drift claim recorder. Exhausted claims have a way of becoming fresh again for the crew that files second.',
  elroy: 'Pit Engineering maintenance worker attached to the recycler report. The bounty paperwork called him hostile; the ledger says why that mattered.',
  kurtz: 'The Ashfall figure. His station is less a confession than a ledger that kept running after everyone else left.',
  clerk_yune: 'The Quiet\'s sealed-evidence broker. Everything has a price; hers have citations.',
  coldburn_rey: 'Free Frontier\'s loudest independent. Races you for the same contract and buys the first round whoever loses.',
  iren_suhl: 'Xenolinguist at Research Station Veil. Translates what the deep fauna means by what it does to your hull.',
  warrant_orrin: 'Concord Inspector General. The evidence-case witness the case was built around.',
  sker_vane: 'Crimson Reach lane kingpin. The toll is the toll; the courtesy is optional.',
  dustwife_senna: 'Drift Miners wreck elder and keeper of names. If a crew died in the drift, she files them.',
  latch_child: 'Feral salvage automaton running Quiet logistics with an origin nobody can file.',
  the_question: 'A persistent interrogative of precursor make. Every artifact it leaves is a question with mass.',
  filecleaver_dorin: 'Concord records clerk who cleaved the wrong file open and is now bounty-posted for honesty.',
  lira_vonn: 'Independent correspondent of The Margin. Files the stories the factions pay to keep unfiled.',
  tinker_zell: 'Sker Bazaar\'s black-market mechanic. If it fits, he\'ll weld it; if it doesn\'t, he\'ll make it.',
  mara_children: 'Civilian convoy survivors. The refugee witness whose testimony the factions keep misplacing.',
  wraith_kell: 'The Quiet\'s deep-cover manifest clerk at Customs. Reads every seal, forgets none, remembers being paid to.',
  halev_doss: 'Helios public archive. The last academic still filing what the Concord would rather misplace.',
  maera_vols: 'Previous captain of the Tessera. Her crew\'s manifest is the blank the story keeps circling.',
});

// When each non-core figure's page unseals: at this story beat, or the moment the story
// writes a flag under their id (some arrive through signals, not the spine). Beats mirror
// the codex screen's own FIGURE_GATED table; late-arc figures sit deeper.
const FIGURE_UNLOCK_BEATS = Object.freeze({
  coldburn_rey: 1, sker_vane: 2, dustwife_senna: 2, elroy: 2, tinker_zell: 2,
  clerk_yune: 3, iren_suhl: 3, latch_child: 3, lira_vonn: 3, halev_doss: 3, vale: 3,
  mira: 4, rook: 4, filecleaver_dorin: 4, mara_children: 4,
  warrant_orrin: 5, wraith_kell: 5,
  kurtz: 6, the_question: 6, maera_vols: 6,
});
const FIGURE_ALWAYS = new Set(['protagonist', 'kessler', 'hale', 'slate', 'quinn', 'voss']);

// ── Composers ────────────────────────────────────────────────────────────────────────────

const SECTOR_BY_ID = new Map(SECTORS.map((s) => [s.id, s]));
const FACTION_BY_ID = new Map(Object.values(FACTION_KITS).map((k) => [k.id, k]));

function factionName(id) {
  const kit = FACTION_BY_ID.get(id);
  return kit ? kit.name : String(id || 'unknown flag');
}

function sectorName(id) {
  const sector = SECTOR_BY_ID.get(id);
  return sector ? sector.name : String(id || 'uncharted');
}

// producedBy/consumedBy role keys → who actually moves it.
const CARGO_ROLE_PHRASE = Object.freeze({
  mining: 'drift claims and belt crews',
  refinery: 'the refinery flags',
  fab: 'fabricator combines',
  trade_hub: 'the exchange floors',
  blackmarket: 'unlicensed lockers',
  military: 'the quartermaster desks',
  research: 'the research stations',
  agriculture: 'the grow-vats',
  medical: 'the med-bays',
  salvage: 'the wreck-dives',
});

function rolePhrase(role) {
  return CARGO_ROLE_PHRASE[role] || 'whoever stocks it';
}

function commodityBody(def) {
  const sentences = [];
  if (def.desc) sentences.push(def.desc);
  if (def.lore) sentences.push(def.lore);
  const made = Array.isArray(def.producedBy) && def.producedBy.length
    ? `Moved out of ${def.producedBy.map(rolePhrase).join(' and ')}.`
    : '';
  const used = Array.isArray(def.consumedBy) && def.consumedBy.length
    ? `Bought by ${def.consumedBy.map(rolePhrase).join(' and ')}.`
    : '';
  if (made) sentences.push(made);
  if (used) sentences.push(used);
  if (def.legality && def.legality !== 'legal') {
    sentences.push(`Customs files it as ${def.legality}; a fine multiplier of ${def.fineMult || '—'} applies to whoever signs the manifest.`);
  }
  const overlay = COMMODITY_OVERLAYS[def.id];
  if (overlay) {
    if (overlay.maker) sentences.push(overlay.maker);
    if (overlay.casualty) sentences.push(overlay.casualty);
  }
  return sentences.join(' ');
}

function hullBody(def) {
  const sentences = [];
  const overlay = HULL_OVERLAYS[def.id];
  if (overlay && overlay.maker) sentences.push(overlay.maker);
  sentences.push(`A ${def.role || 'working'} frame — T${def.tier != null ? def.tier : '?'} tonnage, ${def.cargo != null ? def.cargo : '—'} cargo, priced at ${def.price != null ? def.price : 'unpriced'} credits where they admit to selling it.`);
  if (overlay && overlay.casualty) sentences.push(overlay.casualty);
  return sentences.join(' ');
}

function modPhrase(key, value) {
  switch (key) {
    case 'radarRangePct': return 'reads further down the lane';
    case 'shieldRegenMult': return 'knits the shield faster';
    case 'energyRegenMult': return 'feeds the capacitor';
    case 'cargoCapMult': return 'makes the hold bigger on the inside';
    case 'tradeFeeMult': return 'talks the fee desk down';
    case 'miningYieldMult': return 'argues more rock out of the seam';
    case 'containmentSeal': return 'seals what customs should not smell';
    case 'marketIntel': return 'whispers market prices before you dock';
    case 'stealthBio': return 'reads as cargo to a bio-scan';
    case 'thrustMult': case 'thrust': return 'pushes harder per unit of nerve';
    case 'speedMult': return 'raises the top end';
    case 'turnMult': case 'turnRateMult': return 'answers the stick faster';
    case 'energyCapMult': case 'energyCap': return 'deepens the reserve';
    case 'heatDissipMult': case 'cooling': return 'sheds heat it was never rated for';
    case 'fuelEffMult': case 'fuelEff': return 'stretches a tank further than honest';
    case 'armorMult': case 'armor': return 'adds skin where the seam was thin';
    default: return 'does its job';
  }
}

function moduleBody(def) {
  const sentences = [];
  if (def.description) sentences.push(def.description);
  const overlay = MODULE_OVERLAYS[def.id];
  const mods = def.mods && typeof def.mods === 'object' ? Object.keys(def.mods) : [];
  if (mods.length) {
    const phrases = [...new Set(mods.map((k) => modPhrase(k, def.mods[k])))].slice(0, 2);
    sentences.push(`In the field it ${phrases.join(' and it ')}.`);
  } else if (!def.description) {
    const family = MODULE_FAMILY_VOICE[def.slotType] || MODULE_FAMILY_VOICE.utility;
    const pick = family[hash32(def.id) % family.length];
    sentences.push(pick);
    sentences.push(`Fills a ${def.slotType || 'utility'} ${def.size || ''} slot at T${def.tier != null ? def.tier : '?'}.`);
  } else {
    sentences.push(`Fills a ${def.slotType || 'utility'} ${def.size || ''} slot at T${def.tier != null ? def.tier : '?'}.`);
  }
  if (overlay) {
    if (overlay.maker) sentences.push(overlay.maker);
    if (overlay.casualty) sentences.push(overlay.casualty);
  } else if (!def.description && def.purchasable !== false) {
    sentences.push('Listed on the open market; no maker\'s stamp worth reading.');
  } else if (def.purchasable === false && !overlay) {
    sentences.push('Not on any market list. You find it or you do not.');
  }
  return sentences.join(' ');
}

function weaponBody(def) {
  const sentences = [];
  if (def.sentence) sentences.push(def.sentence.charAt(0).toUpperCase() + def.sentence.slice(1));
  const overlay = WEAPON_OVERLAYS[def.id];
  sentences.push(`Mounts ${def.mount || def.slotType || 'hardpoint'}${def.size ? ' ' + def.size : ''}, ${def.damageType || 'kinetic'} damage, ${def.dps != null ? def.dps + ' dps' : 'output unlisted'}.`);
  if (def.purchasable === false) sentences.push('Not on any market list; it arrives attached to the hull that owns it.');
  if (overlay) {
    if (overlay.maker) sentences.push(overlay.maker);
    if (overlay.casualty) sentences.push(overlay.casualty);
  }
  return sentences.join(' ');
}

function factionBody(kit) {
  const sentences = [];
  const homes = (kit.homeSectors || []).map(sectorName);
  if (homes.length) sentences.push(`Holds ${homes.join(', ')}.`);
  if (kit.personality) sentences.push(`Read by the lanes as "${kit.personality}."`);
  const overlay = FACTION_OVERLAYS[kit.id];
  if (overlay && overlay.maker) sentences.push(overlay.maker);
  const illegal = kit.illegalCommodities && Array.isArray(kit.illegalCommodities)
    ? kit.illegalCommodities : null;
  if (illegal && illegal.length) {
    sentences.push('Files certain cargoes as unwelcome at its customs desks.');
  }
  if (overlay && overlay.casualty) sentences.push(overlay.casualty);
  return sentences.join(' ');
}

function sectorBody(def) {
  const sentences = [];
  const overlay = SECTOR_OVERLAYS[def.id];
  if (overlay) sentences.push(overlay);
  const owner = def.factionId ? factionName(def.factionId) : null;
  if (owner) sentences.push(`${owner} flies the flag where a flag would stick.`);
  sentences.push(`${def.stations ? def.stations.length : 0} station${def.stations && def.stations.length === 1 ? '' : 's'} on the chart, security ${def.security != null ? def.security : 'unrated'}, ${def.neighbors ? def.neighbors.length : 0} gate${def.neighbors && def.neighbors.length === 1 ? '' : 's'} out.`);
  if (def.hazards && def.hazards.length) sentences.push('The hazard list is on file; the pilots who skipped it are too.');
  return sentences.join(' ');
}

function speciesBody(def) {
  const sentences = [];
  if (def.note) sentences.push(def.note.charAt(0).toUpperCase() + def.note.slice(1));
  const anatomy = def.anatomy || {};
  const tissue = [anatomy.hostTissue, anatomy.fungalTissue].filter(Boolean).join(' over ');
  if (tissue) sentences.push(`Tissue reads as ${tissue}.`);
  if (def.role) sentences.push(`Behaves as a ${def.role}${def.capturable ? '; a live one fits in a specimen jar, which is more than most crews get' : ''}.`);
  if (def.coherenceLoss) sentences.push('Coherence loss on record; it does not survive being understood.');
  return sentences.join(' ');
}

function figureBody(id, fig) {
  const overlay = CHARACTER_OVERLAYS[id];
  const sentences = [];
  if (overlay) sentences.push(overlay);
  if (fig.org) sentences.push(`Filed under ${fig.org}.`);
  if (fig.role && !overlay) sentences.push(`Role on record: ${fig.role}.`);
  return sentences.join(' ');
}

// ── Catalog build ────────────────────────────────────────────────────────────────────────

function entry(section, id, name, body, meta = {}) {
  return Object.freeze({ section, id, name, body, ...meta });
}

function buildCatalog() {
  const pages = [];
  for (const def of COMMODITIES) {
    pages.push(entry('commodities', def.id, def.displayName || def.name || def.id,
      commodityBody(def), { tag: def.legality && def.legality !== 'legal' ? def.legality : 'legal' }));
  }
  for (const def of SHIPS) {
    pages.push(entry('hulls', def.id, def.name || def.id, hullBody(def),
      { tag: `T${def.tier != null ? def.tier : '?'} ${def.role || ''}`.trim() }));
  }
  for (const def of MODULES) {
    pages.push(entry('modules', def.id, def.name || def.id, moduleBody(def),
      { tag: `${def.slotType || 'mod'} ${def.size || ''} T${def.tier != null ? def.tier : '?'}` }));
  }
  for (const def of WEAPONS) {
    pages.push(entry('weapons', def.id, def.name || def.id, weaponBody(def),
      { tag: `${def.mount || def.slotType || 'mount'} ${def.damageType || ''}`.trim() }));
  }
  for (const kit of Object.values(FACTION_KITS)) {
    pages.push(entry('factions', kit.id, kit.name || kit.id, factionBody(kit), { tag: kit.personality || '' }));
  }
  for (const def of SECTORS) {
    pages.push(entry('sectors', def.id, def.name || def.id, sectorBody(def),
      { tag: `T${def.tier != null ? def.tier : '?'} security ${def.security != null ? def.security : '—'}` }));
  }
  for (const def of Object.values(FAUNA_SPECIES)) {
    pages.push(entry('species', def.id, def.name || def.id, speciesBody(def),
      { tag: def.role || 'fauna' }));
  }
  for (const [id, fig] of Object.entries(FIGURES)) {
    pages.push(entry('figures', id, fig.name || id, figureBody(id, fig), { tag: fig.org || fig.role || '' }));
  }
  return Object.freeze(pages);
}

/** All pages, in section order. Pure — unlock state is applied by the view in ui/sim/codexPages.js. */
export const CODEX_PAGES = buildCatalog();

const PAGE_BY_ID = new Map(CODEX_PAGES.map((p) => [p.id, p]));
export function codexPageById(id) { return PAGE_BY_ID.get(id) || null; }

/** Which gate a page answers to — the view maps these onto live state. */
export function codexPageGate(page) {
  if (!page) return 'none';
  switch (page.section) {
    case 'commodities': return 'commodity';
    case 'hulls': return 'hull';
    case 'modules': case 'weapons': return 'equipment';
    case 'factions': return 'faction';
    case 'sectors': return 'sector';
    case 'species': return 'species';
    case 'figures': {
      if (FIGURE_ALWAYS.has(page.id)) return 'always';
      if (page.id in FIGURE_UNLOCK_BEATS) return 'beat';
      return 'story';
    }
    default: return 'always';
  }
}

export function codexFigureUnlockBeat(id) {
  return FIGURE_UNLOCK_BEATS[id] != null ? FIGURE_UNLOCK_BEATS[id] : null;
}

export default { CODEX_SECTIONS, CODEX_PAGES, CODEX_LOCKED_HINTS, codexPageById, codexPageGate, codexFigureUnlockBeat };
