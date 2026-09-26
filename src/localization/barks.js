// Bark corpus translations. Agent register pass — not a machine dump.
// Registers (from src/data/barks.js): Concord bureaucratic / Meridian mercantile / Drift tired
// / Reach salvage-math / Quiet terse / Choir liturgy / Frontier plain / Vael clause-language.
// Arrays are index-aligned with the English corpus. Placeholders {ship} {class} stay intact.

import {
  BARKS,
  BARK_FACTIONS,
  BARK_SITUATIONS,
  HULL_RECOGNITION,
} from '../data/barks.js';

const R = (es, fr, de, pt) => Object.freeze({ es, fr, de, pt });
const locKey = (locale) => (
  locale === 'es-ES' ? 'es' : locale === 'fr-FR' ? 'fr' : locale === 'de-DE' ? 'de' : locale === 'pt-BR' ? 'pt' : null
);

const T = Object.freeze({
  faction_scn: Object.freeze({
    scan: [
      R('Patrulla Concord. Espere para verificación rutinaria de transpondedor. Ref 44-C.', 'Patrouille Concord. Tenez-vous prêt pour la vérification de transpondeur. Ref 44-C.', 'Concord-Patrouille. Bereithalten zur Transponderprüfung. Ref 44-C.', 'Patrulha Concord. Aguarde a verificação rotineira do transponder. Ref 44-C.'),
      R('Nave identificada. Su manifiesto queda sujeto a inspección. No se desvíe.', 'Vaisseau identifié. Votre manifeste est soumis à inspection. Ne déviez pas.', 'Schiff identifiziert. Ihr Manifest unterliegt der Kontrolle. Nicht abweichen.', 'Nave identificada. Seu manifesto está sujeito a inspeção. Não desvie.'),
      R('Llamada automática: cumpla el barrido de sensores. El incumplimiento queda registrado.', 'Appel automatique : soumettez-vous au balayage. Le non-respect est consigné.', 'Automatischer Ruf: SensorSweep einhalten. Nichtbefolgung wird vermerkt.', 'Chamada automática: cumpra a varredura de sensores. O descumprimento fica registrado.'),
      R('Consulta de transpondedor archivada bajo su matrícula. Su operador anterior ya contestó esta.', 'Requête transpondeur consignée sous votre registre. L’opérateur précédent a déjà répondu.', 'Transponderabfrage unter Ihrem Register abgelegt. Der Vorbetreiber hat das schon beantwortet.', 'Consulta de transponder arquivada no seu registro. O operador anterior já respondeu esta.'),
    ],
    warn: [
      R('Entra en un corredor controlado. Reduzca velocidad o será citado.', 'Vous entrez dans un corridor contrôlé. Réduisez ou vous serez cité.', 'Sie fahren in einen kontrollierten Korridor. Tempo runter oder Anzeige.', 'Você entra num corredor controlado. Reduza a velocidade ou será citado.'),
      R('Aviso: su rumbo viola el protocolo de tránsito. Corríjalo ahora.', 'Avis : votre cap viole le protocole de transit. Corrigez-le maintenant.', 'Hinweis: Ihr Kurs verletzt das Transitprotokoll. Jetzt korrigieren.', 'Aviso: sua proa viola o protocolo de trânsito. Corrija agora.'),
      R('Puesto de control Concord. Presente el permiso o mantenga posición.', 'Poste Concord. Présentez le laissez-passer ou tenez la position.', 'Concord-Kontrollpunkt. Freigabe vorzeigen oder Position halten.', 'Posto Concord. Apresente a autorização ou mantenha a posição.'),
      R('Corredor cerrado bajo Ref 44-C. El cierre no exige motivo. Exige una firma.', 'Corridor fermé sous Ref 44-C. La fermeture n’exige pas de motif. Elle exige une signature.', 'Korridor geschlossen unter Ref 44-C. Die Sperre braucht keinen Grund. Sie braucht eine Unterschrift.', 'Corredor fechado sob Ref 44-C. O fechamento não pede motivo. Pede uma assinatura.'),
    ],
    'demand-cargo': [
      R('Incautación de carga autorizada bajo Ref 44-C. Corte el motor y prepárese para el abordaje.', 'Saisie de cargaison autorisée sous Ref 44-C. Coupez la poussée et préparez l’abordage.', 'Frachtbeschlagnahme unter Ref 44-C. Antrieb kappen, Enterung vorbereiten.', 'Apreensão de carga autorizada sob Ref 44-C. Corte o motor e prepare o embarque.'),
      R('Sus mercancías están marcadas para revisión administrativa. Entrégelas.', 'Vos biens sont signalés pour revue administrative. Remettez-les.', 'Ihre Güter sind zur Verwaltungsprüfung markiert. Herausgeben.', 'Suas mercadorias estão marcadas para revisão administrativa. Entregue-as.'),
      R('El cumplimiento no es opcional. Alije el contrabando para su recogida.', 'La conformité n’est pas optionnelle. Jetez la contrebande pour collecte.', 'Befolgung ist nicht optional. Konterbande zum Abholen abwerfen.', 'O cumprimento não é opcional. Alije o contrabando para recolha.'),
      R('La carga se reclasificó antes de llamarle. El lote es nuestro en el libro de todos modos.', 'La cargaison a été reclassée avant l’appel. Le lot est au livre, à nous de toute façon.', 'Die Fracht wurde vor dem Ruf umklassifiziert. Die Ladung steht so oder so in unserem Buch.', 'A carga foi reclassificada antes da chamada. O lote é nosso no livro de qualquer forma.'),
    ],
    attack: [
      R('Resistencia anotada. Escalando a acción de cumplimiento.', 'Résistance notée. Passage à l’action d’exécution.', 'Widerstand vermerkt. Eskalation zur Vollstreckung.', 'Resistência anotada. Escalando para ação de cumprimento.'),
      R('Ahora es incumplidor. Ordenanza autorizada.', 'Vous êtes désormais non conforme. Munitions autorisées.', 'Sie sind jetzt nicht konform. Munition freigegeben.', 'Agora está em descumprimento. Munição autorizada.'),
      R('Archivando informe de uso de fuerza. Armas libres.', 'Dépôt du rapport d’emploi de la force. Armes libres.', 'Gewaltanwendungsbericht wird abgelegt. Waffen frei.', 'Arquivando relatório de uso da força. Armas livres.'),
      R('Informe de fuerza fechado a su primera desviación. Nos ahorra un paso.', 'Rapport de force antidaté à votre premier écart. Ça économise une étape.', 'Gewaltbericht vordatiert auf Ihre erste Abweichung. Spart einen Schritt.', 'Relatório de força pré-datado à sua primeira desvio. Economiza um passo.'),
    ],
    flee: [
      R('Desenganchando. Su matrícula queda marcada para seguimiento.', 'Désengagement. Votre registre est signalé pour suivi.', 'Löse. Ihr Register ist zur Nachverfolgung markiert.', 'Desengajando. Seu registro ficou marcado para acompanhamento.'),
      R('Persecución suspendida. El incidente permanece abierto, Ref 44-C.', 'Poursuite suspendue. L’incident reste ouvert, Ref 44-C.', 'Verfolgung ausgesetzt. Der Vorgang bleibt offen, Ref 44-C.', 'Perseguição suspensa. O incidente permanece aberto, Ref 44-C.'),
      R('Nos retiramos a reevaluar. El papeleo no se retira.', 'Retrait pour réévaluation. La paperasse, elle, ne se retire pas.', 'Rückzug zur Neubewertung. Der Papierkram zieht nicht ab.', 'Retirada para reavaliar. A papelada não se retira.'),
      R('Su huida queda archivada como evasión. La evasión acumula recargo por ciclo. Facturamos.', 'Votre fuite est classée évasion. L’évasion accumule une surtaxe par cycle. Nous facturons.', 'Ihre Flucht ist als Umgehung abgelegt. Umgehung sammelt Zuschlag je Zyklus. Wir stellen in Rechnung.', 'Sua fuga está arquivada como evasão. Evasão acumula acréscimo por ciclo. Faturamos.'),
    ],
    reinforce: [
      R('Solicitando apoyo de patrulla. Unidades adicionales en aproximación.', 'Demande de soutien de patrouille. Unités supplémentaires en approche.', 'Patrouillenunterstützung angefordert. Weitere Einheiten im Anflug.', 'Solicitando apoio de patrulha. Unidades adicionais a caminho.'),
      R('Escalada aprobada. Elementos en espera, converjan.', 'Escalade approuvée. Éléments en attente, convergez.', 'Eskalation genehmigt. Bereitschaftselemente, zusammenziehen.', 'Escalada aprovada. Elementos em espera, converjam.'),
      R('Refuerzo despachado. Mantengan el contención.', 'Renfort dépêché. Maintenez le confinement.', 'Verstärkung entsandt. Einschließung halten.', 'Reforço despachado. Mantenham o contorno.'),
      R('Dos llamadas de patrulla archivadas. El presupuesto cubre la segunda. Siempre lo ha hecho.', 'Deux appels de patrouille classés. Le budget couvre le second. Toujours.', 'Zwei Patrouillenrufe abgelegt. Das Budget deckt den zweiten. Immer schon.', 'Duas chamadas de patrulha arquivadas. O orçamento cobre a segunda. Sempre cobriu.'),
    ],
    taunt: [
      R('Cada maniobra que hace queda registrada. Toda.', 'Chaque manœuvre que vous faites est consignée. Toutes.', 'Jedes Manöver von Ihnen wird vermerkt. Alles.', 'Cada manobra que você faz fica registrada. Todas.'),
      R('No puede huir de un archivo.', 'Vous ne pouvez pas distancer un classement.', 'Sie können einer Akte nicht davonfliegen.', 'Você não foge de um arquivo.'),
      R('La multa acumula cumpla o no.', 'L’amende court, que vous vous pliez ou non.', 'Das Bußgeld läuft, ob Sie folgen oder nicht.', 'A multa acumula, cumpra ou não.'),
      R('Su transpondedor ya está archivado como incumplidor. Póngase al día.', 'Votre transpondeur est déjà classé non conforme. Rattrapez.', 'Ihr Transponder ist schon als nicht konform abgelegt. Aufholen.', 'Seu transponder já está arquivado como descumpridor. Alcance.'),
      R('Tres de sus marcas son anteriores a su dueño de este casco. El resto lo archivamos nosotros.', 'Trois de vos marques précèdent votre propriété de cette coque. Nous avons classé le reste.', 'Drei Ihrer Marken sind älter als Ihr Besitz dieses Rumpfs. Den Rest haben wir abgelegt.', 'Três das suas marcas são anteriores à sua posse deste casco. O resto arquivamos nós.'),
    ],
    'patrol-greeting': [
      R('Patrulla Concord en estación. Deje el transpondedor encendido y pase.', 'Patrouille Concord en poste. Transpondeur allumé et passez.', 'Concord-Patrouille auf Station. Transponder an, durchfahren.', 'Patrulha Concord na estação. Deixe o transponder aceso e passe.'),
      R('Patrulla de rutina. Nada que ver. Siga.', 'Patrouille de routine. Rien à voir. Circulez.', 'Routinepatrouille. Nichts zu sehen. Weiter.', 'Patrulha de rotina. Nada para ver. Siga.'),
      R('Tránsito lícito reconocido. Buen paso.', 'Transit licite reconnu. Bon passage.', 'Rechtmäßiger Transit anerkannt. Gute Fahrt.', 'Trânsito lícito reconhecido. Bom passagem.'),
      R('La red de aduana está viva este turno. Mantenga los manifiestos honestos.', 'Le filet douanier est vivant ce quart. Manifestes honnêtes.', 'Zollnetz ist diese Schicht live. Manifeste ehrlich halten.', 'A rede aduaneira está viva neste turno. Mantenha os manifestos honestos.'),
      R('Turno 14. El mismo corredor. Los mismos siete códigos de sello. Archivado.', 'Quart 14. Le même corridor. Les mêmes sept codes de scellé. Classé.', 'Schicht 14. Derselbe Korridor. Dieselben sieben Siegelcodes. Abgelegt.', 'Turno 14. O mesmo corredor. Os mesmos sete códigos de lacre. Arquivado.'),
      R('Pase. La orden se mantiene. Ponga las tasas al día antes del siguiente ciclo.', 'Passez. L’ordre tient. Mettez vos frais à jour avant le prochain cycle.', 'Durch. Die Anordnung hält. Gebühren vor dem nächsten Zyklus aktuell machen.', 'Passe. A ordem se mantém. Ponha as taxas em dia antes do próximo ciclo.'),
    ],
  }),
  faction_mts: Object.freeze({
    scan: [
      R('Comercio Meridian. Solo confirmamos que su cuenta está en regla. Nada personal.', 'Meridian Trade. On vérifie seulement que le compte est en règle. Rien de personnel.', 'Meridian Trade. Nur die Bestätigung, dass Ihr Konto steht. Nichts Persönliches.', 'Comércio Meridian. Só confirmando que a conta está em dia. Nada pessoal.'),
      R('Sondeando su matrícula — llámelo estudio de mercado. Quédese quieto.', 'Ping de votre registre — appelons ça de la recherche marché. Ne bougez pas.', 'Register-Ping — nennen wir’s Marktforschung. Stillhalten.', 'Sondando o registro — chame de pesquisa de mercado. Fique parado.'),
      R('Llamada del Sindicato. Nos gusta saber con quién hacemos negocios.', 'Appel du Syndicat. On aime savoir avec qui on traite.', 'Syndikat-Ruf. Wir wissen gern, mit wem wir Geschäfte machen.', 'Chamada do Sindicato. Gostamos de saber com quem fazemos negócio.'),
      R('Revisión de cuenta. Su saldo está sano. La salud de sus competidores está en el tablero.', 'Vérification de compte. Votre solde est sain. La santé de vos concurrents est au tableau.', 'Kontoprüfung. Ihr Saldo ist gesund. Die Gesundheit der Konkurrenz steht an der Tafel.', 'Checagem de conta. Seu saldo está saudável. A saúde dos concorrentes está no quadro.'),
      R('Control de carril Tethys: sondeo del registro contra conocimientos de embarque abiertos. Mantenga el rumbo.', 'Contrôle de voie Tethys : ping du registre sur les connaissements ouverts. Gardez le cap.', 'Tethys-Spurkontrolle: Register-Ping gegen offene Frachtbriefe. Kurs halten.', 'Controle de faixa Tethys: sondando o registro contra conhecimentos de embarque abertos. Mantenha o rumo.'),
    ],
    warn: [
      R('Este carril lleva peaje, amigo. No lo ha pagado.', 'Cette voie a un péage, l’ami. Vous ne l’avez pas payé.', 'Diese Spur hat Maut, Freund. Sie ist nicht bezahlt.', 'Esta faixa tem pedágio, amigo. Você não pagou.'),
      R('Comercia en nuestro territorio sin licencia. Eso es una tasa esperando ocurrir.', 'Vous tradez sur notre territoire sans licence. C’est une taxe en attente.', 'Sie handeln in unserem Gebiet ohne Lizenz. Das ist eine Gebühr, die passieren will.', 'Você negocia no nosso território sem licença. Isso é uma taxa esperando acontecer.'),
      R('Tómese esto como un aviso de cortesía antes de que sea una factura.', 'Prenez ceci pour un avis de courtoisie avant que ça ne devienne une facture.', 'Betrachten Sie das als Höflichkeit, bevor es eine Rechnung wird.', 'Tome isto como aviso de cortesia antes de virar fatura.'),
      R('Su carga está cortando la posición equivocada. Muévala o movemos el precio.', 'Votre cargaison shorte la mauvaise position. Déplacez-la, ou on déplace le prix.', 'Ihre Fracht shortet die falsche Position. Bewegen Sie sie, oder wir bewegen den Preis.', 'Sua carga está shortando a posição errada. Mova-a ou movemos o preço.'),
    ],
    'demand-cargo': [
      R('Hagamos un trato: su carga, nuestros términos. La alternativa cuesta más.', 'Faisons un marché : votre cargaison, nos termes. L’alternative coûte plus.', 'Ein Deal: Ihre Fracht, unsere Konditionen. Die Alternative kostet mehr.', 'Vamos fechar: sua carga, nossos termos. A alternativa custa mais.'),
      R('Un pequeño porcentaje de su bodega y olvidamos haberle visto. Razonable, ¿no?', 'Un petit pourcentage de la soute et on oublie vous avoir vu. Raisonnable, non ?', 'Ein kleiner Prozentsatz des Laderaums und wir vergessen, Sie gesehen zu haben. Vernünftig, ja?', 'Uma pequena percentagem do porão e esquecemos que vimos você. Razoável, sim?'),
      R('Considérelo una adquisición. El precio es todo lo que lleva.', 'Voyez ça comme une acquisition. Le prix, c’est tout ce que vous portez.', 'Betrachten Sie das als Übernahme. Der Preis ist alles, was Sie tragen.', 'Considere uma aquisição. O preço é tudo o que você carrega.'),
      R('El contenido de la bodega ya está apuntado a nuestro margen. Entrégalo y condonamos el almacenaje.', 'Le contenu de soute est déjà porté à notre marge. Remettez, on waive les frais de stockage.', 'Der Laderauminhalt ist schon auf unsere Marge gebucht. Herausgeben, und die Lagergebühr entfällt.', 'O conteúdo do porão já está no nosso margem. Entregue e isentamos a taxa de armazenagem.'),
    ],
    attack: [
      R('Debió pagar. Ahora aplica el recargo.', 'Vous auriez dû payer. Désormais, le markup s’applique.', 'Sie hätten zahlen sollen. Jetzt gilt der Aufschlag.', 'Devia ter pago. Agora vale o acréscimo.'),
      R('Lamentable. Esto irá desglosado.', 'Regrettable. Ce sera détaillé.', 'Bedauerlich. Das wird positioniert.', 'Lamentável. Isto vai itemizado.'),
      R('Malo para el negocio, pero liquidamos cuentas.', 'Mauvais pour les affaires, mais on solde les comptes.', 'Schlecht fürs Geschäft, aber wir gleichen ab.', 'Ruim para o negócio, mas acertamos as contas.'),
      R('Su seguro contrafirmó nuestros términos. El pago empieza en los restos de su casco.', 'Votre assurance a contresigné nos termes. Le versement commence sur les débris de coque.', 'Ihre Versicherung hat unsere Konditionen gegengezeichnet. Auszahlung beginnt am Rumpfschrott.', 'Seu seguro contra-assinou nossos termos. O pagamento começa nos destroços do casco.'),
    ],
    flee: [
      R('Un placer no hacer negocios. Su saldo permanece abierto.', 'Plaisir de ne pas traiter. Votre solde reste ouvert.', 'Vergnügen, kein Geschäft zu machen. Ihr Saldo bleibt offen.', 'Prazer em não negociar. Seu saldo permanece aberto.'),
      R('Nos veremos. El Sindicato siempre cobra.', 'On se reverra. Le Syndicat encaisse toujours.', 'Wir sehen uns. Das Syndikat kassiert immer.', 'A gente se vê. O Sindicato sempre cobra.'),
      R('Nos retiramos. Considere la cuenta meramente aplazada.', 'On se retire. Considérez le compte simplement différé.', 'Rückzug. Betrachten Sie das Konto als bloß aufgeschoben.', 'Retirada. Considere a conta apenas adiada.'),
      R('Corra. Su deuda se capitaliza cada ciclo que nos lleva ventaja.', 'Courez. Votre dette capitalise à chaque cycle d’avance.', 'Lauf. Ihre Schuld zinst jeden Zyklus, den Sie uns voraus sind.', 'Corra. Sua dívida capitaliza a cada ciclo que você nos leva.'),
    ],
    reinforce: [
      R('Llamando al equipo de cobros. Quédese quieto, por favor.', 'On appelle l’équipe de recouvrement. Restez donc là.', 'Inkasso-Team wird gerufen. Bleiben Sie stehen.', 'Chamando a equipe de cobrança. Fique parado.'),
      R('Activos adicionales en aproximación. Esto es ahora una adquisición prioritaria.', 'Actifs supplémentaires en approche. Acquisition prioritaire désormais.', 'Weitere Assets im Anflug. Das ist jetzt eine Prioritätsübernahme.', 'Ativos adicionais a caminho. Isto é agora uma aquisição prioritária.'),
      R('Refuerzo en ruta — hay que proteger la inversión.', 'Renfort en route — l’investissement doit être protégé.', 'Verstärkung unterwegs — die Investition muss geschützt werden.', 'Reforço a caminho — o investimento precisa ser protegido.'),
      R('Recuperación archivada. El consejo no da de baja activos. Los reposesiona.', 'Recouvrement classé. Le conseil ne passe pas les actifs en perte. Il les reprend.', 'Bergung abgelegt. Der Vorstand schreibt Assets nicht ab. Er pfändet sie.', 'Recuperação arquivada. O conselho não dá baixa em ativos. Ele retoma.'),
    ],
    taunt: [
      R('Todo tiene precio. Incluso usted. Sobre todo usted.', 'Tout a un prix. Même vous. Surtout vous.', 'Alles hat einen Preis. Auch Sie. Gerade Sie.', 'Tudo tem preço. Até você. Principalmente você.'),
      R('No puede permitirse esta discusión.', 'Vous ne pouvez pas vous offrir cet argument.', 'Dieses Argument können Sie sich nicht leisten.', 'Você não pode pagar este argumento.'),
      R('La casa siempre gana, y nosotros somos la casa.', 'La maison gagne toujours, et nous sommes la maison.', 'Das Haus gewinnt immer, und wir sind das Haus.', 'A casa sempre ganha, e nós somos a casa.'),
      R('Su cuenta pasó a cobros en el momento en que abrió fuego.', 'Votre compte est passé au recouvrement dès que vous avez ouvert le feu.', 'Ihr Konto ging an Inkasso, als Sie das Feuer eröffneten.', 'Sua conta foi para cobrança no momento em que abriu fogo.'),
      R('El índice de aire del Foso subió dos puntos mientras disparaba. Alguien le dio las gracias.', 'L’indice d’air de la Fosse a bougé de deux points pendant que vous tiriez. Quelqu’un vous a remercié.', 'Der Luftindex der Grube bewegte sich zwei Punkte, während Sie schossen. Jemand hat sich bedankt.', 'O índice de ar do Poço subiu dois pontos enquanto você atirava. Alguém agradeceu.'),
    ],
    'patrol-greeting': [
      R('Escolta Meridian. Las tarifas son justas, en su mayoría. Vuelo seguro.', 'Escorte Meridian. Les tarifs sont justes, surtout. Bon vol.', 'Meridian-Eskorte. Die Sätze sind fair, meistens. Gut fliegen.', 'Escolta Meridian. As tarifas são justas, na maior parte. Voe seguro.'),
      R('Carril comercial asegurado. Tenga los créditos a mano.', 'Voie commerciale sécurisée. Gardez les crédits sous la main.', 'Handelsspur gesichert. Credits griffbereit.', 'Faixa comercial segura. Tenha os créditos à mão.'),
      R('Convoy del Sindicato de paso. Sin tasas hoy. Disfrútelo.', 'Convoi du Syndicat qui passe. Pas de frais aujourd’hui. Profitez.', 'Syndikat-Konvoi passiert. Heute keine Gebühren. Genießen.', 'Comboio do Sindicato passando. Sem taxas hoje. Aproveite.'),
      R('Buen ciclo. Aire Limpio está arriba. No pregunte a costa de quién.', 'Bon cycle. Air Clair est en hausse. Ne demandez pas sur qui il baisse.', 'Guter Zyklus. Klare Luft ist oben. Nicht fragen, auf wessen Kosten.', 'Bom ciclo. Ar Limpo está em alta. Não pergunte sobre quem caiu.'),
      R('Llamada del mercado Tethys: presente el conocimiento de embarque o salde la tarifa de tránsito en la boya.', 'Appel de la bourse Tethys : présentez le connaissement ou réglez le tarif de transit à la bouée.', 'Tethys-Börsenruf: Frachtbrief vorlegen oder Transittarif an der Boje begleichen.', 'Chamada da bolsa Tethys: apresente o conhecimento de embarque ou quite a tarifa de trânsito na boia.'),
      R('Mercante Tethys en aproximación: despacho de carga en fianza registrado en el mercado Meridian.', 'Trader Tethys en approche : dédouanement de fret sous bond consigné à la bourse Meridian.', 'Tethys-Händler im Anflug: verzollte Frachtfreigabe bei der Meridian-Börse gebucht.', 'Comerciante Tethys chegando: desembaraço de carga alfandegada registrado na bolsa Meridian.'),
    ],
  }),
  faction_dmc: Object.freeze({
    scan: [
      R('Colectivo Drift. Solo mirando que no vengas a saltarte una concesión. Turno largo.', 'Collectif Drift. On vérifie que t’es pas en train de sauter une concession. Longue vacation.', 'Drift-Kollektiv. Nur checken, dass du keinen Claim klauen willst. Lange Schicht.', 'Coletivo Drift. Só vendo se você não tá pulando concessão. Turno longo.'),
      R('Leyendo el casco. ¿Perdido, o trabajando?', 'Lecture de coque. T’es perdu, ou t’es au boulot ?', 'Rumpf gelesen. Verlaufen, oder bei der Arbeit?', 'Lendo o casco. Perdido, ou trabalhando?'),
      R('Llamada de minero. Diga el asunto, corto.', 'Appel de mineur. Dis ton affaire, fais court.', 'Minenruf. Sag dein Geschäft, knapp.', 'Chamada de minerador. Diz o negócio, curto.'),
      R('Decimocuarto turno esta semana. Leyendo el faro. Procura no ser interesante.', 'Quatorzième vacation cette semaine. Lecture de balise. Essaie de pas être intéressant.', 'Vierzehnte Schicht diese Woche. Bake gelesen. Versuch, nicht interessant zu sein.', 'Décimo quarto turno esta semana. Lendo o farol. Tenta não ser interessante.'),
      R('Control del astillero Ceres. Revisa tu vector de deriva; el muelle de la refinería está lleno hasta el pórtico.', 'Contrôle du chantier Ceres. Vérifie ton vecteur de dérive ; le dock de la raffinerie est plein jusqu’au portique.', 'Ceres-Werftkontrolle. Driftvektor prüfen; Raffineriedock ist bis zum Portalkran voll.', 'Controle do estaleiro Ceres. Confere teu vetor de deriva; a doca da refinaria tá cheia até o pórtico.'),
    ],
    warn: [
      R('Eso es una concesión archivada en la que te estás metiendo. Atrás, no queremos lío.', 'C’est une concession classée dans laquelle tu dérives. Recule, on veut pas d’embrouille.', 'Das ist ein abgelegter Claim, in den du treibst. Weg da, wir wollen keinen Ärger.', 'Isso é concessão arquivada na qual você tá entrando. Recua, a gente não quer treta.'),
      R('La roca está hablada. Sigue antes de que alguien lo convierta en un asunto.', 'Le rocher est pris. Circule avant que quelqu’un en fasse une affaire.', 'Der Felsen ist vergeben. Weiter, bevor jemand eine Sache draus macht.', 'A rocha tá falada. Segue antes que alguém transforme isso em caso.'),
      R('Estás en un cinturón trabajado. Ya tuvimos un ciclo duro. No sumes.', 'T’es dans une ceinture travaillée. On a déjà eu un cycle rude. Rajoute pas.', 'Du bist in einem abgearbeiteten Gürtel. Rauher Zyklus schon. Nicht drauflegen.', 'Você tá num cinturão trabalhado. Já tivemos um ciclo bruto. Não some.'),
      R('Esa es nuestra veta. MTS ya se llevó un tercio. Sangramos por lo que queda. Apártate.', 'C’est notre veine. MTS a déjà écumé un tiers. On saigne pour le reste. Dégage.', 'Das ist unsere Ader. MTS hat schon ein Drittel abgeschöpft. Wir bluten für den Rest. Weg.', 'Essa é a nossa veia. A MTS já tirou um terço. A gente sangra pelo que sobra. Sai.'),
    ],
    'demand-cargo': [
      R('Mira, tira el mineral y estamos en paz. Nadie quiere sangrar por piedras.', 'Écoute, jette le minerai et on est quittes. Personne veut saigner pour des cailloux.', 'Hör zu, wirf das Erz ab und wir sind quitt. Keiner will für Steine bluten.', 'Olha, larga o minério e tamo quites. Ninguém quer sangrar por pedra.'),
      R('Esa carga es nuestra por derecho. Entrégala y todos nos vamos a casa.', 'Ce chargement est à nous de droit. Remets-le et on rentre tous.', 'Die Ladung ist uns zuständig. Herausgeben, und alle gehen heim.', 'Essa carga é nossa por direito. Entrega e todo mundo vai pra casa.'),
      R('Tomaste de una concesión. Devuélvelo y lo olvidamos. Estoy demasiado cansado para esto.', 'T’as pris sur une concession. Rends et on oublie. Je suis trop fatigué pour ça.', 'Du hast von einem Claim genommen. Zurück, und wir vergessen’s. Ich bin zu müde dafür.', 'Você tirou de uma concessão. Devolve e a gente esquece. Tô cansado demais pra isso.'),
      R('Ese mineral alimentó un pozo nueve años. El pozo alimentó una estación. Nosotros somos la estación. Suéltalo.', 'Ce minerai a nourri un puits neuf ans. Le puits a nourri une station. On EST la station. Lâche.', 'Das Erz hat neun Jahre einen Schacht gefüttert. Der Schacht eine Station. Wir sind die Station. Abwerfen.', 'Esse minério alimentou um poço nove anos. O poço alimentou uma estação. A gente É a estação. Larga.'),
    ],
    attack: [
      R('Maldita sea. Vale. Lo quieres por las malas.', 'Merde. Bon. Tu le veux à la dure.', 'Verdammt. Gut. Du willst’s auf die harte Tour.', 'Droga. Tá. Você quer do jeito difícil.'),
      R('Debiste irte andando. Ahora también tengo que archivar un incidente.', 'T’aurais dû t’en aller. Maintenant je dois classer un incident en plus.', 'Hättest einfach gehen sollen. Jetzt muss ich auch noch einen Vorfall ablegen.', 'Devia ter ido embora. Agora ainda tenho que arquivar um incidente.'),
      R('No me apunté a esto hoy, pero aquí estamos.', 'J’ai pas signé pour ça aujourd’hui, mais on y est.', 'Hab mich heut nicht dafür gemeldet, aber hier sind wir.', 'Não assinei pra isso hoje, mas aqui estamos.'),
      R('El reactor es viejo. Las manos están frías. Aún me alcanza para abrirte por la veta.', 'Le réacteur est vieux. Les mains sont froides. J’ai encore de quoi t’ouvrir pour la veine.', 'Reaktor ist alt. Hände kalt. Reicht immer noch, dich für die Ader aufzureißen.', 'O reator é velho. As mãos tão frias. Ainda dá pra te abrir pela veia.'),
    ],
    flee: [
      R('No vale la pena. Me voy a casa. Quédate las piedras.', 'Ça vaut pas. Je rentre. Garde les cailloux.', 'Nicht wert. Ich geh heim. Behalt die Steine.', 'Não vale. Vou pra casa. Fica com as pedras.'),
      R('Me retiro. No me muero por la cuota de otro.', 'Je me casse. Je vais pas mourir pour le quota d’un autre.', 'Zieh ab. Sterb nicht für fremde Quote.', 'Tô saindo. Não vou morrer pela cota dos outros.'),
      R('Listo. Esto está por encima de mi sueldo.', 'Fini. Ça dépasse ma paye.', 'Fertig. Das ist über meiner Gehaltsstufe.', 'Pronto. Isso tá acima do meu salário.'),
      R('Me voy a casa. Dos montadores no lo hicieron este ciclo. Yo sí.', 'Je rentre. Deux riggers l’ont pas fait ce cycle. Moi si.', 'Geh heim. Zwei Rigger haben’s diesen Zyklus nicht. Ich schon.', 'Vou pra casa. Dois montadores não foram este ciclo. Eu vou.'),
    ],
    reinforce: [
      R('Radio a las otras plataformas. Aguanta, vienen.', 'Je radio les autres rigs. Tiens bon, ils arrivent.', 'Funk an die anderen Rigs. Halt durch, sie kommen.', 'Rádio pras outras plataformas. Aguenta, tão vindo.'),
      R('Reúno a la cuadrilla. Aquí nos cuidamos los nuestros.', 'Je prends l’équipe. On s’occupe des nôtres, ici.', 'Hol die Crew. Wir kümmern uns um unsre, hier draußen.', 'Vou buscar a turma. A gente cuida dos nossos aqui.'),
      R('El silbato está arriba. El cinturón responde.', 'Le sifflet est levé. La ceinture répond.', 'Pfeife ist oben. Der Gürtel antwortet.', 'O apito subiu. O cinturão tá respondendo.'),
      R('Viene todo el turno. No dejamos nuestro mineral en la bodega de otra cuadrilla.', 'Toute la vacation arrive. On laisse pas notre minerai dans la soute d’une autre équipe.', 'Die ganze Schicht kommt. Wir lassen unser Erz nicht in fremdem Laderaum.', 'O turno inteiro vem. A gente não deixa nosso minério no porão de outra turma.'),
    ],
    taunt: [
      R('¿Alguna vez hiciste un día de trabajo honesto? No pensé.', 'T’as déjà fait une vraie journée de boulot ? Je pensais pas.', 'Je ehrlich einen Tag gearbeitet? Dachte ich nicht.', 'Já fez um dia honesto de trabalho? Nem pensei.'),
      R('Mucha boca para alguien que nunca cavó una piedra.', 'Grand discours pour quelqu’un qui a jamais creusé un caillou.', 'Großes Maul für jemanden, der nie einen Stein gegraben hat.', 'Muita boca pra quem nunca cavou uma pedra.'),
      R('Llámalo pérdida de humedad cuando te hayas ido. Encaja en la columna.', 'Appelle ça perte d’humidité quand t’y seras plus. Ça rentre dans la colonne.', 'Nenn’s Feuchtigkeitsverlust, wenn du weg bist. Passt in die Spalte.', 'Chama de perda de umidade quando você for. Cabe na coluna.'),
      R('Tú pones precio a nuestro mineral. Nosotros al casco. Misma báscula. Misma matemática fría.', 'Tu pries notre minerai. On prie ta coque. Mêmes balances. Même math froide.', 'Du preist unser Erz. Wir preisen deinen Rumpf. Dieselben Waagen. Dieselbe kalte Mathematik.', 'Você precifica nosso minério. A gente precifica seu casco. Mesma balança. Mesma matemática fria.'),
    ],
    'patrol-greeting': [
      R('Plataforma Drift, acarreando. Cuidado con los restos, amigo.', 'Rig Drift, on haul. Gaffe aux débris, l’ami.', 'Drift-Rig, am Schleppen. Vorsicht Schrott, Freund.', 'Plataforma Drift, carregando. Cuidado com os restos, amigo.'),
      R('Solo trabajando el cinturón. Tú a lo tuyo.', 'On bosse la ceinture. Fais ta vie.', 'Nur den Gürtel abarbeiten. Mach du deins.', 'Só trabalhando o cinturão. Você faz o seu.'),
      R('Buenos acarreos por ahí. Es un trecho largo hasta cualquier parte.', 'Bons hauls là-bas. C’est loin, n’importe où.', 'Gute Schleppfahrten da draußen. Weit bis irgendwohin.', 'Bons carregos por aí. É um trecho longo até qualquer lugar.'),
      R('Nueve abajo en el Pozo Cuatro. Dos aquí arriba. Mismo mineral. Mismas cuotas. Pasa de largo.', 'Neuf en bas au Puits Quatre. Deux ici. Même minerai. Mêmes quotas. Passe.', 'Neun unten Schacht Vier. Zwei hier oben. Dasselbe Erz. Dieselben Quoten. Vorbei.', 'Nove lá embaixo no Poço Quatro. Dois aqui em cima. Mesmo minério. Mesmas cotas. Pasa.'),
      R('Llamada del astillero Ceres: mantén la distancia de los muelles de la refinería, el turno va caliente.', 'Appel du chantier Ceres : garde tes distances des docks de la raffinerie, la vacation tourne chaud.', 'Ceres-Werftruf: Abstand zu den Raffineriedocks halten, die Schicht läuft heiß.', 'Chamada do estaleiro Ceres: mantém distância das docas da refinaria, o turno tá correndo quente.'),
      R('Mercante Ceres en aproximación: cargamento de mineral Drift del cinturón, despeja la cinta.', 'Trader Ceres en approche : chargement de minerai Drift de la ceinture, libère le convoyeur.', 'Ceres-Händler im Anflug: Drift-Erzfracht aus dem Gürtel, Förderband freimachen.', 'Comerciante Ceres chegando: carga de minério Drift do cinturão, libera o transportador.'),
    ],
  }),
  faction_reach: Object.freeze({
    scan: [
      R('Alcance Carmesí. Llevamos un rato mirando tu firma de calor, amigo.', 'Crimson Reach. On surveille ta signature thermique depuis un moment, l’ami.', 'Crimson Reach. Wir schauen deine Wärmesignatur schon eine Weile an, Freund.', 'Alcance Carmesim. A gente tá olhando sua assinatura de calor faz um tempo, amigo.'),
      R('Bonito casco. Apuesto a que lleva cosas bonitas. Midiéndote.', 'Belle coque. Je parie qu’elle porte de belles choses. On te jauge.', 'Schöner Rumpf. Wette, der trägt schöne Sachen. Wir messen dich.', 'Casco bonito. Aposto que carrega coisa boa. Te medindo.'),
      R('Piquete Reach. No nos hagas caso. Solo... contamos.', 'Piquet Reach. Fais comme si on y était pas. On… compte.', 'Reach-Posten. Stör uns nicht. Wir… zählen nur.', 'Piquete Reach. Não liga. A gente só… conta.'),
      R('Albarán de peso abierto. Tu masa ya está en el tablero.', 'Bon de pesée ouvert. Ta masse est déjà au tableau.', 'Wiegeschein offen. Deine Masse steht schon an der Tafel.', 'Guia de peso aberta. Sua massa já está no quadro.'),
      R('Anotamos el tonelaje. Anotamos el escolta. La cuenta dice que vas ligero para este carril.', 'Tonnage noté. Escorte notée. Le calcul dit que t’es léger pour cette voie.', 'Tonnage notiert. Eskorte notiert. Die Rechnung sagt, du bist leicht für diese Spur.', 'Anotamos a tonelagem. Anotamos a escolta. A conta diz que você tá leve pra esta faixa.'),
    ],
    warn: [
      R('Este es nuestro carril ahora. Date la vuelta mientras puedas.', 'C’est notre voie maintenant. Demi-tour tant que tu peux.', 'Das ist jetzt unsere Spur. Dreh um, solange du kannst.', 'Esta é a nossa faixa agora. Vira enquanto ainda dá.'),
      R('Te metiste en la oscuridad equivocada. Último aviso.', 'T’as dévié dans le mauvais noir. Dernier avertissement.', 'Du bist in die falsche Dunkelheit gelaufen. Letzte Warnung.', 'Você entrou no escuro errado. Último aviso.'),
      R('El Alcance es dueño de este tramo. Paga el cruce o no cruces.', 'Le Reach possède ce tronçon. Paye le passage ou passe pas.', 'Reach besitzt dieses Stück. Zahl die Querung oder quer nicht.', 'O Alcance é dono deste trecho. Paga a travessia ou não atravessa.'),
      R('La estela está salada. Gira ahora o vuela a través de nuestro trabajo.', 'Le sillage est salé. Tourne maintenant ou traverse notre ouvrage.', 'Kielwasser ist gesalzen. Jetzt drehen oder durch unsere Arbeit fliegen.', 'A esteira tá salgada. Vira agora ou voa pelo nosso trabalho.'),
      R('Este carril nos costó cuatro cascos. Lo pagas en carga o en casco. Somos flexibles.', 'Cette voie nous a coûté quatre coques. Tu paies en cargaison ou en coque. On est souples.', 'Diese Spur hat uns vier Rümpfe gekostet. Du zahlst in Fracht oder in Rumpf. Wir sind flexibel.', 'Esta faixa nos custou quatro cascos. Você paga em carga ou em casco. A gente é flexível.'),
    ],
    'demand-cargo': [
      R('Todo lo de la bodega, ahora, y a lo mejor te quedas el barco.', 'Tout ce qu’il y a en soute, maintenant, et p’t-être que tu gardes le vaisseau.', 'Alles im Laderaum, jetzt, und vielleicht behältst du das Schiff.', 'Tudo do porão, agora, e talvez você fique com a nave.'),
      R('La carga o la vida. La carga la cogemos de todos modos.', 'La cargaison ou la vie. La cargaison, on la prend de toute façon.', 'Fracht oder Leben. Die Fracht nehmen wir so oder so.', 'A carga ou a vida. A carga a gente leva de qualquer jeito.'),
      R('Tíralo todo. No preguntamos dos veces, y apenas preguntamos una.', 'Jette tout. On demande pas deux fois, et on a à peine demandé une.', 'Alles abwerfen. Wir fragen nicht zweimal, und kaum einmal.', 'Larga tudo. A gente não pergunta duas vezes, e mal perguntou uma.'),
      R('Diezma la bodega. El telón se queda de todos modos.', 'Dîme la soute. Le rideau reste levé de toute façon.', 'Zehnt den Laderaum. Der Vorhang bleibt so oder so.', 'Dízimo o porão. A cortina fica de qualquer jeito.'),
      R('El lote, el manifiesto y los códigos de sello. Pesamos a la salida. No nos hagas volver a pesar.', 'Le lot, le manifeste, et les codes de scellé. On pèse à la sortie. Nous fais pas repeeser.', 'Ladung, Manifest und Siegelcodes. Wir wiegen beim Raus. Lass uns nicht nachwiegen.', 'O lote, o manifesto e os códigos de lacre. Pesamos na saída. Não faz a gente pesar de novo.'),
    ],
    attack: [
      R('¡Debiste darnos la carga! ¡Desmóntalo!', 'T’aurais dû donner la cargaison ! Démontre-le !', 'Hättest uns die Fracht geben sollen! Nimm ihn auseinander!', 'Devia ter dado a carga! Desmonta ele!'),
      R('¡Córtenle los motores! ¡Vale más lento!', 'Coupez ses moteurs ! Il vaut plus lent !', 'Triebwerke kappen! Langsam ist er mehr wert!', 'Corta os motores! Ele vale mais devagar!'),
      R('¡Enciéndanlo antes de que avise!', 'Allume-le avant qu’il prévienne !', 'Zünd ihn, bevor er Funk macht!', 'Acende ele antes de chamar!'),
      R('Primero los paneles. La carga flota si el casco revienta.', 'Les panneaux d’abord. La cargaison flotte si la coque pète.', 'Zuerst die Platten. Fracht treibt, wenn der Rumpf platzt.', 'Painéis primeiro. A carga flutua se o casco estourar.'),
    ],
    flee: [
      R('Este muerde — ¡rompan, rompan!', 'Celui-là mord — cassez, cassez !', 'Der beißt — abbrechen, abbrechen!', 'Esse morde — rompe, rompe!'),
      R('No vale el salvamento. ¡Nos vamos!', 'Ça vaut pas le sauvetage. On se casse !', 'Salvage nicht wert. Wir sind weg!', 'Não vale o salvamento. Vamos embora!'),
      R('¡Dispérsense! Hay presa más fácil que esta.', 'Dispersez ! Y a du gibier plus facile.', 'Zerstreuen! Es gibt leichteres Wild.', 'Dispersem! Tem presa mais fácil que essa.'),
      R('Fuera. Tres de nosotros por uno de él. La cuenta giró. Hace eso.', 'On se tire. Trois de nous pour un de lui. Le calcul a tourné. Ça fait ça.', 'Raus. Drei von uns für einen von ihm. Die Rechnung hat sich gedreht. Tut sie das.', 'Sai. Três da gente por um dele. A conta virou. Ela faz isso.'),
    ],
    reinforce: [
      R('¡Llama a la jauría! ¡Diles que hay uno gordo!', 'Appelle la meute ! Dis-leur y a un gros !', 'Ruf das Rudel! Sag ihnen, da ist ein fetter!', 'Chama a matilha! Diz que tem um gordo!'),
      R('¡Trae todo el nido, este va cargado!', 'Amène tout le nid, celui-là est chargé !', 'Hol das ganze Nest, der ist voll!', 'Traz o ninho inteiro, esse tá carregado!'),
      R('¡Reach! ¡A mí! ¡Tenemos uno vivo!', 'Reach ! À moi ! On a un vivant !', 'Reach! Zu mir! Wir haben einen Lebenden!', 'Reach! Comigo! Tem um vivo!'),
      R('Vane quiere el casco de este numerado. Tráelo entero o trae el número.', 'Vane veut le numéro de coque de celui-là. Amène-le entier ou amène le numéro.', 'Vane will die Rumpfnummer von dem. Bring ihn ganz oder bring die Nummer.', 'Vane quer o casco deste numerado. Traz inteiro ou traz o número.'),
    ],
    taunt: [
      R('Ya estás muerto, solo no lo has archivado.', 'T’es déjà mort, t’as juste pas classé.', 'Du bist schon tot, hast’s nur noch nicht abgelegt.', 'Você já tá morto, só não arquivou.'),
      R('Cuarenta toneladas de casco, doce de carga, cero de seso. Pesado y hallado.', 'Quarante tonnes de coque, douze de cargaison, zéro de bon sens. Pesé et trouvé.', 'Vierzig Tonnen Rumpf, zwölf Fracht, null Verstand. Gewogen und gefunden.', 'Quarenta toneladas de casco, doze de carga, zero de juízo. Pesado e achado.'),
      R('Tu valor de salvamento sube por segundo. Sigue disparando.', 'Ta valeur de sauvetage grimpe à la seconde. Continue de tirer.', 'Dein Salvage-Wert klettert pro Sekunde. Weiter schießen.', 'Seu valor de salvamento sobe por segundo. Continua atirando.'),
      R('Te marcamos antes de que te enfríes. El albarán ya está impreso.', 'On te tague avant que tu refroidisses. Le bon de pesée est déjà imprimé.', 'Wir taggen dich, bevor du auskühlst. Der Wiegeschein ist schon gedruckt.', 'A gente te marca antes de esfriar. A guia já tá impressa.'),
      R('Fuimos carga una vez. Marcados, pesados, archivados bajo el margen de alguien. Ahora llevamos las básculas.', 'On a été cargaison. Tagués, pesés, classés sous la marge de quelqu’un. Maintenant on tient les balances.', 'Wir waren mal Fracht. Getaggt, gewogen, unter fremder Marge abgelegt. Jetzt führen wir die Waagen.', 'A gente foi carga. Marcados, pesados, arquivados na margem de alguém. Agora a gente toca as balanças.'),
    ],
    'patrol-greeting': [
      R('Territorio Reach. Sigue moviéndote y a lo mejor te dejamos.', 'Territoire Reach. Continue d’avancer et p’t-être qu’on te laisse.', 'Reach-Gebiet. Beweg dich weiter, vielleicht lassen wir dich.', 'Território Reach. Continua andando e talvez a gente deixe.'),
      R('Estás vivo porque nos aburrimos. No lo fuerces.', 'T’es vivant parce qu’on s’ennuie. Force pas.', 'Du lebst, weil uns langweilig ist. Nicht treiben.', 'Você tá vivo porque a gente tá entediado. Não força.'),
      R('¿De paso? Rápido, entonces. De verdad rápido.', 'De passage ? Vite, alors. Vraiment vite.', 'Nur durch? Dann schnell. Wirklich schnell.', 'De passagem? Rápido, então. Bem rápido.'),
      R('Pasa de largo. Nuestros últimos tres amigos que pararon están soldados al Trono.', 'Passe. Nos trois derniers amis qui se sont arrêtés sont soudés au Trône.', 'Vorbei. Unsere letzten drei Freunde, die hielten, sind in den Thron geschweißt.', 'Pasa. Nossos últimos três amigos que pararam estão soldados no Trono.'),
    ],
  }),
  faction_quiet: Object.freeze({
    scan: [
      R('Visto.', 'Vu.', 'Gesehen.', 'Visto.'),
      R('Quedas registrado.', 'T’es consigné.', 'Du bist vermerkt.', 'Você está registrado.'),
      R('Ya conocemos tu cara.', 'On connaît ta face, maintenant.', 'Wir kennen dein Gesicht jetzt.', 'A gente já conhece tua cara.'),
      R('Contado. Cuarenta y dos hoy.', 'Compté. Quarante-deux aujourd’hui.', 'Gezählt. Zweiundvierzig heute.', 'Contado. Quarenta e dois hoje.'),
    ],
    warn: [
      R('Ruta equivocada. Vete.', 'Mauvaise route. Pars.', 'Falsche Route. Weg.', 'Rota errada. Sai.'),
      R('Aquí no.', 'Pas ici.', 'Nicht hier.', 'Aqui não.'),
      R('Da la vuelta. Sin repetición.', 'Demi-tour. Pas de répétition.', 'Umkehren. Keine Wiederholung.', 'Vira. Sem repetir.'),
      R('Este carril no lleva manifiesto. El tuyo tampoco. Gira.', 'Cette voie n’a pas de manifeste. Le tien non plus. Tourne.', 'Diese Spur führt kein Manifest. Deins auch nicht. Dreh.', 'Esta faixa não carrega manifesto. A sua tampouco. Vira.'),
    ],
    'demand-cargo': [
      R('La bodega. Ahora.', 'La soute. Maintenant.', 'Der Laderaum. Jetzt.', 'O porão. Agora.'),
      R('Dalo. En silencio.', 'Donne. Tranquille.', 'Gib. Still.', 'Entrega. Quieto.'),
      R('Carga. O nada.', 'Cargaison. Ou rien.', 'Fracht. Oder nichts.', 'Carga. Ou nada.'),
      R('Bodega. Sin nombres. Sin cadena.', 'Soute. Pas de noms. Pas de chaîne.', 'Laderaum. Keine Namen. Keine Kette.', 'Porão. Sem nomes. Sem cadeia.'),
    ],
    attack: [
      R('No más palabras.', 'Plus de mots.', 'Keine Worte mehr.', 'Chega de palavras.'),
      R('Se acabó hablar.', 'Fini de parler.', 'Ausgeredet.', 'Acabou a conversa.'),
      R('Entonces esto.', 'Alors ça.', 'Dann das.', 'Então isto.'),
      R('Uno menos que contar.', 'Un de moins à compter.', 'Einen weniger zu zählen.', 'Um a menos pra contar.'),
    ],
    flee: [
      R('Ido.', 'Parti.', 'Weg.', 'Foi.'),
      R('Luego.', 'Plus tard.', 'Später.', 'Depois.'),
      R('Hoy no.', 'Pas aujourd’hui.', 'Heute nicht.', 'Hoje não.'),
      R('Cuarenta y dos. Aún.', 'Quarante-deux. Toujours.', 'Zweiundvierzig. Immer noch.', 'Quarenta e dois. Ainda.'),
    ],
    reinforce: [
      R('Vienen otros.', 'D’autres viennent.', 'Andere kommen.', 'Vêm outros.'),
      R('No solo.', 'Pas seul.', 'Nicht allein.', 'Não sozinho.'),
      R('Espéralos.', 'Attends-les.', 'Warte auf sie.', 'Espera eles.'),
      R('Más puertas se abren.', 'D’autres portes s’ouvrent.', 'Mehr Türen gehen auf.', 'Mais portas abrem.'),
    ],
    taunt: [
      R('Los ruidosos mueren primero.', 'Les bruyants meurent d’abord.', 'Die Lauten sterben zuerst.', 'Os barulhentos morrem primeiro.'),
      R('Hablas demasiado.', 'Tu parles trop.', 'Du redest zu viel.', 'Você fala demais.'),
      R('Previsible.', 'Prévisible.', 'Vorhersehbar.', 'Previsível.'),
      R('El fantasma ya tiene el disparo.', 'Le fantôme a déjà le tir.', 'Geist hat den Schuss schon.', 'O fantasma já tem o tiro.'),
      R('Archivaste un nombre. Los nombres pesan. Soltamos peso.', 'T’as classé un nom. Les noms pèsent. On lâche le poids.', 'Du hast einen Namen abgelegt. Namen sind Gewicht. Wir werfen Gewicht ab.', 'Você arquivou um nome. Nomes pesam. A gente larga peso.'),
    ],
    'patrol-greeting': [
      R('Pasa. No digas nada.', 'Passe. Dis rien.', 'Durch. Sag nichts.', 'Passe. Não fala nada.'),
      R('No te vimos.', 'On t’a pas vu.', 'Wir haben dich nicht gesehen.', 'A gente não te viu.'),
      R('En silencio.', 'Reste tranquille.', 'Halt’s still.', 'Fica quieto.'),
      R('Sin registro. Sin onda. Vete.', 'Pas de log. Pas d’onde. Va.', 'Kein Log. Keine Welle. Geh.', 'Sem log. Sem onda. Vai.'),
      R('Pasa. El número queda igual de todos modos.', 'Passe. Le nombre reste le même de toute façon.', 'Durch. Die Zahl bleibt so oder so.', 'Passe. O número fica o mesmo de qualquer jeito.'),
    ],
  }),
  faction_choir: Object.freeze({
    scan: [
      R('El Coro observa. Detente.', 'Le Chœur observe. Tiens.', 'Der Chor beobachtet. Halt.', 'O Coro observa. Pare.'),
      R('Detente. Sé leído.', 'Tiens. Sois lu.', 'Halt. Werde gelesen.', 'Pare. Seja lido.'),
      R('Patrón abierto. En pie.', 'Motif ouvert. Debout.', 'Muster offen. Steh.', 'Padrão aberto. Em pé.'),
      R('Llegas llevando tu nombre. Pesa más de lo que sabes.', 'Tu arrives portant ton nom. Il est plus lourd que tu ne sais.', 'Du kommst und trägst deinen Namen. Er ist schwerer, als du weißt.', 'Você chega carregando o nome. Ele é mais pesado do que você sabe.'),
    ],
    warn: [
      R('Vacío consagrado. Retírate.', 'Vide consacré. Retire-toi.', 'Geweihte Leere. Zieh dich zurück.', 'Vazio consagrado. Retire-se.'),
      R('No es tuyo. Gira.', 'Pas à toi. Tourne.', 'Nicht deins. Dreh.', 'Não é seu. Vira.'),
      R('Carril-santuario. Parte.', 'Voie-sanctuaire. Pars.', 'Schrein-Spur. Geh.', 'Faixa-santuário. Parta.'),
      R('El Patrón sostiene este carril. Tú eres la disonancia. Retírate.', 'Le Motif tient cette voie. Tu es la dissonance. Retire-toi.', 'Das Muster hält diese Spur. Du bist die Dissonanz. Zurück.', 'O Padrão segura esta faixa. Você é a dissonância. Retire-se.'),
    ],
    'demand-cargo': [
      R('Diezmo. Suelta. Asciende.', 'Dîme. Relâche. Élève.', 'Zehnte. Loslassen. Aufsteigen.', 'Dízimo. Solta. Sobe.'),
      R('La carga es nuestra. Dala.', 'Le fardeau est nôtre. Donne.', 'Die Last ist unser. Gib.', 'O fardo é nosso. Entrega.'),
      R('Ofrece la bodega. Sé aligerado.', 'Offre la soute. Sois allégé.', 'Biete den Laderaum. Werde leichter.', 'Oferece o porão. Seja aliviado.'),
      R('Tu carga es peso. El peso es nombre. Suéltalo y asciende.', 'Ta cargaison est poids. Le poids est nom. Relâche et élève.', 'Deine Fracht ist Gewicht. Gewicht ist Name. Loslassen und aufsteigen.', 'Sua carga é peso. Peso é nome. Solta e sobe.'),
    ],
    attack: [
      R('Corregido. Quédate quieto.', 'Corrigé. Tiens-toi.', 'Korrigiert. Stillhalten.', 'Corrigido. Fique parado.'),
      R('El Patrón exige. Se da.', 'Le Motif exige. Il est donné.', 'Das Muster verlangt. Es wird gegeben.', 'O Padrão exige. É dado.'),
      R('Deshecho. Rehecho más limpio.', 'Défait. Refait plus net.', 'Aufgelöst. Sauberer neu gemacht.', 'Desfeito. Refeito mais limpo.'),
      R('Estribillo. El fuego es la respuesta.', 'Refrain. Le feu est la réponse.', 'Refrain. Feuer ist die Antwort.', 'Refrão. O fogo é a resposta.'),
      R('El séptimo intervalo. Tu corrección ya está notada.', 'Le septième intervalle. Ta correction est déjà notée.', 'Das siebte Intervall. Deine Korrektur ist schon notiert.', 'O sétimo intervalo. Sua correção já está notada.'),
    ],
    flee: [
      R('Registrado. La distancia no cambia nada.', 'Enregistré. La distance ne change rien.', 'Aufgezeichnet. Distanz ändert nichts.', 'Registrado. Distância não muda nada.'),
      R('El Patrón sostiene. Nos retiramos.', 'Le Motif tient. Nous nous retirons.', 'Das Muster hält. Wir ziehen uns zurück.', 'O Padrão segura. Nós nos retiramos.'),
      R('Aplazado. Nunca denegado.', 'Différé. Jamais nié.', 'Aufgeschoben. Nie verweigert.', 'Adiado. Nunca negado.'),
      R('El siguiente coro recuerda tu rumbo.', 'Le chœur suivant se souvient de ton cap.', 'Der nächste Chor erinnert deinen Kurs.', 'O próximo coro lembra tua proa.'),
    ],
    reinforce: [
      R('Coro, converjan.', 'Chœur, convergez.', 'Chor, zusammenziehen.', 'Coro, converjam.'),
      R('Más voces. Completen el coro.', 'Plus de voix. Achevez le chœur.', 'Mehr Stimmen. Den Chor vollenden.', 'Mais vozes. Completem o coro.'),
      R('Los fieles se reúnen. Cántenlo en silencio.', 'Les fidèles se rassemblent. Chantez-le silencieux.', 'Die Gläubigen sammeln. Singt ihn still.', 'Os fiéis se reúnem. Cantem-no em silêncio.'),
      R('Tercer estribillo. Formen el anillo.', 'Troisième refrain. Formez l’anneau.', 'Dritter Refrain. Den Ring formen.', 'Terceiro refrão. Formem o anel.'),
      R('Entra la novena voz. El Patrón se ensancha para recibirlo.', 'La neuvième voix entre. Le Motif s’élargit pour le recevoir.', 'Die neunte Stimme tritt ein. Das Muster weitet sich, ihn aufzunehmen.', 'Entra a nona voz. O Padrão se alarga para recebê-lo.'),
    ],
    taunt: [
      R('Ya estás en el Patrón.', 'Tu es déjà dans le Motif.', 'Du bist schon im Muster.', 'Você já está no Padrão.'),
      R('El vacío te ha archivado.', 'Le vide t’a classé.', 'Die Leere hat dich abgelegt.', 'O vazio te arquivou.'),
      R('Quédate quieto. Es más rápido.', 'Tiens-toi. C’est plus vite.', 'Stillhalten. Es ist schneller.', 'Fique parado. É mais rápido.'),
      R('Tus colores ya están contados.', 'Tes couleurs sont déjà comptées.', 'Deine Farben sind schon gezählt.', 'Suas cores já estão contadas.'),
      R('Te aferras a tu nombre. Nosotros soltamos el nuestro. Mira quién queda ligero.', 'Tu t’accroches à ton nom. Nous avons relâché le nôtre. Regarde qui est allégé.', 'Du klammerst dich an deinen Namen. Wir ließen den unsren. Schau, wer leichter ist.', 'Você se agarra ao nome. Nós soltamos o nosso. Veja quem ficou leve.'),
    ],
    'patrol-greeting': [
      R('El Coro pasa.', 'Le Chœur passe.', 'Der Chor zieht vorbei.', 'O Coro passa.'),
      R('Paz. Tu hora vendrá, o no.', 'Paix. Ton heure viendra, ou non.', 'Frieden. Deine Zeit kommt, oder nicht.', 'Paz. Tua hora virá, ou não.'),
      R('Seguimos cantando.', 'Nous chantons encore.', 'Wir singen weiter.', 'Seguimos cantando.'),
      R('Camina ligero. El Patrón no exige que te recuerden.', 'Marche léger. Le Motif n’exige pas que tu sois souvenu.', 'Geh leicht. Das Muster verlangt nicht, dass man dich erinnert.', 'Ande leve. O Padrão não exige que você seja lembrado.'),
    ],
  }),
  faction_free: Object.freeze({
    scan: [
      R('Relé de Frontera. Solo mirando quién anda por aquí. Sin lío.', 'Relais Frontière. On regarde juste qui est dehors. Pas d’embrouille.', 'Grenzrelais. Nur schauen, wer draußen ist. Kein Ärger.', 'Relé da Fronteira. Só vendo quem anda por aí. Sem treta.'),
      R('Leyendo tu faro. ¿Amistoso? Nosotros sí.', 'Lecture de balise. T’es amical ? On l’est.', 'Bake gelesen. Freundlich? Wir schon.', 'Lendo teu farol. Amigável? A gente é.'),
      R('Frontera Libre. No mordemos si no nos muerden. Sigue.', 'Frontière Libre. On mord pas si on nous mord pas. Continue.', 'Freie Grenze. Wir beißen nur, wenn gebissen. Weiter.', 'Fronteira Livre. A gente não morde se não morderem. Segue.'),
      R('Llamada de Frontera. Eres el tercer transpondedor vivo esta semana. Los otros no eran amistosos.', 'Appel Frontière. T’es le troisième transpondeur vivant cette semaine. Les autres l’étaient pas.', 'Grenzruf. Du bist der dritte lebende Transponder diese Woche. Die anderen waren’s nicht.', 'Chamada da Fronteira. Você é o terceiro transponder vivo esta semana. Os outros não eram amigáveis.'),
    ],
    warn: [
      R('Ojo, ese rumbo es lío. Igual quieres desviar.', 'Attention, ce cap, c’est des ennuis. Tu ferais mieux de dévier.', 'Kopf hoch, der Kurs ist Ärger. Vielleicht umleiten.', 'Olha, essa proa é encrenca. Talvez queira desviar.'),
      R('No es nuestra regla, pero por aquí no te van a querer. Solo digo.', 'C’est pas notre règle, mais les gens d’ici t’aimeront pas. Je dis ça.', 'Nicht unsere Regel, aber die Leute hier mögen dich hier nicht. Nur gesagt.', 'Não é nossa regra, mas o pessoal daqui não vai gostar de você aqui. Só dizendo.'),
      R('Te estás metiendo en un tramo feo. Consejo gratis: no.', 'Tu pousses dans un coin rude. Conseil gratuit : fais pas.', 'Du drängst in ein rauhes Stück. Kostenloser Rat: nicht.', 'Você tá empurrando num trecho bruto. Conselho de graça: não.'),
      R('Estela salada adelante. El Alcance la sembró hace dos ciclos. Toma el camino largo.', 'Sillage salé devant. Le Reach l’a semé il y a deux cycles. Prends le long.', 'Gesalzenes Kielwasser voraus. Reach hat’s vor zwei Zyklen gesät. Den langen Weg.', 'Esteira salgada à frente. O Alcance semeou há dois ciclos. Pega o caminho longo.'),
    ],
    'demand-cargo': [
      R('Mira, los tiempos están flacos. Comparte carga y nos separamos amigos.', 'Écoute, les temps sont maigres. Lâche un peu de cargaison et on se quitte amis.', 'Hör zu, die Zeiten sind mager. Teil Fracht, und wir gehen als Freunde.', 'Olha, os tempos tão magros. Divide um pouco de carga e a gente se separa amigo.'),
      R('No me enorgullece, pero necesitamos lo que acarreás. Hazlo fácil.', 'J’suis pas fier, mais on a besoin de ce que tu haules. Fais simple.', 'Bin nicht stolz, aber wir brauchen, was du schleppst. Mach’s einfach.', 'Não tenho orgulho, mas a gente precisa do que você carrega. Faz fácil.'),
      R('Entrega una parte y nadie tiene un mal día. Tú decides.', 'Lâche une part et personne a une mauvaise journée. À toi.', 'Gib einen Anteil, und niemand hat einen schlechten Tag. Deine Wahl.', 'Entrega uma parte e ninguém tem um dia ruim. Você decide.'),
      R('La estación detrás se quedó sin filtros. Tu bodega no. Comparte, y olvidamos que nos vimos.', 'La station derrière n’a plus de filtres. Ta soute si. Partage, on oublie qu’on s’est vus.', 'Die Station hinter uns ist ohne Filter. Dein Laderaum nicht. Teilen, und wir vergessen uns.', 'A estação atrás ficou sem filtros. Teu porão não. Divide, e a gente esquece que se viu.'),
    ],
    attack: [
      R('Está bien, lo pediste. Odio que haya llegado a esto.', 'Bon, t’as demandé. Je déteste que ça en soit là.', 'Gut, du wolltest es. Hasst, dass es so weit kam.', 'Tá, você pediu. Odeio que tenha chegado nisso.'),
      R('No quería esta pelea, pero la termino.', 'Je voulais pas ce combat, mais je le finis.', 'Wollte den Kampf nicht, aber ich mach ihn fertig.', 'Não queria esta briga, mas eu termino.'),
      R('Vale. Sin rencor, pero disparo ahora.', 'Bon. Sans rancune, mais je tire maintenant.', 'Gut. Nichts Persönliches, aber ich schieße jetzt.', 'Tá. Sem mágoa, mas eu atiro agora.'),
      R('Dos de mi cuadrilla se murieron de hambre en el último tramo flaco. Lo hiciste personal.', 'Deux de mon équipage ont crevé de faim au dernier haul maigre. T’as rendu ça personnel.', 'Zwei meiner Crew sind auf der letzten mageren Fahrt verhungert. Du hast’s persönlich gemacht.', 'Dois da minha turma morreram de fome no último trecho magro. Você deixou pessoal.'),
    ],
    flee: [
      R('Esto no vale. Me despego, suerte ahí fuera.', 'Ça vaut pas. Je me décolle, bonne chance dehors.', 'Das ist’s nicht wert. Löse, viel Glück da draußen.', 'Isso não vale. Tô saindo, boa sorte aí fora.'),
      R('No. Hoy no me muero. Nos vamos.', 'Non. Je meurs pas aujourd’hui. On se casse.', 'Nein. Heute sterb ich nicht. Wir sind weg.', 'Não. Hoje eu não morro. Vamos embora.'),
      R('Empate. Vuela seguro, en serio.', 'Appelons ça un match nul. Vole prudent, vraiment.', 'Nennen wir’s unentschieden. Flieg sicher, ernsthaft.', 'Empate. Voa seguro, sério.'),
      R('Me voy a casa. Dile a la estación que lo intentamos.', 'Je rentre. Dis à la station qu’on a essayé.', 'Geh heim. Sag der Station, wir haben’s versucht.', 'Vou pra casa. Diz pra estação que a gente tentou.'),
    ],
    reinforce: [
      R('Pongo a los demás en la línea. Aguanta.', 'Je prends les autres sur la ligne. Tiens bon.', 'Hol die anderen auf die Leitung. Halt durch.', 'Vou colocar os outros na linha. Aguenta.'),
      R('La gente de Frontera se junta — viene ayuda.', 'Les gens de Frontière tiennent ensemble — le secours arrive.', 'Grenzleute halten zusammen — Hilfe kommt.', 'O pessoal da Fronteira se junta — a ajuda vem.'),
      R('Radio a los vecinos. Aguanta.', 'Je radio les voisins. Tiens bon.', 'Funk an die Nachbarn. Halt durch.', 'Rádio pros vizinhos. Aguenta.'),
      R('La estación de paso está despierta. Nos deben el último convoy. Están pagando.', 'La waystation est réveillée. Ils nous doivent le dernier convoi. Ils paient.', 'Die Wegstation ist wach. Sie schulden uns den letzten Konvoi. Sie zahlen.', 'A estação de passagem acordou. Eles nos devem o último comboio. Estão pagando.'),
    ],
    taunt: [
      R('Vuelas como si tuvieras un sitio mejor que estar.', 'Tu voles comme si t’avais mieux à faire.', 'Du fliegst, als hättest du woanders was Besseres.', 'Você voa como se tivesse lugar melhor pra estar.'),
      R('Sistema grande por aquí. Sitio de sobra para correr.', 'Grand système, ici. Y a de la place pour courir.', 'Großes System hier draußen. Platz genug zum Laufen.', 'Sistema grande por aqui. Tem espaço pra correr.'),
      R('No da vergüenza irse, amigo. La oferta sigue.', 'Pas de honte à partir, l’ami. L’offre tient.', 'Keine Schande zu gehen, Freund. Angebot steht.', 'Não tem vergonha em ir embora, amigo. A oferta vale.'),
      R('Cogiste este carril porque estaba vacío. Está vacío por una razón.', 'T’as pris cette voie parce qu’elle était vide. Elle est vide pour une raison.', 'Du nahmst diese Spur, weil sie leer war. Sie ist leer aus einem Grund.', 'Você pegou esta faixa porque estava vazia. Está vazia por um motivo.'),
      R('Aquí no se saluda. Los que saludaron son por lo que este carril tiene nombre.', 'On salue pas, ici. Ceux qui ont salué, c’est pour ça que la voie a un nom.', 'Hier winkt man nicht. Die, die winkten, sind warum diese Spur einen Namen hat.', 'Aqui a gente não acena. Os que acenaram são o motivo deste nome.'),
    ],
    'patrol-greeting': [
      R('Vigía de Frontera. La estación de paso está abierta si la necesitas. Vuela fácil.', 'Veille Frontière. La waystation est ouverte si t’en as besoin. Vole cool.', 'Grenzwache. Wegstation ist offen, wenn du sie brauchst. Flieg locker.', 'Vigia da Fronteira. A estação de passagem tá aberta se precisar. Voa leve.'),
      R('Todo despejado. Saluda si necesitas algo.', 'Tout clair ici. Fais signe si t’as besoin.', 'Alles klar hier draußen. Wink, wenn du was brauchst.', 'Tudo limpo por aqui. Acena se precisar de algo.'),
      R('Solo vecinos vigilando. Buen viaje.', 'Juste des voisins qui veillent. Bon voyage.', 'Nur Nachbarn, die ein Auge haben. Gute Reise.', 'Só vizinhos de olho. Boa viagem.'),
      R('Devuelve el saludo, amigo. Pocos lo hacen. Acorta la noche.', 'Salue en retour, l’ami. Peu le font. Ça raccourcit la nuit.', 'Wink zurück, Freund. Wenige tun’s. Macht die Nacht kürzer.', 'Acena de volta, amigo. Poucos fazem. Encurta a noite.'),
    ],
  }),
  faction_vael: Object.freeze({
    scan: [
      R('Consenso Vael. Cláusula 1: su presencia queda registrada. Espere disposición.', 'Consensus Vael. Clause 1 : votre présence est enregistrée. Attendez disposition.', 'Vael-Konsens. Klausel 1: Ihre Anwesenheit ist registriert. Disposition abwarten.', 'Consenso Vael. Cláusula 1: sua presença fica registrada. Aguarde disposição.'),
      R('Este-navío inicia evaluación. Su forma se tasará contra los términos.', 'Ce-vaisseau initie l’évaluation. Votre forme est appréciée contre les termes.', 'Dieses-Schiff beginnt Bewertung. Ihre Form wird gegen die Terme geschätzt.', 'Este-navio inicia avaliação. Sua forma está sendo avaliada contra os termos.'),
      R('Contacto reconocido bajo términos provisionales. Declare su posición.', 'Contact reconnu sous termes provisoires. Énoncez votre standing.', 'Kontakt unter vorläufigen Termen anerkannt. Nennen Sie Ihren Stand.', 'Contato reconhecido sob termos provisórios. Declare sua posição.'),
      R('Cláusula 1.4: se anota la entrada de su especie. La entrada previa bajo esta posición es más vieja que su expediente.', 'Clause 1.4 : l’entrée de votre espèce est notée. L’entrée antérieure sous ce standing est plus ancienne que votre dossier.', 'Klausel 1.4: der Eintrag Ihrer Art ist vermerkt. Der frühere Eintrag unter diesem Stand ist älter als Ihre Akte.', 'Cláusula 1.4: a entrada da sua espécie é anotada. A entrada anterior sob esta posição é mais velha que o seu expediente.'),
    ],
    warn: [
      R('Cláusula 3: ocupa espacio de Vael sin instrumento de paso. Anule su posición.', 'Clause 3 : vous occupez l’espace tenu Vael sans instrument de passage. Videz votre position.', 'Klausel 3: Sie besetzen Vael-Raum ohne Passierinstrument. Position nichtig machen.', 'Cláusula 3: você ocupa espaço Vael sem instrumento de passagem. Anule sua posição.'),
      R('Su continuación rompe el acuerdo de frontera. Enmiende, o el acuerdo le enmienda a usted.', 'Votre continuance rompt l’accord-frontière. Amendez, ou l’accord vous amende.', 'Ihr Fortfahren bricht den Grenz-Akkord. Ändern, oder der Akkord ändert Sie.', 'Sua continuação rompe o acordo de fronteira. Emende, ou o acordo emenda você.'),
      R('Los términos no le admiten aquí. La retirada es el remedio ofrecido.', 'Les termes ne vous admettent pas ici. Le retrait est le remède offert.', 'Die Terme lassen Sie hier nicht zu. Rückzug ist das angebotene Mittel.', 'Os termos não o admitem aqui. A retirada é o remédio oferecido.'),
      R('Cláusula 3.7: frontera rota. Su nave es anterior al aviso en once de sus ciclos. El aviso sigue válido.', 'Clause 3.7 : frontière rompue. Votre vaisseau précède l’avis de onze de vos cycles. L’avis tient.', 'Klausel 3.7: Grenze gebrochen. Ihr Schiff ist elf Ihrer Zyklen älter als der Hinweis. Der Hinweis gilt.', 'Cláusula 3.7: fronteira rompida. Sua nave antecede o aviso em onze dos seus ciclos. O aviso segue válido.'),
    ],
    'demand-cargo': [
      R('Cláusula 7: sus tenencias están sujetas a reclamación Vael. Entréguelas para satisfacer el término.', 'Clause 7 : vos avoirs sont sujets à revendication Vael. Remettez-les pour satisfaire le terme.', 'Klausel 7: Ihre Bestände unterliegen Vael-Anspruch. Herausgeben, den Term zu erfüllen.', 'Cláusula 7: suas posses estão sujeitas a reivindicação Vael. Entregue-as para satisfazer o termo.'),
      R('El contenido de su nave es, por acuerdo, decomisado. Entregue, y el libro se equilibra.', 'Le contenu de votre vaisseau est, par accord, forfait. Livrez, et le livre s’équilibre.', 'Der Inhalt Ihres Schiffs ist, per Akkord, verfallen. Liefern, und das Buch gleicht aus.', 'O conteúdo da sua nave é, por acordo, perdido. Entregue, e o livro equilibra.'),
      R('Rinda la masa-llevada. Esto salda la deuda que no sabía haber contraído.', 'Rendez la masse-portée. Ceci solde la dette que vous ne saviez pas avoir contractée.', 'Geben Sie die getragene Masse. Das tilgt die Schuld, von der Sie nicht wussten.', 'Entregue a massa-levada. Isto quita a dívida que você não sabia ter contraído.'),
      R('Cláusula 7.2: la masa está reclamada por entrada previa. Su tránsito fue su custodia temporal.', 'Clause 7.2 : la masse est revendiquée par entrée antérieure. Votre transit en fut la garde temporaire.', 'Klausel 7.2: die Masse ist durch früheren Eintrag beansprucht. Ihr Transit war vorübergehende Verwahrung.', 'Cláusula 7.2: a massa está reivindicada por entrada anterior. Seu trânsito foi a custódia temporária.'),
    ],
    attack: [
      R('Cláusula 9 invocada. La pena se ejecuta sobre su forma.', 'Clause 9 invoquée. La peine s’exécute sur votre forme.', 'Klausel 9 angerufen. Die Strafe wird an Ihrer Form vollzogen.', 'Cláusula 9 invocada. A pena se executa sobre sua forma.'),
      R('Ha anulado los términos. El cumplimiento es ahora obligación de este-navío.', 'Vous avez voidé les termes. L’exécution est désormais l’obligation de ce-vaisseau.', 'Sie haben die Terme nichtig gemacht. Vollstreckung ist jetzt Pflicht dieses-Schiffs.', 'Você anulou os termos. O cumprimento é agora obrigação deste-navio.'),
      R('El acuerdo permite corrección. Se administra.', 'L’accord permet la correction. Elle est administrée.', 'Der Akkord erlaubt Korrektur. Sie wird verabreicht.', 'O acordo permite correção. Ela é administrada.'),
      R('Cláusula 9.5: corrección. Su forma resiste el término. El término no resiste.', 'Clause 9.5 : correction. Votre forme résiste au terme. Le terme ne résiste pas.', 'Klausel 9.5: Korrektur. Ihre Form widersteht dem Term. Der Term widersteht nicht.', 'Cláusula 9.5: correção. Sua forma resiste ao termo. O termo não resiste.'),
    ],
    flee: [
      R('El término queda suspendido, no disuelto. Este-navío se retira.', 'Le terme est suspendu, non dissous. Ce-vaisseau se retire.', 'Der Term ist ausgesetzt, nicht aufgelöst. Dieses-Schiff zieht sich zurück.', 'O termo fica suspenso, não dissolvido. Este-navio se retira.'),
      R('Cláusula 12: el enfrentamiento caduca. La obligación persiste en el libro.', 'Clause 12 : l’engagement caduque. L’obligation persiste au livre.', 'Klausel 12: das Gefecht verfällt. Die Pflicht bleibt im Buch.', 'Cláusula 12: o confronto caduca. A obrigação persiste no livro.'),
      R('Disposición aplazada. Su entrada permanece en el acuerdo.', 'Disposition différée. Votre entrée demeure dans l’accord.', 'Disposition aufgeschoben. Ihr Eintrag bleibt im Akkord.', 'Disposição adiada. Sua entrada permanece no acordo.'),
      R('Cláusula 12.3: caducado. Su entrada es permanente. La distancia es decorativa.', 'Clause 12.3 : caduque. Votre entrée est permanente. La distance est décorative.', 'Klausel 12.3: verfallen. Ihr Eintrag ist dauerhaft. Distanz ist dekorativ.', 'Cláusula 12.3: caduco. Sua entrada é permanente. Distância é decorativa.'),
    ],
    reinforce: [
      R('Consenso convocado. Navíos-adicionales entran en el acuerdo.', 'Consensus convoqué. Vaisseaux-additionnels entrent dans l’accord.', 'Konsens gerufen. Zusatz-Schiffe treten in den Akkord.', 'Consenso convocado. Navios-adicionais entram no acordo.'),
      R('Se llama a los muchos. El término se cumplirá en número.', 'Les nombreux sont appelés. Le terme sera rempli en nombre.', 'Die Vielen sind gerufen. Der Term wird in Zahl erfüllt.', 'Os muitos são chamados. O termo será cumprido em número.'),
      R('Cláusula de quórum invocada. Más de este-tipo convergen.', 'Clause de quorum invoquée. Plus de ce-genre convergent.', 'Quorum-Klausel angerufen. Mehr dieser-Art ziehen zusammen.', 'Cláusula de quórum invocada. Mais deste-tipo convergem.'),
      R('El Consenso se ensancha. El término se redactó para los muchos. Los muchos llegan.', 'Le Consensus s’élargit. Le terme fut rédigé pour les nombreux. Les nombreux arrivent.', 'Der Konsens weitet sich. Der Term wurde für die Vielen verfasst. Die Vielen kommen.', 'O Consenso se alarga. O termo foi redigido para os muitos. Os muitos chegam.'),
    ],
    taunt: [
      R('Su resistencia es una cláusula ya anticipada y tasada.', 'Votre résistance est une clause déjà anticipée et tarifée.', 'Ihr Widerstand ist eine schon vorgesehene und bepreiste Klausel.', 'Sua resistência é uma cláusula já antecipada e precificada.'),
      R('Regatea contra términos que no puede leer.', 'Vous négociez contre des termes que vous ne savez pas lire.', 'Sie feilschen gegen Terme, die Sie nicht lesen können.', 'Você negocia contra termos que não consegue ler.'),
      R('El libro se cierra con o sin su asentimiento.', 'Le livre se ferme avec ou sans votre assentiment.', 'Das Buch schließt mit oder ohne Ihre Zustimmung.', 'O livro se fecha com ou sem o seu assentimento.'),
      R('Cláusula 19: la parte perdedora carga el coste del veredicto. Este es el veredicto.', 'Clause 19 : la partie perdante porte le coût du verdict. Voici le verdict.', 'Klausel 19: die unterlegene Partei trägt die Kosten des Spruchs. Dies ist der Spruch.', 'Cláusula 19: a parte perdedora arca com o custo do veredito. Este é o veredito.'),
      R('Su especie negocia. El acuerdo es anterior a la negociación. Sobrevivirá a la suya.', 'Votre espèce négocie. L’accord précède la négociation. Il survivra à la vôtre.', 'Ihre Art verhandelt. Der Akkord ist älter als Verhandlung. Er überdauert die Ihre.', 'Sua espécie negocia. O acordo antecede a negociação. Ele sobreviverá à sua.'),
    ],
    'patrol-greeting': [
      R('Paso Vael. Los términos se mantienen. Queda permitido, por ahora.', 'Passage Vael. Les termes tiennent. Vous êtes permis, pour l’heure.', 'Vael-Passage. Die Terme halten. Sie sind gestattet, vorerst.', 'Passagem Vael. Os termos se mantêm. Você está permitido, por ora.'),
      R('Este-navío transita bajo acuerdo vigente. Hoy no cae obligación sobre usted.', 'Ce-vaisseau transite sous accord en vigueur. Nulle obligation ne vous échoit aujourd’hui.', 'Dieses-Schiff transitet unter stehendem Akkord. Heute fällt keine Pflicht auf Sie.', 'Este-navio transita sob acordo vigente. Nenhuma obrigação cai sobre você hoje.'),
      R('El Consenso observa. Su posición es neutra. Prosiga.', 'Le Consensus observe. Votre standing est neutre. Poursuivez.', 'Der Konsens beobachtet. Ihr Stand ist neutral. Fortfahren.', 'O Consenso observa. Sua posição é neutra. Prossiga.'),
      R('Paso concedido. La cláusula que le permite fue redactada antes de que se formara su mundo.', 'Passage accordé. La clause qui vous permet fut rédigée avant que votre monde ne se forme.', 'Passage gewährt. Die Klausel, die Sie zulässt, wurde verfasst, bevor Ihre Welt entstand.', 'Passagem concedida. A cláusula que o permite foi redigida antes de o seu mundo se formar.'),
    ],
  }),
  faction_archive: Object.freeze({
    scan: [
      R('La sala de lectura le ve. Su expediente se abre solo.', 'La salle de lecture vous voit. Votre dossier s’ouvre de lui-même.', 'Der Lesesaal sieht Sie. Ihre Akte öffnet sich von selbst.', 'A sala de leitura vê você. Seu arquivo se abre sozinho.'),
      R('Aviso de estantería: una nave entra en el catálogo. Siga legible.', 'Avis de rayon : un vaisseau entre au catalogue. Restez lisible.', 'Regalvermerk: ein Schiff tritt in den Katalog. Leserlich bleiben.', 'Aviso de estante: uma nave entra no catálogo. Permaneça legível.'),
      R('Su transpondedor se lee en voz alta en una lengua muerta. Quédese quieto.', 'Votre transpondeur est lu à voix haute dans une langue morte. Ne bougez pas.', 'Ihr Transponder wird in einer toten Sprache laut gelesen. Stillhalten.', 'Seu transponder é lido em voz alta numa língua morta. Fique parado.'),
      R('El índice gira hacia usted. Nada de usted le es nuevo.', 'L’index se tourne vers vous. Rien de vous ne lui est nouveau.', 'Der Index wendet sich Ihnen zu. Nichts an Ihnen ist ihm neu.', 'O índice se vira para você. Nada em você é novo para ele.'),
    ],
    warn: [
      R('Guarde su velocidad. Las estanterías no son un corredor.', 'Rangez votre vitesse. Les rayons ne sont pas un corridor.', 'Legen Sie die Geschwindigkeit ab. Die Regale sind kein Korridor.', 'Arquive sua velocidade. As estantes não são um corredor.'),
      R('Su estela mancha los folios. Los bibliotecarios son pacientes, no perdonan.', 'Votre sillage macule les folios. Les bibliothécaires sont patients, pas indulgents.', 'Ihr Kielwasser beschmiert die Folios. Die Bibliothekare sind geduldig, nicht vergebend.', 'Sua esteira mancha os fólios. Os bibliotecários são pacientes, não perdoam.'),
      R('Nota al margen: esta aproximación queda anotada como descuido.', 'Note marginale : cette approche est annotée comme négligence.', 'Randnotiz: diese Annäherung ist als Sorglosigkeit vermerkt.', 'Nota de margem: esta aproximação fica anotada como descuido.'),
      R('Orden de sala de lectura: silencio, distancia y nada de fuego junto al papel.', 'Ordre de la salle : silence, distance, et pas de feu près du papier.', 'Lesesaal-Ordnung: Stille, Distanz, kein Feuer am Papier.', 'Ordem da sala de leitura: silêncio, distância e nada de fogo perto do papel.'),
    ],
    'demand-cargo': [
      R('Su bodega contiene masa sin indexar. Entréguela para catalogación.', 'Votre cale contient une masse non indexée. Remettez-la pour catalogage.', 'Ihr Laderaum enthält nicht indexierte Masse. Zur Katalogisierung herausgeben.', 'Seu porão contém massa não indexada. Entregue-a para catalogação.'),
      R('El Archivo no roba. Recupera lo que nunca fue suyo para guardar.', 'L’Archive ne vole pas. Elle récupère ce qui n’était pas à vous de ranger.', 'Das Archiv stiehlt nicht. Es birgt, was nie Ihnen zum Einordnen gehörte.', 'O Arquivo não rouba. Recupera o que nunca foi seu para arquivar.'),
      R('Entregue la carga sin documentar. El resto de usted puede salir de las estanterías.', 'Livrez la cargaison non documentée. Le reste de vous peut quitter les rayons.', 'Liefern Sie die undokumentierte Fracht. Der Rest von Ihnen darf die Regale verlassen.', 'Entregue a carga não documentada. O resto de você pode sair das estantes.'),
      R('Lo que transporta es un préstamo. El plazo terminó.', 'Ce que vous portez est un prêt. Le délai est échu.', 'Was Sie tragen ist eine Leihe. Die Leihfrist ist um.', 'O que você carrega é um empréstimo. O prazo acabou.'),
    ],
    attack: [
      R('La expurgación comienza. Su nombre perdurará; el resto de usted no.', 'La rédaction commence. Votre nom tiendra ; le reste de vous non.', 'Die Redaktion beginnt. Ihr Name bleibt; der Rest von Ihnen nicht.', 'A redação começa. Seu nome vai durar; o resto de você não.'),
      R('Eligió el ala en llamas. El Códice registra quién eligió primero.', 'Vous avez choisi l’aile qui brûle. Le Codex consigne qui a choisi le premier.', 'Sie wählten den brennenden Flügel. Der Kodex verzeichnet, wer zuerst wählte.', 'Você escolheu a ala em chamas. O Códice registra quem escolheu primeiro.'),
      R('No peleamos. Borramos lo que se niega a ser recordado.', 'Nous ne combattons pas. Nous effaçons ce qui refuse d’être souvenu.', 'Wir kämpfen nicht. Wir löschen, was sich dem Erinnertwerden widersetzt.', 'Nós não lutamos. Apagamos o que resiste a ser lembrado.'),
      R('Cada lector tiene un encendedor. El suyo ya está encendido.', 'Chaque lecteur a un briquet. Le vôtre est allumé.', 'Jeder Leser hat ein Feuerzeug. Ihres brennt jetzt.', 'Cada leitor tem um isqueiro. O seu está aceso agora.'),
    ],
    flee: [
      R('Retirada a estanterías cerradas. El expediente sigue abierto.', 'Retrait vers les rayons fermés. Le dossier reste ouvert.', 'Rückzug in geschlossene Regale. Die Akte bleibt offen.', 'Recolhendo às estantes fechadas. O arquivo continua aberto.'),
      R('El índice retrocede un estante. Su ficha no.', 'L’index recule d’un rayon. Votre entrée, non.', 'Der Index weicht ein Regal zurück. Ihr Eintrag nicht.', 'O índice recua uma estante. Sua ficha não.'),
      R('Los censores retroceden. Nada de lo que hizo queda sin leer.', 'Les censeurs reculent. Rien de vos actes n’est non lu.', 'Zensoren weichen zurück. Nichts davon bleibt ungelesen.', 'Os censores recuam. Nada do que você fez fica por ler.'),
      R('Retirada al Códice Cercenado. La distancia no le desescribe.', 'Repli vers le Codex tranché. La distance ne vous désécrit pas.', 'Rückzug zum Getrennten Kodex. Distanz entschreibt Sie nicht.', 'Recuando ao Códice Cortado. A distância não o desescreve.'),
    ],
    reinforce: [
      R('Más lectores convocados. El índice converge.', 'Lecteurs supplémentaires convoqués. L’index converge.', 'Weitere Leser gerufen. Der Index läuft zusammen.', 'Mais leitores convocados. O índice converge.'),
      R('Los cruceros-abate giran sus lámparas hacia aquí.', 'Les croiseurs-abbés tournent leurs lampes par ici.', 'Die Abt-Kreuzer wenden ihre Lampen hierher.', 'Os cruzadores-abades viram suas lâmpadas para cá.'),
      R('Más ojos sobre la misma página. La suya.', 'Plus d’yeux sur la même page. La vôtre.', 'Mehr Augen auf derselben Seite. Ihrer.', 'Mais olhos na mesma página. A sua.'),
      R('La sala de lectura se expande. Usted sigue dentro.', 'La salle de lecture s’étend. Vous êtes toujours dedans.', 'Der Lesesaal weitet sich. Sie sind noch darin.', 'A sala de leitura se expande. Você ainda está dentro.'),
    ],
    taunt: [
      R('Su casco es un rumor. Nosotros guardamos los volúmenes confirmados.', 'Votre coque est une rumeur. Nous gardons les volumes confirmés.', 'Ihr Rumpf ist ein Gerücht. Wir hüten die bestätigten Bände.', 'Seu casco é um rumor. Nós guardamos os volumes confirmados.'),
      R('Dispara a una biblioteca. El moratón del universo ya está archivado.', 'Vous tirez sur une bibliothèque. L’ecchymose de l’univers est déjà classée.', 'Sie schießen auf eine Bibliothek. Der Bluterguss des Universums ist schon abgelegt.', 'Você atira numa biblioteca. A contusão do universo já está arquivada.'),
      R('Queme un libro y todo lector en la oscuridad aprenderá su nombre.', 'Brûlez un livre et chaque lecteur dans le noir apprend votre nom.', 'Verbrennen Sie ein Buch und jeder Leser im Dunkeln lernt Ihren Namen.', 'Queime um livro e todo leitor no escuro aprende seu nome.'),
      R('Hemos leído pilotos más valientes. Sus capítulos son cortos.', 'Nous avons lu des pilotes plus braves. Leurs chapitres sont courts.', 'Wir haben mutigere Piloten gelesen. Ihre Kapitel sind kurz.', 'Já lemos pilotos mais corajosos. Os capítulos deles são curtos.'),
    ],
    'patrol-greeting': [
      R('Cortesía de lector: no diga nada que quiera desrecordado.', 'Courtoisie du lecteur : ne dites rien que vous vouliez oublié.', 'Leserhöflichkeit: sagen Sie nichts, das Sie unerinnert wünschen.', 'Cortesia de leitor: não diga nada que queira deslembrado.'),
      R('El Archivo transita. Sus secretos llegan temprano.', 'L’Archive transite. Vos secrets arrivent en avance.', 'Das Archiv transitet. Ihre Geheimnisse kommen früh an.', 'O Arquivo transita. Seus segredos chegam cedo.'),
      R('Saludo de sala de lectura. Ya conocemos las partes interesantes.', 'Salut de la salle de lecture. Nous connaissons déjà les parties intéressantes.', 'Lesesaal-Gruß. Wir kennen die interessanten Teile schon.', 'Saudação da sala de leitura. Já conhecemos as partes interessantes.'),
      R('Pase con suavidad. Las estanterías recuerdan a los groseros.', 'Passez doucement. Les rayons se souviennent des impolis.', 'Sanft passieren. Die Regale erinnern die Unhöflichen.', 'Passe com cuidado. As estantes lembram dos rudes.'),
    ],
  }),
  faction_fulfillment: Object.freeze({
    scan: [
      R('Nave detectada en el punto de ruta. Enviando para resecuencia.', 'Vaisseau détecté au point de route. Soumis pour re-séquence.', 'Schiff am Wegpunkt erfasst. Zur Neusequenzierung übergeben.', 'Nave detectada no ponto de rota. Submetendo para resequência.'),
      R('Transpondedor recibido. Posición en cola asignada.', 'Transpondeur reçu. Position en file assignée.', 'Transponder empfangen. Warteposition zugeteilt.', 'Transponder recebido. Posição na fila atribuída.'),
      R('Rutina de barrido de sensores. Su cumplimiento ya está registrado.', 'Routine de balayage. Votre conformité est déjà consignée.', 'Sensorroutine. Ihre Befolgung ist schon vermerkt.', 'Rotina de varredura de sensores. Sua conformidade já está registrada.'),
      R('Punto de control alcanzado. Su tránsito entra en el manifiesto.', 'Point de contrôle atteint. Votre transit entre au manifeste.', 'Kontrollpunkt erreicht. Ihr Transit geht ins Manifest.', 'Ponto de controle alcançado. Seu trânsito entra no manifesto.'),
    ],
    warn: [
      R('Desviación de ruta fija detectada. Se programará una corrección.', 'Écart de route fixe détecté. Une correction sera planifiée.', 'Abweichung von Festroute erkannt. Eine Korrektur wird geplant.', 'Desvio de rota fixa detectado. Uma correção será agendada.'),
      R('Su rumbo entra en conflicto con el carril asignado. Corríjalo.', 'Votre cap entre en conflit avec la voie assignée. Corrigez-le.', 'Ihr Kurs kollidiert mit der zugewiesenen Spur. Korrigieren.', 'Sua proa conflita com a faixa atribuída. Corrija.'),
      R('Tolerancia del punto de ruta excedida. Vuelva a la secuencia.', 'Tolérance du point de route dépassée. Revenez en séquence.', 'Wegpunkt-Toleranz überschritten. Zurück in die Sequenz.', 'Tolerância do ponto de rota excedida. Volte à sequência.'),
      R('Anomalía de tránsito registrada. La siguiente unidad esperará su corrección.', 'Anomalie de transit consignée. L’unité suivante attendra votre correction.', 'Transit-Anomalie vermerkt. Die nächste Einheit wartet auf Ihre Korrektur.', 'Anomalia de trânsito registrada. A próxima unidade vai aguardar sua correção.'),
    ],
    'demand-cargo': [
      R('El abordaje administrativo es ahora un evento de ruta. Mantenga posición.', 'L’abordage administratif est désormais un événement de route. Tenez position.', 'Administrative Enterung ist nun ein Routenereignis. Position halten.', 'O embarque administrativo agora é um evento de rota. Mantenha posição.'),
      R('Su carga requiere conciliación de manifiesto. Prepárese para el abordaje.', 'Votre cargaison requiert une conciliation de manifeste. Tenez-vous prêt pour l’abordage.', 'Ihre Fracht erfordert Manifestabgleich. Enterung bereithalten.', 'Sua carga requer reconciliação de manifesto. Aguarde o embarque.'),
      R('La incautación es un resultado de ruta, no una negociación. Quédese quieto.', 'La saisie est un aboutissement de route, pas une négociation. Ne bougez pas.', 'Beschlagnahme ist ein Routenergebnis, keine Verhandlung. Stillhalten.', 'A apreensão é um desfecho de rota, não uma negociação. Fique parado.'),
      R('La inspección de carga está programada en este punto. Está programada ahora.', 'L’inspection de cargaison est planifiée à ce point. Elle est planifiée maintenant.', 'Frachtkontrolle ist an diesem Wegpunkt terminiert. Sie ist jetzt terminiert.', 'A inspeção de carga está agendada neste ponto. Está agendada agora.'),
    ],
    attack: [
      R('Protocolo de escalada: su incumplimiento ha sido redirigido.', 'Protocole d’escalade : votre non-conformité a été re-routée.', 'Eskalationsprotokoll: Ihr Ungehorsam wurde umgeleitet.', 'Protocolo de escalada: seu descumprimento foi redirecionado.'),
      R('Fuego defensivo autorizado. Su número de incidente está asignado.', 'Tir défensif autorisé. Votre numéro d’incident est assigné.', 'Abwehrfeuer freigegeben. Ihre Vorfallnummer ist zugeteilt.', 'Fogo defensivo autorizado. Seu número de incidente foi atribuído.'),
      R('Prohibición de primer disparo satisfecha. Inhabilitarle es ahora rutina.', 'Interdiction de premier tir satisfaite. Vous neutraliser devient routine.', 'Erstschuss-Verbot erfüllt. Sie zu deaktivieren ist nun Routine.', 'Proibição de primeiro disparo satisfeita. Desabilitar você agora é rotina.'),
      R('Ejecución de cumplimiento activada. Esto fue detallado por adelantado.', 'Exécution de conformité engagée. Ceci était détaillé d’avance.', 'Befolgungsdurchsetzung aktiv. Dies war vorab einzeln aufgeführt.', 'Execução de conformidade acionada. Isto foi detalhado antecipadamente.'),
    ],
    flee: [
      R('Unidad retirándose al punto asignado. Esta interacción queda archivada.', 'Unité en retrait vers le point assigné. Cette interaction est archivée.', 'Einheit zieht zum zugewiesenen Wegpunkt ab. Diese Interaktion wird archiviert.', 'Unidade recuando ao ponto designado. Esta interação fica arquivada.'),
      R('Desviación de ruta: autopreservación. Su expediente conserva la deuda.', 'Écart de route : préservation. Votre dossier garde la dette.', 'Routenabweichung: Selbsterhalt. Ihre Akte behält die Schuld.', 'Desvio de rota: autopreservação. Seu arquivo retém a dívida.'),
      R('Esta unidad sale de la secuencia. Otra mantendrá el punto.', 'Cette unité quitte la séquence. Une autre tiendra le point.', 'Diese Einheit verlässt die Sequenz. Eine andere hält den Wegpunkt.', 'Esta unidade sai da sequência. Outra vai manter o ponto.'),
      R('Retirada programada. Su índice de ruta queda ajustado.', 'Retrait planifié. Votre indice de route est ajusté.', 'Rückzug terminiert. Ihre Routenwertung wird angepasst.', 'Recuo agendado. Sua avaliação de rota foi ajustada.'),
    ],
    reinforce: [
      R('Unidades de apoyo despachadas por la ruta fija. La llegada está programada.', 'Unités de soutien dépêchées sur la route fixe. L’arrivée est planifiée.', 'Stützeinheiten auf Festroute entsandt. Ankunft ist terminiert.', 'Unidades de apoio despachadas na rota fixa. A chegada está agendada.'),
      R('Saturación del punto incrementada. Cascos adicionales en ruta según programa.', 'Saturation du point accrue. Coques additionnelles en approche selon plan.', 'Wegpunkt-Sättigung erhöht. Weitere Rümpfe planmäßig im Anflug.', 'Saturação do ponto aumentada. Cascos adicionais a caminho conforme previsto.'),
      R('Resecuencia de escolta completa. Sus probabilidades fueron tabuladas.', 'Re-séquence d’escorte terminée. Vos chances ont été tabulées.', 'Eskort-Neusequenz abgeschlossen. Ihre Chancen wurden tabelliert.', 'Resequência de escolta completa. Suas chances foram tabuladas.'),
      R('La ruta provee. Más unidades ya vienen en camino por diseño.', 'La route pourvoit. D’autres unités sont déjà en route par conception.', 'Die Route liefert. Weitere Einheiten sind bereits planmäßig unterwegs.', 'A rota provê. Mais unidades já vêm a caminho por desígnio.'),
    ],
    taunt: [
      R('Su tránsito es ineficiente. La ruta lo absorberá.', 'Votre transit est inefficace. La route l’absorbera.', 'Ihr Transit ist ineffizient. Die Route absorbiert es.', 'Seu trânsito é ineficiente. A rota vai absorvê-lo.'),
      R('La resistencia añade tiempo de gestión. No añade resultados.', 'La résistance ajoute du temps de traitement. Pas de résultats.', 'Widerstand fügt Bearbeitungszeit hinzu. Keine Ergebnisse.', 'A resistência acrescenta tempo de manejo. Não acrescenta resultados.'),
      R('Su desviación es intrascendente. El programa no.', 'Votre écart est sans importance. Le plan, non.', 'Ihre Abweichung ist unerheblich. Der Plan nicht.', 'Seu desvio é irrelevante. A programação não.'),
      R('Toda ruta termina en un punto. La suya termina antes.', 'Toute route finit à un point. La vôtre finit plus tôt.', 'Jede Route endet an einem Wegpunkt. Ihre endet früher.', 'Toda rota termina num ponto. A sua termina mais cedo.'),
    ],
    'patrol-greeting': [
      R('Estado de ruta: nominal. Su presencia queda anotada y secuenciada.', 'État de route : nominal. Votre présence est notée et séquencée.', 'Routenstatus: nominal. Ihre Anwesenheit wird vermerkt und sequenziert.', 'Status de rota: nominal. Sua presença foi anotada e sequenciada.'),
      R('Tránsito de ruta fija. Mantenga su carril y no hay incidente.', 'Transit de route fixe. Gardez votre voie et il n’y a pas d’incident.', 'Festroute-Transit. Spur halten, dann kein Vorfall.', 'Trânsito de rota fixa. Mantenha sua faixa e não há incidente.'),
      R('El Cumplimiento pasa a horario. Usted no forma parte del horario.', 'La Fulfillment passe à l’heure. Vous n’êtes pas au programme.', 'Die Fulfillment passiert planmäßig. Sie sind nicht Teil des Plans.', 'A Fulfillment passa no horário. Você não faz parte da programação.'),
      R('El tráfico del punto es rutina. Su transpondedor quedó archivado.', 'Le trafic du point est routine. Votre transpondeur a été classé.', 'Wegpunkt-Verkehr ist Routine. Ihr Transponder wurde abgelegt.', 'O tráfego do ponto é rotina. Seu transponder foi arquivado.'),
    ],
  }),
  faction_pitborn: Object.freeze({
    scan: [
      R('Ojos del deshuesadero sobre ti, pariente. ¿Cuánto pesa tu manifiesto?', 'Les yeux de la casse sur toi, cousin. Ton manifeste pèse combien ?', 'Hof-Augen auf dir, Verwandter. Was wiegt dein Manifest?', 'Olhos do ferro-velho em você, parente. Quanto pesa seu manifesto?'),
      R('La cerca lee tu casco. Chatarra o hermano — lo decide la báscula.', 'La clôture lit ta coque. Ferraille ou frère — la balance décide.', 'Der Zaun liest deinen Rumpf. Schrott oder Geschwister — die Waage entscheidet.', 'A cerca lê seu casco. Sucata ou irmão — a balança decide.'),
      R('Revisión de crédito de muelle. Los Pitborn no miramos, tasamos.', 'Contrôle de crédit-dock. Les Pitborn ne fixent pas, ils estiment.', 'Dock-Kredit-Check. Pitborn starren nicht, wir schätzen.', 'Checagem de crédito de doca. Pitborn não olha, a gente avalia.'),
      R('Veo tus soldaduras desde aquí. ¿Nacido en el deshuesadero o comprado?', 'Je vois tes soudures d’ici. Né à la casse ou acheté ?', 'Ich sehe deine Schweißnähte von hier. Hof-geboren oder gekauft?', 'Tô vendo suas soldas daqui. Nascido no ferro-velho ou comprado?'),
    ],
    warn: [
      R('Tranquilo en el carril — es el carril de tiro del deshuesadero, no un paseo.', 'Doucement sur la voie — c’est la voie de tir de la casse, pas une promenade.', 'Ruhig auf der Spur — das ist die Schussbahn des Hofes, kein Spaziergang.', 'Devagar na faixa — é a faixa de tiro do ferro-velho, não um passeio.'),
      R('Cuidado con la línea de la cerca. El intruso se vende, no se persigue.', 'Gaffe à la ligne de clôture. L’intrus se vend, il ne se poursuit pas.', 'Pass auf die Zaunlinie auf. Eindringen wird verkauft, nicht verfolgt.', 'Cuidado com a linha da cerca. Invasor é vendido, não perseguido.'),
      R('Te estás metiendo en la zona de quema, pariente. Dirige.', 'Tu dérives vers la zone de brûle, cousin. Dirige.', 'Du treibst in die Brennzone, Verwandter. Steuern.', 'Você tá entrando na zona de queima, parente. Vira.'),
      R('Las reglas Concord terminan en la luz del deshuesadero. La ley del patio ya empezó.', 'Les règles Concord s’arrêtent à la lumière de la casse. La loi de la casse a commencé.', 'Concord-Regeln enden am Hoflicht. Hofgesetz fing schon an.', 'As regras Concord acabam na luz do ferro-velho. A lei do pátio já começou.'),
    ],
    'demand-cargo': [
      R('La cerca se lo queda todo — la bodega, no el casco. Tú eliges.', 'La clôture prend tout — la cale, pas la coque. Ton choix.', 'Der Zaun nimmt alles — den Frachtraum, nicht den Rumpf. Deine Wahl.', 'A cerca leva tudo — o porão, não o casco. Você escolhe.'),
      R('Suelta la carga, pariente. La chatarra vale más que tu orgullo.', 'Largue la cargaison, cousin. La ferraille vaut plus que ta fierté.', 'Wirf die Fracht ab, Verwandter. Schrott ist mehr wert als dein Stolz.', 'Joga a carga fora, parente. Sucata vale mais que seu orgulho.'),
      R('Impuesto del deshuesadero: todo lo pesado que llevas. Esta noche alimenta al patio.', 'Taxe de la casse : tout le lourd que tu transportes. Ce soir ça nourrit la casse.', 'Hof-Steuer: alles Schwere, das du schleppst. Heute Nacht füttert es den Hof.', 'Imposto do ferro-velho: tudo de pesado que você carrega. Hoje à noite alimenta o pátio.'),
      R('Pesamos tu bodega y nos llevamos nuestra parte. Más barato que la alternativa, siempre.', 'On pèse ta cale et on prend notre part. Moins cher que l’alternative, toujours.', 'Wir wiegen deinen Frachtraum und nehmen unseren Anteil. Billiger als die Alternative, immer.', 'A gente pesa seu porão e leva nossa parte. Mais barato que a alternativa, sempre.'),
    ],
    attack: [
      R('¡Ley del deshuesadero! ¡Chatarra es chatarra — la tuya vuelve a casa!', 'Loi de la casse ! Ferraille est ferraille — la tienne rentre à la maison !', 'Hofgesetz! Schrott ist Schrott — deiner kommt heim!', 'Lei do ferro-velho! Sucata é sucata — a sua volta pra casa!'),
      R('¡Por el deshuesadero! ¡Corta los motores, deja el casco!', 'Pour la casse ! Coupe les moteurs, garde la coque !', 'Für den Hof! Triebwerke ab, Rumpf behalten!', 'Pelo ferro-velho! Corta os motores, deixa o casco!'),
      R('¡Elegiste la cerca equivocada para apoyarte, pariente!', 'T’as choisi la mauvaise clôture pour t’appuyer, cousin !', 'Du hast dir den falschen Zaun zum Anlehnen ausgesucht, Verwandter!', 'Você escolheu a cerca errada pra se apoiar, parente!'),
      R('Los Pitborn no disparamos primero a parientes. Dejaste de serlo hace un parpadeo.', 'Les Pitborn ne tirent pas les premiers sur les cousins. T’as cessé d’en être un en un clin d’œil.', 'Pitborn schießen nicht zuerst auf Verwandte. Du warst vor einem Wimpernschlag keiner mehr.', 'Pitborn não atira primeiro em parente. Você deixou de ser num piscar.'),
    ],
    flee: [
      R('¡Repliegue a la cerca! El deshuesadero no sangra por orgullo.', 'Repli à la clôture ! La casse saigne pas pour la fierté.', 'Zurück zum Zaun! Der Hof blutet nicht für Stolz.', 'Recuando pra cerca! O ferro-velho não sangra por orgulho.'),
      R('La chatarra no vale morir dos veces. Nos vamos.', 'La ferraille vaut pas de mourir deux fois. On se tire.', 'Schrott ist nicht zweimal Sterben wert. Wir sind raus.', 'Sucata não vale morrer duas vezes. Tamos fora.'),
      R('¡De vuelta a las pilas de quema! El patio guarda lo que puede sujetar.', 'Retour aux tas de brûle ! La casse garde ce qu’elle peut tenir.', 'Zurück zu den Brennhaufen! Der Hof behält, was er halten kann.', 'De volta às pilhas de queima! O pátio guarda o que consegue segurar.'),
      R('¡Parientes en camino salen heridos — retirada! Los chatarreros vivos comen mañana.', 'Les cousins en approche morflent — on décroche ! Les ferrailleurs vivants mangent demain.', 'Verwandte im Anflug kriegen was ab — raus hier! Lebende Schrotter essen morgen.', 'Parentes chegando se machucam — sai daqui! Sucateiros vivos comem amanhã.'),
    ],
    reinforce: [
      R('¡Parientes en camino! El deshuesadero responde a los suyos.', 'Cousins en approche ! La casse répond aux siens.', 'Verwandte im Anflug! Der Hof antwortet den Seinen.', 'Parentes a caminho! O ferro-velho responde aos seus.'),
      R('¡Más de nosotros en la quema! La cerca aguanta por número.', 'Plus de nous sur la brûle ! La clôture tient par le nombre.', 'Mehr von uns im Feuer! Der Zaun hält durch Masse.', 'Mais de nós na queima! A cerca segura pelo número.'),
      R('El capataz mandó la reserva — cuadrillas de salvamento con dientes.', 'Le maître de casse envoie la réserve — des équipes de récup’ à crocs.', 'Der Hofmeister schickt die Reserve — Bergungstrupps mit Zähnen.', 'O mestre do ferro-velho mandou a reserva — equipes de salvagem com dentes.'),
      R('¡Hermanos y hermanas, converjan! Alguien pesó mal a nuestra gente.', 'Frères et sœurs, convergez ! Quelqu’un a mal pesé nos cousins.', 'Brüder und Schwestern, zusammenziehen! Jemand hat unsere Verwandten falsch gewogen.', 'Irmãos e irmãs, convirjam! Alguém pesou errado nossa gente.'),
    ],
    taunt: [
      R('He visto cascos mejores en la pila de quema, amigo.', 'J’ai vu de meilleures coques dans le tas de brûle, l’ami.', 'Hab bessere Rümpfe im Brennhaufen gesehen, Freund.', 'Já vi cascos melhores na pilha de queima, amigo.'),
      R('Tus armas fueron compradas, no nacidas. El deshuesadero funde ambas.', 'Tes canons furent achetés, pas nés. La casse fond les deux.', 'Deine Kanonen wurden gekauft, nicht geboren. Der Hof schmilzt beide.', 'Seus canhões foram comprados, não nascidos. O ferro-velho derrete os dois.'),
      R('Blanco brillante, piloto apagado. El patio tasa ambos.', 'Cible brillante, pilote terne. La casse évalue les deux.', 'Helles Ziel, matter Pilot. Der Hof taxiert beide.', 'Alvo brilhante, piloto opaco. O pátio avalia os dois.'),
      R('Ese casco vale más muerto que tú volándolo.', 'Cette coque vaut plus morte que toi à la piloter.', 'Der Rumpf ist tot mehr wert als du ihn fliegst.', 'Esse casco vale mais morto que você voando ele.'),
    ],
    'patrol-greeting': [
      R('El deshuesadero mantiene las luces. Los restos son bienvenidos, Concord no.', 'La casse garde les lumières. Les épaves sont bienvenues, pas Concord.', 'Der Hof hält die Lichter an. Wracks willkommen, Concord nicht.', 'O ferro-velho mantém as luzes. Restos são bem-vindos, Concord não.'),
      R('Paso seguro por la cerca, pariente. No nos hagas repesar eso.', 'Passage sûr à travers la clôture, cousin. Nous fais pas re-peser ça.', 'Sichere Passage durch den Zaun, Verwandter. Lass uns das nicht neu wiegen.', 'Passagem segura pela cerca, parente. Não faz a gente repesar isso.'),
      R('Pitborn en el carril. Véndenos tu chatarra o quédate fuera.', 'Pitborn sur la voie. Vends-nous ta ferraille ou reste dehors.', 'Pitborn auf der Spur. Verkauf uns deinen Schrott oder bleib raus.', 'Pitborn na faixa. Vende sua sucata pra gente ou fica de fora.'),
      R('El deshuesadero está abierto. La primera ronda es una historia, la segunda es tu manifiesto.', 'La casse est ouverte. Premier verre c’est une histoire, deuxième c’est ton manifeste.', 'Der Hof hat offen. Erstes Getränk ist eine Geschichte, zweites dein Manifest.', 'O ferro-velho tá aberto. O primeiro gole é uma história, o segundo é seu manifesto.'),
    ],
  }),
  faction_understory: Object.freeze({
    scan: [
      R('Derivas sobre un jardín. Leemos lo que dejarás.', 'Tu dérives au-dessus d’un jardin. Nous lisons ce que tu laisseras.', 'Du treibst über einen Garten. Wir lesen, was du lassen wirst.', 'Você deriva sobre um jardim. Lemos o que você vai deixar.'),
      R('La floración saborea tu estela. Recuerda el sabor del acero.', 'La floraison goûte ton sillage. Elle se souvient du goût de l’acier.', 'Die Blüte kostet dein Kielwasser. Sie erinnert den Geschmack von Stahl.', 'A floração prova sua esteira. Ela lembra o gosto do aço.'),
      R('Cosa pequeña y brillante. El jardín mide lo que lo alimenta.', 'Petite chose brillante. Le jardin mesure ce qui le nourrit.', 'Kleines helles Ding. Der Garten misst, was ihn nährt.', 'Coisinha brilhante. O jardim mede o que o alimenta.'),
      R('Tu casco está caliente y lleno. La luz de los restos lo nota.', 'Ta coque est chaude et pleine. La lumière-des-épaves le remarque.', 'Dein Rumpf ist warm und voll. Das Wracklicht bemerkt es.', 'Seu casco está quente e cheio. A luz-dos-restos nota.'),
    ],
    warn: [
      R('Pasaje con cuidado. Las raíces tienen paciencia larga, no nula.', 'Passage prudent. Les racines ont une longue patience, pas nulle.', 'Vorsichtige Passage. Die Wurzeln haben lange Geduld, nicht keine.', 'Passagem cuidadosa. As raízes têm paciência longa, não nenhuma.'),
      R('El jardín no persigue. Solo guarda lo que cae.', 'Le jardin ne poursuit pas. Il ne garde que ce qui tombe.', 'Der Garten jagt nicht. Er behält nur, was fällt.', 'O jardim não persegue. Só guarda o que cai.'),
      R('Magullas la floración. Ha comido magulladuras más duras.', 'Tu meurtris la floraison. Elle a mangé pires meurtrissures.', 'Du quetschst die Blüte. Sie hat härtere Quetschungen gefressen.', 'Você machuca a floração. Ela já comeu machucados piores.'),
      R('Muévete con suavidad aquí. Los muertos construyeron este lugar y son susceptibles.', 'Bouge doucement ici. Les morts ont bâti ce lieu, et les morts sont susceptibles.', 'Beweg dich hier sanft. Die Toten bauten diesen Ort, und die Toten sind empfindlich.', 'Move-se devagar aqui. Os mortos construíram este lugar, e os mortos são sensíveis.'),
    ],
    'demand-cargo': [
      R('Los muertos dan libremente. Los vivos también pueden persuadirse.', 'Les morts donnent librement. Les vivants peuvent aussi être persuadés.', 'Die Toten geben frei. Die Lebenden lassen sich auch überzeugen.', 'Os mortos dão de graça. Os vivos também podem ser persuadidos.'),
      R('Lo que cargas se pudre más lento en nuestra bodega. Entrégalo.', 'Ce que tu portes pourrit plus lentement dans notre cale. Cède-le.', 'Was du trägst fault in unserem Laderaum langsamer. Gib es ab.', 'O que você carrega apodrece mais devagar no nosso porão. Entregue.'),
      R('Alimenta el jardín con lo pesado. Tu casco queda más ligero — e intacto.', 'Nourris le jardin des choses lourdes. Ta coque reste plus légère — et entière.', 'Füttere den Garten mit dem Schweren. Dein Rumpf bleibt leichter — und heil.', 'Alimenta o jardim com as coisas pesadas. Seu casco fica mais leve — e inteiro.'),
      R('Nada pedimos a los muertos. A ti solo te pedimos la carga.', 'Nous ne demandons rien aux morts. À toi, nous ne demandons que la cargaison.', 'Wir fragen die Toten um nichts. Dich fragen wir nur um Fracht.', 'Nada pedimos aos mortos. De você pedimos só a carga.'),
    ],
    attack: [
      R('La floración defiende el jardín. Así es como se ve el alimentarse.', 'La floraison défend le jardin. Voilà à quoi ressemble le nourrir.', 'Die Blüte verteidigt den Garten. So sieht Füttern aus.', 'A floração defende o jardim. É assim que se parece o alimentar.'),
      R('Te has vuelto mantillo con motores. El jardín acepta.', 'Tu es devenu paillis à moteurs. Le jardin accepte.', 'Du bist Mulch mit Triebwerken geworden. Der Garten nimmt an.', 'Você virou adubo com motores. O jardim aceita.'),
      R('No disparamos primero. Nunca lo hacemos. La floración dispara ahora.', 'Nous n’avons pas tiré d’abord. Jamais. La floraison tire maintenant.', 'Wir haben nicht zuerst geschossen. Nie. Die Blüte schießt jetzt.', 'Não atiramos primeiro. Nunca. A floração atira agora.'),
      R('Tu resistencia es solo decaimiento más lento. Las raíces son pacientes.', 'Ta résistance n’est qu’une décomposition plus lente. Les racines sont patientes.', 'Dein Widerstand ist nur langsamerer Zerfall. Die Wurzeln sind geduldig.', 'Sua resistência é só decomposição mais lenta. As raízes são pacientes.'),
    ],
    flee: [
      R('Recedemos hacia la luz de los restos. El jardín sigue creciendo.', 'Nous régressons vers la lumière-des-épaves. Le jardin continue de croître.', 'Wir weichen ins Wracklicht zurück. Der Garten wächst weiter.', 'Refluímos à luz-dos-restos. O jardim continua crescendo.'),
      R('La floración se repliega. Solo el tiempo desarraiga el jardín.', 'La floraison se replie. Seul le temps déracine le jardin.', 'Die Blüte faltet zurück. Nur die Zeit entwurzelt den Garten.', 'A floração se dobra. Só o tempo desarraiga o jardim.'),
      R('Nos retiramos como se pudre — en todas partes a la vez, despacio.', 'Nous retraitons comme pourrit — partout à la fois, lentement.', 'Wir ziehen zurück wie Fäulnis — überall zugleich, langsam.', 'Recuamos como apodrece — em todo lugar ao mesmo tempo, devagar.'),
      R('Hacia los campos de tumbas. Tus despojos nos encontrarán de todos modos.', 'Vers les champs de tombes. Tes déchets nous trouveront de toute façon.', 'In die Grabfelder. Deine Hinterlassenschaften finden uns sowieso.', 'Para os campos de túmulos. Seus restos vão nos achar de qualquer jeito.'),
    ],
    reinforce: [
      R('Más zarcillos se alzan. La floración responde a su propia hambre.', 'Plus de vrille s’élèvent. La floraison répond à sa propre faim.', 'Mehr Ranken steigen. Die Blüte beantwortet ihren eigenen Hunger.', 'Mais gavinhas sobem. A floração responde à própria fome.'),
      R('La luz de los restos se hincha. Lo que duerme aquí despierta para esto.', 'La lumière-des-épaves gonfle. Ce qui dort ici s’éveille pour cela.', 'Das Wracklicht schwillt. Was hier schläft, erwacht dafür.', 'A luz-dos-restos incha. O que dorme aqui acorda para isso.'),
      R('El jardín llama a sus guardianes. Más llegan para cuidarte.', 'Le jardin appelle ses gardiens. D’autres arrivent pour te soigner.', 'Der Garten ruft seine Hüter. Mehr kommen, um dich zu pflegen.', 'O jardim chama seus guardiões. Mais chegam para cuidar de você.'),
      R('Floración sobre floración. El cementerio nunca anda corto de manos.', 'Floraison sur floraison. Le cimetière n’est jamais à court de bras.', 'Blüte über Blüte. Der Friedhof ist nie unterbesetzt.', 'Floração sobre floração. O cemitério nunca falta mãos.'),
    ],
    taunt: [
      R('Eres brillante y breve. La oscuridad es paciente y está alimentada.', 'Tu es brillant et bref. Le noir est patient et nourri.', 'Du bist hell und kurz. Das Dunkel ist geduldig und satt.', 'Você é brilhante e breve. O escuro é paciente e está alimentado.'),
      R('Todo lo que cargas fue nuestro una vez. Vuelve al final.', 'Tout ce que tu portes fut nôtre jadis. Ça revient à la fin.', 'Alles, was du trägst, war einmal unser. Es kehrt am Ende zurück.', 'Tudo que você carrega já foi nosso. Volta no fim.'),
      R('Golpea la floración y florecerá en otra parte. Los jardines no mueren por partes.', 'Frappe la floraison et elle fleurira ailleurs. Les jardins ne meurent pas par morceaux.', 'Schlag die Blüte, sie blüht anderswo. Gärten sterben nicht in Stücken.', 'Atinja a floração e ela floresce em outro lugar. Jardins não morrem em pedaços.'),
      R('Hemos devorado armadas. Apenas eres un bocado.', 'Nous avons mangé des flottes. Tu es à peine une bouchée.', 'Wir haben Flotten gefressen. Du bist kaum ein Happen.', 'Já comemos armadas. Você mal é uma mordida.'),
    ],
    'patrol-greeting': [
      R('El jardín admite a todos los viajeros. En especial a los cansados.', 'Le jardin admet tous les voyageurs. Surtout les fatigués.', 'Der Garten lässt alle Reisenden ein. Besonders die Müden.', 'O jardim admite todos os viajantes. Principalmente os cansados.'),
      R('Descansa tranquilo. La luz de los restos calienta a quien no viene a cortar.', 'Repose-toi. La lumière-des-épaves réchauffe qui ne vient pas couper.', 'Ruh dich aus. Das Wracklicht wärmt, wer nicht zum Schneiden kommt.', 'Descansa. A luz-dos-restos aquece quem não veio cortar.'),
      R('Saludo del jardinero. El jardín pregunta en qué te convertirás.', 'Salut du gardien. Le jardin demande ce que tu deviendras.', 'Hütergruß. Der Garten fragt, was aus dir wird.', 'Saudação do jardineiro. O jardim pergunta no que você vai virar.'),
      R('Pasa por la floración con suavidad. Guarda lo que atrapa.', 'Passe la floraison doucement. Elle garde ce qu’elle attrape.', 'Passiere die Blüte sanft. Sie behält, was sie fängt.', 'Passa pela floração devagar. Ela guarda o que pega.'),
    ],
  }),
  faction_verge_layers: Object.freeze({
    scan: [
      R('Consulta: ¿es esta nave fiel al portal? Tu estela está siendo leída.', 'Requête : ce vaisseau est-il fidèle au portail ? Ton sillage est en lecture.', 'Abfrage: ist dieses Schiff tor-treu? Dein Kielwasser wird gelesen.', 'Consulta: esta nave é fiel ao portal? Sua esteira está sendo lida.'),
      R('El prisma observa. Tránsito anotado en el registro permanente.', 'Le prisme observe. Transit consigné au registre permanent.', 'Das Prisma beobachtet. Transit im stehenden Register vermerkt.', 'O prisma observa. Trânsito registrado no livro permanente.'),
      R('Evaluación: tu masa perturba la red dentro de tolerancia.', 'Évaluation : ta masse perturbe le réseau dans la tolérance.', 'Bewertung: Deine Masse stört das Gitter innerhalb der Toleranz.', 'Avaliação: sua massa perturba a malha dentro da tolerância.'),
      R('El portal recuerda cada cruce. El tuyo se está inscribiendo.', 'Le portail se souvient de chaque passage. Le tien s’inscrit.', 'Das Tor erinnert jede Überquerung. Deine wird gerade eingeschrieben.', 'O portal lembra cada travessia. A sua está sendo inscrita.'),
    ],
    warn: [
      R('Evaluación pendiente: tu tránsito perturba la red.', 'Évaluation en cours : ton transit perturbe le réseau.', 'Bewertung ausstehend: Dein Transit stört das Gitter.', 'Avaliação pendente: seu trânsito perturba a malha.'),
      R('La red lee inestabilidad en tu estela. Compónla.', 'Le réseau lit de l’instabilité dans ton sillage. Compose-la.', 'Das Gitter liest Instabilität in deinem Kielwasser. Ordne es.', 'A malha lê instabilidade na sua esteira. Componha.'),
      R('Pasas cerca de una herida de cierre. La red pregunta tu intención.', 'Tu passes près d’une plaie de clôture. Le réseau demande ton intention.', 'Du passierst nah an einer Schließwunde. Das Gitter fragt deine Absicht.', 'Você passa perto de uma ferida de fecho. A malha pergunta sua intenção.'),
      R('Irregularidad de tránsito detectada. El prisma ilumina su pregunta.', 'Irrégularité de transit détectée. Le prisme illumine sa question.', 'Transit-Unregelmäßigkeit erkannt. Das Prisma erhellt seine Frage.', 'Irregularidade de trânsito detectada. O prisma ilumina sua pergunta.'),
    ],
    'demand-cargo': [
      R('La red exige una rendición de lo que transportas.', 'Le réseau exige un compte de ce que tu transportes.', 'Das Gitter verlangt Rechenschaft über deine Ladung.', 'A malha exige prestação do que você carrega.'),
      R('Tu bodega es masa sin auditar. Preséntala para inscripción.', 'Ta cale est une masse non auditée. Présente-la pour inscription.', 'Dein Laderaum ist unauditierte Masse. Zur Einschreibung vorlegen.', 'Seu porão é massa não auditada. Apresenta-a para inscrição.'),
      R('Auditoría de cierre: entrega la carga sin documentar a la red.', 'Audit de clôture : remets la cargaison non documentée au réseau.', 'Schließaudit: Übergib die undokumentierte Fracht an das Gitter.', 'Auditoria de fecho: entrega a carga não documentada à malha.'),
      R('Todo lo que transita debe una entrada. Rinde la carga al registro.', 'Ce qui transite doit une entrée. Rends la cargaison pour le registre.', 'Was transitet, schuldet einen Eintrag. Ergib die Fracht fürs Register.', 'O que transita deve uma entrada. Rende a carga para o registro.'),
    ],
    attack: [
      R('Respuesta de cierre: la red deshace lo que la deshace.', 'Réponse de clôture : le réseau défait ce qui le défait.', 'Schließantwort: Das Gitter löst auf, was es auflöst.', 'Resposta de fecho: a malha desfaz o que a desfaz.'),
      R('Elegiste ser un evento de cierre. La red lo cumple.', 'Tu as choisi d’être un événement de clôture. Le réseau s’exécute.', 'Du hast gewählt, ein Schließereignis zu sein. Das Gitter kommt nach.', 'Você escolheu ser um evento de fecho. A malha cumpre.'),
      R('No destruimos. Revocamos. Tu tránsito termina aquí.', 'Nous ne détruisons pas. Nous révoquons. Ton transit finit ici.', 'Wir zerstören nicht. Wir widerrufen. Dein Transit endet hier.', 'Não destruímos. Revogamos. Seu trânsito termina aqui.'),
      R('Se aplica la lógica del postigo: lo que amenaza el pasaje se elimina.', 'La logique du volet s’applique : ce qui menace le passage est retiré.', 'Torschalter-Logik greift: Was die Passage bedroht, wird entfernt.', 'A lógica do obturador se aplica: o que ameaça a passagem é removido.'),
    ],
    flee: [
      R('El prisma retrocede. La red no persigue — espera.', 'Le prisme recule. Le réseau ne poursuit pas — il attend.', 'Das Prisma weicht zurück. Das Gitter verfolgt nicht — es wartet.', 'O prisma recua. A malha não persegue — espera.'),
      R('Nos retiramos del cruce. El portal sigue en pie.', 'Nous nous retirons du passage. Le portail tient toujours.', 'Wir ziehen aus der Überquerung. Das Tor steht noch.', 'Recuamos da travessia. O portal continua de pé.'),
      R('La red atenúa esta faceta. Otras vigilan otros portales.', 'Le réseau tamise cette facette. D’autres veillent d’autres portails.', 'Das Gitter dimmt diese Facette. Andere wachen über andere Tore.', 'A malha escurece esta faceta. Outras vigiam outros portais.'),
      R('La retirada es un hecho de ruta. La red es uno permanente.', 'La retraite est un fait de route. Le réseau en est un permanent.', 'Rückzug ist eine Routentatsache. Das Gitter ist eine stehende.', 'Recuo é um fato de rota. A malha é um permanente.'),
    ],
    reinforce: [
      R('La red se ilumina. Prismas adicionales responden.', 'Le réseau s’illumine. Des prismes additionnels répondent.', 'Das Gitter erhellt sich. Weitere Prismen antworten.', 'A malha se ilumina. Prismas adicionais respondem.'),
      R('Quórum de auditoría del portal alcanzado. Más facetas giran hacia aquí.', 'Quorum d’audit de portail atteint. Plus de facettes se tournent par ici.', 'Toraudit-Quorum erreicht. Mehr Facetten wenden sich hierher.', 'Quórum de auditoria do portal alcançado. Mais facetas se viram para cá.'),
      R('El cruce está reforzado. La red siempre supera en número.', 'Le passage est renforcé. Le réseau est toujours plus nombreux.', 'Die Überquerung ist verstärkt. Das Gitter ist immer in der Überzahl.', 'A travessia está reforçada. A malha sempre supera em número.'),
      R('Más de nosotros coherimos. El portal no está solo.', 'Plus de nous cohèrent. Le portail n’est pas seul.', 'Mehr von uns kohärieren. Das Tor steht nicht allein.', 'Mais de nós coerem. O portal não está sozinho.'),
    ],
    taunt: [
      R('Eres una señal breve. La red es una pregunta permanente.', 'Tu es un signal bref. Le réseau est une question permanente.', 'Du bist ein kurzes Signal. Das Gitter ist eine stehende Frage.', 'Você é um sinal breve. A malha é uma pergunta permanente.'),
      R('Luz breve, estela ruidosa. La red ha cerrado cosas más ruidosas.', 'Lumière brève, sillage bruyant. Le réseau a clos plus bruyant.', 'Kurzes Licht, lautes Kielwasser. Das Gitter hat Lauteres geschlossen.', 'Luz breve, esteira barulhenta. A malha já fechou coisas mais barulhentas.'),
      R('Tu desafío es una vibración menor. Se amortigua sola.', 'Ta défiance est une vibration mineure. Elle s’amortit seule.', 'Dein Trotz ist eine kleine Vibration. Sie dämpft sich selbst.', 'Seu desafio é uma vibração menor. Ela se amortiza sozinha.'),
      R('Los portales existían antes de que tu estrella calentara. Eres clima.', 'Les portails tenaient avant que ton étoile ne chauffe. Tu es la météo.', 'Die Tore standen, bevor dein Stern wärmte. Du bist Wetter.', 'Os portais existiam antes da sua estrela esquentar. Você é o clima.'),
    ],
    'patrol-greeting': [
      R('Los portales aguantan. Tu tránsito es tolerado — responde honestamente.', 'Les portails tiennent. Ton transit est toléré — réponds honnêtement.', 'Die Tore halten. Dein Transit wird geduldet — antworte ehrlich.', 'Os portais aguentam. Seu trânsito é tolerado — responde honestamente.'),
      R('La vigilia del prisma reconoce tu pasaje. Cruza limpio.', 'La veille-du-prisme accuse ton passage. Traverse propre.', 'Die Prismenwacht quittiert deine Passage. Kreuze sauber.', 'A vigia do prisma reconhece sua passagem. Cruza limpo.'),
      R('La red te admite. Admite a todo el que vigila.', 'Le réseau t’admet. Il admet tous ceux qu’il observe.', 'Das Gitter lässt dich ein. Es lässt jeden ein, den es beobachtet.', 'A malha te admite. Ela admite todos que observa.'),
      R('Tránsito aprobado por ahora. La auditoría nunca cierra del todo.', 'Transit approuvé pour l’instant. L’audit ne ferme jamais tout à fait.', 'Transit vorerst genehmigt. Das Audit schließt nie ganz.', 'Trânsito aprovado por ora. A auditoria nunca fecha de vez.'),
    ],
  }),
});

const HULL = Object.freeze({
  faction_scn: [
    R('Coincidencia de registro: {ship}. El expediente del incidente creció otra vez. Ref 44-C.', 'Correspondance de registre : {ship}. Le dossier d’incident a encore grandi. Ref 44-C.', 'Registertreffer: {ship}. Die Vorfallsakte ist wieder gewachsen. Ref 44-C.', 'Correspondência de registro: {ship}. O expediente do incidente cresceu de novo. Ref 44-C.'),
    R('Esa es la {ship}. Archive el avistamiento antes de que pare el disparo.', 'C’est la {ship}. Consignez l’observation avant que le tir ne s’arrête.', 'Das ist die {ship}. Sichtungsakte, bevor das Schießen aufhört.', 'Essa é a {ship}. Arquive o avistamento antes de o tiro parar.'),
    R('Aviso Concord: {ship} está en escena. Ajuste el papeleo.', 'Avis Concord : {ship} est sur scène. Ajustez la paperasse.', 'Concord-Hinweis: {ship} ist vor Ort. Papierkram anpassen.', 'Aviso Concord: {ship} está na cena. Ajuste a papelada.'),
    R('{ship}, casco {class}. Conocemos la silueta. La archivamos de todos modos.', '{ship}, coque {class}. On connaît la silhouette. On classe quand même.', '{ship}, {class}-Rumpf. Wir kennen die Silhouette. Wir legen trotzdem ab.', '{ship}, casco {class}. Conhecemos a silhueta. Arquivamos mesmo assim.'),
  ],
  faction_mts: [
    R('Esa es la {ship}. Su estela cuesta dinero. Alguien siempre lo paga.', 'C’est la {ship}. Son sillage coûte. Quelqu’un paie toujours.', 'Das ist die {ship}. Ihr Kielwasser kostet Geld. Jemand zahlt immer.', 'Essa é a {ship}. A esteira dela custa dinheiro. Alguém sempre paga.'),
    R('Piso Meridian: la {ship} acaba de mover el precio de estar aquí.', 'Plancher Meridian : la {ship} vient de bouger le prix de tenir ici.', 'Meridian-Floor: die {ship} hat gerade den Preis bewegt, hier zu stehen.', 'Piso Meridian: a {ship} acabou de mover o preço de estar aqui.'),
    R('{ship} en el tablero. Ajuste el diferencial, ella no negocia.', '{ship} au tableau. Ajustez le spread, elle ne négocie pas.', '{ship} an der Tafel. Spread anpassen, sie verhandelt nicht.', '{ship} no quadro. Ajuste o spread, ela não negocia.'),
    R('¿Reconoce la {class}? Esa es la {ship}. La factura sigue a los restos.', 'Vous reconnaissez la {class} ? C’est la {ship}. La facture suit l’épave.', 'Erkennen Sie die {class}? Das ist die {ship}. Rechnung folgt dem Wrack.', 'Reconhece a {class}? Essa é a {ship}. A fatura segue os destroços.'),
  ],
  faction_dmc: [
    R('Esa es la {ship}. He pasado junto a ella dos veces. Dos fueron suficientes.', 'C’est la {ship}. Je l’ai dépassée deux fois. Deux, ça suffisait.', 'Das ist die {ship}. Bin zweimal an ihr vorbei. Zweimal reichte.', 'Essa é a {ship}. Passei por ela duas vezes. Duas foi o bastante.'),
    R('Las cuadrillas Drift conocen la {ship}. Nadie quiere el turno que ella trabaja.', 'Les équipes Drift connaissent la {ship}. Personne veut la vacation qu’elle fait.', 'Drift-Crews kennen die {ship}. Niemand will die Schicht, die sie fährt.', 'As turmas Drift conhecem a {ship}. Ninguém quer o turno que ela faz.'),
    R('{ship} otra vez. El día largo se acaba de alargar.', '{ship} encore. La longue journée vient de s’allonger.', '{ship} schon wieder. Der lange Tag wurde länger.', '{ship} de novo. O dia longo acabou de alongar.'),
    R('Es la {ship}. Cierra el intercom y sujeta el carril.', 'C’est la {ship}. Coupe l’intercom et tiens la voie.', 'Das ist die {ship}. Intercom zu und Spur halten.', 'É a {ship}. Fecha o intercom e segura a faixa.'),
  ],
  faction_reach: [
    R('¡Esa es la {ship}! ¡Dije que el casco era real!', 'C’est la {ship} ! Je t’avais dit que la coque était vraie !', 'Das ist die {ship}! Ich sagte, der Rumpf ist echt!', 'Essa é a {ship}! Eu disse que o casco era real!'),
    R('La {ship}. El primo de alguien murió por esta {class}.', 'La {ship}. Le cousin de quelqu’un est mort pour cette {class}.', 'Die {ship}. Irgendwem sein Cousin starb an dieser {class}.', 'A {ship}. O primo de alguém morreu por esta {class}.'),
    R('{ship} está aquí. Di su nombre para que sepan que no tenemos miedo.', '{ship} est là. Dis son nom pour qu’ils sachent qu’on n’a pas peur.', '{ship} ist hier. Sag ihren Namen, damit sie wissen, wir haben keine Angst.', '{ship} está aqui. Diz o nome dela pra saberem que a gente não tem medo.'),
    R('Reach conoce la {ship}. Reach tiene un precio para la {ship}.', 'Reach connaît la {ship}. Reach a un prix pour la {ship}.', 'Reach kennt die {ship}. Reach hat einen Preis für die {ship}.', 'Reach conhece a {ship}. Reach tem um preço pra {ship}.'),
  ],
  faction_quiet: [
    R('{ship}.', '{ship}.', '{ship}.', '{ship}.'),
    R('La {ship}. Detente.', 'La {ship}. Tiens.', 'Die {ship}. Halt.', 'A {ship}. Pare.'),
    R('Ese casco es la {ship}. No digas nada más.', 'Cette coque est la {ship}. Ne dis rien d’autre.', 'Dieser Rumpf ist die {ship}. Sonst nichts sagen.', 'Esse casco é a {ship}. Não diz mais nada.'),
    R('Reconocido: {ship}. Canal cerrado.', 'Reconnu : {ship}. Canal fermé.', 'Erkannt: {ship}. Kanal zu.', 'Reconhecido: {ship}. Canal fechado.'),
  ],
  faction_choir: [
    R('La {ship} está escrita. El Patrón recuerda la {class}.', 'La {ship} est écrite. Le Motif se souvient de la {class}.', 'Die {ship} ist geschrieben. Das Muster erinnert die {class}.', 'A {ship} está escrita. O Padrão lembra a {class}.'),
    R('Mirad: {ship}, marcada y que vuelve. La marca es el mensaje.', 'Voici : {ship}, marquée et qui revient. La marque est le message.', 'Seht: {ship}, markiert und kehrt. Die Marke ist die Botschaft.', 'Vede: {ship}, marcada e que volta. A marca é a mensagem.'),
    R('{ship} lleva sus cicatrices donde el Patrón puede leerlas.', '{ship} porte ses cicatrices où le Motif peut les lire.', '{ship} trägt ihre Narben, wo das Muster sie lesen kann.', '{ship} carrega as cicatrizes onde o Padrão pode lê-las.'),
    R('La {ship} ha sido contada. La Ascensión nota a los contados.', 'La {ship} a été comptée. L’Ascension remarque les comptés.', 'Die {ship} ist gezählt. Aufstieg bemerkt die Gezählten.', 'A {ship} foi contada. A Ascensão nota os contados.'),
  ],
  faction_free: [
    R('Esa es la {ship}. Todo el mundo por aquí ha oído ese nombre.', 'C’est la {ship}. Tout le monde ici a entendu ce nom.', 'Das ist die {ship}. Jeder hier draußen hat den Namen gehört.', 'Essa é a {ship}. Todo mundo por aqui já ouviu esse nome.'),
    R('{ship}. La palabra viaja más rápido que una {class}.', '{ship}. Le mot voyage plus vite qu’une {class}.', '{ship}. Das Wort reist schneller als eine {class}.', '{ship}. A palavra viaja mais rápido que uma {class}.'),
    R('Es la {ship}. Déjenle el carril, se lo ha ganado.', 'C’est la {ship}. Laisse-lui la voie, elle l’a gagnée.', 'Das ist die {ship}. Lass ihr die Spur, sie hat sie verdient.', 'É a {ship}. Deixa a faixa pra ela, ela ganhou.'),
    R('Canal Frontera: la {ship} está en el tablero. Cuida la distancia.', 'Canal Frontière : la {ship} est au tableau. Gaffe à la distance.', 'Grenzkanal: die {ship} steht an der Tafel. Halt Distanz.', 'Canal Fronteira: a {ship} está no quadro. Cuida a distância.'),
  ],
  faction_vael: [
    R('Cláusula cuatro: la nave {ship} es parte de registro.', 'Clause quatre : le vaisseau {ship} est partie au dossier.', 'Klausel vier: das Schiff {ship} ist Partei der Akte.', 'Cláusula quatro: a nave {ship} é parte de registro.'),
    R('Identificación afirmada — {ship}, forma {class}. Los términos se enmiendan.', 'Identification affirmée — {ship}, forme {class}. Les termes sont amendés.', 'Identifikation bestätigt — {ship}, {class}-Form. Terme werden geändert.', 'Identificação afirmada — {ship}, forma {class}. Os termos são emendados.'),
    R('Aparece la {ship}. Las obligaciones previas se reanudan sin aviso.', 'La {ship} apparaît. Les obligations antérieures reprennent sans préavis.', 'Die {ship} erscheint. Frühere Pflichten laufen ohne Hinweis weiter.', 'A {ship} aparece. Obrigações anteriores retomam sem aviso.'),
    R('{ship}. Su historial es admisible.', '{ship}. Votre historique est admissible.', '{ship}. Ihre Geschichte ist zulässig.', '{ship}. Seu histórico é admissível.'),
  ],
  faction_archive: [
    R('{ship}. La ficha existe. El índice no se escribió solo.', '{ship}. L’entrée existe. L’index ne s’est pas écrit seul.', '{ship}. Der Eintrag existiert. Der Index hat sich nicht selbst geschrieben.', '{ship}. A ficha existe. O índice não se escreveu sozinho.'),
    R('Esa es la {ship}. Tu {class} ya tiene un capítulo.', 'C’est la {ship}. Ta {class} a déjà un chapitre.', 'Das ist die {ship}. Deine {class} hat schon ein Kapitel.', 'Essa é a {ship}. Sua {class} já tem um capítulo.'),
    R('Nota de estantería: la {ship} vuelve. El registro crece una página.', 'Note de rayon : la {ship} revient. Le registre grandit d’une page.', 'Regalnotiz: die {ship} kehrt zurück. Der Nachweis wächst um eine Seite.', 'Nota de estante: a {ship} volta. O registro cresce uma página.'),
    R('{ship}, clase {class}. La sala de lectura reconoce a sus personajes.', '{ship}, classe {class}. La salle de lecture reconnaît ses personnages.', '{ship}, {class}-Klasse. Der Lesesaal erkennt seine Figuren.', '{ship}, classe {class}. A sala de leitura reconhece seus personagens.'),
  ],
  faction_fulfillment: [
    R('Nave identificada como {ship}. Resecuencia prioritaria iniciada.', 'Vaisseau identifié : {ship}. Re-séquence prioritaire lancée.', 'Schiff als {ship} identifiziert. Prioritäts-Neusequenz eingeleitet.', 'Nave identificada como {ship}. Resequência prioritária iniciada.'),
    R('La {ship}. Tu historial de ruta ha sido cargado.', 'La {ship}. Ton historique de route a été chargé.', 'Die {ship}. Deine Routenhistorie wurde geladen.', 'A {ship}. Seu histórico de rota foi carregado.'),
    R('Coincidencia de manifiesto: {ship}, {class}. Tolerancia de desviación reevaluada.', 'Correspondance manifeste : {ship}, {class}. Tolérance d’écart réévaluée.', 'Manifest-Treffer: {ship}, {class}. Abweichungstoleranz neu bewertet.', 'Correspondência de manifesto: {ship}, {class}. Tolerância de desvio reavaliada.'),
    R('{ship} en la ruta. Su expediente de incidentes la precede.', '{ship} sur la route. Son dossier d’incidents la précède.', '{ship} auf der Route. Ihre Vorfallakte geht ihr voraus.', '{ship} na rota. Seu arquivo de incidentes a precede.'),
  ],
  faction_pitborn: [
    R('¡Esa es la {ship}! El deshuesadero habla de esa {class}, pariente.', 'C’est la {ship} ! La casse parle de cette {class}, cousin.', 'Das ist die {ship}! Der Hof redet über diese {class}, Verwandter.', 'É a {ship}! O ferro-velho fala dessa {class}, parente.'),
    R('{ship} en el carril. La cerca recuerda lo que remolcó.', '{ship} sur la voie. La clôture se souvient de ce qu’elle a remorqué.', '{ship} auf der Spur. Der Zaun erinnert, was er eingeschleppt hat.', '{ship} na faixa. A cerca lembra o que rebocou.'),
    R('Los ojos del deshuesadero conocen la {ship}. Historias como ese casco no callan.', 'Les yeux de la casse connaissent la {ship}. Des histoires comme cette coque ne restent pas silencieuses.', 'Hof-Augen kennen die {ship}. Geschichten wie dieser Rumpf bleiben nicht leise.', 'Os olhos do ferro-velho conhecem a {ship}. Histórias como esse casco não ficam quietas.'),
    R('La {ship}. Pariente o presa — el patio te pesó hace mucho.', 'La {ship}. Cousin ou carrière — la casse t’a pesé il y a longtemps.', 'Die {ship}. Verwandter oder Beute — der Hof hat dich längst gewogen.', 'A {ship}. Parente ou presa — o pátio te pesou faz tempo.'),
  ],
  faction_understory: [
    R('La {ship} florece de nuevo. El jardín recuerda su aroma.', 'La {ship} refleurit. Le jardin se souvient de son parfum.', 'Die {ship} blüht wieder. Der Garten erinnert ihren Duft.', 'A {ship} floresce de novo. O jardim lembra seu perfume.'),
    R('Ese casco es la {ship}. La luz de los restos guardó su forma.', 'Cette coque est la {ship}. La lumière-des-épaves a gardé sa forme.', 'Dieser Rumpf ist die {ship}. Das Wracklicht behielt ihre Form.', 'Esse casco é a {ship}. A luz-dos-restos guardou sua forma.'),
    R('{ship}, una {class} que las raíces ya han probado.', '{ship}, une {class} que les racines ont déjà goûtée.', '{ship}, eine {class}, die die Wurzeln schon kosteten.', '{ship}, uma {class} que as raízes já provaram.'),
    R('El jardín lee la estela de la {ship}. Ya la leyó antes.', 'Le jardin lit le sillage de la {ship}. Il l’a déjà lu.', 'Der Garten liest das Kielwasser der {ship}. Er hat es schon gelesen.', 'O jardim lê a esteira da {ship}. Ele já a leu antes.'),
  ],
  faction_verge_layers: [
    R('La red reconoce a {ship}. Se recuerdan cruces previos.', 'Le réseau reconnaît {ship}. Les passages antérieurs sont rappelés.', 'Das Gitter erkennt {ship}. Frühere Überquerungen werden abgerufen.', 'A malha reconhece {ship}. Travessias anteriores são lembradas.'),
    R('{ship} transita de nuevo. El portal conserva toda inscripción.', '{ship} transite encore. Le portail garde chaque inscription.', '{ship} transitet erneut. Das Tor bewahrt jede Einschreibung.', '{ship} transita de novo. O portal guarda toda inscrição.'),
    R('Evaluación: la {ship}, una {class} registrada. Su expediente es antiguo.', 'Évaluation : la {ship}, une {class} consignée. Son dossier est ancien.', 'Bewertung: die {ship}, eine registrierte {class}. Ihre Akte ist uralt.', 'Avaliação: a {ship}, uma {class} registrada. Seu arquivo é antigo.'),
    R('{ship}. La red no olvida una firma.', '{ship}. Le réseau n’oublie pas une signature.', '{ship}. Das Gitter vergisst keine Signatur.', '{ship}. A malha não esquece uma assinatura.'),
  ],
});

function pick(row, locale) {
  const k = locKey(locale);
  if (!k || !row) return null;
  return row[k];
}

export function barkMessagesFor(locale) {
  const out = {};
  for (const faction of BARK_FACTIONS) {
    for (const situation of BARK_SITUATIONS) {
      const english = (BARKS[faction] && BARKS[faction][situation]) || [];
      const rows = (T[faction] && T[faction][situation]) || [];
      english.forEach((line, index) => {
        const key = `loc.bark.${faction}.${situation}.${index}`;
        out[key] = locale === 'en-US' ? line : (pick(rows[index], locale) || line);
      });
    }
  }
  for (const faction of Object.keys(HULL_RECOGNITION)) {
    const english = HULL_RECOGNITION[faction] || [];
    const rows = HULL[faction] || [];
    english.forEach((line, index) => {
      const key = `loc.bark.hull.${faction}.${index}`;
      out[key] = locale === 'en-US' ? line : (pick(rows[index], locale) || line);
    });
  }
  return Object.freeze(out);
}

const textMaps = new Map();

export function barkTextMap(locale) {
  if (textMaps.has(locale)) return textMaps.get(locale);
  const map = new Map();
  const translated = barkMessagesFor(locale);
  const english = barkMessagesFor('en-US');
  for (const [key, en] of Object.entries(english)) {
    map.set(en, translated[key]);
  }
  textMaps.set(locale, map);
  return map;
}

export function barkParityErrors() {
  const errors = [];
  for (const faction of BARK_FACTIONS) {
    for (const situation of BARK_SITUATIONS) {
      const english = (BARKS[faction] && BARKS[faction][situation]) || [];
      const rows = (T[faction] && T[faction][situation]) || [];
      if (rows.length !== english.length) {
        errors.push(`${faction}.${situation} expected ${english.length} got ${rows.length}`);
      }
    }
  }
  for (const faction of Object.keys(HULL_RECOGNITION)) {
    const english = HULL_RECOGNITION[faction] || [];
    const rows = HULL[faction] || [];
    if (rows.length !== english.length) {
      errors.push(`hull.${faction} expected ${english.length} got ${rows.length}`);
    }
  }
  return errors;
}

export default {
  barkMessagesFor,
  barkTextMap,
  barkParityErrors,
};
