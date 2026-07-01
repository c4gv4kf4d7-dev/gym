/* ============================================================
   DATA — schede, esercizi, guide, silhouette
   ============================================================ */

// Libreria esercizi: ogni esercizio è referenziato per chiave dalle schede.
const EXERCISES = {
  legpress:     { name: "Leg Press",        muscle: "Quadricipiti",      secondary: "Glutei, Femorali",          type: "machine",  sets: 3, reps: 12, rest: '90"', bodyPart: "legs",      tip: "Non portare le ginocchia oltre le punte dei piedi e non bloccare completamente le gambe in estensione: mantieni una leggera flessione." },
  legext:       { name: "Leg Extension",    muscle: "Quadricipiti",      secondary: "—",                          type: "machine",  sets: 3, reps: 12, rest: '60"', bodyPart: "legs",      tip: "Non slanciare il peso. Estendi in modo controllato e contrai il quadricipite per un secondo in cima." },
  legcurl:      { name: "Leg Curl",         muscle: "Femorali",          secondary: "Polpacci",                   type: "machine",  sets: 3, reps: 12, rest: '60"', bodyPart: "legs",      tip: "Tieni il bacino aderente al pad, non sollevarlo. Fase di discesa lenta e controllata." },
  hipthrust:    { name: "Hip Thrust",       muscle: "Glutei",            secondary: "Femorali",                   type: "machine",  sets: 3, reps: 12, rest: '90"', bodyPart: "legs",      tip: "Spingi con i talloni e contrai i glutei in cima. Non iperestendere la zona lombare." },
  calf:         { name: "Calf Raise",       muscle: "Polpacci",          secondary: "—",                          type: "machine",  sets: 3, reps: 15, rest: '45"', bodyPart: "legs",      tip: "Sali sulla punta il più in alto possibile e scendi sotto il livello per allungare. Movimento completo." },
  abductor:     { name: "Abductor Machine", muscle: "Gluteo medio",      secondary: "—",                          type: "machine",  sets: 3, reps: 15, rest: '45"', bodyPart: "legs",      tip: "Apri le gambe in modo controllato, breve pausa all'apertura massima, ritorna lentamente." },

  chestpress:   { name: "Chest Press",      muscle: "Pettorali",         secondary: "Tricipiti, Deltoidi ant.",   type: "machine",  sets: 3, reps: 12, rest: '90"', bodyPart: "chest",     tip: "Tieni le scapole aderenti allo schienale per tutto il movimento. Non spingere le spalle in avanti nella fase di spinta." },
  chestfly:     { name: "Pectoral Fly",     muscle: "Pettorali",         secondary: "Deltoide ant.",              type: "machine",  sets: 3, reps: 12, rest: '60"', bodyPart: "chest",     tip: "Movimento ad arco con i gomiti leggermente piegati e fissi. Stringi i pettorali al centro." },
  shoulderpress:{ name: "Shoulder Press",   muscle: "Deltoide",          secondary: "Trapezi, Tricipiti",         type: "machine",  sets: 3, reps: 12, rest: '60"', bodyPart: "shoulders", tip: "Evita di iperestendere la schiena. Contrai il core e spingi verticalmente. Non bloccare i gomiti in cima." },
  lateral:      { name: "Alzate Laterali",  muscle: "Deltoide laterale", secondary: "Trapezi",                    type: "dumbbell", sets: 3, reps: 15, rest: '45"', bodyPart: "shoulders", tip: "Alza fino all'altezza delle spalle con i gomiti leggermente piegati. Niente slancio, evita pesi troppo alti." },
  tricipiti:    { name: "Tricipiti ai Cavi",muscle: "Tricipiti",         secondary: "Deltoide post., Core",       type: "cable",    sets: 3, reps: 12, rest: '60"', bodyPart: "arms",      tip: "Tieni i gomiti vicini al busto e fissi. Solo l'avambraccio si muove. Non staccare i gomiti dai fianchi." },
  frenchpress:  { name: "French Press",     muscle: "Tricipiti",         secondary: "—",                          type: "dumbbell", sets: 3, reps: 12, rest: '60"', bodyPart: "arms",      tip: "Gomiti fermi e puntati in alto. Solo l'avambraccio si muove. Controlla la discesa dietro la testa." },

  latmachine:   { name: "Lat Machine",      muscle: "Gran Dorsale",      secondary: "Bicipiti, Romboidi",         type: "cable",    sets: 3, reps: 12, rest: '90"', bodyPart: "back",      tip: "Non tirare il bilanciere fino al petto: arriva al mento. Inizia il movimento aprendo le scapole, non piegando i gomiti." },
  pulley:       { name: "Pulley Basso",     muscle: "Gran Dorsale",      secondary: "Bicipiti, Trapezi",          type: "cable",    sets: 3, reps: 12, rest: '90"', bodyPart: "back",      tip: "Tira verso l'ombelico portando i gomiti indietro. Stringi le scapole, non incurvare la schiena." },
  reversefly:   { name: "Reverse Fly",      muscle: "Deltoide post.",    secondary: "Romboidi, Trapezi",          type: "machine",  sets: 3, reps: 15, rest: '45"', bodyPart: "back",      tip: "Apri le braccia portando indietro le scapole. Niente slancio, gomiti morbidi." },
  curl:         { name: "Curl Bicipiti",    muscle: "Bicipiti",          secondary: "Brachiale, Brachioradiale",  type: "dumbbell", sets: 3, reps: 12, rest: '60"', bodyPart: "arms",      tip: "Non oscillare il busto per portare su il peso. Il movimento parte dal gomito, non dalla spalla." },
  hammer:       { name: "Hammer Curl",      muscle: "Brachiale",         secondary: "Bicipiti, Avambracci",       type: "dumbbell", sets: 3, reps: 12, rest: '60"', bodyPart: "arms",      tip: "Presa neutra (pollici verso l'alto). Niente oscillazioni del busto, gomiti fermi ai fianchi." },
  facepull:     { name: "Face Pull",        muscle: "Deltoide post.",    secondary: "Trapezi, Romboidi",          type: "cable",    sets: 3, reps: 15, rest: '45"', bodyPart: "shoulders", tip: "Tira la corda verso il viso aprendo le mani all'altezza delle orecchie. Ottimo per la postura." },

  plank:        { name: "Plank",            muscle: "Core, Addominali",  secondary: "Glutei, Stabilizzatori",     type: "body",     sets: 3, reps: null, rest: '60"', time: '30"', bodyPart: "core", tip: "Non alzare il sedere né lasciarlo cadere. Il corpo deve essere una linea retta dalla testa ai talloni. Respira normalmente." },
  crunch:       { name: "Crunch ai Cavi",   muscle: "Addominali",        secondary: "Core",                       type: "cable",    sets: 3, reps: 15, rest: '45"', bodyPart: "core",      tip: "Arrotola il busto contraendo gli addominali, non tirare con le braccia. Espira in chiusura." },

  // Esercizi con Denis (bilanciere) — tracciati manualmente nei Progressi
  panca:        { name: "Panca Piana",      muscle: "Pettorali",         secondary: "Tricipiti, Deltoidi ant.",   type: "barbell",  sets: 3, reps: 8, rest: '120"', bodyPart: "chest",    tip: "Scapole retratte e piedi ben piantati a terra. Il bilanciere scende al centro del petto, gomiti a ~45°. Niente rimbalzo." },
  squat:        { name: "Squat",            muscle: "Quadricipiti",      secondary: "Glutei, Femorali, Core",     type: "barbell",  sets: 3, reps: 8, rest: '150"', bodyPart: "legs",     tip: "Schiena neutra e petto alto. Scendi almeno a cosce parallele spingendo le ginocchia in fuori. Peso sui talloni." },
  stacco:       { name: "Stacco da Terra",  muscle: "Catena posteriore", secondary: "Dorsali, Trapezi, Femorali", type: "barbell",  sets: 3, reps: 6, rest: '180"', bodyPart: "back",     tip: "Schiena dritta (mai curva), bilanciere vicino alle tibie. Spingi con le gambe e chiudi con i glutei, non con la lombare." }
};

// Schede di allenamento (3 Full Body). A è quella attuale; B e C sono
// segnaposto da sostituire con gli esercizi reali che darà Denis.
const WORKOUTS = [
  {
    id: "fullbody",
    name: "Full Body A",
    emoji: "💪",
    color: "#FF2D95",
    sub: "7 esercizi · tutto il corpo",
    focus: "Ipertrofia generale",
    exercises: ["legpress", "chestpress", "latmachine", "shoulderpress", "curl", "tricipiti", "plank"]
  },
  {
    id: "fullbodyB",
    name: "Full Body B",
    emoji: "🔥",
    color: "#5B8DEF",
    sub: "7 esercizi · tutto il corpo",
    focus: "Variante B (da definire con Denis)",
    exercises: ["hipthrust", "chestfly", "pulley", "lateral", "hammer", "frenchpress", "crunch"]
  },
  {
    id: "fullbodyC",
    name: "Full Body C",
    emoji: "⚡️",
    color: "#F59E0B",
    sub: "7 esercizi · tutto il corpo",
    focus: "Variante C (da definire con Denis)",
    exercises: ["legext", "legcurl", "reversefly", "chestpress", "facepull", "curl", "plank"]
  }
];

// Scheda speciale "Personal Trainer": sedute con Denis a ripetizione di
// panca, squat e stacco. Non compare tra le schede di "Allena" (i pesi si
// registrano dai Progressi), ma è selezionabile nel Calendario.
const PT_WORKOUT = {
  id: "pt",
  name: "Personal Trainer",
  emoji: "🧑‍🏫",
  color: "#A855F7",
  sub: "Panca · Squat · Stacco",
  focus: "Sedute con Denis",
  exercises: ["panca", "squat", "stacco"],
  pt: true
};

const badgeMap = {
  machine:  ['badge-machine', 'Macchina'],
  dumbbell: ['badge-dumbbell', 'Manubri'],
  cable:    ['badge-cable', 'Cavi'],
  body:     ['badge-body', 'Corpo libero'],
  barbell:  ['badge-barbell', 'Bilanciere']
};

const svgSilhouettes = {
  legs: `<svg viewBox="0 0 50 80" fill="none" xmlns="http://www.w3.org/2000/svg">
    <ellipse cx="25" cy="8" rx="6" ry="6" fill="#e5e7eb"/>
    <rect x="18" y="15" width="14" height="16" rx="4" fill="#e5e7eb"/>
    <rect x="14" y="31" width="10" height="22" rx="4" fill="#FF6B6B"/>
    <rect x="26" y="31" width="10" height="22" rx="4" fill="#FF6B6B"/>
    <rect x="15" y="52" width="9" height="18" rx="3" fill="#e5e7eb"/>
    <rect x="26" y="52" width="9" height="18" rx="3" fill="#e5e7eb"/>
  </svg>`,
  chest: `<svg viewBox="0 0 50 80" fill="none" xmlns="http://www.w3.org/2000/svg">
    <ellipse cx="25" cy="8" rx="6" ry="6" fill="#e5e7eb"/>
    <rect x="16" y="15" width="18" height="18" rx="4" fill="#FF6B6B"/>
    <rect x="16" y="33" width="7" height="12" rx="3" fill="#e5e7eb"/>
    <rect x="27" y="33" width="7" height="12" rx="3" fill="#e5e7eb"/>
    <rect x="15" y="45" width="9" height="22" rx="3" fill="#e5e7eb"/>
    <rect x="26" y="45" width="9" height="22" rx="3" fill="#e5e7eb"/>
  </svg>`,
  back: `<svg viewBox="0 0 50 80" fill="none" xmlns="http://www.w3.org/2000/svg">
    <ellipse cx="25" cy="8" rx="6" ry="6" fill="#e5e7eb"/>
    <path d="M16 15 Q10 22 13 32 L25 34 L37 32 Q40 22 34 15 Z" fill="#F59E0B"/>
    <rect x="20" y="34" width="10" height="10" rx="3" fill="#e5e7eb"/>
    <rect x="15" y="44" width="9" height="22" rx="3" fill="#e5e7eb"/>
    <rect x="26" y="44" width="9" height="22" rx="3" fill="#e5e7eb"/>
  </svg>`,
  shoulders: `<svg viewBox="0 0 50 80" fill="none" xmlns="http://www.w3.org/2000/svg">
    <ellipse cx="25" cy="8" rx="6" ry="6" fill="#e5e7eb"/>
    <ellipse cx="12" cy="21" rx="7" ry="6" fill="#FF6B6B"/>
    <ellipse cx="38" cy="21" rx="7" ry="6" fill="#FF6B6B"/>
    <rect x="18" y="15" width="14" height="14" rx="3" fill="#e5e7eb"/>
    <rect x="11" y="27" width="7" height="18" rx="3" fill="#e5e7eb"/>
    <rect x="32" y="27" width="7" height="18" rx="3" fill="#e5e7eb"/>
    <rect x="19" y="29" width="12" height="12" rx="3" fill="#e5e7eb"/>
    <rect x="15" y="44" width="9" height="22" rx="3" fill="#e5e7eb"/>
    <rect x="26" y="44" width="9" height="22" rx="3" fill="#e5e7eb"/>
  </svg>`,
  arms: `<svg viewBox="0 0 50 80" fill="none" xmlns="http://www.w3.org/2000/svg">
    <ellipse cx="25" cy="8" rx="6" ry="6" fill="#e5e7eb"/>
    <rect x="18" y="15" width="14" height="16" rx="3" fill="#e5e7eb"/>
    <rect x="9" y="17" width="9" height="18" rx="4" fill="#10B981"/>
    <rect x="32" y="17" width="9" height="18" rx="4" fill="#10B981"/>
    <rect x="10" y="35" width="8" height="14" rx="3" fill="#e5e7eb"/>
    <rect x="32" y="35" width="8" height="14" rx="3" fill="#e5e7eb"/>
    <rect x="15" y="31" width="9" height="22" rx="3" fill="#e5e7eb"/>
    <rect x="26" y="31" width="9" height="22" rx="3" fill="#e5e7eb"/>
  </svg>`,
  core: `<svg viewBox="0 0 50 80" fill="none" xmlns="http://www.w3.org/2000/svg">
    <ellipse cx="25" cy="8" rx="6" ry="6" fill="#e5e7eb"/>
    <rect x="18" y="15" width="14" height="14" rx="3" fill="#e5e7eb"/>
    <rect x="17" y="29" width="16" height="16" rx="4" fill="#8B5CF6"/>
    <rect x="14" y="45" width="10" height="22" rx="3" fill="#e5e7eb"/>
    <rect x="26" y="45" width="10" height="22" rx="3" fill="#e5e7eb"/>
  </svg>`
};

// GUIDE
const guides = [
  {
    icon: '⚖️', iconBg: '#FFF0F0',
    title: 'Come leggere lo stack pesi', sub: 'Sistema a pioli — macchine',
    steps: [
      { text: '<strong>Trova il piolo metallico</strong> inserito nello stack. Il numero sul disco dove è inserito indica il peso attivo.' },
      { text: '<strong>Aumenta in piccoli incrementi:</strong> la maggior parte degli stack ha dischi da 5–10 kg. Inizia sempre dal basso (peso leggero) e sali gradualmente.' },
      { text: '<strong>Testa prima di iniziare:</strong> fai una ripetizione lenta per sentire se il peso è gestibile. Se non riesci a controllare il ritorno, è troppo pesante.' },
      { text: '<strong>Non tutti gli stack sono uguali:</strong> alcune macchine hanno moltiplicatori di forza. Guarda il cartello della macchina per il rapporto reale.' }
    ]
  },
  {
    icon: '🔧', iconBg: '#FFFBEB',
    title: 'Regolare le macchine', sub: 'Seduta, schienale, supporti',
    steps: [
      { text: '<strong>Seduta:</strong> regola l\'altezza in modo che le maniglie o il pad siano allineati con il muscolo target (petto per il chest press, spalle per lo shoulder press).' },
      { text: '<strong>Schiena:</strong> lo schienale deve sostenere tutta la colonna. Non ci deve essere spazio tra schiena e pad durante l\'esercizio.' },
      { text: '<strong>Lat Machine:</strong> blocca le cosce sotto il pad in modo che non si alzino durante la trazione. Regola l\'altezza del sedile di conseguenza.' },
      { text: '<strong>Fai sempre una prova a vuoto</strong> (senza peso o con peso minimo) dopo ogni regolazione, per controllare il ROM.' }
    ]
  },
  {
    icon: '🏋️', iconBg: '#F0FDF4',
    title: 'Scegliere il manubrio giusto', sub: 'Per curl, alzate e hammer',
    steps: [
      { text: '<strong>Test delle 12 ripetizioni:</strong> prendi un manubrio e fai 12 curl. Le ultime 2–3 devono essere difficili ma tecnicamente corrette. Se le prime sono già difficili, scendi di peso.' },
      { text: '<strong>Per un principiante 60 kg:</strong> inizia con manubri da 4–6 kg per i curl. Può sembrare poco, ma la forma corretta viene prima del peso.' },
      { text: '<strong>I manubri sono in ordine crescente</strong> su rack a piramide o lineari. Quelli più pesanti sono in basso, i più leggeri in alto.' },
      { text: '<strong>Rimetti sempre i manubri al posto giusto</strong> dopo l\'uso. È la regola non scritta numero uno della palestra.' }
    ]
  },
  {
    icon: '🚪', iconBg: '#EFF6FF',
    title: 'Il primo giorno in palestra', sub: 'Orientamento rapido',
    steps: [
      { text: '<strong>Fai un giro esplorativo</strong> prima di allenarti: zona macchine, zona pesi liberi, spogliatoi, fontanella. 5 minuti che eliminano il 90% dell\'ansia.' },
      { text: '<strong>Porta sempre un asciugamano</strong> da posizionare sulla macchina o sul banco che usi. È igiene base e buona educazione.' },
      { text: '<strong>Le macchine hanno sempre un cartello</strong> con nome, muscoli target e istruzioni d\'uso. Leggilo sempre la prima volta.' },
      { text: '<strong>Se una macchina è libera ma con un asciugamano sopra,</strong> è occupata. Chiedi sempre "È libera?" se non sei sicuro.' },
      { text: '<strong>Non sentirti in imbarazzo a chiedere aiuto.</strong> Il personale è lì per questo. Vale anche per altri frequentatori — la maggioranza è disponibile.' }
    ]
  },
  {
    icon: '🚫', iconBg: '#FEF2F2',
    title: '5 errori da non fare', sub: 'I più comuni nei principianti',
    errors: [
      { icon: '💨', title: 'Trattenere il respiro', desc: 'Espira durante la fase di sforzo, inspira durante il ritorno. Non bloccare mai il respiro.' },
      { icon: '🏃', title: 'Correre sui pesi', desc: 'Aumentare troppo presto il carico compromette la tecnica e aumenta il rischio di infortuni. Progredisci ogni 2 settimane.' },
      { icon: '🪞', title: 'Ignorare lo specchio', desc: 'Lo specchio non è per la vanità — è per controllare la postura. Usalo attivamente.' },
      { icon: '😴', title: 'Saltare il riscaldamento', desc: '5–10 minuti di cardio leggero attivano il sistema cardiovascolare e preparano le articolazioni.' },
      { icon: '📅', title: 'Allenarsi ogni giorno', desc: 'I muscoli crescono durante il riposo, non durante l\'allenamento. Rispetta i giorni di recupero.' }
    ]
  }
];
