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
          <img class="ex-gif" src="assets/gifs/${ex.key}.gif" loading="lazy" alt="${ex.name}" onerror="gifFallback(this,'${nameSlug(ex.name)}')">
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
          <div class="tip-text">${tipFor(ex)}</div>
        </div>
        ${stepsFor(ex.key) ? `
        <details class="steps">
          <summary>📋 Come si esegue</summary>
          <ol class="steps-list">${stepsFor(ex.key).map(st => `<li>${st}</li>`).join("")}</ol>
        </details>` : ''}
        ${ex.time ? `<button class="plank-done" onclick="togglePlankDone(${i})">✓ Segna come fatto</button>` : ''}
      </div>`;
    cont.appendChild(card);
  });

  // gestione scheda: modifica/elimina in fondo (solo per le schede personali)
  if ((state.myWorkouts || []).some(x => x.id === w.id)) {
    const mg = document.createElement("div");
    mg.className = "wk-manage";
    mg.innerHTML = `
      <button class="btn-outline" onclick="editWorkout('${w.id}')">✏️ Modifica scheda</button>
      <button class="btn-outline wk-del" onclick="deleteMyWorkout('${w.id}')">🗑 Elimina</button>`;
    cont.appendChild(mg);
  }

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

  $("guided-resume").innerHTML = "";        // il guidato non riguarda la tab PT
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
