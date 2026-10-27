// Translation pipeline: machine first for inventory copy, overlays for store + bark (reviewed).
// Deterministic. Placeholders, numbers, and proper nouns pass through untouched.

import { messages as englishMessages } from './catalogs/en-US.generated.js';
import { STORE_COPY } from './storeCopy.js';
import { barkMessagesFor, barkTextMap } from './barks.js';
import { FIRST_HOUR_OVERLAY } from './firstHourOverlay.js';
import GLOSSARY_ES from './glossary/es-ES.js';
import GLOSSARY_FR from './glossary/fr-FR.js';
import GLOSSARY_DE from './glossary/de-DE.js';
import GLOSSARY_PT from './glossary/pt-BR.js';

export const SHIPPED_LOCALES = Object.freeze(['en-US', 'es-ES', 'fr-FR', 'de-DE', 'pt-BR']);

const PLACEHOLDER_SPLIT_RE = /(\{[A-Za-z_][A-Za-z0-9_.-]*\})/g;
const PLACEHOLDER_TOKEN_RE = /^\{[A-Za-z_][A-Za-z0-9_.-]*\}$/;

const PROPER = new Set([
  'spaceface', 'helios', 'ceres', 'tethys', 'ashfall', 'tessera', 'hitch', 'kestrel', 'wasp',
  'pelican', 'mule', 'hornet', 'massline', 'crucible', 'concord', 'meridian', 'vael', 'choir',
  'reach', 'quiet', 'frontier', 'drift', 'vale', 'yune', 'rook', 'wren', 'scn', 'mts', 'dmc',
  'wanted', 'hud', 'ref', 'cr', 'wu', 'iff', 'vhl',
]);

const L = (es, fr, de, pt) => Object.freeze({ 'es-ES': es, 'fr-FR': fr, 'de-DE': de, 'pt-BR': pt });

const PHRASES = Object.freeze({
  'New Game': L('Nueva partida', 'Nouvelle partie', 'Neues Spiel', 'Novo jogo'),
  'Continue': L('Continuar', 'Continuer', 'Fortsetzen', 'Continuar'),
  'Load Game': L('Cargar partida', 'Charger une partie', 'Spiel laden', 'Carregar jogo'),
  'Settings': L('Ajustes', 'Réglages', 'Einstellungen', 'Configurações'),
  'Signal Archive': L('Archivo de señales', 'Archive des signaux', 'Signalarchiv', 'Arquivo de sinais'),
  'Continue: {summary}': L('Continuar: {summary}', 'Continuer : {summary}', 'Fortsetzen: {summary}', 'Continuar: {summary}'),
  'No save found — Start a New Game to begin in Helios.': L(
    'No hay partida guardada — Inicia una nueva partida para comenzar en Helios.',
    'Aucune sauvegarde trouvée — Lancez une nouvelle partie pour débuter à Helios.',
    'Kein Spielstand gefunden — Starte ein neues Spiel, um in Helios zu beginnen.',
    'Nenhum jogo salvo encontrado — Inicie um novo jogo para começar em Helios.',
  ),
  'Flight Systems Online': L(
    'Sistemas de vuelo en línea',
    'Systèmes de vol en ligne',
    'Flugsysteme online',
    'Sistemas de voo online',
  ),
  'Space Flight & Exploration': L(
    'Vuelo espacial y exploración',
    'Vol spatial et exploration',
    'Raumflug und Erkundung',
    'Voo espacial e exploração',
  ),
  'Deep Space Flight Systems': L(
    'Sistemas de vuelo del espacio profundo',
    'Systèmes de vol en espace lointain',
    'Tiefraum-Flugsysteme',
    'Sistemas de voo no espaço profundo',
  ),
  'Helios System · Frontier Sector': L(
    'Sistema Helios · Sector fronterizo',
    'Système Helios · Secteur frontière',
    'Helios-System · Grenzsektor',
    'Sistema Helios · Setor de fronteira',
  ),
  'Mine the anomalous ore deposit, then dock at Helios Station.': L(
    'Mina el depósito de mineral anómalo y luego atraca en la Estación Helios.',
    'Extrayez le gisement de minerai anormal, puis amarrez-vous à la Station Helios.',
    'Baue das anomale Erzdepot ab und docke dann an der Station Helios an.',
    'Minere o depósito de minério anômalo e depois acople na Estação Helios.',
  ),
  'Choose your starting ship and pilot credentials.': L(
    'Elige tu nave inicial y credenciales de piloto.',
    'Choisissez votre vaisseau initial et vos identifiants de pilote.',
    'Wählen Sie Ihr Startschiff und Ihre Pilotendaten.',
    'Escolha sua nave inicial e credenciais de piloto.',
  ),
  'Pilot name': L('Nombre del piloto', 'Nom du pilote', 'Pilotenname', 'Nome do piloto'),
  'Difficulty': L('Dificultad', 'Difficulté', 'Schwierigkeit', 'Dificuldade'),
  'First 15 minutes': L('Primeros 15 minutos', '15 premières minutes', 'Erste 15 Minuten', 'Primeiros 15 minutos'),
  'Back': L('Atrás', 'Retour', 'Zurück', 'Voltar'),
  'Launch': L('Despegar', 'Lancer', 'Start', 'Lançar'),
  'Launching...': L('Despegando...', 'Lancement...', 'Startet...', 'Lançando...'),
  'Paused': L('Pausa', 'Pause', 'Pausiert', 'Pausado'),
  'FLIGHT BRIEF': L('PARTE DE VUELO', 'BRIEFING DE VOL', 'FLUGBRIEFING', 'BRIEFING DE VOO'),
  'Resume': L('Reanudar', 'Reprendre', 'Fortsetzen', 'Retomar'),
  'Save': L('Guardar', 'Sauvegarder', 'Speichern', 'Salvar'),
  'Load': L('Cargar', 'Charger', 'Laden', 'Carregar'),
  'Mission Log ({key})': L('Registro de misiones ({key})', 'Journal de mission ({key})', 'Missionsprotokoll ({key})', 'Diário de missões ({key})'),
  'Operations': L('Operaciones', 'Opérations', 'Operationen', 'Operações'),
  'Help / Controls': L('Ayuda / Mandos', 'Aide / Commandes', 'Hilfe / Steuerung', 'Ajuda / Controles'),
  'Codex': L('Códice', 'Codex', 'Kodex', 'Códice'),
  'Main Menu': L('Menú principal', 'Menu principal', 'Hauptmenü', 'Menu principal'),
  'Quit Game': L('Salir del juego', 'Quitter le jeu', 'Spiel beenden', 'Sair do jogo'),
  'Quit': L('Salir', 'Quitter', 'Beenden', 'Sair'),
  'TUTORIAL OBJECTIVE': L('OBJETIVO DEL TUTORIAL', 'OBJECTIF DU TUTORIEL', 'TUTORIALZIEL', 'OBJETIVO DO TUTORIAL'),
  'CURRENT OBJECTIVE': L('OBJETIVO ACTUAL', 'OBJECTIF ACTUEL', 'AKTUELLES ZIEL', 'OBJETIVO ATUAL'),
  'NEXT ACTION': L('SIGUIENTE ACCIÓN', 'ACTION SUIVANTE', 'NÄCHSTE AKTION', 'PRÓXIMA AÇÃO'),
  '{key} Mission Log · track {contract}': L(
    '{key} Registro de misiones · seguir {contract}',
    '{key} Journal de mission · suivre {contract}',
    '{key} Missionsprotokoll · {contract} verfolgen',
    '{key} Diário de missões · rastrear {contract}',
  ),
  '{key} Mission Log · choose the next story action': L(
    '{key} Registro de misiones · elige la siguiente acción de la historia',
    '{key} Journal de mission · choisissez la prochaine action d’histoire',
    '{key} Missionsprotokoll · nächste Story-Aktion wählen',
    '{key} Diário de missões · escolha a próxima ação da história',
  ),
  'NO GOAL MARKER · TRACK ONE CONTRACT': L(
    'SIN MARCA DE META · SIGUE UN CONTRATO',
    'AUCUN MARQUEUR D’OBJECTIF · SUIVEZ UN CONTRAT',
    'KEIN ZIELMARKER · EINEN VERTRAG VERFOLGEN',
    'SEM MARCA DE META · RASTREIE UM CONTRATO',
  ),
  'NO GOAL MARKER · SET ONE IN MISSION LOG': L(
    'SIN MARCA DE META · FIJA UNA EN EL REGISTRO',
    'AUCUN MARQUEUR D’OBJECTIF · DÉFINISSEZ-EN UN AU JOURNAL',
    'KEIN ZIELMARKER · IM PROTOKOLL SETZEN',
    'SEM MARCA DE META · DEFINA UMA NO DIÁRIO',
  ),
  Language: L('Idioma', 'Langue', 'Sprache', 'Idioma'),
  Audio: L('Audio', 'Audio', 'Audio', 'Áudio'),
  Video: L('Vídeo', 'Vidéo', 'Video', 'Vídeo'),
  Gameplay: L('Juego', 'Jouabilité', 'Spielablauf', 'Jogabilidade'),
  Access: L('Acceso', 'Accès', 'Zugang', 'Acesso'),
  Controls: L('Mandos', 'Commandes', 'Steuerung', 'Controles'),
  'Travel drive': L('Motor de viaje', 'Propulseur de voyage', 'Reiseantrieb', 'Motor de viagem'),
  'Active objective': L('Objetivo activo', 'Objectif actif', 'Aktives Ziel', 'Objetivo ativo'),
  'Current objective marker': L('Marca del objetivo actual', 'Marqueur d’objectif actuel', 'Aktueller Zielmarker', 'Marcador do objetivo atual'),
  Massline: L('Massline', 'Massline', 'Massline', 'Massline'),
  'Gravity-marked target': L('Blanco marcado por gravedad', 'Cible marquée par gravité', 'Schwerkraftmarkiertes Ziel', 'Alvo marcado por gravidade'),
  'LOCK: CONTRACT': L('BLOQUEO: CONTRATO', 'VERROU : CONTRAT', 'LOCK: VERTRAG', 'TRAVA: CONTRATO'),
  JETTISON: L('ABANDONAR', 'JETER', 'ABWERFEN', 'ALIJAR'),
  'LOCK: PERSISTENT': L('BLOQUEO: PERSISTENTE', 'VERROU : PERSISTANT', 'LOCK: DAUERHAFT', 'TRAVA: PERSISTENTE'),
  'Catalog Supply Chain': L('Cadena de suministro del catálogo', 'Chaîne d’approvisionnement du catalogue', 'Katalog-Lieferkette', 'Cadeia de suprimentos do catálogo'),
  'Are you sure you want to jettison {qty}× {name}? This action is permanent.': L(
    '¿Seguro que quieres alijar {qty}× {name}? Esta acción es permanente.',
    'Jeter {qty}× {name} ? Cette action est définitive.',
    '{qty}× {name} abwerfen? Das ist endgültig.',
    'Alijar {qty}× {name}? Esta ação é permanente.',
  ),
  'WANTED · LAW ENFORCEMENT ACTIVE': L(
    'BUSCADO · FUERZA PÚBLICA ACTIVA',
    'RECHERCHÉ · FORCES DE L’ORDRE ACTIVES',
    'GESUCHT · ORDNUNGSKRÄFTE AKTIV',
    'PROCURADO · FORÇA PÚBLICA ATIVA',
  ),
  'SHIELDS LOW': L('ESCUDOS BAJOS', 'BOUCLIERS FAIBLES', 'SCHILDE SCHWACH', 'ESCUDOS BAIXOS'),
  'WANTED ({tier}) · HUNTERS INBOUND': L(
    'BUSCADO ({tier}) · CAZADORES EN RUTA',
    'RECHERCHÉ ({tier}) · CHASSEURS EN APPROCHE',
    'GESUCHT ({tier}) · JÄGER UNTERWEGS',
    'PROCURADO ({tier}) · CAÇADORES A CAMINHO',
  ),
  'HULL CRITICAL': L('CASCO CRÍTICO', 'COQUE CRITIQUE', 'RUMPF KRITISCH', 'CASCO CRÍTICO'),
  'Selected target: {rec_name}': L(
    'Blanco seleccionado: {rec_name}',
    'Cible sélectionnée : {rec_name}',
    'Gewähltes Ziel: {rec_name}',
    'Alvo selecionado: {rec_name}',
  ),
  'WEAPONS VENTING': L('ARMAS VENTEANDO', 'ARMES EN PURGE', 'WAFFEN ENTLÜFTEN', 'ARMAS VENTILANDO'),
  'Jettisoned {dumped}× {name}': L(
    'Alijado {dumped}× {name}',
    'Jeté {dumped}× {name}',
    '{dumped}× {name} abgeworfen',
    'Alijado {dumped}× {name}',
  ),
  'Confirm Jettison': L('Confirmar alijo', 'Confirmer le jet', 'Abwurf bestätigen', 'Confirmar alijo'),
  'None Known': L('Ninguno conocido', 'Aucun connu', 'Keine bekannt', 'Nenhum conhecido'),
  'CAPACITY:': L('CAPACIDAD:', 'CAPACITÉ :', 'KAPAZITÄT:', 'CAPACIDADE:'),
  LOCKED: L('BLOQUEADO', 'VERROUILLÉ', 'GESPERRT', 'TRAVADO'),
  CARGO: L('CARGA', 'CARGAISON', 'FRACHT', 'CARGA'),
  'No transactions recorded in ledger.': L(
    'Sin transacciones en el libro.',
    'Aucune transaction au livre.',
    'Keine Buchungen im Hauptbuch.',
    'Nenhuma transação no livro.',
  ),
  weapons: L('armas', 'armes', 'Waffen', 'armas'),
  LEDGER: L('LIBRO', 'LIVRE', 'HAUPTBUCH', 'LIVRO'),
  'Market Intelligence': L('Inteligencia de mercado', 'Renseignement marché', 'Marktintelligenz', 'Inteligência de mercado'),
  LEGAL: L('LEGAL', 'LÉGAL', 'LEGAL', 'LEGAL'),
  EXOTIC: L('EXÓTICO', 'EXOTIQUE', 'EXOTISCH', 'EXÓTICO'),
  BAND: L('BANDA', 'BANDE', 'BAND', 'BANDA'),
  RADIO: L('RADIO', 'RADIO', 'FUNK', 'RÁDIO'),
  FRAGILE: L('FRÁGIL', 'FRAGILE', 'ZERBRECHLICH', 'FRÁGIL'),
  'SET COURSE': L('FIJAR RUMBO', 'CAP À SUIVRE', 'KURS SETZEN', 'DEFINIR RUMO'),
  'Emergency recovery online…': L(
    'Recuperación de emergencia en línea…',
    'Récupération d’urgence en ligne…',
    'Notfallbergung online…',
    'Recuperação de emergência online…',
  ),
  'FREE CAPACITY': L('CAPACIDAD LIBRE', 'CAPACITÉ LIBRE', 'FREIE KAPAZITÄT', 'CAPACIDADE LIVRE'),
  Commodity: L('Mercancía', 'Marchandise', 'Ware', 'Mercadoria'),
  credits: L('créditos', 'crédits', 'Credits', 'créditos'),
  'No item selected. Select a block to inspect.': L(
    'Nada seleccionado. Elige un bloque para inspeccionar.',
    'Rien de sélectionné. Choisissez un bloc à inspecter.',
    'Nichts gewählt. Block zum Prüfen wählen.',
    'Nada selecionado. Escolha um bloco para inspecionar.',
  ),
  'SHIP DESTROYED': L('NAVE DESTRUIDA', 'VAISSEAU DÉTRUIT', 'SCHIFF ZERSTÖRT', 'NAVE DESTRUÍDA'),
  CONTRACT: L('CONTRATO', 'CONTRAT', 'VERTRAG', 'CONTRATO'),
  MISSION: L('MISIÓN', 'MISSION', 'MISSION', 'MISSÃO'),
  'No market data recorded.': L(
    'Sin datos de mercado.',
    'Aucune donnée de marché.',
    'Keine Marktdaten.',
    'Sem dados de mercado.',
  ),
  'CARGO HOLD MANIFEST': L('MANIFIESTO DE BODEGA', 'MANIFESTE DE SOUTE', 'LADERAUM-MANIFEST', 'MANIFESTO DO PORÃO'),
  SALVAGE: L('SALVAMENTO', 'SAUVETAGE', 'BERGUNG', 'SALVAMENTO'),
  tether: L('cabo', 'câble', 'Seil', 'cabo'),
  'No items in this category.': L(
    'Nada en esta categoría.',
    'Rien dans cette catégorie.',
    'Nichts in dieser Kategorie.',
    'Nada nesta categoria.',
  ),
  'SCAN RISK:': L('RIESGO DE ESCANEO:', 'RISQUE DE SCAN :', 'SCAN-RISIKO:', 'RISCO DE SCAN:'),
  cargo: L('carga', 'cargaison', 'Fracht', 'carga'),
  'MANIFEST ACQUIRED': L('MANIFIESTO ADQUIRIDO', 'MANIFESTE ACQUIS', 'MANIFEST ERHALTEN', 'MANIFESTO ADQUIRIDO'),
  MATERIALS: L('MATERIALES', 'MATÉRIAUX', 'MATERIALIEN', 'MATERIAIS'),
  'English': L('Inglés', 'Anglais', 'Englisch', 'Inglês'),
  'Pseudo-locale (layout check)': L(
    'Pseudo-locale (comprobar maquetación)',
    'Pseudo-locale (contrôle de mise en page)',
    'Pseudo-locale (Layoutprüfung)',
    'Pseudo-locale (checagem de layout)',
  ),
  'Contract 47-A remains open': L(
    'El contrato 47-A sigue abierto',
    'Le contrat 47-A reste ouvert',
    'Vertrag 47-A bleibt offen',
    'O contrato 47-A continua aberto',
  ),
  'Contract 47-A — Open / Payment Pending': L(
    'Contrato 47-A — Abierto / Pago pendiente',
    'Contrat 47-A — Ouvert / Paiement en attente',
    'Vertrag 47-A — Offen / Zahlung ausstehend',
    'Contrato 47-A — Aberto / Pagamento pendente',
  ),
  'Contract 47-A: sample the 12.4t mass discrepancy, dock Helios. Payment withheld. Status pending.': L(
    'Contrato 47-A: tome muestras de la discrepancia de masa de 12.4t y atraque en Helios. Pago retenido. Estado pendiente.',
    'Contrat 47-A : échantillonnez l’écart de masse de 12.4t, puis amarrez à Helios. Paiement retenu. Statut en attente.',
    'Vertrag 47-A: Beproben Sie die 12.4t-Massendiskrepanz und docken Sie bei Helios an. Zahlung zurückbehalten. Status ausstehend.',
    'Contrato 47-A: amostre a discrepância de massa de 12.4t e atraque em Helios. Pagamento retido. Status pendente.',
  ),
});

// AL-SHOW-5: the reviewed term glossary lives as four per-locale files beside the
// overlays (glossary/es-ES.js … pt-BR.js) — the sign-off artifact a native reviewer
// edits. This reassembles them into the same term → { locale: word } shape the machine
// pass has always applied; whole tokens only, never substrings.
const GLOSSARY = Object.freeze((() => {
  const tables = { 'es-ES': GLOSSARY_ES, 'fr-FR': GLOSSARY_FR, 'de-DE': GLOSSARY_DE, 'pt-BR': GLOSSARY_PT };
  const out = {};
  for (const [locale, table] of Object.entries(tables)) {
    for (const [term, word] of Object.entries(table)) {
      (out[term] || (out[term] = {}))[locale] = word;
    }
  }
  return out;
})());


const PHRASE_LIST = Object.keys(PHRASES).sort((a, b) => b.length - a.length);

function lookupMap(map, english, locale) {
  const row = map[english];
  if (!row) return null;
  return row[locale] != null ? row[locale] : null;
}

function restoreShape(source, translated) {
  if (!translated) return translated;
  if (source === source.toUpperCase() && /[A-Z]/.test(source)) return translated.toUpperCase();
  if (source[0] === source[0].toUpperCase() && source.slice(1) === source.slice(1).toLowerCase()) {
    return translated.charAt(0).toUpperCase() + translated.slice(1);
  }
  return translated;
}

function translateWord(locale, word) {
  const raw = String(word);
  const lower = raw.toLowerCase();
  if (PROPER.has(lower)) return raw;
  if (/^\d/.test(raw) || !/[a-z]/i.test(raw)) return raw;
  const hit = GLOSSARY[lower];
  if (!hit || hit[locale] == null) return raw;
  return restoreShape(raw, hit[locale]);
}

function isWordChar(ch) {
  return !!ch && /[A-Za-zÀ-ÿ0-9]/.test(ch);
}

function machineTranslatePart(locale, part) {
  let text = part;
  for (const phrase of PHRASE_LIST) {
    if (phrase.length < 4) continue;
    const needle = phrase.toLowerCase();
    let from = 0;
    while (from <= text.length - needle.length) {
      const index = text.toLowerCase().indexOf(needle, from);
      if (index < 0) break;
      const before = index > 0 ? text[index - 1] : '';
      const after = text[index + phrase.length] || '';
      if (isWordChar(before) || isWordChar(after)) {
        from = index + 1;
        continue;
      }
      const found = text.slice(index, index + phrase.length);
      const repl = lookupMap(PHRASES, phrase, locale);
      if (repl == null) break;
      const shaped = restoreShape(found, repl);
      text = text.slice(0, index) + shaped + text.slice(index + phrase.length);
      from = index + shaped.length;
    }
  }
  return text.replace(/[A-Za-zÀ-ÿ']+/g, (word) => translateWord(locale, word));
}

export function machineTranslate(locale, message) {
  const source = String(message == null ? '' : message);
  const parts = source.split(PLACEHOLDER_SPLIT_RE);
  let out = '';
  for (const part of parts) {
    if (PLACEHOLDER_TOKEN_RE.test(part)) {
      out += part;
      continue;
    }
    out += machineTranslatePart(locale, part);
  }
  return out;
}

export function translateMessage(locale, english, key) {
  const source = String(english == null ? '' : english);
  if (!source) return source;
  if (locale === 'en-US') return source;
  const phrase = lookupMap(PHRASES, source, locale);
  if (phrase != null) return phrase;
  const bark = barkTextMap(locale).get(source);
  if (bark != null) return bark;
  if (STORE_COPY[locale] && STORE_COPY[locale][key]) return STORE_COPY[locale][key];
  const overlay = lookupMap(FIRST_HOUR_OVERLAY, source, locale);
  if (overlay != null) return overlay;
  return machineTranslate(locale, source);
}

const catalogCache = new Map();

// The source locale merges once and the merge is shared: CATALOGS['en-US'] (through
// deferredCatalog in gameLocalization.js) and this builder hand out the same frozen object —
// the post-eval warm used to Object.assign a second full copy of every English row into
// catalogCache (wave-142 finding 5). Non-English catalogs still build per-locale below.
let englishMerged = null;
function englishMergedCatalog() {
  if (englishMerged === null) {
    const out = {};
    Object.assign(out, englishMessages, barkMessagesFor('en-US'), STORE_COPY['en-US']);
    englishMerged = Object.freeze(out);
  }
  return englishMerged;
}

export function buildTranslatedCatalog(locale) {
  if (catalogCache.has(locale)) return catalogCache.get(locale);
  if (locale === 'en-US') {
    const merged = englishMergedCatalog();
    catalogCache.set(locale, merged);
    return merged;
  }
  const out = {};
  for (const [key, english] of Object.entries(englishMessages)) {
    out[key] = translateMessage(locale, english, key);
  }
  Object.assign(out, barkMessagesFor(locale), STORE_COPY[locale] || {});
  const frozen = Object.freeze(out);
  catalogCache.set(locale, frozen);
  return frozen;
}

// ── Deferred data ─────────────────────────────────────────────────────────────────────────────
// Boot-eval deferral (wave-140 B5): a catalog's translate pass used to run inside the post-gate
// eval task through the stub modules' top-level `buildTranslatedCatalog` call. These proxies keep
// every consumer's synchronous view byte-identical while the build runs on first real access —
// a language switch, a `?locale=` boot, or the idle warmup — never inside module eval.
//
// The proxy targets stay empty until materialized; reads forward to the built value. On
// `preventExtensions` the real descriptors are copied onto the target first, which keeps the
// proxy invariants (ownKeys/descriptor parity with a non-extensible target) exact.

/** A plain object whose real contents are built synchronously on first property access. */
export function deferredObject(build) {
  const target = {};
  let real = null;
  const materialize = () => {
    if (real === null) real = build();
    return real;
  };
  return new Proxy(target, {
    get: (t, p) => Reflect.get(materialize(), p),
    has: (t, p) => p in materialize(),
    ownKeys: () => Reflect.ownKeys(materialize()),
    getOwnPropertyDescriptor: (t, p) => {
      const d = Object.getOwnPropertyDescriptor(materialize(), p);
      // A descriptor reported for a property the target does not own must be configurable; once
      // the target is frozen it owns every real key and the real descriptor is reported verbatim.
      return d && !Object.prototype.hasOwnProperty.call(t, p) ? { ...d, configurable: true } : d;
    },
    preventExtensions: (t) => {
      const o = materialize();
      Object.defineProperties(t, Object.getOwnPropertyDescriptors(o));
      return Object.preventExtensions(t);
    },
    set: (t, p, v) => Reflect.set(materialize(), p, v),
    deleteProperty: (t, p) => Reflect.deleteProperty(materialize(), p),
    defineProperty: (t, p, d) => Reflect.defineProperty(materialize(), p, d),
  });
}

/** `deferredObject` for arrays: the built contents are pushed onto the target once. */
export function deferredArray(build) {
  const target = [];
  let real = null;
  const materialize = () => {
    if (real === null) {
      real = build();
      for (const value of real) target.push(value);
    }
    return target;
  };
  return new Proxy(target, {
    get: (t, p) => Reflect.get(materialize(), p),
    has: (t, p) => p in materialize(),
    ownKeys: () => Reflect.ownKeys(materialize()),
    getOwnPropertyDescriptor: (t, p) => Object.getOwnPropertyDescriptor(materialize(), p),
    preventExtensions: (t) => { materialize(); return Object.preventExtensions(t); },
    set: (t, p, v) => Reflect.set(materialize(), p, v),
    deleteProperty: (t, p) => Reflect.deleteProperty(materialize(), p),
    defineProperty: (t, p, d) => Reflect.defineProperty(materialize(), p, d),
  });
}

/** A shipped catalog that builds on first real access instead of at module eval. */
export function deferredCatalog(locale) {
  return deferredObject(() => buildTranslatedCatalog(locale));
}

// Idle warm for the deferred catalogs: identical output to buildTranslatedCatalog, produced in
// slices so a full translate pass never lands as one main-thread task. A partially warmed locale
// is invisible — only the completed, frozen object enters catalogCache — so a consumer arriving
// mid-warm still materializes the whole catalog synchronously through buildTranslatedCatalog.
const catalogWarmState = new Map();

/** Advance one slice of a locale's warm build; returns true once the catalog is complete. */
export function warmTranslatedCatalog(locale, sliceCount = 1600) {
  if (catalogCache.has(locale)) {
    catalogWarmState.delete(locale);
    return true;
  }
  if (locale === 'en-US') {
    buildTranslatedCatalog(locale);
    return true;
  }
  let state = catalogWarmState.get(locale);
  if (!state) {
    state = { out: {}, keys: Object.keys(englishMessages), index: 0 };
    catalogWarmState.set(locale, state);
  }
  const end = Math.min(state.index + Math.max(1, Math.floor(sliceCount) || 1600), state.keys.length);
  for (; state.index < end; state.index++) {
    const key = state.keys[state.index];
    state.out[key] = translateMessage(locale, englishMessages[key], key);
  }
  if (state.index < state.keys.length) return false;
  Object.assign(state.out, barkMessagesFor(locale), STORE_COPY[locale] || {});
  catalogCache.set(locale, Object.freeze(state.out));
  catalogWarmState.delete(locale);
  return true;
}

// ── FB-107: honest locale readiness ───────────────────────────────────────────────────────────
// The four non-English shipped catalogs are machine-filled on first use (deferredCatalog →
// buildTranslatedCatalog → machineTranslate, a glossary pass over the English inventory). A
// locale's string counts as
// REVIEWED only when it resolves from an authored table — an explicit PHRASES row, a reviewed
// bark, or reviewed store copy — never through the machine pass. While a locale's reviewed
// coverage stands under LOCALE_REVIEWED_GATE, its picker label honestly reads as a machine
// preview; the label is data, so a reviewed batch that lifts coverage over the gate drops the
// label with no code change. No translation is authored or claimed here.
export const LOCALE_REVIEWED_GATE = 0.95;
const readinessByLocale = new Map();

function isReviewedString(locale, english, key, barkMap) {
  if (lookupMap(PHRASES, english, locale) != null) return true;
  if (barkMap.has(english)) return true;
  const storeRow = STORE_COPY[locale];
  if (storeRow && storeRow[key] != null) return true;
  return lookupMap(FIRST_HOUR_OVERLAY, english, locale) != null;
}

/** Reviewed coverage for one shipped locale: { locale, reviewed, total, coverage, preview }. */
export function localeReadiness(locale) {
  const id = String(locale);
  if (readinessByLocale.has(id)) return readinessByLocale.get(id);
  let reviewed = 0;
  let total = 0;
  if (id === 'en-US') {
    // The source locale is reviewed by definition — every string is its own authored copy.
    total = Object.keys(englishMessages).length;
    reviewed = total;
  } else {
    const barkMap = barkTextMap(id);
    for (const [key, entry] of Object.entries(englishMessages)) {
      total += 1;
      const english = typeof entry === 'string' ? entry : entry && entry.message;
      if (typeof english === 'string' && isReviewedString(id, english, key, barkMap)) reviewed += 1;
    }
  }
  const coverage = total > 0 ? reviewed / total : 1;
  const readiness = Object.freeze({
    locale: id,
    reviewed,
    total,
    coverage: Math.round(coverage * 10000) / 10000,
    preview: coverage < LOCALE_REVIEWED_GATE,
  });
  readinessByLocale.set(id, readiness);
  return readiness;
}

/**
 * The first `limit` unreviewed keys for one locale, in inventory order (the generated catalog's
 * surface grouping, so the head of the list is the copy a player meets first). This is the
 * reviewed batch's working list, printed by scripts/check-localization-readiness.mjs; the
 * source locale is reviewed by definition and has none.
 */
export function unreviewedKeys(locale, limit = 50) {
  const id = String(locale);
  if (id === 'en-US') return [];
  const barkMap = barkTextMap(id);
  const rows = [];
  for (const [key, entry] of Object.entries(englishMessages)) {
    if (rows.length >= limit) break;
    const english = typeof entry === 'string' ? entry : entry && entry.message;
    if (typeof english !== 'string') continue;
    if (isReviewedString(id, english, key, barkMap)) continue;
    rows.push(Object.freeze({ key, english: english.length > 120 ? english.slice(0, 117) + '...' : english }));
  }
  return Object.freeze(rows);
}

export default {
  SHIPPED_LOCALES,
  translateMessage,
  machineTranslate,
  buildTranslatedCatalog,
};
