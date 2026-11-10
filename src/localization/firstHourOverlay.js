// AL-SHOW-5 — reviewed first-hour overlay for the four shipped non-English locales.
// These rows are the sign-off: every string that fires in the first hour from the
// row-409 capture inventory (localizableCaptionMessages — accessibility cues, the
// massline instrument, and the authored recipe captions) plus the boot plate copy a
// player reads first. Whole-string lookups only — unlike PHRASES these are never
// substituted inside a longer machine-translated string, so a caption cannot leak
// into unrelated copy. Terms follow glossary/ and the reviewed store register
// (the tether line is cabo / câble / Seil / cabo; Massline stays a proper noun).

const L = (es, fr, de, pt) => Object.freeze({ 'es-ES': es, 'fr-FR': fr, 'de-DE': de, 'pt-BR': pt });

export const FIRST_HOUR_OVERLAY = Object.freeze({
  // Boot plate (index.html template copy on the first paint).
  'SpaceFace': L('SpaceFace', 'SpaceFace', 'SpaceFace', 'SpaceFace'),
  'SPACEFACE': L('SPACEFACE', 'SPACEFACE', 'SPACEFACE', 'SPACEFACE'),
  'SPACEFACE · FLIGHT SYSTEMS': L(
    'SPACEFACE · SISTEMAS DE VUELO',
    'SPACEFACE · SYSTÈMES DE VOL',
    'SPACEFACE · FLUGSYSTEME',
    'SPACEFACE · SISTEMAS DE VOO',
  ),
  'Initializing systems…': L(
    'Inicializando sistemas…',
    'Initialisation des systèmes…',
    'Systeme werden initialisiert…',
    'Inicializando sistemas…',
  ),
  'Preparing your next departure': L(
    'Preparando tu próxima salida',
    'Préparation de votre prochain départ',
    'Dein nächster Abflug wird vorbereitet',
    'Preparando a sua próxima partida',
  ),
  '00:00': L('00:00', '00:00', '00:00', '00:00'),
  '0%': L('0%', '0%', '0%', '0%'),

  // Accessibility cue captions.
  'Gravity well': L('Pozo de gravedad', 'Puits de gravité', 'Gravitationsbrunnen', 'Poço de gravidade'),
  'Repulsor deployed': L('Repulsor desplegado', 'Répulseur déployé', 'Repulsor ausgebracht', 'Repulsor implantado'),
  'Cone deployed': L('Cono desplegado', 'Cône déployé', 'Konus ausgebracht', 'Cone implantado'),
  'Skim sheet deployed': L(
    'Lámina de deslizamiento desplegada',
    'Voile de glisse déployée',
    'Gleitfläche ausgebracht',
    'Lâmina de deslize implantada',
  ),
  'Seed deployed': L('Semilla desplegada', 'Graine déployée', 'Seed ausgebracht', 'Semente implantada'),
  'Line taut': L('Cabo tenso', 'Câble tendu', 'Seil gespannt', 'Cabo tenso'),
  'Incoming telegraph': L('Telegrafía entrante', 'Télégraphe entrant', 'Telegraph eingehend', 'Telegrafia entrante'),

  // Massline instrument captions.
  'Massline attached.': L('Massline enganchada.', 'Massline accrochée.', 'Massline verankert.', 'Massline engatada.'),
  'Massline strain.': L('Tensión de la Massline.', 'Tension de la Massline.', 'Massline unter Zug.', 'Tensão da Massline.'),
  'Massline reel.': L('Recogida de la Massline.', 'Enroulement de la Massline.', 'Massline-Aufzug.', 'Recolhimento da Massline.'),
  'Massline release.': L('Suelta de la Massline.', 'Relâche de la Massline.', 'Massline-Lösung.', 'Soltura da Massline.'),
  'Massline break.': L('Rotura de la Massline.', 'Rupture de la Massline.', 'Massline-Bruch.', 'Ruptura da Massline.'),
  'Twin bridle chord.': L('Cuerda de brida doble.', 'Corde de bride double.', 'Doppelleinen-Akkord.', 'Corda dupla de brida.'),

  // Ambient fauna and machine captions (the authored recipe sentences).
  'A drifter sings.': L('Una errante canta.', 'Un errant chante.', 'Ein Drifter singt.', 'Um errante canta.'),
  'A grazer calls.': L('Un ramoneador llama.', 'Un brouteur appelle.', 'Ein Graser ruft.', 'Um pastante chama.'),
  'A hunter growls.': L('Un cazador gruñe.', 'Un chasseur grogne.', 'Ein Jäger knurrt.', 'Um caçador rosna.'),
  'A brood vessel hums.': L('Una nave de cría zumba.', 'Un vaisseau-couvée bourdonne.', 'Ein Brutschiff summt.', 'Uma nave de cria zune.'),
  'A relay bearer answers.': L('Un portador de relé responde.', 'Un porteur de relais répond.', 'Ein Relaisträger antwortet.', 'Um portador de relé responde.'),
  'The colony chatters.': L('La colonia parlotea.', 'La colonie jacasse.', 'Die Kolonie schnattert.', 'A colônia tagarela.'),
  'A scavenger clicks.': L('Un carroñero chasquea.', 'Un charognard cliquette.', 'Ein Aasfresser klickt.', 'Um necrófago estala.'),
  'An attached organism rumbles.': L('Un organismo adherido retumba.', 'Un organisme accroché gronde.', 'Ein angesessener Organismus rumort.', 'Um organismo preso ressoa.'),
  'The surveyor sweeps.': L('El topógrafo barre.', 'L’arpenteur balaie.', 'Der Vermesser fegt.', 'O agrimensor varre.'),
  'The custodian cycles.': L('El custodio cicla.', 'Le gardien fait son cycle.', 'Der Verwalter taktet.', 'O zelador cicla.'),
  'The auditor ticks.': L('El auditor hace tictac.', 'L’auditeur fait tic-tac.', 'Der Prüfer tickt.', 'O auditor faz tique-taque.'),
  'The witness rings.': L('El testigo suena.', 'Le témoin sonne.', 'Der Zeuge läutet.', 'A testemunha soa.'),
  'The shepherd pulses.': L('El pastor pulsa.', 'Le berger pulse.', 'Der Hirte pulsiert.', 'O pastor pulsa.'),
  'The mason knocks.': L('El cantero golpea.', 'Le maçon frappe.', 'Der Maurer klopft.', 'O pedreiro bate.'),
  'The executor sounds.': L('El ejecutor suena.', 'L’exécuteur résonne.', 'Der Vollstrecker ertönt.', 'O executor soa.'),
  'The courier whistles.': L('El mensajero silba.', 'Le coursier siffle.', 'Der Kurier pfeift.', 'O mensageiro assobia.'),
  'The conservator hums.': L('El conservador tararea.', 'Le conservateur fredonne.', 'Der Konservator summt.', 'O conservador zune.'),
  'The measure counts.': L('La medida cuenta.', 'La mesure compte.', 'Das Maß zählt.', 'A medida conta.'),
  'The boundary walker calls.': L('El caminante del límite llama.', 'Le marcheur de borne appelle.', 'Der Grenzgänger ruft.', 'O caminhante da fronteira chama.'),
  'The appeals clerk chimes.': L('El escribiente de apelaciones tañe.', 'Le greffier des appels tinte.', 'Der Berufungsklerk klingelt.', 'O escrivão de recursos tilinta.'),
  'The debris sorter clacks.': L('El clasificador de restos traquetea.', 'La trieuse de débris claque.', 'Der Trümmersortierer klackert.', 'O classificador de detritos estala.'),
  'The sleeping jury murmurs.': L('El jurado dormido murmura.', 'Le jury endormi murmure.', 'Die schlafende Jury murmelt.', 'O júri adormecido murmura.'),
  'Dockside voices mingle.': L('Voces del muelle se mezclan.', 'Des voix du quai se mêlent.', 'Dockstimmen mischen sich.', 'Vozes do cais se misturam.'),
  'The berth hums.': L('El atraque zumba.', 'Le poste bourdonne.', 'Der Liegeplatz summt.', 'O berço zune.'),
  'The shift bell rings.': L('La campana del turno suena.', 'La cloche de quart sonne.', 'Die Schichtglocke läutet.', 'O sino do turno toca.'),

  // Refusals, fuel, and machine states.
  'No ammunition.': L('Sin munición.', 'Sans munitions.', 'Keine Munition.', 'Sem munição.'),
  'No valid target.': L('Sin objetivo válido.', 'Pas de cible valide.', 'Kein gültiges Ziel.', 'Sem alvo válido.'),
  'Action refused.': L('Acción rechazada.', 'Action refusée.', 'Aktion verweigert.', 'Ação recusada.'),
  'Fuel reserve.': L('Reserva de combustible.', 'Réserve de carburant.', 'Treibstoffreserve.', 'Reserva de combustível.'),
  'Fuel empty.': L('Combustible agotado.', 'Carburant épuisé.', 'Treibstoff leer.', 'Combustível esgotado.'),
  'Machine working.': L('Máquina en marcha.', 'Machine en marche.', 'Maschine arbeitet.', 'Máquina trabalhando.'),
  'Machine jammed.': L('Máquina atascada.', 'Machine bloquée.', 'Maschine klemmt.', 'Máquina emperrada.'),
  'Anomaly evidence.': L('Evidencia de anomalía.', 'Preuve d’anomalie.', 'Anomalienachweis.', 'Evidência de anomalia.'),

  // Kills.
  'Light kill.': L('Baja ligera.', 'Élimination légère.', 'Leichter Abschuss.', 'Abate leve.'),
  'Heavy kill.': L('Baja pesada.', 'Élimination lourde.', 'Schwerer Abschuss.', 'Abate pesado.'),
  'Kill.': L('Baja.', 'Élimination.', 'Abschuss.', 'Abate.'),
  'Kill confirmed.': L('Baja confirmada.', 'Élimination confirmée.', 'Abschuss bestätigt.', 'Abate confirmado.'),
  'Capital destroyed.': L('Nave capital destruida.', 'Vaisseau capital détruit.', 'Großkampfschiff zerstört.', 'Nave capital destruída.'),

  // The line and the winch.
  'The line lets go.': L('El cabo suelta.', 'Le câble lâche.', 'Das Seil lässt los.', 'O cabo solta.'),
  'The line snaps.': L('El cabo se rompe.', 'Le câble casse.', 'Das Seil reißt.', 'O cabo arrebenta.'),
  'The line is straining.': L('El cabo está en tensión.', 'Le câble est en tension.', 'Das Seil spannt sich.', 'O cabo está sob tensão.'),
  'The winch reels in.': L('El cabrestante recoge.', 'Le treuil enroule.', 'Die Winde spult ein.', 'O guincho recolhe.'),
  'The cable cracks.': L('El cable cruje.', 'Le câble craque.', 'Das Kabel knackt.', 'O cabo estala.'),
  'The line cuts free.': L('El cabo se corta.', 'Le câble se coupe.', 'Das Seil wird durchtrennt.', 'O cabo é cortado.'),
  'The throw leaves the hand.': L('El lanzamiento sale de la mano.', 'Le lancer quitte la main.', 'Der Wurf verlässt die Hand.', 'O arremesso sai da mão.'),

  // Onboarding and flight cues.
  'The shift begins.': L('Comienza el turno.', 'Le quart commence.', 'Die Schicht beginnt.', 'O turno começa.'),
  'A moment lands.': L('Un momento aterriza.', 'Un moment se pose.', 'Ein Moment setzt auf.', 'Um momento assenta.'),
  'Thrusters come up.': L('Los propulsores se activan.', 'Les propulseurs montent.', 'Triebwerke laufen hoch.', 'Os propulsores sobem.'),
  'Thrusters burning.': L('Propulsores encendidos.', 'Propulseurs allumés.', 'Triebwerke brennen.', 'Propulsores queimando.'),
  'Boost engaged.': L('Impulso activado.', 'Boost enclenché.', 'Boost eingelegt.', 'Boost engatado.'),
  'Boost kick.': L('Tirón de impulso.', 'À-coup de boost.', 'Boost-Schub.', 'Tranco de boost.'),
  'Brakes bite.': L('Los frenos muerden.', 'Les freins mordent.', 'Bremsen beißen.', 'Os freios mordem.'),
  'Attitude jets hiss.': L('Los chorros de actitud silban.', 'Les jets d’attitude sifflent.', 'Lagedüsen zischen.', 'Os jatos de atitude sibilam.'),
  'Scanner pulse.': L('Pulso del escáner.', 'Impulsion du scanneur.', 'Scanner-Impuls.', 'Pulso do scanner.'),
  'Mining beam on.': L('Rayo minero activo.', 'Rayon minier actif.', 'Abbaustrahl an.', 'Feixe de mineração ativo.'),
  'The rock chips.': L('La roca se astilla.', 'Le rocher s’écaille.', 'Der Felsen splittert.', 'A rocha lasca.'),
  'Beam locked on the seam.': L('Rayo fijado en el filón.', 'Rayon verrouillé sur le filon.', 'Strahl auf der Erzader fixiert.', 'Feixe travado no filão.'),
  'Pulse laser fires.': L('El láser de pulsos dispara.', 'Le laser à impulsions tire.', 'Pulslaser feuert.', 'O laser de pulsos dispara.'),
  'The instructor speaks.': L('El instructor habla.', 'L’instructeur parle.', 'Der Ausbilder spricht.', 'O instrutor fala.'),
  'Radio keys open.': L('La radio abre canal.', 'La radio ouvre le canal.', 'Funk öffnet den Kanal.', 'O rádio abre o canal.'),
  'Radio closes.': L('La radio cierra.', 'La radio ferme.', 'Funk schließt.', 'O rádio fecha.'),
  'Story channel opens.': L('El canal de historia abre.', 'Le canal de l’histoire s’ouvre.', 'Storykanal öffnet.', 'O canal de história abre.'),

  // Wanted, shields, reactor.
  'You are wanted.': L('Estás buscado.', 'Vous êtes recherché.', 'Du wirst gesucht.', 'Você está procurado.'),
  'The warrant clears.': L('La orden se limpia.', 'Le mandat se dissipe.', 'Der Haftbefehl klingt ab.', 'O mandado é limpo.'),
  'Shields down.': L('Escudos caídos.', 'Boucliers à plat.', 'Schilde unten.', 'Escudos caídos.'),
  'Shields blow out.': L('Los escudos estallan.', 'Les boucliers sautent.', 'Schilde fliegen raus.', 'Os escudos estouram.'),
  'The reactor runs away.': L('El reactor se desboca.', 'Le réacteur s’emballe.', 'Der Reaktor läuft davon.', 'O reator descontrola-se.'),

  // Dock and station.
  'The latch locks.': L('El enganche cierra.', 'Le loquet verrouille.', 'Die Verankerung sperrt.', 'O engate trava.'),
  'Docking clamp seats.': L('La abrazadera de atraque asienta.', 'Le dispositif d’amarrage se cale.', 'Die Dockklammer sitzt.', 'A abraçadeira de atracação assenta.'),
  'Leaving the dock.': L('Saliendo del muelle.', 'Départ du dock.', 'Abflug vom Dock.', 'Saindo do cais.'),
  'The capture lane holds.': L('La vía de captura sostiene.', 'Le couloir de capture tient.', 'Die Fangspur hält.', 'A faixa de captura segura.'),
  'The station hums.': L('La estación zumba.', 'La station bourdonne.', 'Die Station summt.', 'A estação zune.'),

  // Field deploys and loops.
  'Gravity well deploys.': L('El pozo de gravedad se despliega.', 'Le puits de gravité se déploie.', 'Der Gravitationsbrunnen fährt aus.', 'O poço de gravidade se implanta.'),
  'Repulsor deploys.': L('El repulsor se despliega.', 'Le répulseur se déploie.', 'Der Repulsor fährt aus.', 'O repulsor se implanta.'),
  'Cone deploys.': L('El cono se despliega.', 'Le cône se déploie.', 'Der Konus fährt aus.', 'O cone se implanta.'),
  'Incoming telegraph.': L('Telegrafía entrante.', 'Télégraphe entrant.', 'Telegraph eingehend.', 'Telegrafia entrante.'),
  'Gravity well holding.': L('El pozo de gravedad sostiene.', 'Le puits de gravité tient.', 'Der Gravitationsbrunnen hält.', 'O poço de gravidade segura.'),
  'Repulsor holding.': L('El repulsor sostiene.', 'Le répulseur tient.', 'Der Repulsor hält.', 'O repulsor segura.'),
  'Cone holding.': L('El cono sostiene.', 'Le cône tient.', 'Der Konus hält.', 'O cone segura.'),

  // Receipts and mission state.
  'Credits received.': L('Créditos recibidos.', 'Crédits reçus.', 'Credits erhalten.', 'Créditos recebidos.'),
  'Mission accepted.': L('Misión aceptada.', 'Mission acceptée.', 'Mission angenommen.', 'Missão aceita.'),
  'Mission complete.': L('Misión completada.', 'Mission terminée.', 'Mission erfüllt.', 'Missão concluída.'),
  'Cruise engaged.': L('Crucero activado.', 'Croisière enclenchée.', 'Reiseflug eingelegt.', 'Cruzeiro engatado.'),

  // The positional-bearing template — placeholders stay intact in every locale.
  "{sound}, {clock} o'clock.": L(
    '{sound}, a las {clock} en punto.',
    '{sound}, à {clock} heures.',
    '{sound}, auf {clock} Uhr.',
    '{sound}, às {clock} em ponto.',
  ),
});

export function firstHourOverlayFor(english, locale) {
  const row = FIRST_HOUR_OVERLAY[english];
  if (!row) return null;
  return row[locale] != null ? row[locale] : null;
}

export default FIRST_HOUR_OVERLAY;
