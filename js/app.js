/* ============================================================
   APP — logica, viste, navigazione
   ============================================================ */

let state = loadState();
saveState(state);   // persiste il seed al primo avvio
let currentWorkoutId = WORKOUTS[0].id;
let calRef = new Date();          // mese mostrato nel calendario
let charts = {};                  // istanze Chart.js
let selectedQuality = {};         // qualità scelta per esercizio nella sessione corrente

/* ---------- UTIL ---------- */
const $ = (id) => document.getElementById(id);
// Data LOCALE in formato YYYY-MM-DD (mai usare toISOString per le date: e' UTC
// e a cavallo della mezzanotte italiana sposterebbe tutto al giorno sbagliato)
const localDate = (d) => d.getFullYear() + "-" + String(d.getMonth() + 1).padStart(2, "0") + "-" + String(d.getDate()).padStart(2, "0");
const todayStr = () => localDate(new Date());
const fmtShort = (str) => {
  const d = new Date(str + "T00:00:00");
  return d.toLocaleDateString("it-IT", { day: "numeric", month: "short" });
};
const fmtLong = (str) => {
  const d = new Date(str + "T00:00:00");
  return d.toLocaleDateString("it-IT", { day: "numeric", month: "long", year: "numeric" });
};
// Schede dell'utente se ne ha create, altrimenti quelle di default
const ALL_WORKOUTS = () => (state.myWorkouts && state.myWorkouts.length) ? state.myWorkouts : WORKOUTS;
const getWorkout = (id) => ALL_WORKOUTS().find(w => w.id === id)
  || WORKOUTS.find(w => w.id === id)
  || (state.myWorkouts || []).find(w => w.id === id)
  || (typeof PT_WORKOUT !== "undefined" && PT_WORKOUT.id === id ? PT_WORKOUT : undefined);
// Tutte le schede assegnabili nel calendario (schede utente/default + PT)
const SCHEDULABLE = () => ALL_WORKOUTS().concat(typeof PT_WORKOUT !== "undefined" ? [PT_WORKOUT] : []);

// Unisce gli esercizi personalizzati dell'utente alla libreria globale
function mergeCustomExercises() {
  if (state.customExercises) Object.assign(EXERCISES, state.customExercises);
}

// Colore del cerchietto esercizio per tipo di attrezzo
const TYPE_COLOR = { machine: "#5B8DEF", dumbbell: "#2BD576", cable: "#FF8A5B", body: "#A855F7", barbell: "#EF4444" };

// Prossima data in calendario (non ancora fatta), opzionale per scheda
function nextScheduledFor(workoutId) {
  const t = todayStr();
  return Object.entries(state.schedule || {})
    .filter(([d, sc]) => d >= t && !sc.done && (!workoutId || sc.workoutId === workoutId))
    .sort((a, b) => a[0].localeCompare(b[0]))[0] || null;
}
// Versione secca per l'hero: OGGI / DOMANI / LUNEDÌ / TRA N GIORNI
function whenShort(ds) {
  const diff = Math.round((new Date(ds + "T00:00:00") - new Date(todayStr() + "T00:00:00")) / 864e5);
  if (diff <= 0) return "oggi";
  if (diff === 1) return "domani";
  if (diff <= 6) return new Date(ds + "T00:00:00").toLocaleDateString("it-IT", { weekday: "long" });
  return "tra " + diff + " giorni";
}
// All'apertura seleziona la scheda del prossimo allenamento in calendario
let workoutManuallyChosen = false;
function pickDefaultWorkout() {
  if (workoutManuallyChosen) return;
  // prima scheda in ordine di calendario (PT compreso: ha la sua tab)
  const first = chipOrder()[0];
  if (first) currentWorkoutId = first.id;
}

// Ordine delle tab in "Allena": lo stesso del piano in calendario.
// Ogni scheda (PT compreso) è ordinata per la sua PROSSIMA occorrenza
// non ancora fatta; le schede non programmate finiscono in coda
// nell'ordine originale. Niente ripetizioni: una tab per scheda.
function chipOrder() {
  const list = SCHEDULABLE();
  return list
    .map((w, i) => { const n = nextScheduledFor(w.id); return { w, i, k: n ? n[0] : "9999-99-99" }; })
    .sort((a, b) => a.k === b.k ? a.i - b.i : a.k.localeCompare(b.k))
    .map(x => x.w);
}

// Etichetta hero: quando tocca ALLA SCHEDA MOSTRATA (una data sola:
// l'ordine delle tab dice già qual è il prossimo allenamento in assoluto)
function heroWhen(w) {
  const mine = nextScheduledFor(w.id);
  return mine ? whenShort(mine[0]) : "non programmata";
}

// Naviga alla tab Allena (dal tocco sul titolo in alto a sinistra)
function goWorkout() {
  switchView("workout", document.querySelector('.nav-item[onclick*="workout"]'));
}
// Naviga alla tab Calendario (dal tocco sulla data in header)
function goCalendar() {
  switchView("calendario", document.querySelector('.nav-item[onclick*="calendario"]'));
}

// Regressione lineare semplice → valori della trend line
function linReg(vals) {
  const n = vals.length;
  if (n < 2) return null;
  const xs = vals.map((_, i) => i);
  const sx = xs.reduce((a, b) => a + b, 0);
  const sy = vals.reduce((a, b) => a + b, 0);
  const sxx = xs.reduce((a, b) => a + b * b, 0);
  const sxy = xs.reduce((a, _, i) => a + xs[i] * vals[i], 0);
  const denom = n * sxx - sx * sx;
  if (denom === 0) return null;
  const slope = (n * sxy - sx * sy) / denom;
  const inter = (sy - slope * sx) / n;
  return xs.map(x => +(inter + slope * x).toFixed(1));
}

// Lunedì della settimana corrente (chiave per il promemoria peso)
function mondayKey() {
  const d = new Date();
  d.setDate(d.getDate() - ((d.getDay() + 6) % 7));
  return localDate(d);
}
/* Promemoria in-app (compaiono all'apertura, uno per volta, con ✕):
   lunedì = peso · mercoledì = recap di metà settimana · vigilia PT = Denis */
function midweekMessage() {
  const target = (state.profile && state.profile.daysPerWeek) || 3;
  const done = thisWeekCount();
  const pT = proteinTarget();
  let protDays = 0;
  for (let i = 0; i < 3; i++) {
    const d = new Date(); d.setDate(d.getDate() - i);
    if (dayTotals(localDate(d)).protein >= pT) protDays++;
  }
  if (done >= target) return `📊 Metà settimana: ${done}/${target} allenamenti GIÀ fatti. Sei avanti sul programma — chiudila in bellezza.`;
  if (done >= 1) return `📊 Metà settimana: ${done}/${target} allenamenti. Ce la fai, ma i prossimi giorni contano: pianifica ORA quando vai.`;
  return `📊 Metà settimana e ancora 0/${target} allenamenti. La settimana non è persa — ma da oggi non si rimanda più.`;
}

function reminderItems() {
  const items = [];
  const dow = new Date().getDay();
  // lunedì: peso
  if (dow === 1 && localStorage.getItem("weighReminder") !== mondayKey()) {
    items.push({ key: "weighReminder", val: mondayKey(), txt: "📏 Lunedì del peso! Registralo in Composizione corporea: il coach nutrizione si aggiorna da solo." });
  }
  // mercoledì: recap motivazionale
  if (dow === 3 && localStorage.getItem("midweekReminder") !== mondayKey()) {
    items.push({ key: "midweekReminder", val: mondayKey(), txt: midweekMessage() });
  }
  // vigilia di una seduta PT
  const tom = new Date(); tom.setDate(tom.getDate() + 1);
  const tomStr = localDate(tom);
  const sched = (state.schedule || {})[tomStr];
  if (sched && sched.pt && !sched.done && localStorage.getItem("denisReminder") !== tomStr) {
    const move = (typeof PT_SEQUENCE !== "undefined") ? PT_SHORT[PT_SEQUENCE[ptNextIndex()]] : "";
    items.push({ key: "denisReminder", val: tomStr, txt: `🧑‍🏫 Domani seduta col PT!${move ? ` Tocca a: <b>${move}</b>.` : ""} Dormi bene e carica le pile.` });
  }
  // dopocena (22:00–01:00): chiudi calorie e proteine prima di dormire
  const night = nightCloseMessage();
  if (night && localStorage.getItem("nightReminder") !== night.day) {
    items.push({ key: "nightReminder", val: night.day, txt: night.txt });
  }
  return items;
}

/* Messaggio "chiudi la giornata" nella finestra 22:00–01:00.
   Dopo mezzanotte si riferisce ancora al giorno appena finito.
   Compare solo se quel giorno hai tracciato almeno un pasto. */
function nightCloseMessage(now) {
  const d = now || new Date();
  const h = d.getHours();
  if (!(h >= 22 || h < 1)) return null;
  let ref = new Date(d);
  if (h < 1) ref.setDate(ref.getDate() - 1);
  const day = localDate(ref);
  if (!((state.meals || {})[day] || []).length) return null;
  const t = dayTotals(day);
  const kMiss = Math.max(0, kcalTarget() - t.kcal);
  const pMiss = Math.max(0, proteinTarget() - t.protein);
  if (!kMiss && !pMiss) return { day, txt: "🌙 Giornata chiusa: calorie e proteine al bersaglio. Vai a dormire da campione. ✅" };
  let idea;
  if (pMiss >= 30)      idea = "shake di proteine + una banana, o fiocchi di latte col miele";
  else if (pMiss >= 15) idea = "yogurt greco intero con frutta secca (≈250 kcal, 18 g)";
  else if (pMiss > 0)   idea = "un bicchiere di latte o uno yogurt greco";
  else                  idea = "frutta secca o pane e miele: kcal facili che non appesantiscono";
  const parts = [];
  if (kMiss) parts.push(`<b>${kMiss} kcal</b>`);
  if (pMiss) parts.push(`<b>${pMiss} g di proteine</b>`);
  return { day, txt: `🌙 Per chiudere la giornata mancano ${parts.join(" e ")}. Idea prima di dormire: ${idea}.` };
}

function renderWeighBanner() {
  const host = $("weigh-banner");
  if (!host) return;
  const items = reminderItems();
  host.innerHTML = items.map((it, i) => `
    <div class="weigh-banner"><span class="wb-txt">${it.txt}</span><button class="wb-x" onclick="dismissReminder('${it.key}','${it.val}')" aria-label="Chiudi">✕</button></div>`).join("");
}
function dismissReminder(key, val) {
  localStorage.setItem(key, val);
  renderWeighBanner();
}

// Sets [{w,r}] di un esercizio in una sessione
function exSets(s, exKey) {
  return (s.exercises && s.exercises[exKey] && s.exercises[exKey].sets) || [];
}

// Migliore peso (PR) mai registrato per un esercizio
function bestPR(exKey) {
  let best = 0;
  state.sessions.forEach(s => exSets(s, exKey).forEach(set => { if (set.w > best) best = set.w; }));
  return best;
}

// Volume (carico) totale di una sessione: Σ peso × ripetizioni
function sessionVolume(s) {
  let tot = 0;
  Object.values(s.exercises || {}).forEach(ex => ex.sets.forEach(set => { tot += (set.w || 0) * (set.r || 0); }));
  return tot;
}

// 1RM stimato (formula di Epley) da peso × ripetizioni
function estimate1RM(w, r) { return w * (1 + r / 30); }

// Peso corporeo attuale
function currentBW() { const bw = state.bodyweight; return bw.length ? bw[bw.length - 1].v : null; }

// Lunedì della settimana di una data (YYYY-MM-DD)
function weekStart(dateStr) {
  const d = new Date(dateStr + "T00:00:00");
  d.setDate(d.getDate() - ((d.getDay() + 6) % 7));
  return localDate(d);
}
// Streak: settimane consecutive (fino ad ora) con almeno un allenamento
function weekStreak() {
  const weeks = new Set(state.sessions.map(s => weekStart(s.date)));
  let probe = new Date(); probe.setDate(probe.getDate() - ((probe.getDay() + 6) % 7));
  let key = localDate(probe);
  if (!weeks.has(key)) { probe.setDate(probe.getDate() - 7); key = localDate(probe); }
  let n = 0;
  while (weeks.has(key)) { n++; probe.setDate(probe.getDate() - 7); key = localDate(probe); }
  return n;
}

// Target nutrizionali per la massa (da BMR + peso)
// Ritmo di variazione peso (kg/settimana) sulle pesate delle ultime 4 settimane
function recentWeeklyRate() {
  const bw = state.bodyweight || [];
  if (bw.length < 2) return null;
  const last = bw[bw.length - 1];
  const cutoff = new Date(last.date + "T00:00:00"); cutoff.setDate(cutoff.getDate() - 28);
  const win = bw.filter(b => new Date(b.date + "T00:00:00") >= cutoff);
  if (win.length < 2) return null;
  const days = (new Date(last.date) - new Date(win[0].date)) / 864e5;
  if (days <= 0) return null;
  return +(((last.v - win[0].v) / days) * 7).toFixed(2);
}

/* Coach nutrizione ADATTIVO: si ricalcola a ogni pesata.
   Base = BMR (bilancia smart se disponibile, altrimenti Mifflin-St Jeor dal
   profilo) × attività (giorni/settimana) + aggiustamento per obiettivo,
   corretto in base al ritmo reale delle ultime 4 settimane. */
function nutritionTargets() {
  const p = state.profile || {};
  const bw = currentBW() || state.goals.startWeight || 70;
  const comp = state.composition || [];
  let bmr = comp.length ? comp[comp.length - 1].bmr : null;
  if (!bmr) bmr = (p.height && p.age)
    ? Math.round(10 * bw + 6.25 * p.height - 5 * p.age + (p.sex === "F" ? -161 : 5))
    : Math.round(22 * bw);
  const days = p.daysPerWeek || 3;
  const act = days >= 5 ? 1.65 : days >= 3 ? 1.5 : 1.35;
  const tdee = Math.round(bmr * act);
  const goal = p.goal || "massa";
  let adj = ({ massa: 300, dimagrimento: -400, forza: 150, benessere: 0 })[goal];
  if (adj == null) adj = 300;

  // Adattamento settimanale sul ritmo reale
  let adaptNote = "";
  const rate = recentWeeklyRate();
  if (rate != null) {
    if (goal === "massa" && rate < 0.1) { adj += 150; adaptNote = "il peso è fermo → surplus alzato di 150 kcal questa settimana"; }
    else if (goal === "massa" && rate > 0.5) { adj -= 100; adaptNote = "stai salendo veloce (" + rate + " kg/sett) → surplus ridotto per una massa più pulita"; }
    else if (goal === "dimagrimento" && rate > -0.1) { adj -= 150; adaptNote = "il peso è fermo → deficit aumentato di 150 kcal"; }
    else if (goal === "dimagrimento" && rate < -1) { adj += 150; adaptNote = "stai scendendo troppo in fretta → deficit ammorbidito"; }
    else if (goal === "massa") adaptNote = "ritmo attuale " + (rate > 0 ? "+" : "") + rate + " kg/settimana: sei nella zona giusta";
  }

  const kcal = Math.round((tdee + adj) / 10) * 10;
  const gkg = ({ massa: 1.9, dimagrimento: 2.0, forza: 1.8, benessere: 1.4 })[goal] || 1.9;
  const protein = Math.round(bw * gkg);
  const fat = Math.round(bw * 0.9);
  const carbs = Math.max(0, Math.round((kcal - protein * 4 - fat * 9) / 4));
  return { bmr, bw, tdee, bulk: kcal, kcal, protein, fat, carbs, goal, adj, gkg, rate, adaptNote };
}

// Proiezione raggiungimento peso obiettivo (richiede ≥2 misurazioni)
function weightProjection() {
  const bw = state.bodyweight, g = state.goals;
  if (bw.length < 2 || g.targetWeight == null) return null;
  const first = bw[0], last = bw[bw.length - 1];
  const days = (new Date(last.date) - new Date(first.date)) / 86400000;
  if (days <= 0) return null;
  const ratePerWeek = (last.v - first.v) / days * 7;
  if (ratePerWeek <= 0.01) return { ratePerWeek, date: null };  // fermo o in calo
  const weeksLeft = (g.targetWeight - last.v) / ratePerWeek;
  if (weeksLeft <= 0) return { ratePerWeek, date: last.date };
  const eta = new Date(last.date); eta.setDate(eta.getDate() + Math.round(weeksLeft * 7));
  return { ratePerWeek, date: localDate(eta) };
}

// Numero di PR registrati (esercizi con un massimale)
function prCount() {
  const keys = new Set();
  state.sessions.forEach(x => Object.keys(x.exercises || {}).forEach(k => keys.add(k)));
  return [...keys].filter(k => bestPR(k) > 0).length;
}
// Kg guadagnati dall'inizio
function massGain() {
  const cur = currentBW(), start = state.goals.startWeight;
  return (cur != null && start != null) ? cur - start : 0;
}
// Sessioni nella settimana corrente
function thisWeekCount() {
  const wk = weekStart(todayStr());
  return state.sessions.filter(s => weekStart(s.date) === wk).length;
}
// Volume (carico) totale sollevato in tutte le sessioni
function totalVolumeAll() { return state.sessions.reduce((a, s) => a + sessionVolume(s), 0); }
// Schede diverse provate
function distinctWorkouts() { return new Set(state.sessions.map(s => s.workoutId)).size; }
// Massimo numero di allenamenti in una stessa settimana
function maxWeekSessions() {
  const c = {};
  state.sessions.forEach(s => { const k = weekStart(s.date); c[k] = (c[k] || 0) + 1; });
  return Object.values(c).reduce((m, v) => Math.max(m, v), 0);
}

// TRAGUARDI (badge) — con spiegazione (tocca per leggerla)
const BADGES = [
  { id: "start",   icon: "🌱", name: "Si comincia!",         test: () => state.sessions.length >= 1,
    desc: "Hai registrato il tuo primo allenamento. Ogni grande risultato parte da qui." },
  { id: "fullweek",icon: "📅", name: "Settimana piena",       test: () => maxWeekSessions() >= 3,
    desc: "Hai fatto 3 allenamenti in una stessa settimana: il tuo ritmo ideale per crescere." },
  { id: "s10",     icon: "💪", name: "10 allenamenti",        test: () => state.sessions.length >= 10,
    desc: "10 sessioni registrate. La costanza sta diventando un'abitudine." },
  { id: "s25",     icon: "🏅", name: "25 allenamenti",        test: () => state.sessions.length >= 25,
    desc: "25 allenamenti! Non è più una prova, è uno stile di vita." },
  { id: "s50",     icon: "🏆", name: "50 allenamenti",        test: () => state.sessions.length >= 50,
    desc: "50 sessioni. Sei ufficialmente uno che in palestra ci sa stare." },
  { id: "streak2", icon: "🔥", name: "2 settimane di fila",   test: () => weekStreak() >= 2,
    desc: "Due settimane consecutive di allenamento. La fiamma è accesa." },
  { id: "streak4", icon: "🔥", name: "1 mese di costanza",    test: () => weekStreak() >= 4,
    desc: "Un mese intero senza saltare una settimana. Disciplina vera." },
  { id: "streak8", icon: "⚡", name: "2 mesi inarrestabile",   test: () => weekStreak() >= 8,
    desc: "Otto settimane di fila. A questo punto non ti ferma più niente." },
  { id: "pr5",     icon: "📈", name: "5 record personali",    test: () => prCount() >= 5,
    desc: "Hai battuto il tuo massimo su 5 esercizi diversi. Stai diventando più forte." },
  { id: "vol10k",  icon: "🏋️", name: "Una tonnellata e più",  test: () => totalVolumeAll() >= 10000,
    desc: "Hai sollevato in totale oltre 10.000 kg (peso × ripetizioni). Letteralmente tonnellate." },
  { id: "gain2",   icon: "🍽️", name: "+2 kg di massa",        test: () => massGain() >= 2,
    desc: "+2 kg dal peso di partenza. Il surplus e gli allenamenti stanno pagando." },
  { id: "halfway", icon: "🧗", name: "A metà strada",         test: () => { const t = state.goals.targetWeight, s = state.goals.startWeight; return t != null && s != null && t > s && massGain() >= (t - s) / 2; },
    desc: "Sei a metà del percorso verso il tuo peso obiettivo. La vetta è vicina." },
  { id: "gain5",   icon: "💥", name: "+5 kg di massa",        test: () => massGain() >= 5,
    desc: "+5 kg di massa dall'inizio. Trasformazione in pieno corso." },
  { id: "allschede",icon: "🧭", name: "Esploratore",          test: () => distinctWorkouts() >= 3,
    desc: "Hai provato almeno 3 schede diverse. Allenamento completo, zero monotonia." },
  { id: "ptfirst", icon: "🧑‍🏫", name: "Battesimo del ferro",  test: () => (state.ptLifts || []).length >= 1,
    desc: "Prima seduta coi super esercizi registrata: panca, squat o stacco. Benvenuto tra i grandi." },
  { id: "clean10", icon: "✨", name: "Tecnica pulita",        test: () => cleanCount() >= 10,
    desc: "10 esercizi chiusi con serie \"pulite\". La forma prima del peso: così si costruisce." },
  { id: "grinder", icon: "🦾", name: "Mai mollare",           test: () => hardCount() >= 5,
    desc: "5 esercizi portati a termine anche quando erano durissimi. Il carattere si vede lì." },
  { id: "meals7",  icon: "🍽️", name: "Settimana a tavola",    test: () => mealDayStreak() >= 7,
    desc: "7 giorni di fila coi pasti registrati. La massa si costruisce in cucina." },
  { id: "builder", icon: "🧩", name: "Architetto",            test: () => (state.myWorkouts || []).length >= 1,
    desc: "Hai creato la tua prima scheda personalizzata. Questa app ora è davvero tua." },
  { id: "coldhead",icon: "🧊", name: "Testa fredda",         test: () => state.sessions.some(x => x.deload),
    desc: "Hai accettato e completato una settimana di scarico. Sapersi fermare è da atleti veri, non da pigri." },
  { id: "weigh4",  icon: "⚖️", name: "Bilancia fedele",       test: () => weighWeeks() >= 4,
    desc: "Peso registrato in 4 settimane diverse. Senza dati non c'è progresso misurabile." },
  { id: "goal",    icon: "👑", name: "Obiettivo raggiunto!",  test: () => { const c = currentBW(), t = state.goals.targetWeight, s = state.goals.startWeight; return c != null && t != null && (s == null || t >= s ? c >= t : c <= t); },
    desc: "Hai raggiunto il tuo peso obiettivo. Campione. Ora si punta più in alto." }
];

// Esercizi valutati "pulite" / "dure" in tutte le sessioni
function cleanCount() {
  let n = 0;
  state.sessions.forEach(s => Object.values(s.exercises || {}).forEach(e => { if (e.quality === "clean") n++; }));
  return n;
}
function hardCount() {
  let n = 0;
  state.sessions.forEach(s => Object.values(s.exercises || {}).forEach(e => { if (e.quality === "hard") n++; }));
  return n;
}
// Giorni consecutivi (fino a oggi o ieri) con pasti registrati
function mealDayStreak() {
  let n = 0;
  const d = new Date();
  if (!mealsFor(todayStr()).length) d.setDate(d.getDate() - 1);   // oggi può essere in corso
  while (mealsFor(localDate(d)).length) { n++; d.setDate(d.getDate() - 1); }
  return n;
}
// Settimane diverse con almeno una pesata
function weighWeeks() {
  return new Set((state.bodyweight || []).map(b => weekStart(b.date))).size;
}
function earnedBadgeIds() { return BADGES.filter(b => b.test()).map(b => b.id); }

// Esercizio nell'ultima sessione (prima di oggi): { date, sets, quality }
function lastExercise(exKey) {
  const all = state.sessions
    .filter(s => s.date < todayStr() && exSets(s, exKey).length)
    .sort((a, b) => b.date.localeCompare(a.date));
  // le sessioni di scarico non fanno da baseline per la progressione
  const past = all.filter(s => !s.deload);
  const sess = past.length ? past[0] : all[0];
  if (!sess) return null;
  return { date: sess.date, sets: exSets(sess, exKey), quality: sess.exercises[exKey].quality };
}

/* ============================================================
   DELOAD — scarico programmato, deciso come farebbe un vero PT
   Legge il semaforo delle ultime 2 settimane: se la fatica si
   accumula (tante "dure"/"non finite") o il motore gira da troppe
   settimane senza pause, propone una settimana a -20%.
   Non è un premio: è strategia per spingere più forte dopo.
   ============================================================ */
const DELOAD_FACTOR = 0.8;     // -20% sui carichi
const DELOAD_DAYS = 7;

function deloadActive() {
  const d = state.deload;
  return !!(d && d.until && d.until >= todayStr());
}

// Analisi pura: quanta fatica si è accumulata?
function fatigueAnalysis() {
  const cutoff = localDate(new Date(Date.now() - 14 * 864e5));
  let evals = 0, score = 0;
  state.sessions.filter(x => x.date >= cutoff && !x.deload).forEach(x => {
    Object.values(x.exercises || {}).forEach(e => {
      if (e.quality === "clean") { evals++; }
      else if (e.quality === "hard") { evals++; score += 1; }
      else if (e.quality === "fail") { evals++; score += 2; }
    });
  });
  const ratio = evals ? +(score / (evals * 2)).toFixed(2) : 0;
  const weeksRun = weekStreak();
  let propose = false, reason = "";
  if (evals >= 6 && ratio >= 0.5) {
    propose = true;
    reason = "Nelle ultime 2 settimane oltre metà dei tuoi esercizi sono stati duri o non completati. Il corpo sta chiedendo tregua — e ignorarlo è il modo migliore per fermarsi un mese, non una settimana.";
  } else if (weeksRun >= 6 && evals >= 6 && ratio >= 0.35) {
    propose = true;
    reason = weeksRun + " settimane di fila senza pause e la fatica inizia a mordere. I muscoli crescono nel recupero: una settimana leggera ORA vale due pesanti DOPO.";
  }
  return { evals, ratio, weeksRun, propose, reason };
}

function startDeload() {
  const until = new Date(); until.setDate(until.getDate() + DELOAD_DAYS - 1);
  state.deload = { start: todayStr(), until: localDate(until) };
  saveState(state);
  renderWorkout();
  toast("🧊 Scarico attivo: carichi al -20% per 7 giorni. Testa fredda, tecnica perfetta.");
}
function snoozeDeload() {
  const until = new Date(); until.setDate(until.getDate() + 7);
  state.deload = { snoozeUntil: localDate(until) };
  saveState(state);
  renderWorkout();
  toast("Ok, il coach rispetta la scelta. Ne riparliamo tra una settimana — ma ascoltati.");
}

function renderDeloadBanner() {
  const host = $("deload-banner");
  if (!host) return;
  // scarico scaduto → si torna a spingere
  if (state.deload && state.deload.until && state.deload.until < todayStr()) {
    state.deload = null;
    saveState(state);
    toast("🔥 Scarico finito: pile ricaricate. Da oggi si torna a spingere.");
  }
  if (deloadActive()) {
    host.innerHTML = `
      <div class="deload-bar active">
        <span class="db-ico">🧊</span>
        <span class="db-txt"><b>Scarico attivo fino a ${fmtShort(state.deload.until)}</b> · carichi al -20%. Non barare verso l'alto: oggi vinci recuperando.</span>
      </div>`;
    return;
  }
  const snoozed = state.deload && state.deload.snoozeUntil && state.deload.snoozeUntil >= todayStr();
  const fa = fatigueAnalysis();
  if (fa.propose && !snoozed) {
    host.innerHTML = `
      <div class="deload-bar">
        <div class="db-head"><span class="db-ico">🧊</span><b>Il coach ha deciso: settimana di scarico.</b></div>
        <div class="db-txt">${fa.reason}</div>
        <div class="db-txt db-plan">Il piano: 7 giorni con gli stessi esercizi al <b>-20%</b>, tecnica maniacale. Poi si riparte a spingere più forte di prima.</div>
        <div class="db-btns">
          <button class="btn-outline" onclick="snoozeDeload()">Non ora</button>
          <button class="btn-save" onclick="startDeload()">🧊 Accetto lo scarico</button>
        </div>
      </div>`;
  } else {
    host.innerHTML = "";
  }
}

// SOVRACCARICO PROGRESSIVO — suggerimento per l'esercizio di oggi
function suggestion(exKey) {
  const meta = EXERCISES[exKey];
  const last = lastExercise(exKey);
  const inc = meta.type === "dumbbell" ? 2 : 2.5;   // +2 manubri, +2.5 macchine/cavi
  const baseReps = meta.reps;        // base del contenitore (es. 12)
  const capReps = baseReps + 3;      // tetto del contenitore (es. 15)

  if (!last) {
    return { last: null, todayHtml: `Scegli un peso che ti dia serie pulite`,
             color: "gray", targetW: null, targetReps: baseReps };
  }

  const w = Math.max(...last.sets.map(s => s.w));

  // 🧊 SCARICO ATTIVO — carichi al -20%, arrotondati al passo dell'attrezzo
  if (deloadActive()) {
    const dw = Math.max(inc, Math.floor((w * DELOAD_FACTOR) / inc) * inc);   // arrotonda in GIÙ: lo scarico non si bara
    const day0 = new Date(last.date + "T00:00:00").toLocaleDateString("it-IT", { weekday: "long" });
    return { last, lastW: w, lastR: Math.min(...last.sets.map(x => x.r)), lastSets: last.sets.length, day: day0,
             todayHtml: `Scarico: <strong>${dw} kg</strong> × ${baseReps} — leggero, lento, perfetto 🧊`,
             color: "deload", targetW: dw, targetReps: baseReps };
  }

  const minR = Math.min(...last.sets.map(s => s.r));
  const nSets = last.sets.length;
  const q = last.quality;
  const day = new Date(last.date + "T00:00:00").toLocaleDateString("it-IT", { weekday: "long" });
  const base = { last, lastW: w, lastR: minR, lastSets: nSets, day };

  // 🔴 ROSSO — giornata storta: stesso peso, stesse ripetizioni, riprova
  if (q === "fail") {
    return { ...base, todayHtml: `Giornata storta? Riprova uguale: stesso peso e ripetizioni`, color: "red", targetW: w, targetReps: minR };
  }
  // 🟡 GIALLO — faticoso: resta fermo finché non diventa pulito
  if (q === "hard") {
    return { ...base, todayHtml: `Resta su questo peso e ripetizioni finché non diventa pulito`, color: "yellow", targetW: w, targetReps: minR };
  }
  // 🟢 VERDE — cresci in reps dentro il contenitore, poi sali di peso e ricominci
  if (nSets < meta.sets) {
    return { ...base, todayHtml: `Aggiungi una serie in più 🎯`, color: "green", targetW: w, targetReps: minR };
  }
  if (minR >= capReps) {
    const nw = +(w + inc).toFixed(1);   // tetto pieno → sali di peso, svuota il contenitore
    return { ...base, todayHtml: `Tetto ripetizioni raggiunto: sali di peso e riparti dalle base 🎯`, color: "green", targetW: nw, targetReps: baseReps };
  }
  if (minR >= baseReps) {               // dentro il range → +1 ripetizione
    return { ...base, todayHtml: `Aggiungi una ripetizione per serie 🎯`, color: "green", targetW: w, targetReps: minR + 1 };
  }
  // sotto le ripetizioni base ma pulito → completa le base con questo peso
  return { ...base, todayHtml: `Completa le ripetizioni con questo peso 🎯`, color: "green", targetW: w, targetReps: baseReps };
}

// Sessione di oggi per la scheda corrente (se esiste)
function todaySession(workoutId) {
  return state.sessions.find(s => s.date === todayStr() && s.workoutId === workoutId);
}

/* ---------- NAV ---------- */
function switchView(view, btn) {
  document.querySelectorAll(".nav-item").forEach(n => n.classList.remove("active"));
  document.querySelectorAll(".section").forEach(s => s.classList.remove("active"));
  if (btn) btn.classList.add("active");
  $(`section-${view}`).classList.add("active");
  window.scrollTo(0, 0);
  if (view === "progressi") renderProgress();
  if (view === "obiettivi") renderGoals();
  if (view === "calendario") renderCalendar();
  if (view === "pasti") renderMeals();
}

/* ============================================================
   VISTA WORKOUT
   ============================================================ */
function renderWorkoutChips() {
  mergeCustomExercises();
  pickDefaultWorkout();
  if (!SCHEDULABLE().some(w => w.id === currentWorkoutId)) currentWorkoutId = chipOrder()[0].id;
  $("workout-chips").innerHTML = chipOrder().map(w => `
    <button class="wchip ${w.id === currentWorkoutId ? 'active' : ''}"
            style="${w.id === currentWorkoutId ? `background:${w.color};border-color:${w.color}` : ''}"
            onclick="selectWorkout('${w.id}')">
      <span class="wchip-emoji">${w.emoji}</span>${w.name}
    </button>`).join("") +
    `<button class="wchip wchip-add" onclick="showBuilderChooser(false)" title="Nuova scheda">＋</button>`;
}

function selectWorkout(id) {
  workoutManuallyChosen = true;
  currentWorkoutId = id;
  renderWorkoutChips();
  renderWorkout();
}

function renderWorkout() {
  const w = getWorkout(currentWorkoutId);

  // La tab PT ha una vista tutta sua (seduta col PT, non una scheda classica)
  const isPT = !!w.pt;
  document.querySelector(".btn-guided").style.display = isPT ? "none" : "";
  document.querySelector(".ex-head").style.display = isPT ? "none" : "";
  if (isPT) { renderPTWorkout(w); return; }

  const exList = w.exercises.map(k => Object.assign({ key: k }, EXERCISES[k]));
  const sess = todaySession(w.id);

  // HERO
  $("workout-hero").style.background = `linear-gradient(150deg, ${w.color} 0%, #2A1B4A 95%)`;
  $("workout-hero").style.boxShadow = `0 10px 40px -8px ${w.color}66, inset 0 1px 0 rgba(255,255,255,.18)`;
  $("workout-hero").innerHTML = `
    <div class="hero-label">${heroWhen(w)}</div>
    <div class="hero-title">${w.name} ${w.emoji}</div>
    <div class="hero-stats">
      <div class="hero-stat"><div class="hero-stat-num">${exList.length}</div><div class="hero-stat-lbl">Esercizi</div></div>
      <div class="hero-stat"><div class="hero-stat-num">3</div><div class="hero-stat-lbl">Serie</div></div>
      <div class="hero-stat"><div class="hero-stat-num">12</div><div class="hero-stat-lbl">Rip. medi</div></div>
      <div class="hero-stat"><div class="hero-stat-num">~50'</div><div class="hero-stat-lbl">Durata</div></div>
    </div>`;

  // CARDS
  const cont = $("ex-cards");
  cont.innerHTML = "";
  selectedQuality = {};
  exList.forEach((ex, i) => {
    const [badgeClass, badgeLabel] = badgeMap[ex.type];
    const repsNum = ex.time ? ex.time : ex.reps;
    const pr = bestPR(ex.key);
    const sug = ex.time ? null : suggestion(ex.key);
    const today = sess && sess.exercises ? sess.exercises[ex.key] : null;
    if (today) selectedQuality[ex.key] = today.quality || null;
    const qsel = today ? (today.quality || null) : null;
    const valW = (s) => (today && today.sets[s]) ? today.sets[s].w : "";
    const valR = (s) => (today && today.sets[s]) ? today.sets[s].r : "";
    const phW = sug && sug.targetW != null ? sug.targetW : "kg";
    const phR = sug ? sug.targetReps : "reps";

    const exColor = TYPE_COLOR[ex.type] || "#FF2D95";
    const card = document.createElement("div");
    card.className = "ex-card" + (ex.time ? " is-plank" : "");
    card.id = `ex-${i}`;
    card.innerHTML = `
      <div class="ex-header" onclick="toggleCard(${i})">
        <div class="ex-num" id="exnum-${i}" data-c="${exColor}" style="background:${exColor}">${i + 1}</div>
        <div class="ex-title-group">
          <div class="ex-name">${ex.name}</div>
          <div class="ex-muscle">${ex.muscle}${pr ? ` · <span class="pr-tag">🏆 PR ${pr} kg</span>` : ''}</div>
        </div>
        <span class="ex-badge ${badgeClass}">${badgeLabel}</span>
        <span class="ex-chevron">▾</span>
      </div>
      <div class="ex-body">
        <div class="muscle-row">
          <img class="ex-gif" src="assets/gifs/${ex.key}.gif" loading="lazy" alt="${ex.name}" onerror="this.style.display='none'">
          <div class="muscle-info">
            <div class="muscle-primary">Muscolo target: ${ex.muscle}</div>
            <div class="muscle-secondary">Secondari: ${ex.secondary}</div>
          </div>
        </div>
        <div class="sets-row m-row" data-ex="${ex.key}">
          <div class="m-field"><input class="m-in" id="m-sets-${ex.key}" type="number" inputmode="numeric" min="1" max="10" value="${today ? Object.keys(today.sets).length : ex.sets}" onchange="manualChanged('${ex.key}')"><div class="set-pill-lbl">Serie</div></div>
          <div class="m-field"><input class="m-in" id="m-reps-${ex.key}" type="number" inputmode="numeric" min="1" max="50" value="${today && today.sets[0] ? today.sets[0].r : (ex.time ? '' : (sug ? sug.targetReps : ex.reps))}" ${ex.time ? 'disabled placeholder="—"' : ''} onchange="manualChanged('${ex.key}')"><div class="set-pill-lbl">${ex.time ? 'Durata' : 'Rip.'}</div></div>
          <div class="m-field"><input class="m-in" id="m-w-${ex.key}" type="number" inputmode="decimal" step="0.5" min="0" max="500" value="${today && today.sets[0] ? today.sets[0].w : (!ex.time && sug && sug.targetW != null ? sug.targetW : '')}" placeholder="—" ${ex.time ? 'disabled' : ''} onchange="manualChanged('${ex.key}')"><div class="set-pill-lbl">Kg</div></div>
        </div>
        ${ex.time ? '' : `<div class="last-time">📊 Ultima volta: ${sug.last
          ? `<strong>${sug.lastW}kg</strong> · ${sug.lastSets}×${sug.lastR} ${lastQualIcon(ex.key)} <span class="lt-day">(${sug.day})</span>`
          : '— nessuna sessione precedente'}</div>`}
        <div class="tip-box">
          <div class="tip-label">⚠️ Errore comune</div>
          <div class="tip-text">${ex.tip}</div>
        </div>
        ${EXERCISE_STEPS[ex.key] ? `
        <details class="steps">
          <summary>📋 Come si esegue</summary>
          <ol class="steps-list">${EXERCISE_STEPS[ex.key].map(st => `<li>${st}</li>`).join("")}</ol>
        </details>` : ''}
        ${ex.time ? `<button class="plank-done" onclick="togglePlankDone(${i})">✓ Segna come fatto</button>` : ''}
      </div>`;
    cont.appendChild(card);
  });

  $("toggle-all").textContent = "Espandi tutto";
  renderGuidedResume();
  renderDeloadBanner();
  if (typeof renderWrappedBanner === "function") renderWrappedBanner();
}

/* ---------- VISTA PT: la seduta col personal trainer ----------
   Non è una scheda da compilare: mostra il super esercizio che ti
   aspetta (rotazione panca→stacco→squat), l'obiettivo del giorno,
   il livello di forza e la registrazione rapida dei kg. */
function renderPTWorkout(w) {
  const lifts = [...(state.ptLifts || [])].sort((a, b) => a.date.localeCompare(b.date));
  const idx = ptNextIndex();
  const key = PT_SEQUENCE[idx];
  const move = PT_MOVES.find(m => m.key === key);

  // ultimo carico registrato per il super esercizio in arrivo
  let lastKg = null, lastDate = null;
  lifts.forEach(l => { if (l[key] != null) { lastKg = l[key]; lastDate = l.date; } });
  const target = lastKg != null ? lastKg + 2.5 : null;

  const bw = currentBW();
  const sex = (state.profile && state.profile.sex) || "M";
  const lv = (lastKg != null && bw) ? strengthLevel(key, lastKg, bw, sex) : null;

  // HERO
  $("workout-hero").style.background = `linear-gradient(150deg, ${w.color} 0%, #2A1B4A 95%)`;
  $("workout-hero").style.boxShadow = `0 10px 40px -8px ${w.color}66, inset 0 1px 0 rgba(255,255,255,.18)`;
  $("workout-hero").innerHTML = `
    <div class="hero-label">${heroWhen(w)}</div>
    <div class="hero-title">Seduta col PT ${w.emoji}</div>
    <div class="hero-stats">
      <div class="hero-stat"><div class="hero-stat-num">${PT_SHORT[key]}</div><div class="hero-stat-lbl">Ti aspetta</div></div>
      <div class="hero-stat"><div class="hero-stat-num">${target != null ? target + '<small> kg</small>' : '—'}</div><div class="hero-stat-lbl">Obiettivo</div></div>
      <div class="hero-stat"><div class="hero-stat-num">${lifts.length}</div><div class="hero-stat-lbl">Sedute</div></div>
    </div>`;

  // CORPO
  const focus = `
    <div class="ex-card ptv ptv-focus">
      <div class="ptv-head">
        <span class="ptv-dot" style="background:${move.color}"></span>
        <div>
          <div class="ptv-title">🎯 Super esercizio: <b>${move.lbl}</b></div>
          <div class="ptv-sub">rotazione ${PT_SEQUENCE.map(k => k === key ? `<b>${PT_SHORT[k]}</b>` : PT_SHORT[k]).join(" → ")}</div>
        </div>
      </div>
      ${lastKg != null
        ? `<div class="ptv-line">📊 Ultima volta: <b>${lastKg} kg</b> <span class="lt-day">(${fmtShort(lastDate)})</span> → oggi punta a <b style="color:${move.color}">${target} kg</b></div>`
        : `<div class="ptv-line">Prima volta su questo esercizio: parti tranquillo, il carico giusto lo trovate insieme.</div>`}
      ${lv ? `
      <div class="ptv-line">🏅 Livello: <b>${lv.levelName}</b>${lv.next ? ` — ${lv.next.name} a ${lv.next.kg} kg (−${lv.next.missing})` : " — 🏆 vetta raggiunta"}</div>
      <div class="sl-bar"><div class="sl-fill" style="width:${lv.pct}%;background:${move.color}"></div></div>` : ""}
    </div>`;

  const form = `
    <div class="ex-card ptv">
      <div class="ptv-title" style="margin-bottom:8px">💪 A fine seduta registra i kg</div>
      <div class="pt-inputs">
        ${PT_MOVES.map(m => `<div class="pt-field"><label>${m.lbl} (kg)</label><input type="number" id="ptw-${m.key}" inputmode="decimal" step="0.5" min="0" placeholder="—"></div>`).join("")}
      </div>
      <button class="btn-save" onclick="savePTLift('ptw-')">Registra seduta PT</button>
    </div>`;

  const recent = lifts.slice(-3).reverse().map(ptRowHTML).join("");
  const history = lifts.length ? `
    <div class="ex-card ptv">
      <div class="ptv-title" style="margin-bottom:8px">🗓 Ultime sedute</div>${recent}
      <div class="chart-hint" style="margin-top:8px">Grafico completo e scala di forza in <b>Progressi</b>.</div>
    </div>` : "";

  $("ex-cards").innerHTML = focus + form + history;

  renderDeloadBanner();
  if (typeof renderWrappedBanner === "function") renderWrappedBanner();
}

function toggleCard(i) { $(`ex-${i}`).classList.toggle("open"); }

function toggleAll() {
  const cards = document.querySelectorAll("#ex-cards .ex-card");
  const anyClosed = [...cards].some(c => !c.classList.contains("open"));
  cards.forEach(c => c.classList.toggle("open", anyClosed));
  $("toggle-all").textContent = anyClosed ? "Contrai tutto" : "Espandi tutto";
}

// Semaforo dell'ultima volta (reminder di fatica nella card)
function lastQualIcon(exKey) {
  const last = lastExercise(exKey);
  if (!last || !last.quality) return "";
  return { clean: "🟢", hard: "🟡", fail: "🔴" }[last.quality] || "";
}

/* ---------- INSERIMENTO MANUALE (serie × rip @ kg + semaforo) ----------
   Per chi non usa il guidato: modifichi i numeri in alto nella card e
   l'app salva da sola la sessione di oggi. Il semaforo alimenta il
   suggerimento della volta successiva, come nel guidato. */
let manualTimers = {};

function manualChanged(exKey) {
  clearTimeout(manualTimers[exKey]);
  manualTimers[exKey] = setTimeout(() => manualSave(exKey), 700);
}

function manualSave(exKey) {
  const gv = (id) => { const e = $(id); return e ? parseFloat(String(e.value).replace(",", ".")) : NaN; };
  const nSets = Math.max(1, Math.min(10, parseInt(gv("m-sets-" + exKey)) || (EXERCISES[exKey].sets || 3)));
  const reps = Math.max(1, Math.min(50, parseInt(gv("m-reps-" + exKey)) || (EXERCISES[exKey].reps || 12)));
  const w = gv("m-w-" + exKey);
  if (isNaN(w) || w <= 0) return;              // niente kg → niente salvataggio
  const sets = Array.from({ length: nSets }, () => ({ w, r: reps }));
  upsertManualExercise(currentWorkoutId, exKey, sets, selectedQuality[exKey] || null);
  toast("💾 " + EXERCISES[exKey].name + " salvato per oggi");
}

function upsertManualExercise(workoutId, exKey, sets, quality) {
  let sess = todaySession(workoutId);
  if (!sess) {
    sess = { id: Date.now(), date: todayStr(), workoutId, exercises: {}, duration: null, calories: null, notes: "", deload: deloadActive() || undefined };
    state.sessions.push(sess);
  }
  sess.exercises[exKey] = { sets, quality };
  state.schedule[todayStr()] = { workoutId, done: true };
  const before = state.badges || [];
  state.badges = earnedBadgeIds();
  saveState(state);
}

function togglePlankDone(i) {
  const card = $(`ex-${i}`);
  const on = card.classList.toggle("plank-on");
  const num = $(`exnum-${i}`);
  if (on) { num.style.background = "#2BD576"; num.textContent = "✓"; }
  else { num.style.background = num.dataset.c || ""; num.textContent = i + 1; }
}

// Salva (o aggiorna) la sessione di oggi e mostra il riepilogo
function commitSession(workoutId, exercises, meta) {
  // PR check (prima di scrivere lo storico)
  const newPRs = [];
  Object.keys(exercises).forEach(k => {
    const prev = bestPR(k);
    const max = Math.max(...exercises[k].sets.map(s => s.w));
    if (max > prev && prev > 0) newPRs.push(EXERCISES[k].name);
  });

  const existing = todaySession(workoutId);
  if (existing) {
    existing.exercises = exercises;
    existing.notes = meta.notes;
    existing.duration = meta.duration;
    existing.calories = meta.calories;
  } else {
    state.sessions.push({
      id: Date.now(), date: todayStr(), workoutId, exercises,
      duration: meta.duration, calories: meta.calories, notes: meta.notes,
      deload: deloadActive() || undefined
    });
  }
  state.schedule[todayStr()] = { workoutId, done: true };

  const before = state.badges || [];
  const now = earnedBadgeIds();
  const newBadges = BADGES.filter(b => now.includes(b.id) && !before.includes(b.id));
  state.badges = now;
  saveState(state);

  renderWorkout();
  showSummary(todaySession(workoutId) || state.sessions[state.sessions.length - 1], newPRs, newBadges);
}

// Frase obiettivo dinamica (multi-utente): usa il target dell'utente se c'è
function goalPhrase() {
  const t = state.goals && state.goals.targetWeight;
  return t ? `verso i ${t} kg` : "verso il tuo obiettivo";
}

function showSummary(s, newPRs, newBadges) {
  const w = getWorkout(s.workoutId);
  const vol = Math.round(sessionVolume(s));
  const wkNum = thisWeekCount();
  const streak = weekStreak();
  const motivations = [
    "Mattone su mattone. 🧱", "Costanza batte motivazione. 🔁", "Il te di domani ringrazia. 🙌",
    `Un passo più vicino ${goalPhrase().replace("verso ", "a ")}. 🎯`, "Ti stai costruendo, davvero. 🛠️"
  ];
  const motto = motivations[state.sessions.length % motivations.length];

  $("modal-title").textContent = "Sessione completata 💪";
  $("modal-body").innerHTML = `
    <div class="sum-hero" style="background:${w ? w.color : '#FF6B6B'}">
      <div class="sum-w">${w ? w.emoji + ' ' + w.name : 'Allenamento'}</div>
      <div class="sum-motto">${motto}</div>
    </div>
    <div class="sum-stats">
      <div class="sum-stat"><div class="sum-n">${vol}</div><div class="sum-l">kg volume</div></div>
      <div class="sum-stat"><div class="sum-n">${wkNum}°</div><div class="sum-l">sess. settimana</div></div>
      <div class="sum-stat"><div class="sum-n">${streak}🔥</div><div class="sum-l">streak sett.</div></div>
    </div>
    ${newPRs.length ? `<div class="sum-pr">🏆 Nuovo record su <strong>${newPRs.join(", ")}</strong>!</div>` : ''}
    ${newBadges.length ? `<div class="sum-badges">
        <div class="sum-badges-t">🎉 Traguardo${newBadges.length > 1 ? 'i' : ''} sbloccat${newBadges.length > 1 ? 'i' : 'o'}!</div>
        ${newBadges.map(b => `<div class="sum-badge"><span class="sum-badge-i">${b.icon}</span>${b.name}</div>`).join("")}
      </div>` : ''}
    <button class="btn-save" style="margin-top:16px" onclick="closeModal();openRecap(${s.id})">📸 Riepilogo da salvare</button>
    <button class="g-skip" style="width:100%;margin-top:10px" onclick="closeModal()">Chiudi</button>`;
  $("modal").classList.add("show");
}

/* ---------- RIEPILOGO (una schermata, da screenshot) ---------- */
function recapHTML(s) {
  const w = getWorkout(s.workoutId);
  const vol = Math.round(sessionVolume(s));
  const exKeys = Object.keys(s.exercises || {});
  const d = new Date(s.date + "T00:00:00").toLocaleDateString("it-IT", { weekday: "short", day: "numeric", month: "short", year: "numeric" });
  const stats = [
    { n: vol, l: "kg volume" },
    { n: exKeys.length, l: "esercizi" },
    s.duration ? { n: s.duration + "'", l: "durata" } : null,
    s.calories ? { n: s.calories, l: "kcal" } : null
  ].filter(Boolean);
  const rows = exKeys.map(k => {
    const sets = s.exercises[k].sets;
    const pr = bestPR(k), max = Math.max(...sets.map(x => x.w));
    const isPr = max >= pr && pr > 0;
    const q = s.exercises[k].quality;
    const qc = q === "clean" ? "#2BD576" : q === "hard" ? "#FFB454" : q === "fail" ? "#FF4D6D" : "";
    return `<div class="recap-row">
      <span class="recap-ex">${EXERCISES[k] ? EXERCISES[k].name : k}${isPr ? ' <span class="recap-pr">🏆</span>' : ''}</span>
      <span class="recap-sets">${sets.map(x => `${x.w}×${x.r}`).join('  ·  ')}${qc ? ` <i class="recap-q" style="background:${qc}"></i>` : ''}</span>
    </div>`;
  }).join("");
  return `
    <div class="recap-card">
      <div class="recap-head" style="background:linear-gradient(135deg, ${w ? w.color : '#FF2D95'}, #2A1B4A)">
        <div class="recap-h-lbl">Riepilogo allenamento</div>
        <div class="recap-h-w">${w ? w.emoji + ' ' + w.name : 'Allenamento'}</div>
        <div class="recap-h-date">${d}</div>
      </div>
      <div class="recap-stats">
        ${stats.map(x => `<div class="recap-stat"><b>${x.n}</b><span>${x.l}</span></div>`).join("")}
      </div>
      <div class="recap-list">${rows || '<div class="empty-mini">Nessun esercizio registrato.</div>'}</div>
      ${s.notes ? `<div class="recap-notes">📝 ${s.notes}</div>` : ''}
      <div class="recap-foot">💪 GYM TRACKER · ${goalPhrase()}</div>
    </div>`;
}

function openRecap(id) {
  const s = state.sessions.find(x => x.id === id);
  if (!s) { toast("Sessione non trovata"); return; }
  $("recap").innerHTML = recapHTML(s) + `<button class="recap-close" onclick="closeRecap()">Chiudi</button>`;
  $("recap").classList.add("show");
  document.body.style.overflow = "hidden";
}
function closeRecap() {
  $("recap").classList.remove("show");
  $("recap").innerHTML = "";
  document.body.style.overflow = "";
}

/* ============================================================
   MODALITÀ ALLENAMENTO GUIDATA
   ============================================================ */
let guided = null;

const Q_ICON = {
  clean: `<svg viewBox="0 0 24 24" fill="none"><path d="M5 12.5l4.2 4.2L19 7" stroke="#fff" stroke-width="2.6" stroke-linecap="round" stroke-linejoin="round"/></svg>`,
  hard:  `<svg viewBox="0 0 24 24" fill="#fff"><path d="M12 2s5 3.6 5 8.8a5 5 0 11-10 0c0-1.8 1-3.2 1-3.2s.6 2.1 2.1 2.7C11.2 8.7 9 6.8 12 2z"/></svg>`,
  fail:  `<svg viewBox="0 0 24 24" fill="none"><path d="M6 9.5l6 6 6-6" stroke="#fff" stroke-width="2.6" stroke-linecap="round" stroke-linejoin="round"/></svg>`
};

const G_MOTTOS = [
  "Una macchina alla volta, stai andando alla grande! 🔥",
  "Bella serie! Avanti con la prossima 💪",
  "Sei in pieno flow, non mollare 🚀",
  "Ogni esercizio è un mattone verso il tuo obiettivo 🧱",
  "Concentrato e preciso: così si cresce 🎯",
  "Quasi fatto, dai il meglio anche qui ⚡",
  "Stai costruendo il tuo fisico, serie dopo serie 🛠️"
];

// Messaggio motivazionale per esercizio, calibrato sull'ultima volta
function guidedMotivation(key) {
  if (deloadActive()) return "🧊 Settimana di scarico: -20%, esecuzione da manuale. Chi sa scaricare, poi stacca tutti.";
  const last = lastExercise(key);
  if (!last) return "🆕 Prima volta qui: trova il tuo peso, tecnica prima di tutto.";
  const q = last.quality;
  if (q === "clean") return "✅ L'ultima volta: tutto pulito. Oggi si spinge — è il giorno giusto per salire.";
  if (q === "hard") return "⚠️ L'ultima volta le hai sudate tutte. Oggi consolidiamo: stesso carico, chiudile da padrone.";
  if (q === "fail") return "❌ L'ultima volta non l'hai chiuso. Oggi si arriva in fondo, costi quel che costi.";
  return "📊 L'ultima volta non l'hai valutato: oggi chiudi le serie e dimmi com'è andata.";
}

function gMeta() { return EXERCISES[guided.keys[guided.exIndex]]; }
function gKey() { return guided.keys[guided.exIndex]; }

const GUIDED_KEY = "guided_session_v2";
function guidedSnapshot() {
  return { workoutId: guided.workoutId, keys: guided.keys, exIndex: guided.exIndex, setIndex: guided.setIndex, phase: guided.phase, data: guided.data, next: guided.next, status: guided.status };
}
function saveGuided() { try { localStorage.setItem(GUIDED_KEY, JSON.stringify(guidedSnapshot())); } catch (e) {} }
function loadGuided() { try { const r = localStorage.getItem(GUIDED_KEY); return r ? JSON.parse(r) : null; } catch (e) { return null; } }
function clearGuided() { localStorage.removeItem(GUIDED_KEY); }

function startGuided() {
  clearGuided();
  const w = getWorkout(currentWorkoutId);
  guided = { workoutId: w.id, keys: w.exercises.slice(), exIndex: 0, setIndex: 0, phase: "set", data: {}, status: {}, timer: null, next: null, history: [], menuReturn: "set" };
  $("guided").classList.add("show");
  document.body.style.overflow = "hidden";
  renderGuided();
}

function closeGuidedOverlay() {
  if (guided && guided.timer) clearInterval(guided.timer);
  guided = null;
  $("guided").classList.remove("show");
  $("guided").innerHTML = "";
  document.body.style.overflow = "";
}

// Chiusura con ✕ → mette in pausa e salva (riprendibile)
function pauseGuided() {
  if (!guided) return;
  if (guided.timer) { clearInterval(guided.timer); guided.timer = null; }
  if (guided.phase === "menu") guided.phase = guided.menuReturn || "set";   // non riaprire sul menù
  saveGuided();
  closeGuidedOverlay();
  renderWorkout();
}

function resumeGuided() {
  const snap = loadGuided();
  if (!snap) return;
  guided = Object.assign({ timer: null, history: [], status: {}, menuReturn: "set" }, snap);
  if (guided.phase === "menu") guided.phase = guided.menuReturn || "set";
  currentWorkoutId = guided.workoutId;
  renderWorkoutChips();
  $("guided").classList.add("show");
  document.body.style.overflow = "hidden";
  renderGuided();
}

function discardGuided() {
  const snap = loadGuided();
  const w = snap ? getWorkout(snap.workoutId) : null;
  $("modal-title").textContent = "Terminare l'allenamento?";
  $("modal-body").innerHTML = `
    <p class="modal-q">Sei sicuro di voler terminare l'allenamento in pausa${w ? ` (${w.emoji} ${w.name})` : ''}? I dati di questa sessione non ancora salvati andranno persi.</p>
    <div class="confirm-row">
      <button class="confirm-cancel" onclick="closeModal(); resumeGuided()">No, riprendi</button>
      <button class="confirm-danger" onclick="doDiscardGuided()">Sì, termina</button>
    </div>`;
  $("modal").classList.add("show");
}

function doDiscardGuided() {
  clearGuided();
  closeModal();
  renderWorkout();
}

function renderGuidedResume() {
  const el = $("guided-resume");
  if (!el) return;
  const snap = loadGuided();
  if (!snap) { el.innerHTML = ""; return; }
  const w = getWorkout(snap.workoutId);
  el.innerHTML = `
    <div class="resume-bar">
      <div class="resume-info">⏸️ Allenamento in pausa
        <span>${w ? w.emoji + ' ' + w.name : ''} · esercizio ${snap.exIndex + 1}/${snap.keys.length}</span>
      </div>
      <button class="resume-btn" onclick="resumeGuided()">Riprendi ▶︎</button>
      <button class="resume-x" onclick="discardGuided()" title="Elimina">✕</button>
    </div>`;
}

function gStore(key) { if (!guided.data[key]) guided.data[key] = { sets: [], quality: null }; return guided.data[key]; }

// Box "Occhio a" con i punti tecnici del PT
function cuesHTML(key) {
  const c = (typeof EXERCISE_CUES !== "undefined" && EXERCISE_CUES[key]) || [];
  if (!c.length) return "";
  return `<div class="g-cues">
    <div class="g-cues-h">👁️ Occhio a…</div>
    <ul>${c.map(x => `<li>${x}</li>`).join("")}</ul>
  </div>`;
}

function renderGuided() {
  const meta = gMeta(), key = gKey();
  const N = guided.keys.length;
  const totalSets = meta.sets;
  const done = Object.values(guided.status || {}).filter(s => s === "done").length;
  const pct = Math.round((done / N) * 100);
  const canBack = (guided.history || []).length > 0;
  const top = `
    <div class="g-top">
      <button class="g-close" onclick="pauseGuided()" title="Metti in pausa">✕</button>
      <button class="g-back" onclick="guidedBack()" ${canBack ? '' : 'style="visibility:hidden"'} title="Indietro">‹</button>
      <div class="g-prog">${done}/${N} completati</div>
      ${guided.phase !== "menu" ? `<button class="g-menu-btn" onclick="openMenu()" title="Esercizi">☰</button>` : ''}
    </div>
    <div class="g-bar"><div class="g-bar-fill" style="width:${pct}%"></div></div>`;

  let body = "";
  if (guided.phase === "menu") {
    body = `
      <div class="g-body g-menu">
        <div class="g-menu-h">Esercizi · tocca per andarci</div>
        <div class="g-menu-list">
          ${guided.keys.map((k, idx) => {
            const st = guided.status[k], cur = idx === guided.exIndex;
            const ic = st === "done" ? "✓" : cur ? "●" : st === "skipped" ? "↪" : "○";
            const cls = st === "done" ? "gm-done" : cur ? "gm-cur" : st === "skipped" ? "gm-skip" : "gm-todo";
            const logged = (guided.data[k] && guided.data[k].sets.length) || 0;
            const sub = st === "done" ? "fatto" : st === "skipped" ? "saltato — da riprendere" : cur ? "in corso" : (logged ? logged + " serie fatte" : "da fare");
            return `<button class="g-menu-row ${cls}" onclick="jumpTo(${idx})">
              <span class="gm-ic">${ic}</span>
              <span class="gm-name">${EXERCISES[k].name}</span>
              <span class="gm-sub">${sub}</span>
            </button>`;
          }).join("")}
        </div>
        <button class="g-finish" onclick="finishGuided()">✅ Termina e salva ora</button>
        <button class="g-skip" onclick="closeMenu()">Continua l'allenamento</button>
      </div>`;
  } else if (guided.phase === "nextex") {
    const nkey = guided.keys[guided.next.exIndex];
    const nmeta = EXERCISES[nkey];
    const motto = G_MOTTOS[guided.exIndex % G_MOTTOS.length];
    const [badgeClass, badgeLabel] = badgeMap[nmeta.type];
    body = `
      <div class="g-body">
        <div class="g-trans-lbl">Prossimo esercizio</div>
        <img class="g-gif" src="assets/gifs/${nkey}.gif" onerror="this.style.display='none'">
        <div class="g-name">${nmeta.name}</div>
        <div class="g-muscle">${nmeta.muscle} · <span class="g-eq">${badgeLabel}</span></div>
        <div class="g-motto">${motto}</div>
        <button class="g-done" onclick="guidedAdvance()">Vai → ${nmeta.name}</button>
      </div>`;
  } else if (guided.phase === "quality") {
    body = `
      <div class="g-body">
        <div class="g-qname">${meta.name}</div>
        <div class="g-qq">Com'è andata?</div>
        <div class="g-qcol">
          <button class="gq gq-clean" onclick="guidedQuality('clean')">
            <span class="gq-ico">${Q_ICON.clean}</span>
            <span class="gq-txt"><b>Pulito</b><small>Controllo totale, posso spingere</small></span>
          </button>
          <button class="gq gq-hard" onclick="guidedQuality('hard')">
            <span class="gq-ico">${Q_ICON.hard}</span>
            <span class="gq-txt"><b>Tosta</b><small>Completata ma a fatica</small></span>
          </button>
          <button class="gq gq-fail" onclick="guidedQuality('fail')">
            <span class="gq-ico">${Q_ICON.fail}</span>
            <span class="gq-txt"><b>Non finita</b><small>Forma persa o reps saltate</small></span>
          </button>
        </div>
      </div>`;
  } else if (guided.phase === "finish") {
    const nEx = Object.keys(guided.data).filter(k => guided.data[k].sets.length).length;
    body = `
      <div class="g-body">
        <div class="g-trans-lbl">Allenamento completato 🎉</div>
        <div class="g-name">Grande lavoro!</div>
        <div class="g-muscle">${nEx} esercizi registrati · due dati opzionali e chiudiamo</div>
        <div class="g-inputs" style="margin-top:18px">
          <div class="g-ig"><div class="g-ilbl">Durata (min)</div><input id="g-f-dur" type="number" inputmode="numeric" min="0" max="300" placeholder="—"></div>
          <div class="g-ix">·</div>
          <div class="g-ig"><div class="g-ilbl">Calorie</div><input id="g-f-cal" type="number" inputmode="numeric" min="0" max="3000" placeholder="—"></div>
        </div>
        <textarea class="g-notes" id="g-f-notes" placeholder="📝 Note sessione: energia, dolori, come ti sei sentito… (opzionale)"></textarea>
        <button class="g-done" onclick="guidedCommit()">💾 Salva sessione</button>
      </div>`;
  } else if (meta.time) {
    // plank: hold a tempo
    body = `
      <div class="g-body">
        <img class="g-gif" src="assets/gifs/${key}.gif" onerror="this.style.display='none'">
        <div class="g-name">${meta.name}</div>
        <div class="g-muscle">${meta.muscle}</div>
        ${cuesHTML(key)}
        <div class="g-rest-time" id="g-hold">${parseInt(meta.time) || 30}"</div>
        <button class="g-done" id="g-holdbtn" onclick="guidedHold()">▶︎ Avvia ${parseInt(meta.time) || 30}"</button>
        <button class="g-skip" onclick="skipCurrent()">⤼ Salta — riprendi dopo</button>
      </div>`;
  } else {
    // set con peso × reps
    const sug = suggestion(key);
    const dset = guided.data[key] && guided.data[key].sets;
    const prevW = dset && dset.length ? dset[dset.length - 1].w : (sug.targetW != null ? sug.targetW : "");
    const prevR = dset && dset.length ? dset[dset.length - 1].r : (sug.targetReps != null ? sug.targetReps : "");
    body = `
      <div class="g-body">
        <img class="g-gif" src="assets/gifs/${key}.gif" onerror="this.style.display='none'">
        <div class="g-name">${meta.name}</div>
        <div class="g-muscle">${meta.muscle} · Serie ${Math.min(guided.setIndex + 1, totalSets)}/${totalSets}</div>
        ${guided.setIndex === 0 ? `<div class="g-mot">${guidedMotivation(key)}</div>` : `<div class="g-sugg sugg-${sug.color}"><span class="sugg-label">Oggi:</span> ${sug.todayHtml}</div>`}
        ${cuesHTML(key)}
        <div class="g-inputs">
          <div class="g-ig"><div class="g-ilbl">Peso (kg)</div>
            <div class="g-step"><button class="g-pm" onclick="gStep('g-w',-2.5)">−</button><input id="g-w" type="number" inputmode="decimal" value="${prevW}" min="0" max="500" step="2.5"><button class="g-pm" onclick="gStep('g-w',2.5)">＋</button></div>
          </div>
          <div class="g-ix">×</div>
          <div class="g-ig"><div class="g-ilbl">Ripetizioni</div>
            <div class="g-step"><button class="g-pm" onclick="gStep('g-r',-1)">−</button><input id="g-r" type="number" inputmode="numeric" value="${prevR}" min="0" max="50"><button class="g-pm" onclick="gStep('g-r',1)">＋</button></div>
          </div>
        </div>
        <button class="g-done" onclick="guidedCompleteSet()">✓ Serie completata</button>
        <button class="g-skip" onclick="skipCurrent()">⤼ Salta — macchina occupata</button>
      </div>`;
  }
  $("guided").innerHTML = top + body;
  saveGuided();
}

function gStep(id, delta) {
  const e = $(id);
  const v = parseFloat(String(e.value).replace(",", ".")) || 0;
  e.value = Math.max(0, Math.round((v + delta) * 10) / 10);
}

function guidedCompleteSet() {
  const meta = gMeta(), key = gKey();
  if (!meta.time) {
    const wv = parseFloat($("g-w").value);
    const rv = parseInt($("g-r").value);
    if (isNaN(wv) || wv <= 0) { toast("Inserisci il peso della serie"); return; }
    gPush();
    gStore(key).sets.push({ w: wv, r: isNaN(rv) ? meta.reps : rv });
  } else {
    gPush();
  }
  if (guided.setIndex < meta.sets - 1) {
    guided.setIndex++;            // serie successiva, senza recupero (lo gestisci tu sull'Apple Watch)
    guided.phase = "set";
    renderGuided();
  } else if (!meta.time) {
    guided.phase = "quality";
    renderGuided();
  } else {
    goNextExercise();
  }
}

function guidedHold() {
  const btn = $("g-holdbtn"), el = $("g-hold");
  if (guided.timer) return;
  let rem = parseInt(gMeta().time) || 30;
  btn.textContent = "In corso...";
  guided.timer = setInterval(() => {
    rem--;
    if (rem <= 0) { clearInterval(guided.timer); guided.timer = null; guidedCompleteSet(); }
    else el.textContent = rem + '"';
  }, 1000);
}

function guidedQuality(q) {
  gPush();
  gStore(gKey()).quality = q;
  goNextExercise();
}

// indice del prossimo esercizio NON ancora completato (escluso quello corrente)
function nextPendingIndex(from) {
  const n = guided.keys.length;
  for (let i = 1; i < n; i++) {
    const idx = (from + i) % n;
    if (guided.status[guided.keys[idx]] !== "done") return idx;
  }
  return -1;
}
// da quale serie ripartire per un esercizio (continua se già iniziato)
function resumeSet(key) {
  const len = (guided.data[key] && guided.data[key].sets.length) || 0;
  return Math.min(len, EXERCISES[key].sets - 1);
}

function goNextExercise() {
  guided.status[gKey()] = "done";
  const ni = nextPendingIndex(guided.exIndex);
  if (ni < 0) { finishGuided(); return; }   // tutti completati
  guided.next = { exIndex: ni, setIndex: resumeSet(guided.keys[ni]) };
  guided.phase = "nextex";
  renderGuided();
}

// Salta l'esercizio corrente (macchina occupata) → vai al prossimo da fare, lo riprendi dopo
function skipCurrent() {
  const ni = nextPendingIndex(guided.exIndex);
  if (ni < 0) { toast("È l'ultimo esercizio rimasto 💪"); return; }
  gPush();
  guided.status[gKey()] = "skipped";
  guided.exIndex = ni;
  guided.setIndex = resumeSet(gKey());
  guided.phase = "set";
  renderGuided();
}

// Menù esercizi: salta a uno qualsiasi (anche per riprenderne uno saltato)
function openMenu() { guided.menuReturn = guided.phase; guided.phase = "menu"; renderGuided(); }
function closeMenu() { guided.phase = guided.menuReturn || "set"; renderGuided(); }
function jumpTo(idx) {
  guided.exIndex = idx;
  guided.setIndex = resumeSet(guided.keys[idx]);
  guided.phase = "set";
  renderGuided();
}

function applyNext() {
  guided.exIndex = guided.next.exIndex;
  guided.setIndex = guided.next.setIndex;
  guided.phase = "set";
  renderGuided();
}
function guidedAdvance() { gPush(); applyNext(); }   // pulsante "Vai →" (annullabile)

// salva lo stato corrente per poter tornare indietro
function gPush() {
  guided.history = guided.history || [];
  guided.history.push(JSON.parse(JSON.stringify({
    exIndex: guided.exIndex, setIndex: guided.setIndex, phase: guided.phase,
    data: guided.data, next: guided.next, status: guided.status
  })));
}
function guidedBack() {
  if (!guided.history || !guided.history.length) return;
  if (guided.timer) { clearInterval(guided.timer); guided.timer = null; }
  Object.assign(guided, guided.history.pop());
  renderGuided();
}

function finishGuided() {
  const any = Object.keys(guided.data).some(k => guided.data[k].sets.length);
  if (!any) { clearGuided(); closeGuidedOverlay(); toast("Allenamento chiuso (nessun dato)"); return; }
  guided.phase = "finish";
  renderGuided();
}

function guidedCommit() {
  const exercises = {};
  Object.keys(guided.data).forEach(k => {
    if (guided.data[k].sets.length) exercises[k] = guided.data[k];
  });
  const duration = parseInt($("g-f-dur").value) || null;
  const calories = parseInt($("g-f-cal").value) || null;
  const notes = $("g-f-notes").value.trim().replace(/[<>]/g, "");
  const wid = guided.workoutId;
  clearGuided();
  closeGuidedOverlay();
  commitSession(wid, exercises, { duration, calories, notes });
}

/* ============================================================
   VISTA CALENDARIO
   ============================================================ */
function renderCalendar() {
  const year = calRef.getFullYear(), month = calRef.getMonth();
  const monthName = calRef.toLocaleDateString("it-IT", { month: "long", year: "numeric" });
  $("cal-month").textContent = monthName.charAt(0).toUpperCase() + monthName.slice(1);

  const first = new Date(year, month, 1);
  const startDay = (first.getDay() + 6) % 7; // lun=0
  const daysInMonth = new Date(year, month + 1, 0).getDate();
  const dows = ["L", "M", "M", "G", "V", "S", "D"];

  let html = dows.map(d => `<div class="cal-dow">${d}</div>`).join("");
  for (let i = 0; i < startDay; i++) html += `<div class="cal-cell empty"></div>`;

  for (let d = 1; d <= daysInMonth; d++) {
    const ds = `${year}-${String(month + 1).padStart(2, "0")}-${String(d).padStart(2, "0")}`;
    const sched = state.schedule[ds];
    const isToday = ds === todayStr();
    const w = sched ? getWorkout(sched.workoutId) : null;
    html += `
      <div class="cal-cell ${isToday ? 'today' : ''} ${sched ? 'has' : ''}" onclick="openDay('${ds}')">
        <span class="cal-num">${d}</span>
        ${w ? `<span class="cal-dot" style="background:${sched.done ? '#10B981' : '#9CA3AF'};color:${sched.done ? '#fff' : '#1a1a1a'}">${sched.done ? '✓' : (sched.pt ? '🧑‍🏫' : w.emoji)}</span>` : ''}
      </div>`;
  }
  $("cal-grid").innerHTML = html;

  // prossimi allenamenti programmati
  const limit = new Date(); limit.setDate(limit.getDate() + 21);
  const limitStr = localDate(limit);
  const upcoming = Object.entries(state.schedule)
    .filter(([d]) => d >= todayStr() && d <= limitStr)
    .sort((a, b) => a[0].localeCompare(b[0]));
  const baseIdx = ptNextIndex();
  let ptCounter = 0;
  $("cal-upcoming").innerHTML = upcoming.length
    ? upcoming.map(([d, s]) => {
        const w = getWorkout(s.workoutId);
        const isPT = !!(s.pt || (w && w.pt));
        let nameHtml;
        if (isPT) {
          const moveIdx = (baseIdx + ptCounter) % PT_SEQUENCE.length; ptCounter++;
          nameHtml = `🧑‍🏫 PT — <b class="pt-next">${PT_SHORT[PT_SEQUENCE[moveIdx]]}</b>`;
        } else {
          nameHtml = `${w.emoji} ${w.name}`;
        }
        return `<div class="up-row">
          <span class="up-dot" style="background:${isPT ? '#A855F7' : w.color}"></span>
          <span class="up-date">${fmtShort(d)}</span>
          <span class="up-name">${nameHtml}${(!isPT && s.note) ? ` <span class="up-note">· ${s.note}</span>` : ''}</span>
          <span class="up-status">${s.done ? '✓ fatto' : 'programmato'}</span>
        </div>`;
      }).join("")
    : `<div class="empty-mini">Nessun allenamento programmato. Tocca un giorno per aggiungerlo.</div>`;
}

function calNav(delta) { calRef.setMonth(calRef.getMonth() + delta); renderCalendar(); }

function openDay(ds) {
  const d = new Date(ds + "T00:00:00").toLocaleDateString("it-IT", { weekday: "long", day: "numeric", month: "long" });
  $("modal-title").textContent = d.charAt(0).toUpperCase() + d.slice(1);

  // Se quel giorno è stato fatto un allenamento → mostra i dettagli, non il selettore
  const session = state.sessions.find(s => s.date === ds);
  if (session) {
    $("modal-body").innerHTML = sessionDetailHTML(session);
  } else {
    const sched = state.schedule[ds];
    $("modal-body").innerHTML = `
      <p class="modal-q">Quale scheda vuoi programmare?</p>
      <div class="modal-opts">
        ${SCHEDULABLE().map(w => `
          <button class="modal-opt ${sched && sched.workoutId === w.id ? 'sel' : ''}"
                  style="border-color:${w.color}" onclick="assignDay('${ds}','${w.id}')">
            <span class="modal-opt-emoji">${w.emoji}</span>
            <span>${w.name}</span>
          </button>`).join("")}
      </div>
      ${sched ? `<button class="modal-clear" onclick="clearDay('${ds}')">🗑 Rimuovi programmazione</button>` : ''}`;
  }
  $("modal").classList.add("show");
}

function sessionDetailHTML(s) {
  const w = getWorkout(s.workoutId);
  const sched = state.schedule[s.date];
  const meta = [
    s.duration ? `⏱ ${s.duration} min` : null,
    s.calories ? `🔥 ${s.calories} kcal` : null,
    `🏋️ ${Math.round(sessionVolume(s))} kg di volume`
  ].filter(Boolean);

  const rows = Object.keys(s.exercises || {})
    .map(k => {
      const sets = s.exercises[k].sets;
      const q = s.exercises[k].quality;
      const qIcon = q === 'clean' ? '✅' : q === 'hard' ? '⚠️' : q === 'fail' ? '❌' : '';
      const pr = bestPR(k);
      const max = Math.max(...sets.map(x => x.w));
      const isPr = max >= pr && pr > 0;
      return `<div class="sd-row">
        <span class="sd-name">${EXERCISES[k] ? EXERCISES[k].name : k}${isPr ? ' 🏆' : ''} ${qIcon}</span>
        <span class="sd-sets">${sets.map(x => `${x.w}×${x.r}`).join(' · ')}</span>
      </div>`;
    }).join("");

  return `
    <div class="sd-head" style="background:${w ? w.color : '#999'}">
      <div class="sd-title">${w ? w.emoji + ' ' + w.name : 'Sessione'} ✓</div>
      ${sched && sched.note ? `<div class="sd-note">${sched.note}</div>` : ''}
    </div>
    <div class="sd-meta">${meta.join(' &nbsp;·&nbsp; ')}</div>
    <div class="sd-list">${rows || '<div class="empty-mini">Nessun peso registrato.</div>'}</div>
    ${s.notes ? `<div class="sd-notes">📝 ${s.notes}</div>` : ''}
    <button class="btn-save" style="margin-top:14px" onclick="closeModal();openRecap(${s.id})">📸 Riepilogo da salvare</button>
    <button class="modal-clear" onclick="deleteSession(${s.id})">🗑 Elimina questa sessione</button>`;
}

function deleteSession(id) {
  const sess = state.sessions.find(x => x.id === id);
  if (!sess) return;
  const schedEntry = state.schedule[sess.date];
  state.sessions = state.sessions.filter(x => x.id !== id);
  if (schedEntry && schedEntry.done && !state.sessions.some(x => x.date === sess.date)) {
    state.schedule[sess.date] = Object.assign({}, schedEntry, { done: false });
  }
  saveState(state); closeModal(); renderCalendar();
  toastUndo("🗑 Sessione del " + fmtShort(sess.date) + " eliminata.", () => {
    state.sessions.push(sess);
    state.sessions.sort((a, b) => a.date.localeCompare(b.date));
    if (schedEntry) state.schedule[sess.date] = schedEntry;
    saveState(state); renderCalendar();
  });
}

function assignDay(ds, workoutId) {
  const prev = state.schedule[ds];
  const w = getWorkout(workoutId);
  state.schedule[ds] = { workoutId, done: prev ? prev.done : false };
  if (w && w.pt) state.schedule[ds].pt = true;
  if (prev && prev.note) state.schedule[ds].note = prev.note;
  saveState(state);
  closeModal();
  renderCalendar();
}

function clearDay(ds) {
  delete state.schedule[ds];
  saveState(state);
  closeModal();
  renderCalendar();
}

function closeModal() { $("modal").classList.remove("show"); }

/* ============================================================
   VISTA PROGRESSI
   ============================================================ */
function renderProgress() {
  if (window.renderCrewCard) window.renderCrewCard();
  const s = state.sessions;
  // stat cards
  const weekAgo = localDate(new Date(Date.now() - 7 * 864e5));
  const thisWeek = s.filter(x => x.date >= weekAgo).length;
  let prCount = 0;
  const allKeys = new Set(); s.forEach(x => Object.keys(x.exercises || {}).forEach(k => allKeys.add(k)));
  allKeys.forEach(k => { if (bestPR(k) > 0) prCount++; });

  $("stat-sessions").textContent = s.length;
  $("stat-week").textContent = thisWeek;
  $("stat-pr").textContent = prCount;
  $("stat-streak").textContent = weekStreak();

  // popola select esercizi (solo quelli loggati)
  const sel = $("ex-select");
  const loggedKeys = [...allKeys];
  sel.innerHTML = loggedKeys.length
    ? loggedKeys.map(k => `<option value="${k}">${EXERCISES[k].name}</option>`).join("")
    : `<option value="">Nessun dato ancora</option>`;

  renderVolumeChart();
  renderExChart();
  renderRadar();
  renderPT();
  if (typeof renderWrappedCard === "function") renderWrappedCard();
  renderHistory();
}

/* ---------- SUPER ESERCIZI (PT con Denis) ---------- */
const PT_MOVES = [
  { key: "panca",  lbl: "Panca",  color: "#FF2D95" },
  { key: "squat",  lbl: "Squat",  color: "#5B8DEF" },
  { key: "stacco", lbl: "Stacco", color: "#F59E0B" }
];

// Rotazione delle sedute con Denis: panca → stacco → squat → panca …
const PT_SEQUENCE = ["panca", "stacco", "squat"];
const PT_SHORT = { panca: "Panca", stacco: "Stacco", squat: "Squat" };

// Indice del prossimo esercizio in base all'ultimo registrato con Denis
function ptNextIndex() {
  const lifts = [...(state.ptLifts || [])].sort((a, b) => a.date.localeCompare(b.date));
  if (!lifts.length) return 0;                 // mai fatto → si parte dalla Panca
  const last = lifts[lifts.length - 1];
  let lastIdx = -1;
  PT_SEQUENCE.forEach((k, i) => { if (last[k] != null) lastIdx = i; });
  if (lastIdx < 0) return 0;
  return (lastIdx + 1) % PT_SEQUENCE.length;
}

/* ---------- STANDARD DI FORZA (scala Novizio → Élite) ----------
   Soglie classiche in multipli del peso corporeo (riferite all'1RM;
   sui carichi di lavoro sono una stima prudente). */
const STRENGTH_STD = {
  M: { panca: [0.50, 0.75, 1.00, 1.50, 2.00], squat: [0.75, 1.00, 1.50, 2.00, 2.50], stacco: [1.00, 1.25, 1.75, 2.25, 2.75] },
  F: { panca: [0.35, 0.50, 0.75, 1.00, 1.40], squat: [0.50, 0.75, 1.00, 1.50, 2.00], stacco: [0.60, 1.00, 1.25, 1.75, 2.25] }
};
const STRENGTH_LVLS = ["Novizio", "Principiante", "Intermedio", "Avanzato", "Élite"];

function strengthLevel(lift, kg, bw, sex) {
  const table = (STRENGTH_STD[sex === "F" ? "F" : "M"] || STRENGTH_STD.M)[lift];
  if (!table || !kg || !bw) return null;
  const ratio = kg / bw;
  let idx = -1;
  table.forEach((t, i) => { if (ratio >= t) idx = i; });
  const levelName = idx < 0 ? "Prime armi" : STRENGTH_LVLS[idx];
  let next = null, pct = 100;
  if (idx < table.length - 1) {
    const lo = idx < 0 ? 0 : table[idx];
    const hi = table[idx + 1];
    const nextKg = Math.ceil((hi * bw) / 2.5) * 2.5;
    next = { name: STRENGTH_LVLS[idx + 1], kg: nextKg, missing: +(nextKg - kg).toFixed(1) };
    pct = Math.max(4, Math.min(100, Math.round(((ratio - lo) / (hi - lo)) * 100)));
  }
  return { levelName, idx, next, pct, ratio: +ratio.toFixed(2) };
}

function strengthLadderHTML() {
  const bw = currentBW();
  if (!bw) return "";
  const sex = (state.profile && state.profile.sex) || "M";
  const lifts = [...(state.ptLifts || [])].sort((a, b) => a.date.localeCompare(b.date));
  if (!lifts.length) return "";
  const rows = PT_MOVES.map(m => {
    let kg = null;
    lifts.forEach(l => { if (l[m.key] != null) kg = l[m.key]; });   // ultimo valore registrato
    if (kg == null) return "";
    const lv = strengthLevel(m.key, kg, bw, sex);
    if (!lv) return "";
    return `<div class="sl-row">
      <span class="sl-lift" style="color:${m.color}">${m.lbl}</span>
      <span class="sl-badge sl-l${Math.max(0, lv.idx)}">${lv.levelName}</span>
      <div class="sl-bar"><div class="sl-fill" style="width:${lv.pct}%;background:${m.color}"></div></div>
      <span class="sl-next">${lv.next ? `${lv.next.name} a ${lv.next.kg} kg <b>(−${lv.next.missing})</b>` : "🏆 vetta raggiunta"}</span>
    </div>`;
  }).join("");
  if (!rows) return "";
  return `<div class="sl-wrap">
    <div class="sl-head">🏅 Scala di forza <span class="sl-sub">rispetto al tuo peso (${bw} kg)</span></div>
    ${rows}
  </div>`;
}

function renderPT() {
  const card = $("pt-card");
  if (!card) return;
  const lifts = [...(state.ptLifts || [])].sort((a, b) => a.date.localeCompare(b.date));
  card.innerHTML = `
    <div class="chart-title">🏋️ Super esercizi (PT)</div>
    <div class="chart-sub">Panca · Squat · Stacco — registra i kg (data di oggi automatica)</div>
    <div class="pt-form">
      <div class="pt-inputs">
        ${PT_MOVES.map(m => `<div class="pt-field"><label>${m.lbl} (kg)</label><input type="number" id="pt-${m.key}" inputmode="decimal" step="0.5" min="0" placeholder="—"></div>`).join("")}
      </div>
      <button class="btn-save" onclick="savePTLift()">💪 Registra seduta PT</button>
    </div>
    ${lifts.length ? '<div class="chart-hint">Tocca un punto del grafico per vedere o cancellare la seduta.</div><canvas id="pt-chart" height="150"></canvas>' : '<div class="empty-mini">Nessuna seduta PT registrata. Inserisci i kg dopo una seduta col tuo PT.</div>'}
    ${strengthLadderHTML()}
    <div class="pt-detail" id="pt-detail"></div>`;
  if (lifts.length) drawPTChart(lifts);
}

function showPTDetail(l) {
  const el = $("pt-detail");
  if (!el || !l) return;
  el.innerHTML = ptRowHTML(l);
}

function ptRowHTML(l) {
  const parts = PT_MOVES.filter(m => l[m.key] != null).map(m => `${m.lbl} <b>${l[m.key]}</b>`);
  return `<div class="pt-row">
    <span class="pt-row-date">${fmtShort(l.date)}</span>
    <span class="pt-row-vals">${parts.length ? parts.join(" · ") + " kg" : "—"}</span>
    <button class="pt-del" onclick="deletePTLift('${l.date}')">✕</button>
  </div>`;
}

// Numeri romani per l'asse "volte" del grafico PT
function roman(n) {
  const T = [[10, "X"], [9, "IX"], [5, "V"], [4, "IV"], [1, "I"]];
  let r = "";
  T.forEach(([v, s]) => { while (n >= v) { r += s; n -= v; } });
  return r;
}

function drawPTChart(lifts) {
  const cv = $("pt-chart");
  if (!cv) return;
  const ctx = cv.getContext("2d");
  if (charts.pt) charts.pt.destroy();
  // Asse X = numero della volta (I, II, III…), non la data: le sedute sono
  // a rotazione e sull'asse temporale il grafico si dilaterebbe troppo.
  // Ogni linea è indicizzata sulle SUE occorrenze.
  const perMove = {};
  PT_MOVES.forEach(m => { perMove[m.key] = lifts.filter(l => l[m.key] != null); });
  const maxN = Math.max(...PT_MOVES.map(m => perMove[m.key].length), 1);
  charts.pt = new Chart(ctx, {
    type: "line",
    data: {
      labels: Array.from({ length: maxN }, (_, i) => roman(i + 1)),
      datasets: PT_MOVES.map(m => ({
        label: m.lbl,
        data: Array.from({ length: maxN }, (_, i) => perMove[m.key][i] ? perMove[m.key][i][m.key] : null),
        borderColor: m.color,
        backgroundColor: m.color,
        tension: .3,
        spanGaps: true,
        pointRadius: 3,
        borderWidth: 2
      }))
    },
    options: {
      onClick: (evt) => {
        const hit = charts.pt.getElementsAtEventForMode(evt, "nearest", { intersect: false }, true);
        if (!hit.length) return;
        const l = perMove[PT_MOVES[hit[0].datasetIndex].key][hit[0].index];
        if (l) showPTDetail(l);
      },
      plugins: { legend: { display: true, labels: { boxWidth: 12, font: { size: 11 } } } },
      scales: { y: { beginAtZero: false, grid: { color: "rgba(255,255,255,.08)" }, ticks: { callback: v => v + " kg" } }, x: { grid: { display: false } } },
      responsive: true
    }
  });
}

// prefix: "pt-" dal card Progressi, "ptw-" dalla tab PT in Allena
function savePTLift(prefix) {
  prefix = prefix || "pt-";
  const date = todayStr();
  const num = (id) => { const v = parseFloat($(id).value); return isNaN(v) ? null : v; };
  const vals = {}; PT_MOVES.forEach(m => vals[m.key] = num(prefix + m.key));
  if (PT_MOVES.every(m => vals[m.key] == null)) { toast("Inserisci almeno un valore"); return; }
  state.ptLifts = state.ptLifts || [];
  const ex = state.ptLifts.find(l => l.date === date);
  if (ex) {
    PT_MOVES.forEach(m => { if (vals[m.key] != null) ex[m.key] = vals[m.key]; });
  } else {
    state.ptLifts.push(Object.assign({ date }, vals));
  }
  // se oggi era in calendario col PT, la seduta è fatta
  if (state.schedule[date] && state.schedule[date].pt) state.schedule[date].done = true;
  saveState(state);
  if (prefix === "ptw-") { renderWorkoutChips(); renderWorkout(); }
  else renderPT();
  toast("💪 Seduta PT registrata");
}

function deletePTLift(date) {
  const removed = (state.ptLifts || []).find(l => l.date === date);
  state.ptLifts = (state.ptLifts || []).filter(l => l.date !== date);
  saveState(state); renderPT();
  toastUndo("🗑 Seduta PT eliminata.", () => {
    if (removed) { state.ptLifts.push(removed); state.ptLifts.sort((a, b) => a.date.localeCompare(b.date)); }
    saveState(state); renderPT();
  });
}

/* ---------- RADAR MUSCOLARE ---------- */
const MUSCLE_GROUPS = [
  ["legs", "Gambe"], ["chest", "Petto"], ["back", "Schiena"],
  ["shoulders", "Spalle"], ["arms", "Braccia"], ["core", "Core"]
];

// % di serie per gruppo muscolare negli ultimi `days` giorni (funzione pura)
function muscleCoverage(days) {
  const cutoff = localDate(new Date(Date.now() - (days || 30) * 864e5));
  const count = {}; let total = 0;
  state.sessions.filter(x => x.date >= cutoff).forEach(x => {
    Object.keys(x.exercises || {}).forEach(k => {
      const meta = EXERCISES[k];
      if (!meta || !meta.bodyPart) return;
      const n = (x.exercises[k].sets || []).length || 0;
      count[meta.bodyPart] = (count[meta.bodyPart] || 0) + n;
      total += n;
    });
  });
  if (!total) return null;
  const pct = {};
  MUSCLE_GROUPS.forEach(([g]) => { pct[g] = Math.round(((count[g] || 0) / total) * 100); });
  return { pct, total };
}

function radarVerdict(cov) {
  if (!cov) return "";
  const entries = MUSCLE_GROUPS.map(([g, lbl]) => ({ g, lbl, v: cov.pct[g] }));
  const weakest = entries.reduce((m, e) => e.v < m.v ? e : m, entries[0]);
  const strongest = entries.reduce((m, e) => e.v > m.v ? e : m, entries[0]);
  if (weakest.v <= 5) return `🕳️ ${weakest.lbl} quasi assente (${weakest.v}% del lavoro): nessun gruppo cresce da solo. Rimettilo in scheda.`;
  if (strongest.v - weakest.v <= 15) return `✅ Copertura equilibrata: nessun gruppo lasciato indietro. Da manuale.`;
  return `⚖️ Molto ${strongest.lbl.toLowerCase()} (${strongest.v}%), poco ${weakest.lbl.toLowerCase()} (${weakest.v}%): occhio a non diventare asimmetrico.`;
}

function renderRadar() {
  const host = $("radar-card");
  if (!host) return;
  const cov = muscleCoverage(30);
  if (charts.radar) { charts.radar.destroy(); charts.radar = null; }
  if (!cov) { host.innerHTML = ""; host.style.display = "none"; return; }
  host.style.display = "";
  host.innerHTML = `
    <div class="chart-title">🕸️ Radar muscolare</div>
    <div class="chart-sub">Come hai distribuito le serie negli ultimi 30 giorni</div>
    <div class="radar-wrap"><canvas id="radar-chart"></canvas></div>
    <div class="ex-verdict">${radarVerdict(cov)}</div>`;
  charts.radar = new Chart($("radar-chart").getContext("2d"), {
    type: "radar",
    data: {
      labels: MUSCLE_GROUPS.map(([, lbl]) => lbl),
      datasets: [{
        data: MUSCLE_GROUPS.map(([g]) => cov.pct[g]),
        backgroundColor: "rgba(255,45,149,.22)",
        borderColor: "#FF2D95",
        borderWidth: 2,
        pointBackgroundColor: "#FF2D95",
        pointRadius: 3
      }]
    },
    options: {
      plugins: {
        legend: { display: false },
        tooltip: { callbacks: { label: (i) => i.formattedValue + "% delle serie" } }
      },
      scales: { r: {
        beginAtZero: true,
        suggestedMax: Math.max(30, ...MUSCLE_GROUPS.map(([g]) => cov.pct[g])),
        grid: { color: "rgba(255,255,255,.10)" },
        angleLines: { color: "rgba(255,255,255,.10)" },
        pointLabels: { color: "rgba(245,240,255,.8)", font: { size: 12, weight: "700" } },
        ticks: { display: false }
      } },
      responsive: true, maintainAspectRatio: false
    }
  });
}

function renderVolumeChart() {
  const s = [...state.sessions].sort((a, b) => a.date.localeCompare(b.date));
  const ctx = $("vol-chart").getContext("2d");
  if (charts.vol) charts.vol.destroy();
  if (!s.length) return;
  const vols = s.map(sessionVolume);
  const trend = linReg(vols);
  charts.vol = new Chart(ctx, {
    type: "bar",
    data: {
      labels: s.map(x => fmtShort(x.date)),
      datasets: [
        { type: "bar", data: vols, backgroundColor: "rgba(255,45,149,.8)", borderRadius: 6, order: 2 },
        ...(trend ? [{ type: "line", label: "Tendenza", data: trend, borderColor: "#FF6B6B", borderWidth: 2, pointRadius: 3, pointBackgroundColor: "#FF6B6B", fill: false, tension: 0, order: 1 }] : [])
      ]
    },
    options: { plugins: { legend: { display: false } }, scales: { y: { beginAtZero: true, grid: { color: "rgba(255,255,255,.08)" } }, x: { grid: { display: false } } }, responsive: true }
  });
}

/* Progressione esercizio: non conta solo il peso, ma COME l'hai fatto.
   Ogni punto = una sessione; il colore è il semaforo di fatica:
   verde = pulite, giallo = dure, rosso = non completate. */
const QUAL_COLOR = { clean: "#10B981", hard: "#F59E0B", fail: "#FF4D6D" };
const QUAL_LABEL = { clean: "✅ Pulite", hard: "⚠️ Dure", fail: "❌ Non completate" };
const QUAL_RANK = { fail: 0, hard: 1, clean: 2 };

function exVerdict(pts) {
  if (pts.length < 2) return "Registra un'altra sessione per vedere la tendenza.";
  const a = pts[pts.length - 2], b = pts[pts.length - 1];
  // contesto sul lungo periodo (3+ sessioni)
  let extra = "";
  if (pts.length >= 3) {
    let cleanRun = 0;
    for (let i = pts.length - 1; i >= 0 && pts[i].q === "clean"; i--) cleanRun++;
    const first = pts[0].v, gain = +(b.v - first).toFixed(1);
    if (cleanRun >= 3) extra = ` Sono ${cleanRun} sessioni pulite di fila: il tuo corpo è pronto per di più.`;
    else if (gain > 0) extra = ` Dal primo giorno sei salito di ${gain} kg su questo esercizio.`;
  }
  const qa = QUAL_RANK[a.q] ?? 1, qb = QUAL_RANK[b.q] ?? 1;
  if (b.v > a.v && qb >= 1) return `📈 Sei salito da ${a.v} a ${b.v} kg reggendo il colpo. Progresso vero.${extra}`;
  if (b.v > a.v && qb === 0) return `⚠️ Peso salito a ${b.v} kg ma non completato: consolida prima di risalire.`;
  if (b.v === a.v && qb > qa) return `📈 Stesso peso (${b.v} kg) ma fatto meglio: è progresso anche questo. Prossimo step: salire.${extra}`;
  if (b.v === a.v && qb === 2) return `💪 ${b.v} kg fatti puliti: sei pronto ad aumentare.${extra}`;
  if (b.v === a.v && qb < qa) return `😮‍💨 Stesso peso ma più fatica dell'altra volta: giornata storta, capita. Riprova uguale.`;
  if (b.v < a.v) return `🔄 Hai scaricato a ${b.v} kg: a volte un passo indietro serve per farne due avanti.`;
  return `Continua così: costanza batte intensità.`;
}

function renderExChart() {
  const k = $("ex-select").value;
  const ctx = $("ex-chart").getContext("2d");
  if (charts.ex) charts.ex.destroy();
  const lbl = $("ex-1rm"), verd = $("ex-verdict");
  if (!k) { if (lbl) lbl.textContent = "—"; if (verd) verd.textContent = ""; return; }
  const pts = [...state.sessions]
    .filter(s => exSets(s, k).length)
    .sort((a, b) => a.date.localeCompare(b.date))
    .map(s => {
      const sets = exSets(s, k);
      const maxW = Math.max(...sets.map(x => x.w));
      const topSet = sets.find(x => x.w === maxW);
      return { d: fmtShort(s.date), v: maxW, sets: sets.length, reps: topSet ? topSet.r : null, q: s.exercises[k].quality };
    });
  if (!pts.length) { if (lbl) lbl.textContent = "—"; if (verd) verd.textContent = ""; return; }
  const vals = pts.map(p => p.v);
  const maxV = Math.max(...vals), minV = Math.min(...vals);
  const maxIdx = vals.lastIndexOf(maxV);
  if (lbl) lbl.textContent = `max ${maxV} kg`;
  if (verd) verd.textContent = exVerdict(pts);
  charts.ex = new Chart(ctx, {
    type: "line",
    data: {
      labels: pts.map(p => p.d),
      datasets: [{
        data: vals,
        borderColor: "rgba(255,255,255,.35)",
        borderWidth: 2,
        pointRadius: pts.map((_, i) => i === maxIdx ? 7 : 5),
        pointBackgroundColor: pts.map(p => QUAL_COLOR[p.q] || "#9CA3AF"),
        pointBorderColor: "rgba(0,0,0,.4)",
        pointBorderWidth: 1,
        fill: false, tension: .3
      }]
    },
    options: {
      layout: { padding: { top: 18 } },
      plugins: {
        legend: { display: false },
        tooltip: {
          callbacks: {
            title: (items) => pts[items[0].dataIndex].d,
            label: (item) => `Peso max: ${pts[item.dataIndex].v} kg`,
            afterLabel: (item) => {
              const p = pts[item.dataIndex];
              return `${QUAL_LABEL[p.q] || "— non valutato"}\nSerie: ${p.sets}${p.reps ? ` × ${p.reps} rip` : ""}`;
            }
          }
        }
      },
      scales: {
        y: { beginAtZero: false, suggestedMin: Math.max(0, minV - 5), grid: { color: "rgba(255,255,255,.08)" } },
        x: { grid: { display: false } }
      },
      responsive: true
    },
    plugins: [{
      id: "prBadge",
      afterDatasetsDraw(chart) {
        const pt = chart.getDatasetMeta(0).data[maxIdx];
        if (!pt) return;
        const c = chart.ctx;
        c.save();
        c.font = "15px -apple-system, sans-serif";
        c.textAlign = "center";
        c.fillText("🏆", pt.x, pt.y - 12);
        c.restore();
      }
    }]
  });
}

/* ============================================================
   VISTA OBIETTIVI
   ============================================================ */
function computeAge(birthday) {
  if (!birthday) return null;
  const b = new Date(birthday + "T00:00:00");
  const now = new Date();
  let age = now.getFullYear() - b.getFullYear();
  const m = now.getMonth() - b.getMonth();
  if (m < 0 || (m === 0 && now.getDate() < b.getDate())) age--;
  return age;
}

const GOAL_LABELS = { massa: "💪 Massa", dimagrimento: "🔥 Dimagrimento", forza: "🏋️ Forza", benessere: "🌿 Benessere" };

function renderProfile() {
  const p = state.profile || {};
  const card = $("profile-card");
  if (!p.name && !p.height && !p.birthday) { card.innerHTML = ""; return; }
  const age = p.age || computeAge(p.birthday);
  const nick = p.nick || p.name || "?";
  const meta = [age != null ? age + " anni" : null, p.height ? p.height + " cm" : null].filter(Boolean).join(" · ");
  const chips = [
    p.goal ? GOAL_LABELS[p.goal] : null,
    p.level ? p.level.charAt(0).toUpperCase() + p.level.slice(1) : null,
    p.daysPerWeek ? p.daysPerWeek + " gg/settimana" : null
  ].filter(Boolean);
  const av = p.avatar;
  const avHTML = av
    ? (av.type === "img"
        ? `<img class="profile-avatar-lg av-img" src="${av.v}" alt="">`
        : `<div class="profile-avatar-lg av-emoji">${av.v}</div>`)
    : `<div class="profile-avatar-lg">${nick.charAt(0).toUpperCase()}</div>`;
  const loggedIn = window.__cloud && window.__cloud.user && window.__cloud.user();
  card.className = "goal-card profile-box";
  card.innerHTML = `
    <div class="profile-row">
      <div class="profile-left">
        <div class="profile-avatar-wrap" onclick="openAvatarPicker()">
          ${avHTML}
          <button class="profile-pencil" onclick="event.stopPropagation();startOnboarding(true)" aria-label="Modifica profilo">✏️</button>
        </div>
        <div class="profile-id">
          <div class="profile-name">${nick}</div>
          ${meta ? `<div class="profile-meta">${meta}</div>` : ""}
        </div>
      </div>
      ${chips.length ? `<div class="profile-chips-col">${chips.map(c => `<span class="profile-chip">${c}</span>`).join("")}</div>` : ""}
    </div>
    ${p.limitations ? `<div class="profile-lim">⚠️ ${p.limitations}</div>` : ""}
    ${loggedIn && !window.DEMO_MODE ? `<button class="profile-logout" onclick="cloudSignOut()">Esci dall'account</button>` : ""}`;
}

/* ---------- AVATAR: galleria o foto propria ----------
   La foto viene ridotta a 128×128 e salvata come base64 nel profilo:
   viaggia col resto dello stato (sync incluso), niente storage extra. */
const AVATAR_SET = ["💪", "🏋️", "🦍", "🐺", "🦁", "🐂", "🦅", "⚡️", "🔥", "🥊", "🤖", "🦖"];

function openAvatarPicker() {
  if (!state.profile) return;
  $("modal-title").textContent = "Immagine profilo";
  $("modal-body").innerHTML = `
    <div class="av-grid">
      ${AVATAR_SET.map(e => `<button class="av-btn" onclick="setAvatarEmoji('${e}')">${e}</button>`).join("")}
    </div>
    <label class="btn-secondary av-upload">📷 Carica una tua foto
      <input type="file" accept="image/*" onchange="avatarFromFile(this)" style="display:none">
    </label>
    <button class="modal-clear" onclick="setAvatarEmoji(null)">Usa l'iniziale del nick</button>`;
  $("modal").classList.add("show");
}

function applyAvatar(av) {
  state.profile.avatar = av;
  saveState(state);
  closeModal();
  renderProfile();
  if (window.cloudRefreshChip) window.cloudRefreshChip();
  toast(av ? "Immagine profilo aggiornata" : "Torno all'iniziale del nick");
}
function setAvatarEmoji(e) { applyAvatar(e ? { type: "emoji", v: e } : null); }

function avatarFromFile(input) {
  const f = input.files && input.files[0];
  if (!f) return;
  const img = new Image();
  img.onload = () => {
    const S = 128, cv = document.createElement("canvas");
    cv.width = S; cv.height = S;
    const side = Math.min(img.width, img.height);   // ritaglio quadrato centrale
    cv.getContext("2d").drawImage(img, (img.width - side) / 2, (img.height - side) / 2, side, side, 0, 0, S, S);
    applyAvatar({ type: "img", v: cv.toDataURL("image/jpeg", 0.82) });
    URL.revokeObjectURL(img.src);
  };
  img.src = URL.createObjectURL(f);
}

function renderGoals() {
  renderProfile();
  renderComposition();
  renderCompChart();
  renderNutrition();
  renderBadges();
}


function renderBadges() {
  const earned = new Set(earnedBadgeIds());
  $("badge-list").innerHTML = BADGES.map(b => {
    const on = earned.has(b.id);
    return `<div class="badge ${on ? 'on' : 'off'}" onclick="showBadge('${b.id}')">
      <span class="badge-i">${on ? b.icon : '🔒'}</span>
      <span class="badge-n">${b.name}</span>
    </div>`;
  }).join("");
}

function showBadge(id) {
  const b = BADGES.find(x => x.id === id);
  if (!b) return;
  const on = b.test();
  $("modal-title").textContent = "Traguardo";
  $("modal-body").innerHTML = `
    <div class="badge-detail">
      <div class="badge-detail-i ${on ? 'on' : 'off'}">${on ? b.icon : '🔒'}</div>
      <div class="badge-detail-n">${b.name}</div>
      <div class="badge-detail-s ${on ? 'ok' : ''}">${on ? '✅ Sbloccato' : '🔒 Ancora da sbloccare'}</div>
      <div class="badge-detail-d">${b.desc}</div>
    </div>
    <button class="btn-save" style="margin-top:16px" onclick="closeModal()">Chiudi</button>`;
  $("modal").classList.add("show");
}

function renderNutrition() {
  const n = nutritionTargets();
  const head = ({
    massa: "Per costruire massa", dimagrimento: "Per dimagrire mantenendo il muscolo",
    forza: "Per crescere di forza", benessere: "Per il tuo benessere"
  })[n.goal] || "I tuoi target";
  const surplus = n.kcal - n.tdee;
  $("nutrition-card").innerHTML = `
    <div class="nutri-head">${head} — peso attuale <strong>${n.bw} kg</strong> (BMR ${n.bmr} kcal):</div>
    <div class="nutri-grid">
      <div class="nutri-cell"><div class="nutri-num" style="color:#FF6B6B">${n.kcal}</div><div class="nutri-lbl">kcal / giorno</div></div>
      <div class="nutri-cell"><div class="nutri-num" style="color:#10B981">${n.protein}g</div><div class="nutri-lbl">Proteine</div></div>
      <div class="nutri-cell"><div class="nutri-num" style="color:#F59E0B">${n.carbs}g</div><div class="nutri-lbl">Carboidrati</div></div>
      <div class="nutri-cell"><div class="nutri-num" style="color:#0EA5E9">${n.fat}g</div><div class="nutri-lbl">Grassi</div></div>
    </div>
    ${n.adaptNote ? `<div class="nutri-adapt">🔄 Adattamento: ${n.adaptNote}.</div>` : ""}
    <div class="nutri-note">Mantenimento stimato ~${n.tdee} kcal (${surplus >= 0 ? "+" : ""}${surplus} kcal rispetto al mantenimento). Questi valori <strong>si aggiornano da soli a ogni pesata</strong> e sono l'obiettivo di default nella sezione Pasti (lì puoi comunque forzarli a mano).</div>`;
}


/* ---------- COMPOSIZIONE CORPOREA ---------- */
const COMP_METRICS = [
  { key: "weight",         lbl: "Peso",           unit: "kg",  color: "#FF2D95", upGood: true },
  { key: "bodyFat",        lbl: "Grasso corp.",   unit: "%",   color: "#FF6B6B", upGood: false },
  { key: "skeletalMuscle", lbl: "Massa musc.",    unit: "kg",  color: "#10B981", upGood: true },
  { key: "boneMass",       lbl: "Massa ossea",    unit: "kg",  color: "#6b7280", upGood: true },
  { key: "bodyWater",      lbl: "Acqua corp.",    unit: "%",   color: "#0EA5E9", upGood: true },
  { key: "bmr",            lbl: "BMR",            unit: "kcal",color: "#F59E0B", upGood: true },
  // misure a nastro (cm): la bilancia può stare ferma mentre il braccio cresce
  { key: "arm",            lbl: "Braccio",        unit: "cm",  color: "#A855F7", upGood: true },
  { key: "chest",          lbl: "Petto",          unit: "cm",  color: "#FF8A5B", upGood: true },
  { key: "waist",          lbl: "Vita",           unit: "cm",  color: "#FFB454", upGood: false },
  { key: "thigh",          lbl: "Coscia",         unit: "cm",  color: "#5B8DEF", upGood: true }
];

function renderComposition() {
  const comp = state.composition || [];
  const grid = $("comp-cards");
  if (!comp.length) {
    $("comp-date").textContent = "";
    grid.innerHTML = `<div class="empty-mini" style="grid-column:1/-1">Nessuna misurazione. Aggiungine una qui sotto.</div>`;
    return;
  }
  const latest = comp[comp.length - 1];
  const prev = comp.length > 1 ? comp[comp.length - 2] : null;
  $("comp-date").textContent = "Ultima misurazione: " + fmtLong(latest.date);
  grid.innerHTML = COMP_METRICS.map(m => {
    const v = latest[m.key];
    if (v == null) return "";
    let delta = "";
    if (prev && prev[m.key] != null) {
      const d = +(v - prev[m.key]).toFixed(2);
      if (d !== 0) {
        const good = (d > 0) === m.upGood;
        delta = `<span class="comp-delta ${good ? 'cd-up' : 'cd-down'}">${d > 0 ? '▲' : '▼'} ${Math.abs(d)}</span>`;
      }
    }
    return `<div class="comp-card">
      <div class="comp-val" style="color:${m.color}">${v}<span class="comp-unit">${m.unit}</span></div>
      <div class="comp-lbl">${m.lbl}</div>${delta}
    </div>`;
  }).join("");
  renderMeasureHistory();
}

/* Storico misurazioni: unisce pesate semplici e misurazioni bilancia,
   una riga per data, eliminabile. */
function measureRows() {
  const dates = new Set();
  (state.bodyweight || []).forEach(b => dates.add(b.date));
  (state.composition || []).forEach(c => dates.add(c.date));
  return [...dates].sort((a, b) => b.localeCompare(a)).map(d => {
    const bw = (state.bodyweight || []).find(b => b.date === d);
    const c = (state.composition || []).find(x => x.date === d);
    const parts = [];
    const w = (c && c.weight != null) ? c.weight : (bw ? bw.v : null);
    if (w != null) parts.push(`<b>${w}</b> kg`);
    if (c && c.bodyFat != null) parts.push(`${c.bodyFat}% grasso`);
    if (c && c.skeletalMuscle != null) parts.push(`${c.skeletalMuscle} kg musc.`);
    return { date: d, txt: parts.join(" · ") || "—" };
  });
}

let measHistOpen = false;
function toggleMeasureHistory() { measHistOpen = !measHistOpen; renderMeasureHistory(); }

function renderMeasureHistory() {
  const host = $("comp-history");
  if (!host) return;
  const rows = measureRows();
  if (!rows.length) { host.innerHTML = ""; return; }
  host.innerHTML = `
    <button class="comp-hist-toggle" onclick="toggleMeasureHistory()">🗂 Storico misurazioni (${rows.length}) ${measHistOpen ? "▴" : "▾"}</button>
    ${measHistOpen ? `<div class="comp-hist-list">${rows.map(r => `
      <div class="pt-row">
        <span class="pt-row-date">${fmtShort(r.date)}</span>
        <span class="pt-row-vals">${r.txt}</span>
        <button class="pt-del" onclick="deleteMeasurement('${r.date}')">✕</button>
      </div>`).join("")}</div>` : ""}`;
}

function deleteMeasurement(date) {
  const bw = (state.bodyweight || []).find(b => b.date === date);
  const c = (state.composition || []).find(x => x.date === date);
  state.bodyweight = (state.bodyweight || []).filter(b => b.date !== date);
  state.composition = (state.composition || []).filter(x => x.date !== date);
  saveState(state); renderGoals();
  toastUndo("🗑 Misurazione del " + fmtShort(date) + " eliminata.", () => {
    if (bw) { state.bodyweight.push(bw); state.bodyweight.sort((a, b) => a.date.localeCompare(b.date)); }
    if (c) { state.composition.push(c); state.composition.sort((a, b) => a.date.localeCompare(b.date)); }
    saveState(state); renderGoals();
  });
}

function renderCompChart() {
  const comp = (state.composition || []).slice().sort((a, b) => a.date.localeCompare(b.date));
  const bwSeries = (state.bodyweight || []).slice().sort((a, b) => a.date.localeCompare(b.date));
  const host = $("comp-trend");
  if (charts.sparks) charts.sparks.forEach(c => c.destroy());
  charts.sparks = [];
  if (!comp.length && !bwSeries.length) {
    host.innerHTML = `<div class="empty-mini">Aggiungi qualche misurazione per vedere il trend.</div>`;
    return;
  }

  /* PESO: usa tutte le pesate (non solo la bilancia smart), mostra la linea
     dell'obiettivo e la proiezione di arrivo al ritmo attuale. */
  const target = state.goals ? state.goals.targetWeight : null;
  const proj = weightProjection();
  let projTxt = "";
  if (target != null && bwSeries.length) {
    const cur = bwSeries[bwSeries.length - 1].v;
    if (cur >= target) projTxt = `👑 Obiettivo ${target} kg raggiunto!`;
    else if (proj && proj.date && proj.date > todayStr()) projTxt = `📈 Al ritmo attuale raggiungi i <b>${target} kg</b> intorno al <b>${fmtLong(proj.date)}</b>.`;
    else projTxt = `⏸ Il peso al momento è fermo: con un ritmo di +0,25 kg/settimana arriveresti a ${target} kg in ~${Math.ceil((target - cur) / 0.25)} settimane.`;
  }

  const start = state.goals ? state.goals.startWeight : null;
  const compSeries = (key) => comp.filter(c => c[key] != null).map(c => ({ d: c.date, v: c[key] }));
  const metrics = [
    { key: "weight", lbl: "Peso", unit: " kg", suffix: "", color: "#FF2D95", upGood: true, series: bwSeries.map(b => ({ d: b.date, v: b.v })), target, start, gear: true },
    { key: "skeletalMuscle", lbl: "Massa muscolare", unit: " kg", suffix: "", color: "#2BD576", upGood: true, series: compSeries("skeletalMuscle") },
    { key: "bodyFat", lbl: "Grasso corporeo", unit: "", suffix: "%", color: "#FFB454", upGood: false, series: compSeries("bodyFat") },
    // misure a nastro: compaiono solo quando inizi a registrarle
    { key: "arm", lbl: "📏 Braccio", unit: " cm", suffix: "", color: "#A855F7", upGood: true, series: compSeries("arm"), optional: true },
    { key: "chest", lbl: "📏 Petto", unit: " cm", suffix: "", color: "#FF8A5B", upGood: true, series: compSeries("chest"), optional: true },
    { key: "waist", lbl: "📏 Vita", unit: " cm", suffix: "", color: "#FFB454", upGood: false, series: compSeries("waist"), optional: true },
    { key: "thigh", lbl: "📏 Coscia", unit: " cm", suffix: "", color: "#5B8DEF", upGood: true, series: compSeries("thigh"), optional: true }
  ].filter(m => !m.optional || m.series.length);

  host.innerHTML = (projTxt ? `<div class="spark-proj" style="margin:0 0 14px">${projTxt}</div>` : "") + metrics.map(m => {
    const vals = m.series.map(p => p.v);
    const latest = vals.length ? vals[vals.length - 1] : null;
    let badge = "";
    if (vals.length >= 2) {
      const d = +(vals[vals.length - 1] - vals[vals.length - 2]).toFixed(2);
      if (d === 0) badge = `<span class="spark-d flat">=</span>`;
      else {
        const good = (d > 0) === m.upGood;
        badge = `<span class="spark-d ${good ? 'up' : 'down'}">${d > 0 ? '▲' : '▼'} ${Math.abs(d)}${m.suffix}</span>`;
      }
    }
    const goalLbl = m.target != null ? ` <span class="spark-target">${m.start != null ? m.start + " → " : ""}${m.target} kg</span>` : "";
    return `<div class="spark-row">
      <div class="spark-head">
        <span class="spark-lbl" style="color:${m.color}">${m.lbl}${goalLbl}</span>
        <span class="spark-val">${latest != null ? latest + m.suffix + m.unit : '—'} ${badge}</span>
      </div>
      <div class="spark-wrap"><canvas id="spark-${m.key}"></canvas></div>
    </div>`;
  }).join("");

  metrics.forEach(m => {
    if (!m.series.length) return;
    const labels = m.series.map(p => fmtShort(p.d));
    const data = m.series.map(p => p.v);
    const mn = Math.min(...data), mx = Math.max(...data);
    const pad = Math.max((mx - mn) * 0.6, Math.abs(mn) * 0.004, 0.25);
    const datasets = [{ data, borderColor: m.color, backgroundColor: m.color + "22", pointRadius: 3, pointBackgroundColor: m.color, borderWidth: 2.5, tension: .3, fill: true, spanGaps: true }];
    charts.sparks.push(new Chart($("spark-" + m.key).getContext("2d"), {
      type: "line",
      data: { labels, datasets },
      options: {
        plugins: { legend: { display: false } },
        scales: { y: { min: mn - pad, max: mx + pad, display: false }, x: { display: false } },
        responsive: true, maintainAspectRatio: false
      }
    }));
  });
}


function toggleCompForm() {
  const f = $("comp-form");
  f.style.display = f.style.display === "none" ? "block" : "none";
}

function saveComposition() {
  const num = (id) => { const e = $(id); if (!e) return null; const v = parseFloat(String(e.value).replace(",", ".")); return isNaN(v) ? null : v; };
  const entry = {
    date: todayStr(),
    weight: num("c-weight"),
    bodyFat: num("c-fat"),
    skeletalMuscle: num("c-muscle"),
    boneMass: num("c-bone"),
    bodyWater: num("c-water"),
    bmr: num("c-bmr"),
    metabolicAge: num("c-metage"),
    arm: num("c-arm"),
    chest: num("c-chest"),
    waist: num("c-waist"),
    thigh: num("c-thigh")
  };
  const hasData = Object.keys(entry).some(k => k !== "date" && entry[k] != null);
  if (!hasData) { toast("Inserisci almeno un valore"); return; }

  const existing = state.composition.find(c => c.date === entry.date);
  if (existing) Object.assign(existing, entry);
  else state.composition.push(entry);
  state.composition.sort((a, b) => a.date.localeCompare(b.date));

  // se è stato inserito il peso, aggiornalo anche nel tracciamento peso corporeo
  if (entry.weight != null) {
    const bw = state.bodyweight.find(b => b.date === entry.date);
    if (bw) bw.v = entry.weight;
    else state.bodyweight.push({ date: entry.date, v: entry.weight });
    state.bodyweight.sort((a, b) => a.date.localeCompare(b.date));
  }
  saveState(state);
  ["c-weight", "c-fat", "c-muscle", "c-bone", "c-water", "c-bmr", "c-arm", "c-chest", "c-waist", "c-thigh"].forEach(id => { const e = $(id); if (e) e.value = ""; });
  toggleCompForm();
  toast("📊 Misurazione salvata!");
  renderGoals();
}

/* ---------- STORICO SESSIONI ---------- */
let histMonth = null;   // mese aperto nello storico (null = tutti chiusi)
const monthKey = (dateStr) => dateStr.slice(0, 7);
function monthLabel(mk) {
  const [y, m] = mk.split("-");
  let lbl = new Date(+y, +m - 1, 1).toLocaleDateString("it-IT", { month: "long" });
  lbl = lbl.charAt(0).toUpperCase() + lbl.slice(1);
  if (+y !== new Date().getFullYear()) lbl += " " + y;   // anno solo se diverso da quello corrente
  return lbl;
}
function toggleHistMonth(mk) { histMonth = (histMonth === mk) ? null : mk; renderHistory(); }

function renderHistory() {
  const list = $("history-list");
  const monthsHost = $("hist-months");
  if (monthsHost) monthsHost.innerHTML = "";
  const sessions = [...state.sessions].sort((a, b) => b.date.localeCompare(a.date));
  if (!sessions.length) {
    list.innerHTML = `<div class="empty-mini">Nessuna sessione registrata. La prima è la più importante! 💪</div>`;
    return;
  }
  const months = [...new Set(sessions.map(s => monthKey(s.date)))].sort((a, b) => b.localeCompare(a));

  list.innerHTML = months.map(mk => {
    const monthSessions = sessions.filter(x => monthKey(x.date) === mk);
    const open = histMonth === mk;
    const rows = !open ? "" : monthSessions.map(sess => {
      const w = getWorkout(sess.workoutId);
      const nEx = Object.keys(sess.exercises || {}).length;
      const meta = [
        `${nEx} esercizi`,
        `${Math.round(sessionVolume(sess))} kg vol.`,
        sess.duration ? `${sess.duration} min` : null,
        sess.calories ? `${sess.calories} kcal` : null
      ].filter(Boolean).join(" · ");
      const exRows = Object.keys(sess.exercises || {}).map(k => {
        const sets = sess.exercises[k].sets;
        return `<div class="hist-ex"><span class="hist-ex-name">${EXERCISES[k] ? EXERCISES[k].name : k}</span><span class="hist-ex-sets">${sets.map(x => `${x.w}×${x.r}`).join(' · ')}</span></div>`;
      }).join("");
      return `<div class="hist-card" onclick="event.stopPropagation();this.classList.toggle('open')">
        <div class="hist-top">
          <span class="hist-dot" style="background:${w ? w.color : '#999'}"></span>
          <span class="hist-name">${w ? w.emoji + ' ' + w.name : 'Sessione'}</span>
          <span class="hist-date">${fmtShort(sess.date)}</span>
          <span class="hist-chev">▾</span>
        </div>
        <div class="hist-meta">${meta}</div>
        <div class="hist-detail">${exRows}${sess.notes ? `<div class="hist-notes">📝 ${sess.notes}</div>` : ''}</div>
      </div>`;
    }).join("");
    return `<div class="hist-month ${open ? 'open' : ''}">
      <button class="hist-month-head" onclick="toggleHistMonth('${mk}')">
        <span class="hm-name">${monthLabel(mk)}</span>
        <span class="hm-count">${monthSessions.length} ${monthSessions.length === 1 ? 'sessione' : 'sessioni'}</span>
        <span class="hist-chev">${open ? '▴' : '▾'}</span>
      </button>
      ${open ? `<div class="hist-month-body">${rows}</div>` : ''}
    </div>`;
  }).join("");
}

/* ============================================================
   VISTA PASTI — registrazione nutrizione (inserimento manuale)
   ============================================================ */
const PROTEIN_TARGET = 150;   // g/die — default proteine (fallback)

// Obiettivi giornalieri: di default quelli del coach nutrizione (adattivi);
// se l'utente li forza a mano (nutriGoal), vincono i suoi.
// nutriGoal.plan = { week0, kcal0, inc }: obiettivo ancorato a una settimana,
// che cresce di `inc` kcal OGNI LUNEDÌ in automatico.
function kcalTarget() {
  const g = state.nutriGoal || {};
  if (g.plan && g.plan.kcal0) {
    const weeks = Math.max(0, Math.round((new Date(weekStart(todayStr())) - new Date(g.plan.week0)) / (7 * 864e5)));
    return g.plan.kcal0 + weeks * (g.plan.inc || 0);
  }
  if (g.kcal) return g.kcal;
  return nutritionTargets().kcal;
}
function proteinTarget() { return (state.nutriGoal && state.nutriGoal.protein) || nutritionTargets().protein || PROTEIN_TARGET; }

function mealsFor(date) { return (state.meals && state.meals[date]) || []; }

function dayTotals(date) {
  return mealsFor(date).reduce((a, m) => {
    a.kcal += m.kcal || 0; a.protein += m.protein || 0; return a;
  }, { kcal: 0, protein: 0 });
}

// Semaforo proteine vs obiettivo: verde ≥ obiettivo, giallo ≥ 66%, rosso sotto
function proteinColor(p) {
  const T = proteinTarget();
  if (p >= T) return "#2BD576";
  if (p >= T * 0.66) return "#FFB454";
  return "#FF4D6D";
}


let mealDay = null;   // giorno selezionato nei Pasti (default oggi)
function mealDayStr() { return mealDay || todayStr(); }
function mealDayLabel() {
  const d = mealDayStr();
  if (d === todayStr()) return "oggi";
  const y = new Date(); y.setDate(y.getDate() - 1);
  if (d === localDate(y)) return "ieri";
  return fmtShort(d);
}
function setMealDay(which) {
  if (which === "today") mealDay = null;
  else if (which === "yesterday") { const y = new Date(); y.setDate(y.getDate() - 1); mealDay = localDate(y); }
  else if (which === "pick") {
    const inp = $("meal-day-pick");
    if (inp && inp.value) mealDay = inp.value;
  }
  renderMeals();
}

function renderMealDays() {
  const host = $("meal-days");
  if (!host) return;
  const d = mealDayStr();
  const y = new Date(); y.setDate(y.getDate() - 1);
  const isToday = d === todayStr(), isY = d === localDate(y);
  host.innerHTML = `
    <button class="hist-month-tab ${isToday ? 'active' : ''}" onclick="setMealDay('today')">Oggi</button>
    <button class="hist-month-tab ${isY ? 'active' : ''}" onclick="setMealDay('yesterday')">Ieri</button>
    <label class="hist-month-tab meal-pick ${(!isToday && !isY) ? 'active' : ''}">📅
      <input type="date" id="meal-day-pick" value="${d}" max="${todayStr()}" onchange="setMealDay('pick')">
    </label>`;
}

function renderMeals() {
  renderMealDays();
  renderMealSummary();
  renderMealList();
  renderMealTrend();
}

function renderMealSummary() {
  const t = dayTotals(mealDayStr());
  const kT = kcalTarget(), pT = proteinTarget();
  const kPct = Math.min(100, Math.round((t.kcal / kT) * 100));
  const pPct = Math.min(100, Math.round((t.protein / pT) * 100));
  const kc = "#FF6B6B", pc = proteinColor(t.protein);
  // quanto manca per chiudere la giornata (al posto della %)
  const kMiss = kT - t.kcal, pMiss = pT - t.protein;
  const kLbl = kMiss > 0 ? `mancano <b>${kMiss}</b>` : "✓ chiuse";
  const pLbl = pMiss > 0 ? `mancano <b>${pMiss} g</b>` : "✓ chiuse";
  $("meal-today").innerHTML = `
    <div class="meal-bar">
      <div class="progress-top">
        <span class="progress-label">🔥 Calorie <b>${t.kcal}</b> / <span class="meal-goal" onclick="editKcalTarget()">${kT}</span> kcal</span>
        <span class="progress-count" style="color:${kMiss > 0 ? kc : '#2BD576'}">${kLbl}</span>
      </div>
      <div class="progress-bar"><div class="progress-fill" style="width:${kPct}%;background:${kc};box-shadow:0 0 12px ${kc}"></div></div>
    </div>
    <div class="meal-bar" style="margin-top:16px">
      <div class="progress-top">
        <span class="progress-label">💪 Proteine <b>${t.protein}</b> / <span class="meal-goal" onclick="editProteinTarget()">${pT}</span> g</span>
        <span class="progress-count" style="color:${pMiss > 0 ? pc : '#2BD576'}">${pLbl}</span>
      </div>
      <div class="progress-bar"><div class="progress-fill" style="width:${pPct}%;background:${pc};box-shadow:0 0 12px ${pc}"></div></div>
    </div>
    <div class="meal-goal-hint">Tocca il numero dell'obiettivo per modificarlo</div>`;
}

function editKcalTarget() {
  const g = state.nutriGoal || {};
  const curInc = g.plan ? (g.plan.inc || 0) : 100;
  sheetForm("🔥 Obiettivo calorie",
    sheetField("sh-kcal", "kcal al giorno QUESTA settimana (vuoto = coach)", kcalTarget(), "auto: " + nutritionTargets().kcal) +
    sheetField("sh-inc", "Aumento automatico ogni lunedì (kcal)", curInc, "es. 100 — 0 = fisso"),
    "saveKcalTarget()");
}
function saveKcalTarget() {
  const n = sheetNum("sh-kcal");
  const inc = sheetNum("sh-inc");
  state.nutriGoal = state.nutriGoal || {};
  if (n && n > 0) {
    // piano ancorato alla settimana corrente: da lunedì prossimo +inc, e così via
    state.nutriGoal.plan = { week0: weekStart(todayStr()), kcal0: Math.round(n), inc: (inc && inc > 0) ? Math.round(inc) : 0 };
    state.nutriGoal.kcal = null;
  } else {
    state.nutriGoal.plan = null;
    state.nutriGoal.kcal = null;
  }
  saveState(state); closeModal(); renderMeals();
  toast(n ? (state.nutriGoal.plan.inc ? `Obiettivo ${Math.round(n)} kcal, +${state.nutriGoal.plan.inc} ogni lunedì 📈` : "Obiettivo kcal fisso impostato") : "Obiettivo kcal: automatico (coach)");
}
function editProteinTarget() {
  sheetForm("💪 Obiettivo proteine",
    sheetField("sh-prot", "grammi al giorno (vuoto = automatico dal coach)", (state.nutriGoal && state.nutriGoal.protein) || "", "auto: " + nutritionTargets().protein),
    "saveProteinTarget()");
}
function saveProteinTarget() {
  const n = sheetNum("sh-prot");
  state.nutriGoal = state.nutriGoal || {};
  state.nutriGoal.protein = (n && n > 0) ? Math.round(n) : null;
  saveState(state); closeModal(); renderMeals();
  toast(state.nutriGoal.protein ? "Obiettivo proteine impostato a mano" : "Obiettivo proteine: automatico (coach)");
}

function renderMealList() {
  const meals = [...mealsFor(mealDayStr())].sort((a, b) => (a.t || "").localeCompare(b.t || ""));
  const el = $("meal-list");
  if (!meals.length) {
    el.innerHTML = `<div class="empty-mini">Nessun pasto registrato ${mealDayLabel()}. Aggiungine uno qui sopra. 🍽️</div>`;
    return;
  }
  el.innerHTML = meals.map(m => `
    <div class="meal-card">
      <div class="meal-card-meta">🔥 ${m.kcal || 0} kcal &nbsp;·&nbsp; 💪 ${m.protein || 0}g${m.t ? ` &nbsp;·&nbsp; ${m.t}` : ""}</div>
      <button class="meal-del" onclick="deleteMeal(${m.id})" title="Elimina">✕</button>
    </div>`).join("");
}

function saveMeal() {
  const kcal = parseInt($("meal-kcal").value);
  const prot = parseInt($("meal-prot").value);
  if (isNaN(kcal) && isNaN(prot)) { toast("Inserisci kcal o proteine"); return; }
  const day = mealDayStr();
  state.meals = state.meals || {};
  state.meals[day] = state.meals[day] || [];
  state.meals[day].push({
    id: Date.now(),
    kcal: isNaN(kcal) ? 0 : Math.max(0, kcal),
    protein: isNaN(prot) ? 0 : Math.max(0, prot),
    t: (mealDayStr() === todayStr()) ? new Date().toTimeString().slice(0, 5) : null
  });
  saveState(state);
  $("meal-kcal").value = ""; $("meal-prot").value = "";
  toast("🍽️ Registrato!");
  renderMeals();
}

function deleteMeal(id) {
  const day = mealDayStr();
  if (!state.meals || !state.meals[day]) return;
  const removed = state.meals[day].find(m => m.id === id);
  state.meals[day] = state.meals[day].filter(m => m.id !== id);
  saveState(state); renderMeals();
  toastUndo("🗑 Pasto eliminato.", () => {
    if (removed) { state.meals[day] = state.meals[day] || []; state.meals[day].push(removed); }
    saveState(state); renderMeals();
  });
}

function renderMealTrend() {
  const host = $("meal-trend");
  if (charts.mealK) charts.mealK.destroy();
  if (charts.mealP) charts.mealP.destroy();

  // Settimana corrente, da lunedì a domenica (le settimane passate spariscono)
  const days = [];
  const monday = new Date(weekStart(todayStr()) + "T00:00:00");
  for (let i = 0; i < 7; i++) {
    const d = new Date(monday); d.setDate(d.getDate() + i);
    days.push(localDate(d));
  }
  const kcals = days.map(d => dayTotals(d).kcal);
  const prots = days.map(d => dayTotals(d).protein);
  const loggedDays = days.filter(d => mealsFor(d).length).length;

  if (!loggedDays) {
    host.innerHTML = `<div class="empty-mini">Registra qualche pasto per vedere l'andamento della settimana (lunedì → domenica).</div>`;
    return;
  }

  const kT = kcalTarget(), pT = proteinTarget();
  const labels = days.map(d => new Date(d + "T00:00:00").toLocaleDateString("it-IT", { weekday: "short" }));
  const loggedIdx = days.map((d, i) => mealsFor(d).length ? i : -1).filter(i => i >= 0);
  const kHit = loggedIdx.filter(i => kcals[i] >= kT).length;
  const pHit = loggedIdx.filter(i => prots[i] >= pT).length;

  host.innerHTML = `
    <div class="spark-row">
      <div class="spark-head"><span class="spark-lbl" style="color:#FF6B6B">Calorie</span><span class="spark-val">obiettivo ${kT} kcal</span></div>
      <div class="spark-wrap" style="height:100px"><canvas id="meal-k-chart"></canvas></div>
      <div class="meal-hit">✅ ${kHit}/${loggedDays} giorni obiettivo calorie questa settimana</div>
    </div>
    <div class="spark-row">
      <div class="spark-head"><span class="spark-lbl" style="color:#2BD576">Proteine</span><span class="spark-val">obiettivo ${pT} g</span></div>
      <div class="spark-wrap" style="height:100px"><canvas id="meal-p-chart"></canvas></div>
      <div class="meal-hit">✅ ${pHit}/${loggedDays} giorni obiettivo proteine questa settimana</div>
    </div>`;

  charts.mealK = mealBarChart("meal-k-chart", labels, kcals, kT);
  charts.mealP = mealBarChart("meal-p-chart", labels, prots, pT);
}

// Barre andamento: verde se ≥ obiettivo, coral se sotto + linea obiettivo tratteggiata
function mealBarChart(canvasId, labels, vals, target) {
  return new Chart($(canvasId).getContext("2d"), {
    type: "bar",
    data: {
      labels,
      datasets: [
        { data: vals, backgroundColor: vals.map(v => (v > 0 && v >= target) ? "#10B981" : "#FF6B6B"), borderRadius: 5, order: 2 },
        { type: "line", data: labels.map(() => target), borderColor: "rgba(255,255,255,.55)", borderDash: [5, 4], borderWidth: 1.5, pointRadius: 0, fill: false, order: 1 }
      ]
    },
    options: { plugins: { legend: { display: false } }, scales: { y: { beginAtZero: true, suggestedMax: Math.max(target, ...vals) * 1.1, grid: { color: "rgba(255,255,255,.08)" } }, x: { grid: { display: false } } }, responsive: true, maintainAspectRatio: false }
  });
}


function toggleGuide(i) { document.querySelectorAll(".guide-card")[i].classList.toggle("open"); }

/* ============================================================
   BACKUP / TOAST / INIT
   ============================================================ */
function doExport() { exportJSON(state); }

function doImport(input) {
  const file = input.files[0];
  if (!file) return;
  importJSON(file).then(s => {
    state = s; saveState(state);
    toast("📥 Backup importato!");
    renderWorkoutChips(); renderWorkout();
  }).catch(() => toast("File non valido"));
  input.value = "";
}

/* ---------- SHEET (form nel modal, al posto dei prompt nativi) ---------- */
function sheetForm(title, fieldsHTML, onSaveJs) {
  $("modal-title").textContent = title;
  $("modal-body").innerHTML = `
    ${fieldsHTML}
    <button class="btn-save" style="margin-top:14px" onclick="${onSaveJs}">Salva</button>`;
  $("modal").classList.add("show");
}
const sheetField = (id, label, value, ph) =>
  `<div class="goal-field" style="margin-bottom:10px"><div class="goal-field-lbl">${label}</div>
   <input type="text" inputmode="decimal" id="${id}" value="${value != null ? value : ""}" placeholder="${ph || ""}"></div>`;
function sheetNum(id) {
  const e = $(id); if (!e) return null;
  const v = parseFloat(String(e.value).replace(",", "."));
  return isNaN(v) ? null : v;
}

/* ---------- TOAST CON ANNULLA (undo al posto dei confirm) ---------- */
let undoFn = null;
function toastUndo(msg, fn) {
  undoFn = fn;
  const t = $("toast");
  t.innerHTML = `${msg} <button class="toast-undo" onclick="doUndo()">Annulla</button>`;
  t.classList.add("show");
  clearTimeout(toastTimer);
  toastTimer = setTimeout(() => { t.classList.remove("show"); undoFn = null; }, 5000);
}
function doUndo() {
  clearTimeout(toastTimer);
  $("toast").classList.remove("show");
  if (undoFn) { undoFn(); undoFn = null; }
}

let toastTimer = null;
function toast(msg) {
  const t = $("toast");
  t.innerHTML = msg;
  t.classList.add("show");
  clearTimeout(toastTimer);
  toastTimer = setTimeout(() => t.classList.remove("show"), 2400);
}

function setDate() {
  $("today-date").textContent = new Date().toLocaleDateString("it-IT", { weekday: "short", day: "numeric", month: "short" });
}

// INIT
if (window.Chart) {
  Chart.defaults.color = "rgba(245,240,255,.55)";
  Chart.defaults.font.family = "-apple-system, BlinkMacSystemFont, sans-serif";
}
setDate();
renderWeighBanner();
renderWorkoutChips();
renderWorkout();
