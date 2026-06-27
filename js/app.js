/* ============================================================
   APP — logica, viste, navigazione
   ============================================================ */

let state = loadState();
let currentWorkoutId = WORKOUTS[0].id;
let timers = {};
let calRef = new Date();          // mese mostrato nel calendario
let charts = {};                  // istanze Chart.js

/* ---------- UTIL ---------- */
const $ = (id) => document.getElementById(id);
const todayStr = () => new Date().toISOString().split("T")[0];
const fmtShort = (str) => {
  const d = new Date(str + "T00:00:00");
  return d.toLocaleDateString("it-IT", { day: "numeric", month: "short" });
};
const getWorkout = (id) => WORKOUTS.find(w => w.id === id);

// Migliore peso (PR) mai registrato per un esercizio
function bestPR(exKey) {
  let best = 0;
  state.sessions.forEach(s => {
    const sets = s.weights[exKey];
    if (sets) sets.forEach(v => { if (v > best) best = v; });
  });
  return best;
}

// Volume totale (kg) di una sessione
function sessionVolume(s) {
  let tot = 0;
  Object.values(s.weights).forEach(sets => sets.forEach(v => { tot += v || 0; }));
  return tot;
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
  exList.forEach((ex, i) => {
    const [badgeClass, badgeLabel] = badgeMap[ex.type];
    const repsLabel = ex.time ? ex.time : `${ex.reps} rip.`;
    const pr = bestPR(ex.key);
    const saved = sess && sess.weights[ex.key] ? sess.weights[ex.key] : [null, null, null];

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
          <div class="silhouette">${svgSilhouettes[ex.bodyPart]}</div>
          <div class="muscle-info">
            <div class="muscle-primary">Muscolo target: ${ex.muscle}</div>
            <div class="muscle-secondary">Secondari: ${ex.secondary}</div>
          </div>
        </div>
        <div class="sets-row">
          <div class="set-pill"><div class="set-pill-num">${ex.sets}</div><div class="set-pill-lbl">Serie</div></div>
          <div class="set-pill"><div class="set-pill-num">${repsLabel}</div><div class="set-pill-lbl">${ex.time ? 'Durata' : 'Rip.'}</div></div>
          <div class="set-pill"><div class="set-pill-num">${ex.rest}</div><div class="set-pill-lbl">Riposo</div></div>
        </div>
        <div class="tip-box">
          <div class="tip-label">⚠️ Errore comune</div>
          <div class="tip-text">${ex.tip}</div>
        </div>
        ${ex.time ? '' : `
        <div class="weight-section">
          <div class="weight-label">Peso usato oggi (kg)${pr ? ` · record: <strong>${pr} kg</strong>` : ''}</div>
          <div class="weight-sets">
            ${[0, 1, 2].map(s => `
              <div class="weight-input-group">
                <div class="weight-input-lbl">Serie ${s + 1}</div>
                <input class="weight-input" type="number" inputmode="decimal" data-ex="${ex.key}" data-set="${s}"
                       value="${saved[s] != null ? saved[s] : ''}" placeholder="—" min="0" max="500" step="2.5"
                       oninput="checkDone(${i})">
              </div>`).join("")}
          </div>
        </div>`}
        <div class="rest-row">
          <span class="rest-info">${ex.time ? '⏱ Timer plank' : '🔄 Timer riposo'}</span>
          <button class="rest-timer-btn" onclick="startTimer(${i}, ${ex.time ? 30 : 90}, this)">Inizia ${ex.time ? 30 : 90}"</button>
          <span class="timer-display" id="timer-${i}"></span>
        </div>
      </div>`;
    cont.appendChild(card);
  });

  updateProgress();
}

function toggleCard(i) { $(`ex-${i}`).classList.toggle("open"); }

function startTimer(i, seconds, btn) {
  if (timers[i]) {
    clearInterval(timers[i]); timers[i] = null;
    btn.textContent = `Inizia ${seconds}"`;
    $(`timer-${i}`).textContent = "";
    return;
  }
  let rem = seconds;
  $(`timer-${i}`).textContent = rem + '"';
  btn.textContent = "Stop";
  timers[i] = setInterval(() => {
    rem--;
    const el = $(`timer-${i}`);
    if (rem <= 0) {
      clearInterval(timers[i]); timers[i] = null;
      el.textContent = "✓ Via!";
      btn.textContent = `Inizia ${seconds}"`;
      setTimeout(() => { el.textContent = ""; }, 2000);
    } else {
      el.textContent = rem + '"';
    }
  }, 1000);
}

function checkDone(i) {
  const card = $(`ex-${i}`);
  const inputs = card.querySelectorAll(".weight-input");
  const filled = [...inputs].filter(inp => inp.value.trim() !== "").length;
  const num = $(`exnum-${i}`);
  if (filled === inputs.length && inputs.length > 0) {
    num.style.background = "#10B981";
    num.textContent = "✓";
  } else {
    num.style.background = "";
    num.textContent = i + 1;
  }
  // PR highlight
  inputs.forEach(inp => {
    const v = parseFloat(inp.value);
    const pr = bestPR(inp.dataset.ex);
    inp.classList.toggle("is-pr", !isNaN(v) && v > 0 && v >= pr && pr > 0);
  });
  updateProgress();
}

function updateProgress() {
  const cards = document.querySelectorAll("#ex-cards .ex-card");
  let done = 0;
  cards.forEach((card) => {
    const inputs = card.querySelectorAll(".weight-input");
    if (inputs.length === 0) {
      // plank: conta se il timer è stato avviato? lo lasciamo opzionale → conta sempre come fatto se altri completi
      return;
    }
    const filled = [...inputs].filter(inp => inp.value.trim() !== "").length;
    if (filled === inputs.length) done++;
  });
  const total = [...cards].filter(c => c.querySelectorAll(".weight-input").length > 0).length;
  $("prog-count").textContent = `${done} / ${total}`;
  $("prog-bar").style.width = (total ? Math.round((done / total) * 100) : 0) + "%";
}

function saveSession() {
  const w = getWorkout(currentWorkoutId);
  const weights = {};
  let any = false;
  document.querySelectorAll("#ex-cards .weight-input").forEach(inp => {
    const k = inp.dataset.ex, s = +inp.dataset.set;
    const v = parseFloat(inp.value) || 0;
    if (!weights[k]) weights[k] = [0, 0, 0];
    weights[k][s] = v;
    if (v > 0) any = true;
  });
  if (!any) { toast("Inserisci almeno un peso prima di salvare 💪"); return; }

  // PR check (prima di salvare lo storico)
  const newPRs = [];
  Object.keys(weights).forEach(k => {
    const prev = bestPR(k);
    const max = Math.max(...weights[k]);
    if (max > prev && prev > 0) newPRs.push(EXERCISES[k].name);
  });

  const existing = todaySession(w.id);
  const notes = $("log-notes").value.trim();
  if (existing) {
    existing.weights = weights;
    existing.notes = notes;
  } else {
    state.sessions.push({
      id: Date.now(), date: todayStr(), workoutId: w.id, weights, notes
    });
  }
  // segna il giorno come fatto nel calendario
  state.schedule[todayStr()] = { workoutId: w.id, done: true };
  saveState(state);

  let msg = "✅ Sessione salvata!";
  if (newPRs.length) msg = `🏆 Nuovo record su ${newPRs.join(", ")}!`;
  toast(msg);
  renderWorkout();
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
          <span class="up-name">${w.emoji} ${w.name}</span>
          <span class="up-status">${s.done ? '✓ fatto' : 'programmato'}</span>
        </div>`;
      }).join("")
    : `<div class="empty-mini">Nessun allenamento programmato. Tocca un giorno per aggiungerlo.</div>`;
}

function calNav(delta) { calRef.setMonth(calRef.getMonth() + delta); renderCalendar(); }

function openDay(ds) {
  const sched = state.schedule[ds];
  const d = new Date(ds + "T00:00:00").toLocaleDateString("it-IT", { weekday: "long", day: "numeric", month: "long" });
  $("modal-title").textContent = d.charAt(0).toUpperCase() + d.slice(1);
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
  $("modal").classList.add("show");
}

function assignDay(ds, workoutId) {
  const prev = state.schedule[ds];
  state.schedule[ds] = { workoutId, done: prev ? prev.done : false };
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
  const allKeys = new Set(); s.forEach(x => Object.keys(x.weights).forEach(k => allKeys.add(k)));
  allKeys.forEach(k => { if (bestPR(k) > 0) prCount++; });

  $("stat-sessions").textContent = s.length;
  $("stat-week").textContent = thisWeek;
  $("stat-pr").textContent = prCount;

  // popola select esercizi (solo quelli loggati)
  const sel = $("ex-select");
  const loggedKeys = [...allKeys];
  sel.innerHTML = loggedKeys.length
    ? loggedKeys.map(k => `<option value="${k}">${EXERCISES[k].name}</option>`).join("")
    : `<option value="">Nessun dato ancora</option>`;

  renderVolumeChart();
  renderExChart();
  renderBWChart();
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
  if (!k) return;
  const pts = [...state.sessions]
    .filter(s => s.weights[k])
    .sort((a, b) => a.date.localeCompare(b.date))
    .map(s => {
      const sets = s.weights[k].filter(v => v > 0);
      return { d: fmtShort(s.date), avg: sets.length ? +(sets.reduce((a, b) => a + b, 0) / sets.length).toFixed(1) : null };
    }).filter(p => p.avg != null);
  if (!pts.length) return;
  charts.ex = new Chart(ctx, {
    type: "line",
    data: {
      labels: pts.map(p => p.d),
      datasets: [{ data: pts.map(p => p.avg), borderColor: "#FF6B6B", backgroundColor: "rgba(255,107,107,.1)", borderWidth: 2, pointRadius: 4, pointBackgroundColor: "#FF6B6B", fill: true, tension: .3 }]
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
function renderGoals() {
  const bw = state.bodyweight;
  const cur = bw.length ? bw[bw.length - 1].v : null;
  const g = state.goals;

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
      <div class="goal-delta">${done >= 0 ? '+' : ''}${done.toFixed(1)} kg dall'inizio · mancano ${(g.targetWeight - cur).toFixed(1)} kg</div>`;
    wrap.style.display = "block";
  } else {
    wrap.style.display = "none";
  }

  // lista PR
  const allKeys = new Set();
  state.sessions.forEach(x => Object.keys(x.weights).forEach(k => allKeys.add(k)));
  const prs = [...allKeys].map(k => ({ name: EXERCISES[k].name, v: bestPR(k) })).filter(p => p.v > 0).sort((a, b) => b.v - a.v);
  $("pr-list").innerHTML = prs.length
    ? prs.map(p => `<div class="pr-row"><span class="pr-medal">🏆</span><span class="pr-name">${p.name}</span><span class="pr-val">${p.v} kg</span></div>`).join("")
    : `<div class="empty-mini">Registra qualche sessione per vedere i tuoi record qui.</div>`;
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
