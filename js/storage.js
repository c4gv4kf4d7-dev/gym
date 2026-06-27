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
    birthday: null,    // "YYYY-MM-DD"
    height: null       // cm
  },
  composition: [],     // { date, weight, bodyFat, skeletalMuscle, boneMass, bodyWater, bmr, metabolicAge }
  version: 2
});

// Dati reali di Mike — usati come seed al primo avvio (storage vuoto).
function seedState() {
  return Object.assign(defaultState(), {
    sessions: [{
      id: 1750800000000,
      date: "2026-06-25",
      workoutId: "fullbody",
      weights: {
        chestpress: [20, 20, 20],
        latmachine: [25, 25, 25],
        legpress:   [40, 40, 40],
        curl:       [6, 6, 0]
      },
      duration: 55,
      calories: 338,
      notes: "Primo allenamento. Tensione spalla sinistra alla Lat Machine. Gambe molto affaticate. Energia alta tutto il giorno."
    }],
    bodyweight: [{ date: "2026-06-25", v: 60.1 }],
    schedule: {
      "2026-06-25": { workoutId: "fullbody", done: true },
      "2026-06-30": { workoutId: "fullbody", done: false },
      "2026-07-02": { workoutId: "fullbody", done: false, note: "Con Denis (PT)" },
      "2026-07-03": { workoutId: "fullbody", done: false }
    },
    goals: {
      startWeight: 60.1,
      targetWeight: 70,
      targetDate: "2027-07-01",
      goalType: "Costruzione massa muscolare",
      note: "Costruzione massa muscolare: da 60,1 a 70 kg in 12 mesi, entro il 1 luglio 2027."
    },
    profile: { name: "Mike", birthday: "1987-03-01", height: 179 },
    composition: [{
      date: "2026-06-25", weight: 60.1, bodyFat: 13.1, skeletalMuscle: 49.64,
      boneMass: 2.59, bodyWater: 62.7, bmr: 1489, metabolicAge: 38
    }]
  });
}

function isEmptyState(s) {
  return (!s.sessions || !s.sessions.length)
    && (!s.bodyweight || !s.bodyweight.length)
    && (!s.schedule || Object.keys(s.schedule).length === 0);
}

function loadState() {
  try {
    const raw = localStorage.getItem(STORE_KEY);
    if (!raw) return seedState();              // primo avvio assoluto
    const parsed = JSON.parse(raw);
    const merged = Object.assign(defaultState(), parsed);
    if (isEmptyState(merged)) return seedState(); // aperta ma mai usata
    return merged;
  } catch (e) {
    console.warn("Stato corrotto, reset:", e);
    return seedState();
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
