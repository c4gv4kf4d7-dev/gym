/* ============================================================
   CORE — stato, utilità, promemoria, coach nutrizione
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

// GIF esercizio: prova con la chiave (assets/gifs/curl.gif), poi con il nome
// "slugificato" (crunch_panca_inclinata.gif) — serve per gli esercizi custom
// importati dal PT, le cui chiavi variano da utente a utente.
const nameSlug = (n) => String(n || "").toLowerCase().replace(/[^a-z0-9]+/g, "_").replace(/^_+|_+$/g, "");
function gifFallback(img, slug) {
  if (!slug || img.dataset.tried) { img.style.display = "none"; return; }
  img.dataset.tried = "1";
  img.src = "assets/gifs/" + slug + ".gif";
}

// Prossima data in calendario (non ancora fatta), opzionale per scheda
function nextScheduledFor(workoutId) {
  const t = todayStr();
  return Object.entries(state.schedule || {})
    .filter(([d, sc]) => d >= t && !sc.done && (!workoutId || sc.workoutId === workoutId))
    .sort((a, b) => a[0].localeCompare(b[0]))[0] || null;
}
// Versione secca per l'hero: OGGI / DOMANI / DOPODOMANI / TRA N GIORNI
function whenShort(ds) {
  const diff = Math.round((new Date(ds + "T00:00:00") - new Date(todayStr() + "T00:00:00")) / 864e5);
  if (diff <= 0) return "oggi";
  if (diff === 1) return "domani";
  if (diff === 2) return "dopodomani";
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
