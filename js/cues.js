/* ============================================================
   EXERCISE CUES — "Occhio a": 2-3 punti tecnici da seguire
   Fonti: NASM, ACE, ISSA, Athlean-X, PureGym, Planet Fitness, ecc.
   Mostrati nella modalità allenamento guidata.
   ============================================================ */
const EXERCISE_CUES = {
  legpress: [
    "Schiena e bacino ben aderenti allo schienale: non staccarli mai.",
    "Scendi finché le ginocchia sono a ~90°, senza arrotondare la zona lombare.",
    "Spingi con tutto il piede (tallone incluso); non bloccare le ginocchia in cima."
  ],
  legext: [
    "Schiena appoggiata e core attivo: niente strappi o slanci.",
    "Estendi controllato e contrai il quadricipite 1 secondo in alto.",
    "Allinea le ginocchia al perno della macchina; non bloccarle di scatto."
  ],
  legcurl: [
    "Bacino sempre aderente al pad: non sollevarlo per tirare su il peso.",
    "Movimento lento, soprattutto nella fase di discesa.",
    "Range completo: contrai i femorali in cima, allunga in basso."
  ],
  hipthrust: [
    "Spingi con i talloni e contrai i glutei in cima.",
    "Fermati in linea (posizione 'plank'): non inarcare oltre il parallelo.",
    "Core attivo per proteggere la zona lombare."
  ],
  calf: [
    "Sali sulla punta il più in alto possibile e fermati 1 secondo.",
    "Scendi sotto il livello per allungare bene il polpaccio.",
    "Movimento lento e controllato, niente molleggi."
  ],
  abductor: [
    "Schiena appoggiata e busto fermo: muovi solo le gambe.",
    "Apri controllato e stringi 1 secondo all'apertura massima.",
    "Ritorna lentamente, senza far sbattere i pesi."
  ],
  chestpress: [
    "Scapole indietro e in basso, aderenti allo schienale: spalle che non ruotano avanti.",
    "Gomiti a ~45-75° dal busto, non spalancati a 90°.",
    "Spingi controllato ed espira; rientra lento in 2-3 secondi."
  ],
  chestfly: [
    "Gomiti leggermente piegati e FERMI per tutto l'arco.",
    "Stringi i pettorali per muovere, non spingere con le spalle.",
    "Non portare i gomiti troppo indietro: fermati dove senti il petto."
  ],
  shoulderpress: [
    "Schiena appoggiata e core attivo: non inarcare la zona lombare.",
    "Spalle basse, lontane dalle orecchie (non scrollarle).",
    "Spingi fin quasi a braccia tese senza bloccare i gomiti."
  ],
  lateral: [
    "Guida con i gomiti, non con i polsi: gomito più alto del polso.",
    "Sali fino all'altezza delle spalle, non oltre.",
    "Niente slancio: se devi spingere col corpo, il peso è troppo."
  ],
  tricipiti: [
    "Gomiti incollati ai fianchi e fermi: si muove solo l'avambraccio.",
    "Estendi fino in fondo, polsi dritti (non piegarli).",
    "Busto leggermente avanti ma schiena neutra, non inarcata."
  ],
  frenchpress: [
    "Gomiti fermi e puntati in alto: non allargarli.",
    "Solo l'avambraccio si muove; controlla la discesa dietro la testa.",
    "Non bloccare di scatto i gomiti in cima."
  ],
  latmachine: [
    "Petto in fuori e leggera inclinazione indietro (10-20°).",
    "Inizia abbassando le scapole, poi tira i gomiti verso le costole.",
    "Barra al mento/petto alto, mai dietro la nuca; non dondolare."
  ],
  pulley: [
    "Prima imposta le scapole (indietro e unite), poi tira.",
    "Guida con i gomiti dietro al busto; le mani sono solo 'ganci'.",
    "Non dondolare il busto né scrollare le spalle verso le orecchie."
  ],
  reversefly: [
    "Petto appoggiato al pad, gomiti morbidi e fissi.",
    "Apri portando indietro le scapole, non con le braccia tese.",
    "Spalle basse: niente scrollata, niente slancio."
  ],
  curl: [
    "Impugna l'EZ nella curva interna: la presa inclinata protegge i polsi.",
    "Gomiti incollati ai fianchi e fermi: non portarli avanti.",
    "Niente dondolii: sali fino al petto, scendi lento senza rimbalzare."
  ],
  hammer: [
    "Presa neutra (pollici in alto), gomiti fermi ai fianchi.",
    "Niente slancio del busto: controlla salita e discesa.",
    "Estensione completa in basso, niente spinta delle spalle."
  ],
  facepull: [
    "Tira all'altezza del viso aprendo i gomiti verso l'esterno.",
    "Stringi le scapole, spalle basse (non scrollare).",
    "Carico leggero e controllato: conta la pulizia, non il peso."
  ],
  plank: [
    "Corpo in linea retta: bacino né in giù (a 'amaca') né in su.",
    "Contrai glutei e addome (come per ricevere un pugno), bacino in leggera retroversione.",
    "Gomiti sotto le spalle; respira normalmente, non trattenere il fiato."
  ],
  crunch: [
    "Arrotola il busto con gli addominali: non tirare con le braccia.",
    "Bacino fermo, si muove solo la colonna; espira mentre chiudi.",
    "Controlla la risalita, niente strappi."
  ],

  /* --- esercizi custom delle schede PT (lookup per nome-slug) --- */
  alzate_laterali_manubri: [
    "Gomiti leggermente piegati e fissi: alza fino alle spalle, non oltre.",
    "Guidano i gomiti, non le mani; mignolo appena più alto del pollice.",
    "Niente slancio del busto: se dondoli, il peso è troppo."
  ],
  panca_inclinata_manubri: [
    "Scapole retratte e piedi piantati: la spinta parte da lì.",
    "Manubri sopra il petto alto, gomiti a ~45°, non a croce.",
    "Non sbattere i manubri in cima: fermati un soffio prima."
  ],
  lat_pulldown_inversa: [
    "Presa supinata larghezza spalle: tira i gomiti verso i fianchi.",
    "Petto in fuori, spalle basse: parte tutto dalle scapole.",
    "Niente slancio all'indietro: il busto resta quasi fermo."
  ],
  lento_avanti_manubri: [
    "Core attivo e schiena neutra: niente arco lombare esagerato.",
    "Gomiti sotto i polsi, spinta verticale fino quasi a estensione.",
    "Scendi controllato fino alle orecchie: il range conta."
  ],
  pulldown_cavi_corda: [
    "Braccia quasi tese e FISSE: se pieghi i gomiti diventa tricipiti.",
    "Spingi i gomiti verso le tasche: il movimento parte dalla spalla.",
    "Spalle basse (non scrollare) e core attivo; risalita controllata."
  ],
  plank_battito_spalle: [
    "Piedi più larghi per stabilità; il bacino NON deve ruotare.",
    "Tocca la spalla opposta lento: la lentezza è l'esercizio.",
    "Core e glutei sempre attivi, corpo in linea retta."
  ],
  crunch_sollevamento_gambe: [
    "Lombare a contatto col pavimento per tutta la serie.",
    "Sali con il controllo dell'addome, niente slancio delle gambe.",
    "Scendi lento senza appoggiare i piedi: la tensione resta."
  ],
  mountain_climber: [
    "Spalle sopra i polsi, corpo in linea: il sedere resta basso.",
    "Ginocchia al petto con ritmo costante, non rimbalzare.",
    "Core attivo: è un plank che corre, non una corsa piegata."
  ],
  circuito_metabolico: [
    "Il ritmo è l'esercizio: recuperi brevi, cronometro alla mano.",
    "Tecnica pulita anche da stanco: quando crolla, rallenta.",
    "Respira regolare: non trattenere il fiato negli sforzi."
  ],
  crunch_panca_inclinata: [
    "Mani leggere dietro la testa: non tirare il collo.",
    "Arrotola una vertebra alla volta ed espira in chiusura.",
    "Scendi controllato senza mollare la tensione addominale."
  ]
};

/* "Errore comune" per gli esercizi custom (le schede importate dal PT
   hanno un tip segnaposto nei dati: qui il consiglio vero, per nome) */
const EXERCISE_TIPS_BYNAME = {
  alzate_laterali_manubri: "Niente slancio: alza fino all'altezza delle spalle con i gomiti appena piegati. Se dondoli il busto, scala il peso.",
  panca_inclinata_manubri: "Scapole retratte e gomiti a ~45°: non aprirli a croce. Traiettoria sopra il petto alto, senza sbattere i manubri in cima.",
  lat_pulldown_inversa: "Presa supinata, tira i gomiti verso i fianchi fino al petto alto. Il busto resta fermo: niente slancio all'indietro.",
  lento_avanti_manubri: "Core attivo e schiena neutra: se inarchi la lombare il peso è troppo. Gomiti sotto i polsi, spinta verticale.",
  pulldown_cavi_corda: "Braccia quasi tese e fisse: se i gomiti si piegano diventa un esercizio per tricipiti. Spingi i gomiti verso le tasche, spalle basse.",
  plank_battito_spalle: "Il bacino non deve ruotare: allarga i piedi e tocca la spalla lentamente. Se i fianchi ballano, rallenta.",
  crunch_sollevamento_gambe: "Lombare sempre a contatto col pavimento: se si stacca, riduci il range. Gambe su col controllo, non con lo slancio.",
  mountain_climber: "Spalle sopra i polsi e sedere basso: è un plank in movimento. Ritmo costante, niente rimbalzi.",
  circuito_metabolico: "Da stanco la tecnica crolla per prima: quando succede, rallenta il ritmo invece di sporcare le ripetizioni.",
  crunch_panca_inclinata: "Non tirare il collo con le mani: arrotola il busto con gli addominali ed espira in chiusura."
};
