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
  const age = p.age || computeAge(p.birthday);
  const nick = p.nick || p.name || "?";
  // identità su una riga: "39 anni • 179 cm"
  const meta = [
    age != null ? age + " anni" : null,
    p.height ? p.height + " cm" : null
  ].filter(Boolean).join(" • ");
  const avHTML = avatarHTML(p, nick);
  const loggedIn = window.__cloud && window.__cloud.user && window.__cloud.user();
  // capsule metriche in riga: obiettivo, sessioni, streak
  const target = state.goals && state.goals.targetWeight;
  const info = [
    target ? `🎯 <b>${target}</b> kg` : null,
    state.sessions.length ? `🏋️ <b>${state.sessions.length}</b> sess.` : null,
    weekStreak() ? `🔥 <b>${weekStreak()}</b> sett.` : null
  ].filter(Boolean);
  card.className = "goal-card profile-box";
  card.innerHTML = `
    ${loggedIn && !window.DEMO_MODE ? `<button class="profile-exit" onclick="cloudSignOut()" aria-label="Esci dall'account">⏻</button>` : ""}
    <div class="profile-row">
      <div class="profile-avatar-wrap" onclick="startOnboarding(true)">
        ${avHTML}
        <span class="profile-pencil">✏️</span>
      </div>
      <div class="profile-main">
        <div class="profile-tap" onclick="startOnboarding(true)">
          <div class="profile-name">${nick}</div>
          ${meta ? `<div class="profile-meta">${meta}</div>` : ""}
        </div>
        ${info.length ? `<div class="profile-pills">${info.map(i => `<span class="pi-pill">${i}</span>`).join("")}</div>` : ""}
      </div>
    </div>
    ${p.limitations ? `<div class="profile-lim">⚠️ ${p.limitations}</div>` : ""}`;
}

// Avatar del profilo: foto, emoji o iniziale del nick
function avatarHTML(p, nick) {
  const av = p.avatar;
  if (av && av.type === "img") return `<img class="profile-avatar-lg av-img" src="${av.v}" alt="">`;
  if (av && av.v) return `<div class="profile-avatar-lg av-emoji">${av.v}</div>`;
  return `<div class="profile-avatar-lg">${(nick || "?").charAt(0).toUpperCase()}</div>`;
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
