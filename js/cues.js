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
    "Gomiti incollati ai fianchi e fermi: non portarli avanti.",
    "Niente dondolii: se usi il busto per tirare, scala il peso.",
    "Estendi del tutto in basso e ruota i palmi verso l'alto salendo."
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
  ]
};
