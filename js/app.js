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
const getWorkout = (id) => WORKOUTS.find(w => w.id === id);

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

// TRAGUARDI (badge)
const BADGES = [
  { id: "start",   icon: "🌱", name: "Si comincia!",        test: () => state.sessions.length >= 1 },
  { id: "s10",     icon: "💪", name: "10 allenamenti",      test: () => state.sessions.length >= 10 },
  { id: "s25",     icon: "🏅", name: "25 allenamenti",      test: () => state.sessions.length >= 25 },
  { id: "s50",     icon: "🏆", name: "50 allenamenti",      test: () => state.sessions.length >= 50 },
  { id: "streak2", icon: "🔥", name: "2 settimane di fila", test: () => weekStreak() >= 2 },
  { id: "streak4", icon: "🔥", name: "1 mese di costanza",  test: () => weekStreak() >= 4 },
  { id: "streak8", icon: "⚡", name: "2 mesi inarrestabile",test: () => weekStreak() >= 8 },
  { id: "pr5",     icon: "📈", name: "5 record personali",  test: () => prCount() >= 5 },
  { id: "gain2",   icon: "🍽️", name: "+2 kg di massa",      test: () => massGain() >= 2 },
  { id: "gain5",   icon: "💥", name: "+5 kg di massa",      test: () => massGain() >= 5 },
  { id: "goal",    icon: "👑", name: "Obiettivo raggiunto!",test: () => { const c = currentBW(), t = state.goals.targetWeight; return c != null && t != null && c >= t; } }
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

  if (!last) {
    return { last: null, todayHtml: `Scegli un peso che ti dia serie pulite`,
             color: "gray", targetW: null, targetReps: meta.reps };
  }

  const w = Math.max(...last.sets.map(s => s.w));
  const minR = Math.min(...last.sets.map(s => s.r));
  const nSets = last.sets.length;
  const q = last.quality;
  const day = new Date(last.date + "T00:00:00").toLocaleDateString("it-IT", { weekday: "long" });
  const base = { last, lastW: w, lastR: minR, lastSets: nSets, day };

  // ❌ non completato / forma persa
  if (q === "fail") {
    if (minR < 10) {
      const nw = Math.max(0, +(w - inc).toFixed(1));
      return { ...base, todayHtml: `Scendi di peso e ritrova la tecnica`, color: "red", targetW: nw, targetReps: meta.reps };
    }
    return { ...base, todayHtml: `Resta su questo peso e cura la forma`, color: "yellow", targetW: w, targetReps: minR };
  }
  // ⚠️ completato ma faticoso
  if (q === "hard") {
    return { ...base, todayHtml: `Conferma il carico e consolida`, color: "yellow", targetW: w, targetReps: minR };
  }
  // ✅ pulito (o non indicato) → progressione
  if (nSets < meta.sets) {
    return { ...base, todayHtml: `Aggiungi una serie in più 🎯`, color: "green", targetW: w, targetReps: minR };
  }
  if (minR >= 15) {
    const nw = +(w + inc).toFixed(1);
    return { ...base, todayHtml: `Aumenta il peso oggi 🎯`, color: "green", targetW: nw, targetReps: 12 };
  }
  if (minR >= 12) {
    return { ...base, todayHtml: `Prova ad aggiungere qualche ripetizione 🎯`, color: "green", targetW: w, targetReps: minR + 1 };
  }
  if (minR < 10) {
    return { ...base, todayHtml: `Mantieni il peso e punta alla forma pulita`, color: "yellow", targetW: w, targetReps: meta.reps };
  }
  // 10-11 reps → consolida
  return { ...base, todayHtml: `Consolida fino a serie piene 🎯`, color: "green", targetW: w, targetReps: 12 };
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
  $("workout-hero").style.background = w.color;
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

    const card = document.createElement("div");
    card.className = "ex-card";
    card.id = `ex-${i}`;
    card.innerHTML = `
      <div class="ex-header" onclick="toggleCard(${i})">
        <div class="ex-num" id="exnum-${i}">${i + 1}</div>
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
            <button class="qbtn qbtn-clean ${qsel === 'clean' ? 'on' : ''}" onclick="setQuality('${ex.key}','clean',this)">✅ Pulito</button>
            <button class="qbtn qbtn-hard ${qsel === 'hard' ? 'on' : ''}" onclick="setQuality('${ex.key}','hard',this)">⚠️ Faticoso</button>
            <button class="qbtn qbtn-fail ${qsel === 'fail' ? 'on' : ''}" onclick="setQuality('${ex.key}','fail',this)">❌ Non finito</button>
          </div>
        </div>`}
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
    num.style.background = "#10B981";
    num.textContent = "✓";
  } else {
    num.style.background = "";
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

function updateProgress() {
  const cards = document.querySelectorAll("#ex-cards .ex-card");
  let done = 0, total = 0;
  cards.forEach((card) => {
    const ws = card.querySelectorAll(".setw");
    if (ws.length === 0) return;   // plank: nessun peso
    total++;
    const filled = [...ws].filter(inp => inp.value.trim() !== "").length;
    if (filled === ws.length) done++;
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
    <button class="btn-save" style="margin-top:16px" onclick="closeModal()">Chiudi</button>`;
  $("modal").classList.add("show");
}

/* ============================================================
   MODALITÀ ALLENAMENTO GUIDATA
   ============================================================ */
let guided = null;

const G_MOTTOS = [
  "Una macchina alla volta, stai andando alla grande! 🔥",
  "Bella serie! Avanti con la prossima 💪",
  "Sei in pieno flow, non mollare 🚀",
  "Ogni esercizio è un mattone verso i 70 kg 🧱",
  "Concentrato e preciso: così si cresce 🎯",
  "Quasi fatto, dai il meglio anche qui ⚡",
  "Stai costruendo il tuo fisico, serie dopo serie 🛠️"
];

function restSec(meta) { const n = parseInt(meta && meta.rest); return Math.min(60, isNaN(n) ? 60 : n); }
function gMeta() { return EXERCISES[guided.keys[guided.exIndex]]; }
function gKey() { return guided.keys[guided.exIndex]; }

const GUIDED_KEY = "guided_session_v2";
function guidedSnapshot() {
  return { workoutId: guided.workoutId, keys: guided.keys, exIndex: guided.exIndex, setIndex: guided.setIndex, phase: guided.phase, data: guided.data, next: guided.next, restLeft: guided.restLeft };
}
function saveGuided() { try { localStorage.setItem(GUIDED_KEY, JSON.stringify(guidedSnapshot())); } catch (e) {} }
function loadGuided() { try { const r = localStorage.getItem(GUIDED_KEY); return r ? JSON.parse(r) : null; } catch (e) { return null; } }
function clearGuided() { localStorage.removeItem(GUIDED_KEY); }

function startGuided() {
  clearGuided();
  const w = getWorkout(currentWorkoutId);
  guided = { workoutId: w.id, keys: w.exercises.slice(), exIndex: 0, setIndex: 0, phase: "set", data: {}, timer: null, next: null, restLeft: 0 };
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
  // se era in riposo, alla ripresa si riparte direttamente dalla serie successiva
  if (guided.phase === "rest" && guided.next) {
    guided.exIndex = guided.next.exIndex; guided.setIndex = guided.next.setIndex; guided.phase = "set";
  }
  saveGuided();
  closeGuidedOverlay();
  renderWorkout();
}

function resumeGuided() {
  const snap = loadGuided();
  if (!snap) return;
  guided = Object.assign({ timer: null }, snap);
  currentWorkoutId = guided.workoutId;
  renderWorkoutChips();
  $("guided").classList.add("show");
  document.body.style.overflow = "hidden";
  renderGuided();
}

function discardGuided() {
  clearGuided();
  renderWorkout();
  toast("Allenamento in pausa eliminato");
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

function renderGuided() {
  const meta = gMeta(), key = gKey();
  const N = guided.keys.length;
  const totalSets = meta.sets;
  const isNext = guided.phase === "nextex";
  const pct = isNext
    ? Math.round(((guided.exIndex + 1) / N) * 100)
    : Math.round(((guided.exIndex + (guided.setIndex / totalSets)) / N) * 100);
  const progTxt = isNext
    ? `Esercizio ${guided.exIndex + 1}/${N} completato 💪`
    : `Esercizio ${guided.exIndex + 1}/${N} · Serie ${Math.min(guided.setIndex + 1, totalSets)}/${totalSets}`;
  const top = `
    <div class="g-top">
      <button class="g-close" onclick="pauseGuided()">✕</button>
      <div class="g-prog">${progTxt}</div>
    </div>
    <div class="g-bar"><div class="g-bar-fill" style="width:${pct}%"></div></div>`;

  let body = "";
  if (guided.phase === "nextex") {
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
        <button class="g-done" onclick="applyNext()">Vai → ${nmeta.name}</button>
      </div>`;
  } else if (guided.phase === "rest") {
    const n = guided.next;
    const nextLbl = n.exIndex === guided.exIndex
      ? `Serie ${n.setIndex + 1} di ${meta.name}`
      : `${EXERCISES[guided.keys[n.exIndex]].name}`;
    body = `
      <div class="g-body g-rest">
        <div class="g-rest-lbl">Recupero</div>
        <div class="g-rest-time" id="g-rest">${guided.restLeft}"</div>
        <button class="g-skip" onclick="skipRest()">Salta riposo →</button>
        <div class="g-next">Poi: <strong>${nextLbl}</strong></div>
      </div>`;
  } else if (guided.phase === "quality") {
    body = `
      <div class="g-body">
        <div class="g-name">${meta.name}</div>
        <div class="g-qq">Com'è andata? Serve per il consiglio della prossima volta.</div>
        <div class="g-qcol">
          <button class="g-qbtn clean" onclick="guidedQuality('clean')">✅ Pulito fino alla fine</button>
          <button class="g-qbtn hard" onclick="guidedQuality('hard')">⚠️ Completato ma faticoso</button>
          <button class="g-qbtn fail" onclick="guidedQuality('fail')">❌ Non completato / forma persa</button>
        </div>
      </div>`;
  } else if (meta.time) {
    // plank: hold a tempo
    body = `
      <div class="g-body">
        <img class="g-gif" src="assets/gifs/${key}.gif" onerror="this.style.display='none'">
        <div class="g-name">${meta.name}</div>
        <div class="g-muscle">${meta.muscle}</div>
        <div class="g-rest-time" id="g-hold">${parseInt(meta.time) || 30}"</div>
        <button class="g-done" id="g-holdbtn" onclick="guidedHold()">▶︎ Avvia ${parseInt(meta.time) || 30}"</button>
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
        <div class="g-muscle">${meta.muscle}</div>
        <div class="g-sugg sugg-${sug.color}"><span class="sugg-label">Oggi:</span> ${sug.todayHtml}</div>
        <div class="g-inputs">
          <div class="g-ig"><div class="g-ilbl">Peso (kg)</div><input id="g-w" type="number" inputmode="decimal" value="${prevW}" min="0" max="500" step="2.5"></div>
          <div class="g-ix">×</div>
          <div class="g-ig"><div class="g-ilbl">Ripetizioni</div><input id="g-r" type="number" inputmode="numeric" value="${prevR}" min="0" max="50"></div>
        </div>
        <button class="g-done" onclick="guidedCompleteSet()">✓ Serie completata</button>
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
    gStore(key).sets.push({ w: wv, r: isNaN(rv) ? meta.reps : rv });
  }
  if (guided.setIndex < meta.sets - 1) {
    startRest(restSec(meta), { exIndex: guided.exIndex, setIndex: guided.setIndex + 1 });
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
  gStore(gKey()).quality = q;
  goNextExercise();
}

function goNextExercise() {
  const ni = guided.exIndex + 1;
  if (ni >= guided.keys.length) { finishGuided(); return; }
  guided.next = { exIndex: ni, setIndex: 0 };
  guided.phase = "nextex";
  renderGuided();
}

function startRest(sec, next) {
  guided.phase = "rest";
  guided.next = next;
  guided.restLeft = sec;
  renderGuided();
  if (guided.timer) clearInterval(guided.timer);
  guided.timer = setInterval(() => {
    guided.restLeft--;
    const el = $("g-rest");
    if (guided.restLeft <= 0) { clearInterval(guided.timer); guided.timer = null; endRest(); }
    else if (el) el.textContent = guided.restLeft + '"';
  }, 1000);
}

function skipRest() { if (guided.timer) clearInterval(guided.timer); guided.timer = null; endRest(); }

function applyNext() {
  if (guided.timer) { clearInterval(guided.timer); guided.timer = null; }
  guided.exIndex = guided.next.exIndex;
  guided.setIndex = guided.next.setIndex;
  guided.phase = "set";
  renderGuided();
}
function endRest() { applyNext(); }

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
        ${w ? `<span class="cal-dot" style="background:${w.color}">${sched.done ? '✓' : w.emoji}</span>` : ''}
      </div>`;
  }
  $("cal-grid").innerHTML = html;

  // prossimi allenamenti programmati
  const upcoming = Object.entries(state.schedule)
    .filter(([d]) => d >= todayStr())
    .sort((a, b) => a[0].localeCompare(b[0]))
    .slice(0, 5);
  $("cal-upcoming").innerHTML = upcoming.length
    ? upcoming.map(([d, s]) => {
        const w = getWorkout(s.workoutId);
        return `<div class="up-row">
          <span class="up-dot" style="background:${w.color}"></span>
          <span class="up-date">${fmtShort(d)}</span>
          <span class="up-name">${w.emoji} ${w.name}${s.note ? ` <span class="up-note">· ${s.note}</span>` : ''}</span>
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
        ${WORKOUTS.map(w => `
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
    ${s.notes ? `<div class="sd-notes">📝 ${s.notes}</div>` : ''}`;
}

function assignDay(ds, workoutId) {
  const prev = state.schedule[ds];
  state.schedule[ds] = { workoutId, done: prev ? prev.done : false };
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
  renderBWChart();
  renderHistory();
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
      datasets: [{ data: s.map(sessionVolume), backgroundColor: "rgba(255,107,107,.75)", borderRadius: 6 }]
    },
    options: { plugins: { legend: { display: false } }, scales: { y: { beginAtZero: true, grid: { color: "#f0f0f0" } }, x: { grid: { display: false } } }, responsive: true }
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
      datasets: [{ data: pts.map(p => p.v), borderColor: "#FF6B6B", backgroundColor: "rgba(255,107,107,.1)", borderWidth: 2, pointRadius: 4, pointBackgroundColor: "#FF6B6B", fill: true, tension: .3 }]
    },
    options: { plugins: { legend: { display: false } }, scales: { y: { beginAtZero: false, grid: { color: "#f0f0f0" } }, x: { grid: { display: false } } }, responsive: true }
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
      datasets: [{ data: bw.map(b => b.v), borderColor: "#8B5CF6", backgroundColor: "rgba(139,92,246,.1)", borderWidth: 2, pointRadius: 4, pointBackgroundColor: "#8B5CF6", fill: true, tension: .3 }]
    },
    options: { plugins: { legend: { display: false } }, scales: { y: { grid: { color: "#f0f0f0" } }, x: { grid: { display: false } } }, responsive: true }
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
    return `<div class="badge ${on ? 'on' : 'off'}" title="${b.name}">
      <span class="badge-i">${on ? b.icon : '🔒'}</span>
      <span class="badge-n">${b.name}</span>
    </div>`;
  }).join("");
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
setDate();
renderWorkoutChips();
renderWorkout();
buildGuides();
