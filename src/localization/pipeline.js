// Translation pipeline: machine first for inventory copy, overlays for store + bark (reviewed).
// Deterministic. Placeholders, numbers, and proper nouns pass through untouched.

import { messages as englishMessages } from './catalogs/en-US.generated.js';
import { STORE_COPY } from './storeCopy.js';
import { barkMessagesFor, barkTextMap } from './barks.js';

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
  'No save found - New Game opens Contract 47-A in Helios.': L(
    'No hay partida — Nueva partida abre el Contrato 47-A en Helios.',
    'Aucune sauvegarde — Nouvelle partie ouvre le Contrat 47-A à Helios.',
    'Kein Spielstand — Neues Spiel öffnet Vertrag 47-A in Helios.',
    'Nenhum save — Novo jogo abre o Contrato 47-A em Helios.',
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
  'Are you sure you want to jettison {qty}x {name}? This action is permanent.': L(
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
  'Jettisoned {dumped}x {name}': L(
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

const GLOSSARY = Object.freeze({
  hull: L('casco', 'coque', 'Rumpf', 'casco'),
  ship: L('nave', 'vaisseau', 'Schiff', 'nave'),
  ships: L('naves', 'vaisseaux', 'Schiffe', 'naves'),
  cargo: L('carga', 'cargaison', 'Fracht', 'carga'),
  hold: L('bodega', 'soute', 'Laderaum', 'porão'),
  station: L('estación', 'station', 'Station', 'estação'),
  stations: L('estaciones', 'stations', 'Stationen', 'estações'),
  route: L('ruta', 'route', 'Route', 'rota'),
  lane: L('carril', 'voie', 'Spur', 'faixa'),
  claim: L('concesión', 'concession', 'Claim', 'concessão'),
  wreck: L('pecio', 'épave', 'Wrack', 'destroço'),
  ore: L('mena', 'minerai', 'Erz', 'minério'),
  survey: L('sondeo', 'relevé', 'Vermessung', 'sondagem'),
  contract: L('contrato', 'contrat', 'Vertrag', 'contrato'),
  mission: L('misión', 'mission', 'Mission', 'missão'),
  sector: L('sector', 'secteur', 'Sektor', 'setor'),
  ledger: L('libro', 'livre', 'Hauptbuch', 'livro'),
  manifest: L('manifiesto', 'manifeste', 'Manifest', 'manifesto'),
  market: L('mercado', 'marché', 'Markt', 'mercado'),
  target: L('blanco', 'cible', 'Ziel', 'alvo'),
  scan: L('escaneo', 'scan', 'Scan', 'scan'),
  dock: L('atraque', 'amarrage', 'Dock', 'atracação'),
  patrol: L('patrulla', 'patrouille', 'Patrouille', 'patrulha'),
  pirate: L('pirata', 'pirate', 'Pirat', 'pirata'),
  pirates: L('piratas', 'pirates', 'Piraten', 'piratas'),
  hunter: L('cazador', 'chasseur', 'Jäger', 'caçador'),
  convoy: L('convoy', 'convoi', 'Konvoi', 'comboio'),
  fuel: L('combustible', 'carburant', 'Treibstoff', 'combustível'),
  shield: L('escudo', 'bouclier', 'Schild', 'escudo'),
  shields: L('escudos', 'boucliers', 'Schilde', 'escudos'),
  weapons: L('armas', 'armes', 'Waffen', 'armas'),
  heat: L('calor', 'chaleur', 'Hitze', 'calor'),
  wanted: L('buscado', 'recherché', 'gesucht', 'procurado'),
  credits: L('créditos', 'crédits', 'Credits', 'créditos'),
  salvage: L('salvamento', 'sauvetage', 'Bergung', 'salvamento'),
  mining: L('minería', 'minage', 'Abbau', 'mineração'),
  mine: L('minar', 'miner', 'abbauen', 'minerar'),
  trade: L('comercio', 'commerce', 'Handel', 'comércio'),
  buy: L('comprar', 'acheter', 'kaufen', 'comprar'),
  sell: L('vender', 'vendre', 'verkaufen', 'vender'),
  launch: L('despegar', 'lancer', 'starten', 'lançar'),
  resume: L('reanudar', 'reprendre', 'fortsetzen', 'retomar'),
  pause: L('pausa', 'pause', 'Pause', 'pausa'),
  settings: L('ajustes', 'réglages', 'Einstellungen', 'configurações'),
  help: L('ayuda', 'aide', 'Hilfe', 'ajuda'),
  map: L('mapa', 'carte', 'Karte', 'mapa'),
  chart: L('carta', 'carte', 'Karte', 'carta'),
  range: L('alcance', 'portée', 'Reichweite', 'alcance'),
  objective: L('objetivo', 'objectif', 'Ziel', 'objetivo'),
  marker: L('marca', 'marqueur', 'Marker', 'marcador'),
  signal: L('señal', 'signal', 'Signal', 'sinal'),
  contact: L('contacto', 'contact', 'Kontakt', 'contato'),
  hail: L('llamada', 'appel', 'Ruf', 'chamada'),
  crew: L('tripulación', 'équipage', 'Crew', 'tripulação'),
  drone: L('dron', 'drone', 'Drohne', 'drone'),
  drones: L('drones', 'drones', 'Drohnen', 'drones'),
  bay: L('bahía', 'baie', 'Bucht', 'baía'),
  module: L('módulo', 'module', 'Modul', 'módulo'),
  jump: L('salto', 'saut', 'Sprung', 'salto'),
  gate: L('puerta', 'porte', 'Tor', 'portão'),
  field: L('campo', 'champ', 'Feld', 'campo'),
  belt: L('cinturón', 'ceinture', 'Gürtel', 'cinturão'),
  rock: L('roca', 'rocher', 'Felsen', 'rocha'),
  asteroid: L('asteroide', 'astéroïde', 'Asteroid', 'asteroide'),
  gravity: L('gravedad', 'gravité', 'Schwerkraft', 'gravidade'),
  mass: L('masa', 'masse', 'Masse', 'massa'),
  speed: L('velocidad', 'vitesse', 'Speed', 'velocidade'),
  damage: L('daño', 'dégâts', 'Schaden', 'dano'),
  hulls: L('cascos', 'coques', 'Rümpfe', 'cascos'),
  freight: L('flete', 'fret', 'Frachtgut', 'frete'),
  hauler: L('transportista', 'convoyeur', 'Frachtfahrer', 'transportador'),
  prospector: L('prospector', 'prospecteur', 'Prospektor', 'prospeccionista'),
  bounty: L('recompensa', 'prime', 'Kopfgeld', 'recompensa'),
  warrant: L('orden', 'mandat', 'Haftbefehl', 'mandado'),
  customs: L('aduana', 'douane', 'Zoll', 'alfândega'),
  refinery: L('refinería', 'raffinerie', 'Raffinerie', 'refinaria'),
  yard: L('astillero', 'chantier', 'Werft', 'estaleiro'),
  berth: L('atraque', 'poste', 'Liegeplatz', 'berço'),
  lock: L('bloqueo', 'verrou', 'Lock', 'trava'),
  locked: L('bloqueado', 'verrouillé', 'gesperrt', 'travado'),
  open: L('abrir', 'ouvrir', 'öffnen', 'abrir'),
  close: L('cerrar', 'fermer', 'schließen', 'fechar'),
  active: L('activo', 'actif', 'aktiv', 'ativo'),
  empty: L('vacío', 'vide', 'leer', 'vazio'),
  full: L('lleno', 'plein', 'voll', 'cheio'),
  status: L('estado', 'état', 'Status', 'status'),
  warning: L('aviso', 'avertissement', 'Warnung', 'aviso'),
  error: L('error', 'erreur', 'Fehler', 'erro'),
  loading: L('cargando', 'chargement', 'lädt', 'carregando'),
  confirm: L('confirmar', 'confirmer', 'bestätigen', 'confirmar'),
  cancel: L('cancelar', 'annuler', 'abbrechen', 'cancelar'),
  accept: L('aceptar', 'accepter', 'annehmen', 'aceitar'),
  decline: L('rechazar', 'refuser', 'ablehnen', 'recusar'),
  track: L('seguir', 'suivre', 'verfolgen', 'rastrear'),
  select: L('elegir', 'choisir', 'wählen', 'selecionar'),
  selected: L('elegido', 'choisi', 'gewählt', 'selecionado'),
  inspect: L('inspeccionar', 'inspecter', 'prüfen', 'inspecionar'),
  deploy: L('desplegar', 'déployer', 'ausbringen', 'implantar'),
  recall: L('retirar', 'rappeler', 'zurückrufen', 'recolher'),
  fit: L('montar', 'équiper', 'einbauen', 'instalar'),
  fitting: L('montaje', 'équipement', 'Einbau', 'instalação'),
  inventory: L('inventario', 'inventaire', 'Inventar', 'inventário'),
  capacity: L('capacidad', 'capacité', 'Kapazität', 'capacidade'),
  radius: L('radio', 'rayon', 'Radius', 'raio'),
  chain: L('cadena', 'chaîne', 'Kette', 'cadeia'),
  standing: L('prestigio', 'standing', 'Ansehen', 'prestígio'),
  clears: L('se limpia', 'se dissipe', 'klingt ab', 'limpa'),
  window: L('ventana', 'fenêtre', 'Fenster', 'janela'),
  screen: L('pantalla', 'écran', 'Bildschirm', 'tela'),
  player: L('jugador', 'joueur', 'Spieler', 'jogador'),
  enemy: L('enemigo', 'ennemi', 'Feind', 'inimigo'),
  hostile: L('hostil', 'hostile', 'feindlich', 'hostil'),
  friendly: L('aliado', 'allié', 'freundlich', 'aliado'),
  unknown: L('desconocido', 'inconnu', 'unbekannt', 'desconhecido'),
  dead: L('muerto', 'mort', 'tot', 'morto'),
  destroyed: L('destruido', 'détruit', 'zerstört', 'destruído'),
  recovery: L('recuperación', 'récupération', 'Bergung', 'recuperação'),
  research: L('investigación', 'recherche', 'Forschung', 'pesquisa'),
  control: L('control', 'contrôle', 'Steuerung', 'controle'),
  system: L('sistema', 'système', 'System', 'sistema'),
  systems: L('sistemas', 'systèmes', 'Systeme', 'sistemas'),
  power: L('potencia', 'puissance', 'Leistung', 'potência'),
  engine: L('motor', 'moteur', 'Triebwerk', 'motor'),
  drive: L('propulsión', 'propulsion', 'Antrieb', 'propulsão'),
  course: L('rumbo', 'cap', 'Kurs', 'rumo'),
  heading: L('rumbo', 'cap', 'Steuerkurs', 'proa'),
  distance: L('distancia', 'distance', 'Distanz', 'distância'),
  time: L('tiempo', 'temps', 'Zeit', 'tempo'),
  name: L('nombre', 'nom', 'Name', 'nome'),
  class: L('clase', 'classe', 'Klasse', 'classe'),
  size: L('tamaño', 'taille', 'Größe', 'tamanho'),
  type: L('tipo', 'type', 'Typ', 'tipo'),
  price: L('precio', 'prix', 'Preis', 'preço'),
  profit: L('beneficio', 'profit', 'Gewinn', 'lucro'),
  units: L('unidades', 'unités', 'Einheiten', 'unidades'),
  unit: L('unidad', 'unité', 'Einheit', 'unidade'),
  volume: L('volumen', 'volume', 'Volumen', 'volume'),
  massline: L('Massline', 'Massline', 'Massline', 'Massline'),
  the: L('el', 'le', 'der', 'o'),
  a: L('un', 'un', 'ein', 'um'),
  an: L('un', 'un', 'ein', 'um'),
  and: L('y', 'et', 'und', 'e'),
  or: L('o', 'ou', 'oder', 'ou'),
  of: L('de', 'de', 'von', 'de'),
  to: L('a', 'à', 'zu', 'a'),
  in: L('en', 'dans', 'in', 'em'),
  on: L('en', 'sur', 'auf', 'em'),
  for: L('para', 'pour', 'für', 'para'),
  with: L('con', 'avec', 'mit', 'com'),
  from: L('de', 'de', 'von', 'de'),
  at: L('en', 'à', 'an', 'em'),
  by: L('por', 'par', 'von', 'por'),
  not: L('no', 'pas', 'nicht', 'não'),
  no: L('sin', 'sans', 'kein', 'sem'),
  is: L('es', 'est', 'ist', 'é'),
  are: L('son', 'sont', 'sind', 'são'),
  be: L('ser', 'être', 'sein', 'ser'),
  your: L('tu', 'votre', 'dein', 'seu'),
  you: L('tú', 'vous', 'du', 'você'),
  this: L('este', 'ce', 'dies', 'este'),
  that: L('eso', 'cela', 'das', 'isso'),
  it: L('eso', 'il', 'es', 'isso'),
  its: L('su', 'son', 'sein', 'seu'),
  into: L('en', 'dans', 'in', 'em'),
  without: L('sin', 'sans', 'ohne', 'sem'),
  before: L('antes', 'avant', 'bevor', 'antes'),
  after: L('después', 'après', 'nach', 'depois'),
  next: L('siguiente', 'suivant', 'nächste', 'próximo'),
  first: L('primero', 'premier', 'erste', 'primeiro'),
  one: L('uno', 'un', 'eins', 'um'),
  two: L('dos', 'deux', 'zwei', 'dois'),
  three: L('tres', 'trois', 'drei', 'três'),
  every: L('cada', 'chaque', 'jede', 'cada'),
  all: L('todo', 'tout', 'alle', 'tudo'),
  more: L('más', 'plus', 'mehr', 'mais'),
  out: L('fuera', 'hors', 'raus', 'fora'),
  off: L('apagado', 'arrêt', 'aus', 'desligado'),
  on: L('en', 'sur', 'auf', 'em'),
  still: L('aún', 'encore', 'noch', 'ainda'),
  only: L('solo', 'seulement', 'nur', 'só'),
  now: L('ahora', 'maintenant', 'jetzt', 'agora'),
  here: L('aquí', 'ici', 'hier', 'aqui'),
  there: L('allí', 'là', 'dort', 'lá'),
  if: L('si', 'si', 'wenn', 'se'),
  then: L('entonces', 'alors', 'dann', 'então'),
  than: L('que', 'que', 'als', 'que'),
  but: L('pero', 'mais', 'aber', 'mas'),
  they: L('ellos', 'ils', 'sie', 'eles'),
  we: L('nosotros', 'nous', 'wir', 'nós'),
  i: L('yo', 'je', 'ich', 'eu'),
  will: L('va a', 'va', 'wird', 'vai'),
  can: L('puede', 'peut', 'kann', 'pode'),
  cannot: L('no puede', 'ne peut pas', 'kann nicht', 'não pode'),
  do: L('hacer', 'faire', 'tun', 'fazer'),
  does: L('hace', 'fait', 'tut', 'faz'),
  has: L('tiene', 'a', 'hat', 'tem'),
  have: L('tener', 'avoir', 'haben', 'ter'),
  was: L('fue', 'était', 'war', 'foi'),
  keep: L('guardar', 'garder', 'halten', 'guardar'),
  take: L('tomar', 'prendre', 'nehmen', 'pegar'),
  leave: L('dejar', 'laisser', 'lassen', 'deixar'),
  return: L('volver', 'revenir', 'zurück', 'voltar'),
  stay: L('quedarse', 'rester', 'bleiben', 'ficar'),
  run: L('correr', 'courir', 'laufen', 'correr'),
  cut: L('cortar', 'couper', 'schneiden', 'cortar'),
  pay: L('pagar', 'payer', 'zahlen', 'pagar'),
  file: L('archivar', 'classer', 'ablegen', 'arquivar'),
  filed: L('archivado', 'classé', 'abgelegt', 'arquivado'),
  record: L('registro', 'enregistrement', 'Akte', 'registro'),
  log: L('registro', 'journal', 'Protokoll', 'diário'),
  line: L('línea', 'ligne', 'Linie', 'linha'),
  load: L('carga', 'charge', 'Last', 'carga'),
  work: L('trabajo', 'travail', 'Arbeit', 'trabalho'),
  fire: L('fuego', 'feu', 'Feuer', 'fogo'),
  need: L('necesita', 'besoin', 'braucht', 'precisa'),
  nothing: L('nada', 'rien', 'nichts', 'nada'),
  something: L('algo', 'quelque chose', 'etwas', 'algo'),
  another: L('otro', 'un autre', 'ein anderes', 'outro'),
  same: L('mismo', 'même', 'gleich', 'mesmo'),
  new: L('nuevo', 'nouveau', 'neu', 'novo'),
  old: L('viejo', 'vieux', 'alt', 'velho'),
  light: L('ligero', 'léger', 'leicht', 'leve'),
  heavy: L('pesado', 'lourd', 'schwer', 'pesado'),
  high: L('alto', 'haut', 'hoch', 'alto'),
  low: L('bajo', 'bas', 'niedrig', 'baixo'),
  long: L('largo', 'long', 'lang', 'longo'),
  short: L('corto', 'court', 'kurz', 'curto'),
  local: L('local', 'local', 'lokal', 'local'),
  live: L('en vivo', 'en direct', 'live', 'ao vivo'),
  clear: L('despejado', 'dégagé', 'klar', 'limpo'),
  clean: L('limpio', 'propre', 'sauber', 'limpo'),
  deep: L('profundo', 'profond', 'tief', 'fundo'),
  dark: L('oscuro', 'sombre', 'dunkel', 'escuro'),
  black: L('negro', 'noir', 'schwarz', 'preto'),
  lost: L('perdido', 'perdu', 'verloren', 'perdido'),
  pending: L('pendiente', 'en attente', 'ausstehend', 'pendente'),
  complete: L('completo', 'terminé', 'fertig', 'completo'),
  current: L('actual', 'actuel', 'aktuell', 'atual'),
});

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

function machineTranslatePart(locale, part) {
  let text = part;
  for (const phrase of PHRASE_LIST) {
    if (phrase.length < 4) continue;
    const index = text.toLowerCase().indexOf(phrase.toLowerCase());
    if (index < 0) continue;
    const found = text.slice(index, index + phrase.length);
    const repl = lookupMap(PHRASES, phrase, locale);
    if (repl == null) continue;
    text = text.slice(0, index) + restoreShape(found, repl) + text.slice(index + phrase.length);
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
  return machineTranslate(locale, source);
}

const catalogCache = new Map();

export function buildTranslatedCatalog(locale) {
  if (catalogCache.has(locale)) return catalogCache.get(locale);
  const out = {};
  if (locale === 'en-US') {
    Object.assign(out, englishMessages, barkMessagesFor('en-US'), STORE_COPY['en-US']);
  } else {
    for (const [key, english] of Object.entries(englishMessages)) {
      out[key] = translateMessage(locale, english, key);
    }
    Object.assign(out, barkMessagesFor(locale), STORE_COPY[locale] || {});
  }
  const frozen = Object.freeze(out);
  catalogCache.set(locale, frozen);
  return frozen;
}

export default {
  SHIPPED_LOCALES,
  translateMessage,
  machineTranslate,
  buildTranslatedCatalog,
};
