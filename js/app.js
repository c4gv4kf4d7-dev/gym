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
const todayStr = () => new Date().toISOString().split("T")[0];
const fmtShort = (str) => {
  const d = new Date(str + "T00:00:00");
  return d.toLocaleDateString("it-IT", { day: "numeric", month: "short" });
};
const fmtLong = (str) => {
  const d = new Date(str + "T00:00:00");
  return d.toLocaleDateString("it-IT", { day: "numeric", month: "long", year: "numeric" });
};
const getWorkout = (id) => WORKOUTS.find(w => w.id === id)
  || (typeof PT_WORKOUT !== "undefined" && PT_WORKOUT.id === id ? PT_WORKOUT : undefined);
// Tutte le schede assegnabili nel calendario (3 Full Body + PT)
const SCHEDULABLE = () => WORKOUTS.concat(typeof PT_WORKOUT !== "undefined" ? [PT_WORKOUT] : []);

// Colore del cerchietto esercizio per tipo di attrezzo
const TYPE_COLOR = { machine: "#5B8DEF", dumbbell: "#2BD576", cable: "#FF8A5B", body: "#A855F7", barbell: "#EF4444" };

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
// Miglior 1RM stimato in una sessione per un esercizio
function session1RM(s, exKey) {
  const sets = exSets(s, exKey);
  return sets.length ? Math.max(...sets.map(x => estimate1RM(x.w, x.r))) : 0;
}

// Peso corporeo attuale
function currentBW() { const bw = state.bodyweight; return bw.length ? bw[bw.length - 1].v : null; }

// Lunedì della settimana di una data (YYYY-MM-DD)
function weekStart(dateStr) {
  const d = new Date(dateStr + "T00:00:00");
  d.setDate(d.getDate() - ((d.getDay() + 6) % 7));
  return d.toISOString().split("T")[0];
}
// Streak: settimane consecutive (fino ad ora) con almeno un allenamento
function weekStreak() {
  const weeks = new Set(state.sessions.map(s => weekStart(s.date)));
  let probe = new Date(); probe.setDate(probe.getDate() - ((probe.getDay() + 6) % 7));
  let key = probe.toISOString().split("T")[0];
  if (!weeks.has(key)) { probe.setDate(probe.getDate() - 7); key = probe.toISOString().split("T")[0]; }
  let n = 0;
  while (weeks.has(key)) { n++; probe.setDate(probe.getDate() - 7); key = probe.toISOString().split("T")[0]; }
  return n;
}

// Target nutrizionali per la massa (da BMR + peso)
function nutritionTargets() {
  const comp = state.composition;
  const bmr = (comp.length && comp[comp.length - 1].bmr) || 1489;
  const bw = currentBW() || state.goals.startWeight || 60;
  const tdee = Math.round(bmr * 1.5);          // ~3 allenamenti/settimana, attività moderata
  const bulk = Math.round((tdee + 350) / 10) * 10;  // surplus per massa pulita
  const protein = Math.round(bw * 1.9);        // g/die
  const fat = Math.round(bw * 0.9);            // g/die
  const carbs = Math.max(0, Math.round((bulk - protein * 4 - fat * 9) / 4));
  return { bmr, bw, tdee, bulk, protein, fat, carbs };
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
  return { ratePerWeek, date: eta.toISOString().split("T")[0] };
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
  { id: "allschede",icon: "🧭", name: "Esploratore",          test: () => distinctWorkouts() >= 4,
    desc: "Hai provato tutte e 4 le schede (Full Body, Gambe, Spinta, Tirata). Allenamento completo." },
  { id: "goal",    icon: "👑", name: "Obiettivo raggiunto!",  test: () => { const c = currentBW(), t = state.goals.targetWeight; return c != null && t != null && c >= t; },
    desc: "Hai raggiunto il tuo peso obiettivo. Campione. Ora si punta più in alto." }
];
function earnedBadgeIds() { return BADGES.filter(b => b.test()).map(b => b.id); }

// Esercizio nell'ultima sessione (prima di oggi): { date, sets, quality }
function lastExercise(exKey) {
  const past = state.sessions
    .filter(s => s.date < todayStr() && exSets(s, exKey).length)
    .sort((a, b) => b.date.localeCompare(a.date));
  if (!past.length) return null;
  const sess = past[0];
  return { date: sess.date, sets: exSets(sess, exKey), quality: sess.exercises[exKey].quality };
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
  $("workout-chips").innerHTML = WORKOUTS.map(w => `
    <button class="wchip ${w.id === currentWorkoutId ? 'active' : ''}"
            style="${w.id === currentWorkoutId ? `background:${w.color};border-color:${w.color}` : ''}"
            onclick="selectWorkout('${w.id}')">
      <span class="wchip-emoji">${w.emoji}</span>${w.name}
    </button>`).join("");
}

function selectWorkout(id) {
  currentWorkoutId = id;
  renderWorkoutChips();
  renderWorkout();
}

function renderWorkout() {
  const w = getWorkout(currentWorkoutId);
  const exList = w.exercises.map(k => Object.assign({ key: k }, EXERCISES[k]));
  const sess = todaySession(w.id);

  // HERO
  $("workout-hero").style.background = `linear-gradient(150deg, ${w.color} 0%, #2A1B4A 95%)`;
  $("workout-hero").style.boxShadow = `0 10px 40px -8px ${w.color}66, inset 0 1px 0 rgba(255,255,255,.18)`;
  $("workout-hero").innerHTML = `
    <div class="hero-label">Scheda del giorno</div>
    <div class="hero-title">${w.name} ${w.emoji}</div>
    <div class="hero-sub">${w.focus}</div>
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
        <div class="sets-row">
          <div class="set-pill"><div class="set-pill-num">${ex.sets}</div><div class="set-pill-lbl">Serie</div></div>
          <div class="set-pill"><div class="set-pill-num">${repsNum}</div><div class="set-pill-lbl">${ex.time ? 'Durata' : 'Rip.'}</div></div>
          ${ex.time
            ? `<div class="set-pill"><div class="set-pill-num">${ex.rest}</div><div class="set-pill-lbl">Riposo</div></div>`
            : `<div class="set-pill"><div class="set-pill-num">${sug && sug.lastW != null ? sug.lastW : '—'}</div><div class="set-pill-lbl">Kg ultima</div></div>`}
        </div>
        <div class="tip-box">
          <div class="tip-label">⚠️ Errore comune</div>
          <div class="tip-text">${ex.tip}</div>
        </div>
        ${EXERCISE_STEPS[ex.key] ? `
        <details class="steps">
          <summary>📋 Come si esegue</summary>
          <ol class="steps-list">${EXERCISE_STEPS[ex.key].map(st => `<li>${st}</li>`).join("")}</ol>
        </details>` : ''}
        ${ex.time ? '' : `
        <div class="prog-block">
          <div class="last-time">📊 Ultima volta: ${sug.last
            ? `<strong>${sug.lastW}kg</strong> · ${sug.lastSets}×${sug.lastR} <span class="lt-day">(${sug.day})</span>`
            : '— nessuna sessione precedente'}</div>

          <div class="sugg-box sugg-${sug.color}">
            <div class="sugg-text"><span class="sugg-label">Oggi:</span> ${sug.todayHtml}</div>
          </div>

          <div class="weight-label">I tuoi dati di oggi</div>
          <div class="set-log">
            ${[0, 1, 2].map(s => `
              <div class="set-log-row">
                <span class="set-log-n">Serie ${s + 1}</span>
                <input class="setw" type="number" inputmode="decimal" data-ex="${ex.key}" data-set="${s}"
                       value="${valW(s)}" placeholder="${phW}" min="0" max="500" step="2.5" oninput="checkDone(${i})">
                <span class="set-x">kg ×</span>
                <input class="setr" type="number" inputmode="numeric" data-ex="${ex.key}" data-set="${s}"
                       value="${valR(s)}" placeholder="${phR}" min="0" max="50" oninput="checkDone(${i})">
                <span class="set-x">rip.</span>
              </div>`).join("")}
          </div>

          <div class="weight-label">Com'è andata? (per il suggerimento della prossima volta)</div>
          <div class="quality-row" data-ex="${ex.key}">
            <button class="qbtn qbtn-clean ${qsel === 'clean' ? 'on' : ''}" onclick="setQuality('${ex.key}','clean',this)">Pulito</button>
            <button class="qbtn qbtn-hard ${qsel === 'hard' ? 'on' : ''}" onclick="setQuality('${ex.key}','hard',this)">Tosta</button>
            <button class="qbtn qbtn-fail ${qsel === 'fail' ? 'on' : ''}" onclick="setQuality('${ex.key}','fail',this)">Non finita</button>
          </div>
        </div>`}
        ${ex.time ? `<button class="plank-done" onclick="togglePlankDone(${i})">✓ Segna come fatto</button>` : ''}
      </div>`;
    cont.appendChild(card);
  });

  $("log-notes").value = sess && sess.notes ? sess.notes : "";
  $("log-duration").value = sess && sess.duration != null ? sess.duration : "";
  $("log-calories").value = sess && sess.calories != null ? sess.calories : "";
  $("toggle-all").textContent = "Espandi tutto";

  renderGuidedResume();
  updateProgress();
}

function toggleCard(i) { $(`ex-${i}`).classList.toggle("open"); }

function toggleAll() {
  const cards = document.querySelectorAll("#ex-cards .ex-card");
  const anyClosed = [...cards].some(c => !c.classList.contains("open"));
  cards.forEach(c => c.classList.toggle("open", anyClosed));
  $("toggle-all").textContent = anyClosed ? "Contrai tutto" : "Espandi tutto";
}

function setQuality(exKey, q, btn) {
  selectedQuality[exKey] = (selectedQuality[exKey] === q) ? null : q;  // ritocco = deseleziona
  btn.parentElement.querySelectorAll(".qbtn").forEach(b => b.classList.remove("on"));
  if (selectedQuality[exKey]) btn.classList.add("on");
}

function checkDone(i) {
  const card = $(`ex-${i}`);
  const ws = card.querySelectorAll(".setw");
  const filled = [...ws].filter(inp => inp.value.trim() !== "").length;
  const num = $(`exnum-${i}`);
  if (ws.length > 0 && filled === ws.length) {
    num.style.background = "#2BD576";
    num.textContent = "✓";
  } else {
    num.style.background = num.dataset.c || "";
    num.textContent = i + 1;
  }
  // PR highlight sul peso
  ws.forEach(inp => {
    const v = parseFloat(inp.value);
    const pr = bestPR(inp.dataset.ex);
    inp.classList.toggle("is-pr", !isNaN(v) && v > 0 && v >= pr && pr > 0);
  });
  updateProgress();
}

function togglePlankDone(i) {
  const card = $(`ex-${i}`);
  const on = card.classList.toggle("plank-on");
  const num = $(`exnum-${i}`);
  if (on) { num.style.background = "#2BD576"; num.textContent = "✓"; }
  else { num.style.background = num.dataset.c || ""; num.textContent = i + 1; }
  updateProgress();
}

function updateProgress() {
  const cards = document.querySelectorAll("#ex-cards .ex-card");
  let done = 0, total = 0;
  cards.forEach((card) => {
    total++;
    if (card.classList.contains("is-plank")) {
      if (card.classList.contains("plank-on")) done++;
    } else {
      const ws = card.querySelectorAll(".setw");
      if (ws.length && [...ws].every(inp => inp.value.trim() !== "")) done++;
    }
  });
  $("prog-count").textContent = `${done} / ${total}`;
  $("prog-bar").style.width = (total ? Math.round((done / total) * 100) : 0) + "%";
}

function saveSession() {
  const w = getWorkout(currentWorkoutId);
  const exercises = {};
  let any = false;
  w.exercises.forEach(k => {
    if (EXERCISES[k].time) return;   // plank: niente peso/reps
    const ws = [...document.querySelectorAll(`.setw[data-ex="${k}"]`)];
    const rs = [...document.querySelectorAll(`.setr[data-ex="${k}"]`)];
    const sets = [];
    ws.forEach((inp, idx) => {
      const wv = parseFloat(inp.value);
      if (!isNaN(wv) && wv > 0) {
        const rv = parseInt(rs[idx] ? rs[idx].value : "");
        sets.push({ w: wv, r: isNaN(rv) ? (EXERCISES[k].reps || 12) : rv });
        any = true;
      }
    });
    if (sets.length) exercises[k] = { sets, quality: selectedQuality[k] || null };
  });
  if (!any) { toast("Inserisci almeno un peso prima di salvare 💪"); return; }

  const notes = $("log-notes").value.trim();
  const duration = parseInt($("log-duration").value) || null;
  const calories = parseInt($("log-calories").value) || null;
  commitSession(w.id, exercises, { duration, calories, notes });
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
      duration: meta.duration, calories: meta.calories, notes: meta.notes
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

function showSummary(s, newPRs, newBadges) {
  const w = getWorkout(s.workoutId);
  const vol = Math.round(sessionVolume(s));
  const wkNum = thisWeekCount();
  const streak = weekStreak();
  const motivations = [
    "Mattone su mattone. 🧱", "Costanza batte motivazione. 🔁", "Il te di domani ringrazia. 🙌",
    "Un passo più vicino ai 70 kg. 🎯", "Ti stai costruendo, davvero. 🛠️"
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
      <div class="recap-foot">💪 GYM TRACKER · verso i 70 kg</div>
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
  "Ogni esercizio è un mattone verso i 70 kg 🧱",
  "Concentrato e preciso: così si cresce 🎯",
  "Quasi fatto, dai il meglio anche qui ⚡",
  "Stai costruendo il tuo fisico, serie dopo serie 🛠️"
];

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
    <div class="g-cues-h">👁️ Occhio a</div>
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
        <div class="g-sugg sugg-${sug.color}"><span class="sugg-label">Oggi:</span> ${sug.todayHtml}</div>
        ${cuesHTML(key)}
        <div class="g-inputs">
          <div class="g-ig"><div class="g-ilbl">Peso (kg)</div><input id="g-w" type="number" inputmode="decimal" value="${prevW}" min="0" max="500" step="2.5"></div>
          <div class="g-ix">×</div>
          <div class="g-ig"><div class="g-ilbl">Ripetizioni</div><input id="g-r" type="number" inputmode="numeric" value="${prevR}" min="0" max="50"></div>
        </div>
        <button class="g-done" onclick="guidedCompleteSet()">✓ Serie completata</button>
        <button class="g-skip" onclick="skipCurrent()">⤼ Salta — macchina occupata</button>
      </div>`;
  }
  $("guided").innerHTML = top + body;
  saveGuided();
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
  const exercises = {};
  Object.keys(guided.data).forEach(k => {
    if (guided.data[k].sets.length) exercises[k] = guided.data[k];
  });
  const wid = guided.workoutId;
  clearGuided();
  closeGuidedOverlay();
  if (!Object.keys(exercises).length) { toast("Allenamento chiuso (nessun dato)"); return; }
  commitSession(wid, exercises, { duration: null, calories: null, notes: "" });
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
        ${w ? `<span class="cal-dot${sched.pt ? ' cal-pt' : ''}" style="background:${sched.pt ? '#A855F7' : w.color}">${sched.done ? '✓' : (sched.pt ? '🧑‍🏫' : w.emoji)}</span>` : ''}
      </div>`;
  }
  $("cal-grid").innerHTML = html;

  // prossimi allenamenti programmati
  const limit = new Date(); limit.setDate(limit.getDate() + 21);
  const limitStr = limit.toISOString().split("T")[0];
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
    <button class="btn-save" style="margin-top:14px" onclick="closeModal();openRecap(${s.id})">📸 Riepilogo da salvare</button>`;
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
  const s = state.sessions;
  // stat cards
  const weekAgo = new Date(Date.now() - 7 * 864e5).toISOString().split("T")[0];
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
  renderPT();
  renderBWChart();
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

function renderPT() {
  const card = $("pt-card");
  if (!card) return;
  const lifts = [...(state.ptLifts || [])].sort((a, b) => a.date.localeCompare(b.date));
  card.innerHTML = `
    <div class="chart-title">🏋️ Super esercizi (PT)</div>
    <div class="chart-sub">Panca · Squat · Stacco — inserisci i kg sollevati, guarda la progressione nel tempo</div>
    <div class="pt-form">
      <div class="pt-daterow"><span class="pt-daterow-lbl">📅 Data seduta</span><input type="date" id="pt-date" class="pt-date" value="${todayStr()}"></div>
      <div class="pt-inputs">
        ${PT_MOVES.map(m => `<div class="pt-field"><label>${m.lbl} (kg)</label><input type="number" id="pt-${m.key}" inputmode="decimal" step="0.5" min="0" placeholder="—"></div>`).join("")}
      </div>
      <button class="btn-save" onclick="savePTLift()">💪 Registra seduta PT</button>
    </div>
    ${lifts.length ? '<canvas id="pt-chart" height="150"></canvas>' : '<div class="empty-mini">Nessuna seduta PT registrata. Inserisci i kg dopo un allenamento con Denis.</div>'}
    <div class="pt-list">${lifts.slice().reverse().map(ptRowHTML).join("")}</div>`;
  if (lifts.length) drawPTChart(lifts);
}

function ptRowHTML(l) {
  const parts = PT_MOVES.filter(m => l[m.key] != null).map(m => `${m.lbl} <b>${l[m.key]}</b>`);
  return `<div class="pt-row">
    <span class="pt-row-date">${fmtShort(l.date)}</span>
    <span class="pt-row-vals">${parts.length ? parts.join(" · ") + " kg" : "—"}</span>
    <button class="pt-del" onclick="deletePTLift('${l.date}')">✕</button>
  </div>`;
}

function drawPTChart(lifts) {
  const cv = $("pt-chart");
  if (!cv) return;
  const ctx = cv.getContext("2d");
  if (charts.pt) charts.pt.destroy();
  charts.pt = new Chart(ctx, {
    type: "line",
    data: {
      labels: lifts.map(l => fmtShort(l.date)),
      datasets: PT_MOVES.map(m => ({
        label: m.lbl,
        data: lifts.map(l => (l[m.key] != null ? l[m.key] : null)),
        borderColor: m.color,
        backgroundColor: m.color,
        tension: .3,
        spanGaps: true,
        pointRadius: 3,
        borderWidth: 2
      }))
    },
    options: {
      plugins: { legend: { display: true, labels: { boxWidth: 12, font: { size: 11 } } } },
      scales: { y: { beginAtZero: false, grid: { color: "rgba(255,255,255,.08)" }, ticks: { callback: v => v + " kg" } }, x: { grid: { display: false } } },
      responsive: true
    }
  });
}

function savePTLift() {
  const date = $("pt-date").value || todayStr();
  const num = (id) => { const v = parseFloat($(id).value); return isNaN(v) ? null : v; };
  const vals = {}; PT_MOVES.forEach(m => vals[m.key] = num("pt-" + m.key));
  if (PT_MOVES.every(m => vals[m.key] == null)) { toast("Inserisci almeno un valore"); return; }
  state.ptLifts = state.ptLifts || [];
  const ex = state.ptLifts.find(l => l.date === date);
  if (ex) {
    PT_MOVES.forEach(m => { if (vals[m.key] != null) ex[m.key] = vals[m.key]; });
  } else {
    state.ptLifts.push(Object.assign({ date }, vals));
  }
  saveState(state);
  renderPT();
  toast("💪 Seduta PT registrata");
}

function deletePTLift(date) {
  state.ptLifts = (state.ptLifts || []).filter(l => l.date !== date);
  saveState(state);
  renderPT();
}

function renderVolumeChart() {
  const s = [...state.sessions].sort((a, b) => a.date.localeCompare(b.date));
  const ctx = $("vol-chart").getContext("2d");
  if (charts.vol) charts.vol.destroy();
  if (!s.length) return;
  charts.vol = new Chart(ctx, {
    type: "bar",
    data: {
      labels: s.map(x => fmtShort(x.date)),
      datasets: [{ data: s.map(sessionVolume), backgroundColor: "rgba(255,45,149,.8)", borderRadius: 6 }]
    },
    options: { plugins: { legend: { display: false } }, scales: { y: { beginAtZero: true, grid: { color: "rgba(255,255,255,.08)" } }, x: { grid: { display: false } } }, responsive: true }
  });
}

function renderExChart() {
  const k = $("ex-select").value;
  const ctx = $("ex-chart").getContext("2d");
  if (charts.ex) charts.ex.destroy();
  const lbl = $("ex-1rm");
  if (!k) { if (lbl) lbl.textContent = "—"; return; }
  const pts = [...state.sessions]
    .filter(s => exSets(s, k).length)
    .sort((a, b) => a.date.localeCompare(b.date))
    .map(s => ({ d: fmtShort(s.date), v: +session1RM(s, k).toFixed(1) }));
  if (!pts.length) { if (lbl) lbl.textContent = "—"; return; }
  if (lbl) lbl.textContent = `oggi ~${pts[pts.length - 1].v} kg`;
  charts.ex = new Chart(ctx, {
    type: "line",
    data: {
      labels: pts.map(p => p.d),
      datasets: [{ data: pts.map(p => p.v), borderColor: "#FF2D95", backgroundColor: "rgba(255,45,149,.18)", borderWidth: 2, pointRadius: 4, pointBackgroundColor: "#FF2D95", fill: true, tension: .3 }]
    },
    options: { plugins: { legend: { display: false } }, scales: { y: { beginAtZero: false, grid: { color: "rgba(255,255,255,.08)" } }, x: { grid: { display: false } } }, responsive: true }
  });
}

function renderBWChart() {
  const bw = state.bodyweight;
  const ctx = $("bw-chart").getContext("2d");
  if (charts.bw) charts.bw.destroy();
  if (!bw.length) return;
  charts.bw = new Chart(ctx, {
    type: "line",
    data: {
      labels: bw.map(b => fmtShort(b.date)),
      datasets: [{ data: bw.map(b => b.v), borderColor: "#A855F7", backgroundColor: "rgba(168,85,247,.18)", borderWidth: 2, pointRadius: 4, pointBackgroundColor: "#A855F7", fill: true, tension: .3 }]
    },
    options: { plugins: { legend: { display: false } }, scales: { y: { grid: { color: "rgba(255,255,255,.08)" } }, x: { grid: { display: false } } }, responsive: true }
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

function renderProfile() {
  const p = state.profile || {};
  const card = $("profile-card");
  if (!p.name && !p.height && !p.birthday) { card.innerHTML = ""; return; }
  const age = computeAge(p.birthday);
  card.className = "goal-card profile-box";
  card.innerHTML = `
    <div class="profile-top">
      <div class="profile-avatar">${(p.name || "?").charAt(0).toUpperCase()}</div>
      <div>
        <div class="profile-name">${p.name || "—"}</div>
        <div class="profile-meta">${age != null ? age + " anni" : ""}${p.height ? " · " + p.height + " cm" : ""}</div>
      </div>
    </div>`;
}

function renderGoals() {
  const bw = state.bodyweight;
  const cur = bw.length ? bw[bw.length - 1].v : null;
  const g = state.goals;

  renderProfile();
  renderComposition();
  renderCompChart();

  $("g-current").textContent = cur != null ? cur + " kg" : "—";
  $("g-start-input").value = g.startWeight != null ? g.startWeight : "";
  $("g-target-input").value = g.targetWeight != null ? g.targetWeight : "";
  $("g-note").value = g.note || "";

  // progress verso obiettivo
  const wrap = $("goal-progress");
  if (g.startWeight != null && g.targetWeight != null && cur != null) {
    const total = g.targetWeight - g.startWeight;
    const done = cur - g.startWeight;
    const pct = total !== 0 ? Math.max(0, Math.min(100, Math.round((done / total) * 100))) : 0;
    wrap.innerHTML = `
      <div class="progress-top">
        <span class="progress-label">Da ${g.startWeight} → ${g.targetWeight} kg</span>
        <span class="progress-count">${pct}%</span>
      </div>
      <div class="progress-bar"><div class="progress-fill" style="width:${pct}%;background:#8B5CF6"></div></div>
      <div class="goal-delta">${done >= 0 ? '+' : ''}${done.toFixed(1)} kg dall'inizio · mancano ${(g.targetWeight - cur).toFixed(1)} kg${g.targetDate ? ` · entro ${fmtLong(g.targetDate)}` : ''}</div>
      ${projectionHTML()}`;
    wrap.style.display = "block";
  } else {
    wrap.style.display = "none";
  }

  renderNutrition();
  renderBadges();

  // lista PR
  const allKeys = new Set();
  state.sessions.forEach(x => Object.keys(x.exercises || {}).forEach(k => allKeys.add(k)));
  const prs = [...allKeys].map(k => ({ name: EXERCISES[k].name, v: bestPR(k) })).filter(p => p.v > 0).sort((a, b) => b.v - a.v);
  $("pr-list").innerHTML = prs.length
    ? prs.map(p => `<div class="pr-row"><span class="pr-medal">🏆</span><span class="pr-name">${p.name}</span><span class="pr-val">${p.v} kg</span></div>`).join("")
    : `<div class="empty-mini">Registra qualche sessione per vedere i tuoi record qui.</div>`;
}

function projectionHTML() {
  const p = weightProjection();
  if (!p) return `<div class="goal-proj">📈 Registra il peso per qualche settimana per vedere la proiezione verso l'obiettivo.</div>`;
  if (!p.date) return `<div class="goal-proj warn">⚠️ Peso fermo o in calo: per la massa serve un piccolo surplus calorico. Vedi il coach nutrizione qui sotto.</div>`;
  const rate = p.ratePerWeek;
  const g = state.goals;
  let onTrack = "";
  if (g.targetDate) {
    onTrack = p.date <= g.targetDate
      ? ` — sei <strong>in linea</strong> con l'obiettivo ✅`
      : ` — un po' <strong>indietro</strong> sull'obiettivo, alza il surplus 💪`;
  }
  return `<div class="goal-proj">📈 Stai crescendo ~<strong>${rate.toFixed(2)} kg/sett</strong>: a questo ritmo arrivi a ${g.targetWeight} kg verso <strong>${fmtLong(p.date)}</strong>${onTrack}</div>`;
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
  $("nutrition-card").innerHTML = `
    <div class="nutri-head">Per costruire massa partendo da <strong>${n.bw} kg</strong> (BMR ${n.bmr} kcal):</div>
    <div class="nutri-grid">
      <div class="nutri-cell"><div class="nutri-num" style="color:#FF6B6B">${n.bulk}</div><div class="nutri-lbl">kcal / giorno</div></div>
      <div class="nutri-cell"><div class="nutri-num" style="color:#10B981">${n.protein}g</div><div class="nutri-lbl">Proteine</div></div>
      <div class="nutri-cell"><div class="nutri-num" style="color:#F59E0B">${n.carbs}g</div><div class="nutri-lbl">Carboidrati</div></div>
      <div class="nutri-cell"><div class="nutri-num" style="color:#0EA5E9">${n.fat}g</div><div class="nutri-lbl">Grassi</div></div>
    </div>
    <div class="nutri-note">Mantenimento stimato ~${n.tdee} kcal · per crescere punta a <strong>+${n.bulk - n.tdee} kcal</strong> di surplus. Le proteine (~1.9 g/kg) sono la priorità per il muscolo. Pesa ogni settimana e, se il peso non sale, aggiungi 100-150 kcal.</div>`;
}

function saveBW() {
  const v = parseFloat($("bw-input").value);
  if (!v || v < 30 || v > 250) { toast("Inserisci un peso valido (30–250 kg)"); return; }
  const today = todayStr();
  const existing = state.bodyweight.find(b => b.date === today);
  if (existing) existing.v = v;
  else state.bodyweight.push({ date: today, v });
  state.bodyweight.sort((a, b) => a.date.localeCompare(b.date));
  // se non c'è ancora un peso di partenza, impostalo
  if (state.goals.startWeight == null) state.goals.startWeight = v;
  saveState(state);
  $("bw-input").value = "";
  toast("⚖️ Peso registrato!");
  renderGoals();
}

function saveGoals() {
  const start = parseFloat($("g-start-input").value);
  const target = parseFloat($("g-target-input").value);
  state.goals.startWeight = isNaN(start) ? null : start;
  state.goals.targetWeight = isNaN(target) ? null : target;
  state.goals.note = $("g-note").value.trim();
  saveState(state);
  toast("🎯 Obiettivo aggiornato!");
  renderGoals();
}

/* ---------- COMPOSIZIONE CORPOREA ---------- */
const COMP_METRICS = [
  { key: "bodyFat",        lbl: "Grasso corp.",   unit: "%",   color: "#FF6B6B" },
  { key: "skeletalMuscle", lbl: "Massa musc.",    unit: "kg",  color: "#10B981" },
  { key: "boneMass",       lbl: "Massa ossea",    unit: "kg",  color: "#6b7280" },
  { key: "bodyWater",      lbl: "Acqua corp.",    unit: "%",   color: "#0EA5E9" },
  { key: "bmr",            lbl: "BMR",            unit: "kcal",color: "#F59E0B" },
  { key: "metabolicAge",   lbl: "Età metabolica", unit: "anni",color: "#8B5CF6" }
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
      if (d !== 0) delta = `<span class="comp-delta">${d > 0 ? '▲' : '▼'} ${Math.abs(d)}</span>`;
    }
    return `<div class="comp-card">
      <div class="comp-val" style="color:${m.color}">${v}<span class="comp-unit">${m.unit}</span></div>
      <div class="comp-lbl">${m.lbl}</div>${delta}
    </div>`;
  }).join("");
}

function renderCompChart() {
  const comp = (state.composition || []).slice().sort((a, b) => a.date.localeCompare(b.date));
  const host = $("comp-trend");
  if (charts.sparks) charts.sparks.forEach(c => c.destroy());
  charts.sparks = [];
  if (!comp.length) {
    host.innerHTML = `<div class="empty-mini">Aggiungi qualche misurazione per vedere il trend.</div>`;
    return;
  }
  // ogni metrica ha la SUA scala → si vede la variazione anche se piccola
  const metrics = [
    { key: "weight", lbl: "Peso", unit: " kg", suffix: "", color: "#FF2D95", upGood: true },
    { key: "skeletalMuscle", lbl: "Massa muscolare", unit: " kg", suffix: "", color: "#2BD576", upGood: true },
    { key: "bodyFat", lbl: "Grasso corporeo", unit: "", suffix: "%", color: "#FFB454", upGood: false }
  ];
  const labels = comp.map(c => fmtShort(c.date));

  host.innerHTML = metrics.map(m => {
    const vals = comp.map(c => c[m.key]).filter(v => v != null);
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
    return `<div class="spark-row">
      <div class="spark-head">
        <span class="spark-lbl" style="color:${m.color}">${m.lbl}</span>
        <span class="spark-val">${latest != null ? latest + m.suffix + m.unit : '—'} ${badge}</span>
      </div>
      <div class="spark-wrap"><canvas id="spark-${m.key}"></canvas></div>
    </div>`;
  }).join("");

  metrics.forEach(m => {
    const data = comp.map(c => c[m.key] ?? null);
    const nums = data.filter(v => v != null);
    if (!nums.length) return;
    const mn = Math.min(...nums), mx = Math.max(...nums);
    const pad = Math.max((mx - mn) * 0.6, Math.abs(mn) * 0.004, 0.25);   // margine per non schiacciare la linea
    charts.sparks.push(new Chart($("spark-" + m.key).getContext("2d"), {
      type: "line",
      data: { labels, datasets: [{ data, borderColor: m.color, backgroundColor: m.color + "22", pointRadius: 3, pointBackgroundColor: m.color, borderWidth: 2.5, tension: .3, fill: true, spanGaps: true }] },
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
  const num = (id) => { const v = parseFloat($(id).value); return isNaN(v) ? null : v; };
  const entry = {
    date: todayStr(),
    weight: num("c-weight"),
    bodyFat: num("c-fat"),
    skeletalMuscle: num("c-muscle"),
    boneMass: num("c-bone"),
    bodyWater: num("c-water"),
    bmr: num("c-bmr"),
    metabolicAge: num("c-metage")
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
  ["c-weight", "c-fat", "c-muscle", "c-bone", "c-water", "c-bmr", "c-metage"].forEach(id => $(id).value = "");
  toggleCompForm();
  toast("📊 Misurazione salvata!");
  renderGoals();
}

/* ---------- STORICO SESSIONI ---------- */
function renderHistory() {
  const list = $("history-list");
  const s = [...state.sessions].sort((a, b) => b.date.localeCompare(a.date));
  if (!s.length) { list.innerHTML = `<div class="empty-mini">Nessuna sessione registrata.</div>`; return; }
  list.innerHTML = s.map(sess => {
    const w = getWorkout(sess.workoutId);
    const nEx = Object.keys(sess.exercises || {}).length;
    const meta = [
      `${nEx} esercizi`,
      `${Math.round(sessionVolume(sess))} kg vol.`,
      sess.duration ? `${sess.duration} min` : null,
      sess.calories ? `${sess.calories} kcal` : null
    ].filter(Boolean).join(" · ");
    return `<div class="hist-card">
      <div class="hist-top">
        <span class="hist-dot" style="background:${w ? w.color : '#999'}"></span>
        <span class="hist-name">${w ? w.emoji + ' ' + w.name : 'Sessione'}</span>
        <span class="hist-date">${fmtShort(sess.date)}</span>
      </div>
      <div class="hist-meta">${meta}</div>
      ${sess.notes ? `<div class="hist-notes">📝 ${sess.notes}</div>` : ''}
    </div>`;
  }).join("");
}

/* ============================================================
   VISTA PASTI — registrazione nutrizione (inserimento manuale)
   ============================================================ */
const PROTEIN_TARGET = 150;   // g/die — obiettivo proteine fisso

function mealsFor(date) { return (state.meals && state.meals[date]) || []; }

function dayTotals(date) {
  return mealsFor(date).reduce((a, m) => {
    a.kcal += m.kcal || 0; a.protein += m.protein || 0; return a;
  }, { kcal: 0, protein: 0 });
}

// Semaforo proteine vs obiettivo 150 g: verde ≥150, giallo 100-149, rosso <100
function proteinColor(p) {
  if (p >= PROTEIN_TARGET) return "#2BD576";
  if (p >= 100) return "#FFB454";
  return "#FF4D6D";
}

function escapeMeal(s) {
  return String(s == null ? "" : s).replace(/[&<>"]/g, c => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;" }[c]));
}

function renderMeals() {
  renderMealSummary();
  renderMealList();
  renderMealTrend();
}

function renderMealSummary() {
  const t = dayTotals(todayStr());
  const pc = proteinColor(t.protein);
  const pct = Math.min(100, Math.round((t.protein / PROTEIN_TARGET) * 100));
  const goalKcal = nutritionTargets().bulk;
  $("meal-today").innerHTML = `
    <div class="meal-sum-row">
      <div class="meal-sum-cell">
        <div class="meal-sum-num" style="color:#FF6B6B">${t.kcal}</div>
        <div class="meal-sum-lbl">kcal oggi</div>
        <div class="meal-sum-sub">obiettivo ~${goalKcal}</div>
      </div>
      <div class="meal-sum-cell">
        <div class="meal-sum-num" style="color:${pc}">${t.protein}g</div>
        <div class="meal-sum-lbl">proteine oggi</div>
        <div class="meal-sum-sub">obiettivo ${PROTEIN_TARGET}g</div>
      </div>
    </div>
    <div class="meal-prog">
      <div class="progress-top">
        <span class="progress-label">Proteine ${t.protein} / ${PROTEIN_TARGET} g</span>
        <span class="progress-count" style="color:${pc}">${pct}%</span>
      </div>
      <div class="progress-bar"><div class="progress-fill" style="width:${pct}%;background:${pc};box-shadow:0 0 12px ${pc}"></div></div>
    </div>`;
}

function renderMealList() {
  const meals = [...mealsFor(todayStr())].sort((a, b) => (a.t || "").localeCompare(b.t || ""));
  const el = $("meal-list");
  if (!meals.length) {
    el.innerHTML = `<div class="empty-mini">Nessun pasto registrato oggi. Aggiungine uno qui sopra. 🍽️</div>`;
    return;
  }
  el.innerHTML = meals.map(m => `
    <div class="meal-card">
      <div class="meal-card-main">
        <div class="meal-card-text">${escapeMeal(m.text)}</div>
        <div class="meal-card-meta">🔥 ${m.kcal || 0} kcal · 💪 ${m.protein || 0}g prot.${m.t ? ` · ${m.t}` : ""}</div>
      </div>
      <button class="meal-del" onclick="deleteMeal(${m.id})" title="Elimina">✕</button>
    </div>`).join("");
}

function saveMeal() {
  const text = $("meal-text").value.trim();
  const kcal = parseInt($("meal-kcal").value);
  const prot = parseInt($("meal-prot").value);
  if (!text) { toast("Scrivi cosa hai mangiato 🍽️"); return; }
  if (isNaN(kcal) && isNaN(prot)) { toast("Inserisci almeno kcal o proteine"); return; }
  const day = todayStr();
  state.meals = state.meals || {};
  state.meals[day] = state.meals[day] || [];
  state.meals[day].push({
    id: Date.now(),
    text,
    kcal: isNaN(kcal) ? 0 : Math.max(0, kcal),
    protein: isNaN(prot) ? 0 : Math.max(0, prot),
    t: new Date().toTimeString().slice(0, 5)
  });
  saveState(state);
  $("meal-text").value = ""; $("meal-kcal").value = ""; $("meal-prot").value = "";
  toast("🍽️ Pasto salvato!");
  renderMeals();
}

function deleteMeal(id) {
  const day = todayStr();
  if (!state.meals || !state.meals[day]) return;
  state.meals[day] = state.meals[day].filter(m => m.id !== id);
  saveState(state);
  renderMeals();
}

function renderMealTrend() {
  const host = $("meal-trend");
  if (charts.mealK) charts.mealK.destroy();
  if (charts.mealP) charts.mealP.destroy();

  const days = [];
  for (let i = 6; i >= 0; i--) {
    const d = new Date(); d.setDate(d.getDate() - i);
    days.push(d.toISOString().split("T")[0]);
  }
  const kcals = days.map(d => dayTotals(d).kcal);
  const prots = days.map(d => dayTotals(d).protein);
  const loggedDays = days.filter(d => mealsFor(d).length).length;

  if (!loggedDays) {
    host.innerHTML = `<div class="empty-mini">Registra qualche pasto per vedere l'andamento. Qui appariranno le medie giornaliere di calorie e proteine degli ultimi 7 giorni.</div>`;
    return;
  }

  const avgK = Math.round(kcals.reduce((a, b) => a + b, 0) / loggedDays);
  const avgP = Math.round(prots.reduce((a, b) => a + b, 0) / loggedDays);
  const labels = days.map(d => new Date(d + "T00:00:00").toLocaleDateString("it-IT", { weekday: "short" }));

  host.innerHTML = `
    <div class="meal-avg">Media giornaliera (${loggedDays} ${loggedDays === 1 ? "giorno" : "giorni"} registrat${loggedDays === 1 ? "o" : "i"}): <strong style="color:#FF6B6B">${avgK} kcal</strong> · <strong style="color:${proteinColor(avgP)}">${avgP}g proteine</strong></div>
    <div class="spark-row">
      <div class="spark-head"><span class="spark-lbl" style="color:#FF6B6B">Calorie</span><span class="spark-val">${avgK} kcal/die</span></div>
      <div class="spark-wrap" style="height:90px"><canvas id="meal-k-chart"></canvas></div>
    </div>
    <div class="spark-row">
      <div class="spark-head"><span class="spark-lbl" style="color:#2BD576">Proteine</span><span class="spark-val">obiettivo ${PROTEIN_TARGET}g</span></div>
      <div class="spark-wrap" style="height:90px"><canvas id="meal-p-chart"></canvas></div>
    </div>`;

  charts.mealK = new Chart($("meal-k-chart").getContext("2d"), {
    type: "bar",
    data: { labels, datasets: [{ data: kcals, backgroundColor: "rgba(255,107,107,.8)", borderRadius: 5 }] },
    options: { plugins: { legend: { display: false } }, scales: { y: { beginAtZero: true, grid: { color: "rgba(255,255,255,.08)" } }, x: { grid: { display: false } } }, responsive: true, maintainAspectRatio: false }
  });
  charts.mealP = new Chart($("meal-p-chart").getContext("2d"), {
    type: "bar",
    data: { labels, datasets: [{ data: prots, backgroundColor: prots.map(p => proteinColor(p) + "cc"), borderRadius: 5 }] },
    options: { plugins: { legend: { display: false } }, scales: { y: { beginAtZero: true, suggestedMax: Math.max(PROTEIN_TARGET, ...prots), grid: { color: "rgba(255,255,255,.08)" } }, x: { grid: { display: false } } }, responsive: true, maintainAspectRatio: false }
  });
}

/* ============================================================
   VISTA GUIDA
   ============================================================ */
function buildGuides() {
  const cont = $("guide-cards");
  guides.forEach((g, i) => {
    const card = document.createElement("div");
    card.className = "guide-card";
    let body = "";
    if (g.steps) body = g.steps.map((s, idx) => `<div class="guide-step"><div class="step-num">${idx + 1}</div><div class="step-text">${s.text}</div></div>`).join("");
    else if (g.errors) body = g.errors.map(e => `<div class="error-item"><div class="error-icon">${e.icon}</div><div class="error-content"><div class="error-title">${e.title}</div><div class="error-desc">${e.desc}</div></div></div>`).join("");
    card.innerHTML = `
      <div class="guide-card-header" onclick="toggleGuide(${i})">
        <div class="guide-icon" style="background:${g.iconBg}">${g.icon}</div>
        <div><div class="guide-title">${g.title}</div><div class="guide-sub">${g.sub}</div></div>
        <span class="guide-chevron">▾</span>
      </div>
      <div class="guide-body">${body}</div>`;
    cont.appendChild(card);
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

let toastTimer = null;
function toast(msg) {
  const t = $("toast");
  t.textContent = msg;
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
renderWorkoutChips();
renderWorkout();
