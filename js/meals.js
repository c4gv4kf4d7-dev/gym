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
  renderMealHistory();
}

// Storico pasti PER SETTIMANE, con menu a tendina del mese (stile Wrapped)
let mealHistMonth = null;
function renderMealHistory() {
  const host = $("meal-history");
  if (!host) return;
  const t = todayStr();
  const days = Object.keys(state.meals || {})
    .filter(d => d <= t && (state.meals[d] || []).length)
    .sort();
  if (!days.length) { host.innerHTML = `<div class="empty-mini">Lo storico si riempie dal primo giorno di tracking.</div>`; return; }

  // mesi disponibili (dal più recente) + tendina
  const months = [...new Set(days.map(d => d.slice(0, 7)))].sort().reverse();
  if (!mealHistMonth || !months.includes(mealHistMonth)) mealHistMonth = months[0];
  const monthLbl = (mk) => {
    const d = new Date(mk + "-01T00:00:00");
    const s = d.toLocaleDateString("it-IT", { month: "long", year: "numeric" });
    return s.charAt(0).toUpperCase() + s.slice(1);
  };
  const selHTML = `<select class="chart-select" onchange="mealHistMonth=this.value;renderMealHistory()">
    ${months.map(m => `<option value="${m}" ${m === mealHistMonth ? "selected" : ""}>${monthLbl(m)}</option>`).join("")}
  </select>`;

  // aggrega per settimana (lun→dom) il mese scelto
  const byWeek = {};
  days.filter(d => d.slice(0, 7) === mealHistMonth).forEach(d => {
    (byWeek[weekStart(d)] = byWeek[weekStart(d)] || []).push(d);
  });
  const kT = kcalTarget(), pT = proteinTarget();
  const rows = Object.keys(byWeek).sort().reverse().map(wk => {
    const ds = byWeek[wk];
    const kAvg = Math.round(ds.reduce((a, d) => a + dayTotals(d).kcal, 0) / ds.length);
    const pAvg = Math.round(ds.reduce((a, d) => a + dayTotals(d).protein, 0) / ds.length);
    const end = new Date(wk + "T00:00:00"); end.setDate(end.getDate() + 6);
    const col = mealWeekColor(ds.map(d => dayTotals(d)), kT, pT, wk === weekStart(t));
    return `<div class="mh-row mh-tap" onclick="mealWeekDetail('${wk}')">
      <span class="mh-date">${fmtShort(wk)} – ${fmtShort(localDate(end))}</span>
      <span class="mh-val">🔥 <b class="mh-c${col}">${kAvg}</b></span>
      <span class="mh-val">💪 <b class="mh-c${col}">${pAvg} g</b></span>
    </div>`;
  }).join("");
  host.innerHTML = selHTML + rows;
}

/* Semaforo della settimana pasti (funzione pura):
   🔴 almeno un giorno con ENTRAMBI gli obiettivi mancati
   🟢 tutti i giorni tracciati centrano entrambi (per le settimane passate
      servono 7/7; quella corrente è verde anche se non è finita)
   🟡 tutto il resto */
function mealWeekColor(totals, kT, pT, isCurrent) {
  const perDay = totals.map(x => ({ k: x.kcal >= kT * 0.9, p: x.protein >= pT }));
  if (perDay.some(x => !x.k && !x.p)) return "red";
  const allBoth = perDay.length > 0 && perDay.every(x => x.k && x.p);
  if (allBoth && (isCurrent || perDay.length === 7)) return "green";
  return "yellow";
}

// Tocca una settimana → dettaglio giorno per giorno
function mealWeekDetail(wk) {
  const kT = kcalTarget(), pT = proteinTarget();
  const end = new Date(wk + "T00:00:00"); end.setDate(end.getDate() + 6);
  $("modal-title").textContent = `${fmtShort(wk)} – ${fmtShort(localDate(end))}`;
  let rows = "";
  for (let i = 0; i < 7; i++) {
    const d = new Date(wk + "T00:00:00"); d.setDate(d.getDate() + i);
    const ds = localDate(d);
    if (ds > todayStr()) break;
    const tracked = (state.meals[ds] || []).length > 0;
    if (!tracked) {
      rows += `<div class="mh-row"><span class="mh-date">${fmtShort(ds)}</span><span class="mh-val mh-dim">— non tracciato</span><span class="mh-val"></span></div>`;
      continue;
    }
    const tot = dayTotals(ds);
    const kOk = tot.kcal >= kT * 0.9, pOk = tot.protein >= pT;
    const col = kOk && pOk ? "green" : (kOk || pOk) ? "yellow" : "red";
    rows += `<div class="mh-row">
      <span class="mh-date">${fmtShort(ds)}</span>
      <span class="mh-val">🔥 <b class="mh-c${col}">${tot.kcal}</b></span>
      <span class="mh-val">💪 <b class="mh-c${col}">${tot.protein} g</b></span>
    </div>`;
  }
  $("modal-body").innerHTML = rows || `<div class="empty-mini">Nessun giorno tracciato in questa settimana.</div>`;
  $("modal").classList.add("show");
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
