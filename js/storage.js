/* ============================================================
   STORAGE — persistenza su localStorage + export/import JSON
   ============================================================ */

const STORE_KEY = "allenamento_v2";

const defaultState = () => ({
  sessions: [],        // { id, date, workoutId, weights:{ exKey:[s1,s2,s3] }, duration, calories, notes }
  bodyweight: [],      // { date:"YYYY-MM-DD", v }
  schedule: {},        // "YYYY-MM-DD": { workoutId, done, note }
  goals: {             // obiettivo massa
    startWeight: null,
    targetWeight: null,
    targetDate: null,
    goalType: "",
    note: ""
  },
  profile: {           // anagrafica
    name: "",
    nick: "",          // nickname mostrato in alto (account)
    birthday: null,    // "YYYY-MM-DD"
    height: null       // cm
  },
  composition: [],     // { date, weight, bodyFat, skeletalMuscle, boneMass, bodyWater, bmr, metabolicAge }
  meals: {},           // "YYYY-MM-DD": [ { id, text, kcal, protein, t:"HH:MM" } ]
  ptLifts: [],         // sedute con Denis: { date, panca, squat, stacco } — kg dei 3 esercizi
  nutriGoal: { kcal: null, protein: 150 },  // obiettivi nutrizionali editabili (kcal null = usa stima)
  myWorkouts: [],      // schede personali dell'utente (se vuoto → schede di default)
  customExercises: {}, // esercizi importati/creati dall'utente (stessa forma di EXERCISES)
  badges: [],          // id dei traguardi sbloccati
  migrations: [],      // id delle migrazioni già applicate
  version: 2
});

// Migrazioni strutturali sui dati salvati (idempotenti). Nessun dato personale:
// i dati di ogni utente vivono nel proprio account cloud, non nel codice.
function applyMigrations(s) {
  s.migrations = s.migrations || [];
  return s;
}

function loadState() {
  try {
    const raw = localStorage.getItem(STORE_KEY);
    if (!raw) return defaultState();            // primo avvio: app vuota
    const parsed = JSON.parse(raw);
    const merged = Object.assign(defaultState(), parsed);
    return applyMigrations(merged);
  } catch (e) {
    console.warn("Stato corrotto, reset:", e);
    return defaultState();
  }
}

function saveState(state) {
  try {
    localStorage.setItem(STORE_KEY, JSON.stringify(state));
  } catch (e) {
    console.error("Salvataggio fallito:", e);
  }
}

// Export: scarica un file JSON di backup
function exportJSON(state) {
  const blob = new Blob([JSON.stringify(state, null, 2)], { type: "application/json" });
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  const stamp = new Date().toISOString().split("T")[0];
  a.href = url;
  a.download = `allenamento-backup-${stamp}.json`;
  document.body.appendChild(a);
  a.click();
  document.body.removeChild(a);
  URL.revokeObjectURL(url);
}

// Import: legge un file JSON e ritorna lo stato (Promise)
function importJSON(file) {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => {
      try {
        const parsed = JSON.parse(reader.result);
        resolve(Object.assign(defaultState(), parsed));
      } catch (e) {
        reject(e);
      }
    };
    reader.onerror = reject;
    reader.readAsText(file);
  });
}
