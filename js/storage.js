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
  meals: {},           // "YYYY-MM-DD": [ { id, text, kcal, protein, t:"HH:MM" } ]
  badges: [],          // id dei traguardi sbloccati
  migrations: [],      // id delle migrazioni già applicate
  version: 2
});

// Sessione reale del 29 giugno (dal backup di Mike)
function session29Jun() {
  return {
    id: 1782720390034, date: "2026-06-29", workoutId: "fullbody",
    exercises: {
      legpress:     { sets: [{ w: 40, r: 13 }, { w: 40, r: 13 }, { w: 40, r: 13 }], quality: "hard" },
      chestpress:   { sets: [{ w: 20, r: 13 }, { w: 20, r: 13 }, { w: 20, r: 13 }], quality: "hard" },
      latmachine:   { sets: [{ w: 25, r: 13 }, { w: 25, r: 13 }, { w: 25, r: 13 }], quality: "hard" },
      shoulderpress:{ sets: [{ w: 10, r: 8 }, { w: 10, r: 6 }, { w: 5, r: 8 }], quality: "fail" },
      curl:         { sets: [{ w: 6, r: 12 }, { w: 6, r: 12 }, { w: 6, r: 12 }], quality: "fail" },
      tricipiti:    { sets: [{ w: 10, r: 13 }, { w: 10, r: 13 }, { w: 10, r: 13 }], quality: "hard" }
    },
    duration: null, calories: null, notes: ""
  };
}

// Dati reali di Mike — usati come seed al primo avvio (storage vuoto).
function seedState() {
  return Object.assign(defaultState(), {
    sessions: [{
      id: 1750800000000,
      date: "2026-06-25",
      workoutId: "fullbody",
      exercises: {
        chestpress: { sets: [{ w: 20, r: 12 }, { w: 20, r: 12 }, { w: 20, r: 12 }], quality: null },
        latmachine: { sets: [{ w: 25, r: 12 }, { w: 25, r: 12 }, { w: 25, r: 12 }], quality: null },
        legpress:   { sets: [{ w: 40, r: 12 }, { w: 40, r: 12 }, { w: 40, r: 12 }], quality: null },
        curl:       { sets: [{ w: 6, r: 12 }, { w: 6, r: 12 }], quality: null },
        tricipiti:  { sets: [{ w: 10, r: 12 }, { w: 10, r: 12 }, { w: 10, r: 12 }], quality: null }
      },
      duration: 55,
      calories: 338,
      notes: "Primo allenamento. Tensione spalla sinistra alla Lat Machine. Gambe molto affaticate. Energia alta tutto il giorno."
    }, session29Jun()],
    bodyweight: [{ date: "2026-06-01", v: 59.8 }, { date: "2026-06-29", v: 60.0 }],
    schedule: {
      "2026-06-25": { workoutId: "fullbody", done: true },
      "2026-06-29": { workoutId: "fullbody", done: true },
      "2026-07-01": { workoutId: "fullbody", done: false, note: "Con Denis (PT)", pt: true },
      "2026-07-02": { workoutId: "fullbody", done: false },
      "2026-07-06": { workoutId: "fullbody", done: false },
      "2026-07-10": { workoutId: "fullbody", done: false },
      "2026-07-13": { workoutId: "fullbody", done: false },
      "2026-07-15": { workoutId: "fullbody", done: false, note: "Con Denis (PT)", pt: true },
      "2026-07-16": { workoutId: "fullbody", done: false }
    },
    goals: {
      startWeight: 60.1,
      targetWeight: 70,
      targetDate: "2027-07-01",
      goalType: "Costruzione massa muscolare",
      note: "Costruzione massa muscolare: da 60,1 a 70 kg in 12 mesi, entro il 1 luglio 2027."
    },
    profile: { name: "Mike", birthday: "1987-03-01", height: 179 },
    composition: [
      { date: "2026-06-01", weight: 59.8, bodyFat: 12.9, skeletalMuscle: 49.45, boneMass: 2.64, bodyWater: 62.9, bmr: 1510, metabolicAge: 39 },
      { date: "2026-06-29", weight: 60.0, bodyFat: 13.0, skeletalMuscle: 49.56, boneMass: 2.64, bodyWater: 62.8, bmr: 1510, metabolicAge: 38 }
    ],
    migrations: ["fix-initial-schedule", "progression-v1", "fix-session-date-25", "add-tricipiti-25jun", "bodycomp-jun2026", "plan-jul2026"]   // il seed nasce già corretto
  });
}

// Migrazioni su dati già salvati (idempotenti, ognuna gira una sola volta)
function applyMigrations(s) {
  s.migrations = s.migrations || [];

  // Corregge le date dei primi allenamenti programmati (giorni della settimana giusti)
  if (!s.migrations.includes("fix-initial-schedule")) {
    const remap = { "2026-06-30": "2026-06-29", "2026-07-02": "2026-07-01", "2026-07-03": "2026-07-02" };
    const next = {};
    Object.entries(s.schedule || {}).forEach(([d, v]) => { next[remap[d] || d] = v; });
    if (next["2026-07-01"]) next["2026-07-01"].note = "Con Denis (PT)";
    if (next["2026-07-02"]) delete next["2026-07-02"].note;
    s.schedule = next;
    s.migrations.push("fix-initial-schedule");
  }

  // Sistema di progressione: sposta la prima sessione a venerdì 26/6 e
  // converte weights[] → exercises{ sets:[{w,r}], quality }
  if (!s.migrations.includes("progression-v1")) {
    (s.sessions || []).forEach(sess => { if (sess.date === "2026-06-25") sess.date = "2026-06-26"; });
    if (s.schedule && s.schedule["2026-06-25"]) {
      s.schedule["2026-06-26"] = s.schedule["2026-06-25"];
      delete s.schedule["2026-06-25"];
    }
    (s.sessions || []).forEach(sess => {
      if (sess.weights && !sess.exercises) {
        sess.exercises = {};
        Object.entries(sess.weights).forEach(([k, arr]) => {
          const r = (typeof EXERCISES !== "undefined" && EXERCISES[k] && EXERCISES[k].reps) ? EXERCISES[k].reps : 12;
          const sets = arr.filter(v => v > 0).map(v => ({ w: v, r }));
          if (sets.length) sess.exercises[k] = { sets, quality: null };
        });
        delete sess.weights;
      }
    });
    s.migrations.push("progression-v1");
  }

  // Correzione: l'allenamento è stato fatto giovedì 25/6, non venerdì 26/6
  if (!s.migrations.includes("fix-session-date-25")) {
    (s.sessions || []).forEach(sess => { if (sess.date === "2026-06-26") sess.date = "2026-06-25"; });
    if (s.schedule && s.schedule["2026-06-26"]) {
      s.schedule["2026-06-25"] = s.schedule["2026-06-26"];
      delete s.schedule["2026-06-26"];
    }
    s.migrations.push("fix-session-date-25");
  }

  // Aggiunge i Tricipiti ai Cavi (3×12 a 10 kg) alla sessione del 25/6
  if (!s.migrations.includes("add-tricipiti-25jun")) {
    (s.sessions || []).forEach(sess => {
      if (sess.date === "2026-06-25" && sess.exercises && !sess.exercises.tricipiti) {
        sess.exercises.tricipiti = { sets: [{ w: 10, r: 12 }, { w: 10, r: 12 }, { w: 10, r: 12 }], quality: null };
      }
    });
    s.migrations.push("add-tricipiti-25jun");
  }

  // Misurazioni corporee reali (bilancia): 1 giu e 29 giu; rimuove il dato 25/6 approssimativo
  if (!s.migrations.includes("bodycomp-jun2026")) {
    const dropC = ["2026-06-25", "2026-06-01", "2026-06-29"];
    s.composition = (s.composition || []).filter(c => dropC.indexOf(c.date) < 0);
    s.composition.push(
      { date: "2026-06-01", weight: 59.8, bodyFat: 12.9, skeletalMuscle: 49.45, boneMass: 2.64, bodyWater: 62.9, bmr: 1510, metabolicAge: 39 },
      { date: "2026-06-29", weight: 60.0, bodyFat: 13.0, skeletalMuscle: 49.56, boneMass: 2.64, bodyWater: 62.8, bmr: 1510, metabolicAge: 38 }
    );
    s.composition.sort((a, b) => a.date.localeCompare(b.date));
    s.bodyweight = (s.bodyweight || []).filter(b => dropC.indexOf(b.date) < 0);
    s.bodyweight.push({ date: "2026-06-01", v: 59.8 }, { date: "2026-06-29", v: 60.0 });
    s.bodyweight.sort((a, b) => a.date.localeCompare(b.date));
    s.migrations.push("bodycomp-jun2026");
  }

  // Programmazione luglio + sessione 29/6 (dal backup) + flag PT sui giorni con Denis
  if (!s.migrations.includes("plan-jul2026")) {
    s.schedule = s.schedule || {};
    if (s.schedule["2026-07-01"]) s.schedule["2026-07-01"].pt = true;
    if (s.schedule["2026-06-29"]) s.schedule["2026-06-29"].done = true;
    const add = {
      "2026-07-06": { workoutId: "fullbody", done: false },
      "2026-07-10": { workoutId: "fullbody", done: false },
      "2026-07-13": { workoutId: "fullbody", done: false },
      "2026-07-15": { workoutId: "fullbody", done: false, note: "Con Denis (PT)", pt: true },
      "2026-07-16": { workoutId: "fullbody", done: false }
    };
    Object.keys(add).forEach(d => { if (!s.schedule[d]) s.schedule[d] = add[d]; });
    // sessione 29/6 se per qualche motivo non fosse presente
    if (!(s.sessions || []).some(x => x.date === "2026-06-29" && x.workoutId === "fullbody")) {
      (s.sessions = s.sessions || []).push(session29Jun());
      s.sessions.sort((a, b) => a.date.localeCompare(b.date));
    }
    s.migrations.push("plan-jul2026");
  }

  return s;
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
    return applyMigrations(merged);
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
