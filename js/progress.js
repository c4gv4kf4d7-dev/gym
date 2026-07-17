/* ============================================================
   VISTA PROGRESSI
   ============================================================ */
function renderProgress() {
  if (window.renderCrewCard) window.renderCrewCard();
  const s = state.sessions;
  // stat cards
  // settimana corrente (lun→dom), sedute PT comprese — come nella sfida crew
  const wk0 = weekStart(todayStr());
  const thisWeek = s.filter(x => weekStart(x.date) === wk0).length +
                   (state.ptLifts || []).filter(l => weekStart(l.date) === wk0).length;
  let prCount = 0;
  const allKeys = new Set(); s.forEach(x => Object.keys(x.exercises || {}).forEach(k => allKeys.add(k)));
  allKeys.forEach(k => { if (bestPR(k) > 0) prCount++; });

  $("stat-sessions").textContent = s.length;
  $("stat-week").textContent = thisWeek;
  $("stat-pr").textContent = prCount;
  $("stat-streak").textContent = weekStreak();

  // popola select esercizi: quelli delle schede attuali (in ordine di scheda)
  // + tutti quelli con storico. Le chiavi sono stabili: la progressione fatta
  // con la vecchia Full Body prosegue negli stessi esercizi delle nuove schede.
  const sel = $("ex-select");
  const prevSel = sel.value;
  const schedKeys = ALL_WORKOUTS().flatMap(w => w.exercises || []);
  const loggedKeys = [...new Set([...schedKeys, ...allKeys])]
    .filter(k => EXERCISES[k] && !EXERCISES[k].time);
  sel.innerHTML = loggedKeys.length
    ? loggedKeys.map(k => `<option value="${k}">${EXERCISES[k].name}</option>`).join("")
    : `<option value="">Nessun dato ancora</option>`;
  if (prevSel && loggedKeys.includes(prevSel)) sel.value = prevSel;

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
    ${lifts.length ? `<div class="ex-verdict">${ptCoachNote(lifts)}</div>` : ""}
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
  if (weakest.v <= 5) return coachPick([
    `🕳️ ${weakest.lbl} quasi assente (${weakest.v}% del lavoro): nessun gruppo cresce da solo. Rimettilo in scheda.`,
    `🕳️ ${weakest.lbl} al ${weakest.v}%: il radar non perdona. Un esercizio dedicato a settimana e il buco si chiude.`,
    `🕳️ Stai ignorando ${weakest.lbl.toLowerCase()} (${weakest.v}%): i muscoli che non alleni sono quelli che presentano il conto per primi.`
  ], "radhole");
  if (strongest.v - weakest.v <= 15) return coachPick([
    `✅ Copertura equilibrata: nessun gruppo lasciato indietro. Da manuale.`,
    `✅ Radar quasi tondo: distribuzione da programma fatto bene. Continua a ruotare le schede così.`,
    `✅ Tutti i gruppi dentro il range: è la base che ti permette di spingere senza creare squilibri.`
  ], "radok");
  return coachPick([
    `⚖️ Molto ${strongest.lbl.toLowerCase()} (${strongest.v}%), poco ${weakest.lbl.toLowerCase()} (${weakest.v}%): occhio a non diventare asimmetrico.`,
    `⚖️ ${strongest.lbl} domina il mese (${strongest.v}%): sposta un paio di serie su ${weakest.lbl.toLowerCase()} (${weakest.v}%) e il radar si arrotonda.`,
    `⚖️ Divario ${strongest.lbl.toLowerCase()}–${weakest.lbl.toLowerCase()} (${strongest.v}% vs ${weakest.v}%): due settimane di attenzione e rientra.`
  ], "radskew");
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

/* ---------- IL COACH NEI GRAFICI ----------
   Ogni grafico in Progressi ha il suo commento da PT: preciso sui numeri,
   motivante, mai ripetitivo. La variante è scelta in modo deterministico
   (ruota con la settimana), così non cambia a ogni render ma non annoia. */
function coachPick(pool, salt) {
  if (!pool.length) return "";
  let h = 0;
  const seed = weekStart(todayStr()) + salt;
  for (let i = 0; i < seed.length; i++) h = (h * 31 + seed.charCodeAt(i)) >>> 0;
  return pool[h % pool.length];
}

function volumeVerdict(vols) {
  if (vols.length < 3) return coachPick([
    "📊 Ancora poche sessioni per un giudizio: il volume racconta la sua storia dopo 4-5 allenamenti.",
    "📊 Il grafico si sta riempiendo: ogni barra è lavoro messo in banca."
  ], "volfew");
  const trend = linReg(vols);
  const slopePct = trend ? ((trend[trend.length - 1] - trend[0]) / Math.max(1, trend[0])) * 100 : 0;
  const last = vols[vols.length - 1];
  const avg = vols.reduce((a, b) => a + b, 0) / vols.length;
  const lastVsAvg = Math.round((last / avg - 1) * 100);
  if (slopePct > 15) return coachPick([
    `📈 Tendenza in salita netta (+${Math.round(slopePct)}% dal primo allenamento): il sovraccarico progressivo sta funzionando. Non avere fretta di strafare.`,
    `📈 Volume in crescita costante: è così che si costruisce massa, un chilo alla volta. Occhio solo a dormire abbastanza per assorbirlo.`,
    `📈 La linea di tendenza punta in alto: stai sollevando sempre di più. Quando arriva la settimana pesante, ricordati che il deload non è un fallimento.`
  ], "volup");
  if (slopePct < -15) return coachPick([
    `📉 Il volume sta calando: se è scarico programmato va benissimo, se è calo di motivazione parliamone. I numeri non mentono.`,
    `📉 Tendenza in discesa: controlla se stai tagliando serie o saltando esercizi. Meglio una sessione corta ma completa che una lunga a metà.`
  ], "voldown");
  if (lastVsAvg >= 10) return coachPick([
    `💪 Ultima sessione sopra la tua media (+${lastVsAvg}%): giornata di quelle giuste. Replicala, non superarla subito.`,
    `💪 L'ultima barra svetta sulla media: il corpo risponde. Tienilo come nuovo standard, non come eccezione.`
  ], "vollast");
  return coachPick([
    "⚖️ Volume stabile: la costanza è la base, ma dopo 2-3 settimane uguali serve uno stimolo nuovo — un esercizio, una serie, 2,5 kg.",
    "⚖️ Ritmo regolare, nessun crollo: questa è professionalità. Il prossimo salto arriverà dai carichi, non dalle ore in palestra.",
    "⚖️ Il volume tiene: bene. Se le sensazioni sono buone, è il momento di spingere le serie chiave, non di aggiungerne."
  ], "volflat");
}

function ptCoachNote(lifts) {
  if (!lifts.length) return "";
  const gains = PT_MOVES.map(m => {
    const vals = lifts.filter(l => l[m.key] != null).map(l => l[m.key]);
    return vals.length >= 2 ? { lbl: m.lbl, gain: +(vals[vals.length - 1] - vals[0]).toFixed(1), n: vals.length } : null;
  }).filter(Boolean);
  if (!gains.length) return coachPick([
    "🧑‍🏫 Registra i kg a ogni seduta: dopo 2-3 giri della rotazione, qui vedrai la tua forza crescere nero su bianco.",
    "🧑‍🏫 I tre grandi sollevamenti sono il termometro della forza: ogni seduta registrata è un punto sulla mappa."
  ], "ptfew");
  const best = gains.reduce((m, g) => g.gain > m.gain ? g : m, gains[0]);
  if (best.gain > 0) return coachPick([
    `🧑‍🏫 ${best.lbl}: +${best.gain} kg da quando registri. La forza sui fondamentali si porta dietro tutto il resto — continua a fidarti della progressione.`,
    `🧑‍🏫 Il tuo ${best.lbl.toLowerCase()} è cresciuto di ${best.gain} kg: sui fondamentali non esistono scorciatoie, solo sedute ben fatte. E si vede.`,
    `🧑‍🏫 +${best.gain} kg di ${best.lbl.toLowerCase()}: la scala di forza qui sotto non sale per caso. Prossimo obiettivo: il gradino che ti manca.`
  ], "ptgain");
  return coachPick([
    "🧑‍🏫 Carichi fermi sulle alzate: normale dopo i primi progressi rapidi. Cura tecnica e recupero, il prossimo salto arriva.",
    "🧑‍🏫 Plateau sui fondamentali: capita a tutti. Un piccolo passo indietro con più qualità spesso sblocca il passo avanti."
  ], "ptflat");
}

function renderVolumeChart() {
  const s = [...state.sessions].sort((a, b) => a.date.localeCompare(b.date));
  const ctx = $("vol-chart").getContext("2d");
  if (charts.vol) charts.vol.destroy();
  const vv = $("vol-verdict");
  if (!s.length) { if (vv) vv.textContent = ""; return; }
  const vols = s.map(sessionVolume);
  if (vv) vv.innerHTML = volumeVerdict(vols);

  // Una serie (colore + tendenza) PER SCHEDA: i volumi di schede diverse
  // non sono confrontabili tra loro, ognuna segue il suo trend.
  // (Le sedute PT non sono sessioni: restano fuori dal grafico.)
  const wids = [...new Set(s.map(x => x.workoutId))];
  const datasets = [];
  wids.forEach((wid, wi) => {
    const w = getWorkout(wid);
    const color = (w && w.color) || ["#FF2D95", "#5B8DEF", "#F59E0B", "#A855F7", "#10B981"][wi % 5];
    const name = (w && w.name) || "Scheda";
    const mine = s.map((x, i) => x.workoutId === wid ? vols[i] : null);
    datasets.push({ type: "bar", label: name, data: mine, backgroundColor: color + "CC", borderRadius: 6, order: 2 });
    // tendenza calcolata SOLO sulle sessioni di questa scheda
    const idxs = s.map((x, i) => x.workoutId === wid ? i : -1).filter(i => i >= 0);
    if (idxs.length >= 2) {
      const tr = linReg(idxs.map(i => vols[i]));
      const line = s.map(() => null);
      idxs.forEach((si, j) => line[si] = tr[j]);
      datasets.push({ type: "line", label: name + " (trend)", data: line, borderColor: color, borderWidth: 2, pointRadius: 0, spanGaps: true, fill: false, tension: 0, order: 1 });
    }
  });

  charts.vol = new Chart(ctx, {
    type: "bar",
    data: { labels: s.map(x => fmtShort(x.date)), datasets },
    options: {
      plugins: { legend: { display: wids.length > 1, labels: { boxWidth: 12, font: { size: 10 }, filter: (it) => it.text.indexOf("(trend)") < 0 } } },
      scales: { y: { beginAtZero: true, grid: { color: "rgba(255,255,255,.08)" }, stacked: false }, x: { stacked: true, grid: { display: false } } },
      responsive: true
    }
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

// Seconda riga del coach sotto la progressione: cambia con la settimana
function exCoachExtra(pts, key) {
  if (pts.length < 2) return "";
  const q = pts[pts.length - 1].q || "hard";
  const pools = {
    clean: [
      "Quando le serie escono pulite per due sessioni di fila, l'aumento non è un rischio: è il passo dovuto.",
      "Tecnica a posto e reps complete: il margine c'è. Usalo prima che il corpo si adagi.",
      "Le sessioni verdi sono benzina: cavalca il momento e alza l'asticella di 2,5 kg.",
      "Pulito non vuol dire facile: vuol dire pronto. Il prossimo carico ti aspetta."
    ],
    hard: [
      "Le sessioni gialle sono le più preziose: è lì che il muscolo riceve il messaggio. Ripeti il peso finché non torna verde.",
      "Dura ma completata: è il confine giusto. Consolida qui prima di salire.",
      "Quando è dura, cura i dettagli: respirazione, traiettoria, recuperi pieni. Il verde arriva da lì.",
      "Tenere il peso nelle giornate dure vale quanto salire in quelle buone."
    ],
    fail: [
      "Una rossa non è un fallimento: è un'informazione. Stesso peso la prossima volta, con recuperi più lunghi.",
      "Serie incomplete: controlla sonno e pasti degli ultimi due giorni — spesso il problema non è in palestra.",
      "Dopo una rossa, la mossa da professionista è ripetere il carico, non fuggire in avanti né mollare indietro.",
      "Il rosso di oggi prepara il verde di settimana prossima: torna sullo stesso peso e chiudilo."
    ]
  };
  return "<br><span class='coach-extra'>🧑‍🏫 " + coachPick(pools[q] || pools.hard, "ex" + q + key) + "</span>";
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
      const vol = sets.reduce((a, x) => a + (x.w || 0) * (x.r || 0), 0);
      const repsTot = sets.reduce((a, x) => a + (x.r || 0), 0);
      return { d: fmtShort(s.date), v: vol > 0 ? vol : repsTot, maxW, sets: sets.length, reps: topSet ? topSet.r : null, q: s.exercises[k].quality };
    });
  if (!pts.length) { if (lbl) lbl.textContent = "—"; if (verd) verd.textContent = ""; return; }
  const vals = pts.map(p => p.v);
  const maxV = Math.max(...vals), minV = Math.min(...vals);
  const maxIdx = vals.lastIndexOf(maxV);
  const isBW = isBodyweight(EXERCISES[k]);
  if (lbl) lbl.textContent = isBW ? `max ${maxV} rip. totali` : `max ${Math.max(...pts.map(p => p.maxW))} kg`;
  if (verd) verd.innerHTML = exVerdict(pts) + exCoachExtra(pts, k);
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
